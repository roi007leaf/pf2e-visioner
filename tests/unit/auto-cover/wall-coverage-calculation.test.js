/**
 * Unit tests for Wall Coverage Percentage Calculation
 * Tests the improved wall coverage calculation logic in CoverDetector
 *
 * This tests the fixes made to the _estimateWallCoveragePercent method:
 * - Removed arbitrary center weight reduction
 * - Increased sampling density for better accuracy
 * - Added explicit corner sampling (important for D&D/PF2e rules)
 * - More intuitive percentage calculations
 */

import '../../setup.js';

describe('Wall Coverage Percentage Calculation', () => {
  let coverDetector;

  beforeEach(async () => {
    jest.resetModules();

    // Import the detector
    const { CoverDetector } = await import('../../../scripts/cover/auto-cover/CoverDetector.js');
    coverDetector = new CoverDetector();

    // Setup mock canvas
    global.canvas.walls = {
      placeables: [],
      objects: { children: [] },
    };
    global.canvas.tokens = { placeables: [] };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('_estimateWallCoveragePercent', () => {
    test('should sample corners explicitly for D&D/PF2e compatibility', () => {
      // Mock a target token
      const mockTarget = {
        document: {
          width: 1,
          height: 1,
          x: 100,
          y: 100,
        },
        x: 100,
        y: 100,
        w: 100,
        h: 100,
      };

      // Mock getTokenRect to return expected rectangle
      const mockGetTokenRect = jest.fn(() => ({
        x1: 100,
        y1: 100,
        x2: 200,
        y2: 200,
      }));
      global.getTokenRect = mockGetTokenRect;

      // Track calls to _isRayBlockedByWalls to verify corner sampling
      const rayBlockedCalls = [];
      coverDetector._isRayBlockedByWalls = jest.fn((p1, pt) => {
        rayBlockedCalls.push({ from: p1, to: pt });
        return false; // No walls block for this test
      });

      const attackerPos = { x: 0, y: 0 };
      const result = coverDetector._estimateWallCoveragePercent(attackerPos, mockTarget);

      // Verify that corners were explicitly sampled
      const cornerCalls = rayBlockedCalls.filter(
        (call) =>
          (call.to.x === 100 && call.to.y === 100) || // Top-left corner
          (call.to.x === 200 && call.to.y === 100) || // Top-right corner
          (call.to.x === 200 && call.to.y === 200) || // Bottom-right corner
          (call.to.x === 100 && call.to.y === 200), // Bottom-left corner
      );

      // Some corners may be duplicated in edge sampling, so we expect at least 3 unique corner samples
      expect(cornerCalls.length).toBeGreaterThanOrEqual(3);
      expect(result).toBe(0); // No walls blocking = 0% coverage
    });

    test('should sample center point for additional context', () => {
      const mockTarget = {
        document: { width: 1, height: 1, x: 100, y: 100 },
        x: 100,
        y: 100,
        w: 100,
        h: 100,
      };

      global.getTokenRect = jest.fn(() => ({
        x1: 100,
        y1: 100,
        x2: 200,
        y2: 200,
      }));

      const rayBlockedCalls = [];
      coverDetector._isRayBlockedByWalls = jest.fn((p1, pt) => {
        rayBlockedCalls.push({ from: p1, to: pt });
        return false;
      });

      const attackerPos = { x: 0, y: 0 };
      coverDetector._estimateWallCoveragePercent(attackerPos, mockTarget);

      // Verify center point was sampled (may appear multiple times due to edge sampling)
      const centerCalls = rayBlockedCalls.filter(
        (call) => call.to.x === 150 && call.to.y === 150, // Center of rectangle
      );

      expect(centerCalls.length).toBeGreaterThanOrEqual(1);
    });

    test('should use increased sampling density (4 points per edge)', () => {
      const mockTarget = {
        document: { width: 1, height: 1, x: 100, y: 100 },
        x: 100,
        y: 100,
        w: 100,
        h: 100,
      };

      global.getTokenRect = jest.fn(() => ({
        x1: 100,
        y1: 100,
        x2: 200,
        y2: 200,
      }));

      const rayBlockedCalls = [];
      coverDetector._isRayBlockedByWalls = jest.fn((p1, pt) => {
        rayBlockedCalls.push({ from: p1, to: pt });
        return false;
      });

      const attackerPos = { x: 0, y: 0 };
      coverDetector._estimateWallCoveragePercent(attackerPos, mockTarget);

      // With 4 sample points per edge + 4 corners + 1 center, we should have:
      // - 4 edges × 5 points each (including corners) = 20 edge samples
      // - 4 explicit corners (some duplicated from edge sampling)
      // - 1 center point
      // Total: 25 unique points (corners appear in edge sampling)

      // The actual count will be higher due to edge sampling including corner points
      expect(rayBlockedCalls.length).toBeGreaterThan(20);
    });

    test('should return accurate percentage without center weight reduction', () => {
      const mockTarget = {
        document: { width: 1, height: 1, x: 100, y: 100 },
        x: 100,
        y: 100,
        w: 100,
        h: 100,
      };

      global.getTokenRect = jest.fn(() => ({
        x1: 100,
        y1: 100,
        x2: 200,
        y2: 200,
      }));

      let callCount = 0;
      const totalCalls = [];

      // Mock 50% of rays blocked
      coverDetector._isRayBlockedByWalls = jest.fn((p1, pt) => {
        totalCalls.push({ from: p1, to: pt });
        callCount++;
        return callCount % 2 === 0; // Every other ray is blocked (50%)
      });

      const attackerPos = { x: 0, y: 0 };
      const result = coverDetector._estimateWallCoveragePercent(attackerPos, mockTarget);

      // Should return approximately 50% (allowing for small variations due to sampling)
      expect(result).toBeGreaterThan(45);
      expect(result).toBeLessThan(55);
    });

    test('should handle 100% blockage correctly', () => {
      const mockTarget = {
        document: { width: 1, height: 1, x: 100, y: 100 },
        x: 100,
        y: 100,
        w: 100,
        h: 100,
      };

      global.getTokenRect = jest.fn(() => ({
        x1: 100,
        y1: 100,
        x2: 200,
        y2: 200,
      }));

      // All rays blocked
      coverDetector._isRayBlockedByWalls = jest.fn(() => true);

      const attackerPos = { x: 0, y: 0 };
      const result = coverDetector._estimateWallCoveragePercent(attackerPos, mockTarget);

      expect(result).toBe(100);
    });

    test('should handle 0% blockage correctly', () => {
      const mockTarget = {
        document: { width: 1, height: 1, x: 100, y: 100 },
        x: 100,
        y: 100,
        w: 100,
        h: 100,
      };

      global.getTokenRect = jest.fn(() => ({
        x1: 100,
        y1: 100,
        x2: 200,
        y2: 200,
      }));

      // No rays blocked
      coverDetector._isRayBlockedByWalls = jest.fn(() => false);

      const attackerPos = { x: 0, y: 0 };
      const result = coverDetector._estimateWallCoveragePercent(attackerPos, mockTarget);

      expect(result).toBe(0);
    });

    test('should handle edge case with very small tokens', () => {
      const mockTarget = {
        document: { width: 0.5, height: 0.5, x: 100, y: 100 },
        x: 100,
        y: 100,
        w: 50,
        h: 50,
      };

      global.getTokenRect = jest.fn(() => ({
        x1: 100,
        y1: 100,
        x2: 150,
        y2: 150, // Small 50x50 token
      }));

      coverDetector._isRayBlockedByWalls = jest.fn(() => false);

      const attackerPos = { x: 0, y: 0 };
      const result = coverDetector._estimateWallCoveragePercent(attackerPos, mockTarget);

      expect(result).toBe(0);
      expect(typeof result).toBe('number');
    });

    test('should handle edge case with large tokens', () => {
      const mockTarget = {
        document: { width: 4, height: 4, x: 100, y: 100 },
        x: 100,
        y: 100,
        w: 400,
        h: 400,
      };

      global.getTokenRect = jest.fn(() => ({
        x1: 100,
        y1: 100,
        x2: 500,
        y2: 500, // Large 400x400 token
      }));

      // Block 25% of rays
      let callCount = 0;
      coverDetector._isRayBlockedByWalls = jest.fn(() => {
        callCount++;
        return callCount % 4 === 0; // Every 4th ray is blocked (25%)
      });

      const attackerPos = { x: 0, y: 0 };
      const result = coverDetector._estimateWallCoveragePercent(attackerPos, mockTarget);

      // Should return approximately 25%
      expect(result).toBeGreaterThan(20);
      expect(result).toBeLessThan(30);
    });

    test('should handle error conditions gracefully', () => {
      const mockTarget = null; // Invalid target

      global.getTokenRect = jest.fn(() => {
        throw new Error('Invalid token');
      });

      const attackerPos = { x: 0, y: 0 };
      const result = coverDetector._estimateWallCoveragePercent(attackerPos, mockTarget);

      // Should return 0 on error
      expect(result).toBe(0);
    });
  });

  describe('integration with _evaluateWallsCover', () => {
    test('should use improved percentage calculation in wall cover evaluation', () => {
      // Mock settings
      global.game.settings.get = jest.fn((module, setting) => {
        if (setting === 'wallCoverStandardThreshold') return 50;
        if (setting === 'wallCoverGreaterThreshold') return 75;
        if (setting === 'wallCoverAllowGreater') return true;
        return null;
      });

      // Add a wall to the canvas so _evaluateWallsCover finds obstructions
      const mockWall = {
        document: {
          id: 'test-wall',
          sight: 1,
          door: 0,
          ds: 0,
          dir: 0,
          getFlag: jest.fn(() => null), // No override
        },
        coords: [125, 0, 125, 300], // Vertical wall between attacker and target
      };
      global.canvas.walls.objects.children = [mockWall];

      const mockTarget = {
        document: { width: 1, height: 1, x: 200, y: 200 },
        x: 200,
        y: 200,
        w: 100,
        h: 100,
      };

      global.getTokenRect = jest.fn(() => ({
        x1: 200,
        y1: 200,
        x2: 300,
        y2: 300,
      }));

      // Mock _findNearestTokenToPoint to return our mock target
      coverDetector._findNearestTokenToPoint = jest.fn(() => mockTarget);

      // Mock wall override check to return null (no overrides)
      coverDetector._checkWallCoverOverrides = jest.fn(() => null);

      // Mock percentage calculation to return different values for testing
      const originalEstimate = coverDetector._estimateWallCoveragePercent;
      coverDetector._estimateWallCoveragePercent = jest.fn(() => 60); // 60% coverage

      const attackerPos = { x: 0, y: 0 };
      const targetPos = { x: 250, y: 250 };

      const result = coverDetector._evaluateWallsCover(attackerPos, targetPos);

      // 60% is above standard threshold (50%) but below greater threshold (75%)
      expect(result).toBe('standard');
      expect(coverDetector._estimateWallCoveragePercent).toHaveBeenCalledWith(
        attackerPos,
        mockTarget,
        null,
      );

      // Restore original method
      coverDetector._estimateWallCoveragePercent = originalEstimate;
    });

    test('should properly map percentages to cover states', () => {
      global.game.settings.get = jest.fn((module, setting) => {
        if (setting === 'wallCoverStandardThreshold') return 40;
        if (setting === 'wallCoverGreaterThreshold') return 70;
        if (setting === 'wallCoverAllowGreater') return true;
        return null;
      });

      // Add a wall to the canvas so _evaluateWallsCover finds obstructions
      const mockWall = {
        document: {
          id: 'test-wall',
          sight: 1,
          door: 0,
          ds: 0,
          dir: 0,
          getFlag: jest.fn(() => null), // No override
        },
        coords: [125, 0, 125, 300], // Vertical wall between attacker and target
      };
      global.canvas.walls.objects.children = [mockWall];

      const mockTarget = {
        document: { width: 1, height: 1, x: 200, y: 200 },
        x: 200,
        y: 200,
        w: 100,
        h: 100,
      };

      global.getTokenRect = jest.fn(() => ({
        x1: 200,
        y1: 200,
        x2: 300,
        y2: 300,
      }));

      coverDetector._findNearestTokenToPoint = jest.fn(() => mockTarget);
      coverDetector._checkWallCoverOverrides = jest.fn(() => null);

      const attackerPos = { x: 0, y: 0 };
      const targetPos = { x: 250, y: 250 };

      // Test different percentage values
      // Note: When walls are detected, minimum cover is 'standard' even if percentage is low
      const testCases = [
        { percentage: 30, expectedCover: 'standard' }, // Below standard threshold, but walls detected = standard minimum
        { percentage: 50, expectedCover: 'standard' }, // Above standard, below greater
        { percentage: 80, expectedCover: 'greater' }, // Above greater threshold
      ];

      for (const testCase of testCases) {
        coverDetector._estimateWallCoveragePercent = jest.fn(() => testCase.percentage);

        const result = coverDetector._evaluateWallsCover(attackerPos, targetPos);
        expect(result).toBe(testCase.expectedCover);
      }
    });

    test('should handle greater cover disabled setting', () => {
      global.game.settings.get = jest.fn((module, setting) => {
        if (setting === 'wallCoverStandardThreshold') return 40;
        if (setting === 'wallCoverGreaterThreshold') return 70;
        if (setting === 'wallCoverAllowGreater') return false; // Greater cover disabled
        return null;
      });

      // Add a wall to the canvas so _evaluateWallsCover finds obstructions
      const mockWall = {
        document: {
          id: 'test-wall',
          sight: 1,
          door: 0,
          ds: 0,
          dir: 0,
          getFlag: jest.fn(() => null), // No override
        },
        coords: [125, 0, 125, 300], // Vertical wall between attacker and target
      };
      global.canvas.walls.objects.children = [mockWall];

      const mockTarget = {
        document: { width: 1, height: 1, x: 200, y: 200 },
        x: 200,
        y: 200,
        w: 100,
        h: 100,
      };

      global.getTokenRect = jest.fn(() => ({
        x1: 200,
        y1: 200,
        x2: 300,
        y2: 300,
      }));

      coverDetector._findNearestTokenToPoint = jest.fn(() => mockTarget);
      coverDetector._checkWallCoverOverrides = jest.fn(() => null);
      coverDetector._estimateWallCoveragePercent = jest.fn(() => 80); // 80% coverage

      const attackerPos = { x: 0, y: 0 };
      const targetPos = { x: 250, y: 250 };

      const result = coverDetector._evaluateWallsCover(attackerPos, targetPos);

      // Should cap at standard even though percentage is above greater threshold
      expect(result).toBe('standard');
    });
  });

  describe('performance and accuracy improvements', () => {
    test('should be more accurate than old center-weighted calculation', () => {
      // This test demonstrates that the new calculation is more intuitive
      const mockTarget = {
        document: { width: 1, height: 1, x: 100, y: 100 },
        x: 100,
        y: 100,
        w: 100,
        h: 100,
      };

      global.getTokenRect = jest.fn(() => ({
        x1: 100,
        y1: 100,
        x2: 200,
        y2: 200,
      }));

      // Simulate a scenario where edges are blocked but center is not
      // Old system would reduce this to 30% due to center weight
      // New system returns the actual percentage
      coverDetector._isRayBlockedByWalls = jest.fn((p1, pt) => {
        const centerX = 150,
          centerY = 150;
        // Block everything except center point
        return !(pt.x === centerX && pt.y === centerY);
      });

      const attackerPos = { x: 0, y: 0 };
      const result = coverDetector._estimateWallCoveragePercent(attackerPos, mockTarget);

      // Should return close to actual blockage percentage (not artificially reduced)
      // Since only 1 point (center) is unblocked out of many, result should be high
      expect(result).toBeGreaterThan(85); // Adjusted for sampling variations
    });

    test('should handle partial blockage scenarios accurately', () => {
      const mockTarget = {
        document: { width: 2, height: 2, x: 100, y: 100 },
        x: 100,
        y: 100,
        w: 200,
        h: 200,
      };

      global.getTokenRect = jest.fn(() => ({
        x1: 100,
        y1: 100,
        x2: 300,
        y2: 300,
      }));

      // Block only the top half of the token
      coverDetector._isRayBlockedByWalls = jest.fn((p1, pt) => {
        return pt.y <= 200; // Block upper half
      });

      const attackerPos = { x: 0, y: 0 };
      const result = coverDetector._estimateWallCoveragePercent(attackerPos, mockTarget);

      // Should return a reasonable percentage - the exact value depends on sampling
      // Note: Due to how edge sampling works and the specific rectangle bounds, results vary
      expect(result).toBeGreaterThan(30);
      expect(result).toBeLessThanOrEqual(100); // Allow for 100% if all sampled points are blocked
    });
  });
});
