/**
 * Tests for cover detection with top-down (overhead) tokens
 * 
 * This test validates that cover detection works correctly for tokens
 * that use top-down images where token.document.width/height may not
 * match the creature's actual mechanical size.
 */

import '../../setup.js';
import { CoverDetector } from '../../../scripts/cover/auto-cover/CoverDetector.js';

describe('Top-Down Token Cover Detection', () => {
  let coverDetector;
  let mockCanvas;

  beforeEach(() => {
    coverDetector = new CoverDetector();

    mockCanvas = {
      grid: { size: 100 },
      walls: {
        checkCollision: jest.fn(() => false),
      },
      tokens: { controlled: [], placeables: [] },
      lighting: { placeables: [] },
      terrain: { placeables: [] },
    };

    Object.assign(global.canvas, mockCanvas);

    global.game = {
      settings: {
        get: jest.fn((module, setting) => {
          if (setting === 'autoCoverTokenIntersectionMode') return 'any';
          if (setting === 'autoCoverFilterAllies') return false;
          if (setting === 'autoCoverFilterDefeated') return false;
          if (setting === 'autoCoverFilterHidden') return false;
          return null;
        }),
      },
      modules: new Map(),
    };
  });

  function createTestToken(id, creatureSize, options = {}) {
    const x = options.x || 0;
    const y = options.y || 0;
    
    const sizeToSquares = {
      tiny: 0.5,
      sm: 1,
      small: 1,
      med: 1,
      medium: 1,
      lg: 2,
      large: 2,
      huge: 3,
      grg: 4,
      gargantuan: 4,
    };
    const squares = sizeToSquares[creatureSize] || 1;
    const pixelSize = squares * 100;
    
    return {
      id,
      document: {
        x,
        y,
        width: options.docWidth || 2,
        height: options.docHeight || 2,
        elevation: options.elevation || 0,
        hidden: options.hidden || false,
        getFlag: jest.fn(() => null),
      },
      actor: {
        id: `actor-${id}`,
        type: 'npc',
        alliance: 'opposition',
        system: {
          traits: {
            size: { value: creatureSize },
          },
          attributes: {
            hp: { value: 10, max: 10 },
          },
        },
        itemTypes: { condition: [] },
      },
      center: {
        x: x + pixelSize / 2,
        y: y + pixelSize / 2,
      },
      getCenterPoint: function () {
        return this.center;
      },
      ...options,
    };
  }

  describe('Medium creature with top-down image', () => {
    test('detects cover when blocker is between attacker and target', () => {
      const attacker = createTestToken('attacker', 'med', { x: 0, y: 0, docWidth: 1, docHeight: 1 });
      const target = createTestToken('target', 'med', { x: 300, y: 0, docWidth: 1, docHeight: 1 });
      const blocker = createTestToken('blocker', 'med', {
        x: 150,
        y: 0,
        docWidth: 2,
        docHeight: 2,
      });

      canvas.tokens.placeables = [attacker, target, blocker];

      const result = coverDetector.detectBetweenTokens(attacker, target);

      expect(result).not.toBe('none');
    });

    test('does not detect cover when blocker is not between attacker and target', () => {
      const attacker = createTestToken('attacker', 'med', { x: 0, y: 0, docWidth: 1, docHeight: 1 });
      const target = createTestToken('target', 'med', { x: 300, y: 0, docWidth: 1, docHeight: 1 });
      const blocker = createTestToken('blocker', 'med', {
        x: 150,
        y: 200,
        docWidth: 2,
        docHeight: 2,
      });

      canvas.tokens.placeables = [attacker, target, blocker];

      const result = coverDetector.detectBetweenTokens(attacker, target);

      expect(result).toBe('none');
    });
  });

  describe('Large creature with top-down image', () => {
    test('correctly calculates rect as 2x2 squares regardless of document dimensions', () => {
      const attacker = createTestToken('attacker', 'med', { x: 0, y: 0, docWidth: 1, docHeight: 1 });
      const target = createTestToken('target', 'med', { x: 400, y: 0, docWidth: 1, docHeight: 1 });
      const largeBlocker = createTestToken('blocker', 'lg', {
        x: 200,
        y: 0,
        docWidth: 1,
        docHeight: 1,
      });

      canvas.tokens.placeables = [attacker, target, largeBlocker];

      const result = coverDetector.detectBetweenTokens(attacker, target);

      expect(result).not.toBe('none');
    });

    test('large creature provides cover', () => {
      const attacker = createTestToken('attacker', 'med', { x: 0, y: 0 });
      const target = createTestToken('target', 'med', { x: 400, y: 0 });
      
      const largeBlocker = createTestToken('large-blocker', 'lg', {
        x: 200,
        y: 0,
        docWidth: 1,
        docHeight: 1,
      });

      canvas.tokens.placeables = [attacker, target, largeBlocker];
      const largeCover = coverDetector.detectBetweenTokens(attacker, target);

      expect(largeCover).not.toBe('none');
      expect(['lesser', 'standard', 'greater']).toContain(largeCover);
    });
  });

  describe('Tiny creature with top-down image', () => {
    test('correctly handles tiny creature size (0.5 squares)', () => {
      const attacker = createTestToken('attacker', 'med', { x: 0, y: 0 });
      const target = createTestToken('target', 'med', { x: 300, y: 0 });
      const tinyBlocker = createTestToken('tiny-blocker', 'tiny', {
        x: 150,
        y: 0,
        docWidth: 2,
        docHeight: 2,
      });

      canvas.tokens.placeables = [attacker, target, tinyBlocker];

      const result = coverDetector.detectBetweenTokens(attacker, target);

      expect(['none', 'lesser']).toContain(result);
    });
  });

  describe('Mixed sizes with top-down images', () => {
    test('handles mixed creature sizes correctly', () => {
      const mediumAttacker = createTestToken('attacker', 'med', {
        x: 0,
        y: 0,
        docWidth: 2,
        docHeight: 2,
      });
      const largeTarget = createTestToken('target', 'lg', {
        x: 400,
        y: 0,
        docWidth: 1,
        docHeight: 1,
      });
      const hugeBlocker = createTestToken('blocker', 'huge', {
        x: 200,
        y: 0,
        docWidth: 1,
        docHeight: 1,
      });

      canvas.tokens.placeables = [mediumAttacker, largeTarget, hugeBlocker];

      const result = coverDetector.detectBetweenTokens(mediumAttacker, largeTarget);

      expect(result).not.toBe('none');
      expect(['lesser', 'standard', 'greater']).toContain(result);
    });
  });

  describe('Regression tests for portrait tokens', () => {
    test('portrait-style tokens still work correctly', () => {
      const attacker = createTestToken('attacker', 'med', { x: 0, y: 0, docWidth: 1, docHeight: 1 });
      const target = createTestToken('target', 'med', { x: 300, y: 0, docWidth: 1, docHeight: 1 });
      const blocker = createTestToken('blocker', 'med', {
        x: 150,
        y: 0,
        docWidth: 1,
        docHeight: 1,
      });

      canvas.tokens.placeables = [attacker, target, blocker];

      const result = coverDetector.detectBetweenTokens(attacker, target);

      expect(result).not.toBe('none');
    });
  });
});
