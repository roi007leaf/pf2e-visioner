import { MODULE_ID } from '../constants.js';
import { setVisibilityBetween } from '../stores/visibility-map.js';
import { expandWallIdWithConnected } from './connected-walls.js';

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

  return { observers, tokenTargets, wallTargets };
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
      tokenPairs: 0,
      wallEntries: 0,
      foundryUnhidden: 0,
    };
  }

  const allWalls = options.walls || getPlaceables(canvas?.walls);
  const { observers, tokenTargets, wallTargets } = getInitialHiddenSceneTargets(options);
  let tokenPairs = 0;
  let wallEntries = 0;
  let foundryUnhidden = 0;

  for (const target of tokenTargets) {
    foundryUnhidden += await clearFoundryHiddenState(target);
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
  }

  try {
    Hooks.callAll?.('pf2e-visioner.initialSceneHiddenSetup', {
      observers: observers.length,
      tokenTargets: tokenTargets.length,
      wallTargets: wallTargets.length,
      tokenPairs,
      wallEntries,
      foundryUnhidden,
    });
  } catch {
    /* hook notification is best effort */
  }

  return {
    observers: observers.length,
    tokenTargets: tokenTargets.length,
    wallTargets: wallTargets.length,
    tokenPairs,
    wallEntries,
    foundryUnhidden,
  };
}
