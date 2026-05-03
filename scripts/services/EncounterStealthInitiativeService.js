import { MODULE_ID } from '../constants.js';
import AvsOverrideManager from '../chat/services/infra/AvsOverrideManager.js';

const FEATURE_SETTING = 'enableStealthInitiativeVisibility';
const ENCOUNTER_STEALTH_STATES = new Set(['undetected', 'unnoticed']);
const TRACKER_HIDDEN_STATES = new Set(['unnoticed']);
const RECORD_SEPARATOR = '::';
const OVERRIDE_SOURCE = 'encounter_stealth_initiative';
const TRACKER_HIDDEN_CLASS = 'pf2e-visioner-stealth-tracker-hidden';
const TRACKER_STEALTH_MARKER_SELECTOR = '[data-pf2e-visioner-stealth-initiative-marker="true"]';
const PREVIOUS_OVERRIDE_PREFIX = 'encounter-stealth-previous-from-';

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

function getCombatId(combat) {
  return combat?.id ?? combat?.uuid ?? 'active-combat';
}

function getCombatantInitiativeStatistic(combatant) {
  return combatant?.flags?.pf2e?.initiativeStatistic ?? null;
}

function hasNumericInitiative(combatant) {
  return typeof combatant?.initiative === 'number' && Number.isFinite(combatant.initiative);
}

function getPerceptionDC(token) {
  const override = Number(token?.document?.getFlag?.(MODULE_ID, 'perceptionDC'));
  if (Number.isFinite(override) && override > 0) return override;

  const systemDC = token?.actor?.system?.perception?.dc;
  const systemValue = typeof systemDC === 'number' ? systemDC : systemDC?.value;
  if (Number.isFinite(systemValue)) return systemValue;

  const statisticDC = token?.actor?.getStatistic?.('perception')?.dc;
  const statisticValue = typeof statisticDC === 'number' ? statisticDC : statisticDC?.value;
  if (Number.isFinite(statisticValue)) return statisticValue;

  return null;
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

function makeRecordKey(observerTokenId, stealtherTokenId) {
  return `${observerTokenId}${RECORD_SEPARATOR}${stealtherTokenId}`;
}

function escapeAttributeValue(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
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

export class EncounterStealthInitiativeService {
  constructor() {
    this._initialHideRecordsByCombat = new Map();
    this._expiredInitialHideRecordsByCombat = new Map();
  }

  isEnabled() {
    try {
      return !!game.settings.get(MODULE_ID, FEATURE_SETTING);
    } catch {
      return false;
    }
  }

  isStealthInitiativeCombatant(combatant) {
    return getCombatantInitiativeStatistic(combatant) === 'stealth';
  }

  async applyEncounterStartVisibility(combat = game.combat, { requireStarted = true } = {}) {
    if (!this.isEnabled()) return;
    if (!combat) return;
    if (requireStarted && !combat.started) return;

    await this._applyVisibilityForCombat(combat);
    this.applyTrackerVisibility(combat);
  }

  async handleCombatantInitiativeUpdate(combatant, changes = {}, combat = game.combat) {
    if (!this.isEnabled()) return;
    if (!combat?.started) return;
    if (!this._isInitiativeRelevantUpdate(changes)) return;

    const updatedCombatant = combatant ?? null;
    if (!updatedCombatant || !this.isStealthInitiativeCombatant(updatedCombatant)) {
      this.applyTrackerVisibility(combat);
      return;
    }

    await this._applyVisibilityForCombat(combat);
    this.applyTrackerVisibility(combat);
  }

  async _applyVisibilityForCombat(combat) {
    const combatants = collectionToArray(combat.combatants ?? combat.turns);
    const stealthers = combatants.filter((combatant) => this.isStealthInitiativeCombatant(combatant));
    if (stealthers.length === 0) return;

    const combatId = getCombatId(combat);
    if (!this._initialHideRecordsByCombat.has(combatId)) {
      this._initialHideRecordsByCombat.set(combatId, new Set());
    }
    if (!this._expiredInitialHideRecordsByCombat.has(combatId)) {
      this._expiredInitialHideRecordsByCombat.set(combatId, new Set());
    }
    const records = this._initialHideRecordsByCombat.get(combatId);

    for (const stealther of stealthers) {
      if (!hasNumericInitiative(stealther)) continue;
      const stealtherToken = getTokenFromCombatant(stealther);
      if (!stealtherToken?.document?.id) continue;

      for (const observer of combatants) {
        if (observer === stealther) continue;
        const observerToken = getTokenFromCombatant(observer);
        if (!observerToken?.document?.id) continue;
        if (observerToken.document.id === stealtherToken.document.id) continue;
        if (!areEnemies(observerToken, stealtherToken)) continue;

        const recordKey = makeRecordKey(observerToken.document.id, stealtherToken.document.id);
        if (records.has(recordKey)) continue;
        const state = this._stealthInitiativeMeetsPerceptionDC(stealther, observerToken)
          ? 'unnoticed'
          : 'undetected';

        if (game.user?.isGM) {
          await this._savePreviousOverride(observerToken, stealtherToken);
          await AvsOverrideManager.setPairOverrides(
            observerToken,
            new Map([
              [
                stealtherToken.document.id,
                {
                  target: stealtherToken,
                  state,
                  hasCover: false,
                  hasConcealment: false,
                },
              ],
            ]),
            {
              source: OVERRIDE_SOURCE,
            },
          );
          try {
            Hooks.callAll?.('pf2e-visioner.visibilityMapUpdated', {
              observerId: observerToken.document.id,
              targetId: stealtherToken.document.id,
              state,
              direction: 'observer_to_target',
              source: OVERRIDE_SOURCE,
            });
          } catch {
            /* ignore hook notification errors */
          }
          records.add(recordKey);
        }
      }
    }
  }

  _isInitiativeRelevantUpdate(changes = {}) {
    if (Object.prototype.hasOwnProperty.call(changes, 'initiative')) return true;
    if (changes?.flags?.pf2e && Object.prototype.hasOwnProperty.call(changes.flags.pf2e, 'initiativeStatistic')) {
      return true;
    }
    if (foundry?.utils?.hasProperty?.(changes, 'flags.pf2e.initiativeStatistic')) return true;
    return false;
  }

  clearCombat(combat = game.combat) {
    const combatId = getCombatId(combat);
    this._initialHideRecordsByCombat.delete(combatId);
    this._expiredInitialHideRecordsByCombat.delete(combatId);
    this.applyTrackerVisibility(combat);
  }

  applyTrackerVisibility(combat = game.combat) {
    const combatants = collectionToArray(combat?.combatants ?? combat?.turns);
    const seenIds = new Set();

    for (const combatant of combatants) {
      const combatantId = combatant?.id;
      if (!combatantId) continue;
      seenIds.add(combatantId);
      this._setStealthInitiativeMarker(
        combatantId,
        this.isEnabled() && this.isStealthInitiativeCombatant(combatant) && hasNumericInitiative(combatant),
      );
      this._setCombatantRowsHidden(
        combatantId,
        this.shouldHideCombatantFromCurrentUser(combatant, combat),
      );
      this._restoreExpiredInitialOverridesForCombatant(combatant, combat);
    }

    if (!this.isEnabled() || game.user?.isGM) {
      this._showRowsHiddenByVisioner();
      this._removeStaleStealthInitiativeMarkers(seenIds);
      return;
    }

    this._showStaleRows(seenIds);
    this._removeStaleStealthInitiativeMarkers(seenIds);
  }

  scheduleTrackerVisibilityRefresh(combat = game.combat) {
    this.applyTrackerVisibility(combat);
    for (const delay of [50, 150, 300]) {
      setTimeout(() => this.applyTrackerVisibility(combat), delay);
    }
  }

  shouldHideCombatantFromCurrentUser(combatant, combat = game.combat) {
    if (!this.isEnabled()) return false;
    if (game.user?.isGM) return false;
    if (!this.isStealthInitiativeCombatant(combatant)) return false;
    if (!hasNumericInitiative(combatant)) return false;

    const stealtherToken = getTokenFromCombatant(combatant);
    if (!stealtherToken?.document?.id) return false;

    const combatants = collectionToArray(combat?.combatants ?? combat?.turns);
    const ownedObservers = this._getOwnedObserverTokens(combatants, stealtherToken);
    if (ownedObservers.length === 0) return false;

    for (const { token: observerToken, combatant: observerCombatant } of ownedObservers) {
      if (!this._stealthInitiativeMeetsPerceptionDC(combatant, observerToken)) {
        return false;
      }

      const recordKey = makeRecordKey(observerToken.document.id, stealtherToken.document.id);
      if (!this._hasInitialHideRecord(combat, recordKey) && !this._seedInitialHideRecordFromOverride(
        combat,
        recordKey,
        observerToken,
        stealtherToken,
      )) {
        return false;
      }

      if (!this._hasActiveInitialTrackerHiddenOverride(observerToken, stealtherToken)) {
        this._deleteInitialHideRecord(combat, recordKey);
        return false;
      }
    }

    return true;
  }

  _getOwnedObserverTokens(combatants, stealtherToken) {
    const owned = [];

    for (const combatant of combatants) {
      const token = getTokenFromCombatant(combatant);
      if (!token?.document?.id || token.document.id === stealtherToken.document.id) continue;
      if (!areEnemies(token, stealtherToken)) continue;

      const tokenIsOwned = !!(token.isOwner || token.actor?.isOwner || combatant.isOwner);
      if (!tokenIsOwned) continue;

      owned.push({ token, combatant });
    }

    return owned;
  }

  _restoreExpiredInitialOverridesForCombatant(combatant, combat) {
    if (!game.user?.isGM) return;
    if (!this.isStealthInitiativeCombatant(combatant)) return;
    if (!hasNumericInitiative(combatant)) return;

    const stealtherToken = getTokenFromCombatant(combatant);
    if (!stealtherToken?.document?.id) return;

    const combatants = collectionToArray(combat?.combatants ?? combat?.turns);
    for (const observerCombatant of combatants) {
      if (observerCombatant === combatant) continue;
      const observerToken = getTokenFromCombatant(observerCombatant);
      if (!observerToken?.document?.id) continue;
      if (observerToken.document.id === stealtherToken.document.id) continue;
      if (!areEnemies(observerToken, stealtherToken)) continue;

      const recordKey = makeRecordKey(observerToken.document.id, stealtherToken.document.id);
      if (!this._hasInitialHideRecord(combat, recordKey)) continue;
      if (this._hasAnyInitialOverrideFlag(observerToken, stealtherToken)) continue;

      this._deleteInitialHideRecord(combat, recordKey);
      this._restorePreviousOverride(observerToken, stealtherToken);
    }
  }

  _getInitialOverride(observerToken, stealtherToken) {
    const flagKey = `avs-override-from-${observerToken.document.id}`;
    return stealtherToken.document?.getFlag?.(MODULE_ID, flagKey);
  }

  _stealthInitiativeMeetsPerceptionDC(stealthCombatant, observerToken) {
    if (!hasNumericInitiative(stealthCombatant)) return false;
    const perceptionDC = getPerceptionDC(observerToken);
    if (!Number.isFinite(perceptionDC)) return false;
    return stealthCombatant.initiative >= perceptionDC;
  }

  _getPreviousOverrideFlagKey(observerToken) {
    return `${PREVIOUS_OVERRIDE_PREFIX}${observerToken.document.id}`;
  }

  async _savePreviousOverride(observerToken, stealtherToken) {
    const previousOverride = this._getInitialOverride(observerToken, stealtherToken);
    if (!previousOverride || previousOverride.source === OVERRIDE_SOURCE) return;

    const flagKey = this._getPreviousOverrideFlagKey(observerToken);
    await stealtherToken.document?.setFlag?.(MODULE_ID, flagKey, {
      ...previousOverride,
      observerId: previousOverride.observerId ?? observerToken.document.id,
      targetId: previousOverride.targetId ?? stealtherToken.document.id,
    });
  }

  _hasAnyInitialOverrideFlag(observerToken, stealtherToken) {
    const flagKey = `avs-override-from-${observerToken.document.id}`;
    return !!stealtherToken.document?.getFlag?.(MODULE_ID, flagKey);
  }

  _restorePreviousOverride(observerToken, stealtherToken) {
    if (!game.user?.isGM) return;

    const flagKey = this._getPreviousOverrideFlagKey(observerToken);
    const previousOverride = stealtherToken.document?.getFlag?.(MODULE_ID, flagKey);
    if (!previousOverride?.state) return;

    stealtherToken.document?.unsetFlag?.(MODULE_ID, flagKey);
    AvsOverrideManager.setPairOverrides(
      observerToken,
      new Map([
        [
          stealtherToken.document.id,
          {
            target: stealtherToken,
            state: previousOverride.state,
            hasCover: previousOverride.hasCover,
            hasConcealment: previousOverride.hasConcealment,
            expectedCover: previousOverride.expectedCover,
            timedOverride: previousOverride.timedOverride,
          },
        ],
      ]),
      {
        source: previousOverride.source || 'manual_action',
      },
    );
  }

  _isActiveInitialOverride(override, observerToken, stealtherToken) {
    return (
      override?.source === OVERRIDE_SOURCE &&
      ENCOUNTER_STEALTH_STATES.has(override?.state) &&
      override?.observerId === observerToken.document.id &&
      override?.targetId === stealtherToken.document.id
    );
  }

  _hasActiveInitialTrackerHiddenOverride(observerToken, stealtherToken) {
    const override = this._getInitialOverride(observerToken, stealtherToken);
    return (
      this._isActiveInitialOverride(override, observerToken, stealtherToken) &&
      TRACKER_HIDDEN_STATES.has(override?.state)
    );
  }

  _hasInitialHideRecord(combat, recordKey) {
    return this._initialHideRecordsByCombat.get(getCombatId(combat))?.has(recordKey) ?? false;
  }

  _deleteInitialHideRecord(combat, recordKey) {
    const combatId = getCombatId(combat);
    this._initialHideRecordsByCombat.get(combatId)?.delete(recordKey);
    if (!this._expiredInitialHideRecordsByCombat.has(combatId)) {
      this._expiredInitialHideRecordsByCombat.set(combatId, new Set());
    }
    this._expiredInitialHideRecordsByCombat.get(combatId).add(recordKey);
  }

  _seedInitialHideRecordFromOverride(combat, recordKey, observerToken, stealtherToken) {
    const combatId = getCombatId(combat);
    if (this._expiredInitialHideRecordsByCombat.get(combatId)?.has(recordKey)) {
      return false;
    }

    const override = this._getInitialOverride(observerToken, stealtherToken);
    if (!this._isActiveInitialOverride(override, observerToken, stealtherToken)) {
      return false;
    }

    if (!this._initialHideRecordsByCombat.has(combatId)) {
      this._initialHideRecordsByCombat.set(combatId, new Set());
    }
    this._initialHideRecordsByCombat.get(combatId).add(recordKey);
    return true;
  }

  _setCombatantRowsHidden(combatantId, hidden) {
    const rows = this._getCombatantRows(combatantId);

    for (const row of rows) {
      if (hidden) {
        row.hidden = true;
        row.classList.add(TRACKER_HIDDEN_CLASS);
        row.dataset.pf2eVisionerStealthHidden = 'true';
      } else if (row.dataset.pf2eVisionerStealthHidden === 'true') {
        row.hidden = false;
        row.classList.remove(TRACKER_HIDDEN_CLASS);
        delete row.dataset.pf2eVisionerStealthHidden;
      }
    }
  }

  _setStealthInitiativeMarker(combatantId, show) {
    const rows = this._getCombatantRows(combatantId);

    for (const row of rows) {
      this._removeStealthInitiativeMarkersFromRow(row);
      if (!show) continue;

      const marker = document.createElement('span');
      marker.className = 'pf2e-visioner-stealth-initiative-marker';
      marker.dataset.pf2eVisionerStealthInitiativeMarker = 'true';
      marker.dataset.combatantId = combatantId;
      const tooltip = game.i18n?.localize?.('PF2E_VISIONER.ENCOUNTER_STEALTH.STEALTH_INITIATIVE_TOOLTIP')
        || 'Rolled Stealth for initiative';
      marker.dataset.tooltip = tooltip;
      marker.setAttribute('aria-label', tooltip);
      marker.innerHTML = '<i class="fas fa-user-secret"></i>';

      this._getTrackerMarkerAnchor(row)?.appendChild(marker);
    }
  }

  _getCombatantRows(combatantId) {
    const selector = `[data-combatant-id="${escapeAttributeValue(combatantId)}"]`;
    const candidates = Array.from(document?.querySelectorAll?.(selector) ?? []);

    return candidates.filter((element) => {
      const parentMatch = element.parentElement?.closest?.(selector);
      return !parentMatch;
    });
  }

  _getTrackerMarkerAnchor(row) {
    const selectors = [
      '.token-name h4',
      '.combatant-name',
      '.token-name',
      '.actor-name',
      '.name h4',
      '.name h3',
      '.name',
      'h4',
      'h3',
      'strong',
    ];

    for (const selector of selectors) {
      const anchor = row.querySelector?.(selector);
      if (anchor) return anchor;
    }

    return row;
  }

  _removeStealthInitiativeMarkersFromRow(row) {
    const markers = row.querySelectorAll?.(TRACKER_STEALTH_MARKER_SELECTOR) ?? [];
    for (const marker of markers) {
      marker.remove();
    }
  }

  _removeStaleStealthInitiativeMarkers(currentCombatantIds) {
    const markers = document?.querySelectorAll?.(TRACKER_STEALTH_MARKER_SELECTOR) ?? [];
    for (const marker of markers) {
      const combatantId = marker.dataset.combatantId;
      if (currentCombatantIds.has(combatantId)) continue;
      marker.remove();
    }
  }

  _showRowsHiddenByVisioner() {
    const rows = document?.querySelectorAll?.('[data-pf2e-visioner-stealth-hidden="true"]') ?? [];
    for (const row of rows) {
      row.hidden = false;
      row.classList.remove(TRACKER_HIDDEN_CLASS);
      delete row.dataset.pf2eVisionerStealthHidden;
    }
  }

  _showStaleRows(currentCombatantIds) {
    const rows = document?.querySelectorAll?.('[data-pf2e-visioner-stealth-hidden="true"]') ?? [];
    for (const row of rows) {
      const combatantId = row.dataset.combatantId;
      if (currentCombatantIds.has(combatantId)) continue;
      row.hidden = false;
      row.classList.remove(TRACKER_HIDDEN_CLASS);
      delete row.dataset.pf2eVisionerStealthHidden;
    }
  }
}

export const encounterStealthInitiativeService = new EncounterStealthInitiativeService();

export default encounterStealthInitiativeService;
