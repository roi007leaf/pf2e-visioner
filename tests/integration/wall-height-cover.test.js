import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import '../setup.js';

describe('CoverDetector with Wall Height Integration', () => {
  let coverDetector;
  let mockCanvas;
  let mockWall;
  let mockAttacker;
  let mockTarget;

  beforeEach(async () => {
    jest.resetModules();

    const coverDetectorInstance = (
      await import('../../scripts/cover/auto-cover/CoverDetector.js')
    ).default;
    coverDetector = coverDetectorInstance;

    global.game = {
      modules: new Map(),
      settings: {
        get: jest.fn((module, key) => {
          if (key === 'autoCoverTokenIntersectionMode') return 'tactical';
          if (key === 'autoCoverIgnoreUndetected') return false;
          if (key === 'autoCoverIgnoreDead') return false;
          if (key === 'autoCoverIgnoreAllies') return false;
          if (key === 'autoCoverAllowProneBlockers') return false;
          if (key === 'wallCoverStandardThreshold') return 50;
          if (key === 'wallCoverGreaterThreshold') return 70;
          return null;
        }),
      },
    };

    mockWall = {
      coords: [0, 50, 100, 50],
      document: {
        sight: 1,
        door: 0,
        ds: 0,
        dir: 0,
        c: [0, 50, 100, 50],
        getFlag: jest.fn(() => null),
      },
    };

    mockAttacker = {
      id: 'attacker-1',
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      document: {
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        elevation: 0,
      },
      center: { x: 50, y: 25 },
      getCenterPoint: () => ({ x: 50, y: 25, elevation: 0 }),
      actor: {
        system: {
          traits: {
            size: { value: 'med' },
          },
        },
        alliance: 'party',
      },
    };

    mockTarget = {
      id: 'target-1',
      x: 0,
      y: 75,
      width: 1,
      height: 1,
      document: {
        x: 0,
        y: 75,
        width: 1,
        height: 1,
        elevation: 0,
      },
      center: { x: 50, y: 75 },
      getCenterPoint: () => ({ x: 50, y: 75, elevation: 0 }),
      actor: {
        system: {
          traits: {
            size: { value: 'med' },
          },
        },
        alliance: 'opposition',
      },
    };

    mockCanvas = {
      walls: {
        objects: {
          children: [mockWall],
        },
      },
      tokens: {
        placeables: [mockAttacker, mockTarget],
      },
      grid: {
        size: 100,
      },
    };

    global.canvas = mockCanvas;
  });

  describe('Wall elevation filtering when Wall Height is inactive', () => {
    test('wall blocks regardless of elevation when module is inactive', () => {
      global.game.modules.set('wall-height', { active: false });

      mockAttacker.document.elevation = 0;
      mockAttacker.getCenterPoint = () => ({ x: 50, y: 25, elevation: 0 });

      mockTarget.document.elevation = 0;
      mockTarget.getCenterPoint = () => ({ x: 50, y: 75, elevation: 0 });

      const cover = coverDetector.detectBetweenTokens(mockAttacker, mockTarget);

      expect(cover).not.toBe('none');
    });

    test('wall blocks even when tokens are at different elevations', () => {
      global.game.modules.set('wall-height', { active: false });

      mockAttacker.document.elevation = 0;
      mockAttacker.getCenterPoint = () => ({ x: 50, y: 25, elevation: 0 });

      mockTarget.document.elevation = 20;
      mockTarget.getCenterPoint = () => ({ x: 50, y: 75, elevation: 20 });

      const cover = coverDetector.detectBetweenTokens(mockAttacker, mockTarget);

      expect(cover).not.toBe('none');
    });
  });

  describe('Wall elevation filtering when Wall Height is active', () => {
    beforeEach(() => {
      global.game.modules.set('wall-height', { active: true });
      if (!global.window) {
        global.window = {};
      }
      global.window.WallHeight = {
        getSourceElevationBounds: jest.fn(() => ({ bottom: 0, top: 10 })),
      };
    });

    test('wall blocks when tokens are within wall elevation range', () => {
      mockAttacker.document.elevation = 0;
      mockAttacker.getCenterPoint = () => ({ x: 50, y: 25, elevation: 0 });

      mockTarget.document.elevation = 5;
      mockTarget.getCenterPoint = () => ({ x: 50, y: 75, elevation: 5 });

      const cover = coverDetector.detectBetweenTokens(mockAttacker, mockTarget);

      expect(cover).not.toBe('none');
      expect(global.window.WallHeight.getSourceElevationBounds).toHaveBeenCalledWith(
        mockWall.document,
      );
    });

    test('wall does not block when tokens are above wall elevation', () => {
      global.window.WallHeight.getSourceElevationBounds = jest.fn(() => ({ bottom: 0, top: 10 }));

      mockAttacker.document.elevation = 15;
      mockAttacker.getCenterPoint = () => ({ x: 50, y: 25, elevation: 15 });

      mockTarget.document.elevation = 20;
      mockTarget.getCenterPoint = () => ({ x: 50, y: 75, elevation: 20 });

      const cover = coverDetector.detectBetweenTokens(mockAttacker, mockTarget);

      expect(cover).toBe('none');
    });

    test('wall does not block when tokens are below wall elevation', () => {
      global.window.WallHeight.getSourceElevationBounds = jest.fn(() => ({
        bottom: 20,
        top: 30,
      }));

      mockAttacker.document.elevation = 0;
      mockAttacker.getCenterPoint = () => ({ x: 50, y: 25, elevation: 0 });

      mockTarget.document.elevation = 10;
      mockTarget.getCenterPoint = () => ({ x: 50, y: 75, elevation: 10 });

      const cover = coverDetector.detectBetweenTokens(mockAttacker, mockTarget);

      expect(cover).toBe('none');
    });

    test('wall blocks when sight line passes through wall elevation range', () => {
      global.window.WallHeight.getSourceElevationBounds = jest.fn(() => ({ bottom: 5, top: 15 }));

      mockAttacker.document.elevation = 0;
      mockAttacker.getCenterPoint = () => ({ x: 50, y: 25, elevation: 0 });

      mockTarget.document.elevation = 20;
      mockTarget.getCenterPoint = () => ({ x: 50, y: 75, elevation: 20 });

      const cover = coverDetector.detectBetweenTokens(mockAttacker, mockTarget);

      expect(cover).not.toBe('none');
    });

    test('wall does not block when tokens are above wall elevation', () => {
      global.window.WallHeight.getSourceElevationBounds = jest.fn(() => ({ bottom: 0, top: 10 }));

      mockAttacker.document.elevation = 10;
      mockAttacker.getCenterPoint = () => ({ x: 50, y: 25, elevation: 10 });

      mockTarget.document.elevation = 15;
      mockTarget.getCenterPoint = () => ({ x: 50, y: 75, elevation: 15 });

      const cover = coverDetector.detectBetweenTokens(mockAttacker, mockTarget);

      expect(cover).toBe('none');
    });

    test('handles wall with no elevation bounds (falls back to always blocking)', () => {
      global.window.WallHeight.getSourceElevationBounds = jest.fn(() => null);

      mockAttacker.document.elevation = 50;
      mockAttacker.getCenterPoint = () => ({ x: 50, y: 25, elevation: 50 });

      mockTarget.document.elevation = 100;
      mockTarget.getCenterPoint = () => ({ x: 50, y: 75, elevation: 100 });

      const cover = coverDetector.detectBetweenTokens(mockAttacker, mockTarget);

      expect(cover).not.toBe('none');
    });
  });

  describe('Wall elevation with token heights', () => {
    beforeEach(() => {
      global.game.modules.set('wall-height', { active: true });
      if (!global.window) {
        global.window = {};
      }
      global.window.WallHeight = {
        getSourceElevationBounds: jest.fn(() => ({ bottom: 0, top: 10 })),
      };
    });

    test('considers token height when checking wall blocking', () => {
      mockAttacker.document.elevation = 0;
      mockAttacker.getCenterPoint = () => ({ x: 50, y: 25, elevation: 0 });
      mockAttacker.actor.system.traits.size.value = 'large';

      mockTarget.document.elevation = 8;
      mockTarget.getCenterPoint = () => ({ x: 50, y: 75, elevation: 8 });
      mockTarget.actor.system.traits.size.value = 'med';

      const cover = coverDetector.detectBetweenTokens(mockAttacker, mockTarget);

      expect(cover).not.toBe('none');
    });

    test('flying tokens can pass over low walls', () => {
      global.window.WallHeight.getSourceElevationBounds = jest.fn(() => ({ bottom: 0, top: 5 }));

      mockAttacker.document.elevation = 10;
      mockAttacker.getCenterPoint = () => ({ x: 50, y: 25, elevation: 10 });

      mockTarget.document.elevation = 15;
      mockTarget.getCenterPoint = () => ({ x: 50, y: 75, elevation: 15 });

      const cover = coverDetector.detectBetweenTokens(mockAttacker, mockTarget);

      expect(cover).toBe('none');
    });
  });
});
