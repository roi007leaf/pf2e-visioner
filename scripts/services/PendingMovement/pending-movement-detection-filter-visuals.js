export function captureDetectionFilterMeshState(token) {
  const mesh = token?.detectionFilterMesh;
  if (!mesh) return null;

  return {
    mesh,
    visible: 'visible' in mesh ? mesh.visible : undefined,
    renderable: 'renderable' in mesh ? mesh.renderable : undefined,
    alpha: 'alpha' in mesh ? mesh.alpha : undefined,
  };
}

export function capturePendingMovementDetectionFilterVisualState(token) {
  if (!token) return null;

  return {
    hadDetectionFilter: Object.prototype.hasOwnProperty.call(token, 'detectionFilter'),
    detectionFilter: token.detectionFilter,
    detectionFilterMesh: captureDetectionFilterMeshState(token),
    hiddenEcho: token._pvHiddenEcho,
    hiddenEchoVisible:
      token._pvHiddenEcho && 'visible' in token._pvHiddenEcho ? token._pvHiddenEcho.visible : undefined,
  };
}

export function restorePendingMovementDetectionFilterVisualState(token, state) {
  if (!token || !state) return false;

  try {
    if (state.hadDetectionFilter) {
      if (token.detectionFilter !== state.detectionFilter) {
        token.detectionFilter = state.detectionFilter;
      }
    } else if (Object.prototype.hasOwnProperty.call(token, 'detectionFilter')) {
      delete token.detectionFilter;
    }

    const meshState = state.detectionFilterMesh;
    const mesh = meshState?.mesh;
    if (mesh) {
      if ('visible' in mesh && meshState.visible !== undefined && mesh.visible !== meshState.visible) {
        mesh.visible = meshState.visible;
      }
      if ('renderable' in mesh && meshState.renderable !== undefined) {
        if (mesh.renderable !== meshState.renderable) mesh.renderable = meshState.renderable;
      }
      if ('alpha' in mesh && meshState.alpha !== undefined && mesh.alpha !== meshState.alpha) {
        mesh.alpha = meshState.alpha;
      }
    }

    if (state.hiddenEcho && 'visible' in state.hiddenEcho && state.hiddenEchoVisible !== undefined) {
      state.hiddenEcho.visible = state.hiddenEchoVisible;
    }
    if (!state.hiddenEcho && token._pvHiddenEcho) {
      token._pvHiddenEcho = null;
    }
    return true;
  } catch {
    return false;
  }
}

export function tokenHasDetectionFilterMeshVisual(token) {
  const mesh = token?.detectionFilterMesh;
  if (!mesh) return false;

  const alpha = Number(mesh.alpha);
  const activeSignal =
    mesh.visible === true ||
    mesh.renderable === true ||
    (Number.isFinite(alpha) && alpha > 0);
  const hiddenSignal =
    mesh.visible === false ||
    mesh.renderable === false ||
    (Number.isFinite(alpha) && alpha <= 0);

  return activeSignal && !hiddenSignal;
}

export function tokenHasDetectionFilterVisual(token) {
  return (
    !!token?.detectionFilter ||
    tokenHasDetectionFilterMeshVisual(token) ||
    !!token?._pvHiddenEcho
  );
}

export function sanitizeDetectionFilterList(token) {
  let changed = false;
  for (const mesh of [
    token?.mesh,
    token?.detectionFilterMesh,
    token?._pvHiddenEcho,
    token?.primary,
    token?.primarySprite,
  ]) {
    if (!Array.isArray(mesh?.filters)) continue;
    const filtered = mesh.filters.filter(Boolean);
    if (filtered.length === mesh.filters.length) continue;
    try {
      mesh.filters = filtered;
      changed = true;
    } catch {
      /* best effort */
    }
  }
  return changed;
}

export function sanitizeCanvasDetectionFilterLists(root = null) {
  let changed = false;
  const seen = new WeakSet();
  const scan = (object) => {
    if (!object || typeof object !== 'object' || seen.has(object)) return;
    seen.add(object);
    if (Array.isArray(object.filters)) {
      const filtered = object.filters.filter(Boolean);
      if (filtered.length !== object.filters.length) {
        try {
          object.filters = filtered;
          changed = true;
        } catch {
          /* best effort */
        }
      }
    }
    for (const child of object.children || []) scan(child);
  };
  if (root) scan(root);
  else {
    scan(globalThis.canvas?.primary);
    scan(globalThis.canvas?.stage);
  }
  return changed;
}

export function restorePendingMovementDetectionFilterState(token, state) {
  if (!token || !state) return false;

  try {
    if (state.hadDetectionFilter) {
      if (!(state.detectionFilter == null && tokenHasAnyHiddenAvsOverride(token))) {
        token.detectionFilter = state.detectionFilter;
      }
    } else if (!tokenHasAnyHiddenAvsOverride(token)) {
      delete token.detectionFilter;
    }

    const meshState = state.detectionFilterMesh;
    const mesh = meshState?.mesh;
    if (mesh) {
      if ('visible' in mesh && meshState.visible !== undefined && mesh.visible !== meshState.visible) {
        mesh.visible = meshState.visible;
      }
      if ('renderable' in mesh && meshState.renderable !== undefined) {
        if (mesh.renderable !== meshState.renderable) mesh.renderable = meshState.renderable;
      }
      if ('alpha' in mesh && meshState.alpha !== undefined && mesh.alpha !== meshState.alpha) {
        mesh.alpha = meshState.alpha;
      }
    }
    return true;
  } catch {
    return false;
  }
}

export function clearDetectionFilterVisuals(token) {
  if (!token) return;
  if (tokenHasAnyHiddenAvsOverride(token)) return;
  try {
    token.detectionFilter = null;
  } catch {
    /* best-effort filter clear */
  }
  sanitizeDetectionFilterList(token);
  sanitizeCanvasDetectionFilterLists();

  const detectionFilterMesh = token.detectionFilterMesh;
  if (detectionFilterMesh) {
    try {
      if ('visible' in detectionFilterMesh) detectionFilterMesh.visible = false;
      if ('renderable' in detectionFilterMesh) detectionFilterMesh.renderable = false;
      if ('alpha' in detectionFilterMesh) detectionFilterMesh.alpha = 0;
    } catch {
      /* best-effort filter mesh clear */
    }
  }

  const hiddenEcho = token._pvHiddenEcho;
  if (hiddenEcho) {
    try {
      if ('visible' in hiddenEcho) hiddenEcho.visible = false;
      hiddenEcho.parent?.removeChild?.(hiddenEcho);
      hiddenEcho.destroy?.();
    } catch {
      /* best-effort hidden echo clear */
    }
    try {
      token._pvHiddenEcho = null;
    } catch {
      /* best-effort hidden echo clear */
    }
  }
}

export function clearNoObserverDetectionFilterVisuals(
  tokens = canvas?.tokens?.placeables || [],
) {
  if ((canvas?.tokens?.controlled?.length ?? 0) > 0) return 0;

  let cleared = 0;
  for (const token of tokens || []) {
    if (!tokenHasDetectionFilterVisual(token)) continue;
    if (tokenHasAnyHiddenAvsOverride(token)) continue;
    clearDetectionFilterVisuals(token);
    cleared += 1;
  }
  return cleared;
}

function tokenHasAnyHiddenAvsOverride(token) {
  const flags = token?.document?.flags?.['pf2e-visioner'];
  if (!flags) return false;
  for (const key of Object.keys(flags)) {
    if (!key.startsWith('avs-override-from-')) continue;
    if (flags[key]?.state === 'hidden') return true;
  }
  return false;
}
