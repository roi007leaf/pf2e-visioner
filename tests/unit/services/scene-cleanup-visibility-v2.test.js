import {
  cleanupDeletedToken,
  restoreDeletedTokenMaps,
} from '../../../scripts/services/scene-cleanup.js';

describe('scene cleanup visibilityV2 support', () => {
  let scene;
  let observer;
  let deletedToken;
  let sceneFlags;

  beforeEach(() => {
    sceneFlags = {};
    scene = {
      getFlag: jest.fn((moduleId, key) => sceneFlags[moduleId]?.[key] ?? {}),
      setFlag: jest.fn(async (moduleId, key, value) => {
        sceneFlags[moduleId] ??= {};
        sceneFlags[moduleId][key] = value;
        return true;
      }),
      updateEmbeddedDocuments: jest.fn().mockResolvedValue(true),
    };

    observer = global.createMockToken({
      id: 'observer',
      flags: {
        'pf2e-visioner': {
          visibilityV2: {
            target: {
              detectionState: 'hidden',
              hasConcealment: true,
              coverState: 'none',
              detectionSense: null,
              awarenessState: null,
            },
          },
        },
      },
    });
    deletedToken = global.createMockToken({ id: 'target' });
    deletedToken.document.parent = scene;

    global.game.user.isGM = true;
    global.canvas.scene = scene;
    global.canvas.tokens.placeables = [observer];
    global.canvas.tokens.get = jest.fn((id) => (id === observer.document.id ? observer : null));
  });

  test('cleanupDeletedToken removes deleted targets from visibilityV2 maps', async () => {
    await cleanupDeletedToken(deletedToken.document);

    expect(scene.updateEmbeddedDocuments).toHaveBeenCalledWith(
      'Token',
      [
        expect.objectContaining({
          _id: 'observer',
          'flags.pf2e-visioner.visibilityV2': {},
        }),
      ],
      { diff: false },
    );
  });

  test('restoreDeletedTokenMaps restores canonical profile data after undo', async () => {
    sceneFlags = {
      'pf2e-visioner': {
        deletedEntryCache: {
          target: {
            visibilityByObserver: {
              observer: 'hidden',
            },
            perceptionProfilesByObserver: {
              observer: {
                detectionState: 'hidden',
                hasConcealment: true,
                coverState: 'none',
                detectionSense: null,
                awarenessState: null,
              },
            },
            coverByObserver: {},
          },
        },
      },
    };

    await restoreDeletedTokenMaps(deletedToken.document);

    expect(scene.updateEmbeddedDocuments).toHaveBeenCalledWith(
      'Token',
      [
        expect.objectContaining({
          _id: 'observer',
          'flags.pf2e-visioner.visibilityV2': {
            target: expect.objectContaining({
              detectionState: 'hidden',
              hasConcealment: true,
            }),
          },
        }),
      ],
      { diff: false },
    );
  });
});
