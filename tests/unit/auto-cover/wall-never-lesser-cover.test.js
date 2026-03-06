import '../../setup.js';

describe('Walls never grant lesser cover', () => {
  let coverDetector;

  beforeEach(async () => {
    jest.resetModules();
    const { CoverDetector } = await import('../../../scripts/cover/auto-cover/CoverDetector.js');
    coverDetector = new CoverDetector();

    global.canvas.walls = {
      placeables: [],
      objects: { children: [] },
    };
    global.canvas.tokens = { placeables: [] };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('_evaluateWallsCover', () => {
    test('should return standard (not lesser) when creatures detected in wall cover context', () => {
      jest.spyOn(coverDetector, '_checkWallCoverOverrides').mockReturnValue(null);
      jest.spyOn(coverDetector, '_analyzeSegmentObstructions').mockReturnValue({
        hasBlockingTerrain: false,
        hasCreatures: true,
        blockingWalls: [],
        intersectingCreatures: [{ id: 'creature-1' }],
        totalBlockedLength: 0,
        segmentLength: 200,
      });

      const p1 = { x: 0, y: 0 };
      const p2 = { x: 200, y: 0 };

      const result = coverDetector._evaluateWallsCover(p1, p2);

      expect(result).not.toBe('lesser');
      expect(result).toBe('standard');
    });

    test('should return standard when walls block below standard threshold', () => {
      jest.spyOn(coverDetector, '_checkWallCoverOverrides').mockReturnValue(null);
      jest.spyOn(coverDetector, '_analyzeSegmentObstructions').mockReturnValue({
        hasBlockingTerrain: true,
        hasCreatures: false,
        blockingWalls: [{ id: 'wall-1' }],
        intersectingCreatures: [],
        totalBlockedLength: 50,
        segmentLength: 200,
      });
      jest.spyOn(coverDetector, '_findNearestTokenToPoint').mockReturnValue(null);

      const p1 = { x: 0, y: 0 };
      const p2 = { x: 200, y: 0 };

      const result = coverDetector._evaluateWallsCover(p1, p2);

      expect(result).not.toBe('lesser');
      expect(result).toBe('standard');
    });

    test('should return none when no obstructions', () => {
      jest.spyOn(coverDetector, '_checkWallCoverOverrides').mockReturnValue(null);
      jest.spyOn(coverDetector, '_analyzeSegmentObstructions').mockReturnValue({
        hasBlockingTerrain: false,
        hasCreatures: false,
        blockingWalls: [],
        intersectingCreatures: [],
        totalBlockedLength: 0,
        segmentLength: 200,
      });

      const p1 = { x: 0, y: 0 };
      const p2 = { x: 200, y: 0 };

      const result = coverDetector._evaluateWallsCover(p1, p2);

      expect(result).toBe('none');
    });
  });

  describe('_evaluateCoverByTactical', () => {
    test('should return standard (not lesser) when a wall blocks only 1 of 4 corner lines', () => {
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
        x: 4,
        y: 0,
        width: 1,
        height: 1,
        center: { x: 225, y: 25 },
        actorSystem: { traits: { size: { value: 'med' } }, attributes: { perception: { value: 10 } } },
      });

      let callCount = 0;
      jest.spyOn(coverDetector, '_isRayBlockedByWalls').mockImplementation(() => {
        callCount++;
        return callCount % 4 === 1;
      });
      jest.spyOn(coverDetector, '_getIntersectionMode').mockReturnValue('any');

      const result = coverDetector._evaluateCoverByTactical(attacker, target, [], null, null, null, null);

      expect(result).not.toBe('lesser');
      expect(['standard', 'greater']).toContain(result);
    });

    test('should return none when no lines are blocked', () => {
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
        x: 4,
        y: 0,
        width: 1,
        height: 1,
        center: { x: 225, y: 25 },
        actorSystem: { traits: { size: { value: 'med' } }, attributes: { perception: { value: 10 } } },
      });

      jest.spyOn(coverDetector, '_isRayBlockedByWalls').mockReturnValue(false);
      jest.spyOn(coverDetector, '_getIntersectionMode').mockReturnValue('any');

      const result = coverDetector._evaluateCoverByTactical(attacker, target, [], null, null, null, null);

      expect(result).toBe('none');
    });

    test('should return greater when walls block all 4 corner lines', () => {
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
        x: 4,
        y: 0,
        width: 1,
        height: 1,
        center: { x: 225, y: 25 },
        actorSystem: { traits: { size: { value: 'med' } }, attributes: { perception: { value: 10 } } },
      });

      jest.spyOn(coverDetector, '_isRayBlockedByWalls').mockReturnValue(true);
      jest.spyOn(coverDetector, '_getIntersectionMode').mockReturnValue('any');

      const result = coverDetector._evaluateCoverByTactical(attacker, target, [], null, null, null, null);

      expect(result).toBe('greater');
    });
  });
});
