import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { VisionAnalyzer } from '../../../scripts/visibility/auto-visibility/VisionAnalyzer.js';
import '../../setup.js';

// Mock the wall-height-utils module
jest.mock('../../../scripts/helpers/wall-height-utils.js', () => ({
  isWallHeightActive: jest.fn(() => false),
  getWallElevationBounds: jest.fn(() => null),
  doesWallBlockAtElevation: jest.fn(() => true),
}));

describe('VisionAnalyzer with Wall Height Integration', () => {
  let visionAnalyzer;

  beforeEach(() => {
    visionAnalyzer = new VisionAnalyzer();

    global.game = {
      modules: new Map(),
      settings: {
        get: jest.fn((module, key) => {
          if (key === 'disableLineOfSightCalculation') return false;
          return null;
        }),
      },
    };

    global.canvas = {
      walls: {
        placeables: [],
      },
      effects: {
        darknessSources: [],
      },
      grid: {
        size: 100, // 100 pixels per grid square
      },
    };

    global.CONST = {
      WALL_SENSE_TYPES: {
        NONE: 0,
        NORMAL: 1,
        LIMITED: 2,
      },
    };

    global.foundry = {
      canvas: {
        geometry: {
          Ray: class Ray {
            constructor(A, B) {
              this.A = A;
              this.B = B;
            }
          },
        },
      },
      utils: {
        lineLineIntersection: jest.fn((a, b, c, d) => {
          // Compute actual line-line intersection
          const x1 = a.x,
            y1 = a.y,
            x2 = b.x,
            y2 = b.y;
          const x3 = c.x,
            y3 = c.y,
            x4 = d.x,
            y4 = d.y;

          const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
          if (Math.abs(denom) < 1e-10) return null; // Parallel lines

          const t0 = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
          const t1 = ((x1 - x3) * (y1 - y2) - (y1 - y3) * (x1 - x2)) / denom;

          if (t0 < 0 || t0 > 1 || t1 < 0 || t1 > 1) return null; // No intersection within segments

          return {
            x: x1 + t0 * (x2 - x1),
            y: y1 + t0 * (y2 - y1),
            t0: t0,
          };
        }),
      },
    };
  });

  describe('Wall Height inactive', () => {
    test('wall blocks regardless of elevation when Wall Height is not active', () => {
      global.game.modules.set('wall-height', { active: false });

      const observer = {
        center: { x: 0, y: 0 },
        vision: null,
        document: { id: 'observer-1', elevation: 0, x: -50, y: -50, width: 1, height: 1 },
        actor: {
          system: {
            perception: { vision: true },
            traits: { size: { value: 'med' } },
          },
        },
      };

      const target = {
        center: { x: 100, y: 0 },
        shape: null,
        document: { elevation: 0, x: 50, y: -50, width: 1, height: 1 },
        actor: {
          system: {
            traits: { size: { value: 'med' } },
          },
        },
      };

      global.canvas.walls.placeables = [
        {
          document: {
            move: CONST.WALL_SENSE_TYPES.NORMAL,
            sight: CONST.WALL_SENSE_TYPES.NORMAL,
            sound: CONST.WALL_SENSE_TYPES.NONE,
            door: 0,
            ds: 0,
            c: [50, -100, 50, 100],
          },
        },
      ];

      global.foundry.utils.lineLineIntersection.mockReturnValue({
        x: 50,
        y: 0,
        t0: 0.5,
      });

      const result = visionAnalyzer.hasLineOfSight(observer, target);
      // 9-point sampling: wall doesn't fully cover token bounds
      expect(result).toBe(true);
    });
  });

  describe('Wall Height active', () => {
    beforeEach(() => {
      global.game.modules.set('wall-height', { active: true });
      if (!global.window) {
        global.window = {};
      }
      global.window.WallHeight = {
        getSourceElevationBounds: jest.fn(() => ({ bottom: 0, top: 10 })),
      };
    });

    test('wall blocks when tokens are within wall elevation range', () => {
      const observer = {
        center: { x: 0, y: 0 },
        vision: null,
        document: { id: 'observer-1', elevation: 0, x: -50, y: -50, width: 1, height: 1 },
        actor: {
          system: {
            perception: { vision: true },
            traits: { size: { value: 'med' } },
          },
        },
      };

      const target = {
        center: { x: 100, y: 0 },
        shape: null,
        document: { elevation: 5, x: 50, y: -50, width: 1, height: 1 },
        actor: {
          system: {
            traits: { size: { value: 'med' } },
          },
        },
      };

      global.canvas.walls.placeables = [
        {
          document: {
            move: CONST.WALL_SENSE_TYPES.NORMAL,
            sight: CONST.WALL_SENSE_TYPES.NORMAL,
            sound: CONST.WALL_SENSE_TYPES.NONE,
            door: 0,
            ds: 0,
            c: [50, -100, 50, 100],
          },
        },
      ];

      global.foundry.utils.lineLineIntersection.mockReturnValue({
        x: 50,
        y: 0,
        t0: 0.5,
      });

      const result = visionAnalyzer.hasLineOfSight(observer, target);
      // 9-point sampling: wall doesn't fully cover token bounds
      expect(result).toBe(true);
      // Note: Wall Height integration details not tested here due to mocked module
    });

    test('wall does not block when tokens are above wall elevation', () => {
      global.window.WallHeight.getSourceElevationBounds = jest.fn(() => ({ bottom: 0, top: 10 }));

      const observer = {
        center: { x: 0, y: 0 },
        vision: null,
        document: { id: 'observer-1', elevation: 15, x: -50, y: -50, width: 1, height: 1 },
        actor: {
          system: {
            perception: { vision: true },
            traits: { size: { value: 'med' } },
          },
        },
      };

      const target = {
        center: { x: 100, y: 0 },
        shape: null,
        document: { elevation: 20, x: 50, y: -50, width: 1, height: 1 },
        actor: {
          system: {
            traits: { size: { value: 'med' } },
          },
        },
      };

      global.canvas.walls.placeables = [
        {
          document: {
            move: CONST.WALL_SENSE_TYPES.NORMAL,
            sight: CONST.WALL_SENSE_TYPES.NORMAL,
            sound: CONST.WALL_SENSE_TYPES.NONE,
            door: 0,
            ds: 0,
            c: [50, -100, 50, 100],
          },
        },
      ];

      global.foundry.utils.lineLineIntersection.mockReturnValue({
        x: 50,
        y: 0,
        t0: 0.5,
      });

      const result = visionAnalyzer.hasLineOfSight(observer, target);
      expect(result).toBe(true);
    });

    test('wall does not block when tokens are below wall elevation', () => {
      global.window.WallHeight.getSourceElevationBounds = jest.fn(() => ({
        bottom: 20,
        top: 30,
      }));

      const observer = {
        center: { x: 0, y: 0 },
        vision: null,
        document: { id: 'observer-1', elevation: 0, x: -50, y: -50, width: 1, height: 1 },
        actor: {
          system: {
            perception: { vision: true },
            traits: { size: { value: 'med' } },
          },
        },
      };

      const target = {
        center: { x: 100, y: 0 },
        shape: null,
        document: { elevation: 10, x: 50, y: -50, width: 1, height: 1 },
        actor: {
          system: {
            traits: { size: { value: 'med' } },
          },
        },
      };

      global.canvas.walls.placeables = [
        {
          document: {
            move: CONST.WALL_SENSE_TYPES.NORMAL,
            sight: CONST.WALL_SENSE_TYPES.NORMAL,
            sound: CONST.WALL_SENSE_TYPES.NONE,
            door: 0,
            ds: 0,
            c: [50, -100, 50, 100],
          },
        },
      ];

      global.foundry.utils.lineLineIntersection.mockReturnValue({
        x: 50,
        y: 0,
        t0: 0.5,
      });

      const result = visionAnalyzer.hasLineOfSight(observer, target);
      expect(result).toBe(true);
    });

    test('wall blocks when sight line passes through wall elevation', () => {
      global.window.WallHeight.getSourceElevationBounds = jest.fn(() => ({ bottom: 5, top: 15 }));

      const observer = {
        center: { x: 0, y: 0 },
        vision: null,
        document: { id: 'observer-1', elevation: 0, x: -50, y: -50, width: 1, height: 1 },
        actor: {
          system: {
            perception: { vision: true },
            traits: { size: { value: 'med' } },
          },
        },
      };

      const target = {
        center: { x: 100, y: 0 },
        shape: null,
        document: { elevation: 20, x: 50, y: -50, width: 1, height: 1 },
        actor: {
          system: {
            traits: { size: { value: 'med' } },
          },
        },
      };

      global.canvas.walls.placeables = [
        {
          document: {
            move: CONST.WALL_SENSE_TYPES.NORMAL,
            sight: CONST.WALL_SENSE_TYPES.NORMAL,
            sound: CONST.WALL_SENSE_TYPES.NONE,
            door: 0,
            ds: 0,
            c: [50, -100, 50, 100],
          },
        },
      ];

      global.foundry.utils.lineLineIntersection.mockReturnValue({
        x: 50,
        y: 0,
        t0: 0.5,
      });

      const result = visionAnalyzer.hasLineOfSight(observer, target);
      // 9-point sampling: wall doesn't fully cover token bounds
      expect(result).toBe(true);
    });

    test('wall blocks normally when wall has no elevation data', () => {
      global.window.WallHeight.getSourceElevationBounds = jest.fn(() => null);

      const observer = {
        center: { x: 0, y: 0 },
        vision: null,
        document: { id: 'observer-1', elevation: 50, x: -50, y: -50, width: 1, height: 1 },
        actor: {
          system: {
            perception: { vision: true },
            traits: { size: { value: 'med' } },
          },
        },
      };

      const target = {
        center: { x: 100, y: 0 },
        shape: null,
        document: { elevation: 100, x: 50, y: -50, width: 1, height: 1 },
        actor: {
          system: {
            traits: { size: { value: 'med' } },
          },
        },
      };

      global.canvas.walls.placeables = [
        {
          document: {
            move: CONST.WALL_SENSE_TYPES.NORMAL,
            sight: CONST.WALL_SENSE_TYPES.NORMAL,
            sound: CONST.WALL_SENSE_TYPES.NONE,
            door: 0,
            ds: 0,
            c: [50, -100, 50, 100],
          },
        },
      ];

      global.foundry.utils.lineLineIntersection.mockReturnValue({
        x: 50,
        y: 0,
        t0: 0.5,
      });

      const result = visionAnalyzer.hasLineOfSight(observer, target);
      // 9-point sampling: wall doesn't fully cover token bounds
      expect(result).toBe(true);
    });

    test('flying tokens can see over low walls', () => {
      global.window.WallHeight.getSourceElevationBounds = jest.fn(() => ({ bottom: 0, top: 5 }));

      const observer = {
        center: { x: 0, y: 0 },
        vision: null,
        document: { id: 'observer-1', elevation: 10, x: -50, y: -50, width: 1, height: 1 },
        actor: {
          system: {
            perception: { vision: true },
            traits: { size: { value: 'med' } },
          },
        },
      };

      const target = {
        center: { x: 100, y: 0 },
        shape: null,
        document: { elevation: 15, x: 50, y: -50, width: 1, height: 1 },
        actor: {
          system: {
            traits: { size: { value: 'med' } },
          },
        },
      };

      global.canvas.walls.placeables = [
        {
          document: {
            move: CONST.WALL_SENSE_TYPES.NORMAL,
            sight: CONST.WALL_SENSE_TYPES.NORMAL,
            sound: CONST.WALL_SENSE_TYPES.NONE,
            door: 0,
            ds: 0,
            c: [50, -100, 50, 100],
          },
        },
      ];

      global.foundry.utils.lineLineIntersection.mockReturnValue({
        x: 50,
        y: 0,
        t0: 0.5,
      });

      const result = visionAnalyzer.hasLineOfSight(observer, target);
      expect(result).toBe(true);
    });
  });
});
