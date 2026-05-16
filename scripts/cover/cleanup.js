/**
 * Cleanup utilities for cover ephemeral effects
 */

import { MODULE_ID } from '../constants.js';
import {
  extractCoverAgainstFromPredicate,
  extractSignaturesFromPredicate,
} from '../helpers/cover-helpers.js';
import { updateReflexStealthAcrossCoverAggregates } from './aggregates.js';

function getTokenDocumentId(token) {
  return token?.document?.id || token?.id || null;
}

function getSceneTokensForActor(actor) {
  if (!actor?.id) return [];
  return (canvas?.tokens?.placeables || []).filter((token) => token?.actor?.id === actor.id);
}

function findSceneToken(tokenId) {
  if (!tokenId) return null;
  return (
    canvas?.tokens?.get?.(tokenId) ||
    (canvas?.tokens?.placeables || []).find(
      (token) => token?.id === tokenId || token?.document?.id === tokenId,
    ) ||
    null
  );
}

function getFlagMap(token, flagKey) {
  try {
    const value = token?.document?.getFlag?.(MODULE_ID, flagKey);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return { ...value };
  } catch {
    return {};
  }
}

function removeMatchingTargetEntries(map, targetIds, expectedState) {
  let changed = false;
  for (const targetId of targetIds) {
    if (!Object.prototype.hasOwnProperty.call(map, targetId)) continue;
    if (expectedState && map[targetId] !== expectedState) continue;
    delete map[targetId];
    changed = true;
  }
  return changed;
}

async function persistManualCoverMap(token, coverMap) {
  const update = { [`flags.${MODULE_ID}.cover`]: coverMap };
  if (typeof token?.document?.update === 'function') {
    await token.document.update(update, { diff: false, render: false, animate: false });
    return;
  }
  await token?.document?.setFlag?.(MODULE_ID, 'cover', coverMap);
}

async function persistAutoCoverMap(token, coverMap) {
  if (Object.keys(coverMap).length === 0 && typeof token?.document?.unsetFlag === 'function') {
    await token.document.unsetFlag(MODULE_ID, 'autoCoverMap');
    return;
  }
  if (typeof token?.document?.setFlag === 'function') {
    await token.document.setFlag(MODULE_ID, 'autoCoverMap', coverMap);
    return;
  }
  await token?.document?.update?.(
    { [`flags.${MODULE_ID}.autoCoverMap`]: coverMap },
    { diff: false, render: false, animate: false },
  );
}

function collectObserverTokenIdsFromEffect(effect) {
  const ids = new Set();
  const signatures = new Set();
  const flags = effect?.flags?.[MODULE_ID] || {};

  for (const id of [flags.observerTokenId, flags.observerToken]) {
    if (id) ids.add(String(id));
  }

  const rules = Array.isArray(effect?.system?.rules) ? effect.system.rules : [];
  for (const rule of rules) {
    if (rule?.key === 'RollOption' && typeof rule.option === 'string') {
      if (rule.option.startsWith('cover-against:')) {
        ids.add(rule.option.slice('cover-against:'.length));
      }
    }
    for (const id of extractCoverAgainstFromPredicate(rule?.predicate)) ids.add(String(id));
    for (const signature of extractSignaturesFromPredicate(rule?.predicate)) {
      signatures.add(String(signature));
    }
  }

  if (signatures.size > 0) {
    for (const token of canvas?.tokens?.placeables || []) {
      const signature = token?.actor?.signature || token?.actor?.id;
      if (signature && signatures.has(String(signature))) ids.add(getTokenDocumentId(token));
    }
  }

  return [...ids].filter(Boolean);
}

/**
 * Synchronize token cover maps after a module-created cover effect is manually deleted.
 * Map writes normally create/remove effects. This handles the reverse direction.
 */
export async function syncCoverMapsForDeletedCoverEffect(effect) {
  const result = {
    changed: false,
    tokenIds: [],
    pairs: [],
  };

  if (!game.user?.isGM) return result;
  if (effect?.type !== 'effect') return result;

  const flags = effect?.flags?.[MODULE_ID] || {};
  const isAggregateCover = flags.aggregateCover === true;
  const isLegacyEphemeralCover = flags.isEphemeralCover === true;
  if (!isAggregateCover && !isLegacyEphemeralCover) return result;

  const targetTokens = getSceneTokensForActor(effect.parent);
  const targetIds = targetTokens.map(getTokenDocumentId).filter(Boolean);
  if (targetIds.length === 0) return result;

  const changedTokenIds = new Set(targetIds);
  const observerIds = collectObserverTokenIdsFromEffect(effect);
  const expectedState = flags.coverState || null;

  for (const observerId of observerIds) {
    const observerToken = findSceneToken(observerId);
    if (!observerToken?.document) continue;

    const mapKey = isLegacyEphemeralCover ? 'autoCoverMap' : 'cover';
    const map = getFlagMap(observerToken, mapKey);
    if (!removeMatchingTargetEntries(map, targetIds, expectedState)) continue;

    if (isLegacyEphemeralCover) {
      await persistAutoCoverMap(observerToken, map);
    } else {
      await persistManualCoverMap(observerToken, map);
    }

    changedTokenIds.add(getTokenDocumentId(observerToken));
    for (const targetId of targetIds) {
      result.pairs.push({ observerId: getTokenDocumentId(observerToken), targetId, mapKey });
    }
    result.changed = true;
  }

  result.tokenIds = [...changedTokenIds].filter(Boolean);
  return result;
}

export async function cleanupAllCoverEffects() {
  // Only GMs can perform cleanup operations
  if (!game.user.isGM) return;

  try {
    const allActors = Array.from(game.actors || []);
    const batchSize = 10;
    for (let i = 0; i < allActors.length; i += batchSize) {
      const actorBatch = allActors.slice(i, i + batchSize);
      for (const actor of actorBatch) {
        if (!actor?.itemTypes?.effect) continue;
        const ephemeralEffects = actor.itemTypes.effect.filter(
          (e) => e.flags?.[MODULE_ID]?.isEphemeralCover,
        );
        if (ephemeralEffects.length > 0) {
          const effectIds = ephemeralEffects.map((e) => e.id);
          const existingIds = effectIds.filter((id) => !!actor.items.get(id));
          if (existingIds.length > 0) {
            try {
              await actor.deleteEmbeddedDocuments('Item', existingIds);
            } catch (error) {
              console.error(`[${MODULE_ID}] Error bulk deleting cover effects:`, error);
              for (const id of existingIds) {
                if (actor.items.get(id)) {
                  try {
                    await actor.deleteEmbeddedDocuments('Item', [id]);
                  } catch (_) {}
                }
              }
            }
          }
        }
      }
    }
  } catch (error) {
    console.error(`[${MODULE_ID}] Error cleaning up ephemeral cover effects:`, error);
  }
}

export async function cleanupCoverEffectsForObserver(targetToken, observerToken) {
  // Only GMs can perform cleanup operations
  if (!game.user.isGM) return;

  try {
    if (!observerToken) return;
    await (async () => {
      if (!targetToken?.actor || !observerToken?.actor) return;
      try {
        const ephemeralEffects = targetToken.actor.itemTypes.effect.filter(
          (e) =>
            e.flags?.[MODULE_ID]?.isEphemeralCover &&
            (e.flags?.[MODULE_ID]?.observerActorSignature === observerToken.actor.signature ||
              e.flags?.[MODULE_ID]?.observerTokenId === observerToken.id),
        );
        const allCoverAggregates = targetToken.actor.itemTypes.effect.filter(
          (e) => e.flags?.[MODULE_ID]?.aggregateCover === true,
        );
        const effectsToDelete = [];
        const effectsToUpdate = [];
        const signature = observerToken.actor.signature;
        const tokenId = observerToken.id;
        if (ephemeralEffects.length > 0) {
          const effectIds = ephemeralEffects
            .map((e) => e.id)
            .filter((id) => !!targetToken.actor.items.get(id));
          effectsToDelete.push(...effectIds);
        }
        for (const aggregate of allCoverAggregates) {
          const rules = Array.isArray(aggregate.system.rules)
            ? aggregate.system.rules.filter((r) => {
                if (
                  r?.key === 'FlatModifier' &&
                  r.selector === 'ac' &&
                  Array.isArray(r.predicate) &&
                  r.predicate.includes(`origin:signature:${signature}`)
                ) {
                  return false;
                }
                if (
                  r?.key === 'RollOption' &&
                  r.domain === 'all' &&
                  r.option === `cover-against:${tokenId}`
                ) {
                  return false;
                }
                return true;
              })
            : [];
          if (rules.length === 0) {
            effectsToDelete.push(aggregate.id);
          } else {
            effectsToUpdate.push({ _id: aggregate.id, 'system.rules': rules });
          }
        }
        if (effectsToDelete.length > 0) {
          await targetToken.actor.deleteEmbeddedDocuments('Item', effectsToDelete);
        }
        if (effectsToUpdate.length > 0) {
          await targetToken.actor.updateEmbeddedDocuments('Item', effectsToUpdate);
        }
        await updateReflexStealthAcrossCoverAggregates(targetToken);
      } catch (error) {
        console.error(`[${MODULE_ID}] Error cleaning up cover effects for observer:`, error);
      }
    })();
  } catch (error) {
    console.error('Error cleaning up ephemeral cover effects for observer:', error);
  }
}

export async function cleanupDeletedTokenCoverEffects(tokenDoc) {
  // Only GMs can perform cleanup operations
  if (!game.user.isGM) return;

  if (!tokenDoc?.id || !tokenDoc?.actor?.id) return;
  try {
    const deletedToken = {
      id: tokenDoc.id,
      actor: {
        id: tokenDoc.actor.id,
        signature: tokenDoc.actor?.signature || tokenDoc.actor.id,
      },
    };
    const allTokens = canvas.tokens?.placeables || [];
    const batchSize = 10;
    for (let i = 0; i < allTokens.length; i += batchSize) {
      const batch = allTokens.slice(i, i + batchSize);
      for (const token of batch) {
        if (!token?.actor) continue;
        let effectsToDelete = [];
        let effectsToUpdate = [];
        const signature = deletedToken.actor.signature;
        const tokenId = deletedToken.id;
        const effects = token.actor.itemTypes.effect || [];
        const observerEffects = effects.filter(
          (e) =>
            e.flags?.[MODULE_ID]?.aggregateCover === true &&
            e.flags?.[MODULE_ID]?.observerToken === tokenId,
        );
        if (observerEffects.length > 0) {
          effectsToDelete.push(...observerEffects.map((e) => e.id));
          continue;
        }
        const relevantEffects = effects.filter(
          (e) => e.flags?.[MODULE_ID]?.aggregateCover === true,
        );
        for (const effect of relevantEffects) {
          const rules = Array.isArray(effect.system?.rules) ? [...effect.system.rules] : [];
          const newRules = rules.filter((r) => {
            const ruleString = JSON.stringify(r);
            if (ruleString.includes(signature) || ruleString.includes(tokenId)) {
              return false;
            }
            return true;
          });
          if (newRules.length !== rules.length) {
            if (newRules.length === 0) {
              effectsToDelete.push(effect.id);
            } else {
              effectsToUpdate.push({ _id: effect.id, 'system.rules': newRules });
            }
          }
        }
        const legacyEffects = effects.filter(
          (e) =>
            e.flags?.[MODULE_ID]?.cover === true &&
            (e.flags?.[MODULE_ID]?.observerToken === tokenId ||
              e.flags?.[MODULE_ID]?.targetToken === tokenId),
        );
        if (legacyEffects.length > 0) {
          effectsToDelete.push(...legacyEffects.map((e) => e.id));
        }
        try {
          if (effectsToDelete.length > 0) {
            await token.actor.deleteEmbeddedDocuments('Item', effectsToDelete);
          }
          if (effectsToUpdate.length > 0) {
            await token.actor.updateEmbeddedDocuments('Item', effectsToUpdate);
          }
          if (effectsToDelete.length > 0 || effectsToUpdate.length > 0) {
            await updateReflexStealthAcrossCoverAggregates(token);
          }
        } catch (error) {
          console.error(`${MODULE_ID}: Error updating cover effects for deleted token:`, error);
        }
      }
    }
  } catch (error) {
    console.error(`${MODULE_ID}: Error cleaning up cover effects for deleted token:`, error);
  }
}
