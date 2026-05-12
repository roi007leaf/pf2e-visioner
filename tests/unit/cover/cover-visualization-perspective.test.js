/**
 * @jest-environment jsdom
 */

import { jest } from '@jest/globals';
import '../../setup.js';

const mockDetectCoverBetweenTokens = jest.fn(() => 'standard');
const mockGetVisibilityBetween = jest.fn(() => 'observed');

jest.mock('../../../scripts/cover/auto-cover/AutoCoverSystem.js', () => ({
  __esModule: true,
  default: {
    detectCoverBetweenTokens: (...args) => mockDetectCoverBetweenTokens(...args),
  },
}));

jest.mock('../../../scripts/utils.js', () => ({
  getVisibilityBetween: (...args) => mockGetVisibilityBetween(...args),
}));

describe('CoverVisualization token perspective', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    global.PIXI = {
      Point: class Point {
        constructor(x = 0, y = 0) {
          this.x = x;
          this.y = y;
        }
      },
      Graphics: class Graphics {
        clear = jest.fn();
        beginFill = jest.fn();
        drawRect = jest.fn();
        endFill = jest.fn();
        lineStyle = jest.fn();
        destroy = jest.fn();
      },
    };

    global.game.user.isGM = true;
    global.game.canvas = global.canvas;
    global.game.settings.get = jest.fn((moduleId, settingId) => {
      if (moduleId !== 'pf2e-visioner') return false;
      if (settingId === 'autoCoverVisualizationRespectFogForGM') return true;
      if (settingId === 'colorblindMode') return 'none';
      return false;
    });

    global.canvas.grid = { size: 50 };
    global.canvas.dimensions = {
      sceneRect: { x: 0, y: 0, width: 250, height: 250 },
    };
    global.canvas.stage = {
      worldTransform: {
        applyInverse: (point, out = { x: 0, y: 0 }) => {
          out.x = point.x;
          out.y = point.y;
          return out;
        },
      },
    };
    global.canvas.app = {
      renderer: {
        screen: { width: 250, height: 250 },
      },
    };
    global.canvas.interface = {
      addChild: jest.fn(),
    };
    global.canvas.visibility = {
      testVisibility: jest.fn(() => false),
    };
    global.canvas.sight = {
      testVisibility: jest.fn(() => false),
    };
  });

  function makeToken(id, x, y) {
    return {
      id,
      actor: {
        type: 'npc',
        system: {
          traits: {
            size: { value: 'med' },
          },
        },
      },
      center: { x, y },
      getCenterPoint: () => ({ x, y }),
      isVisible: true,
      vision: {
        fov: {
          contains: jest.fn(() => true),
        },
      },
      document: {
        id,
        x: x - 25,
        y: y - 25,
        width: 1,
        height: 1,
        hidden: false,
      },
    };
  }

  test('GM fog-respecting overlay uses the selected token FOV before aggregate canvas visibility', async () => {
    const selected = makeToken('selected', 75, 75);
    const hovered = makeToken('target', 175, 75);
    global.canvas.tokens.controlled = [selected];
    global.canvas.tokens.placeables = [selected, hovered];

    const { CoverVisualization } = await import('../../../scripts/cover/CoverVisualization.js');
    const visualization = new CoverVisualization();

    visualization.createCoverOverlay(hovered);

    expect(mockDetectCoverBetweenTokens).toHaveBeenCalled();
    expect(global.canvas.visibility.testVisibility).not.toHaveBeenCalled();
    expect(selected.vision.fov.contains).toHaveBeenCalled();

    visualization.cleanup();
  });
});
