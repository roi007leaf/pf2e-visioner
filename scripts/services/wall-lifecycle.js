import { MODULE_ID } from '../constants.js';
import { handleDoorStateVisibilityRefresh as defaultHandleDoorStateVisibilityRefresh } from './door-state-visibility-refresh.js';
import { syncHiddenWallTokenFlags as defaultSyncHiddenWallTokenFlags } from './hidden-wall-sync.js';
import {
  cleanupDeletedWallVisualsAndRefresh as defaultCleanupDeletedWallVisualsAndRefresh,
  refreshWallVisualsForControlledToken as defaultRefreshWallVisualsForControlledToken,
} from './wall-visual-refresh.js';

function getHiddenWallChange(changes) {
  return changes?.flags?.[MODULE_ID]?.hiddenWall;
}

export async function handleWallCreated({
  refreshWallVisualsForControlledToken = defaultRefreshWallVisualsForControlledToken,
} = {}) {
  try {
    await refreshWallVisualsForControlledToken();
    return { refreshed: true };
  } catch {
    return { refreshed: false, reason: 'visual-refresh-error' };
  }
}

export async function handleWallUpdated(
  wallDocument,
  changes,
  {
    syncHiddenWallTokenFlags = defaultSyncHiddenWallTokenFlags,
    handleDoorStateVisibilityRefresh = defaultHandleDoorStateVisibilityRefresh,
    refreshWallVisualsForControlledToken = defaultRefreshWallVisualsForControlledToken,
  } = {},
) {
  let hiddenWallSynced = false;
  let visualsRefreshed = false;
  const hiddenChanged = getHiddenWallChange(changes);

  if (hiddenChanged !== undefined) {
    try {
      await syncHiddenWallTokenFlags(wallDocument, hiddenChanged);
      hiddenWallSynced = true;
    } catch {
      hiddenWallSynced = false;
    }
  }

  const doorStateChanged = changes?.ds !== undefined;
  if (doorStateChanged) {
    await handleDoorStateVisibilityRefresh(wallDocument, changes.ds);
  }

  try {
    await refreshWallVisualsForControlledToken();
    visualsRefreshed = true;
  } catch {
    visualsRefreshed = false;
  }

  return {
    hiddenWallSynced,
    doorStateRefreshed: doorStateChanged,
    visualsRefreshed,
  };
}

export async function handleWallDeleted(
  wallDocument,
  {
    cleanupDeletedWallVisualsAndRefresh = defaultCleanupDeletedWallVisualsAndRefresh,
  } = {},
) {
  try {
    await cleanupDeletedWallVisualsAndRefresh(wallDocument);
    return { cleaned: true };
  } catch {
    return { cleaned: false, reason: 'cleanup-error' };
  }
}
