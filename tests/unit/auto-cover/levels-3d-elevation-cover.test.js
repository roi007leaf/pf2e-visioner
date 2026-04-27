import '../../setup.js';

describe('Levels 3D elevation cover detection', () => {
  let coverDetector;

  beforeEach(async () => {
    jest.resetModules();
    const { CoverDetector } = await import('../../../scripts/cover/auto-cover/CoverDetector.js');
    coverDetector = new CoverDetector();

    global.canvas.walls = { objects: { children: [] } };
    global.canvas.tokens = { placeables: [] };
    global.canvas.grid = { size: 50 };
    global.canvas.scene = { grid: { distance: 5 } };
    global.canvas.dimensions = { size: 50, distance: 5 };

    global.game.modules = new Map([
      ['levels', { active: true }],
      ['wall-height', { active: true }],
    ]);

    global.game.settings.get = jest.fn((module, setting) => {
      const settingsMap = {
        wallCoverStandardThreshold: 50,
        wallCoverGreaterThreshold: 70,
        wallCoverAllowGreater: true,
        autoCoverTokenIntersectionMode: 'any',
        autoCoverIgnoreUndetected: false,
        autoCoverIgnoreDead: false,
        autoCoverIgnoreAllies: false,
        autoCoverAllowProneBlockers: true,
      };
      return settingsMap[setting] ?? 0;
    });

    global.CONFIG = {
      Levels: {
        API: {
          testCollision: jest.fn(() => false),
          checkCollision: jest.fn(() => false),
        },
      },
    };

    global.window = global.window || {};
    global.window.WallHeight = {
      getSourceElevationBounds: jest.fn(() => ({ bottom: 0, top: 10 })),
    };
  });

  describe('_analyzeSegmentObstructions with Levels pre-check', () => {
    test('should skip wall processing when Levels API says no 3D collision', () => {
      global.CONFIG.Levels.API.testCollision.mockReturnValue(false);

      const mockWall = {
        document: {
          id: 'wall-1',
          sight: 1,
          door: 0,
          ds: 0,
          dir: 0,
          getFlag: jest.fn(() => null),
          flags: { 'wall-height': { bottom: 0, top: 10 } },
        },
        coords: [125, 0, 125, 250],
      };
      global.canvas.walls.objects.children = [mockWall];

      const attackerSpan = { bottom: 100, top: 105 };
      const targetSpan = { bottom: 0, top: 5 };
      const p1 = { x: 25, y: 25 };
      const p2 = { x: 225, y: 25 };

      const result = coverDetector._analyzeSegmentObstructions(p1, p2, null, attackerSpan, targetSpan);

      expect(result.hasBlockingTerrain).toBe(false);
      expect(result.blockingWalls).toHaveLength(0);
    });

    test('should not skip normal walls only because Levels API says no 3D collision', () => {
      global.CONFIG.Levels.API.testCollision.mockReturnValue(false);

      const mockWall = {
        document: {
          id: 'normal-wall',
          sight: 1,
          door: 0,
          ds: 0,
          dir: 0,
          getFlag: jest.fn(() => null),
        },
        coords: [125, 0, 125, 250],
      };
      global.canvas.walls.objects.children = [mockWall];

      const attackerSpan = { bottom: 0, top: 5 };
      const targetSpan = { bottom: 0, top: 5 };
      const p1 = { x: 25, y: 25 };
      const p2 = { x: 225, y: 25 };

      const result = coverDetector._analyzeSegmentObstructions(p1, p2, null, attackerSpan, targetSpan);

      expect(result.hasBlockingTerrain).toBe(true);
      expect(result.blockingWalls).toHaveLength(1);
    });

    test('should detect wall when Levels API says 3D collision exists', () => {
      global.CONFIG.Levels.API.testCollision.mockReturnValue({ x: 125, y: 25, z: 5 });

      const mockWall = {
        document: {
          id: 'wall-1',
          sight: 1,
          door: 0,
          ds: 0,
          dir: 0,
          getFlag: jest.fn(() => null),
          flags: { 'wall-height': { bottom: 0, top: 100 } },
        },
        coords: [125, 0, 125, 250],
      };
      global.canvas.walls.objects.children = [mockWall];

      const attackerSpan = { bottom: 0, top: 5 };
      const targetSpan = { bottom: 0, top: 5 };
      const p1 = { x: 25, y: 25 };
      const p2 = { x: 225, y: 25 };

      const result = coverDetector._analyzeSegmentObstructions(p1, p2, null, attackerSpan, targetSpan);

      expect(result.hasBlockingTerrain).toBe(true);
    });

    test('should still detect creatures even when Levels says no wall collision', () => {
      global.CONFIG.Levels.API.testCollision.mockReturnValue(false);

      const blockerToken = global.createMockToken({
        id: 'blocker',
        x: 100,
        y: 0,
        width: 1,
        height: 1,
        center: { x: 125, y: 25 },
      });
      global.canvas.tokens.placeables = [blockerToken];

      const attackerSpan = { bottom: 100, top: 105 };
      const targetSpan = { bottom: 0, top: 5 };
      const p1 = { x: 25, y: 25 };
      const p2 = { x: 225, y: 25 };

      const result = coverDetector._analyzeSegmentObstructions(p1, p2, null, attackerSpan, targetSpan);

      expect(result.hasBlockingTerrain).toBe(false);
      expect(result.hasCreatures).toBe(true);
    });
  });

  describe('_isRayBlockedByWalls with Levels pre-check', () => {
    test('should return false when Levels API says no 3D collision', () => {
      global.CONFIG.Levels.API.testCollision.mockReturnValue(false);

      const mockWall = {
        document: {
          id: 'wall-1',
          sight: 1,
          door: 0,
          ds: 0,
          dir: 0,
          getFlag: jest.fn(() => null),
          flags: { 'wall-height': { bottom: 0, top: 10 } },
        },
        coords: [125, 0, 125, 250],
      };
      global.canvas.walls.objects.children = [mockWall];

      const attackerSpan = { bottom: 100, top: 105 };
      const targetSpan = { bottom: 0, top: 5 };
      const a = { x: 25, y: 25 };
      const b = { x: 225, y: 25 };

      const result = coverDetector._isRayBlockedByWalls(a, b, null, attackerSpan, targetSpan);

      expect(result).toBe(false);
    });

    test('should check walls when Levels API says 3D collision exists', () => {
      global.CONFIG.Levels.API.testCollision.mockReturnValue({ x: 125, y: 25, z: 5 });

      const mockWall = {
        document: {
          id: 'wall-1',
          sight: 1,
          door: 0,
          ds: 0,
          dir: 0,
          getFlag: jest.fn(() => null),
          flags: { 'wall-height': { bottom: 0, top: 100 } },
        },
        coords: [125, 0, 125, 250],
      };
      global.canvas.walls.objects.children = [mockWall];

      const attackerSpan = { bottom: 0, top: 5 };
      const targetSpan = { bottom: 0, top: 5 };
      const a = { x: 25, y: 25 };
      const b = { x: 225, y: 25 };

      const result = coverDetector._isRayBlockedByWalls(a, b, null, attackerSpan, targetSpan);

      expect(result).toBe(true);
    });
  });

  describe('detectBetweenTokens with elevation difference', () => {
    test('attacker at height 100 should not get wall cover when Levels says ray is clear', () => {
      global.CONFIG.Levels.API.testCollision.mockReturnValue(false);

      const attacker = global.createMockToken({
        id: 'attacker',
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        elevation: 100,
        center: { x: 25, y: 25 },
      });
      attacker.losHeight = 102.5;

      const target = global.createMockToken({
        id: 'target',
        x: 4,
        y: 0,
        width: 1,
        height: 1,
        elevation: 0,
        center: { x: 225, y: 25 },
      });
      target.losHeight = 2.5;

      const mockWall = {
        document: {
          id: 'wall-1',
          sight: 1,
          door: 0,
          ds: 0,
          dir: 0,
          getFlag: jest.fn(() => null),
          flags: { 'wall-height': { bottom: 0, top: 10 } },
        },
        coords: [125, 0, 125, 250],
      };
      global.canvas.walls.objects.children = [mockWall];
      global.canvas.tokens.placeables = [attacker, target];

      const result = coverDetector.detectBetweenTokens(attacker, target);

      expect(result).toBe('none');
    });

    test('both tokens at elevation 0 should get wall cover when Levels confirms collision', () => {
      global.CONFIG.Levels.API.testCollision.mockReturnValue({ x: 125, y: 25, z: 2.5 });

      const attacker = global.createMockToken({
        id: 'attacker',
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        elevation: 0,
        center: { x: 25, y: 25 },
      });
      attacker.losHeight = 2.5;

      const target = global.createMockToken({
        id: 'target',
        x: 4,
        y: 0,
        width: 1,
        height: 1,
        elevation: 0,
        center: { x: 225, y: 25 },
      });
      target.losHeight = 2.5;

      const mockWall = {
        document: {
          id: 'wall-1',
          sight: 1,
          door: 0,
          ds: 0,
          dir: 0,
          getFlag: jest.fn(() => null),
          flags: { 'wall-height': { bottom: 0, top: 10 } },
        },
        coords: [125, 0, 125, 250],
      };
      global.canvas.walls.objects.children = [mockWall];
      global.canvas.tokens.placeables = [attacker, target];

      jest.spyOn(coverDetector, '_estimateWallCoveragePercent').mockReturnValue(60);
      jest.spyOn(coverDetector, '_findNearestTokenToPoint').mockReturnValue(target);

      const result = coverDetector.detectBetweenTokens(attacker, target);

      expect(result).toBe('standard');
    });
  });
});
