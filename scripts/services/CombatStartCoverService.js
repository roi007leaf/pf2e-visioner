import { MODULE_ID } from '../constants.js';
import autoCoverSystem from '../cover/auto-cover/AutoCoverSystem.js';

const COMPUTE_COVER_SETTING = 'computeCoverAtCombatStart';
const OBSERVER_COVER_CONCURRENCY = 4;

function collectionToArray(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (Array.isArray(collection.contents)) return collection.contents;
  try {
    return Array.from(collection);
  } catch {
    return [];
  }
}

function getTokenIdFromCombatant(combatant) {
  return combatant?.tokenId ?? combatant?.token?.id ?? combatant?.token?.object?.id ?? null;
}

function getTokenFromCombatant(combatant) {
  const tokenObject = combatant?.token?.object;
  if (tokenObject?.document) return tokenObject;

  const tokenId = getTokenIdFromCombatant(combatant);
  if (!tokenId) return null;

  return canvas?.tokens?.get?.(tokenId) ?? null;
}

function areEnemies(tokenA, tokenB) {
  const allianceA = tokenA?.actor?.alliance;
  const allianceB = tokenB?.actor?.alliance;
  if (allianceA && allianceB) return allianceA !== allianceB;

  const dispositionA = tokenA?.document?.disposition;
  const dispositionB = tokenB?.document?.disposition;
  if (typeof dispositionA === 'number' && typeof dispositionB === 'number') {
    if (dispositionA === 0 || dispositionB === 0) return false;
    return dispositionA !== dispositionB;
  }

  const typeA = tokenA?.actor?.type;
  const typeB = tokenB?.actor?.type;
  if (typeA && typeB) return typeA !== typeB;

  return false;
}

export class CombatStartCoverService {
  _activeCoverRuns = new Set();

  invalidateTokenCover(tokenId) {
    if (!tokenId) return;
    for (const movedTokenIds of this._activeCoverRuns) movedTokenIds.add(tokenId);
  }

  async cleanupCombatCover(combat) {
    if (!game.user?.isGM || !combat) return;
    const pairs = new Map();
    for (const combatant of collectionToArray(combat.combatants ?? combat.turns)) {
      const tokenId = getTokenIdFromCombatant(combatant);
      if (!tokenId) continue;
      this.invalidateTokenCover(tokenId);
      for (const pair of autoCoverSystem.getActivePairsInvolving(tokenId)) {
        pairs.set(`${pair.attackerId}->${pair.targetId}`, pair);
      }
    }
    for (const { attackerId, targetId } of pairs.values()) {
      const attacker = canvas?.tokens?.get?.(attackerId);
      const target = canvas?.tokens?.get?.(targetId);
      if (attacker && target) await autoCoverSystem.cleanupCover(attacker, target);
    }
  }

  isEnabled() {
    try {
      return !!game.settings.get(MODULE_ID, COMPUTE_COVER_SETTING);
    } catch {
      return false;
    }
  }

  async applyCombatStartAutoCover(combat = game.combat) {
    if (!game.user?.isGM) return;
    if (!this.isEnabled()) return;
    if (!combat) return;

    const combatants = collectionToArray(combat.combatants ?? combat.turns);
    const participants = combatants
      .map((combatant) => ({ combatant, token: getTokenFromCombatant(combatant) }))
      .filter(({ token }) => token?.document?.id);
    const movedTokenIds = new Set();
    this._activeCoverRuns.add(movedTokenIds);
    let nextObserverIndex = 0;
    const processObserver = async ({ combatant: observerCombatant, token: observerToken }) => {
      // Cover flags are stored on the observer. Keep one observer's writes serial so each update
      // sees the preceding map, while allowing independent observer documents to progress together.
      for (const { combatant: targetCombatant, token: targetToken } of participants) {
        if (targetCombatant === observerCombatant) continue;
        if (targetToken.document.id === observerToken.document.id) continue;
        if (!areEnemies(observerToken, targetToken)) continue;
        if (movedTokenIds.has(observerToken.id) || movedTokenIds.has(targetToken.id)) continue;

        const coverState = this._detectCover(observerToken, targetToken);
        await autoCoverSystem.setCoverBetween(observerToken, targetToken, coverState, {
          skipEphemeralUpdate: false,
        });
        if (movedTokenIds.has(observerToken.id) || movedTokenIds.has(targetToken.id)) {
          await autoCoverSystem.cleanupCover(observerToken, targetToken);
          continue;
        }
        if (coverState !== 'none') {
          autoCoverSystem.recordPair(observerToken.id, targetToken.id);
        }
      }
    };
    const workerCount = Math.min(OBSERVER_COVER_CONCURRENCY, participants.length);
    try {
      await Promise.all(
        Array.from({ length: workerCount }, async () => {
          while (nextObserverIndex < participants.length) {
            const participant = participants[nextObserverIndex++];
            await processObserver(participant);
          }
        }),
      );
    } finally {
      this._activeCoverRuns.delete(movedTokenIds);
    }
  }

  _detectCover(observerToken, targetToken) {
    try {
      return autoCoverSystem.detectCoverBetweenTokens(observerToken, targetToken) || 'none';
    } catch {
      return 'none';
    }
  }
}

export const combatStartCoverService = new CombatStartCoverService();

export default combatStartCoverService;
