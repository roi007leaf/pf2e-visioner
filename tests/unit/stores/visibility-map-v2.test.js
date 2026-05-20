import {
  getPerceptionProfileBetween,
  getPerceptionProfileMap,
  getVisibilityBetween,
  setVisibilityMapsBatch,
  setPerceptionProfileBetween,
  setVisibilityBetween,
} from '../../../scripts/stores/visibility-map.js';

describe('Visibility Map V2 profile storage', () => {
  let observer;
  let target;

  beforeEach(() => {
    observer = global.createMockToken({ id: 'observer' });
    target = global.createMockToken({ id: 'target' });
    global.game.user.isGM = true;
  });

  test('setVisibilityBetween writes concealed only as observed plus concealment in visibilityV2', async () => {
    await setVisibilityBetween(observer, target, 'concealed', { skipEphemeralUpdate: true });

    expect(observer.document.setFlag).not.toHaveBeenCalledWith(
      'pf2e-visioner',
      'visibility',
      expect.anything(),
    );
    expect(observer.document.setFlag).toHaveBeenCalledWith(
      'pf2e-visioner',
      'visibilityV2',
      {
        target: expect.objectContaining({
          detectionState: 'observed',
          hasConcealment: true,
          coverState: 'none',
          detectionSense: null,
          awarenessState: null,
        }),
      },
    );
  });

  test('runtime readers ignore legacy visibility maps after v2 migration support', () => {
    observer.document.getFlag.mockImplementation((moduleId, key) => {
      if (moduleId !== 'pf2e-visioner') return null;
      if (key === 'visibility') return { target: 'concealed' };
      return null;
    });

    expect(getPerceptionProfileBetween(observer, target)).toMatchObject({
      detectionState: 'observed',
      hasConcealment: false,
    });
    expect(getVisibilityBetween(observer, target)).toBe('observed');
  });

  test('getVisibilityBetween serializes visibilityV2 profiles for legacy callers', () => {
    observer.document.getFlag.mockImplementation((moduleId, key) => {
      if (moduleId !== 'pf2e-visioner') return null;
      if (key === 'visibilityV2') {
        return {
          target: {
            detectionState: 'observed',
            hasConcealment: true,
          },
        };
      }
      return {};
    });

    expect(getVisibilityBetween(observer, target)).toBe('concealed');
  });

  test('getVisibilityBetween reads only the requested visibilityV2 profile', () => {
    const requestedProfile = jest.fn(() => ({
      detectionState: 'hidden',
      hasConcealment: false,
    }));
    const unrelatedProfile = jest.fn(() => ({
      detectionState: 'undetected',
      hasConcealment: false,
    }));
    const visibilityV2 = {};
    Object.defineProperties(visibilityV2, {
      target: { enumerable: true, get: requestedProfile },
      unrelated: { enumerable: true, get: unrelatedProfile },
    });

    observer.document.getFlag.mockImplementation((moduleId, key) => {
      if (moduleId !== 'pf2e-visioner') return null;
      if (key === 'visibilityV2') return visibilityV2;
      return {};
    });

    expect(getVisibilityBetween(observer, target)).toBe('hidden');
    expect(requestedProfile).toHaveBeenCalledTimes(1);
    expect(unrelatedProfile).not.toHaveBeenCalled();
  });

  test('setPerceptionProfileBetween preserves concealment beside hidden detection', async () => {
    await setPerceptionProfileBetween(observer, target, {
      detectionState: 'hidden',
      hasConcealment: true,
    });

    expect(observer.document.setFlag).toHaveBeenCalledWith(
      'pf2e-visioner',
      'visibilityV2',
      {
        target: expect.objectContaining({
          detectionState: 'hidden',
          hasConcealment: true,
        }),
      },
    );
    expect(getPerceptionProfileBetween(observer, target)).toMatchObject({
      detectionState: 'hidden',
      hasConcealment: true,
    });
    expect(getVisibilityBetween(observer, target)).toBe('hidden');
  });

  test('setVisibilityBetween ignores unknown legacy states instead of persisting legacy data', async () => {
    await setVisibilityBetween(observer, target, 'invalid-state', { skipEphemeralUpdate: true });

    expect(observer.document.setFlag).not.toHaveBeenCalledWith(
      'pf2e-visioner',
      'visibility',
      expect.anything(),
    );
    expect(getVisibilityBetween(observer, target)).toBe('observed');
    expect(getPerceptionProfileMap(observer)).toEqual({});
  });

  test('setVisibilityMapsBatch persists multiple observer maps through scene bulk updates', async () => {
    const observerB = global.createMockToken({ id: 'observer-b' });
    const originalUpdateEmbeddedDocuments = global.canvas.scene.updateEmbeddedDocuments;
    global.canvas.scene.updateEmbeddedDocuments = jest.fn().mockResolvedValue([]);

    await setVisibilityMapsBatch([
      { token: observer, visibilityMap: { target: 'hidden' } },
      { token: observerB, visibilityMap: { target: 'concealed' } },
    ]);

    expect(global.canvas.scene.updateEmbeddedDocuments).toHaveBeenCalledWith(
      'Token',
      [
        {
          _id: 'observer',
          'flags.pf2e-visioner.visibilityV2': {
            target: expect.objectContaining({ detectionState: 'hidden' }),
          },
        },
        {
          _id: 'observer-b',
          'flags.pf2e-visioner.visibilityV2': {
            target: expect.objectContaining({
              detectionState: 'observed',
              hasConcealment: true,
            }),
          },
        },
      ],
      { diff: false, render: false, animate: false },
    );

    global.canvas.scene.updateEmbeddedDocuments = originalUpdateEmbeddedDocuments;
  });

  test('setVisibilityMapsBatch repairs stale bulk readback with direct observer writes', async () => {
    observer = global.createMockToken({
      id: 'observer',
      flags: {
        'pf2e-visioner': {
          visibilityV2: {
            target: {
              detectionState: 'undetected',
              hasConcealment: false,
              coverState: 'none',
              detectionSense: null,
              awarenessState: null,
            },
          },
        },
      },
    });
    const originalUpdateEmbeddedDocuments = global.canvas.scene.updateEmbeddedDocuments;
    global.canvas.scene.updateEmbeddedDocuments = jest.fn().mockResolvedValue([]);

    try {
      const result = await setVisibilityMapsBatch([
        { token: observer, visibilityMap: { target: 'observed' } },
      ]);

      expect(result).toEqual(expect.objectContaining({ repaired: 1 }));
      expect(global.canvas.scene.updateEmbeddedDocuments).toHaveBeenCalledWith(
        'Token',
        [
          {
            _id: 'observer',
            'flags.pf2e-visioner.visibilityV2': foundry.data.operators.ForcedDeletion,
          },
        ],
        { diff: false, render: false, animate: false },
      );
      expect(observer.document.unsetFlag).toHaveBeenCalledWith('pf2e-visioner', 'visibilityV2');
      expect(getVisibilityBetween(observer, target)).toBe('observed');
    } finally {
      global.canvas.scene.updateEmbeddedDocuments = originalUpdateEmbeddedDocuments;
    }
  });
});
