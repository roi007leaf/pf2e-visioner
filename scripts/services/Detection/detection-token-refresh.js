import {
  capturePendingMovementDetectionFilterState,
  forcePendingMovementTokenInvisible,
  hasActivePendingTokenMovement,
  isPendingMovementCoreAnimationBypassActive,
  isPendingMovementCoreAnimationPerceptionRefresh,
  primePendingMovementDetectionFilterVisuals,
  restorePendingMovementDetectionFilterState,
  restorePendingMovementTokenRendering,
  shouldPreservePendingMovementDetectionFilterVisuals,
  shouldPrimePendingMovementDetectionFilterVisuals,
  shouldCoalescePendingMovementRefreshVisibilityPerception,
  shouldHandlePendingMovementCanvasVisibilityForToken,
  shouldSuppressPendingMovementDetectionFilterVisuals,
  shouldTemporarilyForceTokenInvisible,
  withCoalescedPendingMovementPerceptionUpdates,
  withPreservedPendingMovementDetectionFilterVisuals,
  withSuppressedPendingMovementDetectionFilterVisuals,
} from '../PendingMovement/pending-movement-render-lock.js';
import {
  tokenHasDetectionFilterMeshVisual,
  tokenHasDetectionFilterVisual,
} from '../PendingMovement/pending-movement-detection-filter-visuals.js';

export function wrapTokenRefreshVisibility(wrapped, ...args) {
  if (isPendingMovementCoreAnimationBypassActive()) {
    return wrapped(...args);
  }

  const handlesPendingMovementVisibility = shouldHandlePendingMovementCanvasVisibilityForToken(this);
  const coalescePerception =
    shouldCoalescePendingMovementRefreshVisibilityPerception(this) ||
    handlesPendingMovementVisibility;
  if (
    (isPendingMovementCoreAnimationPerceptionRefresh() ||
      isPendingMovementCoreAnimationBypassActive()) &&
    !coalescePerception &&
    !handlesPendingMovementVisibility
  ) {
    return wrapped(...args);
  }

  const hasDetectionFilterVisual = tokenHasDetectionFilterVisual(this);
  const hasDetectionFilterMeshVisual = tokenHasDetectionFilterMeshVisual(this);
  if (
    hasActivePendingTokenMovement() &&
    !coalescePerception &&
    !handlesPendingMovementVisibility &&
    !hasDetectionFilterVisual
  ) {
    return wrapped(...args);
  }

  const primeDetectionFilterVisuals =
    !hasDetectionFilterMeshVisual && shouldPrimePendingMovementDetectionFilterVisuals(this);
  if (
    !coalescePerception &&
    !hasDetectionFilterVisual &&
    !primeDetectionFilterVisuals &&
    !handlesPendingMovementVisibility
  ) {
    return wrapped(...args);
  }

  const suppressDetectionFilterVisuals = shouldSuppressPendingMovementDetectionFilterVisuals(this);
  const preserveDetectionFilterVisuals =
    !suppressDetectionFilterVisuals &&
    shouldPreservePendingMovementDetectionFilterVisuals(this);
  if (primeDetectionFilterVisuals) {
    primePendingMovementDetectionFilterVisuals(this);
  }
  const detectionFilterState = capturePendingMovementDetectionFilterState(this);
  const refreshWrapped = () =>
    coalescePerception
      ? withCoalescedPendingMovementPerceptionUpdates(() => wrapped(...args))
      : wrapped(...args);
  const result = suppressDetectionFilterVisuals
    ? withSuppressedPendingMovementDetectionFilterVisuals(this, refreshWrapped)
    : preserveDetectionFilterVisuals
      ? withPreservedPendingMovementDetectionFilterVisuals(this, refreshWrapped)
      : refreshWrapped();
  try {
    if (shouldTemporarilyForceTokenInvisible(this)) {
      forcePendingMovementTokenInvisible(this);
    } else {
      restorePendingMovementTokenRendering(this);
      if (suppressDetectionFilterVisuals) {
        withSuppressedPendingMovementDetectionFilterVisuals(this, () => undefined);
      } else {
        const nativeRecomputedDetectionFilter =
          (preserveDetectionFilterVisuals || primeDetectionFilterVisuals) &&
          detectionFilterState &&
          this.detectionFilter &&
          this.detectionFilter !== detectionFilterState.detectionFilter;
        if (!nativeRecomputedDetectionFilter) {
          restorePendingMovementDetectionFilterState(this, detectionFilterState);
        }
        if (primeDetectionFilterVisuals) {
          primePendingMovementDetectionFilterVisuals(this);
        }
      }
    }
  } catch {
    /* keep Foundry visibility if guard fails */
  }

  return result;
}
