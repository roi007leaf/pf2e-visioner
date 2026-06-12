/**
 * @jest-environment jsdom
 */

import { jest } from '@jest/globals';
import '../../setup.js';

const mockGetVisibilityMap = jest.fn();
const mockGetCoverMap = jest.fn(() => ({}));
const mockGetDetectionBetween = jest.fn();

jest.mock('../../../scripts/utils.js', () => ({
  getVisibilityMap: mockGetVisibilityMap,
  getCoverMap: mockGetCoverMap,
}));

jest.mock('../../../scripts/stores/detection-map.js', () => ({
  getDetectionBetween: mockGetDetectionBetween,
}));

jest.mock('../../../scripts/api.js', () => ({
  Pf2eVisionerApi: {
    getVisibilityFactors: jest.fn(),
  },
}));

jest.mock('../../../scripts/cover/auto-cover/AutoCoverSystem.js', () => ({
  default: {},
}));

jest.mock('../../../scripts/regions/SenseSuppressionRegionBehavior.js', () => ({
  SenseSuppressionRegionBehavior: {
    getSuppressedSensesForObserver: jest.fn(() => new Set()),
    getSuppressedSensesForTarget: jest.fn(() => new Set()),
  },
}));

describe('HoverTooltips canvas rect caching', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '';
    mockGetVisibilityMap.mockReset();
    mockGetCoverMap.mockReturnValue({});
    mockGetDetectionBetween.mockReset();

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
    global.canvas.tokens.addChild = jest.fn();
    global.canvas.tokens.toGlobal = jest.fn((point) => point);

    global.game.user.isGM = true;
    global.game.settings.get = jest.fn((moduleId, settingId) => {
      if (moduleId === 'pf2e-visioner' && settingId === 'enableHoverTooltips') return true;
      if (moduleId === 'pf2e-visioner' && settingId === 'autoVisibilityEnabled') return true;
      if (moduleId === 'pf2e-visioner' && settingId === 'tooltipFontSize') return 'medium';
      return false;
    });
  });

  function makeToken(id, x) {
    return {
      id,
      x,
      y: 0,
      isVisible: true,
      visible: true,
      renderable: true,
      isOwner: true,
      document: { id, width: 1, height: 1 },
      center: { x: x + 25, y: 25 },
      mesh: { visible: true, renderable: true, alpha: 1 },
    };
  }

  test('rendering many visibility indicators measures the canvas rect at most once', async () => {
    const observer = makeToken('observer', 0);
    const targets = Array.from({ length: 8 }, (_, index) =>
      makeToken(`target-${index}`, 100 + index * 50),
    );
    global.canvas.tokens.placeables = [observer, ...targets];

    mockGetVisibilityMap.mockReturnValue(
      Object.fromEntries(targets.map((target) => [target.document.id, 'hidden'])),
    );
    mockGetDetectionBetween.mockReturnValue(null);

    const { setTooltipMode, showVisibilityIndicators } = await import(
      '../../../scripts/services/HoverTooltips.js'
    );

    setTooltipMode('observer');
    showVisibilityIndicators(observer);

    expect(document.querySelectorAll('.pf2e-visioner-tooltip-badge').length).toBeGreaterThan(4);
    expect(global.canvas.app.view.getBoundingClientRect.mock.calls.length).toBeLessThanOrEqual(2);
  });
});
