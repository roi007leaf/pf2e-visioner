const PENDING_MOVEMENT_RENDER_STATE_KEY = '_pf2eVisionerPendingRenderState';

const pendingMovementRenderLockedTokens = new Set();

function tokenInterfaceSurfaces(token) {
  return [
    ['detectionFilterMesh', token?.detectionFilterMesh],
    ['voidMesh', token?.voidMesh],
    ['border', token?.border],
    ['nameplate', token?.nameplate],
    ['bars', token?.bars],
    ['tooltip', token?.tooltip],
    ['levelIndicator', token?.levelIndicator],
    ['effects', token?.effects],
    ['targetArrows', token?.targetArrows],
    ['targetPips', token?.targetPips],
    ['ruler', token?.ruler],
    ['turnMarker', token?.turnMarker],
    ['turnMarkerMesh', token?.turnMarker?.mesh],
    ['ring', token?.ring],
    ['ringMesh', token?.ring?.mesh],
    ['ringSubject', token?.ring?.subject],
  ].filter(([, surface]) => surface && 'visible' in surface);
}

function hideVisibleSurface(surface) {
  if (!surface || !('visible' in surface)) return false;

  try {
    surface.visible = false;
    return true;
  } catch {
    return false;
  }
}

export function getPendingRenderState(token) {
  return token?.[PENDING_MOVEMENT_RENDER_STATE_KEY] ?? null;
}

export function hasPendingRenderState(token) {
  return !!getPendingRenderState(token);
}

export function isPendingMovementRenderLocked(token) {
  return pendingMovementRenderLockedTokens.has(token);
}

export function hasPendingMovementRenderLocks() {
  return pendingMovementRenderLockedTokens.size > 0;
}

export function prunePendingMovementRenderLocks(sceneTokens) {
  for (const token of [...pendingMovementRenderLockedTokens]) {
    if (!getPendingRenderState(token) || !sceneTokens.has(token)) {
      pendingMovementRenderLockedTokens.delete(token);
    }
  }

  return pendingMovementRenderLockedTokens.size;
}

export function capturePendingRenderState(token) {
  if (!token) return null;
  const existingState = getPendingRenderState(token);
  if (existingState) {
    pendingMovementRenderLockedTokens.add(token);
    return existingState;
  }

  const state = {
    tokenVisible: token.visible,
    tokenRenderable: token.renderable,
    meshVisible: token.mesh?.visible,
    meshRenderable: token.mesh?.renderable,
    meshAlpha: token.mesh?.alpha,
    lastForcedAt: null,
    lastHiddenContext: null,
    surfaceVisibility: tokenInterfaceSurfaces(token).map(([name, surface]) => ({
      name,
      surface,
      visible: surface.visible,
    })),
  };

  try {
    token[PENDING_MOVEMENT_RENDER_STATE_KEY] = state;
    pendingMovementRenderLockedTokens.add(token);
  } catch {
    /* best-effort render restore */
  }

  return state;
}

export function clearPendingRenderState(token) {
  if (!token) return;

  try {
    delete token[PENDING_MOVEMENT_RENDER_STATE_KEY];
  } catch {
    /* best-effort render restore */
  }
  pendingMovementRenderLockedTokens.delete(token);
}

export function restorePendingRenderStateVisuals(token, state = getPendingRenderState(token)) {
  if (!token || !state) return false;

  try {
    if (state.tokenVisible !== undefined) token.visible = state.tokenVisible;
    token.renderable = state.tokenRenderable;
    if (token.mesh) {
      if ('visible' in token.mesh && state.meshVisible !== undefined) {
        token.mesh.visible = state.meshVisible;
      }
      if ('renderable' in token.mesh) token.mesh.renderable = state.meshRenderable;
      if ('alpha' in token.mesh && state.meshAlpha !== undefined) token.mesh.alpha = state.meshAlpha;
    }
    for (const { surface, visible } of state.surfaceVisibility || []) {
      try {
        if (surface && 'visible' in surface) surface.visible = visible;
      } catch {
        /* best-effort surface restore */
      }
    }
    return true;
  } catch {
    return false;
  }
}

export function forceTokenRenderStateInvisible(token) {
  if (!token) return;

  token.visible = false;
  token.renderable = false;
  if (token.mesh) token.mesh.visible = false;
  if (token.mesh && 'renderable' in token.mesh) token.mesh.renderable = false;
  if (token.mesh && 'alpha' in token.mesh) token.mesh.alpha = 0;
  token.detectionFilter = null;
  for (const [, surface] of tokenInterfaceSurfaces(token)) {
    hideVisibleSurface(surface);
  }
}

export function showTokenInterfaceSurfaces(token) {
  for (const [, surface] of tokenInterfaceSurfaces(token)) {
    try {
      if (surface && 'visible' in surface) surface.visible = true;
    } catch {
      /* best-effort surface restore */
    }
  }
}
