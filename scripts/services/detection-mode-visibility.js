import { MODULE_ID } from '../constants.js';
import {
  getPendingMovementHiddenStateBlock,
  isPendingMovementHiddenStateVisibilityProbe,
  shouldTemporarilyBlockHiddenDetection,
  shouldTemporarilyBlockSightDetection,
} from './pending-movement-detection-gate.js';
import {
  getVisionerVisibilityBetweenTokens,
  NON_VISUAL_DETECTION_MODE_IDS,
} from './detection-visibility-context.js';

export function testDetectionModeVisibility(visionSource, mode, config = {}) {
  if (!mode.enabled) return false;

  const isSneaking = config.object?.document?.getFlag(MODULE_ID, 'sneak-active');
  if (isSneaking) {
    return false;
  }

  const level =
    config.level ?? config.object?.document?.level ?? config.object?.document?._source?.level;
  if (!this._canDetect(visionSource, config.object, level)) return false;

  const modeId = mode?.id ?? this?.id ?? null;
  const observerToken = visionSource?.object;
  const targetToken = config.object;
  const hiddenStateContext = getPendingMovementHiddenStateBlock(targetToken);
  if (hiddenStateContext && !isPendingMovementHiddenStateVisibilityProbe()) {
    return false;
  }

  if (
    !NON_VISUAL_DETECTION_MODE_IDS.has(modeId) &&
    !isPendingMovementHiddenStateVisibilityProbe() &&
    shouldTemporarilyBlockSightDetection(observerToken, targetToken)
  ) {
    return false;
  }

  if (NON_VISUAL_DETECTION_MODE_IDS.has(modeId)) {
    const visibility = getVisionerVisibilityBetweenTokens(observerToken, targetToken);
    if (visibility === 'hidden') {
      if (shouldTemporarilyBlockHiddenDetection(observerToken, targetToken, visibility)) {
        return false;
      }
      return true;
    }
  }

  return config.tests.some((test) => this._testPoint(visionSource, mode, config.object, test));
}
