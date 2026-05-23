import { shouldApplyDetectionFilterPrimaryMeshTint } from '../PendingMovement/pending-movement-render-lock.js';

export function wrapPrimarySpriteMeshRender(wrapped, ...args) {
  if (shouldApplyDetectionFilterPrimaryMeshTint(this?.object)) {
    try {
      this.tint = 0;
    } catch {
      /* best-effort PF2E detection-filter tint parity */
    }
  }

  return wrapped(...args);
}
