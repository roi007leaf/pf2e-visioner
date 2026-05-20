import { MODULE_ID } from '../constants.js';
import { AVS_EXPLICIT_VISIBLE_DETECTION_SENSE } from '../stores/visibility-map.js';
import {
  isPendingMovementHiddenStateVisibilityProbe,
  shouldBypassPendingMovementVisionerRenderState,
  shouldTemporarilyBlockSightDetection,
} from './pending-movement-detection-gate.js';
import { isExplicitVisiblePair } from './ExplicitVisibilityPairs.js';
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
    const observerToken = visionSource?.object;
    const modeId = this?.id ?? args?.[0]?.id ?? null;
    const visibility = getVisionerVisibilityBetweenTokens(observerToken, target);
    const pendingMovementSightBlocked =
      !isPendingMovementHiddenStateVisibilityProbe() &&
      threshold === VISIBILITY_DETECTION_THRESHOLDS.hidden &&
      shouldTemporarilyBlockSightDetection(observerToken, target);

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

    if (isPendingMovementHiddenStateVisibilityProbe()) {
      return true;
    }

    if (shouldBypassPendingMovementVisionerRenderState(observerToken, target, visibility)) {
      return true;
    }

    if (pendingMovementSightBlocked) {
      return false;
    }

    return !reachesVisibilityThreshold(observerToken, target, threshold, {
      visibility,
    });
  };
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
