import {
  getPerceptionProfileBetween,
  getPerceptionProfileMap,
  getVisibilityBetween,
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
});
