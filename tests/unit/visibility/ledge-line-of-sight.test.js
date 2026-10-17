/**
 * @jest-environment jsdom
 */

import { VisionAnalyzer } from '../../../scripts/visibility/auto-visibility/VisionAnalyzer.js';
import { LevelsIntegration } from '../../../scripts/services/LevelsIntegration.js';
import { invalidateLedgeWallCache } from '../../../scripts/cover/ledge/ledge-walls.js';

function token(id, x, elevation) {
  return {
    id,
    center: { x, y: 100 },
    document: { id: `${id}-doc`, x: x - 25, y: 75, width: 1, height: 1, elevation },
  };
}

function ledgeWall(x, ledgeElevation) {
  const c = [x, 0, x, 200];
  return {
    id: `ledge-${x}`,
    coords: c,
    document: {
      id: `ledge-${x}`,
      c,
      sight: 0,
      move: 0,
      light: 0,
      sound: 0,
      door: 0,
      flags: { 'pf2e-visioner': { ledge: true, ledgeElevation } },
    },
  };
}

describe('VisionAnalyzer ledge line of sight', () => {
  let visionAnalyzer;

  beforeEach(() => {
    LevelsIntegration._instance = null;
    visionAnalyzer = VisionAnalyzer.getInstance();
    visionAnalyzer.clearCache();
    global.CONST = { WALL_SENSE_TYPES: { NONE: 0, LIMITED: 10, NORMAL: 20, PROXIMITY: 30, DISTANCE: 40 } };
    global.game = {
      settings: { get: jest.fn(() => false) },
      modules: new Map([
        ['levels', { active: false }],
        ['wall-height', { active: false }],
      ]),
    };
    global.CONFIG = {
      Canvas: {
        polygonBackends: {
          sight: { testCollision: jest.fn(() => false) },
          sound: { testCollision: jest.fn(() => false) },
        },
      },
    };
    global.PIXI = { Circle: jest.fn((x, y, radius) => ({ x, y, radius })) };
    global.canvas = { scene: { id: 'scene-ledge' }, walls: { placeables: [] }, grid: { size: 50 } };
    invalidateLedgeWallCache();
  });

  afterEach(() => {
    LevelsIntegration._instance = null;
    invalidateLedgeWallCache();
    jest.restoreAllMocks();
  });

  test('creature at the base of a tall cliff is out of sight from the top', () => {
    const above = token('above', 400, 20);
    const below = token('below', 100, 0);
    global.canvas.walls.placeables = [ledgeWall(125, 20)];
    expect(visionAnalyzer.hasLineOfSight(above, below)).toBe(false);
    expect(visionAnalyzer.hasLineOfSight(below, above)).toBe(false);
  });

  test('creature partly visible over a ledge stays in sight', () => {
    const above = token('above', 400, 10);
    const below = token('below', 100, 0);
    global.canvas.walls.placeables = [ledgeWall(350, 10)];
    expect(visionAnalyzer.hasLineOfSight(above, below)).toBe(true);
  });

  test('ledges do not affect creatures that are not separated by one', () => {
    const above = token('above', 400, 20);
    const below = token('below', 100, 0);
    global.canvas.walls.placeables = [ledgeWall(500, 20)];
    expect(visionAnalyzer.hasLineOfSight(above, below)).toBe(true);
  });
});
