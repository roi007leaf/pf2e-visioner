import { scheduleCanvasPerceptionUpdate } from '../helpers/perception-refresh.js';

const MODULE_ID = 'pf2e-visioner';
const VISION_MASTER_TOKEN_ID_FLAG = 'visionMasterTokenId';
const VISION_MASTER_TOKEN_ID_PATH = `flags.${MODULE_ID}.${VISION_MASTER_TOKEN_ID_FLAG}`;

function defaultHasProperty(object, path) {
  const foundryHasProperty = globalThis.foundry?.utils?.hasProperty;
  if (typeof foundryHasProperty === 'function') {
    return foundryHasProperty(object, path);
  }

  const keys = path.split('.');
  let current = object;
  for (const key of keys) {
    if (current === null || current === undefined || !(key in current)) return false;
    current = current[key];
  }
  return true;
}

function getNewMasterId(changes) {
  return changes?.flags?.[MODULE_ID]?.[VISION_MASTER_TOKEN_ID_FLAG];
}

function initializeTokenVisionSource(token) {
  token?.initializeVisionSource?.();
}

async function defaultUpdateSharedVisionIndicator(token) {
  const { default: SharedVisionIndicator } = await import('../ui/SharedVisionIndicator.js');
  const indicator = SharedVisionIndicator.getInstance();
  indicator.update(token);
}

export function hasVisionMasterTokenIdChange(changes, hasProperty = defaultHasProperty) {
  return hasProperty(changes, VISION_MASTER_TOKEN_ID_PATH);
}

export function createVisionMasterTokenRefresh({
  oldMasterIds = new Map(),
  getCanvas = () => globalThis.canvas,
  getGame = () => globalThis.game,
  hasProperty = defaultHasProperty,
  updateSharedVisionIndicator = defaultUpdateSharedVisionIndicator,
  warn = console.warn,
} = {}) {
  function capturePreUpdate(tokenDoc, changes) {
    if (!hasVisionMasterTokenIdChange(changes, hasProperty)) return false;

    oldMasterIds.set(tokenDoc.id, tokenDoc.getFlag(MODULE_ID, VISION_MASTER_TOKEN_ID_FLAG));
    return true;
  }

  async function refreshAfterUpdate(tokenDoc, changes) {
    if (!hasVisionMasterTokenIdChange(changes, hasProperty)) {
      return { refreshed: false, reason: 'unchanged' };
    }

    const oldMasterId = oldMasterIds.get(tokenDoc.id);
    oldMasterIds.delete(tokenDoc.id);

    const token = tokenDoc.object;
    if (!token) {
      return { refreshed: false, reason: 'no-token' };
    }

    const canvas = getCanvas();
    const newMasterId = getNewMasterId(changes);

    initializeTokenVisionSource(token);

    if (oldMasterId) {
      initializeTokenVisionSource(canvas?.tokens?.get?.(oldMasterId));
    }

    if (newMasterId && newMasterId !== null) {
      initializeTokenVisionSource(canvas?.tokens?.get?.(newMasterId));
    }

    scheduleCanvasPerceptionUpdate(
      { initializeVision: true, refreshLighting: true },
      { perception: canvas?.perception },
    );

    if (token.controlled && getGame()?.user?.isGM) {
      try {
        await updateSharedVisionIndicator(token);
      } catch (error) {
        warn('PF2E Visioner | Failed to update shared vision indicator:', error);
      }
    }

    return { refreshed: true, oldMasterId, newMasterId };
  }

  return {
    capturePreUpdate,
    refreshAfterUpdate,
  };
}
