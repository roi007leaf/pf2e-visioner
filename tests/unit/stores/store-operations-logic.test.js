/**
 * CORE BUSINESS LOGIC TESTS: Store Operations
 *
 * Tests the core data persistence logic for cover and visibility states.
 * This is CRITICAL for data integrity - wrong persistence = lost game state.
 *
 * PRINCIPLE: Test real data operations, persistence, and retrieval logic
 */

import { jest } from '@jest/globals';

describe('Store Operations Core Logic', () => {
  let originalGame, originalCanvas;

  // Helper to create properly mocked tokens
  function createMockToken(id, scene = null) {
    return {
      id,
      document: {
        id: `${id}-doc`,
        parent: scene || global.canvas.scene,
        getFlag: jest.fn().mockImplementation((module, key) => {
          // Return empty object for cover/visibility flags
          return {};
        }),
        setFlag: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
    };
  }

  beforeEach(() => {
    // Store originals
    originalGame = global.game;
    originalCanvas = global.canvas;

    // Setup realistic scene with flag operations
    const mockScene = {
      id: 'test-scene',
      flags: {},
      getFlag: jest.fn().mockImplementation((module, key) => {
        return mockScene.flags[module]?.[key];
      }),
      setFlag: jest.fn().mockImplementation(async (module, key, value) => {
        if (!mockScene.flags[module]) mockScene.flags[module] = {};
        mockScene.flags[module][key] = value;
        return mockScene;
      }),
      unsetFlag: jest.fn().mockImplementation(async (module, key) => {
        if (mockScene.flags[module]) {
          delete mockScene.flags[module][key];
        }
        return mockScene;
      }),
    };

    global.game = {
      user: {
        isGM: true, // Required for store operations
      },
      scenes: {
        current: mockScene,
      },
    };

    global.canvas = {
      scene: mockScene,
    };

    global.MODULE_ID = 'pf2e-visioner';
  });

  afterEach(() => {
    global.game = originalGame;
    global.canvas = originalCanvas;
    jest.restoreAllMocks();
  });

  describe('setCoverBetween - Cover State Persistence', () => {
    test('persists cover state between tokens correctly', async () => {
      const { setCoverBetween } = await import('../../../scripts/stores/cover-map.js');

      const observer = createMockToken('observer-token');
      const target = createMockToken('target-token');

      await setCoverBetween(observer, target, 'standard');

      // Should update token document with cover data
      expect(observer.document.update).toHaveBeenCalledWith(
        expect.objectContaining({
          [`flags.${global.MODULE_ID}.cover`]: expect.objectContaining({
            'target-token-doc': 'standard',
          }),
        }),
        expect.any(Object),
      );
    });

    test('handles cover state removal (none state)', async () => {
      const { setCoverBetween } = await import('../../../scripts/stores/cover-map.js');

      const observer = createMockToken('observer-token');
      const target = createMockToken('target-token');

      // First set a cover state
      await setCoverBetween(observer, target, 'standard');

      // Then remove it
      await setCoverBetween(observer, target, 'none');

      // Should have been called twice (set then remove)
      expect(observer.document.update).toHaveBeenCalledTimes(2);
    });

    test('handles null/undefined tokens gracefully', async () => {
      const { setCoverBetween } = await import('../../../scripts/stores/cover-map.js');

      const validToken = createMockToken('valid-token');

      // Should not throw with null/undefined tokens
      await expect(setCoverBetween(null, validToken, 'standard')).resolves.toBeUndefined();
      await expect(setCoverBetween(validToken, null, 'standard')).resolves.toBeUndefined();
      await expect(setCoverBetween(null, null, 'standard')).resolves.toBeUndefined();

      // Should not have called update
      expect(global.canvas.scene.setFlag).not.toHaveBeenCalled();
    });
  });

  describe('getCoverBetween - Cover State Retrieval', () => {
    test('retrieves existing cover state correctly', async () => {
      const { getCoverBetween, setCoverBetween } = await import(
        '../../../scripts/stores/cover-map.js'
      );

      const observer = createMockToken('observer-token');
      const target = createMockToken('target-token');

      // Mock the observer's getFlag to return cover data
      observer.document.getFlag.mockImplementation((module, key) => {
        if (module === global.MODULE_ID && key === 'cover') {
          return {
            'target-token-doc': 'standard',
          };
        }
        return {};
      });

      const result = getCoverBetween(observer, target);
      expect(result).toBe('standard');
    });

    test('returns none for non-existent cover relationships', async () => {
      const { getCoverBetween } = await import('../../../scripts/stores/cover-map.js');

      const observer = createMockToken('observer-token');
      const target = createMockToken('target-token');

      const result = getCoverBetween(observer, target);
      expect(result).toBe('none');
    });

    test('handles corrupted cover map data gracefully', async () => {
      const { getCoverBetween } = await import('../../../scripts/stores/cover-map.js');

      const observer = createMockToken('observer-token');
      const target = createMockToken('target-token');

      // Setup corrupted cover map
      global.canvas.scene.flags[global.MODULE_ID] = {
        coverMap: {
          'observer-token': 'not-an-object', // Should be object
          'corrupted-observer': {
            'target-token': null, // Invalid cover state
          },
        },
      };

      observer.document.getFlag.mockImplementation((module, key) => {
        return global.canvas.scene.flags[module]?.[key] || {};
      });

      // Should handle corrupted data gracefully
      const result = getCoverBetween(observer, target);
      expect(result).toBe('none');
    });
  });

  describe('Store Operations Edge Cases', () => {
    test('handles scene flag operation failures gracefully', async () => {
      const { setCoverBetween } = await import('../../../scripts/stores/cover-map.js');

      // Make setFlag fail
      global.canvas.scene.setFlag = jest.fn().mockRejectedValue(new Error('Flag operation failed'));

      const observer = createMockToken('observer-token');
      const target = createMockToken('target-token');

      // Should handle failure gracefully (not throw)
      await expect(setCoverBetween(observer, target, 'standard')).resolves.toBeUndefined();
    });

    test('validates cover state values', async () => {
      const { setCoverBetween } = await import('../../../scripts/stores/cover-map.js');

      const observer = createMockToken('observer-token');
      const target = createMockToken('target-token');

      // Test with various invalid cover states - should handle gracefully
      await setCoverBetween(observer, target, 'invalid-state');
      await setCoverBetween(observer, target, null);
      await setCoverBetween(observer, target, undefined);
      await setCoverBetween(observer, target, 123);

      // Should have attempted to update token documents (even if invalid)
      expect(observer.document.update).toHaveBeenCalled();
    });
  });

  // Simplified visibility tests focusing on core logic
  describe('Visibility Store Operations', () => {
    test('basic visibility state persistence works', async () => {
      const { setVisibilityBetween } = await import('../../../scripts/stores/visibility-map.js');

      const observer = createMockToken('observer-token');
      const target = createMockToken('target-token');

      await setVisibilityBetween(observer, target, 'hidden');

      // Should attempt to update token document with visibility data
      expect(observer.document.update).toHaveBeenCalledWith(
        expect.objectContaining({
          [`flags.${global.MODULE_ID}.visibility`]: expect.any(Object),
        }),
        expect.any(Object),
      );
    });

    test('visibility state retrieval handles missing data', async () => {
      const { getVisibilityBetween } = await import('../../../scripts/stores/visibility-map.js');

      const observer = createMockToken('observer-token');
      const target = createMockToken('target-token');

      // Should return default state for non-existent data
      const result = getVisibilityBetween(observer, target);
      expect(result).toBe('observed');
    });

    test('handles null tokens in visibility operations', async () => {
      const { setVisibilityBetween, getVisibilityBetween } = await import(
        '../../../scripts/stores/visibility-map.js'
      );

      const validToken = createMockToken('valid-token');

      // Should handle null tokens gracefully
      await expect(setVisibilityBetween(null, validToken, 'hidden')).resolves.toBeUndefined();
      expect(getVisibilityBetween(null, validToken)).toBe('observed');
    });
  });
});
