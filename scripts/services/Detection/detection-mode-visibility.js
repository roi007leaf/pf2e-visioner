import { MODULE_ID } from '../../constants.js';
import {
  getVisionerVisibilityBetweenTokens,
  NON_VISUAL_DETECTION_MODE_IDS,
} from './detection-visibility-context.js';
import { shouldBypassAvsForGmVision } from '../gm-vision-bypass.js';
import { isSelectAllTokenVisibilityBypassActive } from './select-all-token-visibility-bypass.js';

function testDetectionPoints(detectionMode, visionSource, mode, config) {
  return (config.tests || []).some((test) =>
    detectionMode._testPoint(visionSource, mode, config.object, test),
  );
}

export function testDetectionModeVisibility(visionSource, mode, config = {}) {
  if (!mode.enabled) return false;
  if (shouldBypassAvsForGmVision()) {
    return testDetectionPoints(this, visionSource, mode, config);
  }
  if (isSelectAllTokenVisibilityBypassActive()) {
    return testDetectionPoints(this, visionSource, mode, config);
  }

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

  if (NON_VISUAL_DETECTION_MODE_IDS.has(modeId)) {
    const visibility = getVisionerVisibilityBetweenTokens(observerToken, targetToken);
    if (visibility === 'hidden') {
      return true;
    }
  }

  return testDetectionPoints(this, visionSource, mode, config);
}
