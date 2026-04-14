import { LevelsIntegration } from '../../../scripts/services/LevelsIntegration.js';

function makeCoreScene(overrides = {}) {
  const levels = new Map([
    [
      'level-a',
      {
        id: 'level-a',
        elevation: { bottom: 0, top: 10 },
        visibility: { levels: new Set(['level-a']) },
      },
    ],
    [
      'level-b',
      {
        id: 'level-b',
        elevation: { bottom: 10, top: 20 },
        visibility: { levels: new Set(['level-b']) },
      },
    ],
  ]);

  levels.sorted = Array.from(levels.values());

  const scene = {
    levels,
    grid: { distance: 5 },
    _view: 'level-a',
    initialLevel: { id: 'level-a' },
    getSurfaces: jest.fn(() => []),
    testSurfaceCollision: jest.fn(() => false),
    ...overrides,
  };

  for (const level of levels.values()) {
    level.parent = scene;
  }

  return scene;
}

function makeToken({
  elevation = 0,
  losHeight = 0,
  center = { x: 100, y: 100 },
  level = null,
  movementOrigin = null,
  visionOrigin = null,
  soundOrigin = null,
} = {}) {
  const document = {
    elevation,
    level,
    _source: { level },
    parent: null,
    includedInLevel: jest.fn(function includedInLevel(levelRef) {
      const resolvedLevel =
        typeof levelRef === 'string' ? this.parent?.levels?.get?.(levelRef) ?? null : levelRef;
      if (!resolvedLevel || !level) return false;
      if (resolvedLevel.id === level) return true;
      return !!resolvedLevel?.visibility?.levels?.has?.(level);
    }),
  };

  if (movementOrigin) {
    document.getMovementOrigin = jest.fn(() => movementOrigin);
  }

  if (visionOrigin) {
    document.getVisionOrigin = jest.fn(() => visionOrigin);
  }

  if (soundOrigin) {
    document.getSoundOrigin = jest.fn(() => soundOrigin);
  }

  return {
    document,
    losHeight,
    center,
    getCenterPoint: () => ({ ...center }),
  };
}

describe('LevelsIntegration', () => {
  let levelsIntegration;
  let mockToken1;
  let mockToken2;

  beforeEach(() => {
    LevelsIntegration._instance = null;
    levelsIntegration = new LevelsIntegration();

    global.game = {
      modules: new Map([
        ['levels', { active: false }],
        ['wall-height', { active: false }],
      ]),
    };

    global.CONFIG = {
      Levels: null,
      Canvas: {
        polygonBackends: {
          sight: { testCollision: jest.fn(() => false) },
          sound: { testCollision: jest.fn(() => false) },
          light: { testCollision: jest.fn(() => false) },
          move: { testCollision: jest.fn(() => false) },
        },
      },
    };

    global.canvas = {
      dimensions: {
        distance: 5,
        size: 100,
      },
      grid: {
        size: 100,
      },
      scene: {
        grid: { distance: 5 },
      },
    };

    mockToken1 = makeToken({
      elevation: 0,
      losHeight: 0,
      center: { x: 100, y: 100 },
      level: 'level-a',
    });
    mockToken2 = makeToken({
      elevation: 0,
      losHeight: 0,
      center: { x: 200, y: 200 },
      level: 'level-b',
    });
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

  describe('Availability Detection', () => {
    test('detects no active integration by default', () => {
      levelsIntegration.initialize();
      expect(levelsIntegration.isActive).toBe(false);
      expect(levelsIntegration.mode).toBe('none');
      expect(levelsIntegration.hasWallHeight).toBe(false);
    });

    test('detects active legacy Levels module', () => {
      game.modules.get('levels').active = true;
      CONFIG.Levels = { API: { checkCollision: jest.fn() } };

      levelsIntegration.initialize();

      expect(levelsIntegration.isLegacyActive).toBe(true);
      expect(levelsIntegration.isActive).toBe(true);
      expect(levelsIntegration.mode).toBe('legacy');
    });

    test('detects active core levels scene', () => {
      canvas.scene = makeCoreScene();

      levelsIntegration.initialize();

      expect(levelsIntegration.isCoreActive).toBe(true);
      expect(levelsIntegration.isActive).toBe(true);
      expect(levelsIntegration.mode).toBe('core');
    });

    test('keeps wall-height compatibility detection', () => {
      game.modules.get('wall-height').active = true;
      levelsIntegration.initialize();
      expect(levelsIntegration.hasWallHeight).toBe(true);
    });
  });

  describe('API Access', () => {
    test('returns null when legacy Levels is inactive', () => {
      levelsIntegration.initialize();
      expect(levelsIntegration.api).toBeNull();
    });

    test('returns legacy API when available', () => {
      const mockAPI = { checkCollision: jest.fn() };
      game.modules.get('levels').active = true;
      CONFIG.Levels = { API: mockAPI };

      levelsIntegration.initialize();

      expect(levelsIntegration.api).toBe(mockAPI);
    });
  });

  describe('Token Positions', () => {
    test('gets token elevation from document by default', () => {
      mockToken1.document.elevation = 10;
      expect(levelsIntegration.getTokenElevation(mockToken1)).toBe(10);
    });

    test('uses movement origin elevation for core scenes', () => {
      canvas.scene = makeCoreScene();
      const token = makeToken({
        elevation: 10,
        level: 'level-a',
        movementOrigin: { x: 125, y: 130, elevation: 17 },
      });

      expect(levelsIntegration.getTokenElevation(token)).toBe(17);
      expect(token.document.getMovementOrigin).toHaveBeenCalled();
    });

    test('uses losHeight for legacy Levels module', () => {
      game.modules.get('levels').active = true;
      CONFIG.Levels = { API: {} };
      mockToken1.losHeight = 15;
      mockToken1.document.elevation = 10;

      expect(levelsIntegration.getTokenLosHeight(mockToken1)).toBe(15);
    });

    test('uses vision origin elevation for core scenes', () => {
      canvas.scene = makeCoreScene();
      const token = makeToken({
        elevation: 10,
        level: 'level-a',
        movementOrigin: { x: 125, y: 130, elevation: 10 },
        visionOrigin: { x: 125, y: 130, elevation: 19 },
      });

      expect(levelsIntegration.getTokenLosHeight(token)).toBe(19);
      expect(token.document.getVisionOrigin).toHaveBeenCalled();
    });

    test('resolves target token level for core collision checks', () => {
      canvas.scene = makeCoreScene();
      mockToken1.document.parent = canvas.scene;
      mockToken2.document.parent = canvas.scene;

      const level = levelsIntegration.getCollisionLevel({
        originToken: mockToken1,
        targetToken: mockToken2,
      });

      expect(level).toBe(canvas.scene.levels.get('level-b'));
    });

    test('checks directional core level inclusion', () => {
      canvas.scene = makeCoreScene();
      canvas.scene.levels.get('level-b').visibility.levels.add('level-a');

      const observer = makeToken({ level: 'level-a' });
      const target = makeToken({ level: 'level-b' });
      observer.document.parent = canvas.scene;
      target.document.parent = canvas.scene;

      expect(
        levelsIntegration.isTokenIncludedInLevel(target, canvas.scene.levels.get('level-a')),
      ).toBe(false);
      expect(
        levelsIntegration.isTokenIncludedInLevel(observer, canvas.scene.levels.get('level-b')),
      ).toBe(true);
    });
  });

  describe('Distances', () => {
    test('calculates 2D distance when no integration is active', () => {
      const distance = levelsIntegration.getTotalDistance(mockToken1, mockToken2);
      expect(distance).toBeCloseTo(7.07, 1);
    });

    test('calculates 3D distance for legacy Levels integration', () => {
      game.modules.get('levels').active = true;
      CONFIG.Levels = { API: {} };
      mockToken1.losHeight = 0;
      mockToken2.losHeight = 15;

      const distance = levelsIntegration.getTotalDistance(mockToken1, mockToken2);

      expect(distance).toBeCloseTo(7.68, 1);
    });

    test('calculates 3D distance from core token origins', () => {
      canvas.scene = makeCoreScene();
      const token1 = makeToken({
        level: 'level-a',
        movementOrigin: { x: 100, y: 100, elevation: 0 },
        visionOrigin: { x: 100, y: 100, elevation: 0 },
      });
      const token2 = makeToken({
        level: 'level-b',
        movementOrigin: { x: 200, y: 200, elevation: 15 },
        visionOrigin: { x: 200, y: 200, elevation: 15 },
      });

      const distance = levelsIntegration.getTotalDistance(token1, token2);

      expect(distance).toBeCloseTo(7.68, 1);
    });
  });

  describe('3D Collision Detection', () => {
    test('returns false when no integration is active', () => {
      expect(levelsIntegration.test3DCollision(mockToken1, mockToken2)).toBe(false);
    });

    test('calls legacy Levels API when active', () => {
      const mockCheckCollision = jest.fn().mockReturnValue({ x: 150, y: 150, z: 5 });
      game.modules.get('levels').active = true;
      CONFIG.Levels = {
        API: { checkCollision: mockCheckCollision },
      };

      const result = levelsIntegration.test3DCollision(mockToken1, mockToken2, 'sight');

      expect(mockCheckCollision).toHaveBeenCalledWith(mockToken1, mockToken2, 'sight');
      expect(result).toBe(true);
    });

    test('uses core testSurfaceCollision with inferred level', () => {
      canvas.scene = makeCoreScene({
        testSurfaceCollision: jest.fn().mockReturnValue(true),
      });
      canvas.scene.levels.get('level-a').visibility.levels.add('level-b');
      canvas.scene.levels.get('level-b').visibility.levels.add('level-a');
      const token1 = makeToken({
        level: 'level-a',
        movementOrigin: { x: 100, y: 100, elevation: 0 },
        visionOrigin: { x: 100, y: 100, elevation: 5 },
      });
      const token2 = makeToken({
        level: 'level-b',
        movementOrigin: { x: 200, y: 200, elevation: 10 },
        visionOrigin: { x: 200, y: 200, elevation: 15 },
      });
      token1.document.parent = canvas.scene;
      token2.document.parent = canvas.scene;

      const result = levelsIntegration.test3DCollision(token1, token2, 'sight');

      expect(canvas.scene.testSurfaceCollision).toHaveBeenNthCalledWith(
        1,
        { x: 100, y: 100, elevation: 5 },
        { x: 200, y: 200, elevation: 15 },
        expect.objectContaining({
          type: 'sight',
          mode: 'any',
          side: 'above',
          level: canvas.scene.levels.get('level-a'),
          tMin: 0,
          tMax: 0.5,
        }),
      );
      expect(result).toBe(true);
    });

    test('uses core polygon collision when surfaces are clear', () => {
      canvas.scene = makeCoreScene({
        testSurfaceCollision: jest.fn().mockReturnValue(false),
      });
      canvas.scene.levels.get('level-a').visibility.levels.add('level-b');
      canvas.scene.levels.get('level-b').visibility.levels.add('level-a');
      CONFIG.Canvas.polygonBackends.sight.testCollision = jest.fn().mockReturnValue(true);

      const token1 = makeToken({
        level: 'level-a',
        movementOrigin: { x: 100, y: 100, elevation: 0 },
        visionOrigin: { x: 100, y: 100, elevation: 5 },
      });
      const token2 = makeToken({
        level: 'level-b',
        movementOrigin: { x: 200, y: 200, elevation: 10 },
        visionOrigin: { x: 200, y: 200, elevation: 15 },
      });
      token1.document.parent = canvas.scene;
      token2.document.parent = canvas.scene;

      const result = levelsIntegration.test3DCollision(token1, token2, 'sight');

      expect(canvas.scene.testSurfaceCollision).toHaveBeenNthCalledWith(
        1,
        { x: 100, y: 100, elevation: 5 },
        { x: 200, y: 200, elevation: 15 },
        expect.objectContaining({
          type: 'sight',
          mode: 'any',
          side: 'above',
          level: canvas.scene.levels.get('level-a'),
          tMin: 0,
          tMax: 0.5,
        }),
      );
      expect(CONFIG.Canvas.polygonBackends.sight.testCollision).toHaveBeenCalledWith(
        { x: 100, y: 100, elevation: 5 },
        { x: 200, y: 200, elevation: 15 },
        expect.objectContaining({
          type: 'sight',
          mode: 'any',
          level: canvas.scene.levels.get('level-a'),
          tMin: 0,
          tMax: 0.5,
        }),
      );
      expect(result).toBe(true);
    });

    test('treats sight as blocked when target level is not included in observer level', () => {
      canvas.scene = makeCoreScene({
        testSurfaceCollision: jest.fn().mockReturnValue(false),
      });
      canvas.scene.levels.get('level-b').visibility.levels.add('level-a');

      const floor1Observer = makeToken({
        level: 'level-a',
        movementOrigin: { x: 100, y: 100, elevation: 0 },
        visionOrigin: { x: 100, y: 100, elevation: 5 },
      });
      const floor2Target = makeToken({
        level: 'level-b',
        movementOrigin: { x: 200, y: 200, elevation: 10 },
        visionOrigin: { x: 200, y: 200, elevation: 15 },
      });
      floor1Observer.document.parent = canvas.scene;
      floor2Target.document.parent = canvas.scene;

      const blockedFromFloor1 = levelsIntegration.test3DCollision(
        floor1Observer,
        floor2Target,
        'sight',
      );
      const visibleFromFloor2 = levelsIntegration.test3DCollision(
        floor2Target,
        floor1Observer,
        'sight',
      );

      expect(blockedFromFloor1).toBe(true);
      expect(visibleFromFloor2).toBe(false);
    });

    test('splits core surface collision across origin and target levels', () => {
      canvas.scene = makeCoreScene({
        testSurfaceCollision: jest
          .fn()
          .mockReturnValueOnce(false)
          .mockReturnValueOnce(true),
      });
      canvas.scene.levels.get('level-a').visibility.levels.add('level-b');
      canvas.scene.levels.get('level-b').visibility.levels.add('level-a');

      const token1 = makeToken({
        level: 'level-a',
        movementOrigin: { x: 100, y: 100, elevation: 0 },
        visionOrigin: { x: 100, y: 100, elevation: 5 },
      });
      const token2 = makeToken({
        level: 'level-b',
        movementOrigin: { x: 200, y: 200, elevation: 10 },
        visionOrigin: { x: 200, y: 200, elevation: 15 },
      });
      token1.document.parent = canvas.scene;
      token2.document.parent = canvas.scene;

      const result = levelsIntegration.test3DCollision(token1, token2, 'sight');

      expect(canvas.scene.testSurfaceCollision).toHaveBeenNthCalledWith(
        1,
        { x: 100, y: 100, elevation: 5 },
        { x: 200, y: 200, elevation: 15 },
        expect.objectContaining({
          type: 'sight',
          mode: 'any',
          side: 'above',
          level: canvas.scene.levels.get('level-a'),
          tMin: 0,
          tMax: 0.5,
        }),
      );
      expect(canvas.scene.testSurfaceCollision).toHaveBeenNthCalledWith(
        2,
        { x: 100, y: 100, elevation: 5 },
        { x: 200, y: 200, elevation: 15 },
        expect.objectContaining({
          type: 'sight',
          mode: 'any',
          side: 'above',
          level: canvas.scene.levels.get('level-b'),
          tMin: 0.5,
          tMax: 1,
        }),
      );
      expect(result).toBe(true);
    });

    test('uses below side for descending core surface collision', () => {
      canvas.scene = makeCoreScene({
        testSurfaceCollision: jest.fn().mockReturnValue(true),
      });
      canvas.scene.levels.get('level-a').visibility.levels.add('level-b');
      canvas.scene.levels.get('level-b').visibility.levels.add('level-a');
      const upperToken = makeToken({
        level: 'level-b',
        movementOrigin: { x: 200, y: 200, elevation: 10 },
        visionOrigin: { x: 200, y: 200, elevation: 15 },
      });
      const lowerToken = makeToken({
        level: 'level-a',
        movementOrigin: { x: 100, y: 100, elevation: 0 },
        visionOrigin: { x: 100, y: 100, elevation: 5 },
      });
      upperToken.document.parent = canvas.scene;
      lowerToken.document.parent = canvas.scene;

      const result = levelsIntegration.test3DCollision(upperToken, lowerToken, 'sight');

      expect(canvas.scene.testSurfaceCollision).toHaveBeenNthCalledWith(
        1,
        { x: 200, y: 200, elevation: 15 },
        { x: 100, y: 100, elevation: 5 },
        expect.objectContaining({
          type: 'sight',
          mode: 'any',
          side: 'below',
          level: canvas.scene.levels.get('level-b'),
          tMin: 0,
          tMax: 0.5,
        }),
      );
      expect(result).toBe(true);
    });

    test('splits core sound collision across origin and target levels', () => {
      canvas.scene = makeCoreScene({
        testSurfaceCollision: jest.fn().mockReturnValue(false),
      });
      CONFIG.Canvas.polygonBackends.sound.testCollision = jest
        .fn()
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(true);

      const token1 = makeToken({
        level: 'level-a',
        soundOrigin: { x: 100, y: 100, elevation: 5 },
      });
      const token2 = makeToken({
        level: 'level-b',
        soundOrigin: { x: 200, y: 200, elevation: 15 },
      });
      token1.document.parent = canvas.scene;
      token2.document.parent = canvas.scene;

      const result = levelsIntegration.test3DCollision(token1, token2, 'sound');

      expect(CONFIG.Canvas.polygonBackends.sound.testCollision).toHaveBeenNthCalledWith(
        1,
        { x: 100, y: 100, elevation: 5 },
        { x: 200, y: 200, elevation: 15 },
        expect.objectContaining({
          type: 'sound',
          mode: 'any',
          level: canvas.scene.levels.get('level-a'),
          tMin: 0,
          tMax: 0.5,
        }),
      );
      expect(result).toBe(true);
    });

  });

  describe('Cover Adjustment', () => {
    test('returns base cover when no integration is active', () => {
      const result = levelsIntegration.adjustCoverForElevation(mockToken1, mockToken2, 'standard');
      expect(result).toBe('standard');
    });

    test('reduces cover with legacy elevation advantage', () => {
      game.modules.get('levels').active = true;
      CONFIG.Levels = {
        API: { testCollision: jest.fn().mockReturnValue(false) },
      };
      mockToken1.document.elevation = 15;
      mockToken1.losHeight = 15;
      mockToken2.document.elevation = 0;
      mockToken2.losHeight = 0;

      const result = levelsIntegration.adjustCoverForElevation(mockToken1, mockToken2, 'standard');

      expect(result).toBe('lesser');
    });

    test('reduces cover with core elevation advantage', () => {
      canvas.scene = makeCoreScene({
        testSurfaceCollision: jest.fn().mockReturnValue(false),
      });
      canvas.scene.levels.get('level-a').visibility.levels.add('level-b');
      canvas.scene.levels.get('level-b').visibility.levels.add('level-a');
      const observer = makeToken({
        level: 'level-a',
        movementOrigin: { x: 100, y: 100, elevation: 0 },
        visionOrigin: { x: 100, y: 100, elevation: 15 },
      });
      const target = makeToken({
        level: 'level-b',
        movementOrigin: { x: 200, y: 200, elevation: 0 },
        visionOrigin: { x: 200, y: 200, elevation: 0 },
      });
      observer.document.parent = canvas.scene;
      target.document.parent = canvas.scene;

      const result = levelsIntegration.adjustCoverForElevation(observer, target, 'standard');

      expect(result).toBe('lesser');
    });
  });

  describe('Debug Info', () => {
    test('returns null for null tokens', () => {
      expect(levelsIntegration.getDebugInfo(null, mockToken2)).toBeNull();
      expect(levelsIntegration.getDebugInfo(mockToken1, null)).toBeNull();
    });

    test('returns core mode in debug info', () => {
      canvas.scene = makeCoreScene();
      mockToken1.document.parent = canvas.scene;
      mockToken2.document.parent = canvas.scene;

      const info = levelsIntegration.getDebugInfo(mockToken1, mockToken2);

      expect(info.mode).toBe('core');
      expect(info.isActive).toBe(true);
    });
  });
});
