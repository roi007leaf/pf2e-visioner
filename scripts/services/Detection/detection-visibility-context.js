import { MODULE_ID } from '../../constants.js';
import {
  getBestVisibilityState,
  getControlledObserverTokens,
  getPerceptionProfileBetween,
  getVisibilityMap,
} from '../../utils.js';
import { getCacheInvalidationRevision } from '../../utils/cache-invalidation.js';
import {
  blocksCanvasDetection,
  legacyVisibilityToProfile,
} from '../../visibility/perception-profile.js';
import { DetectionFrameCache } from './detection-frame-cache.js';

export const VISIBILITY_DETECTION_THRESHOLDS = {
  observed: 0,
  concealed: 1,
  hidden: 2,
  undetected: 3,
};

export const NON_VISUAL_DETECTION_MODE_IDS = new Set([
  'hearing',
  'feelTremor',
  'tremorsense',
  'scent',
  'lifesense',
  'thoughtsense',
]);

function getDetectionAggregationObserverTokens() {
  if (game.user?.isGM) {
    return canvas?.tokens?.controlled || [];
  }
  return getControlledObserverTokens();
}

export const detectionFrameCache = new DetectionFrameCache({
  moduleId: MODULE_ID,
  getVisibilityMap,
  getPerceptionProfileBetween,
  getControlledObserverTokens: getDetectionAggregationObserverTokens,
  getBestVisibilityState,
  getSetting: (key) => game.settings.get(MODULE_ID, key),
  getTokens: () => canvas?.tokens?.placeables || [],
  getInvalidationRevision: getCacheInvalidationRevision,
});

export function isTokenBlinded(tokenOrDoc) {
  try {
    const doc = tokenOrDoc?.document || tokenOrDoc;
    const actor = doc?.actor;
    if (!actor) return false;

    return (
      actor.hasCondition?.('blinded') ||
      actor.conditions?.has?.('blinded') ||
      actor.itemTypes?.condition?.some((c) => c.slug === 'blinded')
    );
  } catch {
    return false;
  }
}

export function reachesVisibilityThreshold(origin, target, threshold, config = {}) {
  if (!origin?.actor || !target?.actor) return false;

  if (!config.visibility) {
    config.visibility = getVisionerVisibilityBetweenTokens(origin, target);
  }

  const profile = legacyVisibilityToProfile(config.visibility);
  if (blocksCanvasDetection(profile)) return true;

  return VISIBILITY_DETECTION_THRESHOLDS[config.visibility] >= threshold;
}

export function getVisionerVisibilityBetweenTokens(observer, target) {
  if (!observer || !target) return 'observed';
  if (!observer.document?.getFlag || !target.document?.id) return 'observed';

  return detectionFrameCache.getVisibility(observer, target);
}
