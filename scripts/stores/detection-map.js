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
  // Only GMs can update token documents
  if (!game.user.isGM) return;

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

  const detectionMap = getDetectionMap(observer);
  const currentDetection = detectionMap[target.document.id];

  // Compare current detection with new detection (deep comparison)
  const hasChanged = JSON.stringify(currentDetection) !== JSON.stringify(detection);

  // Only update if detection has changed
  if (hasChanged) {
    if (detection === null) {
      // Remove detection entry if null (undetected)
      delete detectionMap[target.document.id];
    } else {
      // Store detection info
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
      return getDetectionBetween(targetToken, observerToken);
    }

    // Default: observer_to_target
    return getDetectionBetween(observerToken, targetToken);
  } catch (error) {
    console.error('PF2E Visioner: Error in getDetection function:', error);
    return null;
  }
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
