/**
 * @jest-environment jsdom
 */

import { jest } from '@jest/globals';
import '../../setup.js';

const mockGetVisibilityFactors = jest.fn();

jest.mock('../../../scripts/api.js', () => ({
  Pf2eVisionerApi: {
    getVisibilityFactors: mockGetVisibilityFactors,
  },
}));

jest.mock('../../../scripts/utils.js', () => ({
  getVisibilityBetween: jest.fn(() => 'observed'),
  getVisibilityMap: jest.fn(() => ({})),
}));

jest.mock('../../../scripts/stores/detection-map.js', () => ({
  getDetectionBetween: jest.fn(),
}));

function makeToken(id, x = 0) {
  return {
    id,
    x,
    y: 0,
    isVisible: true,
    visible: true,
    renderable: true,
    mesh: { visible: true, renderable: true, alpha: 1 },
    bounds: { width: 50, height: 50 },
    document: { id, width: 1, height: 1 },
    on: jest.fn(),
    off: jest.fn(),
  };
}

function getHookHandler(eventName) {
  return global.Hooks.on.mock.calls.find(([hookName]) => hookName === eventName)?.[1];
}

describe('hover tooltip factor lifecycle', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    document.body.innerHTML = '';

    global.PIXI = {
      Point: class Point {
        constructor(x, y) {
          this.x = x;
          this.y = y;
        }
      },
      Container: class Container {
        destroy = jest.fn();
      },
    };

    global.canvas.app = {
      view: {
        getBoundingClientRect: jest.fn(() => ({ left: 0, top: 0 })),
      },
      ticker: {
        add: jest.fn(),
        remove: jest.fn(),
      },
    };
    global.canvas.stage = {
      pivot: { x: 0, y: 0 },
      scale: { x: 1 },
    };
    global.canvas.animatePan = jest.fn();
    global.canvas.tokens.addChild = jest.fn();
    global.canvas.tokens.toGlobal = jest.fn((point) => point);
    global.canvas.tokens.get = jest.fn();

    global.game.user.isGM = true;
    global.game.settings.get = jest.fn((moduleId, settingId) => {
      if (moduleId === 'pf2e-visioner' && settingId === 'enableHoverTooltips') return true;
      if (moduleId === 'pf2e-visioner' && settingId === 'tooltipFontSize') return 'medium';
      return false;
    });
  });

  test('scene teardown invalidates pending factor requests before they can append badges', async () => {
    const observer = makeToken('observer', 0);
    const target = makeToken('target', 100);
    global.canvas.tokens.controlled = [observer];
    global.canvas.tokens.placeables = [observer, target];

    let resolveFactors;
    mockGetVisibilityFactors.mockReturnValue(
      new Promise((resolve) => {
        resolveFactors = resolve;
      }),
    );

    const { HoverTooltips, initializeHoverTooltips, showVisibilityFactorsOverlay } = await import(
      '../../../scripts/services/HoverTooltips.js'
    );

    initializeHoverTooltips();
    showVisibilityFactorsOverlay();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockGetVisibilityFactors).toHaveBeenCalledWith('observer', 'target');

    getHookHandler('canvasTearDown')();
    resolveFactors({ state: 'hidden', reasons: ['Blocked by visibility'] });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(HoverTooltips.isShowingFactorsOverlay).toBe(false);
    expect(HoverTooltips.visibilityBadges.size).toBe(0);
    expect(document.querySelectorAll('.pf2e-visioner-factor-badge')).toHaveLength(0);
  });
});
