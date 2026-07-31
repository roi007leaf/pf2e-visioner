const guardedRenderStates = new WeakMap();

function usesLegacyLevelsScene() {
  const levelsModule = globalThis.game?.modules?.get?.('levels');
  const sceneLevels = globalThis.canvas?.scene?.flags?.levels?.sceneLevels;
  return levelsModule?.active === true && Array.isArray(sceneLevels) && sceneLevels.length > 0;
}

function captureRenderable(surface) {
  if (!surface || !('renderable' in surface)) return null;
  return surface.renderable;
}

function restoreGuardedRenderState(token, state) {
  if (state.tokenRenderable !== null && 'renderable' in token) {
    token.renderable = state.tokenRenderable;
  }
  if (state.meshRenderable !== null && token.mesh && 'renderable' in token.mesh) {
    token.mesh.renderable = state.meshRenderable;
  }
}

function releaseGuard(token, { restore = true } = {}) {
  const state = guardedRenderStates.get(token);
  if (!state) return;
  guardedRenderStates.delete(token);
  if (restore) restoreGuardedRenderState(token, state);
}

/**
 * Levels on Foundry V13 computes token visibility through its 3D LOS test but only toggles
 * `visible`. Other render wrappers can temporarily set `visible` back to true before the next
 * LOS pass. Preserve the final hidden result with `renderable` between passes, then release it
 * immediately when Levels' next completed pass reports the token visible.
 */
export function stabilizeLegacyLevelsTokenRenderingAfterRenderPass(token) {
  if (!token) return;

  if (!usesLegacyLevelsScene()) {
    releaseGuard(token, { restore: token._pvCurrentViewHardHidden !== true });
    return;
  }

  if (token.visible !== false) {
    releaseGuard(token);
    return;
  }

  // Current-view hard-hide already owns these surfaces and restores them when its state changes.
  if (token._pvCurrentViewHardHidden === true && !guardedRenderStates.has(token)) return;

  if (!guardedRenderStates.has(token)) {
    guardedRenderStates.set(token, {
      tokenRenderable: captureRenderable(token),
      meshRenderable: captureRenderable(token.mesh),
    });
  }

  if ('renderable' in token) token.renderable = false;
  if (token.mesh && 'renderable' in token.mesh) token.mesh.renderable = false;
}
