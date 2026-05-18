import '../../setup.js';

import {
  cleanupDeletedWallVisualsAndRefresh,
  getControlledWallVisualObserverId,
  refreshOptimizedWallVisualsForObserverId,
  refreshWallVisualsForControlledToken,
  refreshWallVisualsForObserverId,
} from '../../../scripts/services/wall-visual-refresh.js';

describe('wall visual refresh service', () => {
  test('uses the first controlled token id as wall visual observer', () => {
    expect(getControlledWallVisualObserverId([{ id: 'observer' }, { id: 'other' }])).toBe(
      'observer',
    );
    expect(getControlledWallVisualObserverId([])).toBeNull();
  });

  test('refreshes wall visuals for the current controlled observer', async () => {
    const updateWallVisuals = jest.fn().mockResolvedValue(undefined);

    await refreshWallVisualsForControlledToken({
      getControlledTokens: () => [{ id: 'observer' }],
      loadVisualEffects: async () => ({ updateWallVisuals }),
    });

    expect(updateWallVisuals).toHaveBeenCalledWith('observer');
  });

  test('refreshes wall visuals for an explicit observer id', async () => {
    const updateWallVisuals = jest.fn().mockResolvedValue(undefined);

    await refreshWallVisualsForObserverId('configured-observer', {
      loadVisualEffects: async () => ({ updateWallVisuals }),
    });

    expect(updateWallVisuals).toHaveBeenCalledWith('configured-observer');
  });

  test('refreshes optimized wall visuals through the same observer interface', async () => {
    const updateWallVisuals = jest.fn().mockResolvedValue(undefined);

    await refreshOptimizedWallVisualsForObserverId('optimized-observer', {
      loadVisualEffects: async () => ({ updateWallVisuals }),
    });

    expect(updateWallVisuals).toHaveBeenCalledWith('optimized-observer');
  });

  test('refreshes wall visuals with null observer when no token is controlled', async () => {
    const updateWallVisuals = jest.fn().mockResolvedValue(undefined);

    await refreshWallVisualsForControlledToken({
      getControlledTokens: () => [],
      loadVisualEffects: async () => ({ updateWallVisuals }),
    });

    expect(updateWallVisuals).toHaveBeenCalledWith(null);
  });

  test('cleans deleted wall visuals, performs mass cleanup for few remaining walls, and refreshes once', async () => {
    const wallDocument = { id: 'wall-1' };
    const cleanupDeletedWallVisuals = jest.fn().mockResolvedValue(undefined);
    const cleanupAllWallIndicators = jest.fn().mockResolvedValue(undefined);
    const updateWallVisuals = jest.fn().mockResolvedValue(undefined);

    await cleanupDeletedWallVisualsAndRefresh(wallDocument, {
      getRemainingWallCount: () => 2,
      getControlledTokens: () => [{ id: 'observer' }],
      loadVisualEffects: async () => ({
        cleanupDeletedWallVisuals,
        cleanupAllWallIndicators,
        updateWallVisuals,
      }),
    });

    expect(cleanupDeletedWallVisuals).toHaveBeenCalledWith(wallDocument);
    expect(cleanupAllWallIndicators).toHaveBeenCalledTimes(1);
    expect(updateWallVisuals).toHaveBeenCalledWith('observer');
  });

  test('skips mass cleanup when enough walls remain', async () => {
    const cleanupAllWallIndicators = jest.fn().mockResolvedValue(undefined);

    await cleanupDeletedWallVisualsAndRefresh(
      { id: 'wall-1' },
      {
        getRemainingWallCount: () => 3,
        getControlledTokens: () => [],
        loadVisualEffects: async () => ({
          cleanupDeletedWallVisuals: jest.fn().mockResolvedValue(undefined),
          cleanupAllWallIndicators,
          updateWallVisuals: jest.fn().mockResolvedValue(undefined),
        }),
      },
    );

    expect(cleanupAllWallIndicators).not.toHaveBeenCalled();
  });
});
