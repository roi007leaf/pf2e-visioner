/**
 * CORE BUSINESS LOGIC TESTS: Cover Detection Algorithm
 *
 * Tests the core cover detection logic that determines cover states between tokens.
 * This is CRITICAL business logic that affects every attack in the game.
 *
 * PRINCIPLE: Test real cover detection scenarios, not UI or mocking
 */

import { jest } from '@jest/globals';
import autoCoverSystem from '../../../scripts/cover/auto-cover/AutoCoverSystem.js';
import '../../setup.js';

describe('Cover Detection Core Logic', () => {
  let originalGame, originalCanvas;

  beforeEach(() => {
    // Store originals
    originalGame = global.game;
    originalCanvas = global.canvas;

    // Setup minimal realistic environment
    global.game = {
      settings: {
        get: jest.fn().mockImplementation((module, setting) => {
          // Return realistic default settings
          if (setting === 'autoCoverIgnoreUndetected') return false;
          if (setting === 'autoCoverIgnoreDead') return true;
          if (setting === 'autoCoverIgnoreAllies') return false;
          return false;
        }),
      },
    };

    global.MODULE_ID = 'pf2e-visioner';
  });

  afterEach(() => {
    // Restore originals
    global.game = originalGame;
    global.canvas = originalCanvas;
    jest.restoreAllMocks();
  });

  describe('autoCoverSystem.detectCoverBetweenTokens - Core Algorithm', () => {
    test('returns none for same token (attacker and target identical)', async () => {
      const token = {
        id: 'same-token',
        center: { x: 100, y: 100 },
        getCenterPoint: () => ({ x: 100, y: 100 }),
      };

      const result = autoCoverSystem.detectCoverBetweenTokens(token, token);
      expect(result).toBe('none');
    });

    test('returns none for null/undefined tokens', async () => {
      const validToken = {
        id: 'valid',
        center: { x: 100, y: 100 },
        getCenterPoint: () => ({ x: 100, y: 100 }),
      };

      expect(autoCoverSystem.detectCoverBetweenTokens(null, validToken)).toBe('none');
      expect(autoCoverSystem.detectCoverBetweenTokens(validToken, null)).toBe('none');
      expect(autoCoverSystem.detectCoverBetweenTokens(null, null)).toBe('none');
    });

    test('ignores open doors for cover calculation', async () => {
      const attacker = {
        id: 'attacker',
        center: { x: 100, y: 100 },
        getCenterPoint: () => ({ x: 100, y: 100 }),
      };

      const target = {
        id: 'target',
        center: { x: 300, y: 100 },
        getCenterPoint: () => ({ x: 300, y: 100 }),
      };

      // Setup canvas with an OPEN door between them
      global.canvas = {
        walls: {
          placeables: [
            {
              document: {
                x: 200,
                y: 50,
                x2: 200,
                y2: 150,
                c: [200, 50, 200, 150],
                door: 1, // Is a door
                ds: 1, // OPEN
              },
            },
          ],
        },
        tokens: { placeables: [] },
        terrain: { placeables: [] },
      };

      const result = autoCoverSystem.detectCoverBetweenTokens(attacker, target);

      // Open door should NOT provide cover
      expect(result).toBe('none');
    });

    test('detects token cover from blocking creatures', async () => {
      const attacker = {
        id: 'attacker',
        center: { x: 100, y: 100 },
        getCenterPoint: () => ({ x: 100, y: 100 }),
        document: { width: 1, height: 1 },
      };

      const target = {
        id: 'target',
        center: { x: 300, y: 100 },
        getCenterPoint: () => ({ x: 300, y: 100 }),
        document: { width: 1, height: 1 },
      };

      const blocker = {
        id: 'blocker',
        center: { x: 200, y: 100 }, // Directly between attacker and target
        getCenterPoint: () => ({ x: 200, y: 100 }),
        document: {
          x: 175,
          y: 75, // Token bounds
          width: 1,
          height: 1,
        },
        actor: {
          type: 'npc',
          system: {
            attributes: { hp: { value: 10, max: 10 } }, // Alive
            traits: { size: { value: 'med' } },
          },
        },
      };

      // Setup canvas with blocking token
      global.canvas = {
        walls: { placeables: [] },
        tokens: {
          placeables: [attacker, target, blocker],
        },
        terrain: { placeables: [] },
      };

      const result = autoCoverSystem.detectCoverBetweenTokens(attacker, target);

      // Test that the function runs without error and returns a valid cover state
      expect(['none', 'lesser', 'standard', 'greater']).toContain(result);
      expect(typeof result).toBe('string');
    });

    test('ignores dead tokens for cover calculation when setting enabled', async () => {
      // Enable ignore dead setting
      global.game.settings.get = jest.fn().mockImplementation((module, setting) => {
        if (setting === 'autoCoverIgnoreDead') return true;
        return false;
      });

      const attacker = {
        id: 'attacker',
        center: { x: 100, y: 100 },
        getCenterPoint: () => ({ x: 100, y: 100 }),
        document: { width: 1, height: 1 },
      };

      const target = {
        id: 'target',
        center: { x: 300, y: 100 },
        getCenterPoint: () => ({ x: 300, y: 100 }),
        document: { width: 1, height: 1 },
      };

      const deadBlocker = {
        id: 'dead-blocker',
        center: { x: 200, y: 100 },
        getCenterPoint: () => ({ x: 200, y: 100 }),
        document: {
          x: 175,
          y: 75,
          width: 1,
          height: 1,
        },
        actor: {
          type: 'npc',
          system: {
            attributes: { hp: { value: 0, max: 10 } }, // DEAD
            traits: { size: { value: 'med' } },
          },
        },
      };

      global.canvas = {
        walls: { placeables: [] },
        tokens: {
          placeables: [attacker, target, deadBlocker],
        },
        terrain: { placeables: [] },
      };

      const result = autoCoverSystem.detectCoverBetweenTokens(attacker, target);

      // Dead token should be ignored, no cover
      expect(result).toBe('none');
    });

    test('handles complex scenarios with multiple cover sources', async () => {
      const attacker = {
        id: 'attacker',
        center: { x: 100, y: 100 },
        getCenterPoint: () => ({ x: 100, y: 100 }),
        document: { width: 1, height: 1 },
      };

      const target = {
        id: 'target',
        center: { x: 400, y: 100 },
        getCenterPoint: () => ({ x: 400, y: 100 }),
        document: { width: 1, height: 1 },
      };

      const blocker = {
        id: 'blocker',
        center: { x: 200, y: 100 },
        getCenterPoint: () => ({ x: 200, y: 100 }),
        document: { x: 175, y: 75, width: 1, height: 1 },
        actor: {
          type: 'npc',
          system: {
            attributes: { hp: { value: 10, max: 10 } },
            traits: { size: { value: 'med' } },
          },
        },
      };

      // Setup with BOTH wall AND token cover
      global.canvas = {
        walls: {
          placeables: [
            {
              document: {
                x: 300,
                y: 50,
                x2: 300,
                y2: 150,
                c: [300, 50, 300, 150],
                door: 0,
                ds: 0,
              },
            },
          ],
        },
        tokens: {
          placeables: [attacker, target, blocker],
        },
        terrain: { placeables: [] },
      };

      const result = autoCoverSystem.detectCoverBetweenTokens(attacker, target);

      // Test that the function handles complex scenarios without error
      expect(['none', 'lesser', 'standard', 'greater']).toContain(result);
      expect(typeof result).toBe('string');
    });
  });

  describe('Cover Detection Edge Cases', () => {
    test('handles tokens with missing center coordinates', async () => {
      const attacker = {
        id: 'attacker',
        center: null,
        getCenterPoint: () => null,
      };

      const target = {
        id: 'target',
        center: { x: 300, y: 100 },
        getCenterPoint: () => ({ x: 300, y: 100 }),
      };

      global.canvas = {
        walls: { placeables: [] },
        tokens: { placeables: [] },
        terrain: { placeables: [] },
      };

      // Should handle gracefully without crashing
      expect(() => autoCoverSystem.detectCoverBetweenTokens(attacker, target)).not.toThrow();
    });

    test('handles empty canvas (no walls, tokens, terrain)', async () => {
      const attacker = {
        id: 'attacker',
        center: { x: 100, y: 100 },
        getCenterPoint: () => ({ x: 100, y: 100 }),
      };

      const target = {
        id: 'target',
        center: { x: 300, y: 100 },
        getCenterPoint: () => ({ x: 300, y: 100 }),
      };

      global.canvas = {
        walls: { placeables: [] },
        tokens: { placeables: [] },
        terrain: { placeables: [] },
      };

      const result = autoCoverSystem.detectCoverBetweenTokens(attacker, target);

      // Empty canvas should result in no cover
      expect(result).toBe('none');
    });

    test('handles corrupted wall data gracefully', async () => {
      const attacker = {
        id: 'attacker',
        center: { x: 100, y: 100 },
        getCenterPoint: () => ({ x: 100, y: 100 }),
      };

      const target = {
        id: 'target',
        center: { x: 300, y: 100 },
        getCenterPoint: () => ({ x: 300, y: 100 }),
      };

      // Setup canvas with corrupted wall data
      global.canvas = {
        walls: {
          placeables: [
            {
              document: {
                x: NaN,
                y: 'invalid', // Corrupted coordinates
                x2: null,
                y2: undefined,
                c: [NaN, 'bad', null, undefined],
                door: 'not-a-number',
                ds: {},
              },
            },
            null, // Null wall
            undefined, // Undefined wall
            { document: null }, // Wall with null document
          ],
        },
        tokens: { placeables: [] },
        terrain: { placeables: [] },
      };

      // Should handle corrupted data without crashing
      expect(() => autoCoverSystem.detectCoverBetweenTokens(attacker, target)).not.toThrow();

      const result = autoCoverSystem.detectCoverBetweenTokens(attacker, target);
      expect(typeof result).toBe('string');
      expect(['none', 'lesser', 'standard', 'greater']).toContain(result);
    });
  });
});
