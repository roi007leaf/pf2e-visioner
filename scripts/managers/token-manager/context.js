/**
 * Context builder for VisionerTokenManager template
 */

import { extractPerceptionDC, extractStealthDC } from '../../chat/services/infra/shared-utils.js';
import {
  COVER_STATES,
  MODULE_ID,
  VISIBILITY_STATES,
  getVisibilityStateLabelKey,
} from '../../constants.js';
import {
  getCoverMap,
  getLastRollTotalForActor,
  getSceneTargets,
  getVisibilityBetween,
  getVisibilityMap,
  hasActiveEncounter,
} from '../../utils.js';
import { TimedOverrideManager } from '../../services/TimedOverrideManager.js';
import { overrideToDisplayVisibility } from '../../visibility/perception-profile.js';

function buildVisibilityStateContext(key, { selected = false, manual = true } = {}) {
  const config = VISIBILITY_STATES[key];
  return {
    value: key,
    label: game.i18n.localize(getVisibilityStateLabelKey(key, { manual })),
    selected,
    icon: config.icon,
    color: config.color,
    cssClass: config.cssClass,
  };
}

function getOverrideDisplayState(overrideFlag) {
  return overrideToDisplayVisibility(overrideFlag) || 'observed';
}

function getEffectiveVisibilityState(observerToken, targetToken, fallback = 'observed') {
  try {
    return getVisibilityBetween(observerToken, targetToken) || fallback || 'observed';
  } catch {
    return fallback || 'observed';
  }
}

function getTokenImage(token) {
  if (token.actor?.img) return token.actor.img;
  return 'icons/svg/book.svg';
}

const MANUAL_VISIBILITY_STATE_EXCLUSIONS = new Set(['unnoticed']);

function isVisibilityOverrideFlag(flagData) {
  if (!flagData) return false;
  if (flagData.coverOnly === true) return false;
  const displayState = overrideToDisplayVisibility(flagData);
  if (!displayState || displayState === 'avs') return false;
  return true;
}

function getManualVisibilityStateKeys({ isNonAvsToken = false, avsEnabled = false } = {}) {
  const keys = isNonAvsToken ? ['observed', 'hidden'] : Object.keys(VISIBILITY_STATES);
  return keys.filter((key) => {
    if (VISIBILITY_STATES[key]?.manual === false) return false;
    if (MANUAL_VISIBILITY_STATE_EXCLUSIONS.has(key)) return false;
    if (key === 'avs' && !avsEnabled) return false;
    return true;
  });
}

function svgDataUri(svg) {
  try {
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  } catch {
    return '';
  }
}

function getTimerBadgeData(observerId, targetId) {
  try {
    const timerData = TimedOverrideManager.getTimerData(observerId, targetId);
    if (!timerData) {
      return { hasActiveTimer: false, timerDisplay: '', timerTooltip: '' };
    }

    const display = TimedOverrideManager.getRemainingTimeDisplay(timerData);
    const tooltip = game.i18n.localize('PF2E_VISIONER.TIMED_OVERRIDE.ACTIVE_TIMER');

    return {
      hasActiveTimer: true,
      timerDisplay: display,
      timerTooltip: tooltip,
      timerType: timerData.type,
    };
  } catch {
    return { hasActiveTimer: false, timerDisplay: '', timerTooltip: '' };
  }
}

function getWallImage(doorType = 0) {
  // doorType: 0 wall, 1 standard door, 2 secret door (Foundry uses 1/2 for door types)
  if (Number(doorType) === 1) {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 28 28'>
      <rect x='6' y='4' width='16' height='20' rx='2' ry='2' fill='#1e1e1e' stroke='#cccccc' stroke-width='2'/>
      <circle cx='19' cy='14' r='1.5' fill='#e6e6e6'/>
    </svg>`;
    return svgDataUri(svg);
  }
  if (Number(doorType) === 2) {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 28 28'>
      <rect x='6' y='4' width='16' height='20' rx='2' ry='2' fill='#1e1e1e' stroke='#d4af37' stroke-width='2'/>
      <circle cx='19' cy='14' r='1.5' fill='#d4af37'/>
      <path d='M7 7l14 14' stroke='#d4af37' stroke-width='1.5' opacity='0.7'/>
    </svg>`;
    return svgDataUri(svg);
  }
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 28 28'>
    <rect x='4' y='4' width='20' height='20' fill='#1e1e1e' stroke='#cccccc' stroke-width='2'/>
    <path d='M8 6v16M14 6v16M20 6v16' stroke='#888888' stroke-width='2'/>
  </svg>`;
  return svgDataUri(svg);
}

export async function buildContext(app, options) {
  // IMPORTANT: Call the base ApplicationV2 implementation, not our own override,
  // otherwise we recurse forever and nothing renders.
  const BaseApp = foundry?.applications?.api?.ApplicationV2;
  const context = BaseApp ? await BaseApp.prototype._prepareContext.call(app, options) : {};

  if (!app.observer) {
    context.error = game.i18n.localize('PF2E_VISIONER.NOTIFICATIONS.NO_OBSERVER_SELECTED');
    return context;
  }

  try {
    app.visibilityData = getVisibilityMap(app.observer) || {};
    app.coverData = getCoverMap(app.observer) || {};
  } catch {}

  const isLootObserver = app.observer?.actor?.type === 'loot';
  const isHazardObserver = app.observer?.actor?.type === 'hazard';
  if (isLootObserver || isHazardObserver) {
    app.mode = 'target';
    if (app.activeTab === 'cover') app.activeTab = 'visibility';
  }
  context.mode = app.mode;
  context.activeTab = app.activeTab;
  context.isObserverMode = app.mode === 'observer';
  context.isTargetMode = app.mode === 'target';
  context.isVisibilityTab = app.activeTab === 'visibility';
  context.isCoverTab = app.activeTab === 'cover';
  context.lootObserver = !!isLootObserver;
  context.hazardObserver = !!isHazardObserver;
  context.hideCoverTab = context.lootObserver || context.hazardObserver;

  context.showEncounterFilter = hasActiveEncounter();
  context.encounterOnly = app.encounterOnly;
  context.ignoreAllies = !!app.ignoreAllies;
  context.ignoreWalls = !!app.ignoreWalls;
  // Visual filter flag: hide Foundry-hidden tokens (per-user)
  try {
    context.hideFoundryHidden = !!app.hideFoundryHidden;
  } catch (_) {
    context.hideFoundryHidden = false;
  }
  const tokenManagerSettings = {
    integrateRollOutcome: !!game.settings.get(MODULE_ID, 'integrateRollOutcome'),
    autoVisibilityEnabled: !!game.settings.get(MODULE_ID, 'autoVisibilityEnabled'),
    hiddenWallsEnabled: !!game.settings.get(MODULE_ID, 'hiddenWallsEnabled'),
    wallStealthDC: Number(game.settings.get(MODULE_ID, 'wallStealthDC')) || 15,
  };
  const coverStateBase = Object.entries(COVER_STATES).map(([key, config]) => ({
    value: key,
    label: game.i18n.localize(config.label),
    icon: config.icon,
    color: config.color,
    cssClass: config.cssClass,
    bonusAC: config.bonusAC,
    bonusReflex: config.bonusReflex,
    bonusStealth: config.bonusStealth,
    canHide: config.canHide,
  }));
  const buildCoverStateList = (currentCoverState) =>
    coverStateBase.map((state) => ({
      ...state,
      selected: currentCoverState === state.value,
    }));

  const sceneTokens = getSceneTargets(app.observer, app.encounterOnly, app.ignoreAllies);

  // In target mode, filter out hazards (they can't observe other tokens)
  let filteredTokens =
    app.mode === 'target'
      ? sceneTokens.filter((token) => token.actor?.type !== 'hazard')
      : sceneTokens;

  // Filter out defeated/dead tokens from both observer and target modes
  try {
    const { isTokenDefeated } = await import('../../chat/services/infra/shared-utils.js');
    filteredTokens = filteredTokens.filter((token) => {
      // Always keep hazards and loot regardless of HP/defeated status
      if (token?.actor?.type === 'hazard' || token?.actor?.type === 'loot') {
        return true;
      }
      // Filter out defeated tokens (for characters/NPCs only)
      return !isTokenDefeated(token);
    });
  } catch (error) {
    console.warn('PF2E Visioner | Failed to filter defeated tokens:', error);
    // Continue without filtering if import fails
  }

  context.observer = {
    id: app.observer.document.id,
    name: app.observer.document.name,
    img: getTokenImage(app.observer),
  };

  let allTargets;
  if (app.mode === 'observer') {
    allTargets = await Promise.all(
      filteredTokens.map(async (token) => {
        // Get manual visibility state from the map, or null if none exists
        const manualVisibilityState = app.visibilityData[token.document.id] || null;
        // For display purposes, we'll determine the actual current state later
        // Don't default to 'observed' here - we'll handle that in the logic below
        const currentVisibilityState = manualVisibilityState;
        const currentCoverState = app.coverData[token.document.id] || 'none';

        const disposition = token.document.disposition || 0;
        // Foundry hidden means the TokenDocument.hidden property is strictly true
        const isFoundryHidden = token?.document?.hidden === true;

        const perceptionDC = extractPerceptionDC(token);
        const stealthDC = extractStealthDC(token);
        let showOutcome = false;
        let outcomeLabel = '';
        let outcomeClass = '';
        if (tokenManagerSettings.integrateRollOutcome) {
          const lastRoll = getLastRollTotalForActor(app.observer?.actor, null);
          if (typeof lastRoll === 'number' && typeof stealthDC === 'number') {
            const diff = lastRoll - stealthDC;
            if (diff >= 10) {
              outcomeLabel = 'Critical Success';
              outcomeClass = 'critical-success';
            } else if (diff >= 0) {
              outcomeLabel = 'Success';
              outcomeClass = 'success';
            } else if (diff <= -10) {
              outcomeLabel = 'Critical Failure';
              outcomeClass = 'critical-failure';
            } else {
              outcomeLabel = 'Failure';
              outcomeClass = 'failure';
            }
            showOutcome = true;
          }
        }
        const isRowLoot = token.actor?.type === 'loot';
        const isRowHazard = token.actor?.type === 'hazard';
        const isNonAvsToken = isRowLoot || isRowHazard;

        // Check if AVS is enabled to determine if 'avs' button should be available
        const avsEnabled = tokenManagerSettings.autoVisibilityEnabled;

        const allowedVisKeys = getManualVisibilityStateKeys({ isNonAvsToken, avsEnabled });

        const visibilityStates = allowedVisKeys
          .filter((key) => !isNonAvsToken || key !== 'avs') // Extra safety: never include 'avs' for loot/hazard
          .map((key) => {
            // Determine if this state should be selected
            let selected = false;

            // This will be set after we determine the override/AVS logic
            return buildVisibilityStateContext(key, { selected });
          });

        // Determine current state and selection logic
        let hasAvsOverride = false;
        let isAvsControlled = false;
        let actualCurrentState = currentVisibilityState;

        try {
          // Check if AVS is enabled first
          const avsEnabled = tokenManagerSettings.autoVisibilityEnabled;
          if (avsEnabled) {
            // Check for AVS override flag
            const avsOverrideFlag = token.document.getFlag(
              MODULE_ID,
              `avs-override-from-${app.observer.document.id}`,
            );

            if (isVisibilityOverrideFlag(avsOverrideFlag)) {
              // There's an override - use the override state
              hasAvsOverride = true;
              actualCurrentState = getOverrideDisplayState(avsOverrideFlag);
              isAvsControlled = false; // Override is controlling, not AVS
            } else {
              // No override - AVS is controlling (unless it's a hazard/loot token)
              hasAvsOverride = false;
              isAvsControlled = !isNonAvsToken; // AVS is controlling only if NOT hazard/loot

              // Get the effective state so native feat replacements display in the manager.
              actualCurrentState = getEffectiveVisibilityState(
                app.observer,
                token,
                app.visibilityData?.[token.document.id] || 'observed',
              );
            }
          } else {
            // If AVS is disabled, nothing is AVS controlled
            isAvsControlled = false;
            actualCurrentState = getEffectiveVisibilityState(
              app.observer,
              token,
              currentVisibilityState || 'observed',
            );
          }
        } catch {
          isAvsControlled = false;
          actualCurrentState = getEffectiveVisibilityState(
            app.observer,
            token,
            currentVisibilityState || 'observed',
          );
        }

        // Update selection based on override/AVS logic
        visibilityStates.forEach((state) => {
          if (isNonAvsToken) {
            // For loot/hazard tokens, select based on the actual current state from the map
            state.selected = state.value === actualCurrentState;
          } else if (hasAvsOverride) {
            // Override exists - select the override state
            state.selected = state.value === actualCurrentState;
          } else if (isAvsControlled) {
            // No override, AVS controlling - select AVS button
            state.selected = state.value === 'avs';
          } else if (manualVisibilityState) {
            // Manual state exists - select the manual state
            state.selected = state.value === actualCurrentState;
          } else {
            // No state at all - don't select anything
            state.selected = false;
          }
        });

        const timerBadge = getTimerBadgeData(app.observer.document.id, token.document.id);
        const rowTimerConfig = app.rowTimers?.get(token.document.id);
        const rowTimerData = rowTimerConfig
          ? {
              hasRowTimer: true,
              rowTimerDisplay: TimedOverrideManager.getRemainingTimeDisplay(
                TimedOverrideManager._buildTimedOverrideData(rowTimerConfig),
              ),
            }
          : { hasRowTimer: false, rowTimerDisplay: '' };

        const result = {
          id: token.document.id,
          name: token.document.name,
          img: getTokenImage(token),
          isFoundryHidden,
          isLoot: !!isRowLoot,
          isHazard: !!isRowHazard,
          isNonAvsToken,
          currentVisibilityState:
            allowedVisKeys.includes(actualCurrentState) && actualCurrentState !== 'avs'
              ? actualCurrentState
              : 'observed',
          currentCoverState,
          isPC: token.actor?.hasPlayerOwner || token.actor?.type === 'character',
          disposition: disposition,
          dispositionClass:
            disposition === -1 ? 'hostile' : disposition === 1 ? 'friendly' : 'neutral',
          isAvsControlled: isNonAvsToken ? false : isAvsControlled,
          hasAvsOverride,
          visibilityStates,
          coverStates: buildCoverStateList(currentCoverState),
          perceptionDC,
          stealthDC,
          showOutcome,
          outcomeLabel,
          outcomeClass,
          ...timerBadge,
          ...rowTimerData,
        };

        return result;
      }),
    );
  } else {
    allTargets = await Promise.all(
      filteredTokens.map(async (observerToken) => {
        const observerVisibilityData = getVisibilityMap(observerToken);
        const observerCoverData = getCoverMap(observerToken);
        // Get manual visibility state from the map, or null if none exists
        const manualVisibilityState = observerVisibilityData[app.observer.document.id] || null;
        // Don't default to 'observed' here - we'll handle that in the logic below
        let currentVisibilityState = manualVisibilityState;
        const currentCoverState = observerCoverData[app.observer.document.id] || 'none';
        // Foundry hidden means the TokenDocument.hidden property is strictly true
        const isFoundryHidden = observerToken?.document?.hidden === true;

        // For sneaking tokens, show the AVS internal state instead of the detection wrapper state
        if (app.observer.document.getFlag(MODULE_ID, 'sneak-active')) {
          // Read from the observer token's visibility map to see how it sees the sneaking token
          const avsInternalState = observerVisibilityData?.[app.observer.document.id];
          if (avsInternalState) {
            currentVisibilityState = avsInternalState;
          }
        }

        const disposition = observerToken.document.disposition || 0;

        const perceptionDC = extractPerceptionDC(observerToken);
        const stealthDC = extractPerceptionDC(observerToken);
        let showOutcome = false;
        let outcomeLabel = '';
        let outcomeClass = '';
        if (tokenManagerSettings.integrateRollOutcome) {
          const lastRoll = getLastRollTotalForActor(app.observer?.actor, null);
          if (typeof lastRoll === 'number' && typeof perceptionDC === 'number') {
            const diff = lastRoll - perceptionDC;
            if (diff >= 10) {
              outcomeLabel = 'Critical Success';
              outcomeClass = 'critical-success';
            } else if (diff >= 0) {
              outcomeLabel = 'Success';
              outcomeClass = 'success';
            } else if (diff <= -10) {
              outcomeLabel = 'Critical Failure';
              outcomeClass = 'critical-failure';
            } else {
              outcomeLabel = 'Failure';
              outcomeClass = 'failure';
            }
            showOutcome = true;
          }
        }
        const isRowLoot = observerToken.actor?.type === 'loot' || isLootObserver;
        const isRowHazard = observerToken.actor?.type === 'hazard' || isHazardObserver;
        const isNonAvsToken = isRowLoot || isRowHazard;

        // Check if AVS is enabled to determine if 'avs' button should be available
        const avsEnabledForTarget = tokenManagerSettings.autoVisibilityEnabled;

        const allowedVisKeys = getManualVisibilityStateKeys({
          isNonAvsToken,
          avsEnabled: avsEnabledForTarget,
        });

        const visibilityStates = allowedVisKeys
          .filter((key) => !isNonAvsToken || key !== 'avs') // Extra safety: never include 'avs' for loot/hazard
          .map((key) => {
            // Determine if this state should be selected
            let selected = false;

            // This will be set after we determine the override/AVS logic
            return buildVisibilityStateContext(key, { selected });
          });

        // In target mode, determine current state and selection logic
        let hasAvsOverride = false;
        let isAvsControlled = false;
        let actualCurrentState = currentVisibilityState;

        try {
          // Check if AVS is enabled first
          const avsEnabled = tokenManagerSettings.autoVisibilityEnabled;
          if (avsEnabled) {
            // Check for AVS override flag
            const avsOverrideFlag = app.observer.document.getFlag(
              MODULE_ID,
              `avs-override-from-${observerToken.document.id}`,
            );

            if (isVisibilityOverrideFlag(avsOverrideFlag)) {
              // There's an override - use the override state
              hasAvsOverride = true;
              actualCurrentState = getOverrideDisplayState(avsOverrideFlag);
              isAvsControlled = false; // Override is controlling, not AVS
            } else {
              // No override - AVS is controlling (unless it's a hazard/loot token)
              hasAvsOverride = false;
              isAvsControlled = !isNonAvsToken; // AVS is controlling only if NOT hazard/loot

              // Get the effective state so native feat replacements display in the manager.
              actualCurrentState = getEffectiveVisibilityState(
                observerToken,
                app.observer,
                observerVisibilityData?.[app.observer.document.id] || 'observed',
              );
            }
          } else {
            // If AVS is disabled, nothing is AVS controlled
            isAvsControlled = false;
            actualCurrentState = getEffectiveVisibilityState(
              observerToken,
              app.observer,
              currentVisibilityState || 'observed',
            );
          }
        } catch {
          isAvsControlled = false;
          actualCurrentState = getEffectiveVisibilityState(
            observerToken,
            app.observer,
            currentVisibilityState || 'observed',
          );
        }

        // Update selection based on override/AVS logic
        visibilityStates.forEach((state) => {
          if (isNonAvsToken) {
            // For loot/hazard tokens, select based on the actual current state from the map
            state.selected = state.value === actualCurrentState;
          } else if (hasAvsOverride) {
            // Override exists - select the override state
            state.selected = state.value === actualCurrentState;
          } else if (isAvsControlled) {
            // No override, AVS controlling - select AVS button
            state.selected = state.value === 'avs';
          } else if (manualVisibilityState) {
            // Manual state exists - select the manual state
            state.selected = state.value === actualCurrentState;
          } else {
            // No state at all - don't select anything
            state.selected = false;
          }
        });

        const timerBadge = getTimerBadgeData(observerToken.document.id, app.observer.document.id);
        const rowTimerConfig = app.rowTimers?.get(observerToken.document.id);
        const rowTimerData = rowTimerConfig
          ? {
              hasRowTimer: true,
              rowTimerDisplay: TimedOverrideManager.getRemainingTimeDisplay(
                TimedOverrideManager._buildTimedOverrideData(rowTimerConfig),
              ),
            }
          : { hasRowTimer: false, rowTimerDisplay: '' };

        const result = {
          id: observerToken.document.id,
          name: observerToken.document.name,
          img: getTokenImage(observerToken),
          isFoundryHidden,
          isLoot: !!(observerToken.actor?.type === 'loot'),
          isHazard: !!(observerToken.actor?.type === 'hazard'),
          isNonAvsToken,
          currentVisibilityState:
            allowedVisKeys.includes(actualCurrentState) && actualCurrentState !== 'avs'
              ? actualCurrentState
              : 'observed',
          currentCoverState,
          isPC: observerToken.actor?.hasPlayerOwner || observerToken.actor?.type === 'character',
          disposition: disposition,
          dispositionClass:
            disposition === -1 ? 'hostile' : disposition === 1 ? 'friendly' : 'neutral',
          isAvsControlled: isNonAvsToken ? false : isAvsControlled,
          hasAvsOverride,
          visibilityStates,
          coverStates: buildCoverStateList(currentCoverState),
          perceptionDC,
          stealthDC,
          showOutcome,
          outcomeLabel,
          outcomeClass,
          ...timerBadge,
          ...rowTimerData,
        };

        return result;
      }),
    );
  }

  const visibilityPrecedence = { observed: 0, concealed: 1, hidden: 2, undetected: 3 };
  const coverPrecedence = { none: 0, lesser: 1, standard: 2, greater: 4 };

  const sortByStatusAndName = (a, b) => {
    if (app.activeTab === 'visibility') {
      const statusA = visibilityPrecedence[a.currentVisibilityState] ?? 999;
      const statusB = visibilityPrecedence[b.currentVisibilityState] ?? 999;
      if (statusA !== statusB) return statusA - statusB;
    } else {
      const statusA = coverPrecedence[a.currentCoverState] ?? 999;
      const statusB = coverPrecedence[b.currentCoverState] ?? 999;
      if (statusA !== statusB) return statusA - statusB;
    }
    return a.name.localeCompare(b.name);
  };

  // Overrides-first sorting: prioritize rows that have an AVS override, then apply status/name sort
  const sortWithOverridesFirst = (a, b) => {
    const aHas = !!a.hasAvsOverride;
    const bHas = !!b.hasAvsOverride;
    if (aHas !== bHas) return aHas ? -1 : 1; // true first
    return sortByStatusAndName(a, b);
  };

  context.pcTargets = allTargets
    .filter((t) => t.isPC && !t.isLoot && !t.isHazard)
    .sort(sortWithOverridesFirst);
  context.npcTargets = allTargets
    .filter((t) => !t.isPC && !t.isLoot && !t.isHazard)
    .sort(sortWithOverridesFirst);
  context.hazardTargets =
    app.mode === 'observer' ? allTargets.filter((t) => t.isHazard).sort(sortByStatusAndName) : [];
  context.lootTargets =
    app.mode === 'observer' ? allTargets.filter((t) => t.isLoot).sort(sortByStatusAndName) : [];
  context.targets = allTargets;

  // Hidden Walls (Observer Mode): list identifiers of walls marked as hidden with observed/hidden states
  context.wallTargets = [];
  context.includeWalls = false;
  try {
    if (context.isObserverMode && tokenManagerSettings.hiddenWallsEnabled) {
      const walls = canvas?.walls?.placeables || [];
      // Respect UI filter: Ignore walls (visibility tab only)
      const ignoreWalls = !!app.ignoreWalls && context.isVisibilityTab === true;
      const hiddenWalls = ignoreWalls
        ? []
        : walls.filter((w) => !!w?.document?.getFlag?.(MODULE_ID, 'hiddenWall'));
      let autoIndex = 0;
      const wallMap = app.observer?.document?.getFlag?.(MODULE_ID, 'walls') || {};
      context.wallTargets = hiddenWalls.map((w) => {
        const d = w.document;
        const idf = d?.getFlag?.(MODULE_ID, 'wallIdentifier');
        const doorType = Number(d?.door) || 0;
        const fallback = `${game.i18n?.localize?.('PF2E_VISIONER.WALL.VISIBLE_TO_YOU') || isDoor ? 'Hidden Door' : 'Hidden Wall'} ${++autoIndex}`;
        const currentState = wallMap?.[d.id] || 'hidden';
        const states = ['hidden', 'observed'].map((key) =>
          buildVisibilityStateContext(key, { selected: currentState === key }),
        );
        const img = getWallImage(doorType);
        // DC: per-wall override else global default
        const overrideDC = Number(d?.getFlag?.(MODULE_ID, 'stealthDC'));
        const defaultWallDC = tokenManagerSettings.wallStealthDC;
        const dc = Number.isFinite(overrideDC) && overrideDC > 0 ? overrideDC : defaultWallDC;
        // Outcome (optional): compare last Perception roll of observer vs dc
        let showOutcome = false;
        let outcomeLabel = '';
        let outcomeClass = '';
        try {
          if (tokenManagerSettings.integrateRollOutcome) {
            const lastRoll = getLastRollTotalForActor(app.observer?.actor, 'perception');
            if (typeof lastRoll === 'number') {
              const diff = lastRoll - dc;
              if (diff >= 10) {
                outcomeLabel = 'Critical Success';
                outcomeClass = 'critical-success';
              } else if (diff >= 0) {
                outcomeLabel = 'Success';
                outcomeClass = 'success';
              } else if (diff <= -10) {
                outcomeLabel = 'Critical Failure';
                outcomeClass = 'critical-failure';
              } else {
                outcomeLabel = 'Failure';
                outcomeClass = 'failure';
              }
              showOutcome = true;
            }
          }
        } catch {}
        return {
          id: d.id,
          identifier: idf && String(idf).trim() ? String(idf) : fallback,
          currentVisibilityState: currentState,
          visibilityStates: states,
          doorType,
          img,
          dc,
          showOutcome,
          outcomeLabel,
          outcomeClass,
        };
      });
      context.includeWalls = context.wallTargets.length > 0;
    }
  } catch {}

  // Check if AVS is enabled to filter out 'avs' state from bulk actions
  const avsEnabled = tokenManagerSettings.autoVisibilityEnabled;

  const allowedLegendKeys = getManualVisibilityStateKeys({
    isNonAvsToken: isLootObserver || context.hazardObserver,
    avsEnabled,
  });

  context.visibilityStates = allowedLegendKeys.map((key) => ({
    key,
    ...buildVisibilityStateContext(key, { selected: false }),
  }));

  context.coverStates = coverStateBase.map((state) => ({ key: state.value, ...state }));

  context.hasTargets = allTargets.length > 0;
  context.hasPCs = context.pcTargets.length > 0;
  context.hasNPCs = context.npcTargets.length > 0;
  context.hasHazards = app.mode === 'observer' && context.hazardTargets.length > 0;
  context.hasLoots = app.mode === 'observer' && context.lootTargets.length > 0;
  context.includeWalls = context.includeWalls || false;
  try {
    context.showOutcomeColumn = tokenManagerSettings.integrateRollOutcome;
  } catch {
    context.showOutcomeColumn = false;
  }

  const targetedTokens = Array.from(game.user.targets).filter(
    (token) => token.document.id !== app.observer?.document.id,
  );
  context.showingTargetedTokens = targetedTokens.length > 0;
  context.targetedTokensCount = targetedTokens.length;

  const observerId = app.observer.document.id;
  const allTimers = TimedOverrideManager.getActiveTimersForToken(observerId);

  // Filter timers by current mode
  const activeTimers = allTimers.filter((timer) => {
    if (app.mode === 'observer') {
      // In observer mode, only show timers where selected token is the observer
      return timer.observerId === observerId;
    } else {
      // In target mode, only show timers where selected token is the target
      return timer.targetId === observerId;
    }
  });

  context.activeTimers = activeTimers.map((timer) => {
    const isObserver = timer.observerId === observerId;
    const pairName = isObserver ? timer.targetName : timer.observerName;
    let turnTimingDisplay = '';
    if (timer.timedOverride?.type === 'rounds' && timer.timedOverride?.expiresOnTurn) {
      const turnInfo = timer.timedOverride.expiresOnTurn;
      const actorName = game.actors?.get(turnInfo.actorId)?.name || 'Unknown';
      const timingKey =
        turnInfo.timing === 'end'
          ? 'PF2E_VISIONER.TIMED_OVERRIDE.END_OF_TURN'
          : 'PF2E_VISIONER.TIMED_OVERRIDE.START_OF_TURN';
      const timingLabel = game.i18n.localize(timingKey);
      turnTimingDisplay = `(${timingLabel} ${actorName})`;
    }
    return {
      ...timer,
      pairName,
      stateLabel: game.i18n.localize(VISIBILITY_STATES[timer.state]?.label || timer.state),
      remainingDisplay: TimedOverrideManager.getRemainingTimeDisplay(timer.timedOverride),
      turnTimingDisplay,
    };
  });
  context.hasActiveTimers = context.activeTimers.length > 0;

  return context;
}
