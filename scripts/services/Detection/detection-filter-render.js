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
  pendingObserverCanSenseTargetImprecisely,
  targetHasDetectionBlockingStoredVisibilityState,
  targetHasAnyHiddenAvsOverride,
  targetIsRenderHiddenForCurrentViewObserver,
  targetQualifiesForLiveImpreciseSoundwave,
  targetShouldKeepCoreObservedHiddenSoundwave,
  targetYieldsToLiveSightDuringPendingMovement,
} from '../PendingMovement/pending-token-movement.js';
import { clearDetectionFilterVisuals } from '../PendingMovement/pending-movement-detection-filter-visuals.js';
import { shouldBypassAvsForGmVision } from '../gm-vision-bypass.js';

function tokenIdOf(tokenOrDoc) {
  return tokenOrDoc?.document?.id || tokenOrDoc?.id || null;
}

function currentViewObservers() {
  const observers = [];
  if (canvas?.tokens?._draggedToken) observers.push(canvas.tokens._draggedToken);
  for (const observer of canvas?.tokens?.controlled || []) {
    if (observer) observers.push(observer);
  }
  return observers;
}

function hasObserverAvsOverride(observer, target) {
  const observerId = tokenIdOf(observer);
  if (!observerId) return false;
  const flags = target?.document?.flags?.['pf2e-visioner'];
  return !!flags?.[`avs-override-from-${observerId}`];
}

function shouldKeepCoreAddedLiveImpreciseSoundwave(token) {
  if (!token?.detectionFilter) return false;
  if (targetShouldKeepCoreObservedHiddenSoundwave(token)) return true;
  if (!targetHasDetectionBlockingStoredVisibilityState(token)) return false;

  const targetId = tokenIdOf(token);
  const seen = new Set();
  for (const observer of currentViewObservers()) {
    const observerId = tokenIdOf(observer);
    if (!observerId || observerId === targetId || seen.has(observerId)) continue;
    seen.add(observerId);
    if (hasObserverAvsOverride(observer, token)) continue;
    if (pendingObserverCanSenseTargetImprecisely(observer, token)) return true;
  }
  return false;
}

function showDetectionFilterMesh(token) {
  const mesh = token?.detectionFilterMesh;
  if (!mesh) return;

  try {
    if ('visible' in mesh) mesh.visible = true;
    if ('renderable' in mesh) mesh.renderable = true;
    if ('alpha' in mesh) mesh.alpha = 1;
  } catch {
    /* best-effort */
  }
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

export function wrapTokenRenderDetectionFilter(wrapped, ...args) {
  if (shouldBypassAvsForGmVision()) return wrapped(...args);

  if (targetIsRenderHiddenForCurrentViewObserver(this)) {
    return withStableHiddenDetectionFilterAnimation(
      this,
      () => {
        hideDetectionFilterMesh(this);
        const result = wrapped(...args);
        if (shouldKeepCoreAddedLiveImpreciseSoundwave(this)) {
          showDetectionFilterMesh(this);
          return result;
        }
        hideDetectionFilterMesh(this);
        return result;
      },
      { force: true },
    );
  }

  if (
    hasPendingMovementRenderWork() &&
    targetHasDetectionBlockingStoredVisibilityState(this) &&
    !targetQualifiesForLiveImpreciseSoundwave(this) &&
    targetYieldsToLiveSightDuringPendingMovement(this)
  ) {
    const result = wrapped(...args);
    clearDetectionFilterVisuals(this);
    return result;
  }

  const shouldClearCoreAddedDetectionFilter =
    !this?.detectionFilter &&
    !this?.detectionFilterMesh &&
    hasPendingMovementRenderWork() &&
    targetHasDetectionBlockingStoredVisibilityState(this);
  if (shouldClearCoreAddedDetectionFilter) {
    const result = wrapped(...args);
    if (targetQualifiesForLiveImpreciseSoundwave(this)) {
      return result;
    }
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
  if (targetShouldKeepCoreObservedHiddenSoundwave(this)) {
    return withStableHiddenDetectionFilterAnimation(this, () => {
      const result = wrapped(...args);
      if (this?.detectionFilter) showDetectionFilterMesh(this);
      return result;
    });
  }
  return withStableHiddenDetectionFilterAnimation(this, () =>
    withSuppressedPendingMovementDetectionFilterRender(this, () => wrapped(...args)),
  );
}
