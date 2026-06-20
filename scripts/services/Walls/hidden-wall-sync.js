import { MODULE_ID } from '../../constants.js';
import {
  getConnectedWallDocsBySourceId,
  mirrorHiddenFlagToConnected,
} from './connected-walls.js';

export function getHiddenWallSyncWallIds(
  wallDocument,
  { getConnectedWallDocsBySourceId: resolveConnectedWalls = getConnectedWallDocsBySourceId } = {},
) {
  const sourceId = wallDocument?.id;
  if (!sourceId) return [];

  try {
    const connected = resolveConnectedWalls?.(sourceId) || [];
    return [sourceId, ...connected.map((document) => document?.id).filter(Boolean)];
  } catch {
    return [sourceId];
  }
}

export function buildHiddenWallTokenUpdates({
  tokens = [],
  wallIds = [],
  hidden,
  moduleId = MODULE_ID,
} = {}) {
  const normalizedWallIds = Array.from(new Set(wallIds.filter(Boolean)));
  if (normalizedWallIds.length === 0) return [];

  const updates = [];
  for (const token of tokens) {
    const document = token?.document;
    const current = document?.getFlag?.(moduleId, 'walls') || {};
    const next = { ...current };
    let changedAny = false;

    for (const wallId of normalizedWallIds) {
      if (hidden) {
        if (next[wallId] !== 'hidden') {
          next[wallId] = 'hidden';
          changedAny = true;
        }
      } else if (next[wallId]) {
        delete next[wallId];
        changedAny = true;
      }
    }

    if (changedAny && document?.id) {
      updates.push({
        _id: document.id,
        [`flags.${moduleId}.walls`]: next,
      });
    }
  }

  return updates;
}

export async function syncHiddenWallTokenFlags(
  wallDocument,
  hidden,
  {
    tokens = globalThis.canvas?.tokens?.placeables || [],
    scene = globalThis.canvas?.scene,
    isGM = !!globalThis.game?.user?.isGM,
    getConnectedWallDocsBySourceId: resolveConnectedWalls = getConnectedWallDocsBySourceId,
    mirrorHiddenFlagToConnected: mirrorHiddenFlag = mirrorHiddenFlagToConnected,
  } = {},
) {
  const wallIds = getHiddenWallSyncWallIds(wallDocument, {
    getConnectedWallDocsBySourceId: resolveConnectedWalls,
  });
  const updates = buildHiddenWallTokenUpdates({
    tokens,
    wallIds,
    hidden,
  });

  let tokenDocumentsUpdated = false;
  try {
    if (isGM && updates.length > 0) {
      await scene?.updateEmbeddedDocuments?.('Token', updates, { diff: false });
      tokenDocumentsUpdated = true;
    }
  } catch {
    tokenDocumentsUpdated = false;
  }

  let connectedWallsMirrored = false;
  try {
    await mirrorHiddenFlag?.(wallDocument, !!hidden);
    connectedWallsMirrored = true;
  } catch {
    connectedWallsMirrored = false;
  }

  return {
    wallIds,
    updates,
    tokenDocumentsUpdated,
    connectedWallsMirrored,
  };
}
