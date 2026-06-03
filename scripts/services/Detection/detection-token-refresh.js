import {
  capturePendingMovementDetectionFilterState,
  forcePendingMovementTokenInvisible,
  hasActivePendingTokenMovement,
  hasActivePendingMovementVisibilityOwnershipForToken,
  hasPendingRenderState,
  isPendingMovementDragPreviewOnlyActive,
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
  targetHasDetectionBlockingStoredVisibilityState,
  targetIsRenderHiddenForCurrentViewObserver,
  targetMustStayHiddenDuringPendingMovement,
} from '../PendingMovement/pending-token-movement.js';
import {
  capturePendingMovementDetectionFilterVisualState,
  clearDetectionFilterVisuals,
  restorePendingMovementDetectionFilterVisualState,
  tokenHasDetectionFilterMeshVisual,
  tokenHasDetectionFilterVisual,
} from '../PendingMovement/pending-movement-detection-filter-visuals.js';
import { shouldBypassAvsForGmVision } from '../gm-vision-bypass.js';

const CORE_ANIMATION_TOKEN_VISIBILITY_THROTTLE_MS = 22;
const CORE_MOVEMENT_TOKEN_WRAPPER_BYPASS_GRACE_MS = 1000;
const CORE_MOVEMENT_TOKEN_SCAN_CACHE_MS = 16;
const coreAnimationTokenVisibilityRefreshTimes = new WeakMap();
let coreMovementTokenWrapperBypassUntil = 0;
let coreMovementActiveTokenScanCache = null;
let detectionSourceOwnerIdsCache = null;

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
  const tokenId = tokenDocumentId(token);
  if (!tokenId) return false;

  const now = Date.now();
  if (
    !detectionSourceOwnerIdsCache ||
    now - detectionSourceOwnerIdsCache.checkedAt >= CORE_MOVEMENT_TOKEN_SCAN_CACHE_MS
  ) {
    const ids = new Set();
    for (const source of [
      ...Array.from(canvas?.effects?.visionSources || [], sourceFromCollectionEntry),
      ...Array.from(canvas?.effects?.lightSources || [], sourceFromCollectionEntry),
    ]) {
      const sourceTokenId = tokenDocumentId(source?.object);
      if (sourceTokenId) ids.add(sourceTokenId);
    }
    detectionSourceOwnerIdsCache = { checkedAt: now, ids };
  }
  return detectionSourceOwnerIdsCache.ids.has(tokenId);
}

function tokenDrivesCurrentVisionPolygon(token) {
  if (!token) return false;
  if (token.controlled) return true;
  if (sameToken(canvas?.tokens?._draggedToken, token)) return true;
  return tokenOwnsDetectionSource(token);
}

function tokenHasActiveCoreMovement(token) {
  if (!token) return false;
  if (token.isDragged || sameToken(canvas?.tokens?._draggedToken, token)) return true;
  if (token._dragHandle !== undefined && token._dragHandle !== null) return true;
  const animation = token._animation || token.animation;
  if (!animation || animation.state === 'completed') return false;
  if (typeof animation === 'object' && Object.keys(animation).length === 0) return true;
  return !!animation.promise || !!animation.active || animation.state !== undefined;
}

function canvasHasActiveCoreTokenMovement() {
  const now = Date.now();
  if (
    coreMovementActiveTokenScanCache &&
    now - coreMovementActiveTokenScanCache.checkedAt < CORE_MOVEMENT_TOKEN_SCAN_CACHE_MS
  ) {
    if (coreMovementActiveTokenScanCache.active) {
      coreMovementTokenWrapperBypassUntil = now + CORE_MOVEMENT_TOKEN_WRAPPER_BYPASS_GRACE_MS;
      return true;
    }
    return now <= coreMovementTokenWrapperBypassUntil;
  }

  const active =
    !!canvas?.tokens?._draggedToken ||
    (canvas?.tokens?.placeables || []).some((token) => tokenHasActiveCoreMovement(token));
  coreMovementActiveTokenScanCache = { active, checkedAt: now };
  if (active) {
    coreMovementTokenWrapperBypassUntil = now + CORE_MOVEMENT_TOKEN_WRAPPER_BYPASS_GRACE_MS;
    return true;
  }
  return now <= coreMovementTokenWrapperBypassUntil;
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

function withPreservedDragPreviewDetectionVisuals(token, callback) {
  const hadDetectionFilterVisual = tokenHasDetectionFilterVisual(token);
  const state = capturePendingMovementDetectionFilterVisualState(token);
  const result = callback();
  if (
    hadDetectionFilterVisual ||
    !targetHasDetectionBlockingStoredVisibilityState(token) ||
    !tokenHasDetectionFilterVisual(token)
  ) {
    restorePendingMovementDetectionFilterVisualState(token, state);
  }
  return result;
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
  {
    handlesPendingMovementVisibility,
    hasDetectionFilterMeshVisual,
    hasDetectionFilterVisual,
    hasRenderLock,
    hasRenderState,
  },
) {
  if (hasDetectionFilterVisual || hasDetectionFilterMeshVisual) return 'full';
  if (tokenDrivesCurrentVisionPolygon(token)) return 'full';
  if (
    handlesPendingMovementVisibility &&
    (hasRenderLock || hasRenderState)
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

  if (isPendingMovementDragPreviewOnlyActive()) {
    return withPreservedDragPreviewDetectionVisuals(this, () => wrapped(...args));
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

  if (isPendingMovementDragPreviewOnlyActive()) {
    return withPreservedDragPreviewDetectionVisuals(this, () => wrapped(...args));
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

  if (isPendingMovementDragPreviewOnlyActive()) {
    return withPreservedDragPreviewDetectionVisuals(this, () => wrapped(...args));
  }

  const bypassActiveAtEntry = isPendingMovementCoreAnimationBypassActive();
  const hasDetectionFilterVisual = tokenHasDetectionFilterVisual(this);
  const hasDetectionFilterMeshVisual = tokenHasDetectionFilterMeshVisual(this);
  const hasRenderLock = isPendingMovementRenderLocked(this);
  const hasRenderState = hasPendingRenderState(this);
  if (
    isPendingMovementCoreAnimationPerceptionRefresh() &&
    !hasDetectionFilterVisual &&
    !hasDetectionFilterMeshVisual &&
    !hasRenderLock &&
    !hasRenderState
  ) {
    return wrapped(...args);
  }

  const pendingMovementActive = hasActivePendingTokenMovement();
  const activeCoreMovement = pendingMovementActive && canvasHasActiveCoreTokenMovement();
  if (
    activeCoreMovement &&
    !isPendingMovementCoreAnimationPerceptionRefresh() &&
    !hasDetectionFilterVisual &&
    !hasDetectionFilterMeshVisual &&
    !hasRenderLock &&
    !hasRenderState &&
    !hasActivePendingMovementVisibilityOwnershipForToken(this) &&
    !tokenDrivesCurrentVisionPolygon(this)
  ) {
    return wrapped(...args);
  }

  const handlesPendingMovementVisibility = shouldHandlePendingMovementCanvasVisibilityForToken(this);
  const suppressDetectionFilterVisuals = shouldSuppressPendingMovementDetectionFilterVisuals(this);
  const preserveDetectionFilterVisuals =
    !suppressDetectionFilterVisuals &&
    shouldPreservePendingMovementDetectionFilterVisuals(this);
  const primeDetectionFilterVisuals =
    !hasDetectionFilterMeshVisual && shouldPrimePendingMovementDetectionFilterVisuals(this);
  if (
    activeCoreMovement &&
    !isPendingMovementCoreAnimationPerceptionRefresh() &&
    !handlesPendingMovementVisibility &&
    !hasDetectionFilterVisual &&
    !hasDetectionFilterMeshVisual &&
    !suppressDetectionFilterVisuals &&
    !preserveDetectionFilterVisuals &&
    !primeDetectionFilterVisuals &&
    !targetIsRenderHiddenForCurrentViewObserver(this) &&
    !shouldTemporarilyForceTokenInvisible(this)
  ) {
    return wrapped(...args);
  }
  const coreAnimationRefreshMode = getCoreAnimationVisibilityRefreshMode(this, {
    handlesPendingMovementVisibility,
    hasDetectionFilterMeshVisual,
    hasDetectionFilterVisual,
    hasRenderLock,
    hasRenderState,
  });
  if (coreAnimationRefreshMode === 'skip') {
    return this.visible;
  }
  if (coreAnimationRefreshMode === 'core-only') {
    const result = wrapped(...args);
    try {
      if (shouldSuppressPendingMovementDetectionFilterVisuals(this)) {
        clearDetectionFilterVisuals(this);
      } else if (shouldPrimePendingMovementDetectionFilterVisuals(this)) {
        primePendingMovementDetectionFilterVisuals(this);
      }
    } catch {
      /* keep core visibility if prime check fails */
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

  if (
    !coalescePerception &&
    !hasDetectionFilterVisual &&
    !primeDetectionFilterVisuals &&
    !handlesPendingMovementVisibility
  ) {
    return refreshThenRestorePendingInvisible(this, () => wrapped(...args));
  }

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
      if (
        !this.detectionFilter &&
        !this._pvHiddenEcho &&
        tokenHasDetectionFilterMeshVisual(this) &&
        !primeDetectionFilterVisuals
      ) {
        clearDetectionFilterVisuals(this);
      }
    }
  } catch {
    /* keep Foundry visibility if guard fails */
  }

  return result;
}
