import { jest } from '@jest/globals';

import {
  buildHiddenWallSightUpdate,
  buildOriginalSightOverrideUpdate,
  sceneHasObservedWallToken,
  tokenHasObservedWall,
} from '../../../scripts/services/Walls/wall-sight-policy.js';
import { applyWallSightUpdates } from '../../../scripts/services/Walls/wall-visual-update-application.js';

describe('wall sight policy', () => {
  test('detects observed wall flags on tokens safely', () => {
    const token = {
      document: {
        getFlag: jest.fn(() => ({ observed: 'observed', hidden: 'hidden' })),
      },
    };

    expect(tokenHasObservedWall(token, 'observed', 'pf2e-visioner')).toBe(true);
    expect(tokenHasObservedWall(token, 'hidden', 'pf2e-visioner')).toBe(false);
    expect(sceneHasObservedWallToken([null, token], 'observed', 'pf2e-visioner')).toBe(true);
  });

  test('disabled see-through policy only restores original sight', () => {
    const wallDocument = {
      id: 'wall',
      sight: 0,
      getFlag: jest.fn((moduleId, flagName) => (flagName === 'originalSight' ? 1 : undefined)),
    };

    expect(
      buildHiddenWallSightUpdate({
        wallDocument,
        moduleId: 'pf2e-visioner',
        seeThroughEnabled: false,
      }),
    ).toEqual({
      _id: 'wall',
      sight: 1,
      'flags.pf2e-visioner.originalSight': null,
    });
  });

  test('enabled see-through policy stores current sight when any token observes wall', () => {
    const wallDocument = {
      id: 'wall',
      sight: 1,
      getFlag: jest.fn(() => undefined),
    };
    const token = {
      document: {
        getFlag: jest.fn(() => ({ wall: 'observed' })),
      },
    };

    expect(
      buildHiddenWallSightUpdate({
        wallDocument,
        moduleId: 'pf2e-visioner',
        sceneTokens: [token],
        seeThroughEnabled: true,
      }),
    ).toEqual({
      _id: 'wall',
      sight: 0,
      'flags.pf2e-visioner.originalSight': 1,
    });
  });

  test('override policy preserves previously stored original sight', () => {
    const wallDocument = {
      id: 'wall',
      sight: 2,
      getFlag: jest.fn((moduleId, flagName) => (flagName === 'originalSight' ? 1 : undefined)),
    };

    expect(buildOriginalSightOverrideUpdate(wallDocument, 'pf2e-visioner')).toEqual({
      _id: 'wall',
      sight: 0,
      'flags.pf2e-visioner.originalSight': 1,
    });
  });

  test('applyWallSightUpdates updates walls and refreshes perception/tokens', async () => {
    const scene = { updateEmbeddedDocuments: jest.fn().mockResolvedValue([]) };
    const perception = { update: jest.fn() };
    const refreshTokens = jest.fn();
    const tokens = [{ id: 'token' }];
    const updates = [{ _id: 'wall', sight: 1 }];

    await expect(
      applyWallSightUpdates({ updates, scene, perception, refreshTokens, tokens }),
    ).resolves.toBe(true);

    expect(scene.updateEmbeddedDocuments).toHaveBeenCalledWith('Wall', updates, { diff: false });
    expect(perception.update).toHaveBeenCalledWith({
      refreshVision: true,
      refreshOcclusion: true,
    });
    expect(refreshTokens).toHaveBeenCalledWith(tokens);
  });
});
