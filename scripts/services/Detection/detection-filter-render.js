import { shouldBypassAvsForGmVision } from '../gm-vision-bypass.js';
import { suppressCurrentViewScentTokenArt } from '../../stores/visibility-map.js';

export function wrapTokenRenderDetectionFilter(wrapped, ...args) {
  if (shouldBypassAvsForGmVision()) {
    return wrapped(...args);
  }
  if (suppressCurrentViewScentTokenArt(this)) return;
  return wrapped(...args);
}
