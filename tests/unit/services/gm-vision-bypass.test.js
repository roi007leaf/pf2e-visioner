import '../../setup.js';

import {
  clearGmVisionBypassCache,
  isGmVisionModeActive,
  shouldBypassAvsForGmVision,
} from '../../../scripts/services/gm-vision-bypass.js';

describe('GM Vision core-visibility policy', () => {
  let originalCanvas;

  beforeEach(() => {
    originalCanvas = global.canvas;
    global.game.user.isGM = true;
    global.game.settings.set('pf2e', 'gmVision', true);
    global.game.settings.set('pf2e-visioner', 'autoVisibilityEnabled', false);
    global.canvas = {
      ...global.canvas,
      ready: false,
      scene: { getFlag: jest.fn(() => false) },
    };
    clearGmVisionBypassCache();
  });

  afterEach(() => {
    global.game.settings.set('pf2e', 'gmVision', false);
    global.game.settings.set('pf2e-visioner', 'autoVisibilityEnabled', false);
    global.canvas = originalCanvas;
    clearGmVisionBypassCache();
  });

  test('AVS off + GM Vision on bypasses automatic Visioner visibility', () => {
    expect(shouldBypassAvsForGmVision()).toBe(true);
  });

  test('explicit pair visibility is also bypassed while GM Vision is on', () => {
    const observer = createMockToken({ id: 'observer' });
    const target = createMockToken({
      id: 'target',
      flags: {
        'pf2e-visioner': {
          'avs-override-from-observer': { state: 'undetected', source: 'manual_action' },
        },
      },
    });

    expect(shouldBypassAvsForGmVision(observer, target)).toBe(true);
  });

  test('cover-only pair override does not activate Visioner visibility', () => {
    const observer = createMockToken({ id: 'observer' });
    const target = createMockToken({
      id: 'target',
      flags: {
        'pf2e-visioner': {
          'avs-override-from-observer': {
            state: 'observed',
            source: 'take_cover_action',
            coverOnly: true,
          },
        },
      },
    });

    expect(shouldBypassAvsForGmVision(observer, target)).toBe(true);
  });

  test('AVS conflict warning stays inactive when AVS itself is off', () => {
    expect(isGmVisionModeActive()).toBe(false);
  });
});
