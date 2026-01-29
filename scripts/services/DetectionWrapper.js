/**
 * Detection System Wrapper - Makes PF2E system show real conditions
 */

import { MODULE_ID } from '../constants.js';
import { getBestVisibilityState, getControlledObserverTokens, getVisibilityMap } from '../utils.js';

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

    // Wrap Token._isVisionSource to make master tokens contribute vision for minions
    try {
      libWrapper.register(
        'pf2e-visioner',
        'Token.prototype._isVisionSource',
        tokenIsVisionSourceWrapper,
        'WRAPPER',
      );
      libWrapper.register(
        'pf2e-visioner',
        'TokenDocument.prototype.prepareBaseData',
        tokenDocumentPrepareBaseDataWrapper,
        'WRAPPER',
      );
    } catch (e) {
      console.warn('[PF2E-Visioner] Failed to register Token wrapper:', e);
    }

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
  } catch (_) {}
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
    const canDetect = wrapped(visionSource, target);
    if (canDetect === false) return false;

    const observerToken = visionSource?.object;

    try {
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
    } catch (_) {}

    const origin = observerToken;
    const reachedThreshold = reachesVisibilityThreshold(origin, target, threshold, config);

    return !reachedThreshold;
  };
}

/**
 * Helper to check if a token/actor is blinded
 */
function isTokenBlinded(tokenOrDoc) {
  try {
    const doc = tokenOrDoc?.document || tokenOrDoc;
    const actor = doc?.actor;
    if (!actor) return false;

    // Check PF2e blinded condition
    return (
      actor.hasCondition?.('blinded') ||
      actor.conditions?.has?.('blinded') ||
      actor.itemTypes?.condition?.some((c) => c.slug === 'blinded')
    );
  } catch {
    return false;
  }
}

/**
 * Wrapper for TokenDocument.prototype.prepareBaseData
 * Disables sight for tokens in replace/reverse modes
 */
function tokenDocumentPrepareBaseDataWrapper(wrapped) {
  wrapped();

  const visionMasterTokenId = this.getFlag?.(MODULE_ID, 'visionMasterTokenId');
  const mode = this.getFlag?.(MODULE_ID, 'visionSharingMode') || 'one-way';

  // REPLACE: Disable minion's sight completely
  if (visionMasterTokenId && mode === 'replace' && this.sight) {
    this.sight.enabled = false;
  }

  // REVERSE: Check if THIS token is a master for a minion with reverse mode
  // If so, disable this master's sight
  const tokens = canvas?.tokens?.placeables || [];
  const hasReverseMinionPointingToMe = tokens.some((t) => {
    const minionMasterId = t.document?.getFlag?.(MODULE_ID, 'visionMasterTokenId');
    const minionMode = t.document?.getFlag?.(MODULE_ID, 'visionSharingMode') || 'one-way';
    return minionMasterId === this.id && minionMode === 'reverse';
  });

  if (hasReverseMinionPointingToMe && this.sight) {
    this.sight.enabled = false;
  }
}

/**
 * Wrapper for Token.prototype._isVisionSource
 * Implements vision sharing modes: one-way, two-way, replace, and reverse
 */
function tokenIsVisionSourceWrapper(wrapped) {
  const isNormalVisionSource = wrapped();

  const thisTokenBlinded = isTokenBlinded(this);

  // Check if any controlled token has this token as their vision master
  const controlledTokens = canvas?.tokens?.controlled || [];
  for (const controlledToken of controlledTokens) {
    const visionMasterTokenId = controlledToken.document?.getFlag?.(
      MODULE_ID,
      'visionMasterTokenId',
    );
    const mode = controlledToken.document?.getFlag?.(MODULE_ID, 'visionSharingMode') || 'one-way';

    // Check if this token is the master for a controlled minion
    if (visionMasterTokenId === this.id) {
      // If master is blinded, cannot share vision (minion falls back to own vision if any)
      if (thisTokenBlinded) {
        return false;
      }

      // ONE-WAY: minion sees master's vision (master becomes vision source)
      // TWO-WAY: both see each other's vision (both become vision sources)
      // REPLACE: minion sees ONLY master's vision (master becomes vision source)
      if (mode === 'one-way' || mode === 'two-way' || mode === 'replace') {
        return true;
      }
    }
  }

  // If this token is blinded and is not being used as a vision source for someone else,
  // it cannot be a normal vision source
  if (thisTokenBlinded) {
    return false;
  }

  // Check if this token is a minion with a vision master
  const visionMasterTokenId = this.document?.getFlag?.(MODULE_ID, 'visionMasterTokenId');
  const mode = this.document?.getFlag?.(MODULE_ID, 'visionSharingMode') || 'one-way';

  // REPLACE: minion uses ONLY master's vision (minion is NOT a vision source)
  // UNLESS master is blinded, then minion falls back to own vision
  if (visionMasterTokenId && mode === 'replace') {
    const masterToken = canvas?.tokens?.get(visionMasterTokenId);
    if (masterToken && isTokenBlinded(masterToken)) {
      // Fall through to check if this token can be a normal vision source
    } else {
      return false;
    }
  }

  // TWO-WAY: When master is controlled, minion also becomes vision source
  // Check if THIS token is a minion and its master is controlled
  if (visionMasterTokenId && mode === 'two-way') {
    const isMasterControlled = controlledTokens.some((ct) => ct.id === visionMasterTokenId);
    // Don't share vision if the minion (this token) is blinded
    if (isMasterControlled && !isTokenBlinded(this)) {
      return true;
    }
  }

  // REVERSE: When master is controlled, minion becomes vision source, master does not
  // Check if THIS token is a minion and its master is controlled
  if (visionMasterTokenId && mode === 'reverse') {
    const isMasterControlled = controlledTokens.some((ct) => ct.id === visionMasterTokenId);
    // Don't share vision if the minion (this token) is blinded
    if (isMasterControlled && !isTokenBlinded(this)) {
      return true;
    }
  }

  // TWO-WAY: When THIS token is the master and is controlled, it should be a vision source
  // Check if this token has any two-way minions
  const hasTwoWayMinion = canvas?.tokens?.placeables?.some((t) => {
    const minionMasterId = t.document?.getFlag?.(MODULE_ID, 'visionMasterTokenId');
    const minionMode = t.document?.getFlag?.(MODULE_ID, 'visionSharingMode') || 'one-way';
    return minionMasterId === this.id && minionMode === 'two-way';
  });

  if (hasTwoWayMinion && controlledTokens.some((ct) => ct.id === this.id) && !thisTokenBlinded) {
    return true;
  }

  // REVERSE: When THIS token is the master and is controlled, it should NOT be a vision source
  // UNLESS the minion is blinded (then master uses their own vision)
  // Find if there's a minion with reverse mode that has this token as master
  const reverseMinion = canvas?.tokens?.placeables?.find((t) => {
    const minionMasterId = t.document?.getFlag?.(MODULE_ID, 'visionMasterTokenId');
    const minionMode = t.document?.getFlag?.(MODULE_ID, 'visionSharingMode') || 'one-way';
    return minionMasterId === this.id && minionMode === 'reverse';
  });

  if (reverseMinion && controlledTokens.some((ct) => ct.id === this.id)) {
    // If the minion is blinded, master should use their own vision (if they have any)
    if (isTokenBlinded(reverseMinion)) {
      return isNormalVisionSource;
    }

    return false;
  }

  return isNormalVisionSource;
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
 * Supports camera vision aggregation when enabled
 */
function getVisibilityBetweenTokens(observer, target) {
  if (!observer || !target) return 'observed';

  // Check if camera vision aggregation is enabled
  let aggregationEnabled = false;
  try {
    aggregationEnabled = game.settings.get(MODULE_ID, 'enableCameraVisionAggregation');
  } catch (e) {
    aggregationEnabled = false;
  }

  if (!aggregationEnabled) {
    // Standard behavior: get visibility from the single observer
    const visibilityMap = getVisibilityMap(observer);
    return visibilityMap[target.document.id] || 'observed';
  }

  // Camera vision aggregation enabled - get tokens with observer permissions
  const observerTokens = getControlledObserverTokens();
  if (observerTokens.length <= 1) {
    // Only one or no observer tokens, no aggregation needed
    const visibilityMap = getVisibilityMap(observer);
    return visibilityMap[target.document.id] || 'observed';
  }

  // Multiple observer tokens - aggregate visibility from all of them
  const visibilityStates = observerTokens
    .map((observerToken) => {
      const map = getVisibilityMap(observerToken);
      return map[target.document.id] || 'observed';
    })
    .filter((state) => state !== undefined && state !== null);

  if (visibilityStates.length === 0) {
    return 'observed';
  }

  // Return the best (most permissive) visibility state
  return getBestVisibilityState(visibilityStates);
}
