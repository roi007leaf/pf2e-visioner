import { shouldBypassAvsForGmVision } from '../gm-vision-bypass.js';
import { isSelectAllTokenVisibilityBypassActive } from './select-all-token-visibility-bypass.js';

export function wrapCanvasVisibilityTest(wrapped, points, options = {}) {
  if (isSelectAllTokenVisibilityBypassActive()) {
    return wrapped(points, options);
  }
  if (shouldBypassAvsForGmVision()) {
    return wrapped(points, options);
  }
  return wrapped(points, options);
}
