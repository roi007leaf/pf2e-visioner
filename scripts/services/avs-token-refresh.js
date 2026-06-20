import {
  clearLastMovedTokenId,
  getLastMovedTokenId,
  setLastMovedTokenId,
} from './runtime-state.js';

const defaultRuntimeState = {
  getLastMovedTokenId,
  clearLastMovedTokenId,
  setLastMovedTokenId,
};

export function normalizeAvsTokenIds(tokenIds) {
  return Array.from(new Set((tokenIds ?? []).filter(Boolean)));
}

function getDefaultWindowAutoVisibilitySystem() {
  const root = globalThis.window ?? globalThis;
  return root?.pf2eVisioner?.services?.autoVisibilitySystem ?? null;
}

async function loadDefaultAutoVisibilitySystem() {
  const { autoVisibilitySystem } = await import('../visibility/auto-visibility/index.js');
  return autoVisibilitySystem ?? null;
}

function getDefaultCanvasPerception() {
  return globalThis.canvas?.perception ?? null;
}

async function recalculateTokenIds(autoVisibilitySystem, tokenIds) {
  if (typeof autoVisibilitySystem?.recalculateForTokens !== 'function') {
    return false;
  }

  await autoVisibilitySystem.recalculateForTokens(tokenIds);
  return true;
}

async function validateOverridesForTokenIds(overrideValidationManager, tokenIds, runtimeState) {
  if (
    typeof overrideValidationManager?.queueOverrideValidation !== 'function' ||
    typeof overrideValidationManager?.processQueuedValidations !== 'function'
  ) {
    return false;
  }

  const previousLastMovedTokenId = runtimeState?.getLastMovedTokenId?.() ?? null;
  runtimeState?.clearLastMovedTokenId?.();

  try {
    for (const id of tokenIds) {
      overrideValidationManager.queueOverrideValidation(id);
    }
    await overrideValidationManager.processQueuedValidations({ skipMovedFilter: true });
    return true;
  } finally {
    if (previousLastMovedTokenId !== null) {
      runtimeState?.setLastMovedTokenId?.(previousLastMovedTokenId);
    }
  }
}

export function createAvsTokenRefreshService({
  getWindowAutoVisibilitySystem = getDefaultWindowAutoVisibilitySystem,
  loadAutoVisibilitySystem = loadDefaultAutoVisibilitySystem,
  getCanvasPerception = getDefaultCanvasPerception,
  runtimeState = defaultRuntimeState,
} = {}) {
  async function recalculateRuntimeTokenIds(tokenIds) {
    const normalizedTokenIds = normalizeAvsTokenIds(tokenIds);
    const result = {
      tokenIds: normalizedTokenIds,
      windowRecalculated: false,
      perceptionRefreshed: false,
    };

    const windowAutoVisibilitySystem = getWindowAutoVisibilitySystem?.() ?? null;
    if (typeof windowAutoVisibilitySystem?.recalculateForTokens === 'function') {
      await windowAutoVisibilitySystem.recalculateForTokens(normalizedTokenIds);
      result.windowRecalculated = true;
      return result;
    }

    getCanvasPerception?.()?.update?.({
      refreshVision: true,
      refreshOcclusion: true,
    });
    result.perceptionRefreshed = true;
    return result;
  }

  async function refreshTokenMapChanges(tokenIds) {
    const normalizedTokenIds = normalizeAvsTokenIds(tokenIds);
    const result = {
      tokenIds: normalizedTokenIds,
      windowRecalculated: false,
      moduleRecalculated: false,
      overrideValidated: false,
      perceptionRefreshed: false,
    };

    if (normalizedTokenIds.length === 0) {
      return result;
    }

    let windowAutoVisibilitySystem = null;
    try {
      windowAutoVisibilitySystem = getWindowAutoVisibilitySystem?.() ?? null;
      result.windowRecalculated = await recalculateTokenIds(
        windowAutoVisibilitySystem,
        normalizedTokenIds,
      );
    } catch {
      result.windowRecalculated = false;
    }

    try {
      const autoVisibilitySystem = await loadAutoVisibilitySystem?.();
      if (!(result.windowRecalculated && autoVisibilitySystem === windowAutoVisibilitySystem)) {
        result.moduleRecalculated = await recalculateTokenIds(
          autoVisibilitySystem,
          normalizedTokenIds,
        );
      }

      result.overrideValidated = await validateOverridesForTokenIds(
        autoVisibilitySystem?.orchestrator?.overrideValidationManager,
        normalizedTokenIds,
        runtimeState,
      );
    } catch {
      result.moduleRecalculated = false;
      result.overrideValidated = false;
    }

    try {
      getCanvasPerception?.()?.update?.({
        refreshVision: true,
        refreshOcclusion: true,
      });
      result.perceptionRefreshed = true;
    } catch {
      result.perceptionRefreshed = false;
    }

    return result;
  }

  return {
    recalculateRuntimeTokenIds,
    refreshTokenMapChanges,
  };
}

export async function refreshAvsAfterTokenMapSync(tokenIds, options = {}) {
  return createAvsTokenRefreshService(options).refreshTokenMapChanges(tokenIds);
}

export async function recalculateRuntimeAvsTokenIds(tokenIds, options = {}) {
  return createAvsTokenRefreshService(options).recalculateRuntimeTokenIds(tokenIds);
}
