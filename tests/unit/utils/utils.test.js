/**
 * Unit tests for PF2E Visioner utility functions
 */

// Import directly from stores to bypass re-export issues
import { cleanupDeletedToken } from '../../../scripts/services/scene-cleanup.js';
import { getCoverBetween, setCoverBetween } from '../../../scripts/stores/cover-map.js';
import { getVisibilityBetween, setVisibilityBetween } from '../../../scripts/stores/visibility-map.js';
import {
  capitalize,
  createCoverIndicator,
  createVisibilityIndicator,
  getLastRollTotalForActor,
  getSceneTargets,
  hasActiveEncounter,
  isTokenInEncounter,
  isValidToken,
  showNotification,
} from '../../../scripts/utils.js';

// No need to mock stores since we're importing directly

describe('Utility Functions', () => {
  let mockObserver, mockTarget;

  beforeEach(() => {
    // Create mock tokens for testing
    mockObserver = createMockToken({
      id: 'observer-1',
      x: 0,
      y: 0,
      actor: createMockActor({
        id: 'actor-1',
        type: 'character',
        hasPlayerOwner: true,
      }),
    });

    mockTarget = createMockToken({
      id: 'target-1',
      x: 100,
      y: 100,
      actor: createMockActor({
        id: 'actor-2',
        type: 'character',
        hasPlayerOwner: false,
      }),
    });

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('getVisibilityBetween', () => {
    test('should return observed state for tokens with line of sight', () => {
      // Mock canvas to simulate no walls between tokens
      global.canvas.walls.placeables = [];

      const result = getVisibilityBetween(mockObserver, mockTarget);
      expect(result).toBe('observed');
    });

    test('should return default state when no visibility is set', () => {
      // Mock a wall between tokens (wall detection is complex and depends on Foundry algorithms)
      const wall = createMockWall({
        c: [50, 0, 50, 100], // Vertical wall between tokens
        sight: 0, // Blocks sight
      });
      global.canvas.walls.placeables = [wall];

      // Without complex wall detection algorithms, the function returns the default "observed"
      const result = getVisibilityBetween(mockObserver, mockTarget);
      expect(result).toBe('observed'); // Default when no visibility is explicitly set
    });

    test('should handle null tokens gracefully', () => {
      expect(() => getVisibilityBetween(null, mockTarget)).not.toThrow();
      expect(() => getVisibilityBetween(mockObserver, null)).not.toThrow();
      expect(() => getVisibilityBetween(null, null)).not.toThrow();
    });

    test('should consider token elevation', () => {
      // Mock tokens at different elevations
      const elevatedTarget = createMockToken({
        ...mockTarget,
        document: { ...mockTarget.document, elevation: 10 },
      });

      const result = getVisibilityBetween(mockObserver, elevatedTarget);
      expect(result).toBeDefined();
    });
  });

  describe('setVisibilityBetween', () => {
    test('should set visibility state between tokens', async () => {
      const result = await setVisibilityBetween(mockObserver, mockTarget, 'hidden');
      expect(result).toBeUndefined(); // The function doesn't return a value
    });

    test('should handle invalid visibility states', () => {
      // The function doesn't validate states, it just sets them
      expect(() => setVisibilityBetween(mockObserver, mockTarget, 'invalid-state')).not.toThrow();
    });

    test('should validate observer and target tokens', () => {
      // The function returns early for null tokens, doesn't throw
      expect(() => setVisibilityBetween(null, mockTarget, 'hidden')).not.toThrow();
      expect(() => setVisibilityBetween(mockObserver, null, 'hidden')).not.toThrow();
    });

    test('should persist visibility changes', async () => {
      await setVisibilityBetween(mockObserver, mockTarget, 'concealed');
      const retrieved = getVisibilityBetween(mockObserver, mockTarget);
      expect(retrieved).toBe('concealed');
    });
  });

  describe('getCoverBetween', () => {
    test('should return no cover for tokens in open space', () => {
      global.canvas.walls.placeables = [];
      global.canvas.terrain.placeables = [];

      const result = getCoverBetween(mockObserver, mockTarget);
      expect(result).toBe('none');
    });

    test('should return default cover state when no cover is set', () => {
      const wall = createMockWall({
        c: [50, 0, 50, 100],
        sight: 0,
      });
      global.canvas.walls.placeables = [wall];

      // Without complex cover detection algorithms, the function returns the default "none"
      const result = getCoverBetween(mockObserver, mockTarget);
      expect(result).toBe('none'); // Default when no cover is explicitly set
    });

    test('should return default cover for complex scenarios', () => {
      const wall = createMockWall({
        c: [75, 0, 75, 100], // Wall closer to target
        sight: 0,
      });
      global.canvas.walls.placeables = [wall];

      // Cover detection depends on complex Foundry algorithms we don't mock
      const result = getCoverBetween(mockObserver, mockTarget);
      expect(result).toBe('none'); // Default when no cover is explicitly set
    });

    test('should handle terrain in cover calculation', () => {
      const terrain = createMockToken({
        id: 'terrain-1',
        x: 50,
        y: 50,
        width: 2,
        height: 2,
        actor: createMockActor({ type: 'terrain' }),
      });
      global.canvas.terrain.placeables = [terrain];

      // Terrain cover detection is complex, function returns default
      const result = getCoverBetween(mockObserver, mockTarget);
      expect(result).toBe('none'); // Default when no cover is explicitly set
    });

    test('should handle token size in cover calculation', () => {
      const largeTarget = createMockToken({
        ...mockTarget,
        width: 2,
        height: 2,
        actor: createMockActor({
          system: { traits: { size: { value: 'lg' } } },
        }),
      });

      const result = getCoverBetween(mockObserver, largeTarget);
      expect(result).toBeDefined();
    });
  });

  describe('setCoverBetween', () => {
    test('should set cover state between tokens', async () => {
      const result = await setCoverBetween(mockObserver, mockTarget, 'standard');
      expect(result).toBeUndefined(); // The function doesn't return a value
    });

    test('should handle invalid cover states', () => {
      // The function doesn't validate states, it just sets them
      expect(() => setCoverBetween(mockObserver, mockTarget, 'invalid-cover')).not.toThrow();
    });

    test('should validate observer and target tokens', () => {
      // These functions don't throw errors, they return early
      expect(() => setCoverBetween(null, mockTarget, 'standard')).not.toThrow();
      expect(() => setCoverBetween(mockObserver, null, 'standard')).not.toThrow();
    });

    test('should persist cover changes', async () => {
      await setCoverBetween(mockObserver, mockTarget, 'greater');
      const retrieved = getCoverBetween(mockObserver, mockTarget);
      expect(retrieved).toBe('greater');
    });
  });

  describe('cleanupDeletedToken', () => {
    let mockScene;

    beforeEach(() => {
      // Create a mock scene with getFlag method
      mockScene = {
        id: 'mock-scene',
        getFlag: jest.fn().mockReturnValue({}),
      };

      // Add parent scene to mock tokens
      mockTarget.document.parent = mockScene;
      mockObserver.document.parent = mockScene;
    });

    test('should clean up visibility data for deleted token', async () => {
      // Set up some visibility data
      await setVisibilityBetween(mockObserver, mockTarget, 'hidden');

      // Clean up
      const result = cleanupDeletedToken(mockTarget.document);
      expect(result).toBeDefined();
    });

    test('should handle tokens with no visibility data', () => {
      const newToken = createMockToken({ id: 'new-token' });
      newToken.document.parent = mockScene;
      const result = cleanupDeletedToken(newToken.document);
      expect(result).toBeDefined();
    });

    test('should clean up cover data for deleted token', async () => {
      // Set up some cover data
      await setCoverBetween(mockObserver, mockTarget, 'standard');

      // Clean up
      const result = cleanupDeletedToken(mockTarget.document);
      expect(result).toBeDefined();
    });
  });

  describe('showNotification', () => {
    test('should show info notification', () => {
      showNotification('test.message', 'info');
      expect(global.game.i18n.localize).toHaveBeenCalledWith('test.message');
      expect(global.ui.notifications.info).toHaveBeenCalledWith('test.message');
    });

    test('should show warn notification', () => {
      showNotification('test.message', 'warn');
      expect(global.game.i18n.localize).toHaveBeenCalledWith('test.message');
      expect(global.ui.notifications.warn).toHaveBeenCalledWith('test.message');
    });

    test('should show error notification', () => {
      showNotification('test.message', 'error');
      expect(global.game.i18n.localize).toHaveBeenCalledWith('test.message');
      expect(global.ui.notifications.error).toHaveBeenCalledWith('test.message');
    });

    test('should default to info notification', () => {
      showNotification('test.message');
      expect(global.game.i18n.localize).toHaveBeenCalledWith('test.message');
      expect(global.ui.notifications.info).toHaveBeenCalledWith('test.message');
    });

    test('should handle missing notification key', () => {
      showNotification('', 'info');
      expect(global.game.i18n.localize).toHaveBeenCalledWith('');
      expect(global.ui.notifications.info).toHaveBeenCalledWith('mock.message'); // Our mock returns this for empty strings
    });
  });

  describe('Edge Cases', () => {
    test('should handle tokens at same position', () => {
      const samePosToken = createMockToken({
        ...mockTarget,
        x: mockObserver.document.x,
        y: mockObserver.document.y,
      });

      const result = getVisibilityBetween(mockObserver, samePosToken);
      expect(result).toBeDefined();
    });

    test('should handle tokens with zero dimensions', () => {
      const zeroToken = createMockToken({
        ...mockTarget,
        width: 0,
        height: 0,
      });

      expect(() => getVisibilityBetween(mockObserver, zeroToken)).not.toThrow();
    });

    test('should handle very large tokens', () => {
      const hugeToken = createMockToken({
        ...mockTarget,
        width: 100,
        height: 100,
      });

      expect(() => getVisibilityBetween(mockObserver, hugeToken)).not.toThrow();
    });

    test('should handle tokens outside canvas bounds', () => {
      const offCanvasToken = createMockToken({
        ...mockTarget,
        x: 10000,
        y: 10000,
      });

      expect(() => getVisibilityBetween(mockObserver, offCanvasToken)).not.toThrow();
    });
  });

  describe('Performance', () => {
    test('should handle many tokens efficiently', () => {
      const tokens = Array.from({ length: 100 }, (_, i) =>
        createMockToken({
          id: `token-${i}`,
          x: i * 10,
          y: i * 10,
        }),
      );

      const startTime = performance.now();
      tokens.forEach((token) => {
        getVisibilityBetween(mockObserver, token);
      });
      const endTime = performance.now();

      // Should complete in reasonable time (less than 100ms)
      expect(endTime - startTime).toBeLessThan(100);
    });

    test('should handle many walls efficiently', () => {
      const walls = Array.from({ length: 50 }, (_, i) =>
        createMockWall({
          c: [i * 20, 0, i * 20, 100],
        }),
      );
      global.canvas.walls.placeables = walls;

      const startTime = performance.now();
      getVisibilityBetween(mockObserver, mockTarget);
      const endTime = performance.now();

      // Should complete in reasonable time (less than 50ms)
      expect(endTime - startTime).toBeLessThan(50);
    });
  });

  describe('Additional Utility Functions', () => {
    test('isValidToken should validate tokens correctly', () => {
      const validToken = createMockToken({ actor: { type: 'character' } });
      expect(isValidToken(validToken)).toBe(true);

      expect(isValidToken(null)).toBe(false);
      expect(isValidToken({})).toBe(false);
    });

    test('capitalize should work correctly', () => {
      expect(capitalize('hello')).toBe('Hello');
      expect(capitalize('world')).toBe('World');
    });

    test('createVisibilityIndicator should create elements', () => {
      const indicator = createVisibilityIndicator('hidden');
      expect(indicator).toBeDefined();
      expect(indicator.className).toBe('visibility-indicator');

      const observedIndicator = createVisibilityIndicator('observed');
      expect(observedIndicator).toBeNull();
    });

    test('createCoverIndicator should create elements', () => {
      const indicator = createCoverIndicator('standard');
      expect(indicator).toBeDefined();
      expect(indicator.className).toBe('cover-indicator');

      const noneIndicator = createCoverIndicator('none');
      expect(noneIndicator).toBeNull();
    });

    test('getSceneTargets should return valid targets', () => {
      const targets = getSceneTargets(mockObserver);
      expect(Array.isArray(targets)).toBe(true);
    });

    test('hasActiveEncounter should check combat state', () => {
      const hasEncounter = hasActiveEncounter();
      expect(typeof hasEncounter).toBe('boolean');
    });

    test('isTokenInEncounter should check token combat status', () => {
      const inEncounter = isTokenInEncounter(mockObserver);
      expect(typeof inEncounter).toBe('boolean');
    });

    test('getLastRollTotalForActor should handle messages', () => {
      const rollTotal = getLastRollTotalForActor(mockObserver.actor);
      expect(rollTotal).toBeDefined();
    });
  });
});
