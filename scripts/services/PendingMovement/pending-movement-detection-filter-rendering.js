const SUPPRESSED_DETECTION_FILTER_RENDER_FILTER = Object.freeze({ enabled: false });
const CORE_DETECTION_FILTER_TINT = 0xffffff;

function getPropertyDescriptor(object, propertyName) {
  let target = object;
  while (target) {
    const descriptor = Object.getOwnPropertyDescriptor(target, propertyName);
    if (descriptor) return { descriptor, owner: target };
    target = Object.getPrototypeOf(target);
  }
  return null;
}

function suppressDetectionFilterProperty(token, { value = null } = {}) {
  if (!token) return null;

  const descriptor = Object.getOwnPropertyDescriptor(token, 'detectionFilter');
  try {
    Object.defineProperty(token, 'detectionFilter', {
      configurable: true,
      enumerable: descriptor?.enumerable ?? true,
      get() {
        return value;
      },
      set() {
        /* suppress transient core/PF2E detection filter during core-visible reveal */
      },
    });
  } catch {
    return null;
  }

  return () => {
    try {
      if (descriptor) {
        Object.defineProperty(token, 'detectionFilter', descriptor);
      } else {
        delete token.detectionFilter;
      }
    } catch {
      /* best-effort property restore */
    }
  };
}

function preserveDetectionFilterProperty(token, tokenHasDetectionFilterVisual) {
  if (!tokenHasDetectionFilterVisual?.(token)) return null;

  const descriptor = Object.getOwnPropertyDescriptor(token, 'detectionFilter');
  let value = descriptor?.get ? descriptor.get.call(token) : token.detectionFilter;
  const hadValue = !!value;
  if (!hadValue) return null;

  try {
    Object.defineProperty(token, 'detectionFilter', {
      configurable: true,
      enumerable: descriptor?.enumerable ?? true,
      get() {
        return descriptor?.get ? descriptor.get.call(this) : value;
      },
      set(next) {
        if (next == null || !hadValue) return;
        if (descriptor?.set) descriptor.set.call(this, next);
        else value = next;
      },
    });
  } catch {
    return null;
  }

  return () => {
    try {
      if (descriptor) {
        Object.defineProperty(
          token,
          'detectionFilter',
          Object.prototype.hasOwnProperty.call(descriptor, 'value')
            ? { ...descriptor, value }
            : descriptor,
        );
      } else {
        delete token.detectionFilter;
        if (hadValue && value) token.detectionFilter = value;
      }
    } catch {
      /* best-effort property restore */
    }
  };
}

function stabilizeCoreDetectionFilterTint(token) {
  const mesh = token?.mesh;
  if (!mesh) return null;

  const ownDescriptor = Object.getOwnPropertyDescriptor(mesh, 'tint') || null;
  const descriptorEntry = getPropertyDescriptor(mesh, 'tint');
  const descriptor = descriptorEntry?.descriptor || null;
  let tintValue = descriptor?.get
    ? descriptor.get.call(mesh)
    : Object.prototype.hasOwnProperty.call(descriptor || {}, 'value')
      ? descriptor.value
      : mesh.tint;
  const originalTint = tintValue;

  try {
    Object.defineProperty(mesh, 'tint', {
      configurable: true,
      enumerable: ownDescriptor?.enumerable ?? descriptor?.enumerable ?? true,
      get() {
        return descriptor?.get ? descriptor.get.call(this) : tintValue;
      },
      set(next) {
        if (next === CORE_DETECTION_FILTER_TINT && originalTint !== CORE_DETECTION_FILTER_TINT) {
          return;
        }
        if (descriptor?.set) descriptor.set.call(this, next);
        else tintValue = next;
      },
    });
  } catch {
    return null;
  }

  return () => {
    try {
      if (ownDescriptor) {
        Object.defineProperty(
          mesh,
          'tint',
          Object.prototype.hasOwnProperty.call(ownDescriptor, 'value')
            ? { ...ownDescriptor, value: tintValue }
            : ownDescriptor,
        );
      } else {
        delete mesh.tint;
      }
    } catch {
      /* best-effort tint restore */
    }
  };
}

function withHiddenPrimaryMesh(token, callback) {
  const mesh = token?.mesh;
  if (!mesh) return callback?.();

  const state = {
    visible: 'visible' in mesh ? mesh.visible : undefined,
    renderable: 'renderable' in mesh ? mesh.renderable : undefined,
    alpha: 'alpha' in mesh ? mesh.alpha : undefined,
  };

  try {
    if ('visible' in mesh) mesh.visible = false;
    if ('renderable' in mesh) mesh.renderable = false;
    if ('alpha' in mesh) mesh.alpha = 0;
    return callback?.();
  } finally {
    try {
      if ('visible' in mesh && state.visible !== undefined) mesh.visible = state.visible;
      if ('renderable' in mesh && state.renderable !== undefined) mesh.renderable = state.renderable;
      if ('alpha' in mesh && state.alpha !== undefined) mesh.alpha = state.alpha;
    } catch {
      /* best-effort mesh restore */
    }
  }
}

export function createPendingMovementDetectionFilterRenderingController({
  capturePendingMovementDetectionFilterVisualState,
  clearDetectionFilterVisuals,
  currentSightLineSeesHiddenTargetDuringPendingMovement,
  getCurrentSightLineGraceContextForTarget,
  getCurrentViewObservers = () => [],
  getHiddenDetectionFilterPreservationContext,
  getObservedDetectionFilterSuppressionContext,
  getVisibleCoreGraceContextForTarget,
  hasObservedTransitionDetectionFilterSuppression,
  observedSoundwaveShouldWaitForCore,
  restorePendingMovementDetectionFilterVisualState,
  shouldAllowCoreHiddenSoundwaveForCurrentView,
  shouldPreserveHiddenSoundwaveForCurrentView,
  shouldTemporarilyForceTokenInvisible,
  tokenHasDetectionFilterMeshVisual,
  tokenHasDetectionFilterVisual,
} = {}) {
  function withSuppressedDetectionFilterProbe(token, callback, { clearWhenTruthy = false } = {}) {
    const detectionFilterState = capturePendingMovementDetectionFilterVisualState?.(token);
    const restoreDetectionFilterProperty = suppressDetectionFilterProperty(token);
    let completed = false;
    let result;
    try {
      result = callback?.();
      completed = true;
      return result;
    } finally {
      try {
        restoreDetectionFilterProperty?.();
      } finally {
        if (completed && clearWhenTruthy && result) {
          clearDetectionFilterVisuals?.(token);
        } else {
          restorePendingMovementDetectionFilterVisualState?.(token, detectionFilterState);
        }
      }
    }
  }

  function shouldSuppressPendingMovementDetectionFilterVisuals(
    token,
    { hasDetectionWork = null } = {},
  ) {
    if (!token?.document?.id) return false;
    if (getCurrentSightLineGraceContextForTarget?.(token)) return true;
    if (shouldPreserveHiddenSoundwaveForCurrentView?.(token)) return false;
    if (shouldAllowCoreHiddenSoundwaveForCurrentView?.(token)) return false;
    if (observedSoundwaveShouldWaitForCore?.(token)) return false;
    if (hasObservedTransitionDetectionFilterSuppression?.(token)) return true;
    if (getVisibleCoreGraceContextForTarget?.(token)) return true;
    if (currentSightLineSeesHiddenTargetDuringPendingMovement?.(token, { hasDetectionWork })) {
      return true;
    }
    if (shouldTemporarilyForceTokenInvisible?.(token, { hasDetectionWork })) return false;
    return !!(
      getVisibleCoreGraceContextForTarget?.(token) ||
      getObservedDetectionFilterSuppressionContext?.(token, { hasDetectionWork })
    );
  }

  function shouldPreservePendingMovementDetectionFilterVisuals(
    token,
    { hasDetectionWork = null } = {},
  ) {
    if (hasObservedTransitionDetectionFilterSuppression?.(token)) return false;
    if (!tokenHasDetectionFilterVisual?.(token)) return false;
    return !!getHiddenDetectionFilterPreservationContext?.(token, { hasDetectionWork });
  }

  function shouldPrimePendingMovementDetectionFilterVisuals(
    token,
    { hasDetectionWork = null } = {},
  ) {
    if (!token?.document?.id) return false;
    if (hasObservedTransitionDetectionFilterSuppression?.(token)) return false;
    if (tokenHasDetectionFilterMeshVisual?.(token) || !!token?._pvHiddenEcho) return false;
    if (!token?.detectionFilterMesh) return false;
    return !!getHiddenDetectionFilterPreservationContext?.(token, { hasDetectionWork });
  }

  function shouldStabilizeHiddenDetectionFilterAnimation(token) {
    if (!tokenHasDetectionFilterVisual?.(token)) return false;
    if (!token?.mesh) return false;
    return !!(
      getHiddenDetectionFilterPreservationContext?.(token) ||
      getObservedDetectionFilterSuppressionContext?.(token) ||
      shouldTemporarilyForceTokenInvisible?.(token, { hasDetectionWork: true })
    );
  }

  function withStableHiddenDetectionFilterAnimation(token, callback, { force = false } = {}) {
    if (!force && !shouldStabilizeHiddenDetectionFilterAnimation(token)) return callback?.();
    if (!tokenHasDetectionFilterVisual?.(token) || !token?.mesh) return callback?.();

    const restoreTint = stabilizeCoreDetectionFilterTint(token);
    try {
      return callback?.();
    } finally {
      restoreTint?.();
    }
  }

  function primePendingMovementDetectionFilterVisuals(
    token,
    { hasDetectionWork = null } = {},
  ) {
    if (!shouldPrimePendingMovementDetectionFilterVisuals(token, { hasDetectionWork })) {
      return false;
    }

    const detectionFilterMesh = token.detectionFilterMesh;
    try {
      if ('visible' in detectionFilterMesh) detectionFilterMesh.visible = true;
      if ('renderable' in detectionFilterMesh) detectionFilterMesh.renderable = true;
      if ('alpha' in detectionFilterMesh) detectionFilterMesh.alpha = 1;
      return true;
    } catch {
      return false;
    }
  }

  function withPreservedPendingMovementDetectionFilterVisuals(token, callback) {
    const restoreDetectionFilterProperty =
      preserveDetectionFilterProperty(token, tokenHasDetectionFilterVisual);
    try {
      return callback?.();
    } finally {
      restoreDetectionFilterProperty?.();
    }
  }

  function withSuppressedPendingMovementDetectionFilterVisuals(token, callback) {
    if (!shouldSuppressPendingMovementDetectionFilterVisuals(token)) return callback?.();

    const restoreDetectionFilterProperty = suppressDetectionFilterProperty(token);
    try {
      clearDetectionFilterVisuals?.(token);
      return callback?.();
    } finally {
      try {
        restoreDetectionFilterProperty?.();
      } finally {
        clearDetectionFilterVisuals?.(token);
      }
    }
  }

  function shouldSuppressPendingMovementDetectionFilterRender(token) {
    return (
      shouldSuppressPendingMovementDetectionFilterVisuals(token) ||
      (getCurrentViewObservers().length === 0 && tokenHasDetectionFilterVisual?.(token))
    );
  }

  function withSuppressedPendingMovementDetectionFilterRender(token, callback) {
    if (!shouldSuppressPendingMovementDetectionFilterRender(token)) return callback?.();

    const restoreDetectionFilterProperty = suppressDetectionFilterProperty(token, {
      value: SUPPRESSED_DETECTION_FILTER_RENDER_FILTER,
    });
    try {
      clearDetectionFilterVisuals?.(token);
      return withHiddenPrimaryMesh(token, callback);
    } finally {
      try {
        restoreDetectionFilterProperty?.();
      } finally {
        clearDetectionFilterVisuals?.(token);
      }
    }
  }

  return {
    primePendingMovementDetectionFilterVisuals,
    shouldPreservePendingMovementDetectionFilterVisuals,
    shouldPrimePendingMovementDetectionFilterVisuals,
    shouldStabilizeHiddenDetectionFilterAnimation,
    shouldSuppressPendingMovementDetectionFilterVisuals,
    withPreservedPendingMovementDetectionFilterVisuals,
    withStableHiddenDetectionFilterAnimation,
    withSuppressedDetectionFilterProbe,
    withSuppressedPendingMovementDetectionFilterRender,
    withSuppressedPendingMovementDetectionFilterVisuals,
  };
}
