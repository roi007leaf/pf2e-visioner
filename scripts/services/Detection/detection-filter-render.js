import { shouldBypassAvsForGmVision } from '../gm-vision-bypass.js';

export function wrapTokenRenderDetectionFilter(wrapped, ...args) {
  if (shouldBypassAvsForGmVision()) {
    return wrapped(...args);
  }
  return wrapped(...args);
}
