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

jest.mock('../../../scripts/cover/auto-cover/AutoCoverSystem.js', () => ({
  default: {},
}));

jest.mock('../../../scripts/regions/SenseSuppressionRegionBehavior.js', () => ({
  SenseSuppressionRegionBehavior: {
    getSuppressedSensesForObserver: jest.fn(() => new Set()),
    getSuppressedSensesForTarget: jest.fn(() => new Set()),
  },
}));

describe('HoverTooltips unnoticed badges', () => {
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
      isOwner: true,
      document: { id, width: 1, height: 1 },
      center: { x: x + 25, y: 25 },
    };
  }

  test('renders unnoticed as a purple visibility hover badge without sense badge', async () => {
    const observer = makeToken('observer', 0);
    const target = makeToken('target', 100);
    global.canvas.tokens.placeables = [observer, target];

    mockGetVisibilityMap.mockReturnValue({ target: 'unnoticed' });
    mockGetDetectionBetween.mockReturnValue({ sense: 'vision' });

    const { setTooltipMode, showVisibilityIndicators } = await import(
      '../../../scripts/services/HoverTooltips.js'
    );
    const { VISIBILITY_STATES } = await import('../../../scripts/constants.js');

    setTooltipMode('observer');
    showVisibilityIndicators(observer);

    expect(VISIBILITY_STATES.unnoticed.color).toBe('var(--visibility-unnoticed, #9c27b0)');
    const badge = document.querySelector('.pf2e-visioner-tooltip-badge.visibility-unnoticed');
    expect(badge).toBeTruthy();
    expect(badge.querySelector('i')?.className).toContain('fa-user-secret');
    expect(document.querySelector('.pf2e-visioner-sense-badge')).toBeNull();
  });
});
