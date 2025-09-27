/**
 * Detection System Wrapper - Makes PF2E system show real conditions
 */

import { MODULE_ID } from '../constants.js';
import { getVisibilityMap } from '../utils.js';

/**
 * Class wrapper for PF2E detection integration to support init/teardown.
 * The old initializeDetectionWrapper() remains for compatibility.
 */
export class DetectionWrapper {
  constructor() {
    this._registered = false;
  }

  register() {
    if (this._registered) return;
    if (!game.modules.get('lib-wrapper')?.active) {
      console.warn(
        'Per-Token Visibility: libWrapper not found - visual conditions may not work properly',
      );
      return;
    }
    libWrapper.register(
      'pf2e-visioner',
      'foundry.canvas.perception.DetectionMode.prototype.testVisibility',
      detectionModeTestVisibility,
      'OVERRIDE',
    );
    libWrapper.register(
      'pf2e-visioner',
      'CONFIG.Canvas.detectionModes.basicSight._canDetect',
      canDetectWrapper(VISIBILITY_VALUES.hidden),
      'WRAPPER',
    );
    libWrapper.register(
      'pf2e-visioner',
      'CONFIG.Canvas.detectionModes.lightPerception._canDetect',
      canDetectWrapper(VISIBILITY_VALUES.hidden),
      'WRAPPER',
    );
    libWrapper.register(
      'pf2e-visioner',
      'CONFIG.Canvas.detectionModes.hearing._canDetect',
      canDetectWrapper(VISIBILITY_VALUES.undetected),
      'WRAPPER',
    );
    libWrapper.register(
      'pf2e-visioner',
      'CONFIG.Canvas.detectionModes.feelTremor._canDetect',
      canDetectWrapper(VISIBILITY_VALUES.undetected),
      'WRAPPER',
    );
    this._registered = true;
  }

  /** Best-effort unregister. libWrapper doesn't expose an unregister; rely on reload lifecycle. */
  unregister() {
    // no-op by design; kept for symmetry and future-proofing
  }
}

export function initializeDetectionWrapper() {
  try {
    (DetectionWrapper._instance ||= new DetectionWrapper()).register();
  } catch (_) { }
}

/**
 * Visibility values
 */
const VISIBILITY_VALUES = {
  observed: 0,
  concealed: 1,
  hidden: 2,
  undetected: 3,
};

/**
 * Override the detection mode test visibility function
 * This makes the PF2E system think tokens have actual conditions
 */
function detectionModeTestVisibility(visionSource, mode, config = {}) {
  if (!mode.enabled) return false;

  // Check if target is currently sneaking - if so, force hidden visibility
  // This prevents other tokens from seeing the sneaking token
  const isSneaking = config.object?.document?.getFlag(MODULE_ID, 'sneak-active');
  if (isSneaking) {
    return false;
  }

  if (!this._canDetect(visionSource, config.object, config)) return false;
  return config.tests.some((test) => this._testPoint(visionSource, mode, config.object, test));
}

/**
 * Create a wrapper for detection functions that respects our visibility flags
 */
function canDetectWrapper(threshold) {
  return function (wrapped, visionSource, target, config) {
    // Call the original function first
    const canDetect = wrapped(visionSource, target);
    if (canDetect === false) return false;

    // Enforce minimum perception proficiency for hazards/loot
    try {
      const observerToken = visionSource?.object;
      const targetToken = target;
      const targetActorType = targetToken?.actor?.type;
      if (
        observerToken?.actor &&
        targetToken?.actor &&
        (targetActorType === 'hazard' || targetActorType === 'loot')
      ) {
        const minRankFlag = Number(
          targetToken.document?.getFlag?.(MODULE_ID, 'minPerceptionRank') ?? 0,
        );
        const stat = observerToken.actor?.getStatistic?.('perception');
        const observerRank = Number(stat?.proficiency?.rank ?? stat?.rank ?? 0);
        if (Number.isFinite(minRankFlag) && observerRank < minRankFlag) {
          return false;
        }
      }
    } catch (_) { }

    // Check our module's visibility settings
    const origin = visionSource.object;
    const reachedThreshold = reachesVisibilityThreshold(origin, target, threshold, config);

    return !reachedThreshold;
  };
}

/**
 * Check if visibility threshold is reached based on our module's flags
 */
function reachesVisibilityThreshold(origin, target, threshold, config = {}) {
  if (!origin?.actor || !target?.actor) return false;

  // Get visibility from our module's flags
  if (!config.visibility) {
    config.visibility = getVisibilityBetweenTokens(origin, target);
  }

  return VISIBILITY_VALUES[config.visibility] >= threshold;
}

/**
 * Get visibility state between two tokens using our module's flags
 * This is the key function that makes the detection wrapper work
 */
function getVisibilityBetweenTokens(observer, target) {
  if (!observer || !target) return 'observed';

  // Get the observer's visibility map
  const visibilityMap = getVisibilityMap(observer);

  // Return the visibility state for this target
  return visibilityMap[target.document.id] || 'observed';
}
