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
        unsetFlag: jest.fn().mockResolvedValue({}),
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

      // Should set once, then unset the now-empty cover flag.
      expect(observer.document.update).toHaveBeenCalledTimes(1);
      expect(observer.document.unsetFlag).toHaveBeenCalledWith(global.MODULE_ID, 'cover');
    });

    test('removing the last manual cover unsets the cover flag instead of persisting an empty map', async () => {
      const { setCoverBetween } = await import('../../../scripts/stores/cover-map.js');

      const observer = createMockToken('observer-token');
      const target = createMockToken('target-token');
      observer.document.getFlag.mockImplementation((module, key) => {
        if (module === global.MODULE_ID && key === 'cover') {
          return { 'target-token-doc': 'standard' };
        }
        return {};
      });

      await setCoverBetween(observer, target, 'none');

      expect(observer.document.unsetFlag).toHaveBeenCalledWith(global.MODULE_ID, 'cover');
      expect(observer.document.update).not.toHaveBeenCalledWith(
        expect.objectContaining({ [`flags.${global.MODULE_ID}.cover`]: {} }),
        expect.any(Object),
      );
    });

    test('removing manual cover removes observer-scoped cover source tracking', async () => {
      jest.resetModules();
      const removeSource = jest.fn().mockResolvedValue(undefined);
      jest.doMock('../../../scripts/rule-elements/SourceTracker.js', () => ({
        __esModule: true,
        SourceTracker: {
          addSourceToState: jest.fn().mockResolvedValue(undefined),
          removeSource,
        },
      }));

      const { setCoverBetween } = await import('../../../scripts/stores/cover-map.js');

      const observer = createMockToken('observer-token');
      const target = createMockToken('target-token');
      observer.document.getFlag.mockImplementation((module, key) => {
        if (module === global.MODULE_ID && key === 'cover') {
          return { 'target-token-doc': 'standard' };
        }
        return {};
      });

      await setCoverBetween(observer, target, 'none');

      expect(removeSource).toHaveBeenCalledWith(target, observer.id, 'cover', observer.id);
      jest.dontMock('../../../scripts/rule-elements/SourceTracker.js');
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

    test('falls back to token id when target document id is unavailable', async () => {
      const { setCoverBetween } = await import('../../../scripts/stores/cover-map.js');

      const observer = createMockToken('observer-token');
      const target = createMockToken('target-token');
      target.document.id = undefined;

      await setCoverBetween(observer, target, 'none', {
        takeCover: true,
        takeCoverProneRangedOnly: true,
      });

      expect(observer.document.unsetFlag).toHaveBeenCalledWith(global.MODULE_ID, 'cover');
    });

    test('take cover writes a cover-only AVS override marker from the cover store boundary', async () => {
      jest.resetModules();

      const applyForTakeCover = jest.fn().mockResolvedValue(true);
      jest.doMock('../../../scripts/chat/services/infra/AvsOverrideManager.js', () => ({
        __esModule: true,
        default: {
          applyForTakeCover,
        },
      }));

      const { setCoverBetween } = await import('../../../scripts/stores/cover-map.js');

      const observer = createMockToken('observer-token');
      const target = createMockToken('target-token');

      await setCoverBetween(observer, target, 'standard', { takeCover: true });

      expect(applyForTakeCover).toHaveBeenCalledWith(
        observer,
        expect.objectContaining({
          target,
          state: 'avs',
          coverOnly: true,
          hasCover: true,
          expectedCover: 'standard',
        }),
      );
    });

    test('clearing cover removes existing Take Cover tracking even outside take cover apply', async () => {
      jest.resetModules();

      const removeTakeCoverTracking = jest.fn().mockResolvedValue(true);
      jest.doMock('../../../scripts/chat/services/infra/AvsOverrideManager.js', () => ({
        __esModule: true,
        default: {
          removeTakeCoverTracking,
        },
      }));

      const { setCoverBetween } = await import('../../../scripts/stores/cover-map.js');

      const observer = createMockToken('observer-token');
      const target = createMockToken('target-token');
      observer.document.getFlag.mockImplementation((module, key) => {
        if (module === global.MODULE_ID && key === 'cover') {
          return { 'target-token-doc': 'standard' };
        }
        return {};
      });

      await setCoverBetween(observer, target, 'none');

      expect(removeTakeCoverTracking).toHaveBeenCalledWith(
        'observer-token-doc',
        'target-token-doc',
      );
    });

    test('take cover store path writes the real cover-only AVS flag', async () => {
      jest.resetModules();
      jest.unmock('../../../scripts/chat/services/infra/AvsOverrideManager.js');

      const { setCoverBetween } = await import('../../../scripts/stores/cover-map.js');

      const observer = createMockToken('observer-token');
      const target = createMockToken('target-token');
      target.name = 'Target';
      observer.name = 'Observer';
      target.document.name = 'Target';
      observer.document.name = 'Observer';
      target.document.flags = { 'pf2e-visioner': {} };
      target.document.getFlag.mockImplementation((module, key) => {
        return target.document.flags?.[module]?.[key];
      });
      target.document.setFlag.mockImplementation(async (module, key, value) => {
        target.document.flags[module] ||= {};
        target.document.flags[module][key] = value;
        return target.document;
      });

      await setCoverBetween(observer, target, 'standard', { takeCover: true });

      expect(target.document.setFlag).toHaveBeenCalledWith(
        'pf2e-visioner',
        'avs-override-from-observer-token-doc',
        expect.objectContaining({
          observerId: 'observer-token-doc',
          targetId: 'target-token-doc',
          state: 'avs',
          source: 'take_cover_action',
          coverOnly: true,
          coverOverrideSource: 'take_cover_action',
          hasCover: true,
          expectedCover: 'standard',
        }),
      );
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

    test('retrieves cover using token id when target document id is unavailable', async () => {
      const { getCoverBetween } = await import('../../../scripts/stores/cover-map.js');

      const observer = createMockToken('observer-token');
      const target = createMockToken('target-token');
      target.document.id = undefined;

      observer.document.getFlag.mockImplementation((module, key) => {
        if (module === global.MODULE_ID && key === 'cover') {
          return {
            'target-token': 'standard',
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

      // Should attempt to persist visibility data
      expect(observer.document.setFlag).toHaveBeenCalledWith(
        global.MODULE_ID,
        'visibilityV2',
        {
          'target-token-doc': expect.objectContaining({ detectionState: 'hidden' }),
        },
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
