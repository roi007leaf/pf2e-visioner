import {
  primePendingMovementDetectionFilterVisuals,
  shouldHandlePendingMovementCanvasVisibilityForToken,
  shouldPrimePendingMovementDetectionFilterVisuals,
  withStableHiddenDetectionFilterAnimation,
  withSuppressedPendingMovementDetectionFilterRender,
} from '../PendingMovement/pending-movement-render-lock.js';

export function wrapTokenRenderDetectionFilter(wrapped, ...args) {
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
  return withStableHiddenDetectionFilterAnimation(this, () =>
    withSuppressedPendingMovementDetectionFilterRender(this, () => wrapped(...args)),
  );
}
