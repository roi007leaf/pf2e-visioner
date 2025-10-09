import { LevelsIntegration } from '../../../scripts/services/LevelsIntegration.js';

describe('LevelsIntegration', () => {
  let levelsIntegration;
  let mockToken1;
  let mockToken2;

  beforeEach(() => {
    levelsIntegration = new LevelsIntegration();

    global.game = {
      modules: new Map([
        ['levels', { active: false }],
        ['wall-height', { active: false }],
      ]),
    };

    global.CONFIG = {
      Levels: null,
    };

    global.canvas = {
      dimensions: {
        distance: 5,
        size: 100,
      },
    };

    mockToken1 = {
      document: { elevation: 0 },
      losHeight: 0,
      center: { x: 100, y: 100 },
      getCenterPoint: () => ({ x: 100, y: 100 }),
    };

    mockToken2 = {
      document: { elevation: 0 },
      losHeight: 0,
      center: { x: 200, y: 200 },
      getCenterPoint: () => ({ x: 200, y: 200 }),
    };

    levelsIntegration._initialized = false;
    LevelsIntegration._instance = null;
  });

  afterEach(() => {
    LevelsIntegration._instance = null;
  });

  describe('Singleton Pattern', () => {
    test('getInstance returns same instance', () => {
      const instance1 = LevelsIntegration.getInstance();
      const instance2 = LevelsIntegration.getInstance();
      expect(instance1).toBe(instance2);
    });

    test('constructor returns existing instance', () => {
      const instance1 = new LevelsIntegration();
      const instance2 = new LevelsIntegration();
      expect(instance1).toBe(instance2);
    });
  });

  describe('Initialization', () => {
    test('detects inactive Levels module', () => {
      levelsIntegration.initialize();
      expect(levelsIntegration.isActive).toBe(false);
      expect(levelsIntegration.hasWallHeight).toBe(false);
    });

    test('detects active Levels module', () => {
      game.modules.get('levels').active = true;
      levelsIntegration.initialize();
      expect(levelsIntegration.isActive).toBe(true);
    });

    test('detects active Wall Height module', () => {
      game.modules.get('wall-height').active = true;
      levelsIntegration.initialize();
      expect(levelsIntegration.hasWallHeight).toBe(true);
    });

    test('only initializes once', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      game.modules.get('levels').active = true;

      levelsIntegration.initialize();
      levelsIntegration.initialize();

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      consoleSpy.mockRestore();
    });
  });

  describe('API Access', () => {
    test('returns null when Levels is inactive', () => {
      levelsIntegration.initialize();
      expect(levelsIntegration.api).toBeNull();
    });

    test('returns API when Levels is active', () => {
      game.modules.get('levels').active = true;
      const mockAPI = { checkCollision: jest.fn() };
      CONFIG.Levels = { API: mockAPI };

      levelsIntegration.initialize();
      expect(levelsIntegration.api).toBe(mockAPI);
    });
  });

  describe('Token Elevation', () => {
    test('gets token elevation from document', () => {
      mockToken1.document.elevation = 10;
      expect(levelsIntegration.getTokenElevation(mockToken1)).toBe(10);
    });

    test('returns 0 for null token', () => {
      expect(levelsIntegration.getTokenElevation(null)).toBe(0);
    });

    test('returns 0 for token without document', () => {
      expect(levelsIntegration.getTokenElevation({})).toBe(0);
    });
  });

  describe('Token LOS Height', () => {
    test('uses losHeight when Levels is active', () => {
      game.modules.get('levels').active = true;
      levelsIntegration.initialize();

      mockToken1.losHeight = 15;
      mockToken1.document.elevation = 10;

      expect(levelsIntegration.getTokenLosHeight(mockToken1)).toBe(15);
    });

    test('falls back to elevation when Levels is inactive', () => {
      levelsIntegration.initialize();

      mockToken1.losHeight = 15;
      mockToken1.document.elevation = 10;

      expect(levelsIntegration.getTokenLosHeight(mockToken1)).toBe(10);
    });

    test('returns 0 for null token', () => {
      expect(levelsIntegration.getTokenLosHeight(null)).toBe(0);
    });
  });

  describe('Vertical Distance', () => {
    test('calculates vertical distance when Levels is active', () => {
      game.modules.get('levels').active = true;
      levelsIntegration.initialize();

      mockToken1.losHeight = 0;
      mockToken2.losHeight = 10;

      expect(levelsIntegration.getVerticalDistance(mockToken1, mockToken2)).toBe(10);
    });

    test('returns 0 when Levels is inactive', () => {
      levelsIntegration.initialize();

      mockToken1.losHeight = 0;
      mockToken2.losHeight = 10;

      expect(levelsIntegration.getVerticalDistance(mockToken1, mockToken2)).toBe(0);
    });

    test('handles negative elevation differences', () => {
      game.modules.get('levels').active = true;
      levelsIntegration.initialize();

      mockToken1.losHeight = 10;
      mockToken2.losHeight = 0;

      expect(levelsIntegration.getVerticalDistance(mockToken1, mockToken2)).toBe(10);
    });
  });

  describe('Total Distance', () => {
    test('calculates 2D distance when Levels is inactive', () => {
      levelsIntegration.initialize();

      const distance = levelsIntegration.getTotalDistance(mockToken1, mockToken2);
      expect(distance).toBeCloseTo(28.28, 1);
    });

    test('calculates 3D distance when Levels is active', () => {
      game.modules.get('levels').active = true;
      levelsIntegration.initialize();

      mockToken1.losHeight = 0;
      mockToken2.losHeight = 15;

      const distance = levelsIntegration.getTotalDistance(mockToken1, mockToken2);
      expect(distance).toBeCloseTo(32.02, 1);
    });

    test('returns Infinity for null tokens', () => {
      expect(levelsIntegration.getTotalDistance(null, mockToken2)).toBe(Infinity);
      expect(levelsIntegration.getTotalDistance(mockToken1, null)).toBe(Infinity);
    });
  });

  describe('3D Collision Detection', () => {
    test('returns false when Levels is inactive', () => {
      levelsIntegration.initialize();
      expect(levelsIntegration.test3DCollision(mockToken1, mockToken2)).toBe(false);
    });

    test('calls Levels API when active', () => {
      game.modules.get('levels').active = true;
      const mockCheckCollision = jest.fn().mockReturnValue({ x: 150, y: 150, z: 5 });
      CONFIG.Levels = {
        API: { checkCollision: mockCheckCollision },
      };
      levelsIntegration.initialize();

      const result = levelsIntegration.test3DCollision(mockToken1, mockToken2, 'sight');

      expect(mockCheckCollision).toHaveBeenCalledWith(mockToken1, mockToken2, 'sight');
      expect(result).toBe(true);
    });

    test('returns false on API error', () => {
      game.modules.get('levels').active = true;
      const mockCheckCollision = jest.fn().mockImplementation(() => {
        throw new Error('Test error');
      });
      CONFIG.Levels = {
        API: { checkCollision: mockCheckCollision },
      };
      levelsIntegration.initialize();

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const result = levelsIntegration.test3DCollision(mockToken1, mockToken2);

      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('Elevation Difference', () => {
    test('calculates elevation difference', () => {
      game.modules.get('levels').active = true;
      levelsIntegration.initialize();

      mockToken1.losHeight = 5;
      mockToken2.losHeight = 15;

      expect(levelsIntegration.getElevationDifference(mockToken1, mockToken2)).toBe(10);
    });

    test('uses elevation when Levels is inactive', () => {
      levelsIntegration.initialize();

      mockToken1.document.elevation = 5;
      mockToken2.document.elevation = 15;
      mockToken1.losHeight = 5;
      mockToken2.losHeight = 15;

      expect(levelsIntegration.getElevationDifference(mockToken1, mockToken2)).toBe(10);
    });
  });

  describe('Elevation Advantage', () => {
    test('detects elevation advantage', () => {
      game.modules.get('levels').active = true;
      levelsIntegration.initialize();

      mockToken1.losHeight = 10;
      mockToken2.losHeight = 0;

      expect(levelsIntegration.hasElevationAdvantage(mockToken1, mockToken2, 5)).toBe(true);
    });

    test('does not detect advantage below threshold', () => {
      game.modules.get('levels').active = true;
      levelsIntegration.initialize();

      mockToken1.losHeight = 3;
      mockToken2.losHeight = 0;

      expect(levelsIntegration.hasElevationAdvantage(mockToken1, mockToken2, 5)).toBe(false);
    });

    test('returns false when Levels is inactive', () => {
      levelsIntegration.initialize();

      mockToken1.losHeight = 10;
      mockToken2.losHeight = 0;

      expect(levelsIntegration.hasElevationAdvantage(mockToken1, mockToken2, 5)).toBe(false);
    });
  });

  describe('Cover Adjustment', () => {
    test('returns base cover when Levels is inactive', () => {
      levelsIntegration.initialize();

      const result = levelsIntegration.adjustCoverForElevation(
        mockToken1,
        mockToken2,
        'standard',
      );
      expect(result).toBe('standard');
    });

    test('returns base cover when elevation difference is small', () => {
      game.modules.get('levels').active = true;
      levelsIntegration.initialize();

      mockToken1.losHeight = 2;
      mockToken2.losHeight = 0;

      const result = levelsIntegration.adjustCoverForElevation(
        mockToken1,
        mockToken2,
        'standard',
      );
      expect(result).toBe('standard');
    });

    test('reduces cover with elevation advantage', () => {
      game.modules.get('levels').active = true;
      CONFIG.Levels = {
        API: { testCollision: jest.fn().mockReturnValue(false) },
      };
      levelsIntegration.initialize();

      mockToken1.losHeight = 15;
      mockToken2.losHeight = 0;

      const result = levelsIntegration.adjustCoverForElevation(
        mockToken1,
        mockToken2,
        'standard',
      );
      expect(result).toBe('lesser');
    });

    test('does not reduce cover below none', () => {
      game.modules.get('levels').active = true;
      CONFIG.Levels = {
        API: { testCollision: jest.fn().mockReturnValue(false) },
      };
      levelsIntegration.initialize();

      mockToken1.losHeight = 15;
      mockToken2.losHeight = 0;

      const result = levelsIntegration.adjustCoverForElevation(mockToken1, mockToken2, 'none');
      expect(result).toBe('none');
    });
  });

  describe('Debug Info', () => {
    test('returns null for null tokens', () => {
      expect(levelsIntegration.getDebugInfo(null, mockToken2)).toBeNull();
      expect(levelsIntegration.getDebugInfo(mockToken1, null)).toBeNull();
    });

    test('returns basic info when Levels is inactive', () => {
      levelsIntegration.initialize();

      mockToken1.document.elevation = 5;
      mockToken2.document.elevation = 10;

      const info = levelsIntegration.getDebugInfo(mockToken1, mockToken2);

      expect(info).toMatchObject({
        isActive: false,
        hasWallHeight: false,
        token1: { elevation: 5, losHeight: 5 },
        token2: { elevation: 10, losHeight: 10 },
      });
      expect(info.distances).toBeDefined();
      expect(info.collision).toBeUndefined();
    });

    test('returns collision info when Levels is active', () => {
      game.modules.get('levels').active = true;
      const mockCheckCollision = jest.fn().mockReturnValue(false);
      CONFIG.Levels = {
        API: { checkCollision: mockCheckCollision },
      };
      levelsIntegration.initialize();

      const info = levelsIntegration.getDebugInfo(mockToken1, mockToken2);

      expect(info.collision).toBeDefined();
      expect(info.collision.sight).toBe(false);
      expect(info.collision.sound).toBe(false);
    });
  });
});
