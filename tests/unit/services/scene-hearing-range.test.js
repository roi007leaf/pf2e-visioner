import '../../setup.js';

import {
  applyActiveSceneHearingRangeLimit,
  clearActiveSceneHearingRangeCache,
  getActiveSceneHearingRange,
} from '../../../scripts/services/scene-hearing-range.js';

describe('scene hearing range', () => {
  test('caches active scene hearing range lookups for repeated visibility checks', () => {
    const scene = {
      id: 'scene-1',
      flags: { pf2e: { hearingRange: 60 } },
    };
    const scenes = {
      get: jest.fn(() => scene),
      values: jest.fn(() => [scene]),
    };
    const options = {
      canvasRef: { scene },
      gameRef: { scenes },
      sceneId: 'scene-1',
    };

    expect(getActiveSceneHearingRange(options)).toBe(60);
    expect(getActiveSceneHearingRange(options)).toBe(60);

    expect(scenes.get).toHaveBeenCalledTimes(1);
    expect(scenes.values).toHaveBeenCalledTimes(1);
  });

  test('clears cached active scene hearing range when scene data changes', () => {
    const scene = {
      id: 'scene-1',
      flags: { pf2e: { hearingRange: 60 } },
    };
    const options = {
      canvasRef: { scene },
      gameRef: { scenes: { get: () => scene, values: () => [scene] } },
      sceneId: 'scene-1',
    };

    expect(applyActiveSceneHearingRangeLimit(120, options)).toBe(60);

    scene.flags.pf2e.hearingRange = 90;
    clearActiveSceneHearingRangeCache(scene);

    expect(applyActiveSceneHearingRangeLimit(120, options)).toBe(90);
  });
});
