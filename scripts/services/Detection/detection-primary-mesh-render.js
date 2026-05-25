import { shouldApplyDetectionFilterPrimaryMeshTint } from '../PendingMovement/pending-movement-render-lock.js';

export function wrapPrimarySpriteMeshRender(wrapped, ...args) {
  const object = this?.object;
  if (object?.detectionFilter && shouldApplyDetectionFilterPrimaryMeshTint(object)) {
    try {
      this.tint = 0;
    } catch {
      /* best-effort PF2E detection-filter tint parity */
    }
  }

  return wrapped(...args);
}
