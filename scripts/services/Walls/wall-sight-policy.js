import { buildOriginalSightRestoreUpdate } from './wall-visual-state.js';

export function tokenHasObservedWall(token, wallId, moduleId) {
  try {
    const wallMap = token?.document?.getFlag?.(moduleId, 'walls') || {};
    return wallMap?.[wallId] === 'observed';
  } catch (_) {
    return false;
  }
}

export function sceneHasObservedWallToken(tokens, wallId, moduleId) {
  return (tokens || []).some((token) => tokenHasObservedWall(token, wallId, moduleId));
}

export function buildOriginalSightOverrideUpdate(document, moduleId) {
  try {
    const currentSight = Number(document?.sight ?? 1);
    if (currentSight === 0) return null;

    const originalSight = document?.getFlag?.(moduleId, 'originalSight');
    const sightToStore =
      originalSight === undefined || originalSight === null ? currentSight : originalSight;

    return {
      _id: document.id,
      sight: 0,
      [`flags.${moduleId}.originalSight`]: sightToStore,
    };
  } catch (_) {
    return null;
  }
}

export function buildHiddenWallSightUpdate({
  wallDocument,
  moduleId,
  sceneTokens = [],
  seeThroughEnabled = false,
} = {}) {
  if (!seeThroughEnabled) {
    return buildOriginalSightRestoreUpdate(wallDocument, moduleId);
  }

  if (sceneHasObservedWallToken(sceneTokens, wallDocument?.id, moduleId)) {
    return buildOriginalSightOverrideUpdate(wallDocument, moduleId);
  }

  return buildOriginalSightRestoreUpdate(wallDocument, moduleId);
}
