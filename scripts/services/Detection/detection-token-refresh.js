import {
  capturePendingMovementDetectionFilterState,
  forcePendingMovementTokenInvisible,
  primePendingMovementDetectionFilterVisuals,
  restorePendingMovementDetectionFilterState,
  restorePendingMovementTokenRendering,
  shouldPreservePendingMovementDetectionFilterVisuals,
  shouldPrimePendingMovementDetectionFilterVisuals,
  shouldSuppressPendingMovementDetectionFilterVisuals,
  shouldTemporarilyForceTokenInvisible,
  withPreservedPendingMovementDetectionFilterVisuals,
  withSuppressedPendingMovementDetectionFilterVisuals,
} from '../PendingMovement/pending-movement-render-lock.js';

export function wrapTokenRefreshVisibility(wrapped, ...args) {
  const suppressDetectionFilterVisuals = shouldSuppressPendingMovementDetectionFilterVisuals(this);
  const preserveDetectionFilterVisuals =
    !suppressDetectionFilterVisuals &&
    shouldPreservePendingMovementDetectionFilterVisuals(this);
  const primeDetectionFilterVisuals =
    !suppressDetectionFilterVisuals &&
    shouldPrimePendingMovementDetectionFilterVisuals(this);
  if (primeDetectionFilterVisuals) {
    primePendingMovementDetectionFilterVisuals(this);
  }
  const detectionFilterState = capturePendingMovementDetectionFilterState(this);
  const result = suppressDetectionFilterVisuals
    ? withSuppressedPendingMovementDetectionFilterVisuals(this, () => wrapped(...args))
    : preserveDetectionFilterVisuals
      ? withPreservedPendingMovementDetectionFilterVisuals(this, () => wrapped(...args))
      : wrapped(...args);
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
