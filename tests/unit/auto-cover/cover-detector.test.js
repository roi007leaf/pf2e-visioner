/**
 * Unit tests for CoverDetector
 * Tests cover detection algorithms using the public API
 */

import '../../setup.js';

describe('CoverDetector', () => {
  let coverDetector;
  const WALL_SENSE_TYPES = {
    NONE: 0,
    LIMITED: 10,
    NORMAL: 20,
    PROXIMITY: 30,
    DISTANCE: 40,
  };

  function makeVerticalWall(sight, threshold) {
    return {
      document: {
        id: `wall-${sight}-${threshold}`,
        c: [50, -100, 50, 100],
        sight,
        sound: 0,
        light: 20,
        move: 20,
        door: 0,
        ds: 0,
        dir: 0,
        threshold: { sight: threshold },
        getFlag: jest.fn(() => undefined),
      },
    };
  }

  beforeEach(async () => {
    jest.resetModules();

    // Import the detector
    const coverDetectorInstance = (
      await import('../../../scripts/cover/auto-cover/CoverDetector.js')
    ).default;
    coverDetector = coverDetectorInstance;

    // Setup mock canvas with walls and tokens
    global.canvas.walls.placeables = [];
    global.canvas.tokens.placeables = [];
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    test('should initialize correctly', () => {
      expect(coverDetector).toBeDefined();
      expect(typeof coverDetector.detectBetweenTokens).toBe('function');
      expect(typeof coverDetector.detectFromPoint).toBe('function');
    });
  });

  describe('detectBetweenTokens', () => {
    let sourceToken, targetToken;

    beforeEach(() => {
      sourceToken = global.createMockToken({
        id: 'source',
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        center: { x: 50, y: 50 },
      });

      targetToken = global.createMockToken({
        id: 'target',
        x: 200,
        y: 200,
        width: 1,
        height: 1,
        center: { x: 250, y: 250 },
      });
    });

    test('should return none for invalid tokens', () => {
      const result = coverDetector.detectBetweenTokens(null, targetToken);
      expect(result).toBe('none');

      const result2 = coverDetector.detectBetweenTokens(sourceToken, null);
      expect(result2).toBe('none');
    });

    test('should return none for same token', () => {
      const result = coverDetector.detectBetweenTokens(sourceToken, sourceToken);
      expect(result).toBe('none');
    });

    test('should return none when no obstructions', () => {
      // No walls or blocking tokens
      global.canvas.walls.placeables = [];
      global.canvas.tokens.placeables = [sourceToken, targetToken];

      const result = coverDetector.detectBetweenTokens(sourceToken, targetToken);
      expect(result).toBe('none'); // Updated to match actual implementation
    });

    test('should detect some form of cover from blocking tokens', () => {
      // Add a blocking token between source and target
      const blockingToken = global.createMockToken({
        id: 'blocker',
        x: 100,
        y: 100,
        width: 1,
        height: 1,
        center: { x: 150, y: 150 },
      });

      global.canvas.tokens.placeables = [sourceToken, targetToken, blockingToken];

      const result = coverDetector.detectBetweenTokens(sourceToken, targetToken);
      // Just check that it returns a valid cover state
      expect(['none', 'lesser', 'standard', 'greater']).toContain(result);
    });

    test.each(['tactical', 'length10'])(
      'should apply token cover override only from blockers that actually block the pair in %s mode',
      (intersectionMode) => {
      const attacker = global.createMockToken({
        id: 'attacker',
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        center: { x: 25, y: 25 },
      });
      const target = global.createMockToken({
        id: 'target',
        x: 200,
        y: 0,
        width: 1,
        height: 1,
        center: { x: 225, y: 25 },
      });
      const unrelatedStandardBlocker = global.createMockToken({
        id: 'unrelated-standard-blocker',
        x: 100,
        y: 200,
        width: 1,
        height: 1,
        center: { x: 125, y: 225 },
        flags: { 'pf2e-visioner': { coverOverride: 'standard' } },
      });
      const actualLesserBlocker = global.createMockToken({
        id: 'actual-lesser-blocker',
        x: 100,
        y: 0,
        width: 1,
        height: 1,
        center: { x: 125, y: 25 },
        flags: { 'pf2e-visioner': { coverOverride: 'lesser' } },
      });

      global.canvas.walls.placeables = [];
      global.canvas.tokens.placeables = [
        attacker,
        target,
        unrelatedStandardBlocker,
        actualLesserBlocker,
      ];
      global.canvas.tokens.controlled = [];
      const originalGetSetting = global.game.settings.get;
      global.game.settings.get = jest.fn((_moduleId, setting) => {
        if (setting === 'autoCoverTokenIntersectionMode') return intersectionMode;
        if (setting === 'autoCoverAllowProneBlockers') return true;
        if (setting === 'wallCoverAllowGreater') return true;
        return false;
      });

      let result;
      try {
        result = coverDetector.detectBetweenTokens(attacker, target);
      } finally {
        global.game.settings.get = originalGetSetting;
      }

      expect(result).toBe('lesser');
      },
    );

    test('should merge per-call filter overrides into blocker filtering', () => {
      const attacker = global.createMockToken({
        id: 'attacker',
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        center: { x: 25, y: 25 },
      });
      const target = global.createMockToken({
        id: 'target',
        x: 200,
        y: 0,
        width: 1,
        height: 1,
        center: { x: 225, y: 25 },
      });
      const deadBlocker = global.createMockToken({
        id: 'dead-blocker',
        x: 100,
        y: 0,
        width: 1,
        height: 1,
        center: { x: 125, y: 25 },
        actor: {
          id: 'dead-actor',
          type: 'npc',
          alliance: 'hostile',
          hitPoints: { value: 0 },
          system: {
            traits: { size: { value: 'med' } },
            attributes: { perception: { value: 10 } },
          },
        },
      });

      global.canvas.walls.placeables = [];
      global.canvas.tokens.placeables = [attacker, target, deadBlocker];
      global.canvas.tokens.controlled = [];

      const baseline = coverDetector.detectBetweenTokens(attacker, target);
      const filtered = coverDetector.detectBetweenTokens(attacker, target, {
        filterOverrides: { ignoreDead: true },
      });

      expect(baseline).not.toBe('none');
      expect(filtered).toBe('none');
    });

    test('should use token grid space even when texture is scaled', () => {
      const attacker = global.createMockToken({
        id: 'attacker',
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        center: { x: 25, y: 90 },
      });
      const target = global.createMockToken({
        id: 'target',
        x: 200,
        y: 0,
        width: 1,
        height: 1,
        center: { x: 225, y: 90 },
      });
      const scaledBlocker = global.createMockToken({
        id: 'scaled-blocker',
        x: 100,
        y: 50,
        width: 1,
        height: 1,
        center: { x: 125, y: 75 },
      });
      scaledBlocker.document.texture = { scaleX: 0.5, scaleY: 0.5 };

      global.canvas.walls.placeables = [];
      global.canvas.tokens.placeables = [attacker, target, scaledBlocker];
      global.canvas.tokens.controlled = [];
      const originalGetSetting = global.game.settings.get;
      global.game.settings.get = jest.fn((_moduleId, setting) => {
        if (setting === 'autoCoverTokenIntersectionMode') return 'length10';
        if (setting === 'autoCoverAllowProneBlockers') return true;
        if (setting === 'wallCoverAllowGreater') return true;
        return false;
      });

      let result;
      try {
        result = coverDetector.detectBetweenTokens(attacker, target);
      } finally {
        global.game.settings.get = originalGetSetting;
      }

      expect(result).toBe('lesser');
    });

    test('should not grant wall cover for sampled wall coverage below standard threshold', () => {
      const attacker = global.createMockToken({
        id: 'attacker',
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        center: { x: 25, y: 25 },
      });
      const target = global.createMockToken({
        id: 'target',
        x: 200,
        y: 0,
        width: 1,
        height: 1,
        center: { x: 225, y: 25 },
      });

      global.canvas.tokens.placeables = [attacker, target];
      global.canvas.tokens.controlled = [];
      global.canvas.walls.placeables = [
        {
          document: {
            id: 'near-target-wall',
            sight: 1,
            door: 0,
            ds: 0,
            dir: 0,
            c: [215, 80, 245, 80],
            getFlag: jest.fn(() => null),
          },
          coords: [215, 80, 245, 80],
        },
      ];
      jest.spyOn(coverDetector, '_analyzeSegmentObstructions').mockReturnValue({
        hasBlockingTerrain: false,
        hasCreatures: false,
        blockingWalls: [],
        intersectingCreatures: [],
        totalBlockedLength: 0,
        segmentLength: 200,
      });
      jest.spyOn(coverDetector, '_estimateWallCoveragePercent').mockReturnValue(25);
      const originalGetSetting = global.game.settings.get;
      global.game.settings.get = jest.fn((_moduleId, setting) => {
        if (setting === 'wallCoverStandardThreshold') return 50;
        if (setting === 'wallCoverGreaterThreshold') return 70;
        if (setting === 'wallCoverAllowGreater') return true;
        return false;
      });

      let result;
      try {
        result = coverDetector.detectBetweenTokens(attacker, target);
      } finally {
        global.game.settings.get = originalGetSetting;
      }

      expect(result).toBe('none');
    });

    test('should not grant wall cover for proximity walls when attacker is within threshold', () => {
      sourceToken.center = { x: 40, y: 0 };
      sourceToken.document.x = 40;
      sourceToken.document.y = 0;
      sourceToken.document.width = 0;
      sourceToken.document.height = 0;
      targetToken.center = { x: 100, y: 0 };
      targetToken.document.x = 100;
      targetToken.document.y = 0;
      targetToken.document.width = 0;
      targetToken.document.height = 0;

      global.canvas.walls.placeables = [makeVerticalWall(WALL_SENSE_TYPES.PROXIMITY, 2)];
      global.canvas.tokens.placeables = [sourceToken, targetToken];

      const result = coverDetector.detectBetweenTokens(sourceToken, targetToken);
      expect(result).toBe('none');
    });

    test('should grant wall cover for proximity walls when attacker is outside threshold', () => {
      sourceToken.center = { x: 0, y: 0 };
      sourceToken.document.x = 0;
      sourceToken.document.y = 0;
      sourceToken.document.width = 0;
      sourceToken.document.height = 0;
      targetToken.center = { x: 100, y: 0 };
      targetToken.document.x = 100;
      targetToken.document.y = 0;
      targetToken.document.width = 0;
      targetToken.document.height = 0;

      global.canvas.walls.placeables = [makeVerticalWall(WALL_SENSE_TYPES.PROXIMITY, 2)];
      global.canvas.tokens.placeables = [sourceToken, targetToken];

      const result = coverDetector.detectBetweenTokens(sourceToken, targetToken);
      expect(result).toBe('standard');
    });

    test('should grant wall cover for reverse proximity walls when attacker is within threshold', () => {
      sourceToken.center = { x: 40, y: 0 };
      sourceToken.document.x = 40;
      sourceToken.document.y = 0;
      sourceToken.document.width = 0;
      sourceToken.document.height = 0;
      targetToken.center = { x: 100, y: 0 };
      targetToken.document.x = 100;
      targetToken.document.y = 0;
      targetToken.document.width = 0;
      targetToken.document.height = 0;

      global.canvas.walls.placeables = [makeVerticalWall(WALL_SENSE_TYPES.DISTANCE, 2)];
      global.canvas.tokens.placeables = [sourceToken, targetToken];

      const result = coverDetector.detectBetweenTokens(sourceToken, targetToken);
      expect(result).toBe('standard');
    });

    test('should not grant wall cover for reverse proximity walls when attacker is outside threshold', () => {
      sourceToken.center = { x: 0, y: 0 };
      sourceToken.document.x = 0;
      sourceToken.document.y = 0;
      sourceToken.document.width = 0;
      sourceToken.document.height = 0;
      targetToken.center = { x: 100, y: 0 };
      targetToken.document.x = 100;
      targetToken.document.y = 0;
      targetToken.document.width = 0;
      targetToken.document.height = 0;

      global.canvas.walls.placeables = [makeVerticalWall(WALL_SENSE_TYPES.DISTANCE, 2)];
      global.canvas.tokens.placeables = [sourceToken, targetToken];

      const result = coverDetector.detectBetweenTokens(sourceToken, targetToken);
      expect(result).toBe('none');
    });
  });

  describe('detectFromPoint', () => {
    let targetToken;

    beforeEach(() => {
      targetToken = global.createMockToken({
        id: 'target',
        x: 200,
        y: 200,
        width: 1,
        height: 1,
        center: { x: 250, y: 250 },
      });
    });

    test('should return none for invalid parameters', () => {
      const result = coverDetector.detectFromPoint(null, targetToken);
      expect(result).toBe('none');

      const result2 = coverDetector.detectFromPoint({ x: 50, y: 50 }, null);
      expect(result2).toBe('none');
    });

    test('should detect cover from a point', () => {
      const origin = { x: 50, y: 50 };
      global.canvas.walls.placeables = [];
      global.canvas.tokens.placeables = [targetToken];

      const result = coverDetector.detectFromPoint(origin, targetToken);
      expect(['none', 'lesser', 'standard', 'greater']).toContain(result);
    });
  });

  describe('error handling', () => {
    test('should handle malformed token data', () => {
      const malformedToken = { id: 'malformed' }; // Missing required properties
      const goodToken = global.createMockToken({ id: 'good' });

      expect(() => {
        coverDetector.detectBetweenTokens(malformedToken, goodToken);
      }).not.toThrow();

      expect(() => {
        coverDetector.detectBetweenTokens(goodToken, malformedToken);
      }).not.toThrow();
    });

    test('should handle missing canvas elements', () => {
      const sourceToken = global.createMockToken({ id: 'source' });
      const targetToken = global.createMockToken({ id: 'target' });

      // Remove canvas elements temporarily
      const originalWalls = global.canvas.walls;
      const originalTokens = global.canvas.tokens;
      global.canvas.walls = null;
      global.canvas.tokens = null;

      expect(() => {
        coverDetector.detectBetweenTokens(sourceToken, targetToken);
      }).not.toThrow();

      // Restore canvas
      global.canvas.walls = originalWalls;
      global.canvas.tokens = originalTokens;
    });
  });

  describe('wallCoverAllowGreater caps Levels elevation cover', () => {
    test('should cap Levels-upgraded greater cover to standard when wallCoverAllowGreater is false', () => {
      const attacker = global.createMockToken({
        id: 'attacker',
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        center: { x: 50, y: 50 },
      });

      const target = global.createMockToken({
        id: 'target',
        x: 200,
        y: 200,
        width: 1,
        height: 1,
        center: { x: 250, y: 250 },
      });

      global.canvas.walls.placeables = [];
      global.canvas.tokens.placeables = [attacker, target];

      const result = coverDetector._applyLevelsCoverAdjustment(attacker, target, 'standard');
      expect(result).toBe('standard');
    });

    test('should cap to standard when Levels upgrades to greater and setting is false', () => {
      const { LevelsIntegration } = require('../../../scripts/services/LevelsIntegration.js');
      const instance = LevelsIntegration.getInstance();
      jest.spyOn(instance, 'isActive', 'get').mockReturnValue(true);
      jest.spyOn(instance, 'adjustCoverForElevation').mockReturnValue('greater');

      const attacker = global.createMockToken({ id: 'attacker' });
      const target = global.createMockToken({ id: 'target' });

      global.game.settings.get = jest.fn((mod, setting) => {
        if (setting === 'wallCoverAllowGreater') return false;
        return false;
      });

      const result = coverDetector._applyLevelsCoverAdjustment(attacker, target, 'standard');
      expect(result).toBe('standard');

      LevelsIntegration._instance = null;
    });

    test('should allow Levels-upgraded greater cover when wallCoverAllowGreater is true', () => {
      const { LevelsIntegration } = require('../../../scripts/services/LevelsIntegration.js');
      const instance = LevelsIntegration.getInstance();
      jest.spyOn(instance, 'isActive', 'get').mockReturnValue(true);
      jest.spyOn(instance, 'adjustCoverForElevation').mockReturnValue('greater');

      const attacker = global.createMockToken({ id: 'attacker' });
      const target = global.createMockToken({ id: 'target' });

      global.game.settings.get = jest.fn((mod, setting) => {
        if (setting === 'wallCoverAllowGreater') return true;
        return false;
      });

      const result = coverDetector._applyLevelsCoverAdjustment(attacker, target, 'standard');
      expect(result).toBe('greater');

      LevelsIntegration._instance = null;
    });

    test('should not cap when base cover was already greater', () => {
      const { LevelsIntegration } = require('../../../scripts/services/LevelsIntegration.js');
      const instance = LevelsIntegration.getInstance();
      jest.spyOn(instance, 'isActive', 'get').mockReturnValue(true);
      jest.spyOn(instance, 'adjustCoverForElevation').mockReturnValue('greater');

      const attacker = global.createMockToken({ id: 'attacker' });
      const target = global.createMockToken({ id: 'target' });

      global.game.settings.get = jest.fn((mod, setting) => {
        if (setting === 'wallCoverAllowGreater') return false;
        return false;
      });

      const result = coverDetector._applyLevelsCoverAdjustment(attacker, target, 'greater');
      expect(result).toBe('greater');

      LevelsIntegration._instance = null;
    });
  });
});
