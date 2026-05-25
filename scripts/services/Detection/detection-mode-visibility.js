import { MODULE_ID } from '../../constants.js';
import {
  getPendingMovementHiddenStateBlock,
  isPendingMovementCoreAnimationBypassActive,
  isPendingMovementCoreAnimationPerceptionRefresh,
  isPendingMovementHiddenStateVisibilityProbe,
  shouldUseCoreDetectionDuringPendingMovement,
  shouldTemporarilyBlockSightDetection,
} from '../PendingMovement/pending-movement-detection-gate.js';
import { shouldHandlePendingMovementCanvasVisibilityForToken } from '../PendingMovement/pending-movement-render-lock.js';
import {
  getVisionerVisibilityBetweenTokens,
  NON_VISUAL_DETECTION_MODE_IDS,
} from './detection-visibility-context.js';

function testDetectionPoints(detectionMode, visionSource, mode, config) {
  return (config.tests || []).some((test) =>
    detectionMode._testPoint(visionSource, mode, config.object, test),
  );
}

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
  if (isPendingMovementCoreAnimationBypassActive()) {
    return testDetectionPoints(this, visionSource, mode, config);
  }
  if (
    (isPendingMovementCoreAnimationPerceptionRefresh() ||
      isPendingMovementCoreAnimationBypassActive()) &&
    !shouldHandlePendingMovementCanvasVisibilityForToken(targetToken)
  ) {
    return testDetectionPoints(this, visionSource, mode, config);
  }
  if (shouldUseCoreDetectionDuringPendingMovement(observerToken, targetToken)) {
    return testDetectionPoints(this, visionSource, mode, config);
  }

  const hiddenStateContext = getPendingMovementHiddenStateBlock(targetToken);
  if (hiddenStateContext && !isPendingMovementHiddenStateVisibilityProbe()) {
    return false;
  }

  const pendingMovementSightBlocked =
    !isPendingMovementHiddenStateVisibilityProbe() &&
    shouldTemporarilyBlockSightDetection(observerToken, targetToken);

  if (
    !NON_VISUAL_DETECTION_MODE_IDS.has(modeId) &&
    pendingMovementSightBlocked
  ) {
    return false;
  }

  if (NON_VISUAL_DETECTION_MODE_IDS.has(modeId)) {
    const visibility = getVisionerVisibilityBetweenTokens(observerToken, targetToken);
    if (visibility === 'hidden') {
      if (pendingMovementSightBlocked) {
        return testDetectionPoints(this, visionSource, mode, config);
      }
      return true;
    }
  }

  return testDetectionPoints(this, visionSource, mode, config);
}
