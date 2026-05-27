import { MODULE_ID } from '../../constants.js';
import { AVS_EXPLICIT_VISIBLE_DETECTION_SENSE } from '../../stores/visibility-map.js';
import {
  isPendingMovementCoreAnimationBypassActive,
  isPendingMovementCoreAnimationPerceptionRefresh,
  isPendingMovementHiddenStateVisibilityProbe,
  shouldUseCoreDetectionDuringPendingMovement,
  shouldTemporarilyBlockSightDetection,
} from '../PendingMovement/pending-movement-detection-gate.js';
import { shouldHandlePendingMovementCanvasVisibilityForToken } from '../PendingMovement/pending-movement-render-lock.js';
import {
  targetHasAnyHiddenAvsOverride,
  targetMustStayHiddenDuringPendingMovement,
} from '../PendingMovement/pending-token-movement.js';
import { isExplicitVisiblePair } from '../ExplicitVisibilityPairs.js';
import {
  detectionFrameCache,
  getVisionerVisibilityBetweenTokens,
  NON_VISUAL_DETECTION_MODE_IDS,
  reachesVisibilityThreshold,
  VISIBILITY_DETECTION_THRESHOLDS,
} from './detection-visibility-context.js';

export function createCanDetectVisibilityWrapper(threshold) {
  return function wrapCanDetectVisibility(wrapped, visionSource, target, ...args) {
    const canDetect = wrapped(visionSource, target, ...args);
    if (targetMustStayHiddenDuringPendingMovement(target)) return false;
    const observerToken = visionSource?.object;
    const modeId = this?.id ?? args?.[0]?.id ?? null;
    const overrideHiddenActive = targetHasAnyHiddenAvsOverride(target);
    if (!overrideHiddenActive && isPendingMovementCoreAnimationBypassActive()) return canDetect;
    if (
      !overrideHiddenActive &&
      (isPendingMovementCoreAnimationPerceptionRefresh() ||
        isPendingMovementCoreAnimationBypassActive()) &&
      !shouldHandlePendingMovementCanvasVisibilityForToken(target)
    ) {
      return canDetect;
    }
    if (
      !overrideHiddenActive &&
      shouldUseCoreDetectionDuringPendingMovement(observerToken, target)
    ) {
      return canDetect;
    }

    const visibility = getVisionerVisibilityBetweenTokens(observerToken, target);
    const pendingMovementSightBlocked =
      !isPendingMovementHiddenStateVisibilityProbe() &&
      threshold === VISIBILITY_DETECTION_THRESHOLDS.hidden &&
      shouldTemporarilyBlockSightDetection(observerToken, target);

    if (canUseVisionerHiddenDetection(modeId, visibility, threshold)) {
      return true;
    }

    if (
      !pendingMovementSightBlocked &&
      canUseExplicitVisionerDetection(observerToken, target, modeId, visibility, threshold)
    ) {
      return true;
    }

    if (canDetect === false) {
      return false;
    }

    if (!meetsMinimumPerceptionRank(observerToken, target)) {
      return false;
    }

    if (pendingMovementSightBlocked) {
      return false;
    }

    return !reachesVisibilityThreshold(observerToken, target, threshold, {
      visibility,
    });
  };
}

function canUseVisionerHiddenDetection(
  modeId,
  visibility,
  threshold = VISIBILITY_DETECTION_THRESHOLDS.hidden,
) {
  return (
    threshold === VISIBILITY_DETECTION_THRESHOLDS.undetected &&
    (!modeId || NON_VISUAL_DETECTION_MODE_IDS.has(modeId)) &&
    visibility === 'hidden'
  );
}

function canUseExplicitVisionerDetection(
  observer,
  target,
  modeId,
  visibility,
  threshold = VISIBILITY_DETECTION_THRESHOLDS.hidden,
) {
  if (threshold !== VISIBILITY_DETECTION_THRESHOLDS.hidden) return false;
  if (modeId && NON_VISUAL_DETECTION_MODE_IDS.has(modeId)) return false;
  if (visibility !== 'observed' && visibility !== 'concealed') return false;
  if (isExplicitVisiblePair(observer, target)) return true;
  return hasExplicitObservedProfile(observer, target);
}

function hasExplicitObservedProfile(observer, target) {
  try {
    return (
      detectionFrameCache.getPerceptionProfile(observer, target)?.detectionSense ===
      AVS_EXPLICIT_VISIBLE_DETECTION_SENSE
    );
  } catch {
    return false;
  }
}

function meetsMinimumPerceptionRank(observerToken, targetToken) {
  try {
    const targetActorType = targetToken?.actor?.type;
    if (
      !observerToken?.actor ||
      !targetToken?.actor ||
      (targetActorType !== 'hazard' && targetActorType !== 'loot')
    ) {
      return true;
    }

    const minRankFlag = Number(
      targetToken.document?.getFlag?.(MODULE_ID, 'minPerceptionRank') ?? 0,
    );
    const stat = observerToken.actor?.getStatistic?.('perception');
    const observerRank = Number(stat?.proficiency?.rank ?? stat?.rank ?? 0);
    return !Number.isFinite(minRankFlag) || observerRank >= minRankFlag;
  } catch {
    return true;
  }
}
