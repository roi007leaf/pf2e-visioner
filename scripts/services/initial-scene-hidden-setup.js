import { MODULE_ID } from '../constants.js';
import { setVisibilityBetween } from '../stores/visibility-map.js';
import { expandWallIdWithConnected } from './Walls/connected-walls.js';

export const DEFAULT_PLAYER_VISIBILITY_FLAG = 'defaultPlayerVisibility';
export const DEFAULT_PLAYER_WALL_VISIBILITY_FLAG = 'defaultPlayerWallVisibility';
export const DEFAULT_PLAYER_TILE_VISIBILITY_FLAG = 'defaultPlayerTileVisibility';
export const PREPARED_SCENE_VISIBILITY_FLAG = 'preparedSceneVisibility';

function actorIsType(actor, type) {
  try {
    return actor?.type === type || actor?.isOfType?.(type);
  } catch {
    return false;
  }
}

function getPlaceables(layer) {
  return Array.isArray(layer?.placeables) ? layer.placeables : [];
}

function getTokenId(token) {
  return token?.document?.id || token?.id || null;
}

function getWallId(wall) {
  return wall?.document?.id || wall?.id || null;
}

function getTileId(tile) {
  return tile?.document?.id || tile?.id || null;
}

function getTokenDocument(tokenOrDocument) {
  if (typeof tokenOrDocument?.document?.getFlag === 'function') return tokenOrDocument.document;
  if (typeof tokenOrDocument?.getFlag === 'function') return tokenOrDocument;
  if (typeof tokenOrDocument?.object?.document?.getFlag === 'function') {
    return tokenOrDocument.object.document;
  }
  return null;
}

function getWallDocument(wallOrDocument) {
  if (typeof wallOrDocument?.document?.getFlag === 'function') return wallOrDocument.document;
  if (typeof wallOrDocument?.getFlag === 'function') return wallOrDocument;
  if (typeof wallOrDocument?.object?.document?.getFlag === 'function') {
    return wallOrDocument.object.document;
  }
  return null;
}

function getTileDocument(tileOrDocument) {
  if (typeof tileOrDocument?.document?.getFlag === 'function') return tileOrDocument.document;
  if (typeof tileOrDocument?.getFlag === 'function') return tileOrDocument;
  if (typeof tileOrDocument?.object?.document?.getFlag === 'function') {
    return tileOrDocument.object.document;
  }
  return null;
}

function getTokenActor(tokenOrDocument) {
  return (
    tokenOrDocument?.actor ||
    tokenOrDocument?.document?.actor ||
    tokenOrDocument?.object?.actor ||
    null
  );
}

function getActorFromActorOrToken(actorOrToken) {
  return getTokenActor(actorOrToken) || actorOrToken?.actor || actorOrToken || null;
}

function getActorId(actorOrToken) {
  const actor = getActorFromActorOrToken(actorOrToken);
  return actor?.id || actor?._id || actor?.uuid || null;
}

function getActorCollectionValues(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (Array.isArray(collection.contents)) return collection.contents;
  if (collection instanceof Map) return Array.from(collection.values());
  if (typeof collection.values === 'function') {
    try {
      return Array.from(collection.values());
    } catch {
      return [];
    }
  }
  if (typeof collection === 'object') return Object.values(collection);
  return [];
}

function isPlayerCharacterActor(actor) {
  return actorIsType(actor, 'character') && !!actor?.hasPlayerOwner;
}

function getSceneId(options = {}) {
  return options.sceneId || canvas?.scene?.id || 'scene';
}

function getActorFlag(actor, key) {
  try {
    return actor?.getFlag?.(MODULE_ID, key) ?? actor?.flags?.[MODULE_ID]?.[key] ?? null;
  } catch {
    return null;
  }
}

async function setActorFlag(actor, key, value) {
  if (!actor) return false;
  if (typeof actor.setFlag === 'function') {
    await actor.setFlag(MODULE_ID, key, value);
    return true;
  }
  actor.flags ||= {};
  actor.flags[MODULE_ID] ||= {};
  actor.flags[MODULE_ID][key] = value;
  return true;
}

async function unsetActorFlag(actor, key) {
  if (!actor) return false;
  if (typeof actor.unsetFlag === 'function') {
    await actor.unsetFlag(MODULE_ID, key);
    return true;
  }
  if (actor.flags?.[MODULE_ID]) delete actor.flags[MODULE_ID][key];
  return true;
}

function getPreparedSceneVisibilityMap(actorOrToken, options = {}) {
  const actor = getActorFromActorOrToken(actorOrToken);
  const allScenes = getActorFlag(actor, PREPARED_SCENE_VISIBILITY_FLAG) || {};
  const sceneEntry = allScenes[getSceneId(options)] || {};
  return {
    tokens: { ...(sceneEntry.tokens || {}) },
    walls: { ...(sceneEntry.walls || {}) },
  };
}

function normalizeTokenVisibilityState(state) {
  return ['observed', 'concealed', 'hidden', 'undetected'].includes(state) ? state : null;
}

function normalizeWallVisibilityState(state) {
  return state === 'hidden' ? 'hidden' : state === 'observed' ? 'observed' : null;
}

async function setPreparedActorSceneVisibility(actorOrToken, type, targetId, state, options = {}) {
  const actor = getActorFromActorOrToken(actorOrToken);
  const actorId = getActorId(actor);
  const sceneId = getSceneId(options);
  if (!actorId || !sceneId || !targetId) return false;

  const normalized =
    type === 'walls' ? normalizeWallVisibilityState(state) : normalizeTokenVisibilityState(state);
  if (!normalized) return false;

  const allScenes = { ...(getActorFlag(actor, PREPARED_SCENE_VISIBILITY_FLAG) || {}) };
  const sceneEntry = {
    tokens: { ...(allScenes[sceneId]?.tokens || {}) },
    walls: { ...(allScenes[sceneId]?.walls || {}) },
  };
  sceneEntry[type][targetId] = normalized;
  allScenes[sceneId] = sceneEntry;
  return setActorFlag(actor, PREPARED_SCENE_VISIBILITY_FLAG, allScenes);
}

export function getPreparedActorSceneVisibility(actorOrToken, options = {}) {
  return getPreparedSceneVisibilityMap(actorOrToken, options);
}

export async function setPreparedActorTokenVisibility(actorOrToken, targetOrId, state, options = {}) {
  const targetId = typeof targetOrId === 'string' ? targetOrId : getTokenId(targetOrId);
  return setPreparedActorSceneVisibility(actorOrToken, 'tokens', targetId, state, options);
}

export async function setPreparedActorWallVisibility(actorOrToken, wallOrId, state, options = {}) {
  const wallId = typeof wallOrId === 'string' ? wallOrId : getWallId(wallOrId);
  return setPreparedActorSceneVisibility(actorOrToken, 'walls', wallId, state, options);
}

export async function clearPreparedActorSceneVisibility(options = {}) {
  const sceneId = getSceneId(options);
  const actors = getActorCollectionValues(options.actors || game?.actors).filter(isPlayerCharacterActor);
  let cleared = 0;

  for (const actor of actors) {
    const allScenes = { ...(getActorFlag(actor, PREPARED_SCENE_VISIBILITY_FLAG) || {}) };
    if (!allScenes[sceneId]) continue;

    delete allScenes[sceneId];
    cleared += 1;

    if (Object.keys(allScenes).length > 0) {
      await setActorFlag(actor, PREPARED_SCENE_VISIBILITY_FLAG, allScenes);
    } else {
      await unsetActorFlag(actor, PREPARED_SCENE_VISIBILITY_FLAG);
    }
  }

  return cleared;
}

function resolveToken(tokenOrDocument, tokens) {
  if (tokenOrDocument?.document) return tokenOrDocument;
  if (tokenOrDocument?.object) return tokenOrDocument.object;

  const tokenId = getTokenId(tokenOrDocument);
  if (!tokenId) return tokenOrDocument;

  return (
    canvas?.tokens?.get?.(tokenId) ||
    getPlaceables({ placeables: tokens }).find((token) => getTokenId(token) === tokenId) ||
    tokenOrDocument
  );
}

function isPlayerCharacterToken(tokenOrDocument) {
  const actor = getTokenActor(tokenOrDocument);
  return actorIsType(actor, 'character') && !!actor?.hasPlayerOwner && !!getTokenId(tokenOrDocument);
}

export function getDefaultPlayerVisibility(tokenOrDocument) {
  const state = getTokenDocument(tokenOrDocument)?.getFlag?.(
    MODULE_ID,
    DEFAULT_PLAYER_VISIBILITY_FLAG,
  );
  return state === 'hidden' || state === 'undetected' ? state : 'observed';
}

export async function setDefaultPlayerVisibility(tokenOrDocument, state) {
  const doc = getTokenDocument(tokenOrDocument);
  if (!doc) return false;

  if (state === 'hidden' || state === 'undetected') {
    await doc.setFlag?.(MODULE_ID, DEFAULT_PLAYER_VISIBILITY_FLAG, state);
    return true;
  }

  if (!state || state === 'observed') {
    await doc.unsetFlag?.(MODULE_ID, DEFAULT_PLAYER_VISIBILITY_FLAG);
    return true;
  }

  return false;
}

export function getDefaultPlayerWallVisibility(wallOrDocument) {
  const state = getWallDocument(wallOrDocument)?.getFlag?.(
    MODULE_ID,
    DEFAULT_PLAYER_WALL_VISIBILITY_FLAG,
  );
  return state === 'hidden' ? 'hidden' : 'observed';
}

export async function setDefaultPlayerWallVisibility(wallOrDocument, state) {
  const doc = getWallDocument(wallOrDocument);
  if (!doc) return false;

  if (state === 'hidden') {
    await doc.setFlag?.(MODULE_ID, DEFAULT_PLAYER_WALL_VISIBILITY_FLAG, 'hidden');
    return true;
  }

  if (!state || state === 'observed') {
    await doc.unsetFlag?.(MODULE_ID, DEFAULT_PLAYER_WALL_VISIBILITY_FLAG);
    return true;
  }

  return false;
}

export function getDefaultPlayerTileVisibility(tileOrDocument) {
  const state = getTileDocument(tileOrDocument)?.getFlag?.(
    MODULE_ID,
    DEFAULT_PLAYER_TILE_VISIBILITY_FLAG,
  );
  return state === 'hidden' || state === 'observed' ? state : null;
}

export async function setDefaultPlayerTileVisibility(tileOrDocument, state) {
  const doc = getTileDocument(tileOrDocument);
  if (!doc) return false;
  if (state === 'hidden' || state === 'observed') {
    await doc.setFlag?.(MODULE_ID, DEFAULT_PLAYER_TILE_VISIBILITY_FLAG, state);
    return true;
  }
  return false;
}

async function setTileVisibility(observer, tileTargets, state) {
  const doc = observer?.document;
  if (!doc?.setFlag) return 0;
  const next = { ...(doc.getFlag?.(MODULE_ID, 'tiles') || {}) };
  let changed = 0;
  for (const tile of tileTargets) {
    const id = getTileId(tile);
    if (!id || next[id] === state) continue;
    next[id] = state;
    changed += 1;
  }
  if (changed) await doc.setFlag(MODULE_ID, 'tiles', next);
  return changed;
}

export async function applyDefaultPlayerVisibilityForToken(tokenOrDocument, options = {}) {
  if (!game?.user?.isGM) {
    return {
      applied: 0,
      targetDefaults: 0,
      wallDefaults: 0,
      wallEntries: 0,
      tileDefaults: 0,
      tileEntries: 0,
      actorTokenEntries: 0,
      actorWallEntries: 0,
    };
  }

  const tokens = getPlaceables({ placeables: options.tokens || getPlaceables(canvas?.tokens) });
  const walls = getPlaceables({ placeables: options.walls || getPlaceables(canvas?.walls) });
  const tiles = getPlaceables({ placeables: options.tiles || getPlaceables(canvas?.tiles) });
  const observer = resolveToken(tokenOrDocument, tokens);
  const observerId = getTokenId(observer);

  if (!observerId || !isPlayerCharacterToken(observer)) {
    return {
      applied: 0,
      targetDefaults: 0,
      wallDefaults: 0,
      wallEntries: 0,
      tileDefaults: 0,
      tileEntries: 0,
      actorTokenEntries: 0,
      actorWallEntries: 0,
    };
  }

  let applied = 0;
  let targetDefaults = 0;
  let wallDefaults = 0;
  let actorTokenEntries = 0;

  for (const target of tokens) {
    const targetId = getTokenId(target);
    const actor = getTokenActor(target);
    if (!targetId || targetId === observerId) continue;
    if (!actorIsType(actor, 'loot') && !actorIsType(actor, 'hazard')) continue;
    const defaultVisibility = getDefaultPlayerVisibility(target);
    if (defaultVisibility !== 'hidden' && defaultVisibility !== 'undetected') continue;

    targetDefaults += 1;
    await setVisibilityBetween(observer, target, defaultVisibility, {
      direction: 'observer_to_target',
      skipEphemeralUpdate: true,
    });
    applied += 1;
  }

  const defaultWallTargets = [];
  for (const wall of walls) {
    if (!getWallId(wall) || getDefaultPlayerWallVisibility(wall) !== 'hidden') continue;
    defaultWallTargets.push(wall);
    wallDefaults += 1;
  }

  const wallEntries = await setHiddenWallVisibility(observer, defaultWallTargets, walls);
  const defaultTileTargets = tiles.filter(tile =>
    !!getTileId(tile) && !!getTileDocument(tile)?.getFlag?.(MODULE_ID, 'hiddenTile'));
  const hiddenTileTargets = defaultTileTargets.filter(tile =>
    getDefaultPlayerTileVisibility(tile) === 'hidden');
  const observedTileTargets = defaultTileTargets.filter(tile =>
    getDefaultPlayerTileVisibility(tile) === 'observed');
  const tileEntries = await setTileVisibility(observer, hiddenTileTargets, 'hidden') +
    await setTileVisibility(observer, observedTileTargets, 'observed');
  const actorPreparedVisibility = getPreparedSceneVisibilityMap(observer, options);

  for (const target of tokens) {
    const targetId = getTokenId(target);
    if (!targetId || targetId === observerId) continue;

    const state = normalizeTokenVisibilityState(actorPreparedVisibility.tokens?.[targetId]);
    if (!state) continue;

    await setVisibilityBetween(observer, target, state, {
      direction: 'observer_to_target',
      skipEphemeralUpdate: true,
    });
    actorTokenEntries += 1;
  }

  const actorWallEntries = await applyPreparedActorWallVisibility(
    observer,
    actorPreparedVisibility.walls,
    walls,
  );

  return {
    applied,
    targetDefaults,
    wallDefaults,
    wallEntries,
    tileDefaults: hiddenTileTargets.length + observedTileTargets.length,
    tileEntries,
    actorTokenEntries,
    actorWallEntries,
  };
}

function normalizeWallIdentifier(identifier) {
  return String(identifier || '').trim();
}

function expandWallIdsWithExplicitWalls(wallId, walls) {
  const ids = new Set(expandWallIdWithConnected(wallId));
  const byId = new Map();
  for (const wall of walls) {
    const id = getWallId(wall);
    if (id) byId.set(id, wall);
  }

  const queue = [wallId, ...ids];
  const seen = new Set();
  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId || seen.has(currentId)) continue;
    seen.add(currentId);
    ids.add(currentId);

    const sourceDoc = byId.get(currentId)?.document;
    if (!sourceDoc) continue;

    const forwardList = sourceDoc.getFlag?.(MODULE_ID, 'connectedWalls') || [];
    const forwardMatch = new Set(
      (Array.isArray(forwardList) ? forwardList : [])
        .map(normalizeWallIdentifier)
        .filter(Boolean),
    );
    const sourceIdentifier = normalizeWallIdentifier(
      sourceDoc.getFlag?.(MODULE_ID, 'wallIdentifier'),
    );

    for (const wall of walls) {
      const id = getWallId(wall);
      if (!id || id === currentId || ids.has(id)) continue;

      const doc = wall?.document;
      const identifier = normalizeWallIdentifier(doc?.getFlag?.(MODULE_ID, 'wallIdentifier'));
      const reverseList = doc?.getFlag?.(MODULE_ID, 'connectedWalls') || [];
      const reverseMatch =
        !!sourceIdentifier &&
        Array.isArray(reverseList) &&
        reverseList.map(normalizeWallIdentifier).includes(sourceIdentifier);

      if ((identifier && forwardMatch.has(identifier)) || reverseMatch) {
        ids.add(id);
        queue.push(id);
      }
    }
  }

  return ids;
}

export function getInitialHiddenSceneTargets({
  tokens = getPlaceables(canvas?.tokens),
  walls = getPlaceables(canvas?.walls),
  tiles = getPlaceables(canvas?.tiles),
} = {}) {
  const observers = tokens.filter((token) => {
    const actor = token?.actor;
    return actorIsType(actor, 'character') && !!actor?.hasPlayerOwner && !!token?.document?.id;
  });

  const tokenTargets = tokens.filter((token) => {
    const actor = token?.actor;
    return (
      !!token?.document?.id &&
      (actorIsType(actor, 'loot') || actorIsType(actor, 'hazard')) &&
      !observers.includes(token)
    );
  });

  const wallTargets = walls.filter(
    (wall) => !!getWallId(wall) && !!wall?.document?.getFlag?.(MODULE_ID, 'hiddenWall'),
  );

  const tileTargets = tiles.filter(
    tile => !!getTileId(tile) && !!getTileDocument(tile)?.getFlag?.(MODULE_ID, 'hiddenTile'),
  );

  return { observers, tokenTargets, wallTargets, tileTargets };
}

async function setHiddenWallVisibility(observer, wallTargets, allWalls) {
  const doc = observer?.document;
  if (!doc?.setFlag) return 0;

  const current = doc.getFlag?.(MODULE_ID, 'walls') || {};
  const next = { ...current };
  let changed = 0;

  for (const wall of wallTargets) {
    const wallId = getWallId(wall);
    if (!wallId) continue;

    const wallIds = expandWallIdsWithExplicitWalls(wallId, allWalls);
    for (const id of wallIds) {
      if (!id || next[id] === 'hidden') continue;
      next[id] = 'hidden';
      changed += 1;
    }
  }

  if (changed > 0) {
    await doc.setFlag(MODULE_ID, 'walls', next);
    try {
      const { updateWallVisuals } = await import('./visual-effects.js');
      await updateWallVisuals(observer.id || doc.id);
    } catch {
      /* visual refresh is best effort */
    }
  }

  return changed;
}

async function clearHiddenWallVisibility(observer, wallTargets, allWalls) {
  const doc = observer?.document;
  if (!doc?.setFlag && !doc?.unsetFlag) return 0;

  const current = doc.getFlag?.(MODULE_ID, 'walls') || {};
  const next = { ...current };
  let changed = 0;

  for (const wall of wallTargets) {
    const wallId = getWallId(wall);
    if (!wallId) continue;

    const wallIds = expandWallIdsWithExplicitWalls(wallId, allWalls);
    for (const id of wallIds) {
      if (!id || next[id] === 'observed') continue;
      next[id] = 'observed';
      changed += 1;
    }
  }

  if (changed > 0) {
    await doc.setFlag(MODULE_ID, 'walls', next);
    try {
      const { updateWallVisuals } = await import('./visual-effects.js');
      await updateWallVisuals(observer.id || doc.id);
    } catch {
      /* visual refresh is best effort */
    }
  }

  return changed;
}

async function applyPreparedActorWallVisibility(observer, wallStates, allWalls) {
  const doc = observer?.document;
  if (!doc?.setFlag || !wallStates || typeof wallStates !== 'object') return 0;

  const current = doc.getFlag?.(MODULE_ID, 'walls') || {};
  const next = { ...current };
  let changed = 0;

  for (const [wallId, rawState] of Object.entries(wallStates)) {
    const state = normalizeWallVisibilityState(rawState);
    if (!wallId || !state) continue;

    const wallIds = expandWallIdsWithExplicitWalls(wallId, allWalls);
    for (const id of wallIds) {
      if (!id || next[id] === state) continue;
      next[id] = state;
      changed += 1;
    }
  }

  if (changed > 0) {
    await doc.setFlag(MODULE_ID, 'walls', next);
    try {
      const { updateWallVisuals } = await import('./visual-effects.js');
      await updateWallVisuals(observer.id || doc.id);
    } catch {
      /* visual refresh is best effort */
    }
  }

  return changed;
}

async function clearFoundryHiddenState(token) {
  const doc = token?.document;
  if (!doc || doc.hidden !== true) return 0;

  if (typeof doc.update === 'function') {
    await doc.update({ hidden: false });
  } else {
    doc.hidden = false;
  }

  return 1;
}

export async function initializeSceneHiddenForPCs(options = {}) {
  if (!game?.user?.isGM) {
    return {
      observers: 0,
      tokenTargets: 0,
      wallTargets: 0,
      tileTargets: 0,
      tokenPairs: 0,
      wallEntries: 0,
      wallDefaults: 0,
      tileEntries: 0,
      tileDefaults: 0,
      foundryUnhidden: 0,
    };
  }

  const allWalls = options.walls || getPlaceables(canvas?.walls);
  const { observers, tokenTargets, wallTargets, tileTargets } = getInitialHiddenSceneTargets(options);
  let tokenPairs = 0;
  let wallEntries = 0;
  let wallDefaults = 0;
  let tileEntries = 0;
  let tileDefaults = 0;
  let foundryUnhidden = 0;

  for (const target of tokenTargets) {
    await setDefaultPlayerVisibility(target, 'hidden');
    foundryUnhidden += await clearFoundryHiddenState(target);
  }

  for (const wall of wallTargets) {
    if (await setDefaultPlayerWallVisibility(wall, 'hidden')) wallDefaults += 1;
  }

  for (const tile of tileTargets) {
    if (await setDefaultPlayerTileVisibility(tile, 'hidden')) tileDefaults += 1;
  }

  for (const observer of observers) {
    for (const target of tokenTargets) {
      if (!getTokenId(observer) || !getTokenId(target) || getTokenId(observer) === getTokenId(target)) {
        continue;
      }
      await setVisibilityBetween(observer, target, 'hidden', {
        direction: 'observer_to_target',
        skipEphemeralUpdate: true,
      });
      tokenPairs += 1;
    }

    wallEntries += await setHiddenWallVisibility(observer, wallTargets, allWalls);
    tileEntries += await setTileVisibility(observer, tileTargets, 'hidden');
  }

  if (tileEntries) {
    const { refreshHiddenTileVisuals } = await import('./Tiles/hidden-tile-visibility.js');
    refreshHiddenTileVisuals();
  }

  try {
    Hooks.callAll?.('pf2e-visioner.initialSceneHiddenSetup', {
      observers: observers.length,
      tokenTargets: tokenTargets.length,
      wallTargets: wallTargets.length,
      tileTargets: tileTargets.length,
      tokenPairs,
      wallEntries,
      wallDefaults,
      tileEntries,
      tileDefaults,
      foundryUnhidden,
    });
  } catch {
    /* hook notification is best effort */
  }

  return {
    observers: observers.length,
    tokenTargets: tokenTargets.length,
    wallTargets: wallTargets.length,
    tileTargets: tileTargets.length,
    tokenPairs,
    wallEntries,
    wallDefaults,
    tileEntries,
    tileDefaults,
    foundryUnhidden,
  };
}

export async function clearSceneHiddenForPCs(options = {}) {
  if (!game?.user?.isGM) {
    return {
      observers: 0,
      tokenTargets: 0,
      wallTargets: 0,
      tileTargets: 0,
      tokenPairs: 0,
      wallEntries: 0,
      defaultsCleared: 0,
      wallDefaultsCleared: 0,
      tileEntries: 0,
      tileDefaultsCleared: 0,
      actorPrepCleared: 0,
    };
  }

  const allWalls = options.walls || getPlaceables(canvas?.walls);
  const { observers, tokenTargets, wallTargets, tileTargets } = getInitialHiddenSceneTargets(options);
  let tokenPairs = 0;
  let wallEntries = 0;
  let defaultsCleared = 0;
  let wallDefaultsCleared = 0;
  let tileEntries = 0;
  let tileDefaultsCleared = 0;
  const actorPrepCleared = await clearPreparedActorSceneVisibility(options);

  for (const target of tokenTargets) {
    if (['hidden', 'undetected'].includes(getDefaultPlayerVisibility(target))) {
      defaultsCleared += 1;
      await setDefaultPlayerVisibility(target, 'observed');
    }
  }

  for (const wall of wallTargets) {
    if (getDefaultPlayerWallVisibility(wall) === 'hidden') {
      wallDefaultsCleared += 1;
      await setDefaultPlayerWallVisibility(wall, 'observed');
    }
  }

  for (const tile of tileTargets) {
    if (getDefaultPlayerTileVisibility(tile) !== 'observed') {
      await setDefaultPlayerTileVisibility(tile, 'observed');
      tileDefaultsCleared += 1;
    }
  }

  for (const observer of observers) {
    for (const target of tokenTargets) {
      if (!getTokenId(observer) || !getTokenId(target) || getTokenId(observer) === getTokenId(target)) {
        continue;
      }
      await setVisibilityBetween(observer, target, 'observed', {
        direction: 'observer_to_target',
        skipEphemeralUpdate: true,
      });
      tokenPairs += 1;
    }

    wallEntries += await clearHiddenWallVisibility(observer, wallTargets, allWalls);
    tileEntries += await setTileVisibility(observer, tileTargets, 'observed');
  }

  if (tileEntries) {
    const { refreshHiddenTileVisuals } = await import('./Tiles/hidden-tile-visibility.js');
    refreshHiddenTileVisuals();
  }

  try {
    Hooks.callAll?.('pf2e-visioner.initialSceneHiddenCleared', {
      observers: observers.length,
      tokenTargets: tokenTargets.length,
      wallTargets: wallTargets.length,
      tileTargets: tileTargets.length,
      tokenPairs,
      wallEntries,
      defaultsCleared,
      wallDefaultsCleared,
      tileEntries,
      tileDefaultsCleared,
      actorPrepCleared,
    });
  } catch {
    /* hook notification is best effort */
  }

  return {
    observers: observers.length,
    tokenTargets: tokenTargets.length,
    wallTargets: wallTargets.length,
    tileTargets: tileTargets.length,
    tokenPairs,
    wallEntries,
    defaultsCleared,
    wallDefaultsCleared,
    tileEntries,
    tileDefaultsCleared,
    actorPrepCleared,
  };
}
