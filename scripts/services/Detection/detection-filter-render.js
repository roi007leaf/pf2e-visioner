import {
  primePendingMovementDetectionFilterVisuals,
  shouldHandlePendingMovementCanvasVisibilityForToken,
  shouldPrimePendingMovementDetectionFilterVisuals,
  withStableHiddenDetectionFilterAnimation,
  withSuppressedPendingMovementDetectionFilterRender,
} from '../PendingMovement/pending-movement-render-lock.js';
import { targetIsRenderHiddenForAnyObserver } from '../PendingMovement/pending-token-movement.js';
import { clearDetectionFilterVisuals } from '../PendingMovement/pending-movement-detection-filter-visuals.js';

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
