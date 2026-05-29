import {
  hasPendingMovementRenderWork,
  primePendingMovementDetectionFilterVisuals,
  shouldHandlePendingMovementCanvasVisibilityForToken,
  shouldPrimePendingMovementDetectionFilterVisuals,
  shouldSuppressPendingMovementDetectionFilterVisuals,
  withStableHiddenDetectionFilterAnimation,
  withSuppressedPendingMovementDetectionFilterRender,
} from '../PendingMovement/pending-movement-render-lock.js';
import {
  targetHasDetectionBlockingStoredVisibilityState,
  targetHasAnyHiddenAvsOverride,
  targetIsRenderHiddenForCurrentViewObserver,
} from '../PendingMovement/pending-token-movement.js';
import { clearDetectionFilterVisuals } from '../PendingMovement/pending-movement-detection-filter-visuals.js';
import { shouldBypassAvsForGmVision } from '../gm-vision-bypass.js';

function hideDetectionFilterMesh(token) {
  const mesh = token?.detectionFilterMesh;
  if (!mesh) return;

  try {
    if ('visible' in mesh) mesh.visible = false;
    if ('renderable' in mesh) mesh.renderable = false;
    if ('alpha' in mesh) mesh.alpha = 0;
  } catch {
    /* best-effort */
  }
}

export function wrapTokenRenderDetectionFilter(wrapped, ...args) {
  if (shouldBypassAvsForGmVision()) return wrapped(...args);

  if (targetIsRenderHiddenForCurrentViewObserver(this)) {
    return withStableHiddenDetectionFilterAnimation(
      this,
      () => {
        hideDetectionFilterMesh(this);
        const result = wrapped(...args);
        hideDetectionFilterMesh(this);
        return result;
      },
      { force: true },
    );
  }

  const shouldClearCoreAddedDetectionFilter =
    !this?.detectionFilter &&
    !this?.detectionFilterMesh &&
    hasPendingMovementRenderWork() &&
    targetHasDetectionBlockingStoredVisibilityState(this);
  if (shouldClearCoreAddedDetectionFilter) {
    const result = wrapped(...args);
    clearDetectionFilterVisuals(this);
    return result;
  }

  if (
    !this?.detectionFilter &&
    !this?.detectionFilterMesh &&
    !shouldHandlePendingMovementCanvasVisibilityForToken(this)
  ) {
    if (shouldSuppressPendingMovementDetectionFilterVisuals(this)) {
      return withSuppressedPendingMovementDetectionFilterRender(this, () => wrapped(...args));
    }
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
