import '../../setup.js';

import {
  handleWallCreated,
  handleWallDeleted,
  handleWallUpdated,
} from '../../../scripts/services/Walls/wall-lifecycle.js';

const MODULE_ID = 'pf2e-visioner';

describe('wall lifecycle service', () => {
  test('refreshes wall visuals when a wall is created', async () => {
    const refreshWallVisualsForControlledToken = jest.fn().mockResolvedValue(undefined);

    const result = await handleWallCreated({ refreshWallVisualsForControlledToken });

    expect(result).toEqual({ refreshed: true });
    expect(refreshWallVisualsForControlledToken).toHaveBeenCalledTimes(1);
  });

  test('preserves silent create-wall visual refresh failures', async () => {
    const result = await handleWallCreated({
      refreshWallVisualsForControlledToken: jest.fn().mockRejectedValue(new Error('visual failed')),
    });

    expect(result).toEqual({ refreshed: false, reason: 'visual-refresh-error' });
  });

  test('syncs hidden wall flags before refreshing visuals when hiddenWall changes', async () => {
    const wallDocument = { id: 'wall-1' };
    const calls = [];
    const syncHiddenWallTokenFlags = jest.fn(async () => calls.push('sync'));
    const refreshWallVisualsForControlledToken = jest.fn(async () => calls.push('visual'));

    const result = await handleWallUpdated(
      wallDocument,
      { flags: { [MODULE_ID]: { hiddenWall: true } } },
      {
        syncHiddenWallTokenFlags,
        refreshWallVisualsForControlledToken,
      },
    );

    expect(result).toEqual({
      hiddenWallSynced: true,
      doorStateRefreshed: false,
      visualsRefreshed: true,
    });
    expect(syncHiddenWallTokenFlags).toHaveBeenCalledWith(wallDocument, true);
    expect(calls).toEqual(['sync', 'visual']);
  });

  test('swallows hidden wall sync failures but still refreshes visuals', async () => {
    const refreshWallVisualsForControlledToken = jest.fn().mockResolvedValue(undefined);

    const result = await handleWallUpdated(
      { id: 'wall-1' },
      { flags: { [MODULE_ID]: { hiddenWall: false } } },
      {
        syncHiddenWallTokenFlags: jest.fn().mockRejectedValue(new Error('sync failed')),
        refreshWallVisualsForControlledToken,
      },
    );

    expect(result).toEqual({
      hiddenWallSynced: false,
      doorStateRefreshed: false,
      visualsRefreshed: true,
    });
    expect(refreshWallVisualsForControlledToken).toHaveBeenCalledTimes(1);
  });

  test('refreshes door state before wall visuals when door state changes', async () => {
    const wallDocument = { id: 'door-1' };
    const calls = [];
    const handleDoorStateVisibilityRefresh = jest.fn(async () => calls.push('door'));
    const refreshWallVisualsForControlledToken = jest.fn(async () => calls.push('visual'));

    const result = await handleWallUpdated(
      wallDocument,
      { ds: 1 },
      {
        handleDoorStateVisibilityRefresh,
        refreshWallVisualsForControlledToken,
      },
    );

    expect(result).toEqual({
      hiddenWallSynced: false,
      doorStateRefreshed: true,
      visualsRefreshed: true,
    });
    expect(handleDoorStateVisibilityRefresh).toHaveBeenCalledWith(wallDocument, 1);
    expect(calls).toEqual(['door', 'visual']);
  });

  test('preserves door state refresh failures as update-wall failures', async () => {
    const failure = new Error('door failed');
    const refreshWallVisualsForControlledToken = jest.fn();

    await expect(
      handleWallUpdated(
        { id: 'door-1' },
        { ds: 0 },
        {
          handleDoorStateVisibilityRefresh: jest.fn().mockRejectedValue(failure),
          refreshWallVisualsForControlledToken,
        },
      ),
    ).rejects.toBe(failure);
    expect(refreshWallVisualsForControlledToken).not.toHaveBeenCalled();
  });

  test('cleans deleted wall visuals and preserves silent cleanup failures', async () => {
    const wallDocument = { id: 'wall-1' };
    const cleanupDeletedWallVisualsAndRefresh = jest.fn().mockResolvedValue(undefined);

    await expect(
      handleWallDeleted(wallDocument, { cleanupDeletedWallVisualsAndRefresh }),
    ).resolves.toEqual({ cleaned: true });
    expect(cleanupDeletedWallVisualsAndRefresh).toHaveBeenCalledWith(wallDocument);

    await expect(
      handleWallDeleted(wallDocument, {
        cleanupDeletedWallVisualsAndRefresh: jest
          .fn()
          .mockRejectedValue(new Error('cleanup failed')),
      }),
    ).resolves.toEqual({ cleaned: false, reason: 'cleanup-error' });
  });
});
