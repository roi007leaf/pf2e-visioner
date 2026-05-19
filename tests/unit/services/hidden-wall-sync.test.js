import '../../setup.js';

import { MODULE_ID } from '../../../scripts/constants.js';
import {
  buildHiddenWallTokenUpdates,
  getHiddenWallSyncWallIds,
  syncHiddenWallTokenFlags,
} from '../../../scripts/services/Walls/hidden-wall-sync.js';

function makeToken(id, walls = {}) {
  return {
    document: {
      id,
      getFlag: jest.fn((moduleId, key) => {
        if (moduleId === MODULE_ID && key === 'walls') return walls;
        return undefined;
      }),
    },
  };
}

describe('hidden wall sync service', () => {
  test('expands a wall document to include connected wall ids', () => {
    const doc = { id: 'wall-a' };
    const connected = [{ id: 'wall-b' }, { id: 'wall-c' }];

    expect(
      getHiddenWallSyncWallIds(doc, {
        getConnectedWallDocsBySourceId: jest.fn(() => connected),
      }),
    ).toEqual(['wall-a', 'wall-b', 'wall-c']);
  });

  test('builds token updates that mark source and connected walls hidden', () => {
    const tokenA = makeToken('token-a', { existing: 'observed' });
    const tokenB = makeToken('token-b', { 'wall-a': 'hidden', 'wall-b': 'hidden' });

    const updates = buildHiddenWallTokenUpdates({
      tokens: [tokenA, tokenB],
      wallIds: ['wall-a', 'wall-b'],
      hidden: true,
    });

    expect(updates).toEqual([
      {
        _id: 'token-a',
        [`flags.${MODULE_ID}.walls`]: {
          existing: 'observed',
          'wall-a': 'hidden',
          'wall-b': 'hidden',
        },
      },
    ]);
  });

  test('builds token updates that remove source and connected walls while preserving unrelated walls', () => {
    const tokenA = makeToken('token-a', {
      existing: 'observed',
      'wall-a': 'hidden',
      'wall-b': 'hidden',
    });
    const tokenB = makeToken('token-b', { existing: 'hidden' });

    const updates = buildHiddenWallTokenUpdates({
      tokens: [tokenA, tokenB],
      wallIds: ['wall-a', 'wall-b'],
      hidden: false,
    });

    expect(updates).toEqual([
      {
        _id: 'token-a',
        [`flags.${MODULE_ID}.walls`]: {
          existing: 'observed',
        },
      },
    ]);
  });

  test('sync updates token documents as GM and mirrors the hidden flag', async () => {
    const scene = {
      updateEmbeddedDocuments: jest.fn().mockResolvedValue(undefined),
    };
    const mirrorHiddenFlagToConnected = jest.fn().mockResolvedValue(undefined);
    const doc = { id: 'wall-a' };

    const result = await syncHiddenWallTokenFlags(doc, true, {
      tokens: [makeToken('token-a', {})],
      scene,
      isGM: true,
      getConnectedWallDocsBySourceId: jest.fn(() => [{ id: 'wall-b' }]),
      mirrorHiddenFlagToConnected,
    });

    expect(scene.updateEmbeddedDocuments).toHaveBeenCalledWith(
      'Token',
      [
        {
          _id: 'token-a',
          [`flags.${MODULE_ID}.walls`]: {
            'wall-a': 'hidden',
            'wall-b': 'hidden',
          },
        },
      ],
      { diff: false },
    );
    expect(mirrorHiddenFlagToConnected).toHaveBeenCalledWith(doc, true);
    expect(result.tokenDocumentsUpdated).toBe(true);
  });

  test('sync does not update token documents for non-GM clients but still mirrors connected walls', async () => {
    const scene = {
      updateEmbeddedDocuments: jest.fn().mockResolvedValue(undefined),
    };
    const mirrorHiddenFlagToConnected = jest.fn().mockResolvedValue(undefined);
    const doc = { id: 'wall-a' };

    const result = await syncHiddenWallTokenFlags(doc, false, {
      tokens: [makeToken('token-a', { 'wall-a': 'hidden' })],
      scene,
      isGM: false,
      getConnectedWallDocsBySourceId: jest.fn(() => []),
      mirrorHiddenFlagToConnected,
    });

    expect(scene.updateEmbeddedDocuments).not.toHaveBeenCalled();
    expect(mirrorHiddenFlagToConnected).toHaveBeenCalledWith(doc, false);
    expect(result.tokenDocumentsUpdated).toBe(false);
  });
});
