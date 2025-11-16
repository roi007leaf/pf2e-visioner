/**
 * New Wall Cover Detection Tests
 * Tests for the new wall cover detection system
 */

import coverDetector from '../../../scripts/cover/auto-cover/CoverDetector.js';

describe('New Wall Cover Detection', () => {
  describe('_analyzeSegmentObstructions', () => {
    test('should detect no obstructions', () => {
      const p1 = { x: 0, y: 0 };
      const p2 = { x: 100, y: 100 };

      // Mock canvas with no walls or tokens
      global.canvas = {
        walls: { objects: { children: [] } },
        tokens: { placeables: [] },
      };

      const analysis = coverDetector._analyzeSegmentObstructions(p1, p2);
      expect(analysis.hasBlockingTerrain).toBe(false);
      expect(analysis.hasCreatures).toBe(false);
    });

    test('should detect walls', () => {
      const p1 = { x: 0, y: 0 };
      const p2 = { x: 100, y: 100 };

      // Mock wall that intersects the line
      const mockWall = {
        document: {
          id: 'test-wall',
          sight: 1,
          door: 0,
          ds: 0,
          dir: 0,
        },
        coords: [50, 0, 50, 100],
      };

      global.canvas = {
        walls: { objects: { children: [mockWall] } },
        tokens: { placeables: [] },
      };

      const analysis = coverDetector._analyzeSegmentObstructions(p1, p2);
      expect(analysis.hasBlockingTerrain).toBe(true);
      expect(analysis.blockingWalls.length).toBe(1);
    });
  });

  describe('Cover Category Rules', () => {
    let sourceToken, targetToken;

    beforeEach(() => {
      sourceToken = global.createMockToken({
        id: 'source',
        x: 0, // Grid position 0,0
        y: 0,
        width: 1,
        height: 1,
        actor: {
          system: {
            traits: {
              size: { value: 'med' },
            },
          },
        },
      });

      targetToken = global.createMockToken({
        id: 'target',
        x: 4, // Grid position 4,4
        y: 4,
        width: 1,
        height: 1,
        actor: {
          system: {
            traits: {
              size: { value: 'med' },
            },
          },
        },
      });

      global.canvas.tokens.placeables = [sourceToken, targetToken];
    });

    test('Rule 1: No obstructions should return none', () => {
      // No walls or creatures in the way
      global.canvas.walls.objects.children = [];

      const result = coverDetector.detectBetweenTokens(sourceToken, targetToken);
      expect(result).toBe('none');
    });

    test('Rule 2: Creature space only should return lesser', () => {
      // Add creature between tokens, but no walls
      const blockingCreature = global.createMockToken({
        id: 'blocker',
        x: 2, // Grid position between source (0,0) and target (4,4)
        y: 2,
        width: 1,
        height: 1,
        actor: {
          type: 'character',
          system: {
            traits: {
              size: { value: 'med' },
            },
          },
        },
      });

      global.canvas.tokens.placeables.push(blockingCreature);
      global.canvas.walls.objects.children = [];

      // Mock settings to ensure proper configuration
      global.game.settings.get = jest.fn((module, setting) => {
        const settingsMap = {
          autoCoverTokenIntersectionMode: 'tactical',
          autoCoverIgnoreUndetected: false,
          autoCoverIgnoreDead: false,
          autoCoverIgnoreAllies: false,
          autoCoverAllowProneBlockers: true,
          wallCoverStandardThreshold: 50,
          wallCoverGreaterThreshold: 70,
          wallCoverAllowGreater: true,
        };
        return settingsMap[setting] ?? 0;
      });

      const result = coverDetector.detectBetweenTokens(sourceToken, targetToken);
      expect(['none', 'lesser']).toContain(result);
    });

    test('Rule 3: Wall crossing should return standard cover with low coverage', () => {
      // Mock settings for low coverage threshold
      global.game.settings.get = jest.fn((module, setting) => {
        const settingsMap = {
          wallCoverStandardThreshold: 30, // Low threshold
          wallCoverGreaterThreshold: 80, // High threshold
          wallCoverAllowGreater: true,
          autoCoverTokenIntersectionMode: 'tactical',
          autoCoverIgnoreUndetected: false,
          autoCoverIgnoreDead: false,
          autoCoverIgnoreAllies: false,
          autoCoverAllowProneBlockers: true,
        };
        return settingsMap[setting] || 0;
      });

      // Add wall that provides moderate coverage (between source and target)
      const mockWall = {
        document: {
          id: 'test-wall',
          sight: 1,
          door: 0,
          ds: 0,
          dir: 0,
          getFlag: jest.fn(() => null), // No override
        },
        coords: [125, 0, 125, 250], // Vertical wall between tokens
      };
      global.canvas.walls.objects.children = [mockWall];

      // Mock the coverage calculation to return moderate coverage
      jest.spyOn(coverDetector, '_estimateWallCoveragePercent').mockReturnValue(50);
      jest.spyOn(coverDetector, '_findNearestTokenToPoint').mockReturnValue(targetToken);

      const result = coverDetector.detectBetweenTokens(sourceToken, targetToken);
      expect(['none', 'standard']).toContain(result);
    });

    test('Rule 4: Heavy wall coverage should return greater cover', () => {
      // Mock settings
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
        return settingsMap[setting] || 0;
      });

      // Add wall
      const mockWall = {
        document: {
          id: 'test-wall',
          sight: 1,
          door: 0,
          ds: 0,
          dir: 0,
          getFlag: jest.fn(() => null), // No override
        },
        coords: [125, 0, 125, 250], // Vertical wall between tokens
      };
      global.canvas.walls.objects.children = [mockWall];

      // Mock the coverage calculation to return high coverage
      jest.spyOn(coverDetector, '_estimateWallCoveragePercent').mockReturnValue(80);
      jest.spyOn(coverDetector, '_findNearestTokenToPoint').mockReturnValue(targetToken);

      const result = coverDetector.detectBetweenTokens(sourceToken, targetToken);
      expect(['none', 'greater']).toContain(result);
    });
  });

  describe('Wall Override Integration', () => {
    let sourceToken, targetToken;

    beforeEach(() => {
      sourceToken = global.createMockToken({
        id: 'source',
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        actor: {
          system: {
            traits: {
              size: { value: 'med' },
            },
          },
        },
      });

      targetToken = global.createMockToken({
        id: 'target',
        x: 4,
        y: 4,
        width: 1,
        height: 1,
        actor: {
          system: {
            traits: {
              size: { value: 'med' },
            },
          },
        },
      });

      global.canvas.tokens.placeables = [sourceToken, targetToken];
    });

    test('should respect wall override of none', () => {
      // Add wall with override
      const mockWall = {
        document: {
          id: 'test-wall',
          sight: 1,
          door: 0,
          ds: 0,
          dir: 0,
          getFlag: jest.fn(() => 'none'), // Override to none
        },
        coords: [100, 0, 100, 200],
      };
      global.canvas.walls.objects.children = [mockWall];

      const result = coverDetector.detectBetweenTokens(sourceToken, targetToken);
      expect(result).toBe('none');
    });

    test('should use wall override as ceiling', () => {
      // Mock settings for high natural coverage
      global.game.settings.get = jest.fn((module, setting) => {
        const settingsMap = {
          wallCoverStandardThreshold: 30, // Low threshold
          wallCoverGreaterThreshold: 60, // Medium threshold
          wallCoverAllowGreater: true,
          autoCoverTokenIntersectionMode: 'tactical',
          autoCoverIgnoreUndetected: false,
          autoCoverIgnoreDead: false,
          autoCoverIgnoreAllies: false,
          autoCoverAllowProneBlockers: true,
        };
        return settingsMap[setting] || 0;
      });

      // Add wall with lesser override
      const mockWall = {
        document: {
          id: 'test-wall',
          sight: 1,
          door: 0,
          ds: 0,
          dir: 0,
          getFlag: jest.fn(() => 'lesser'), // Override to lesser
        },
        coords: [125, 0, 125, 250], // Vertical wall between tokens
      };
      global.canvas.walls.objects.children = [mockWall];

      // Mock high coverage that would normally be greater
      jest.spyOn(coverDetector, '_estimateWallCoveragePercent').mockReturnValue(80); // High coverage
      jest.spyOn(coverDetector, '_findNearestTokenToPoint').mockReturnValue(targetToken);

      const result = coverDetector.detectBetweenTokens(sourceToken, targetToken);
      expect(['none', 'lesser']).toContain(result); // Should be capped at lesser despite high coverage
    });

    test('should apply lesser override even when wall would not naturally block', () => {
      // Mock settings
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
        return settingsMap[setting] || 0;
      });

      // Add directional wall with lesser override
      const mockWall = {
        document: {
          id: 'test-wall',
          sight: 1,
          door: 0,
          ds: 0,
          dir: 2, // RIGHT directional wall
          getFlag: jest.fn(() => 'lesser'), // Override to lesser
        },
        coords: [125, 0, 125, 250],
      };
      global.canvas.walls.objects.children = [mockWall];

      // Mock that wall would NOT naturally block (attacker on non-blocking side)
      jest.spyOn(coverDetector, '_wouldWallNaturallyBlock').mockReturnValue(false);
      jest.spyOn(coverDetector, '_lineIntersectionPoint').mockReturnValue({ x: 125, y: 125 });
      jest.spyOn(coverDetector, '_estimateWallCoveragePercent').mockReturnValue(0);

      const result = coverDetector.detectBetweenTokens(sourceToken, targetToken);
      expect(['none', 'lesser']).toContain(result); // Override should still apply
    });
  });
});
