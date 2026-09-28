import { MODULE_ID } from '../../constants.js';
import { refreshHiddenTileIndicator, removeHiddenTileIndicator } from './hidden-tile-indicator.js';

const renderedTiles = new Set();

export function tileVisibilityForObserver(tile, observer, moduleId = MODULE_ID) {
  const document = tile?.document ?? tile;
  if (!document?.getFlag?.(moduleId, 'hiddenTile')) return true;
  if (document.hidden) return false;
  const state = observer?.document?.getFlag?.(moduleId, 'tiles')?.[document.id];
  return state === 'observed';
}

export function hiddenTileVisibleToUser(tile, {
  user = globalThis.game?.user,
  tokens = globalThis.canvas?.tokens?.placeables ?? [],
  controlled = globalThis.canvas?.tokens?.controlled ?? [],
  enabled = globalThis.game?.settings?.get?.(MODULE_ID, 'hiddenTilesEnabled') !== false,
  moduleId = MODULE_ID,
} = {}) {
  const document = tile?.document ?? tile;
  if (document?.hidden && !user?.isGM) return false;
  if (!enabled || !document?.getFlag?.(moduleId, 'hiddenTile')) return true;
  if (user?.isGM) {
    const observer = controlled[0];
    return observer ? tileVisibilityForObserver(tile, observer, moduleId) : true;
  }
  return tokens.some(token =>
    token?.document?.testUserPermission?.(user, 'OWNER') &&
    tileVisibilityForObserver(tile, token, moduleId));
}

export function shouldHighlightHiddenTile(tile, context = {}) {
  const user = context.user ?? globalThis.game?.user;
  const enabled = context.enabled ?? globalThis.game?.settings?.get?.(MODULE_ID, 'hiddenTilesEnabled') !== false;
  if (!enabled || !tile?.document?.getFlag?.(MODULE_ID, 'hiddenTile')) return false;
  if (user?.isGM) {
    const observer = (context.controlled ?? globalThis.canvas?.tokens?.controlled ?? [])[0];
    return !!observer && tileVisibilityForObserver(tile, observer);
  }
  return hiddenTileVisibleToUser(tile, context);
}

export function refreshHiddenTileVisual(tile, context = {}) {
  if (!tile?.mesh) {
    removeHiddenTileIndicator(tile);
    return false;
  }
  const document = tile.document;
  const shouldConceal = !!document?.getFlag?.(MODULE_ID, 'hiddenTile') &&
    !hiddenTileVisibleToUser(tile, context);
  refreshHiddenTileIndicator(tile, { show: !shouldConceal && shouldHighlightHiddenTile(tile, context) });
  if (shouldConceal) {
    if (!tile._pvHiddenTileRenderState) {
      tile._pvHiddenTileRenderState = {
        visible: tile.mesh.visible,
        renderable: tile.mesh.renderable,
      };
    }
    tile.mesh.visible = false;
    tile.mesh.renderable = false;
    renderedTiles.add(tile);
    return true;
  }
  const prior = tile._pvHiddenTileRenderState;
  if (prior) {
    tile.mesh.visible = prior.visible;
    tile.mesh.renderable = prior.renderable;
    delete tile._pvHiddenTileRenderState;
  }
  renderedTiles.delete(tile);
  return false;
}

export function refreshHiddenTileVisuals(context = {}) {
  for (const tile of globalThis.canvas?.tiles?.placeables ?? []) {
    refreshHiddenTileVisual(tile, context);
  }
}

export async function syncHiddenTileTokenFlags(tileDocument, hidden, {
  scene = globalThis.canvas?.scene,
  moduleId = MODULE_ID,
  isGM = !!globalThis.game?.user?.isGM,
} = {}) {
  if (!isGM || !scene || !tileDocument?.id) return [];
  const updates = [];
  for (const token of scene.tokens ?? []) {
    const previous = token.getFlag?.(moduleId, 'tiles') ?? {};
    const next = { ...previous };
    if (hidden) {
      if (!(tileDocument.id in previous)) next[tileDocument.id] = 'hidden';
    } else {
      delete next[tileDocument.id];
    }
    if (next[tileDocument.id] !== previous[tileDocument.id]) {
      updates.push({ _id: token.id, [`flags.${moduleId}.tiles`]: next });
    }
  }
  if (updates.length) await scene.updateEmbeddedDocuments('Token', updates, { diff: false });
  return updates;
}

export function registerHiddenTileHooks() {
  Hooks.on('canvasReady', () => refreshHiddenTileVisuals());
  Hooks.on('drawTile', tile => refreshHiddenTileVisual(tile));
  Hooks.on('refreshTile', tile => refreshHiddenTileVisual(tile));
  Hooks.on('controlToken', () => refreshHiddenTileVisuals());
  Hooks.on('updateToken', (_doc, changes) => {
    if (changes?.flags?.[MODULE_ID]?.tiles || changes?.ownership) refreshHiddenTileVisuals();
  });
  Hooks.on('createToken', () => refreshHiddenTileVisuals());
  Hooks.on('deleteToken', () => refreshHiddenTileVisuals());
  Hooks.on('createTile', tile => {
    if (tile.getFlag?.(MODULE_ID, 'hiddenTile')) void syncHiddenTileTokenFlags(tile, true);
    refreshHiddenTileVisual(tile.object);
  });
  Hooks.on('updateTile', (tile, changes) => {
    const hidden = changes?.flags?.[MODULE_ID]?.hiddenTile;
    if (typeof hidden === 'boolean') void syncHiddenTileTokenFlags(tile, hidden);
    refreshHiddenTileVisual(tile.object);
  });
  Hooks.on('deleteTile', tile => {
    void syncHiddenTileTokenFlags(tile, false);
    removeHiddenTileIndicator(tile.object);
    renderedTiles.delete(tile.object);
  });
  Hooks.on('canvasTearDown', () => {
    for (const tile of renderedTiles) removeHiddenTileIndicator(tile);
    for (const tile of globalThis.canvas?.tiles?.placeables ?? []) removeHiddenTileIndicator(tile);
    renderedTiles.clear();
  });
}
