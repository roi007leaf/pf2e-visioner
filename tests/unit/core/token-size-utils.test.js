/**
 * Tests for Token Size Utilities
 *
 * Tests the centralized token size calculation functions.
 */

import '../../setup.js';

describe('Token Size Utilities', () => {
  let mockCanvas;

  beforeEach(() => {
    mockCanvas = {
      grid: { size: 100 }, // 100px grid
      tokens: { controlled: [], placeables: [] },
      walls: { placeables: [] },
      lighting: { placeables: [] },
      terrain: { placeables: [] },
    };

    // Extend existing global canvas instead of replacing it
    Object.assign(global.canvas, mockCanvas);
  });

  // Helper to create test tokens with specific creature sizes
  function createTestToken(id, creatureSize, options = {}) {
    return {
      id,
      document: {
        x: options.x || 0,
        y: options.y || 0,
        width: options.docWidth || 1, // This might be wrong in real scenarios
        height: options.docHeight || 1,
        ...options.document,
      },
      actor: {
        system: {
          traits: {
            size: {
              value: creatureSize,
            },
          },
        },
        ...options.actor,
      },
      ...options,
    };
  }

  describe('getCorrectTokenGridSize', () => {
    test('returns correct grid sizes for all PF2e creature sizes', async () => {
      const { getCorrectTokenGridSize } = await import('../../../scripts/helpers/token-size-utils.js');

      const tiny = createTestToken('tiny', 'tiny');
      const small = createTestToken('small', 'sm');
      const medium = createTestToken('medium', 'med');
      const large = createTestToken('large', 'lg');
      const huge = createTestToken('huge', 'huge');
      const gargantuan = createTestToken('gargantuan', 'grg');

      expect(getCorrectTokenGridSize(tiny)).toEqual({ width: 0.5, height: 0.5 });
      expect(getCorrectTokenGridSize(small)).toEqual({ width: 1, height: 1 });
      expect(getCorrectTokenGridSize(medium)).toEqual({ width: 1, height: 1 });
      expect(getCorrectTokenGridSize(large)).toEqual({ width: 2, height: 2 });
      expect(getCorrectTokenGridSize(huge)).toEqual({ width: 3, height: 3 });
      expect(getCorrectTokenGridSize(gargantuan)).toEqual({ width: 4, height: 4 });
    });

    test('handles invalid or missing creature sizes gracefully', async () => {
      const { getCorrectTokenGridSize } = await import('../../../scripts/helpers/token-size-utils.js');

      const noActor = { document: { x: 0, y: 0 } };
      const invalidSize = createTestToken('invalid', 'invalid-size');
      const nullSize = {
        document: { x: 0, y: 0 },
        actor: { system: { traits: { size: { value: null } } } },
      };

      // All should default to medium (1x1)
      expect(getCorrectTokenGridSize(noActor)).toEqual({ width: 1, height: 1 });
      expect(getCorrectTokenGridSize(invalidSize)).toEqual({ width: 1, height: 1 });
      expect(getCorrectTokenGridSize(nullSize)).toEqual({ width: 1, height: 1 });
    });
  });

  describe('getCorrectTokenRect', () => {
    test('calculates correct rectangles for different creature sizes', async () => {
      const { getCorrectTokenRect } = await import('../../../scripts/helpers/token-size-utils.js');

      const medium = createTestToken('medium', 'med', { x: 100, y: 100 });
      const large = createTestToken('large', 'lg', { x: 200, y: 200 });
      const tiny = createTestToken('tiny', 'tiny', { x: 0, y: 0 });

      const mediumRect = getCorrectTokenRect(medium);
      const largeRect = getCorrectTokenRect(large);
      const tinyRect = getCorrectTokenRect(tiny);

      // Medium: 1 square = 100px
      expect(mediumRect).toEqual({ x1: 100, y1: 100, x2: 200, y2: 200 });

      // Large: 2 squares = 200px
      expect(largeRect).toEqual({ x1: 200, y1: 200, x2: 400, y2: 400 });

      // Tiny: 0.5 squares = 50px
      expect(tinyRect).toEqual({ x1: 0, y1: 0, x2: 50, y2: 50 });
    });
  });

  describe('getCorrectTokenWidth and getCorrectTokenHeight', () => {
    test('returns correct pixel dimensions', async () => {
      const { getCorrectTokenWidth, getCorrectTokenHeight } = await import(
        '../../../scripts/helpers/token-size-utils.js'
      );

      const medium = createTestToken('medium', 'med');
      const large = createTestToken('large', 'lg');
      const tiny = createTestToken('tiny', 'tiny');

      // Medium: 1 square = 100px
      expect(getCorrectTokenWidth(medium)).toBe(100);
      expect(getCorrectTokenHeight(medium)).toBe(100);

      // Large: 2 squares = 200px
      expect(getCorrectTokenWidth(large)).toBe(200);
      expect(getCorrectTokenHeight(large)).toBe(200);

      // Tiny: 0.5 squares = 50px
      expect(getCorrectTokenWidth(tiny)).toBe(50);
      expect(getCorrectTokenHeight(tiny)).toBe(50);
    });
  });

  describe('getCorrectTokenCenter', () => {
    test('calculates correct center points', async () => {
      const { getCorrectTokenCenter } = await import('../../../scripts/helpers/token-size-utils.js');

      const medium = createTestToken('medium', 'med', { x: 100, y: 100 });
      const large = createTestToken('large', 'lg', { x: 200, y: 200 });

      const mediumCenter = getCorrectTokenCenter(medium);
      const largeCenter = getCorrectTokenCenter(large);

      // Medium at (100,100): center at (150, 150)
      expect(mediumCenter).toEqual({ x: 150, y: 150 });

      // Large at (200,200): center at (300, 300)
      expect(largeCenter).toEqual({ x: 300, y: 300 });
    });
  });

  describe('Integration with existing code', () => {
    test('replaces document.width/height calculations correctly', async () => {
      const { getCorrectTokenWidth, getCorrectTokenHeight } = await import(
        '../../../scripts/helpers/token-size-utils.js'
      );

      // Test token with incorrect document values (simulating the bug)
      const buggyToken = createTestToken('medium', 'med', {
        x: 0,
        y: 0,
        docWidth: 2, // Wrong! Should be 1 for medium
        docHeight: 2, // Wrong! Should be 1 for medium
      });

      // Old calculation (buggy)
      const oldWidth = buggyToken.document.width * 100; // 2 * 100 = 200px (wrong!)
      const oldHeight = buggyToken.document.height * 100; // 2 * 100 = 200px (wrong!)

      // New calculation (correct)
      const newWidth = getCorrectTokenWidth(buggyToken); // Should be 100px
      const newHeight = getCorrectTokenHeight(buggyToken); // Should be 100px

      expect(oldWidth).toBe(200); // The bug
      expect(oldHeight).toBe(200); // The bug
      expect(newWidth).toBe(100); // The fix
      expect(newHeight).toBe(100); // The fix
    });
  });
});
