import { MODULE_ID } from '../../constants.js';
import { AVS_EXPLICIT_VISIBLE_DETECTION_SENSE } from '../../stores/visibility-map.js';
import { shouldBypassAvsForGmVision } from '../gm-vision-bypass.js';
import { hasActivePendingTokenMovement } from '../movement-tracking.js';
import { isExplicitVisiblePair } from '../ExplicitVisibilityPairs.js';
import {
  detectionFrameCache,
  getVisionerVisibilityBetweenTokens,
  isAvsActiveGivenCombatGate,
  NON_VISUAL_DETECTION_MODE_IDS,
  reachesVisibilityThreshold,
  VISIBILITY_DETECTION_THRESHOLDS,
} from './detection-visibility-context.js';
import { isSelectAllTokenVisibilityBypassActive } from './select-all-token-visibility-bypass.js';
import { isPartyActorToken } from '../../utils/token-actor.js';

export function createCanDetectVisibilityWrapper(threshold) {
  return function wrapCanDetectVisibility(wrapped, visionSource, target, ...args) {
    const canDetect = wrapped(visionSource, target, ...args);
    const observerToken = visionSource?.object;
    if (shouldBypassAvsForGmVision()) return canDetect;
    if (isSelectAllTokenVisibilityBypassActive()) return canDetect;
    if (!isAvsActiveGivenCombatGate()) return canDetect;
    const modeId = this?.id ?? args?.[0]?.id ?? null;

    const visibility = getVisionerVisibilityBetweenTokens(observerToken, target);

    if (hasActivePendingTokenMovement()) {
      return resolveDetectionDuringMovement(observerToken, target, visibility, modeId, canDetect);
    }

    if (canUseVisionerHiddenDetection(modeId, visibility, threshold)) {
      return true;
    }
    if (canUseExplicitVisionerDetection(observerToken, target, modeId, visibility, threshold)) {
      return true;
    }
    if (canDetect === false) {
      return false;
    }
    if (!meetsMinimumPerceptionRank(observerToken, target)) {
      return false;
    }
    return !reachesVisibilityThreshold(observerToken, target, threshold, { visibility });
  };
}

function targetIsLootOrHazard(target) {
  const actorType = String(target?.actor?.type ?? '').toLowerCase();
  return actorType === 'loot' || actorType === 'hazard';
}

function hasHiddenAvsOverride(observer, target) {
  try {
    const observerId = observer?.document?.id ?? observer?.id;
    if (!observerId) return false;
    const flag = target?.document?.getFlag?.(MODULE_ID, `avs-override-from-${observerId}`);
    return flag?.state === 'hidden';
  } catch {
    return false;
  }
}

function hasUndetectedAvsOverride(observer, target) {
  try {
    const observerId = observer?.document?.id ?? observer?.id;
    if (!observerId) return false;
    const state = target?.document?.getFlag?.(MODULE_ID, `avs-override-from-${observerId}`)?.state;
    return state === 'undetected' || state === 'unnoticed';
  } catch {
    return false;
  }
}

function resolveDetectionDuringMovement(observer, target, visibility, modeId, canDetect) {
  if (isPartyActorToken(observer) || isPartyActorToken(target)) return false;
  if (visibility === 'undetected' || visibility === 'unnoticed') {
    if (targetIsLootOrHazard(target)) return false;
    if (hasUndetectedAvsOverride(observer, target)) return false;
    const nonVisualMode = !modeId || NON_VISUAL_DETECTION_MODE_IDS.has(modeId);
    if (nonVisualMode) return false;
    return canDetect;
  }
  if (visibility === 'hidden') {
    if (targetIsLootOrHazard(target)) return false;
    const nonVisualMode = !modeId || NON_VISUAL_DETECTION_MODE_IDS.has(modeId);
    if (nonVisualMode) return true;
    if (hasHiddenAvsOverride(observer, target)) return false;
    return canDetect;
  }
  if (visibility === 'observed' || visibility === 'concealed') {
    return true;
  }
  return canDetect;
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
