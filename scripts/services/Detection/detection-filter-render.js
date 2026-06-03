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
  hasActivePendingMovementVisibilityOwnershipForToken,
  hasActivePendingTokenMovement,
  isPendingMovementCoreAnimationBypassActive,
  isPendingMovementDragPreviewOnlyActive,
  targetHasDetectionBlockingStoredVisibilityState,
  targetHasAnyHiddenAvsOverride,
  targetIsRenderHiddenForCurrentViewObserver,
} from '../PendingMovement/pending-token-movement.js';
import {
  capturePendingMovementDetectionFilterVisualState,
  clearDetectionFilterVisuals,
  restorePendingMovementDetectionFilterVisualState,
  sanitizeCanvasDetectionFilterLists,
  sanitizeDetectionFilterList,
  tokenHasDetectionFilterVisual,
} from '../PendingMovement/pending-movement-detection-filter-visuals.js';
import { shouldBypassAvsForGmVision } from '../gm-vision-bypass.js';

const CANVAS_FILTER_SANITIZE_INTERVAL_MS = 100;

let lastCanvasDetectionFilterSanitizeAt = Number.NEGATIVE_INFINITY;

function nowMs() {
  return globalThis.performance?.now?.() ?? Date.now();
}

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

function withFrozenDragPreviewDetectionFilterAnimation(token, callback) {
  const filter = token?.detectionFilter;
  if (!filter || !('animated' in filter)) return callback();

  const wasAnimated = filter.animated;
  try {
    filter.animated = false;
    return callback();
  } finally {
    filter.animated = wasAnimated;
  }
}

function isActualTokenDragActive() {
  return (
    !!canvas?.tokens?._draggedToken ||
    (canvas?.tokens?.placeables || []).some((token) => token?.isDragged)
  );
}

function sanitizeDetectionFilterListsForRender(token, { tokenChanged = null } = {}) {
  const changed = tokenChanged ?? sanitizeDetectionFilterList(token);
  const now = nowMs();
  if (
    changed ||
    now - lastCanvasDetectionFilterSanitizeAt >= CANVAS_FILTER_SANITIZE_INTERVAL_MS
  ) {
    sanitizeCanvasDetectionFilterLists();
    lastCanvasDetectionFilterSanitizeAt = now;
  }
  return changed;
}

export function wrapTokenRenderDetectionFilter(wrapped, ...args) {
  try {
    const tokenSanitizedAtEntry = sanitizeDetectionFilterList(this);

    if (shouldBypassAvsForGmVision()) {
      if (tokenSanitizedAtEntry) {
        sanitizeCanvasDetectionFilterLists();
        lastCanvasDetectionFilterSanitizeAt = nowMs();
      }
      return wrapped(...args);
    }

    if (isPendingMovementDragPreviewOnlyActive()) {
      sanitizeDetectionFilterListsForRender(this, { tokenChanged: tokenSanitizedAtEntry });
      const hadDetectionFilterVisual = tokenHasDetectionFilterVisual(this);
      const visualState = capturePendingMovementDetectionFilterVisualState(this);
      try {
        const render = () => wrapped(...args);
        return isActualTokenDragActive()
          ? withFrozenDragPreviewDetectionFilterAnimation(this, render)
          : render();
      } finally {
        if (hadDetectionFilterVisual) {
          restorePendingMovementDetectionFilterVisualState(this, visualState);
        } else if (
          !targetHasDetectionBlockingStoredVisibilityState(this) ||
          !tokenHasDetectionFilterVisual(this)
        ) {
          restorePendingMovementDetectionFilterVisualState(this, visualState);
          clearDetectionFilterVisuals(this);
        }
      }
    }

    const hasDetectionFilterVisualAtEntry = tokenHasDetectionFilterVisual(this);
    if (
      hasActivePendingTokenMovement() &&
      isPendingMovementCoreAnimationBypassActive() &&
      !hasDetectionFilterVisualAtEntry
    ) {
      if (tokenSanitizedAtEntry) {
        sanitizeCanvasDetectionFilterLists();
        lastCanvasDetectionFilterSanitizeAt = nowMs();
      }
      return wrapped(...args);
    }

    if (
      hasActivePendingTokenMovement() &&
      !hasDetectionFilterVisualAtEntry &&
      !hasActivePendingMovementVisibilityOwnershipForToken(this)
    ) {
      if (tokenSanitizedAtEntry) {
        sanitizeCanvasDetectionFilterLists();
        lastCanvasDetectionFilterSanitizeAt = nowMs();
      }
      return wrapped(...args);
    }
    sanitizeDetectionFilterListsForRender(this, { tokenChanged: tokenSanitizedAtEntry });

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
      !hasDetectionFilterVisualAtEntry &&
      hasPendingMovementRenderWork() &&
      targetHasDetectionBlockingStoredVisibilityState(this);
    if (shouldClearCoreAddedDetectionFilter) {
      const result = wrapped(...args);
      clearDetectionFilterVisuals(this);
      return result;
    }

    if (
      !hasDetectionFilterVisualAtEntry &&
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
  } finally {
    sanitizeDetectionFilterListsForRender(this);
  }
}
