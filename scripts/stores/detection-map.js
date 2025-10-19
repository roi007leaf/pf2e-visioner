/**
 * Detection map store and helpers
 * 
 * Stores which sense was used to detect each target, alongside the visibility state.
 * This allows tooltips and UI to show players/GMs which sense is being used.
 * 
 * Detection info format:
 * {
 *   sense: "tremorsense" | "darkvision" | "hearing" | etc.,
 *   isPrecise: true | false
 * }
 */

import { MODULE_ID } from '../constants.js';
import { getBestVisibilityState } from '../utils.js';
import { getVisibilityBetween } from './visibility-map.js';

let batchMode = false;
const batchedUpdates = new Map();

export function startDetectionBatch() {
  batchMode = true;
  batchedUpdates.clear();
}

export async function flushDetectionBatch() {
  if (!batchMode) return;

  const updates = [];
  let skipped = 0;
  let written = 0;

  for (const [tokenId, detectionMap] of batchedUpdates.entries()) {
    const token = canvas.tokens.get(tokenId);
    if (token?.document && game.user.isGM) {
      const currentMap = token.document.getFlag(MODULE_ID, 'detection') ?? {};
      const hasChanged = JSON.stringify(currentMap) !== JSON.stringify(detectionMap);

      if (hasChanged) {
        const path = `flags.${MODULE_ID}.detection`;
        updates.push(token.document.update({ [path]: detectionMap }, { diff: false }));
        written++;
      } else {
        skipped++;
      }
    }
  }

  if (updates.length > 0) {
    await Promise.all(updates);
  }

  batchMode = false;
  batchedUpdates.clear();
}

/**
 * Get the detection map for a token
 * @param {Token} token
 * @returns {Record<string, Object>} Map of target ID -> detection info
 */
export function getDetectionMap(token) {
  const map = token?.document.getFlag(MODULE_ID, 'detection') ?? {};
  return map;
}

/**
 * Persist the detection map for a token
 * @param {Token} token
 * @param {Record<string, Object>} detectionMap
 */
export async function setDetectionMap(token, detectionMap) {
  if (!token?.document) return;
  if (!game.user.isGM) return;

  if (batchMode) {
    batchedUpdates.set(token.document.id, detectionMap);
    return;
  }

  const path = `flags.${MODULE_ID}.detection`;
  const result = await token.document.update({ [path]: detectionMap }, { diff: false });
  return result;
}

/**
 * Read detection info between two tokens
 * @param {Token} observer
 * @param {Token} target
 * @returns {Object|null} Detection info { sense, isPrecise } or null if no detection
 */
export function getDetectionBetween(observer, target) {
  const detectionMap = getDetectionMap(observer);
  return detectionMap[target?.document?.id] || null;
}

/**
 * Write detection info between two tokens
 * @param {Token} observer
 * @param {Token} target
 * @param {Object|null} detection - Detection info { sense, isPrecise } or null
 */
export async function setDetectionBetween(observer, target, detection) {
  if (!observer?.document?.id || !target?.document?.id) return;

  let detectionMap;
  let currentDetection;

  if (batchMode) {
    detectionMap = batchedUpdates.get(observer.document.id);
    if (!detectionMap) {
      detectionMap = { ...getDetectionMap(observer) };
    } else {
      detectionMap = { ...detectionMap };
    }
    currentDetection = detectionMap[target.document.id];
  } else {
    detectionMap = getDetectionMap(observer);
    currentDetection = detectionMap[target.document.id];
  }

  const hasChanged = JSON.stringify(currentDetection) !== JSON.stringify(detection);

  if (hasChanged) {
    if (detection === null) {
      delete detectionMap[target.document.id];
    } else {
      detectionMap[target.document.id] = detection;
    }
    await setDetectionMap(observer, detectionMap);
  }
}

/**
 * Get detection info with flexible parameter handling
 * @param {Token|string} observer - Observer token or token ID
 * @param {Token|string} target - Target token or token ID
 * @param {string} direction - Direction of detection (observer_to_target or target_to_observer)
 * @returns {Object|null} Detection info or null
 */
export function getDetection(observer, target, direction = 'observer_to_target') {
  try {
    // Resolve tokens if IDs are provided
    let observerToken = observer;
    let targetToken = target;

    if (typeof observer === 'string') {
      observerToken = canvas.tokens.get(observer);
      if (!observerToken) {
        console.warn(`PF2E Visioner: Observer token with ID '${observer}' not found`);
        return null;
      }
    }

    if (typeof target === 'string') {
      targetToken = canvas.tokens.get(target);
      if (!targetToken) {
        console.warn(`PF2E Visioner: Target token with ID '${target}' not found`);
        return null;
      }
    }

    // Handle direction (for bidirectional detection systems)
    if (direction === 'target_to_observer') {
      // Swap observer and target for reverse direction lookup
      return getDetectionBetweenWithAggregation(targetToken, observerToken);
    }

    // Default: observer_to_target
    return getDetectionBetweenWithAggregation(observerToken, targetToken);
  } catch (error) {
    console.error('PF2E Visioner: Error in getDetection function:', error);
    return null;
  }
}

/**
 * Get detection info between tokens with optional aggregation for camera vision.
 * If camera vision aggregation is enabled and observer has multiple controlled tokens,
 * returns the detection from the observer with the best visibility state.
 * @param {Token} observer - Observer token
 * @param {Token} target - Target token
 * @returns {Object|null} Detection info or null
 */
function getDetectionBetweenWithAggregation(observer, target) {
  if (!observer || !target) {
    return getDetectionBetween(observer, target);
  }

  // Check if camera vision aggregation is enabled
  try {
    const aggregationEnabled = game.settings.get(MODULE_ID, 'enableCameraVisionAggregation');
    if (!aggregationEnabled) {
      return getDetectionBetween(observer, target);
    }
  } catch (e) {
    return getDetectionBetween(observer, target);
  }

  // Only apply aggregation if observer is one of the controlled tokens
  const controlled = canvas.tokens.controlled;
  if (controlled.length === 0) {
    return getDetectionBetween(observer, target);
  }

  // Check if the observer token is in the controlled list
  const isObserverControlled = controlled.some(t => t.id === observer.id);
  if (!isObserverControlled) {
    return getDetectionBetween(observer, target);
  }

  // If only one controlled token, no aggregation needed
  if (controlled.length === 1) {
    return getDetectionBetween(observer, target);
  }

  // Multiple controlled tokens - get detection from the observer with best visibility
  // First, get all visibility states from all controlled observers
  const visibilityStates = controlled
    .map(controlledObserver => ({
      token: controlledObserver,
      visibility: getVisibilityBetween(controlledObserver, target),
    }))
    .filter(item => item.visibility !== undefined && item.visibility !== null);

  if (visibilityStates.length === 0) {
    return null;
  }

  // Find which observer has the best visibility
  const visibilities = visibilityStates.map(item => item.visibility);
  const bestVisibility = getBestVisibilityState(visibilities);

  // Find the first observer with that best visibility and return their detection
  for (const item of visibilityStates) {
    if (item.visibility === bestVisibility) {
      return getDetectionBetween(item.token, target);
    }
  }

  return null;
}
/**
 * Clear detection info for a specific target
 * @param {Token} observer
 * @param {Token} target
 */
export async function clearDetectionBetween(observer, target) {
  return setDetectionBetween(observer, target, null);
}

/**
 * Clear all detection info for an observer
 * @param {Token} observer
 */
export async function clearAllDetections(observer) {
  if (!observer?.document) return;
  await setDetectionMap(observer, {});
}
