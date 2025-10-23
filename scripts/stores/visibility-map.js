/**
 * Visibility map store and helpers
 */

import { MODULE_ID } from '../constants.js';
import { getBestVisibilityState, getControlledObserverTokens } from '../utils.js';
import { autoVisibilitySystem } from '../visibility/auto-visibility/index.js';
import { updateEphemeralEffectsForVisibility } from '../visibility/ephemeral.js';

/**
 * Get the visibility map for a token
 * @param {Token} token
 * @returns {Record<string,string>}
 */
export function getVisibilityMap(token) {
  const map = token?.document.getFlag(MODULE_ID, 'visibility') ?? {};
  return map;
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

  const path = `flags.${MODULE_ID}.visibility`;
  const result = await token.document.update({ [path]: visibilityMap }, { diff: false });
  return result;
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

  const visibilityMap = getVisibilityMap(observer);
  const currentState = visibilityMap[target.document.id];

  // Only update if state has changed
  if (currentState !== state) {
    visibilityMap[target.document.id] = state;
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
