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
  targetQualifiesForLivePreciseNonVisualDetection,
  targetIsRenderHiddenForCurrentViewObserver,
  targetMustStayHiddenDuringPendingMovement,
} from '../PendingMovement/pending-token-movement.js';
import {
  clearDetectionFilterVisuals,
  tokenHasDetectionFilterMeshVisual,
  tokenHasDetectionFilterVisual,
} from '../PendingMovement/pending-movement-detection-filter-visuals.js';
import { shouldBypassAvsForGmVision } from '../gm-vision-bypass.js';
import { isTokenBlinded } from './detection-visibility-context.js';

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

function currentUserOwnsToken(token) {
  const user = game?.user;
  if (!user || user.isGM || !token) return false;

  try {
    if (token.document?.testUserPermission?.(user, 'OWNER')) return true;
  } catch {
    /* fall through to local ownership flags */
  }

  const ownerLevel = Number(globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3);
  const ownershipLevel =
    token.document?.ownership?.[user.id] ??
    token.actor?.ownership?.[user.id] ??
    token.document?.actor?.ownership?.[user.id] ??
    null;
  return (
    token.isOwner === true ||
    token.document?.isOwner === true ||
    token.actor?.isOwner === true ||
    token.document?.actor?.isOwner === true ||
    Number(ownershipLevel ?? 0) >= ownerLevel
  );
}

function shouldRestorePlayerOwnedBlindedDeselectRendering(token) {
  if (!token?.document?.id) return false;
  if (game?.user?.isGM) return false;
  if (token.controlled) return false;
  if ((canvas?.tokens?.controlled?.length ?? 0) > 0) return false;
  if (token.document?.hidden) return false;
  if (!isTokenBlinded(token)) return false;
  if (!currentUserOwnsToken(token)) return false;
  if (targetMustStayHiddenDuringPendingMovement(token)) return false;
  if (targetIsRenderHiddenForCurrentViewObserver(token)) return false;
  return true;
}

function restorePlayerOwnedBlindedDeselectRendering(token) {
  if (!shouldRestorePlayerOwnedBlindedDeselectRendering(token)) return false;

  try {
    if ('visible' in token) token.visible = true;
    token.renderable = true;
    if (token.mesh) {
      if ('visible' in token.mesh) token.mesh.visible = true;
      if ('renderable' in token.mesh) token.mesh.renderable = true;
      if ('alpha' in token.mesh && Number(token.mesh.alpha) <= 0) token.mesh.alpha = 1;
    }
    clearDetectionFilterVisuals(token);
    return true;
  } catch {
    return false;
  }
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

function restoreLivePreciseNonVisualRendering(token) {
  if (!targetQualifiesForLivePreciseNonVisualDetection(token)) return false;
  if (token?.document?.hidden) return false;

  try {
    if ('visible' in token) token.visible = true;
    token.renderable = true;
    if (token.mesh) {
      if ('visible' in token.mesh) token.mesh.visible = true;
      if ('renderable' in token.mesh) token.mesh.renderable = true;
      if ('alpha' in token.mesh && Number(token.mesh.alpha) <= 0) token.mesh.alpha = 1;
    }
    clearDetectionFilterVisuals(token);
    return true;
  } catch {
    return false;
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
  restoreLivePreciseNonVisualRendering(token);
  restorePlayerOwnedBlindedDeselectRendering(token);
  return false;
}

function refreshThenRestorePendingInvisible(token, refreshWrapped) {
  const result = refreshWrapped();
  try {
    if (restorePlayerOwnedBlindedDeselectRendering(token)) {
      return result;
    } else if (shouldTemporarilyForceTokenInvisible(token)) {
      forcePendingMovementTokenInvisible(token);
    } else if (restoreLivePreciseNonVisualRendering(token)) {
      return result;
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
    if (restorePlayerOwnedBlindedDeselectRendering(this)) {
      return result;
    }
    if (shouldTemporarilyForceTokenInvisible(this)) {
      forcePendingMovementTokenInvisible(this);
    } else {
      restorePendingMovementTokenRendering(this);
      restoreLivePreciseNonVisualRendering(this);
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
