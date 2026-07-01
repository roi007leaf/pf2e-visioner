import { shouldBypassAvsForGmVision } from '../gm-vision-bypass.js';
import { currentViewObservers } from './current-view-hard-hide.js';
import { getVisionerVisibilityBetweenTokens } from './detection-visibility-context.js';
import { isSelectAllTokenVisibilityBypassActive } from './select-all-token-visibility-bypass.js';

function currentViewObservesTargetPrecisely(target) {
  const observers = currentViewObservers();
  if (!observers.length) return false;
  for (const observer of observers) {
    if (observer === target) continue;
    if (getVisionerVisibilityBetweenTokens(observer, target) === 'observed') return true;
  }
  return false;
}

export function wrapCanvasVisibilityTest(wrapped, points, options = {}) {
  if (isSelectAllTokenVisibilityBypassActive()) {
    return wrapped(points, options);
  }
  if (shouldBypassAvsForGmVision()) {
    return wrapped(points, options);
  }
  const result = wrapped(points, options);
  const target = options?.object;
  if (result === true && target?.detectionFilter && currentViewObservesTargetPrecisely(target)) {
    target.detectionFilter = null;
  }
  return result;
}
