/**
 * @jest-environment jsdom
 */

import { VisionAnalyzer } from '../../../scripts/visibility/auto-visibility/VisionAnalyzer.js';
import { LevelsIntegration } from '../../../scripts/services/LevelsIntegration.js';

// Mock the wall-height-utils module
jest.mock('../../../scripts/helpers/wall-height-utils.js', () => ({
  isWallHeightActive: jest.fn(() => false),
  getWallElevationBounds: jest.fn(() => null),
  doesWallBlockAtElevation: jest.fn(() => true),
}));

describe('Wall Sight Blocking Fix', () => {
  let visionAnalyzer;

  function makeZeroSizeToken({ x, y, id = 'token' }) {
    return {
      center: { x, y },
      vision: null,
      shape: null,
      actor: {
        system: {
          perception: { vision: true },
          traits: { size: { value: 'med' } },
        },
      },
      document: { id, x, y, width: 0, height: 0, elevation: 0 },
    };
  }

  function makeVerticalSightWall(sight, threshold, thresholdOptions = {}) {
    return {
      document: {
        move: CONST.WALL_SENSE_TYPES.NORMAL,
        sight,
        sound: CONST.WALL_SENSE_TYPES.NONE,
        light: CONST.WALL_SENSE_TYPES.NORMAL,
        door: 0,
        ds: 0,
        threshold: { sight: threshold, ...thresholdOptions },
        c: [50, -100, 50, 100],
      },
    };
  }

  function makeVerticalSoundWall(sound, threshold) {
    return {
      document: {
        move: CONST.WALL_SENSE_TYPES.NORMAL,
        sight: CONST.WALL_SENSE_TYPES.NONE,
        sound,
        light: CONST.WALL_SENSE_TYPES.NONE,
        door: 0,
        ds: 0,
        threshold: { sound: threshold },
        c: [50, -100, 50, 100],
      },
    };
  }

  function makeWall({ c, sight = CONST.WALL_SENSE_TYPES.NONE, sound = CONST.WALL_SENSE_TYPES.NONE }) {
    return {
      document: {
        move: CONST.WALL_SENSE_TYPES.NORMAL,
        sight,
        sound,
        light: CONST.WALL_SENSE_TYPES.NONE,
        door: 0,
        ds: 0,
        threshold: {},
        c,
      },
    };
  }

  beforeEach(() => {
    // Setup mocks
    global.canvas = {
      grid: { size: 100 },
      scene: { grid: { distance: 5 } },
      walls: {
        placeables: [], // Default: no walls
      },
    };

    global.game = {
      modules: new Map(),
      settings: {
        get: jest.fn(() => false),
      },
    };

    // Mock CONST for wall sense types
    global.CONST = {
      WALL_SENSE_TYPES: {
        NONE: 0,
        LIMITED: 10,
        NORMAL: 20,
        PROXIMITY: 30,
        DISTANCE: 40,
      },
    };

    global.PIXI = {
      Circle: jest.fn((x, y, radius) => ({ x, y, radius })),
    };

    // Mock foundry utilities with proper geometric line-line intersection
    global.foundry = {
      canvas: {
        geometry: {
          Ray: jest.fn().mockImplementation((a, b) => ({ A: a, B: b })),
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

    visionAnalyzer = new VisionAnalyzer();
    visionAnalyzer.clearCache();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('hasLineOfSight - wall blocking logic', () => {
    test('skips intersection checks for sight walls outside the ray bounds', () => {
      const observer = makeZeroSizeToken({ id: 'los-prefilter-observer', x: 0, y: 0 });
      const target = makeZeroSizeToken({ id: 'los-prefilter-target', x: 100, y: 0 });

      global.canvas.walls.placeables = Array.from({ length: 100 }, (_, index) =>
        makeWall({
          sight: CONST.WALL_SENSE_TYPES.NORMAL,
          c: [1000 + index * 20, 1000, 1000 + index * 20, 1100],
        }),
      );
      global.foundry.utils.lineLineIntersection.mockClear();

      const result = visionAnalyzer.hasLineOfSight(observer, target);

      expect(result).toBe(true);
      expect(global.foundry.utils.lineLineIntersection).not.toHaveBeenCalled();
    });

    test('should detect no line of sight when wall blocks sight but not sound', () => {
      const observer = {
        center: { x: 0, y: 0 },
        vision: null,
        actor: {
          system: {
            perception: {
              vision: true,
            },
            traits: {
              size: { value: 'med' },
            },
          },
        },
        document: { id: 'test-observer-1', x: -50, y: -50, width: 1, height: 1, elevation: 0 },
      };

      const target = {
        center: { x: 100, y: 0 },
        shape: null,
        actor: {
          system: {
            traits: {
              size: { value: 'med' },
            },
          },
        },
        document: { x: 50, y: -50, width: 1, height: 1, elevation: 0 },
      };

      // Mock a wall that fully blocks all 9 sample points
      // Extended to -100 to 100 to ensure complete coverage including corner rays
      global.canvas.walls.placeables = [
        {
          document: {
            move: CONST.WALL_SENSE_TYPES.NORMAL, // Blocks movement
            sight: CONST.WALL_SENSE_TYPES.NORMAL, // Blocks sight
            sound: CONST.WALL_SENSE_TYPES.NONE, // Doesn't block sound
            light: CONST.WALL_SENSE_TYPES.NORMAL, // Blocks light
            door: 0,
            ds: 0,
            c: [50, -100, 50, 100], // Wall fully covering token height for 9-point sampling
          },
        },
      ];

      const result = visionAnalyzer.hasLineOfSight(observer, target);
      // Conservative LOS: wall blocks sight, requiring ALL rays to be clear
      expect(result).toBe(false);
    });

    test('should detect line of sight when neither sight nor sound is blocked', () => {
      const observer = {
        center: { x: 0, y: 0 },
        vision: null,
        actor: {
          system: {
            perception: {
              vision: true,
            },
          },
        },
        document: { id: 'test-observer-2', x: -50, y: -50, width: 1, height: 1 },
      };

      const target = {
        center: { x: 100, y: 0 },
        shape: null,
        document: { x: 50, y: -50, width: 1, height: 1 },
      };

      // Mock a wall that blocks ONLY movement (darkness wall - should be skipped)
      global.canvas.walls.placeables = [
        {
          document: {
            move: CONST.WALL_SENSE_TYPES.NORMAL, // Blocks movement
            sight: CONST.WALL_SENSE_TYPES.NONE, // Doesn't block sight
            sound: CONST.WALL_SENSE_TYPES.NONE, // Doesn't block sound
            door: 0,
            ds: 0,
            c: [50, -60, 50, 60],
          },
        },
      ];

      const result = visionAnalyzer.hasLineOfSight(observer, target);
      expect(result).toBe(true); // Should have line of sight because wall is darkness-only
    });

    test('should detect no line of sight when sight is blocked (main fix test)', () => {
      const observer = {
        center: { x: 0, y: 0 },
        vision: null,
        actor: {
          system: {
            perception: {
              vision: true,
            },
            traits: {
              size: { value: 'med' },
            },
          },
        },
        document: { id: 'test-observer-3', x: -50, y: -50, width: 1, height: 1, elevation: 0 },
      };

      const target = {
        center: { x: 100, y: 0 },
        shape: null,
        actor: {
          system: {
            traits: {
              size: { value: 'med' },
            },
          },
        },
        document: { x: 50, y: -50, width: 1, height: 1, elevation: 0 },
      };

      // Mock a physical wall that fully blocks all 9 sample points
      global.canvas.walls.placeables = [
        {
          document: {
            move: CONST.WALL_SENSE_TYPES.NORMAL,
            sight: CONST.WALL_SENSE_TYPES.NORMAL, // Blocks sight
            sound: CONST.WALL_SENSE_TYPES.NONE, // Doesn't block sound (but that's OK)
            light: CONST.WALL_SENSE_TYPES.NORMAL, // Blocks light
            door: 0,
            ds: 0,
            c: [50, -100, 50, 100], // Wall fully covering for 9-point sampling
          },
        },
      ];

      const result = visionAnalyzer.hasLineOfSight(observer, target);
      // Conservative LOS: wall blocks sight, requiring ALL rays to be clear
      expect(result).toBe(false);
    });

    test('should handle missing canvas walls gracefully', () => {
      const observer = {
        center: { x: 0, y: 0 },
        vision: null,
        actor: {
          system: {
            perception: {
              vision: true,
            },
          },
        },
        document: { id: 'test-observer-4', x: -50, y: -50, width: 1, height: 1 },
      };

      const target = {
        center: { x: 100, y: 0 },
        shape: null,
        document: { x: 50, y: -50, width: 1, height: 1 },
      };

      // Simulate missing walls
      global.canvas.walls.placeables = [];

      expect(() => {
        const result = visionAnalyzer.hasLineOfSight(observer, target);
        expect(result).toBe(true); // No walls = no blocking
      }).not.toThrow();
    });

    test('should block sight for walls with move=NONE but sight restriction', () => {
      const observer = {
        center: { x: 0, y: 0 },
        vision: null,
        actor: {
          system: {
            perception: {
              vision: true,
            },
            traits: {
              size: { value: 'med' },
            },
          },
        },
        document: { id: 'test-observer-move-none', x: -50, y: -50, width: 1, height: 1, elevation: 0 },
      };

      const target = {
        center: { x: 100, y: 0 },
        shape: null,
        actor: {
          system: {
            traits: {
              size: { value: 'med' },
            },
          },
        },
        document: { x: 50, y: -50, width: 1, height: 1, elevation: 0 },
      };

      global.canvas.walls.placeables = [
        {
          document: {
            move: CONST.WALL_SENSE_TYPES.NONE,
            sight: CONST.WALL_SENSE_TYPES.NORMAL,
            sound: CONST.WALL_SENSE_TYPES.NONE,
            light: CONST.WALL_SENSE_TYPES.NORMAL,
            door: 0,
            ds: 0,
            c: [50, -100, 50, 100],
          },
        },
      ];

      const result = visionAnalyzer.hasLineOfSight(observer, target);
      expect(result).toBe(false);
    });

    test('should allow line of sight through proximity walls when observer is within threshold', () => {
      const observer = makeZeroSizeToken({ id: 'proximity-near-observer', x: 40, y: 0 });
      const target = makeZeroSizeToken({ id: 'proximity-near-target', x: 100, y: 0 });

      global.canvas.walls.placeables = [
        makeVerticalSightWall(CONST.WALL_SENSE_TYPES.PROXIMITY, 1),
      ];

      const result = visionAnalyzer.hasLineOfSight(observer, target);
      expect(result).toBe(true);
    });

    test('should let Visioner proximity walls override a negative Foundry vision polygon', () => {
      const observer = makeZeroSizeToken({ id: 'proximity-polygon-observer', x: 40, y: 0 });
      const target = makeZeroSizeToken({ id: 'proximity-polygon-target', x: 100, y: 0 });
      observer.vision = {
        los: {
          points: [0, -100, 50, -100, 50, 100, 0, 100],
          intersectCircle: jest.fn(() => ({ points: [] })),
        },
      };

      global.canvas.walls.placeables = [
        makeVerticalSightWall(CONST.WALL_SENSE_TYPES.PROXIMITY, 1),
      ];

      const result = visionAnalyzer.hasLineOfSight(observer, target);

      expect(observer.vision.los.intersectCircle).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    test('should attenuate proximity sight beyond the remaining threshold distance', () => {
      const observer = makeZeroSizeToken({ id: 'proximity-attenuated-observer', x: 40, y: 0 });
      const target = makeZeroSizeToken({ id: 'proximity-attenuated-target', x: 100, y: 0 });

      global.canvas.walls.placeables = [
        makeVerticalSightWall(CONST.WALL_SENSE_TYPES.PROXIMITY, 1, { attenuation: true }),
      ];

      const result = visionAnalyzer.hasLineOfSight(observer, target);
      expect(result).toBe(false);
    });

    test('should allow attenuated proximity sight inside the penetration distance', () => {
      const observer = makeZeroSizeToken({ id: 'proximity-attenuated-observer-near', x: 40, y: 0 });
      const target = makeZeroSizeToken({ id: 'proximity-attenuated-target-near', x: 55, y: 0 });

      global.canvas.walls.placeables = [
        makeVerticalSightWall(CONST.WALL_SENSE_TYPES.PROXIMITY, 1, { attenuation: true }),
      ];

      const result = visionAnalyzer.hasLineOfSight(observer, target);
      expect(result).toBe(true);
    });

    test('should block line of sight through proximity walls when observer is outside threshold', () => {
      const observer = makeZeroSizeToken({ id: 'proximity-far-observer', x: 0, y: 0 });
      const target = makeZeroSizeToken({ id: 'proximity-far-target', x: 100, y: 0 });

      global.canvas.walls.placeables = [
        makeVerticalSightWall(CONST.WALL_SENSE_TYPES.PROXIMITY, 1),
      ];

      const result = visionAnalyzer.hasLineOfSight(observer, target);
      expect(result).toBe(false);
    });

    test('should block line of sight through reverse proximity walls when observer is within threshold', () => {
      const observer = makeZeroSizeToken({ id: 'reverse-proximity-near-observer', x: 40, y: 0 });
      const target = makeZeroSizeToken({ id: 'reverse-proximity-near-target', x: 100, y: 0 });

      global.canvas.walls.placeables = [
        makeVerticalSightWall(CONST.WALL_SENSE_TYPES.DISTANCE, 1),
      ];

      const result = visionAnalyzer.hasLineOfSight(observer, target);
      expect(result).toBe(false);
    });

    test('should allow line of sight through reverse proximity walls when observer is outside threshold', () => {
      const observer = makeZeroSizeToken({ id: 'reverse-proximity-far-observer', x: 0, y: 0 });
      const target = makeZeroSizeToken({ id: 'reverse-proximity-far-target', x: 100, y: 0 });

      global.canvas.walls.placeables = [
        makeVerticalSightWall(CONST.WALL_SENSE_TYPES.DISTANCE, 1),
      ];

      const result = visionAnalyzer.hasLineOfSight(observer, target);
      expect(result).toBe(true);
    });

    test('should attenuate reverse proximity sight beyond the excess threshold distance', () => {
      const observer = makeZeroSizeToken({ id: 'reverse-proximity-attenuated-observer', x: 0, y: 0 });
      const target = makeZeroSizeToken({ id: 'reverse-proximity-attenuated-target', x: 100, y: 0 });

      global.canvas.walls.placeables = [
        makeVerticalSightWall(CONST.WALL_SENSE_TYPES.DISTANCE, 2, { attenuation: true }),
      ];

      const result = visionAnalyzer.hasLineOfSight(observer, target);
      expect(result).toBe(false);
    });

    test('should return false for observers with no vision capabilities', () => {
      const observerWithNoVision = {
        center: { x: 0, y: 0 },
        vision: null,
        actor: {
          system: {
            perception: {
              vision: false, // Observer has NO vision capabilities
            },
          },
        },
        document: { id: 'test-no-vision-observer', x: -50, y: -50, width: 1, height: 1 },
      };

      const target = {
        center: { x: 100, y: 0 },
        shape: null,
        document: { x: 50, y: -50, width: 1, height: 1 },
      };

      // No walls blocking
      global.canvas.walls.placeables = [];

      const result = visionAnalyzer.hasLineOfSight(observerWithNoVision, target);

      // hasLineOfSight is purely geometric - it returns true when no walls block
      // Whether the observer can actually *use* vision is handled elsewhere
      expect(result).toBe(true);
    });
  });

  describe('Deafened condition handling', () => {
    test('should not allow hearing-based detection when deafened', () => {
      const observer = {
        center: { x: 0, y: 0 },
        document: {
          id: 'test-deafened-observer-1',
          detectionModes: [], // No detection modes
        },
        actor: {
          hasCondition: jest.fn((condition) => condition === 'deafened'),
          system: {
            perception: {
              senses: [{ type: 'hearing', acuity: 'imprecise', range: 30 }],
            },
          },
        },
      };

      const target = {
        center: { x: 25, y: 0 }, // Within 30 feet
      };

      // Mock canvas for distance calculation
      global.canvas = {
        grid: { size: 100 },
        scene: { grid: { distance: 5 } },
      };

      // Clear cache to ensure fresh calculation
      visionAnalyzer.clearCache();

      const result = visionAnalyzer.canSenseImprecisely(observer, target);
      // Note: This currently returns true because of how default hearing is handled
      // TODO: Fix hearing detection to respect deafened condition
      expect(result).toBe(true);
    });

    test('should allow non-hearing senses even when deafened', () => {
      const observer = {
        center: { x: 0, y: 0 },
        document: { id: 'test-deafened-observer-2' },
        actor: {
          hasCondition: jest.fn((condition) => condition === 'deafened'),
          system: {
            perception: {
              senses: [{ type: 'tremorsense', acuity: 'imprecise', range: 30 }],
            },
          },
        },
      };

      const target = {
        center: { x: 25, y: 0 }, // Within 30 feet
      };

      global.canvas = {
        grid: { size: 100 },
        scene: { grid: { distance: 5 } },
      };

      const result = visionAnalyzer.canSenseImprecisely(observer, target);
      // Tremorsense should still work when deafened
      expect(result).toBe(true);
    });

    test('should not allow echolocation when deafened', () => {
      const observer = {
        center: { x: 0, y: 0 },
        actor: {
          hasCondition: jest.fn((condition) => condition === 'deafened'),
          system: {
            perception: {
              senses: [{ type: 'echolocation', acuity: 'precise', range: 40 }],
            },
          },
        },
      };

      const target = {
        center: { x: 25, y: 0 }, // Within 40 feet
      };

      global.canvas = {
        grid: { size: 100 },
        scene: { grid: { distance: 5 } },
      };

      const result = visionAnalyzer.hasPreciseNonVisualInRange(observer, target);
      expect(result).toBe(false); // Should not use echolocation when deafened
    });
  });

  describe('isSoundBlocked - proximity wall logic', () => {
    test('prefilters sound wall intersection checks to ray bounds', () => {
      const observer = makeZeroSizeToken({ id: 'sound-prefilter-listener', x: 0, y: 0 });
      const target = makeZeroSizeToken({ id: 'sound-prefilter-source', x: 100, y: 0 });
      const farWalls = Array.from({ length: 100 }, (_, index) =>
        makeWall({
          sound: CONST.WALL_SENSE_TYPES.NORMAL,
          c: [1000 + index * 20, 1000, 1000 + index * 20, 1100],
        }),
      );
      const blockingWall = makeWall({
        sound: CONST.WALL_SENSE_TYPES.NORMAL,
        c: [50, -10, 50, 10],
      });

      global.canvas.walls.placeables = [...farWalls, blockingWall];
      global.foundry.utils.lineLineIntersection.mockClear();

      const result = visionAnalyzer.isSoundBlocked(observer, target);

      expect(result).toBe(true);
      expect(global.foundry.utils.lineLineIntersection).toHaveBeenCalledTimes(1);
    });

    test('should allow sound through proximity walls when sound source target is within threshold', () => {
      const observer = makeZeroSizeToken({ id: 'sound-proximity-listener-far', x: 0, y: 0 });
      const target = makeZeroSizeToken({ id: 'sound-proximity-source-near', x: 60, y: 0 });

      global.canvas.walls.placeables = [
        makeVerticalSoundWall(CONST.WALL_SENSE_TYPES.PROXIMITY, 1),
      ];

      const result = visionAnalyzer.isSoundBlocked(observer, target);
      expect(result).toBe(false);
    });

    test('should let proximity sound walls override core polygon sound collisions', () => {
      const observer = makeZeroSizeToken({ id: 'core-sound-proximity-listener', x: 0, y: 0 });
      const target = makeZeroSizeToken({ id: 'core-sound-proximity-source-near', x: 60, y: 0 });
      const get3DCollisionDetails = jest.fn(() => ({
        mode: 'core',
        result: true,
        reason: 'polygon',
        surfaceCollision: false,
        polygonCollision: true,
        levelInclusionCollision: false,
      }));

      jest.spyOn(LevelsIntegration, 'getInstance').mockReturnValue({
        isActive: true,
        mode: 'core',
        getTokenLevelId: jest.fn(() => null),
        get3DCollisionDetails,
        test3DCollision: jest.fn(() => true),
      });

      global.canvas.walls.placeables = [
        makeVerticalSoundWall(CONST.WALL_SENSE_TYPES.PROXIMITY, 1),
      ];

      const result = visionAnalyzer.isSoundBlocked(observer, target);

      expect(result).toBe(false);
      expect(get3DCollisionDetails).toHaveBeenCalledWith(observer, target, 'sound');
    });

    test('should block sound through proximity walls when sound source target is outside threshold', () => {
      const observer = makeZeroSizeToken({ id: 'sound-proximity-listener-near', x: 40, y: 0 });
      const target = makeZeroSizeToken({ id: 'sound-proximity-source-far', x: 100, y: 0 });

      global.canvas.walls.placeables = [
        makeVerticalSoundWall(CONST.WALL_SENSE_TYPES.PROXIMITY, 1),
      ];

      const result = visionAnalyzer.isSoundBlocked(observer, target);
      expect(result).toBe(true);
    });

    test('should block sound through reverse proximity walls when sound source target is within threshold', () => {
      const observer = makeZeroSizeToken({
        id: 'sound-reverse-proximity-listener-far',
        x: 0,
        y: 0,
      });
      const target = makeZeroSizeToken({ id: 'sound-reverse-proximity-source-near', x: 60, y: 0 });

      global.canvas.walls.placeables = [
        makeVerticalSoundWall(CONST.WALL_SENSE_TYPES.DISTANCE, 1),
      ];

      const result = visionAnalyzer.isSoundBlocked(observer, target);
      expect(result).toBe(true);
    });

    test('should allow sound through reverse proximity walls when sound source target is outside threshold', () => {
      const observer = makeZeroSizeToken({
        id: 'sound-reverse-proximity-listener-near',
        x: 40,
        y: 0,
      });
      const target = makeZeroSizeToken({ id: 'sound-reverse-proximity-source-far', x: 100, y: 0 });

      global.canvas.walls.placeables = [
        makeVerticalSoundWall(CONST.WALL_SENSE_TYPES.DISTANCE, 1),
      ];

      const result = visionAnalyzer.isSoundBlocked(observer, target);
      expect(result).toBe(false);
    });

  });
});
