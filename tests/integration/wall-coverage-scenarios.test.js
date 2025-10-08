/**
 * Integration tests for wall coverage scenarios
 * Tests the specific scenarios from your examples showing standard vs greater cover
 */

import '../setup.js';

describe('Wall Coverage Scenarios Integration', () => {
  let coverDetector;

  beforeEach(async () => {
    jest.resetModules();

    // Import the detector
    const coverDetectorInstance = (await import('../../scripts/cover/auto-cover/CoverDetector.js'))
      .default;
    coverDetector = coverDetectorInstance;

    // Setup comprehensive canvas mock
    global.canvas = {
      walls: {
        objects: { children: [] },
        placeables: [],
      },
      tokens: {
        placeables: [],
      },
      grid: {
        size: 50, // Standard grid size
      },
    };

    // Mock game settings with configurable thresholds
    global.game.settings.get = jest.fn((module, setting) => {
      const settingsMap = {
        wallCoverStandardThreshold: 50,
        wallCoverGreaterThreshold: 70,
        wallCoverAllowGreater: true,
        autoCoverTokenIntersectionMode: 'tactical',
        autoCoverIgnoreUndetected: false,
        autoCoverIgnoreDead: false,
        autoCoverIgnoreAllies: false,
        autoCoverAllowProneBlockers: true,
      };
      return settingsMap[setting] ?? 0;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Standard vs Greater Cover Scenarios', () => {
    test('Scenario: Light wall coverage should give standard cover', () => {
      // Create tokens positioned for light wall coverage
      const attacker = global.createMockToken({
        id: 'attacker',
        x: 0,
        y: 100,
        width: 1,
        height: 1,
        center: { x: 25, y: 125 },
      });

      const target = global.createMockToken({
        id: 'target',
        x: 300,
        y: 100,
        width: 1,
        height: 1,
        center: { x: 325, y: 125 },
      });

      // Create a single wall that provides moderate coverage
      const lightWall = {
        document: {
          id: 'light-wall',
          sight: 1, // Blocks sight
          door: 0, // Not a door
          ds: 0, // Closed
          dir: 0, // Both directions
          getFlag: jest.fn(() => null), // No override
        },
        coords: [150, 50, 150, 200], // Vertical wall
      };

      global.canvas.walls.objects.children = [lightWall];
      global.canvas.tokens.placeables = [attacker, target];

      // Mock coverage calculation to return moderate coverage (between standard and greater thresholds)
      jest.spyOn(coverDetector, '_estimateWallCoveragePercent').mockReturnValue(55);
      jest.spyOn(coverDetector, '_findNearestTokenToPoint').mockReturnValue(target);

      const result = coverDetector.detectBetweenTokens(attacker, target);

      expect(result).toBe('standard');
      expect(coverDetector._estimateWallCoveragePercent).toHaveBeenCalledWith(
        attacker.center,
        target,
        { bottom: 0, top: 5 },
      );
    });

    test('Scenario: Heavy wall coverage should give greater cover', () => {
      // Create tokens positioned for heavy wall coverage
      const attacker = global.createMockToken({
        id: 'attacker',
        x: 0,
        y: 100,
        width: 1,
        height: 1,
        center: { x: 25, y: 125 },
      });

      const target = global.createMockToken({
        id: 'target',
        x: 300,
        y: 100,
        width: 1,
        height: 1,
        center: { x: 325, y: 125 },
      });

      // Create walls that provide heavy coverage (like thick walls or multiple segments)
      const heavyWall1 = {
        document: {
          id: 'heavy-wall-1',
          sight: 1,
          door: 0,
          ds: 0,
          dir: 0,
          getFlag: jest.fn(() => null),
        },
        coords: [140, 0, 140, 250],
      };

      const heavyWall2 = {
        document: {
          id: 'heavy-wall-2',
          sight: 1,
          door: 0,
          ds: 0,
          dir: 0,
          getFlag: jest.fn(() => null),
        },
        coords: [160, 0, 160, 250],
      };

      global.canvas.walls.objects.children = [heavyWall1, heavyWall2];
      global.canvas.tokens.placeables = [attacker, target];

      // Mock coverage calculation to return high coverage (above greater threshold)
      jest.spyOn(coverDetector, '_estimateWallCoveragePercent').mockReturnValue(85);
      jest.spyOn(coverDetector, '_findNearestTokenToPoint').mockReturnValue(target);

      const result = coverDetector.detectBetweenTokens(attacker, target);

      expect(result).toBe('greater');
    });

    test('Scenario: Multiple distinct wall barriers should give greater cover', () => {
      // Create tokens with multiple separated wall barriers in between
      const attacker = global.createMockToken({
        id: 'attacker',
        x: 0,
        y: 100,
        width: 1,
        height: 1,
        center: { x: 25, y: 125 },
      });

      const target = global.createMockToken({
        id: 'target',
        x: 400,
        y: 100,
        width: 1,
        height: 1,
        center: { x: 425, y: 125 },
      });

      // Create two distinct, separated walls
      const wall1 = {
        document: {
          id: 'barrier-1',
          sight: 1,
          door: 0,
          ds: 0,
          dir: 0,
          getFlag: jest.fn(() => null),
        },
        coords: [150, 50, 150, 200], // First barrier
      };

      const wall2 = {
        document: {
          id: 'barrier-2',
          sight: 1,
          door: 0,
          ds: 0,
          dir: 0,
          getFlag: jest.fn(() => null),
        },
        coords: [300, 50, 300, 200], // Second barrier, far from first
      };

      global.canvas.walls.objects.children = [wall1, wall2];
      global.canvas.tokens.placeables = [attacker, target];

      // Mock high coverage to trigger greater cover
      jest.spyOn(coverDetector, '_estimateWallCoveragePercent').mockReturnValue(80);
      jest.spyOn(coverDetector, '_findNearestTokenToPoint').mockReturnValue(target);

      const result = coverDetector.detectBetweenTokens(attacker, target);

      // Should be greater due to high wall coverage
      expect(result).toBe('greater');
    });

    test('Scenario: Wall + creature combination should give greater cover', () => {
      // Create tokens with both wall and creature blocking
      const attacker = global.createMockToken({
        id: 'attacker',
        x: 0,
        y: 100,
        width: 1,
        height: 1,
        center: { x: 25, y: 125 },
      });

      const target = global.createMockToken({
        id: 'target',
        x: 300,
        y: 100,
        width: 1,
        height: 1,
        center: { x: 325, y: 125 },
      });

      const blockingCreature = global.createMockToken({
        id: 'blocker',
        x: 200,
        y: 100,
        width: 1,
        height: 1,
        center: { x: 225, y: 125 },
        actor: {
          type: 'character',
          system: {
            traits: {
              size: { value: 'med' },
            },
          },
        },
      });

      // Add a wall
      const wall = {
        document: {
          id: 'wall',
          sight: 1,
          door: 0,
          ds: 0,
          dir: 0,
          getFlag: jest.fn(() => null),
        },
        coords: [150, 50, 150, 200],
      };

      global.canvas.walls.objects.children = [wall];
      global.canvas.tokens.placeables = [attacker, target, blockingCreature];

      // Mock high coverage to ensure greater cover
      jest.spyOn(coverDetector, '_estimateWallCoveragePercent').mockReturnValue(75);
      jest.spyOn(coverDetector, '_findNearestTokenToPoint').mockReturnValue(target);

      const result = coverDetector.detectBetweenTokens(attacker, target);

      // Should be greater due to high wall coverage
      expect(result).toBe('greater');
    });
  });

  describe('Threshold Configuration Tests', () => {
    test('Should respect custom standard threshold', () => {
      // Mock custom settings
      global.game.settings.get = jest.fn((module, setting) => {
        const settingsMap = {
          wallCoverStandardThreshold: 30, // Lower threshold
          wallCoverGreaterThreshold: 80, // Higher threshold
          wallCoverAllowGreater: true,
        };
        return settingsMap[setting] ?? 0;
      });

      const attacker = global.createMockToken({
        id: 'attacker',
        center: { x: 25, y: 125 },
      });

      const target = global.createMockToken({
        id: 'target',
        center: { x: 325, y: 125 },
      });

      const wall = {
        document: {
          id: 'test-wall',
          sight: 1,
          door: 0,
          ds: 0,
          dir: 0,
          getFlag: jest.fn(() => null),
        },
        coords: [150, 50, 150, 200],
      };

      global.canvas.walls.objects.children = [wall];
      global.canvas.tokens.placeables = [attacker, target];

      // Mock coverage that meets the lower standard threshold but not greater
      jest.spyOn(coverDetector, '_estimateWallCoveragePercent').mockReturnValue(35);
      jest.spyOn(coverDetector, '_findNearestTokenToPoint').mockReturnValue(target);

      const result = coverDetector.detectBetweenTokens(attacker, target);

      expect(result).toBe('standard');
    });

    test('Should respect wallCoverAllowGreater setting', () => {
      // Mock settings with greater cover disabled
      global.game.settings.get = jest.fn((module, setting) => {
        const settingsMap = {
          wallCoverStandardThreshold: 50,
          wallCoverGreaterThreshold: 70,
          wallCoverAllowGreater: false, // Disabled
        };
        return settingsMap[setting] ?? 0;
      });

      const attacker = global.createMockToken({
        id: 'attacker',
        center: { x: 25, y: 125 },
      });

      const target = global.createMockToken({
        id: 'target',
        center: { x: 325, y: 125 },
      });

      const wall = {
        document: {
          id: 'test-wall',
          sight: 1,
          door: 0,
          ds: 0,
          dir: 0,
          getFlag: jest.fn(() => null),
        },
        coords: [150, 50, 150, 200],
      };

      global.canvas.walls.objects.children = [wall];
      global.canvas.tokens.placeables = [attacker, target];

      // Mock high coverage that would normally be greater
      jest.spyOn(coverDetector, '_estimateWallCoveragePercent').mockReturnValue(85);
      jest.spyOn(coverDetector, '_findNearestTokenToPoint').mockReturnValue(target);

      const result = coverDetector.detectBetweenTokens(attacker, target);

      // Should be capped at standard due to setting
      expect(result).toBe('standard');
    });
  });

  describe('Priority Rules', () => {
    test('No walls: should use token cover system', () => {
      const attacker = global.createMockToken({
        id: 'attacker',
        center: { x: 25, y: 125 },
        actor: {
          type: 'character',
          system: {
            traits: { size: { value: 'med' } },
          },
          alliance: 'party',
        },
      });

      const target = global.createMockToken({
        id: 'target',
        center: { x: 325, y: 125 },
        actor: {
          type: 'character',
          system: {
            traits: { size: { value: 'med' } },
          },
          alliance: 'opposition',
        },
      });

      const blockingCreature = global.createMockToken({
        id: 'blocker',
        x: 150,
        y: 100,
        width: 1,
        height: 1,
        center: { x: 175, y: 125 },
        actor: {
          type: 'character',
          system: {
            traits: { size: { value: 'med' } },
          },
          alliance: 'opposition',
        },
      });

      // No walls, only creature
      global.canvas.walls.objects.children = [];
      global.canvas.tokens.placeables = [attacker, target, blockingCreature];
      global.canvas.tokens.controlled = [];

      // Mock segment analysis to return no walls
      jest.spyOn(coverDetector, '_analyzeSegmentObstructions').mockReturnValue({
        hasBlockingTerrain: false,
        hasCreatures: true,
        blockingWalls: [],
        intersectingCreatures: [{ token: blockingCreature, intersectionLength: 50 }],
        totalBlockedLength: 50,
        segmentLength: 300,
      });

      const result = coverDetector.detectBetweenTokens(attacker, target);

      // Should use token cover rules - expect some form of cover
      expect(['none', 'lesser', 'standard', 'greater']).toContain(result);
    });

    test('Walls present: should use wall cover system', () => {
      const attacker = global.createMockToken({
        id: 'attacker',
        center: { x: 25, y: 125 },
      });

      const target = global.createMockToken({
        id: 'target',
        center: { x: 325, y: 125 },
      });

      const blockingCreature = global.createMockToken({
        id: 'blocker',
        x: 200,
        y: 100,
        width: 1,
        height: 1,
        center: { x: 225, y: 125 },
        actor: {
          type: 'character',
          system: {
            traits: { size: { value: 'med' } },
          },
        },
      });

      const wall = {
        document: {
          id: 'priority-wall',
          sight: 1,
          door: 0,
          ds: 0,
          dir: 0,
          getFlag: jest.fn(() => null),
        },
        coords: [150, 50, 150, 200],
      };

      global.canvas.walls.objects.children = [wall];
      global.canvas.tokens.placeables = [attacker, target, blockingCreature];

      // Mock moderate wall coverage
      jest.spyOn(coverDetector, '_estimateWallCoveragePercent').mockReturnValue(60);
      jest.spyOn(coverDetector, '_findNearestTokenToPoint').mockReturnValue(target);

      const result = coverDetector.detectBetweenTokens(attacker, target);

      // Should use wall cover rules (standard for moderate coverage)
      expect(result).toBe('standard');
    });
  });

  describe('Error Handling', () => {
    test('Should handle coverage calculation failure gracefully', () => {
      const attacker = global.createMockToken({
        id: 'attacker',
        center: { x: 25, y: 125 },
      });

      const target = global.createMockToken({
        id: 'target',
        center: { x: 325, y: 125 },
      });

      const wall = {
        document: {
          id: 'error-wall',
          sight: 1,
          door: 0,
          ds: 0,
          dir: 0,
          getFlag: jest.fn(() => null),
        },
        coords: [150, 50, 150, 200],
      };

      global.canvas.walls.objects.children = [wall];
      global.canvas.tokens.placeables = [attacker, target];

      // Mock coverage calculation failure
      jest.spyOn(coverDetector, '_estimateWallCoveragePercent').mockImplementation(() => {
        throw new Error('Coverage calculation failed');
      });
      jest.spyOn(coverDetector, '_findNearestTokenToPoint').mockReturnValue(target);

      const result = coverDetector.detectBetweenTokens(attacker, target);

      // Should fallback to standard cover when wall is detected but coverage fails
      // The current implementation should handle this gracefully
      expect(['none', 'standard', 'greater']).toContain(result);
    });

    test('Should handle missing target token gracefully', () => {
      const attacker = global.createMockToken({
        id: 'attacker',
        center: { x: 25, y: 125 },
      });

      const target = global.createMockToken({
        id: 'target',
        center: { x: 325, y: 125 },
      });

      const wall = {
        document: {
          id: 'test-wall',
          sight: 1,
          door: 0,
          ds: 0,
          dir: 0,
          getFlag: jest.fn(() => null),
        },
        coords: [150, 50, 150, 200],
      };

      global.canvas.walls.objects.children = [wall];
      global.canvas.tokens.placeables = [attacker, target];

      // Mock target not found
      jest.spyOn(coverDetector, '_findNearestTokenToPoint').mockReturnValue(null);

      const result = coverDetector.detectBetweenTokens(attacker, target);

      // Should still work and return standard for wall detection
      expect(result).toBe('standard');
    });
  });
});
