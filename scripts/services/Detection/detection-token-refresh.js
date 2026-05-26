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
  targetIsRenderHiddenForAnyObserver,
  targetMustStayHiddenDuringPendingMovement,
} from '../PendingMovement/pending-token-movement.js';
import {
  clearDetectionFilterVisuals,
  tokenHasDetectionFilterMeshVisual,
  tokenHasDetectionFilterVisual,
} from '../PendingMovement/pending-movement-detection-filter-visuals.js';

function refreshThenRestorePendingInvisible(token, refreshWrapped) {
  const result = refreshWrapped();
  try {
    if (shouldTemporarilyForceTokenInvisible(token)) {
      forcePendingMovementTokenInvisible(token);
    }
  } catch {
    /* keep Foundry visibility if guard fails */
  }
  return result;
}

export function wrapTokenRefreshState(wrapped, ...args) {
  const result = wrapped(...args);
  try {
    if (targetMustStayHiddenDuringPendingMovement(this)) {
      forcePendingMovementTokenInvisible(this);
      clearDetectionFilterVisuals(this);
    }
  } catch {
    /* keep Foundry state if guard fails */
  }
  return result;
}

export function wrapTokenApplyRenderFlags(wrapped, ...args) {
  const result = wrapped(...args);
  try {
    if (targetMustStayHiddenDuringPendingMovement(this)) {
      forcePendingMovementTokenInvisible(this);
      clearDetectionFilterVisuals(this);
    }
  } catch {
    /* keep Foundry render flags if guard fails */
  }
  return result;
}

export function wrapTokenRefreshVisibility(wrapped, ...args) {
  const bypassActiveAtEntry = isPendingMovementCoreAnimationBypassActive();
  if (bypassActiveAtEntry && !tokenHasDetectionFilterVisual(this) && !tokenHasDetectionFilterMeshVisual(this)) {
    const result = wrapped(...args);
    try {
      if (this.visible) {
        if (
          shouldTemporarilyForceTokenInvisible(this) ||
          targetIsRenderHiddenForAnyObserver(this)
        ) {
          forcePendingMovementTokenInvisible(this);
          clearDetectionFilterVisuals(this);
        } else {
          restorePendingMovementTokenRendering(this);
        }
      }
    } catch {
      /* keep Foundry visibility if guard fails */
    }
    return result;
  }

  if (targetIsRenderHiddenForAnyObserver(this)) {
    const result = withSuppressedPendingMovementDetectionFilterVisuals(this, () => wrapped(...args));
    try {
      if (this.visible) {
        forcePendingMovementTokenInvisible(this);
        clearDetectionFilterVisuals(this);
      }
    } catch {
      /* keep Foundry visibility if guard fails */
    }
    return result;
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
    return refreshThenRestorePendingInvisible(this, () => wrapped(...args));
  }

  const primeDetectionFilterVisuals =
    !hasDetectionFilterMeshVisual && shouldPrimePendingMovementDetectionFilterVisuals(this);
  if (
    !coalescePerception &&
    !hasDetectionFilterVisual &&
    !primeDetectionFilterVisuals &&
    !handlesPendingMovementVisibility
  ) {
    return refreshThenRestorePendingInvisible(this, () => wrapped(...args));
  }

  const suppressDetectionFilterVisuals = shouldSuppressPendingMovementDetectionFilterVisuals(this);
  const preserveDetectionFilterVisuals =
    !suppressDetectionFilterVisuals &&
    shouldPreservePendingMovementDetectionFilterVisuals(this);
  const detectionFilterState = capturePendingMovementDetectionFilterState(this);
  if (primeDetectionFilterVisuals) {
    primePendingMovementDetectionFilterVisuals(this);
  }
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
        const keepPrimedDetectionFilterMesh = primeDetectionFilterVisuals && this.detectionFilter;
        if (keepPrimedDetectionFilterMesh) {
          primePendingMovementDetectionFilterVisuals(this);
        } else if (!nativeRecomputedDetectionFilter && detectionFilterState) {
          restorePendingMovementDetectionFilterState(this, detectionFilterState);
        } else if (!nativeRecomputedDetectionFilter && primeDetectionFilterVisuals) {
          clearDetectionFilterVisuals(this);
        }
        if (nativeRecomputedDetectionFilter && this.detectionFilter) {
          primePendingMovementDetectionFilterVisuals(this);
        }
      }
      if (!this.detectionFilter && !this._pvHiddenEcho && tokenHasDetectionFilterMeshVisual(this)) {
        clearDetectionFilterVisuals(this);
      }
    }
  } catch {
    /* keep Foundry visibility if guard fails */
  }

  return result;
}
