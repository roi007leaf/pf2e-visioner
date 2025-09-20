/**
 * Test file for store functions
 */

import { getCoverBetween, setCoverBetween } from '../../scripts/stores/cover-map.js';
import {
  getVisibility,
  getVisibilityBetween,
  getVisibilityMap,
  setVisibilityBetween,
  setVisibilityMap
} from '../../scripts/stores/visibility-map.js';
import { VisibilityOverrideManager } from '../../scripts/stores/visibility-override-manager.js';

describe('Store Functions', () => {
  test('should import visibility functions', () => {
    expect(typeof getVisibilityBetween).toBe('function');
    expect(typeof setVisibilityBetween).toBe('function');
    expect(typeof getVisibilityMap).toBe('function');
    expect(typeof setVisibilityMap).toBe('function');
    expect(typeof getVisibility).toBe('function');
  });

  test('should import cover functions', () => {
    expect(typeof getCoverBetween).toBe('function');
    expect(typeof setCoverBetween).toBe('function');
  });

  test('should get default visibility state', () => {
    const mockObserver = global.createMockToken({ id: 'observer' });
    const mockTarget = global.createMockToken({ id: 'target' });

    const result = getVisibilityBetween(mockObserver, mockTarget);
    expect(result).toBe('observed'); // Default state
  });

  test('should get default cover state', () => {
    const mockObserver = global.createMockToken({ id: 'observer' });
    const mockTarget = global.createMockToken({ id: 'target' });

    const result = getCoverBetween(mockObserver, mockTarget);
    expect(result).toBe('none'); // Default state
  });
});

describe('Visibility Map Functions', () => {
  let mockObserver, mockTarget;

  beforeEach(() => {
    mockObserver = global.createMockToken({ id: 'observer' });
    mockTarget = global.createMockToken({ id: 'target' });
  });

  describe('getVisibilityMap', () => {
    test('should return empty object for token without visibility flags', () => {
      const result = getVisibilityMap(mockObserver);
      expect(result).toEqual({});
    });

    test('should handle null token', () => {
      const result = getVisibilityMap(null);
      expect(result).toEqual({});
    });

    test('should return existing visibility map', () => {
      const visibilityMap = { 'target1': 'hidden', 'target2': 'concealed' };
      mockObserver.document.getFlag.mockReturnValue(visibilityMap);

      const result = getVisibilityMap(mockObserver);
      expect(result).toEqual(visibilityMap);
    });
  });

  describe('setVisibilityMap', () => {
    test('should not update if token is null', async () => {
      const result = await setVisibilityMap(null, {});
      expect(result).toBeUndefined();
    });

    test('should not update if user is not GM', async () => {
      global.game.user.isGM = false;
      const result = await setVisibilityMap(mockObserver, {});
      expect(result).toBeUndefined();
    });

    test('should update visibility map for GM', async () => {
      global.game.user.isGM = true;
      const visibilityMap = { 'target1': 'hidden' };

      await setVisibilityMap(mockObserver, visibilityMap);

      expect(mockObserver.document.update).toHaveBeenCalledWith(
        { 'flags.pf2e-visioner.visibility': visibilityMap },
        { diff: false }
      );
    });
  });

  describe('setVisibilityBetween', () => {
    test('should return early if observer or target is null', async () => {
      await setVisibilityBetween(null, mockTarget, 'hidden');
      await setVisibilityBetween(mockObserver, null, 'hidden');
      expect(mockObserver.document.update).not.toHaveBeenCalled();
    });

    test('should skip update if state has not changed', async () => {
      mockObserver.document.getFlag.mockReturnValue({ 'target': 'hidden' });

      await setVisibilityBetween(mockObserver, mockTarget, 'hidden');

      expect(mockObserver.document.update).not.toHaveBeenCalled();
    });

    test('should update visibility map when state changes', async () => {
      global.game.user.isGM = true;
      mockObserver.document.getFlag.mockReturnValue({});

      await setVisibilityBetween(mockObserver, mockTarget, 'hidden');

      expect(mockObserver.document.update).toHaveBeenCalledWith(
        { 'flags.pf2e-visioner.visibility': { 'target': 'hidden' } },
        { diff: false }
      );
    });

    test('should handle ephemeral update errors gracefully', async () => {
      global.game.user.isGM = true;
      mockObserver.document.getFlag.mockReturnValue({});

      // Mock error in ephemeral effects - should not throw
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });

      await setVisibilityBetween(mockObserver, mockTarget, 'hidden');

      consoleSpy.mockRestore();
    });

    test('should skip ephemeral update when specified', async () => {
      global.game.user.isGM = true;
      mockObserver.document.getFlag.mockReturnValue({});

      await setVisibilityBetween(mockObserver, mockTarget, 'hidden', { skipEphemeralUpdate: true });

      expect(mockObserver.document.update).toHaveBeenCalled();
    });
  });

  describe('getVisibility', () => {
    beforeEach(() => {
      global.canvas.tokens.get = jest.fn();
    });

    test('should handle string token IDs', () => {
      global.canvas.tokens.get
        .mockReturnValueOnce(mockObserver)
        .mockReturnValueOnce(mockTarget);

      const result = getVisibility('observer', 'target');
      expect(result).toBe('observed');
    });

    test('should handle missing observer token', () => {
      global.canvas.tokens.get.mockReturnValue(null);
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => { });

      const result = getVisibility('missing-observer', 'target');
      expect(result).toBe('observed');
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Observer token'));

      consoleSpy.mockRestore();
    });

    test('should handle missing target token', () => {
      global.canvas.tokens.get
        .mockReturnValueOnce(mockObserver)
        .mockReturnValueOnce(null);
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => { });

      const result = getVisibility('observer', 'missing-target');
      expect(result).toBe('observed');
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Target token'));

      consoleSpy.mockRestore();
    });

    test('should handle reverse direction lookup', () => {
      const result = getVisibility(mockObserver, mockTarget, 'target_to_observer');
      expect(result).toBe('observed');
    });

    test('should handle errors gracefully', () => {
      // Force an error by passing invalid tokens
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });

      const result = getVisibility(undefined, undefined);
      expect(result).toBe('observed');

      consoleSpy.mockRestore();
    });
  });
});

describe('VisibilityOverrideManager', () => {
  let manager;

  beforeEach(() => {
    manager = new VisibilityOverrideManager();
    jest.clearAllMocks();
  });

  afterEach(() => {
    manager.destroy();
  });

  describe('constructor', () => {
    test('should initialize with empty override map', () => {
      expect(manager.visibilityOverrides.size).toBe(0);
    });
  });

  describe('_generateKey', () => {
    test('should generate key from token objects', () => {
      const token1 = { document: { id: 'token1' } };
      const token2 = { document: { id: 'token2' } };

      const key = manager._generateKey(token1, token2);
      expect(key).toBe('token1->token2');
    });

    test('should generate key from token IDs', () => {
      const key = manager._generateKey('token1', 'token2');
      expect(key).toBe('token1->token2');
    });

    test('should handle tokens with id property', () => {
      const token1 = { id: 'token1' };
      const token2 = { id: 'token2' };

      const key = manager._generateKey(token1, token2);
      expect(key).toBe('token1->token2');
    });

    test('should throw error for invalid tokens', () => {
      expect(() => manager._generateKey(null, 'token2')).toThrow('Invalid tokens provided');
      expect(() => manager._generateKey('token1', null)).toThrow('Invalid tokens provided');
    });
  });

  describe('setVisibilityOverride', () => {
    test('should set override with default values', () => {
      manager.setVisibilityOverride('observer', 'target', 'hidden');

      const override = manager.getVisibilityOverride('observer', 'target');
      expect(override).toBeDefined();
      expect(override.visibilityState).toBe('hidden');
      expect(override.source).toBe('manual');
      expect(override.observerId).toBe('observer');
      expect(override.targetId).toBe('target');
    });

    test('should set override with custom values', () => {
      manager.setVisibilityOverride('observer', 'target', 'concealed', 10, 'sneak');

      const override = manager.getVisibilityOverride('observer', 'target');
      expect(override.visibilityState).toBe('concealed');
      expect(override.source).toBe('sneak');
    });

    test('should handle token objects', () => {
      const observer = { document: { id: 'obs' } };
      const target = { id: 'tgt' };

      manager.setVisibilityOverride(observer, target, 'hidden');

      const override = manager.getVisibilityOverride('obs', 'tgt');
      expect(override).toBeDefined();
    });
  });

  describe('getVisibilityOverride', () => {
    test('should return null for non-existent override', () => {
      const result = manager.getVisibilityOverride('observer', 'target');
      expect(result).toBeNull();
    });

    test('should return existing override', () => {
      manager.setVisibilityOverride('observer', 'target', 'hidden');

      const result = manager.getVisibilityOverride('observer', 'target');
      expect(result).toBeDefined();
      expect(result.visibilityState).toBe('hidden');
    });

    test('should remove and return null for expired override', () => {
      // Set override that expires immediately
      manager.setVisibilityOverride('observer', 'target', 'hidden', -1);

      const result = manager.getVisibilityOverride('observer', 'target');
      expect(result).toBeNull();
      expect(manager.visibilityOverrides.size).toBe(0);
    });
  });

  describe('hasVisibilityOverride', () => {
    test('should return false for non-existent override', () => {
      expect(manager.hasVisibilityOverride('observer', 'target')).toBe(false);
    });

    test('should return true for existing override', () => {
      manager.setVisibilityOverride('observer', 'target', 'hidden');
      expect(manager.hasVisibilityOverride('observer', 'target')).toBe(true);
    });

    test('should return false for expired override', () => {
      manager.setVisibilityOverride('observer', 'target', 'hidden', -1);
      expect(manager.hasVisibilityOverride('observer', 'target')).toBe(false);
    });
  });

  describe('removeVisibilityOverride', () => {
    test('should return false for non-existent override', () => {
      const result = manager.removeVisibilityOverride('observer', 'target');
      expect(result).toBe(false);
    });

    test('should remove existing override and return true', () => {
      const consoleSpy = jest.spyOn(console, 'debug').mockImplementation(() => { });

      manager.setVisibilityOverride('observer', 'target', 'hidden');
      const result = manager.removeVisibilityOverride('observer', 'target');

      expect(result).toBe(true);
      expect(manager.hasVisibilityOverride('observer', 'target')).toBe(false);

      consoleSpy.mockRestore();
    });
  });

  describe('removeAllOverridesInvolving', () => {
    test('should remove overrides involving specific token', () => {
      const consoleSpy = jest.spyOn(console, 'debug').mockImplementation(() => { });

      manager.setVisibilityOverride('token1', 'token2', 'hidden');
      manager.setVisibilityOverride('token2', 'token3', 'concealed');
      manager.setVisibilityOverride('token3', 'token4', 'observed');

      manager.removeAllOverridesInvolving('token2');

      expect(manager.hasVisibilityOverride('token1', 'token2')).toBe(false);
      expect(manager.hasVisibilityOverride('token2', 'token3')).toBe(false);
      expect(manager.hasVisibilityOverride('token3', 'token4')).toBe(true);

      consoleSpy.mockRestore();
    });
  });

  describe('cleanup', () => {
    test('should remove expired overrides', () => {
      const consoleSpy = jest.spyOn(console, 'debug').mockImplementation(() => { });

      manager.setVisibilityOverride('observer1', 'target1', 'hidden', 5);
      manager.setVisibilityOverride('observer2', 'target2', 'concealed', -1);

      manager.cleanup();

      expect(manager.hasVisibilityOverride('observer1', 'target1')).toBe(true);
      expect(manager.hasVisibilityOverride('observer2', 'target2')).toBe(false);

      consoleSpy.mockRestore();
    });

    test('should not log if no overrides to clean', () => {
      const consoleSpy = jest.spyOn(console, 'debug').mockImplementation(() => { });

      manager.cleanup();

      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('clearAll', () => {
    test('should clear all overrides', () => {
      const consoleSpy = jest.spyOn(console, 'debug').mockImplementation(() => { });

      manager.setVisibilityOverride('observer1', 'target1', 'hidden');
      manager.setVisibilityOverride('observer2', 'target2', 'concealed');

      manager.clearAll();

      expect(manager.visibilityOverrides.size).toBe(0);

      consoleSpy.mockRestore();
    });
  });


  describe('destroy', () => {
    test('should clear all overrides', () => {
      manager.setVisibilityOverride('observer', 'target', 'hidden');

      manager.destroy();

      expect(manager.visibilityOverrides.size).toBe(0);
    });
  });
});

describe('Global VisibilityOverrideManager functions', () => {
  test('should export default manager instance', () => {
    const defaultManager = require('../../scripts/stores/visibility-override-manager.js').default;
    expect(defaultManager).toBeInstanceOf(VisibilityOverrideManager);
  });

  test('should register global debug helper', () => {
    // Re-import to trigger global setup
    delete require.cache[require.resolve('../../scripts/stores/visibility-override-manager.js')];
    require('../../scripts/stores/visibility-override-manager.js');

  });

  test('should have working periodic cleanup function coverage', () => {
    // To get 100% function coverage, we need to make sure the arrow function
    // in the setInterval is executed. Let's do this by creating a fresh module 
    // import with mocked timers.

    jest.useFakeTimers();

    // Clear module cache and mock setInterval before importing
    delete require.cache[require.resolve('../../scripts/stores/visibility-override-manager.js')];

    // Import the module - this will execute the setInterval setup
    const module = require('../../scripts/stores/visibility-override-manager.js');
    const defaultManager = module.default;

    // Add test data
    defaultManager.setVisibilityOverride('expired1', 'expired2', 'hidden', -1);
    defaultManager.setVisibilityOverride('valid1', 'valid2', 'concealed', 5);

    expect(defaultManager.visibilityOverrides.size).toBe(2);

    const consoleSpy = jest.spyOn(console, 'debug').mockImplementation(() => { });

    // Advance time to trigger the setInterval callback
    jest.advanceTimersByTime(2 * 60 * 1000 + 100); // 2 minutes + buffer

    // Check that cleanup occurred
    expect(defaultManager.hasVisibilityOverride('expired1', 'expired2')).toBe(false);
    expect(defaultManager.hasVisibilityOverride('valid1', 'valid2')).toBe(true);

    consoleSpy.mockRestore();
    jest.useRealTimers();
  });
});

describe('Cover Map Functions with Ephemeral Effects', () => {
  let mockObserver, mockTarget;

  beforeEach(() => {
    mockObserver = global.createMockToken({ id: 'observer' });
    mockTarget = global.createMockToken({ id: 'target' });
  });

  describe('getCoverMap', () => {
    test('should return empty object for token without cover flags', () => {
      const { getCoverMap } = require('../../scripts/stores/cover-map.js');

      const result = getCoverMap(mockObserver);
      expect(result).toEqual({});
    });

    test('should handle null token', () => {
      const { getCoverMap } = require('../../scripts/stores/cover-map.js');

      const result = getCoverMap(null);
      expect(result).toEqual({});
    });

    test('should return existing cover map', () => {
      const { getCoverMap } = require('../../scripts/stores/cover-map.js');

      const coverMap = { 'target1': 'standard', 'target2': 'greater' };
      mockObserver.document.getFlag.mockReturnValue(coverMap);

      const result = getCoverMap(mockObserver);
      expect(result).toEqual(coverMap);
    });
  });

  describe('setCoverMap', () => {
    test('should not update if token is null', async () => {
      const { setCoverMap } = require('../../scripts/stores/cover-map.js');

      const result = await setCoverMap(null, {});
      expect(result).toBeUndefined();
    });

    test('should not update if user is not GM', async () => {
      const { setCoverMap } = require('../../scripts/stores/cover-map.js');

      global.game.user.isGM = false;
      const result = await setCoverMap(mockObserver, {});
      expect(result).toBeUndefined();
    });

    test('should update cover map for GM', async () => {
      const { setCoverMap } = require('../../scripts/stores/cover-map.js');

      global.game.user.isGM = true;
      const coverMap = { 'target1': 'standard' };

      await setCoverMap(mockObserver, coverMap);

      expect(mockObserver.document.update).toHaveBeenCalledWith(
        { 'flags.pf2e-visioner.cover': coverMap },
        { diff: false, render: false, animate: false }
      );
    });
  });

  test('should handle same state without ephemeral update', async () => {
    const { setCoverBetween, getCoverMap } = await import('../../scripts/stores/cover-map.js');

    mockObserver.document.getFlag.mockReturnValue({ 'target': 'standard' });

    await setCoverBetween(mockObserver, mockTarget, 'standard');

    // Should not call update since state is the same
    expect(mockObserver.document.update).not.toHaveBeenCalled();
  });

  test('should handle ephemeral update with skipEphemeralUpdate option', async () => {
    const { setCoverBetween } = await import('../../scripts/stores/cover-map.js');

    global.game.user.isGM = true;
    mockObserver.document.getFlag.mockReturnValue({});

    await setCoverBetween(mockObserver, mockTarget, 'standard', { skipEphemeralUpdate: true });

    expect(mockObserver.document.update).toHaveBeenCalled();
  });

  test('should handle ephemeral effects error gracefully', async () => {
    const { setCoverBetween } = await import('../../scripts/stores/cover-map.js');

    global.game.user.isGM = true;
    mockObserver.document.getFlag.mockReturnValue({});

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });

    await setCoverBetween(mockObserver, mockTarget, 'standard');

    consoleSpy.mockRestore();
  });
});
