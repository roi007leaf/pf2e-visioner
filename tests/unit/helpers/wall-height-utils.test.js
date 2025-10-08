import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import {
  isWallHeightActive,
  getWallElevationBounds,
  doesWallBlockAtElevation,
} from '../../../scripts/helpers/wall-height-utils.js';

describe('Wall Height Utils', () => {
  beforeEach(() => {
    global.game = {
      modules: new Map(),
    };
    global.window = {};
  });

  describe('isWallHeightActive', () => {
    test('returns false when Wall Height module is not present', () => {
      expect(isWallHeightActive()).toBe(false);
    });

    test('returns false when Wall Height module is present but not active', () => {
      global.game.modules.set('wall-height', { active: false });
      expect(isWallHeightActive()).toBe(false);
    });

    test('returns true when Wall Height module is active', () => {
      global.game.modules.set('wall-height', { active: true });
      expect(isWallHeightActive()).toBe(true);
    });
  });

  describe('getWallElevationBounds', () => {
    test('returns null when Wall Height module is not active', () => {
      const wallDoc = {};
      expect(getWallElevationBounds(wallDoc)).toBeNull();
    });

    test('returns null when WallHeight API is not available', () => {
      global.game.modules.set('wall-height', { active: true });
      const wallDoc = {};
      expect(getWallElevationBounds(wallDoc)).toBeNull();
    });

    test('returns bounds when Wall Height API returns valid bounds', () => {
      global.game.modules.set('wall-height', { active: true });
      global.window.WallHeight = {
        getSourceElevationBounds: jest.fn(() => ({ bottom: 0, top: 10 })),
      };

      const wallDoc = {};
      const bounds = getWallElevationBounds(wallDoc);

      expect(bounds).toEqual({ bottom: 0, top: 10 });
      expect(global.window.WallHeight.getSourceElevationBounds).toHaveBeenCalledWith(wallDoc);
    });

    test('returns null when WallHeight API returns null', () => {
      global.game.modules.set('wall-height', { active: true });
      global.window.WallHeight = {
        getSourceElevationBounds: jest.fn(() => null),
      };

      const wallDoc = {};
      expect(getWallElevationBounds(wallDoc)).toBeNull();
    });

    test('returns null when bounds contain non-finite values', () => {
      global.game.modules.set('wall-height', { active: true });
      global.window.WallHeight = {
        getSourceElevationBounds: jest.fn(() => ({ bottom: NaN, top: 10 })),
      };

      const wallDoc = {};
      expect(getWallElevationBounds(wallDoc)).toBeNull();
    });

    test('handles negative elevation values', () => {
      global.game.modules.set('wall-height', { active: true });
      global.window.WallHeight = {
        getSourceElevationBounds: jest.fn(() => ({ bottom: -5, top: 5 })),
      };

      const wallDoc = {};
      const bounds = getWallElevationBounds(wallDoc);

      expect(bounds).toEqual({ bottom: -5, top: 5 });
    });

    test('returns null on exception', () => {
      global.game.modules.set('wall-height', { active: true });
      global.window.WallHeight = {
        getSourceElevationBounds: jest.fn(() => {
          throw new Error('API error');
        }),
      };

      const wallDoc = {};
      expect(getWallElevationBounds(wallDoc)).toBeNull();
    });
  });

  describe('doesWallBlockAtElevation', () => {
    beforeEach(() => {
      global.game.modules.set('wall-height', { active: true });
    });

    test('returns true when wall bounds are not available', () => {
      global.window.WallHeight = {
        getSourceElevationBounds: jest.fn(() => null),
      };

      const wallDoc = {};
      const elevationRange = { bottom: 0, top: 10 };

      expect(doesWallBlockAtElevation(wallDoc, elevationRange)).toBe(true);
    });

    test('returns true when wall overlaps with elevation range (object)', () => {
      global.window.WallHeight = {
        getSourceElevationBounds: jest.fn(() => ({ bottom: 0, top: 10 })),
      };

      const wallDoc = {};
      const elevationRange = { bottom: 5, top: 15 };

      expect(doesWallBlockAtElevation(wallDoc, elevationRange)).toBe(true);
    });

    test('returns false when wall is completely above elevation range', () => {
      global.window.WallHeight = {
        getSourceElevationBounds: jest.fn(() => ({ bottom: 20, top: 30 })),
      };

      const wallDoc = {};
      const elevationRange = { bottom: 0, top: 10 };

      expect(doesWallBlockAtElevation(wallDoc, elevationRange)).toBe(false);
    });

    test('returns false when wall is completely below elevation range', () => {
      global.window.WallHeight = {
        getSourceElevationBounds: jest.fn(() => ({ bottom: 0, top: 5 })),
      };

      const wallDoc = {};
      const elevationRange = { bottom: 10, top: 20 };

      expect(doesWallBlockAtElevation(wallDoc, elevationRange)).toBe(false);
    });

    test('returns true when wall exactly matches elevation range', () => {
      global.window.WallHeight = {
        getSourceElevationBounds: jest.fn(() => ({ bottom: 0, top: 10 })),
      };

      const wallDoc = {};
      const elevationRange = { bottom: 0, top: 10 };

      expect(doesWallBlockAtElevation(wallDoc, elevationRange)).toBe(true);
    });

    test('handles elevation as single number (bottom and top are the same)', () => {
      global.window.WallHeight = {
        getSourceElevationBounds: jest.fn(() => ({ bottom: 0, top: 10 })),
      };

      const wallDoc = {};
      const elevation = 5;

      expect(doesWallBlockAtElevation(wallDoc, elevation)).toBe(true);
    });

    test('returns false when single elevation is above wall', () => {
      global.window.WallHeight = {
        getSourceElevationBounds: jest.fn(() => ({ bottom: 0, top: 5 })),
      };

      const wallDoc = {};
      const elevation = 10;

      expect(doesWallBlockAtElevation(wallDoc, elevation)).toBe(false);
    });

    test('returns false when single elevation is below wall', () => {
      global.window.WallHeight = {
        getSourceElevationBounds: jest.fn(() => ({ bottom: 10, top: 15 })),
      };

      const wallDoc = {};
      const elevation = 5;

      expect(doesWallBlockAtElevation(wallDoc, elevation)).toBe(false);
    });

    test('returns true for edge case where ranges just touch at bottom', () => {
      global.window.WallHeight = {
        getSourceElevationBounds: jest.fn(() => ({ bottom: 0, top: 10 })),
      };

      const wallDoc = {};
      const elevationRange = { bottom: 10, top: 20 };

      expect(doesWallBlockAtElevation(wallDoc, elevationRange)).toBe(false);
    });

    test('returns true for overlapping ranges with partial overlap', () => {
      global.window.WallHeight = {
        getSourceElevationBounds: jest.fn(() => ({ bottom: 5, top: 15 })),
      };

      const wallDoc = {};
      const elevationRange = { bottom: 10, top: 20 };

      expect(doesWallBlockAtElevation(wallDoc, elevationRange)).toBe(true);
    });
  });
});
