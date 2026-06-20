import { MODULE_ID } from '../constants.js';
import { setPostBatchPerceptionRefreshSuppression } from './runtime-state.js';

export function buildDoorStateSuppression(wallDocument, doorState, { now = Date.now } = {}) {
  return {
    reason: 'door-state-change',
    doorId: wallDocument?.id ?? null,
    doorCoords: Array.isArray(wallDocument?.c) ? Array.from(wallDocument.c) : null,
    doorState,
    until: now() + 1000,
    perceptionRefreshed: false,
  };
}

export function getDoorStateValidationTokens({ controlled = [], placeables = [] } = {}) {
  return controlled?.length > 0 ? controlled : (placeables ?? []);
}

async function loadDefaultAutoVisibilitySystem() {
  const { autoVisibilitySystem } = await import('../visibility/auto-visibility/index.js');
  return autoVisibilitySystem ?? null;
}

async function loadDefaultDeferredSeekManager() {
  const deferredSeekManager = (await import('../chat/services/infra/DeferredSeekManager.js'))
    .default;
  return deferredSeekManager ?? null;
}

function defaultHooksOnce(hookName, callback) {
  return globalThis.Hooks?.once?.(hookName, callback);
}

function getDefaultCanvasTokens() {
  return {
    controlled: globalThis.canvas?.tokens?.controlled ?? [],
    placeables: globalThis.canvas?.tokens?.placeables ?? [],
  };
}

export function createDoorStateVisibilityRefreshService({
  setPostBatchPerceptionRefreshSuppression: setSuppression = setPostBatchPerceptionRefreshSuppression,
  loadAutoVisibilitySystem = loadDefaultAutoVisibilitySystem,
  loadDeferredSeekManager = loadDefaultDeferredSeekManager,
  hooksOnce = defaultHooksOnce,
  getCanvasTokens = getDefaultCanvasTokens,
  now = Date.now,
} = {}) {
  async function markAllTokensChanged() {
    try {
      const autoVisibilitySystem = await loadAutoVisibilitySystem();
      autoVisibilitySystem?.orchestrator?.visibilityState?.markAllTokensChangedImmediate?.();
    } catch {
      /* best effort */
    }
  }

  async function validateOverridesAfterDoorChange() {
    try {
      const autoVisibilitySystem = await loadAutoVisibilitySystem();
      const overrideValidationManager =
        autoVisibilitySystem?.orchestrator?.overrideValidationManager;
      if (!overrideValidationManager) return;

      const tokens = getCanvasTokens();
      const tokensToCheck = getDoorStateValidationTokens(tokens);
      for (const token of tokensToCheck) {
        const tokenId = token?.document?.id;
        if (tokenId) {
          overrideValidationManager.queueOverrideValidation(tokenId);
        }
      }
      await overrideValidationManager.processQueuedValidations({ skipMovedFilter: true });
    } catch {
      /* best effort */
    }
  }

  async function applyDeferredSeeksAfterDoorChange() {
    try {
      const deferredSeekManager = await loadDeferredSeekManager();
      const { placeables = [] } = getCanvasTokens();
      for (const token of placeables) {
        const hasDeferredResults = token?.document?.getFlag?.(MODULE_ID, 'deferredSeekResults');
        if (hasDeferredResults?.length > 0) {
          await deferredSeekManager?.checkAndApplyDeferred?.(token.document.id);
        }
      }
    } catch {
      /* best effort */
    }
  }

  async function runPostBatchDoorStateRefresh() {
    await validateOverridesAfterDoorChange();
    await applyDeferredSeeksAfterDoorChange();
  }

  async function handleDoorStateChange(wallDocument, doorState) {
    try {
      setSuppression(buildDoorStateSuppression(wallDocument, doorState, { now }));
    } catch {
      /* best effort */
    }

    await markAllTokensChanged();

    try {
      hooksOnce('pf2e-visioner.batchComplete', runPostBatchDoorStateRefresh);
    } catch {
      /* best effort */
    }
  }

  return {
    handleDoorStateChange,
    runPostBatchDoorStateRefresh,
  };
}

export async function handleDoorStateVisibilityRefresh(wallDocument, doorState, options = {}) {
  return createDoorStateVisibilityRefreshService(options).handleDoorStateChange(
    wallDocument,
    doorState,
  );
}
