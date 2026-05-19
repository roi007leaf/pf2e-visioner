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
import { getBestVisibilityState, getControlledObserverTokens } from '../utils.js';
import { getVisibilityBetween } from './visibility-map.js';
import { waitForTokenDocumentUpdateSafe } from './document-update-guard.js';
import {
  applyTokenFlagMapUpdates,
  areTokenFlagValuesEqual,
  setTokenFlagMap,
} from './token-flag-map-persistence.js';

let batchMode = false;
const batchedUpdates = new Map();

export function startDetectionBatch() {
  batchMode = true;
  batchedUpdates.clear();
}

export function discardDetectionBatch() {
  batchMode = false;
  batchedUpdates.clear();
}

export async function flushDetectionBatch() {
  if (!batchMode) return;

  if (game.user.isGM) {
    await applyTokenFlagMapUpdates({
      entries: Array.from(batchedUpdates.entries(), ([tokenId, detectionMap]) => ({
        tokenId,
        map: detectionMap,
      })),
      moduleId: MODULE_ID,
      flagKey: 'detection',
      waitForToken: waitForTokenDocumentUpdateSafe,
    });
  }

  batchMode = false;
  batchedUpdates.clear();
}

function isDetectionChanged(currentDetection, detection) {
  return !areTokenFlagValuesEqual(currentDetection ?? null, detection ?? null);
}

async function persistDetectionMap(token, detectionMap) {
  return setTokenFlagMap({
    token,
    map: detectionMap,
    moduleId: MODULE_ID,
    flagKey: 'detection',
    waitForToken: waitForTokenDocumentUpdateSafe,
  });
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

  return persistDetectionMap(token, detectionMap);
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
  const observerId = observer.document.id;
  const targetId = target.document.id;

  if (batchMode) {
    detectionMap = batchedUpdates.get(observerId);
    if (!detectionMap) {
      detectionMap = { ...getDetectionMap(observer) };
    }
    currentDetection = detectionMap[targetId];
  } else {
    detectionMap = { ...getDetectionMap(observer) };
    currentDetection = detectionMap[targetId];
  }

  const hasChanged = isDetectionChanged(currentDetection, detection);

  if (hasChanged) {
    if (detection === null) {
      delete detectionMap[targetId];
    } else {
      detectionMap[targetId] = detection;
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

  // Get tokens with observer permissions
  const observerTokens = getControlledObserverTokens();
  if (observerTokens.length <= 1) {
    return getDetectionBetween(observer, target);
  }

  // Multiple observer tokens - get detection from the observer with best visibility
  // First, get all visibility states from all observer tokens
  const visibilityStates = observerTokens
    .map((observerToken) => ({
      token: observerToken,
      visibility: getVisibilityBetween(observerToken, target),
    }))
    .filter((item) => item.visibility !== undefined && item.visibility !== null);

  if (visibilityStates.length === 0) {
    return null;
  }

  // Find which observer has the best visibility
  const visibilities = visibilityStates.map((item) => item.visibility);
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
