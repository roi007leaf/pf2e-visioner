import { shouldBypassAvsForGmVision } from '../gm-vision-bypass.js';
import { suppressCurrentViewScentTokenArt } from '../../stores/visibility-map.js';
import { withDetectionFilterPrimaryMesh } from './detection-filter-mesh-suppression.js';

export function wrapTokenRenderDetectionFilter(wrapped, ...args) {
  if (shouldBypassAvsForGmVision()) {
    return wrapped(...args);
  }
  if (suppressCurrentViewScentTokenArt(this)) return;
  return withDetectionFilterPrimaryMesh(this, () => wrapped(...args));
}
