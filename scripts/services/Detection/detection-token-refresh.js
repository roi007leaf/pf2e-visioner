import {
  capturePendingMovementDetectionFilterState,
  forcePendingMovementTokenInvisible,
  hasActivePendingTokenMovement,
  hasPendingRenderState,
  isPendingMovementCoreAnimationBypassActive,
  isPendingMovementCoreAnimationPerceptionRefresh,
  isPendingMovementRenderLocked,
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
  targetIsRenderHiddenForCurrentViewObserver,
  targetMustStayHiddenDuringPendingMovement,
} from '../PendingMovement/pending-token-movement.js';
import {
  clearDetectionFilterVisuals,
  tokenHasDetectionFilterMeshVisual,
  tokenHasDetectionFilterVisual,
} from '../PendingMovement/pending-movement-detection-filter-visuals.js';
import { shouldBypassAvsForGmVision } from '../gm-vision-bypass.js';

const CORE_ANIMATION_TOKEN_VISIBILITY_THROTTLE_MS = 22;
const coreAnimationTokenVisibilityRefreshTimes = new WeakMap();

function sourceFromCollectionEntry(entry) {
  return Array.isArray(entry) && entry.length === 2 ? entry[1] : entry;
}

function tokenDocumentId(token) {
  return token?.document?.id ?? token?.id ?? null;
}

function sameToken(a, b) {
  const aId = tokenDocumentId(a);
  const bId = tokenDocumentId(b);
  return !!aId && aId === bId;
}

function tokenOwnsDetectionSource(token) {
  if (!token) return false;
  const sources = [
    ...Array.from(canvas?.effects?.visionSources || [], sourceFromCollectionEntry),
    ...Array.from(canvas?.effects?.lightSources || [], sourceFromCollectionEntry),
  ];
  return sources.some((source) => sameToken(source?.object, token));
}

function tokenDrivesCurrentVisionPolygon(token) {
  if (!token) return false;
  if (token.controlled) return true;
  if (sameToken(canvas?.tokens?._draggedToken, token)) return true;
  return tokenOwnsDetectionSource(token);
}

function restoreRenderLockForGmVisionBypass(token) {
  try {
    restorePendingMovementTokenRendering(token, {
      ignoreObservedGrace: true,
      ignoreObserverLocks: true,
    });
  } catch {
    /* keep Foundry state if bypass restore fails */
  }
}

function syncCurrentViewRenderHiddenState(token) {
  if (
    targetMustStayHiddenDuringPendingMovement(token) ||
    targetIsRenderHiddenForCurrentViewObserver(token)
  ) {
    forcePendingMovementTokenInvisible(token);
    clearDetectionFilterVisuals(token);
    return true;
  }

  restorePendingMovementTokenRendering(token, { ignoreObservedGrace: true });
  return false;
}

function refreshThenRestorePendingInvisible(token, refreshWrapped) {
  const result = refreshWrapped();
  try {
    if (shouldTemporarilyForceTokenInvisible(token)) {
      forcePendingMovementTokenInvisible(token);
    } else if (shouldSuppressPendingMovementDetectionFilterVisuals(token)) {
      clearDetectionFilterVisuals(token);
    }
  } catch {
    /* keep Foundry visibility if guard fails */
  }
  return result;
}

function getCoreAnimationVisibilityRefreshMode(
  token,
  { handlesPendingMovementVisibility, hasDetectionFilterMeshVisual, hasDetectionFilterVisual },
) {
  if (hasDetectionFilterVisual || hasDetectionFilterMeshVisual) return 'full';
  if (tokenDrivesCurrentVisionPolygon(token)) return 'full';
  if (
    handlesPendingMovementVisibility &&
    (isPendingMovementRenderLocked(token) || hasPendingRenderState(token))
  ) {
    return 'full';
  }
  if (
    !isPendingMovementCoreAnimationPerceptionRefresh()
  ) {
    return isPendingMovementCoreAnimationBypassActive() ? 'core-only' : 'full';
  }

  const now = Date.now();
  const lastRefreshAt =
    coreAnimationTokenVisibilityRefreshTimes.get(token) ?? Number.NEGATIVE_INFINITY;
  if (now < lastRefreshAt) {
    coreAnimationTokenVisibilityRefreshTimes.delete(token);
  } else if (now - lastRefreshAt < CORE_ANIMATION_TOKEN_VISIBILITY_THROTTLE_MS) {
    return 'skip';
  }
  coreAnimationTokenVisibilityRefreshTimes.set(token, now);
  return 'core-only';
}

export function wrapTokenRefreshState(wrapped, ...args) {
  if (shouldBypassAvsForGmVision()) {
    restoreRenderLockForGmVisionBypass(this);
    return wrapped(...args);
  }

  const result = wrapped(...args);
  try {
    syncCurrentViewRenderHiddenState(this);
  } catch {
    /* keep Foundry state if guard fails */
  }
  return result;
}

export function wrapTokenApplyRenderFlags(wrapped, ...args) {
  if (shouldBypassAvsForGmVision()) {
    restoreRenderLockForGmVisionBypass(this);
    return wrapped(...args);
  }

  const result = wrapped(...args);
  try {
    syncCurrentViewRenderHiddenState(this);
  } catch {
    /* keep Foundry render flags if guard fails */
  }
  return result;
}

export function wrapTokenRefreshVisibility(wrapped, ...args) {
  if (shouldBypassAvsForGmVision()) {
    restoreRenderLockForGmVisionBypass(this);
    return wrapped(...args);
  }

  const bypassActiveAtEntry = isPendingMovementCoreAnimationBypassActive();
  const hasDetectionFilterVisual = tokenHasDetectionFilterVisual(this);
  const hasDetectionFilterMeshVisual = tokenHasDetectionFilterMeshVisual(this);
  const handlesPendingMovementVisibility = shouldHandlePendingMovementCanvasVisibilityForToken(this);
  const coreAnimationRefreshMode = getCoreAnimationVisibilityRefreshMode(this, {
    handlesPendingMovementVisibility,
    hasDetectionFilterMeshVisual,
    hasDetectionFilterVisual,
  });
  if (coreAnimationRefreshMode === 'skip') {
    return this.visible;
  }
  if (coreAnimationRefreshMode === 'core-only') {
    const result = wrapped(...args);
    try {
      if (
        handlesPendingMovementVisibility &&
        this.visible === false &&
        !this.document?.hidden &&
        !targetIsRenderHiddenForCurrentViewObserver(this)
      ) {
        this.visible = true;
      }
    } catch {
      /* keep Foundry visibility if guard fails */
    }
    return result;
  }

  if (bypassActiveAtEntry && !hasDetectionFilterVisual && !hasDetectionFilterMeshVisual) {
    if (!handlesPendingMovementVisibility) {
      return wrapped(...args);
    }

    const result = wrapped(...args);
    try {
      if (this.visible) {
        if (
          shouldTemporarilyForceTokenInvisible(this) ||
          targetIsRenderHiddenForCurrentViewObserver(this)
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

  if (targetIsRenderHiddenForCurrentViewObserver(this)) {
    const result = withSuppressedPendingMovementDetectionFilterVisuals(this, () => wrapped(...args));
    try {
      syncCurrentViewRenderHiddenState(this);
    } catch {
      /* keep Foundry visibility if guard fails */
    }
    return result;
  }

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
