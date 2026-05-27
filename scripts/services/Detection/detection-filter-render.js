import {
  primePendingMovementDetectionFilterVisuals,
  shouldHandlePendingMovementCanvasVisibilityForToken,
  shouldPrimePendingMovementDetectionFilterVisuals,
  withStableHiddenDetectionFilterAnimation,
  withSuppressedPendingMovementDetectionFilterRender,
} from '../PendingMovement/pending-movement-render-lock.js';
import {
  targetHasAnyHiddenAvsOverride,
  targetIsRenderHiddenForCurrentViewObserver,
} from '../PendingMovement/pending-token-movement.js';
import { clearDetectionFilterVisuals } from '../PendingMovement/pending-movement-detection-filter-visuals.js';

export function wrapTokenRenderDetectionFilter(wrapped, ...args) {
  if (targetIsRenderHiddenForCurrentViewObserver(this)) {
    const mesh = this?.detectionFilterMesh;
    if (mesh) {
      try {
        if ('visible' in mesh) mesh.visible = false;
        if ('renderable' in mesh) mesh.renderable = false;
        if ('alpha' in mesh) mesh.alpha = 0;
      } catch {
        /* best-effort */
      }
    }
    return wrapped(...args);
  }

  if (
    !this?.detectionFilter &&
    !this?.detectionFilterMesh &&
    !shouldHandlePendingMovementCanvasVisibilityForToken(this)
  ) {
    return wrapped(...args);
  }

  if (shouldPrimePendingMovementDetectionFilterVisuals(this)) {
    primePendingMovementDetectionFilterVisuals(this);
  }
  if (targetHasAnyHiddenAvsOverride(this)) {
    return withStableHiddenDetectionFilterAnimation(this, () => wrapped(...args));
  }
  return withStableHiddenDetectionFilterAnimation(this, () =>
    withSuppressedPendingMovementDetectionFilterRender(this, () => wrapped(...args)),
  );
}
