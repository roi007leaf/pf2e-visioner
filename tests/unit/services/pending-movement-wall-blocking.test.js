import '../../setup.js';

import {
  lineIntersectsLimitedWall,
  lineOfSightBlockedByCustomSightWall,
  lineOfSightBlockedByWall,
  lineOfSoundBlockedByWall,
  withPendingMovementWallRayCache,
} from '../../../scripts/services/PendingMovement/pending-movement-wall-blocking.js';

const WALL_SENSE_TYPES = {
  NONE: 0,
  LIMITED: 10,
  NORMAL: 20,
  PROXIMITY: 30,
  DISTANCE: 40,
};

function verticalWall({ id = 'wall', x = 50, sight = WALL_SENSE_TYPES.NORMAL, sound = WALL_SENSE_TYPES.NONE, threshold = {} } = {}) {
  return {
    id,
    document: {
      id,
      c: [x, -100, x, 100],
      sight,
      sound,
      threshold,
      door: 0,
      ds: 0,
    },
  };
}

function countedWallCollection(walls, onYield) {
  return {
    *[Symbol.iterator]() {
      for (const wall of walls) {
        onYield?.(wall);
        yield wall;
      }
    },
  };
}

describe('pending movement wall sense blocking', () => {
  let originalCanvas;
  let originalConfig;
  let originalConst;

  beforeEach(() => {
    originalCanvas = global.canvas;
    originalConfig = global.CONFIG;
    originalConst = global.CONST;
    global.CONST = {
      ...(global.CONST || {}),
      WALL_SENSE_TYPES,
      EDGE_SENSE_TYPES: WALL_SENSE_TYPES,
    };
    global.canvas = {
      ...global.canvas,
      grid: { size: 50 },
      scene: {
        ...global.canvas.scene,
        grid: { size: 50, distance: 5 },
      },
      walls: { placeables: [] },
    };
  });

  afterEach(() => {
    global.canvas = originalCanvas;
    global.CONFIG = originalConfig;
    if (originalConst === undefined) delete global.CONST;
    else global.CONST = originalConst;
  });

  test('limited sight walls pass once and block at the next limited sight wall', () => {
    global.canvas.walls.placeables = [
      verticalWall({ sight: WALL_SENSE_TYPES.LIMITED, sound: WALL_SENSE_TYPES.NONE }),
    ];

    expect(lineOfSightBlockedByWall({ x: 0, y: 0 }, { x: 100, y: 0 })).toBe(false);
    expect(lineOfSightBlockedByCustomSightWall({ x: 0, y: 0 }, { x: 100, y: 0 })).toBe(false);

    global.canvas.walls.placeables = [
      verticalWall({ id: 'near-limited', x: 50, sight: WALL_SENSE_TYPES.LIMITED }),
      verticalWall({ id: 'far-limited', x: 100, sight: WALL_SENSE_TYPES.LIMITED }),
    ];

    expect(lineOfSightBlockedByWall({ x: 0, y: 0 }, { x: 150, y: 0 })).toBe(true);
    expect(lineOfSightBlockedByCustomSightWall({ x: 0, y: 0 }, { x: 150, y: 0 })).toBe(true);
  });

  test('limited sight walls pass once and block at the next normal sight wall', () => {
    global.canvas.walls.placeables = [
      verticalWall({ id: 'near-limited', x: 50, sight: WALL_SENSE_TYPES.LIMITED }),
      verticalWall({ id: 'far-normal', x: 100, sight: WALL_SENSE_TYPES.NORMAL }),
    ];

    expect(lineOfSightBlockedByWall({ x: 0, y: 0 }, { x: 150, y: 0 })).toBe(true);
  });

  test('proximity sight walls allow observation inside threshold and block outside it', () => {
    global.canvas.walls.placeables = [
      verticalWall({
        x: 50,
        sight: WALL_SENSE_TYPES.PROXIMITY,
        threshold: { sight: 2 },
      }),
    ];

    expect(lineOfSightBlockedByWall({ x: 40, y: 0 }, { x: 100, y: 0 })).toBe(false);
    expect(lineOfSightBlockedByWall({ x: 0, y: 0 }, { x: 100, y: 0 })).toBe(true);
  });

  test('reverse-proximity sight walls block inside threshold and allow outside it', () => {
    global.canvas.walls.placeables = [
      verticalWall({
        x: 50,
        sight: WALL_SENSE_TYPES.DISTANCE,
        threshold: { sight: 2 },
      }),
    ];

    expect(lineOfSightBlockedByWall({ x: 40, y: 0 }, { x: 100, y: 0 })).toBe(true);
    expect(lineOfSightBlockedByWall({ x: 0, y: 0 }, { x: 100, y: 0 })).toBe(false);
  });

  test('limited sound walls pass once and block at the next limited sound wall', () => {
    global.canvas.walls.placeables = [
      verticalWall({ sight: WALL_SENSE_TYPES.NORMAL, sound: WALL_SENSE_TYPES.LIMITED }),
    ];

    expect(lineOfSoundBlockedByWall({ x: 0, y: 0 }, { x: 100, y: 0 })).toBe(false);

    global.canvas.walls.placeables = [
      verticalWall({
        id: 'near-limited-sound',
        x: 50,
        sight: WALL_SENSE_TYPES.NONE,
        sound: WALL_SENSE_TYPES.LIMITED,
      }),
      verticalWall({
        id: 'far-limited-sound',
        x: 100,
        sight: WALL_SENSE_TYPES.NONE,
        sound: WALL_SENSE_TYPES.LIMITED,
      }),
    ];

    expect(lineOfSoundBlockedByWall({ x: 0, y: 0 }, { x: 150, y: 0 })).toBe(true);
  });

  test('limited sound walls pass once and block at the next normal sound wall', () => {
    global.canvas.walls.placeables = [
      verticalWall({
        id: 'near-limited-sound',
        x: 50,
        sight: WALL_SENSE_TYPES.NONE,
        sound: WALL_SENSE_TYPES.LIMITED,
      }),
      verticalWall({
        id: 'far-normal-sound',
        x: 100,
        sight: WALL_SENSE_TYPES.NONE,
        sound: WALL_SENSE_TYPES.NORMAL,
      }),
    ];

    expect(lineOfSoundBlockedByWall({ x: 0, y: 0 }, { x: 150, y: 0 })).toBe(true);
  });

  test('proximity sound walls use target as sound source for threshold checks', () => {
    global.canvas.walls.placeables = [
      verticalWall({
        x: 50,
        sound: WALL_SENSE_TYPES.PROXIMITY,
        threshold: { sound: 2 },
      }),
    ];

    expect(lineOfSoundBlockedByWall({ x: 0, y: 0 }, { x: 60, y: 0 })).toBe(false);
    expect(lineOfSoundBlockedByWall({ x: 0, y: 0 }, { x: 100, y: 0 })).toBe(true);
  });

  test('reverse-proximity sound walls use target as sound source for threshold checks', () => {
    global.canvas.walls.placeables = [
      verticalWall({
        x: 50,
        sound: WALL_SENSE_TYPES.DISTANCE,
        threshold: { sound: 2 },
      }),
    ];

    expect(lineOfSoundBlockedByWall({ x: 0, y: 0 }, { x: 60, y: 0 })).toBe(true);
    expect(lineOfSoundBlockedByWall({ x: 0, y: 0 }, { x: 100, y: 0 })).toBe(false);
  });

  test('reuses wall ray hits across sight, sound, and limited checks inside a cache scope', () => {
    let wallIterations = 0;
    global.canvas.walls.placeables = countedWallCollection(
      [
        verticalWall({
          x: 50,
          sight: WALL_SENSE_TYPES.LIMITED,
          sound: WALL_SENSE_TYPES.LIMITED,
        }),
      ],
      () => {
        wallIterations += 1;
      },
    );

    const origin = { x: 0, y: 0 };
    const target = { x: 100, y: 0 };
    withPendingMovementWallRayCache(() => {
      expect(lineOfSightBlockedByWall(origin, target)).toBe(false);
      expect(lineOfSoundBlockedByWall(origin, target)).toBe(false);
      expect(lineIntersectsLimitedWall(origin, target, 'sight')).toBe(true);
      expect(lineIntersectsLimitedWall(origin, target, 'sound')).toBe(true);
    });

    expect(wallIterations).toBe(1);
  });

  test('does not reuse wall ray hits outside the cache scope', () => {
    const origin = { x: 0, y: 0 };
    const target = { x: 150, y: 0 };

    global.canvas.walls.placeables = [
      verticalWall({ id: 'single-limited', x: 50, sight: WALL_SENSE_TYPES.LIMITED }),
    ];
    expect(withPendingMovementWallRayCache(() => lineOfSightBlockedByWall(origin, target))).toBe(
      false,
    );

    global.canvas.walls.placeables = [
      verticalWall({ id: 'near-limited', x: 50, sight: WALL_SENSE_TYPES.LIMITED }),
      verticalWall({ id: 'far-limited', x: 100, sight: WALL_SENSE_TYPES.LIMITED }),
    ];
    expect(withPendingMovementWallRayCache(() => lineOfSightBlockedByWall(origin, target))).toBe(
      true,
    );
  });

  test('uses v14 core level collision to keep elevated clear sight from being blocked by 2d walls', () => {
    const level = { id: 'upper' };
    const scene = {
      id: 'scene',
      levels: new Map([[level.id, level]]),
      getSurfaces: jest.fn(),
      testSurfaceCollision: jest.fn(() => false),
    };
    global.canvas.scene = scene;
    global.CONFIG = {
      ...(global.CONFIG || {}),
      Canvas: {
        polygonBackends: {
          sight: {
            testCollision: jest.fn(() => false),
          },
        },
      },
    };
    global.canvas.walls.placeables = [verticalWall({ x: 50, sight: WALL_SENSE_TYPES.NORMAL })];

    const originToken = {
      document: {
        id: 'origin',
        level: level.id,
        parent: scene,
      },
    };
    const targetToken = {
      document: {
        id: 'target',
        level: level.id,
        parent: scene,
      },
    };

    expect(
      lineOfSightBlockedByWall(
        { x: 0, y: 0, elevation: 20 },
        { x: 100, y: 0, elevation: 20 },
        { originToken, targetToken },
      ),
    ).toBe(false);
  });

  test('uses v14 core surface collision to block pending sight without 2d wall hits', () => {
    const level = { id: 'upper' };
    const scene = {
      id: 'scene',
      levels: new Map([[level.id, level]]),
      getSurfaces: jest.fn(),
      testSurfaceCollision: jest.fn(() => true),
    };
    global.canvas.scene = scene;
    global.CONFIG = {
      ...(global.CONFIG || {}),
      Canvas: {
        polygonBackends: {
          sight: {
            testCollision: jest.fn(() => false),
          },
        },
      },
    };
    global.canvas.walls.placeables = [];

    const originToken = {
      document: {
        id: 'origin',
        level: level.id,
        parent: scene,
      },
    };
    const targetToken = {
      document: {
        id: 'target',
        level: level.id,
        parent: scene,
      },
    };

    expect(
      lineOfSightBlockedByWall(
        { x: 0, y: 0, elevation: 0 },
        { x: 100, y: 0, elevation: 20 },
        { originToken, targetToken },
      ),
    ).toBe(true);
  });
});
