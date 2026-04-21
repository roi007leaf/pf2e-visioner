/**
 * Visibility map store and helpers
 */

import { MODULE_ID } from '../constants.js';
import { getBestVisibilityState, getControlledObserverTokens } from '../utils.js';
import { getLogger } from '../utils/logger.js';
import { autoVisibilitySystem } from '../visibility/auto-visibility/index.js';
import { updateEphemeralEffectsForVisibility } from '../visibility/ephemeral.js';
import { waitForTokenDocumentUpdateSafe } from './document-update-guard.js';

const log = getLogger('AVS/VisibilityMap');

export function normalizeVisibilityMap(map = {}) {
  const normalized = {};
  const forcedDeletion = foundry?.data?.operators?.ForcedDeletion;

  for (const [id, state] of Object.entries(map ?? {})) {
    if (!id) continue;
    if (id.startsWith?.('-=')) continue;
    if (!state || state === 'observed') continue;
    if (forcedDeletion && state === forcedDeletion) continue;
    normalized[id] = state;
  }

  return normalized;
}

function buildVisibilityMapDiff(previousMap = {}, nextMap = {}) {
  const ids = new Set([...Object.keys(previousMap ?? {}), ...Object.keys(nextMap ?? {})]);
  const changes = [];

  for (const id of ids) {
    const before = previousMap?.[id] ?? 'observed';
    const after = nextMap?.[id] ?? 'observed';
    if (before === after) continue;

    const target = canvas?.tokens?.get?.(id);
    changes.push({
      targetId: id,
      targetName: target?.name ?? target?.document?.name ?? id,
      from: before,
      to: after,
    });
  }

  return changes;
}

function buildVisibilityDeletionUpdate(path, nextMap, removedTargetIds, forcedDeletion) {
  if (forcedDeletion) {
    if (Object.keys(nextMap).length === 0) {
      return { [path]: forcedDeletion };
    }

    const persistedMap = { ...nextMap };
    for (const targetId of removedTargetIds) {
      persistedMap[targetId] = forcedDeletion;
    }
    return { [path]: persistedMap };
  }

  if (Object.keys(nextMap).length === 0) {
    return { [`flags.${MODULE_ID}.-=visibility`]: null };
  }

  const persistedMap = { ...nextMap };
  for (const targetId of removedTargetIds) {
    persistedMap[`-=${targetId}`] = null;
  }
  return { [path]: persistedMap };
}

/**
 * Get the visibility map for a token
 * @param {Token} token
 * @returns {Record<string,string>}
 */
export function getVisibilityMap(token) {
  const map = token?.document.getFlag(MODULE_ID, 'visibility') ?? {};
  return normalizeVisibilityMap(map);
}

/**
 * Persist the visibility map for a token
 * @param {Token} token
 * @param {Record<string,string>} visibilityMap
 */
export async function setVisibilityMap(token, visibilityMap) {
  if (!token?.document) return;
  // Only GMs can update token documents
  if (!game.user.isGM) {
    console.warn('PF2E Visioner | setVisibilityMap: Not GM, skipping visibility map update');
    return;
  }

  const previousMap = normalizeVisibilityMap(getVisibilityMap(token));
  const nextMap = normalizeVisibilityMap(visibilityMap);
  const changes = buildVisibilityMapDiff(previousMap, nextMap);

  if (changes.length) {
    log.debug(() => ({
      msg: 'persist-visibility-map',
      observerId: token.document.id,
      observerName: token.name ?? token.document.name ?? token.document.id,
      changeCount: changes.length,
      changes,
    }));
  }
  const path = `flags.${MODULE_ID}.visibility`;
  const removedTargetIds = Object.keys(previousMap).filter((id) => !(id in nextMap));
  const forcedDeletion = foundry?.data?.operators?.ForcedDeletion ?? null;
  const updates = buildVisibilityDeletionUpdate(path, nextMap, removedTargetIds, forcedDeletion);

  await waitForTokenDocumentUpdateSafe(token);

  return token.document.update(
    updates,
    { diff: false, render: false, animate: false },
  );
}


/**
 * Read visibility state between two tokens
 * @param {Token} observer
 * @param {Token} target
 */
export function getVisibilityBetween(observer, target) {
  const visibilityMap = getVisibilityMap(observer);
  return visibilityMap[target?.document?.id] || 'observed';
}

/**
 * Write visibility state between two tokens and update ephemeral effects
 * @param {Token} observer
 * @param {Token} target
 * @param {string} state
 * @param {Object} options
 */
export async function setVisibilityBetween(
  observer,
  target,
  state,
  options = { skipEphemeralUpdate: false, direction: 'observer_to_target', skipCleanup: false },
) {
  if (!observer?.document?.id || !target?.document?.id) return;

  const visibilityMap = { ...getVisibilityMap(observer) };
  const currentState = visibilityMap[target.document.id];

  // Track if state changed for hook notification
  const stateChanged = currentState !== state;
  // Update map if state has changed
  if (stateChanged) {
    if (!state || state === 'observed') {
      delete visibilityMap[target.document.id];
    } else {
      visibilityMap[target.document.id] = state;
    }
    log.debug(() => ({
      msg: 'set-visibility-between',
      observerId: observer.document.id,
      observerName: observer.name ?? observer.document.name ?? observer.document.id,
      targetId: target.document.id,
      targetName: target.name ?? target.document.name ?? target.document.id,
      from: currentState ?? 'observed',
      to: state,
      options,
    }));
    await setVisibilityMap(observer, visibilityMap);

    // Notify UI listeners that a visibility map changed so tooltips can refresh
    try {
      Hooks.callAll?.('pf2e-visioner.visibilityMapUpdated', {
        observerId: observer.document.id,
        targetId: target.document.id,
        state,
        direction: options.direction || 'observer_to_target',
      });
    } catch (_) { }
  }

  // Skip ephemeral effects for socket-triggered processing to avoid permission errors
  // or if explicitly requested
  if (options.skipEphemeralUpdate || options.fromSocket) {
    return;
  }

  // Always evaluate ephemeral effects, even if state hasn't changed
  // This is important when suppression flags change (e.g., Blind-Fight added/removed)
  // Check if off-guard effects should be suppressed for this visibility state
  // The suppression is on the OBSERVER (the one with Blind-Fight feat)
  const { OffGuardSuppression } = await import('../rule-elements/operations/OffGuardSuppression.js');
  if (OffGuardSuppression.shouldSuppressOffGuardForState(observer, state)) {
    // Remove any existing off-guard effects
    try {
      if (autoVisibilitySystem) {
        autoVisibilitySystem.setUpdatingEffects(true);
      }
      // Force removal of all ephemeral effects for this pair when suppression is active
      await updateEphemeralEffectsForVisibility(observer, target, state, { ...options, removeAllEffects: true });
    } catch (error) {
      console.error('PF2E Visioner: Error removing off-guard effects:', error);
    } finally {
      if (autoVisibilitySystem) {
        autoVisibilitySystem.setUpdatingEffects(false);
      }
    }
    return;
  }

  // Apply ephemeral effects if not suppressed
  try {
    // Set flag to prevent auto-visibility system from reacting to its own effect changes
    if (autoVisibilitySystem) {
      autoVisibilitySystem.setUpdatingEffects(true);
    }

    await updateEphemeralEffectsForVisibility(observer, target, state, options);
  } catch (error) {
    console.error('PF2E Visioner: Error updating off-guard effects:', error);
  } finally {
    // Always clear the flag, even if there was an error
    if (autoVisibilitySystem) {
      autoVisibilitySystem.setUpdatingEffects(false);
    }
  }
}

/**
 * Get visibility state between tokens with flexible parameter handling for compatibility
 * @param {Token|string} observer - Observer token or token ID
 * @param {Token|string} target - Target token or token ID
 * @param {string} direction - Direction of visibility (observer_to_target or target_to_observer)
 * @returns {string} Visibility state
 */
export function getVisibility(observer, target, direction = 'observer_to_target') {
  try {
    // Resolve tokens if IDs are provided
    let observerToken = observer;
    let targetToken = target;

    if (typeof observer === 'string') {
      observerToken = canvas.tokens.get(observer);
      if (!observerToken) {
        console.warn(`PF2E Visioner: Observer token with ID '${observer}' not found`);
        return 'observed'; // Default to observed if token not found
      }
    }

    if (typeof target === 'string') {
      targetToken = canvas.tokens.get(target);
      if (!targetToken) {
        console.warn(`PF2E Visioner: Target token with ID '${target}' not found`);
        return 'observed'; // Default to observed if token not found
      }
    }

    // Handle direction (for bidirectional visibility systems)
    if (direction === 'target_to_observer') {
      // Swap observer and target for reverse direction lookup
      return getVisibilityBetweenWithAggregation(targetToken, observerToken);
    }

    // Default: observer_to_target
    return getVisibilityBetweenWithAggregation(observerToken, targetToken);
  } catch (error) {
    console.error('PF2E Visioner: Error in getVisibility function:', error);
    return 'observed'; // Default fallback value
  }
}

/**
 * Get visibility between tokens with optional aggregation for camera vision.
 * If camera vision aggregation is enabled and observer has multiple permission tokens,
 * returns the best (most permissive) visibility state across all observers.
 * @param {Token} observer - Observer token
 * @param {Token} target - Target token
 * @returns {string} Visibility state
 */
function getVisibilityBetweenWithAggregation(observer, target) {
  if (!observer || !target) {
    return getVisibilityBetween(observer, target);
  }

  // Check if camera vision aggregation is enabled
  try {
    const aggregationEnabled = game.settings.get(MODULE_ID, 'enableCameraVisionAggregation');
    if (!aggregationEnabled) {
      return getVisibilityBetween(observer, target);
    }
  } catch (e) {
    return getVisibilityBetween(observer, target);
  }

  // Get all tokens with observer permissions (or selected tokens for GM)
  const observerTokens = getControlledObserverTokens();
  if (observerTokens.length <= 1) {
    // Only one or no observer tokens, no aggregation needed
    if (observerTokens.length === 1) {
      return getVisibilityBetween(observerTokens[0], target);
    } else {
      return getVisibilityBetween(observer, target);
    }
  }

  // Multiple observer tokens - aggregate visibility from all of them
  // Get the best visibility state from all observer tokens
  const visibilityStates = observerTokens
    .map(observerToken => getVisibilityBetween(observerToken, target))
    .filter(state => state !== undefined && state !== null);

  if (visibilityStates.length === 0) {
    return 'observed';
  }

  // Use the helper function to get the best (most permissive) state
  return getBestVisibilityState(visibilityStates);
}
