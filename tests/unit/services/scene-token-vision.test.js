import '../../setup.js';

import { isSceneTokenVisionDisabled } from '../../../scripts/services/scene-token-vision.js';
import { SystemStateProvider } from '../../../scripts/visibility/auto-visibility/core/SystemStateProvider.js';

describe('scene Token Vision bypass', () => {
  test('bypasses only when scene Token Vision is explicitly disabled', () => {
    expect(isSceneTokenVisionDisabled({ tokenVision: false })).toBe(true);
    expect(isSceneTokenVisionDisabled({ tokenVision: true })).toBe(false);
    expect(isSceneTokenVisionDisabled({})).toBe(false);
    expect(isSceneTokenVisionDisabled(null)).toBe(false);
  });

  test('AVS event admission stops when scene Token Vision is disabled', () => {
    const originalCanvas = global.canvas;
    global.canvas = {
      ...global.canvas,
      scene: { ...global.canvas?.scene, tokenVision: false },
    };
    global.game.user.isGM = true;
    global.game.settings.set('pf2e-visioner', 'avsOnlyInCombat', false);
    const provider = new SystemStateProvider();
    provider.setEnabled(true);

    try {
      expect(provider.shouldProcessEvents()).toBe(false);
    } finally {
      global.canvas = originalCanvas;
    }
  });
});
