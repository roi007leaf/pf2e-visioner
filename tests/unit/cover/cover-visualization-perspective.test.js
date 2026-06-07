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

  test('GM fog-respecting overlay does not query Foundry isVisible for rendered hidden soundwave tokens', async () => {
    const selected = makeToken('selected', 75, 75);
    const hovered = makeToken('target', 175, 75);
    const isVisibleGetter = jest.fn(() => true);
    Object.defineProperty(hovered, 'isVisible', {
      configurable: true,
      get: isVisibleGetter,
    });
    hovered.visible = true;
    hovered.renderable = true;
    hovered.mesh = { visible: true, renderable: true, alpha: 1 };
    hovered.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas.tokens.controlled = [selected];
    global.canvas.tokens.placeables = [selected, hovered];

    const { CoverVisualization } = await import('../../../scripts/cover/CoverVisualization.js');
    const visualization = new CoverVisualization();

    visualization.createCoverOverlay(hovered);

    expect(mockDetectCoverBetweenTokens).toHaveBeenCalled();
    expect(isVisibleGetter).not.toHaveBeenCalled();

    visualization.cleanup();
  });

  test('GM fog-respecting overlay falls back to selected token LOS when FOV is unavailable', async () => {
    const selected = makeToken('selected', 75, 75);
    delete selected.vision.fov;
    selected.vision.los = {
      contains: jest.fn(() => true),
    };
    const hovered = makeToken('target', 175, 75);
    global.canvas.tokens.controlled = [selected];
    global.canvas.tokens.placeables = [selected, hovered];

    const { CoverVisualization } = await import('../../../scripts/cover/CoverVisualization.js');
    const visualization = new CoverVisualization();

    visualization.createCoverOverlay(hovered);

    expect(mockDetectCoverBetweenTokens).toHaveBeenCalled();
    expect(global.canvas.visibility.testVisibility).not.toHaveBeenCalled();
    expect(selected.vision.los.contains).toHaveBeenCalled();

    visualization.cleanup();
  });

  test('GM fog-respecting overlay falls back to Foundry visibility with the selected token source', async () => {
    const selected = makeToken('selected', 75, 75);
    selected.vision = {};
    const hovered = makeToken('target', 175, 75);
    global.canvas.tokens.controlled = [selected];
    global.canvas.tokens.placeables = [selected, hovered];
    global.canvas.visibility.testVisibility = jest.fn((_point, options) => Boolean(options?.source));

    const { CoverVisualization } = await import('../../../scripts/cover/CoverVisualization.js');
    const visualization = new CoverVisualization();

    visualization.createCoverOverlay(hovered);

    expect(mockDetectCoverBetweenTokens).toHaveBeenCalled();
    expect(global.canvas.visibility.testVisibility).toHaveBeenCalledWith(
      expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
      expect.objectContaining({ source: selected.vision }),
    );

    visualization.cleanup();
  });

  test('cover overlay occupancy only checks visibility for tokens near sampled grid cells', async () => {
    global.game.settings.get = jest.fn((moduleId, settingId) => {
      if (moduleId !== 'pf2e-visioner') return false;
      if (settingId === 'autoCoverVisualizationRespectFogForGM') return false;
      if (settingId === 'colorblindMode') return 'none';
      return false;
    });

    const selected = makeToken('selected', 75, 75);
    const hovered = makeToken('target', 175, 75);
    const farTokens = Array.from({ length: 30 }, (_, index) =>
      makeToken(`far-${index}`, 2000 + index * 100, 2000),
    );
    global.canvas.tokens.controlled = [selected];
    global.canvas.tokens.placeables = [selected, hovered, ...farTokens];

    const { CoverVisualization } = await import('../../../scripts/cover/CoverVisualization.js');
    const visualization = new CoverVisualization();

    visualization.createCoverOverlay(hovered);

    expect(mockDetectCoverBetweenTokens).toHaveBeenCalled();
    expect(mockGetVisibilityBetween.mock.calls.map(([, token]) => token.id)).not.toContain(
      'far-0',
    );
    expect(mockGetVisibilityBetween).toHaveBeenCalledTimes(1);

    visualization.cleanup();
  });
});
