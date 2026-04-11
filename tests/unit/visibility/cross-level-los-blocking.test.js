import { jest } from '@jest/globals';

describe('isSoundBlocked with native level-aware wall filtering', () => {
  let VisionAnalyzer;

  beforeEach(async () => {
    global.canvas = {
      grid: { size: 100 },
      dimensions: { distance: 5 },
      scene: {
        grid: { distance: 5 },
        levels: { size: 1 },
      },
      walls: { placeables: [] },
    };
    global.CONST = { EDGE_SENSE_TYPES: { NONE: 0, LIMITED: 10, NORMAL: 20 } };
    global.foundry = {
      canvas: { geometry: { Ray: class Ray { constructor(a, b) { this.A = a; this.B = b; } } } },
      utils: { lineLineIntersection: jest.fn().mockReturnValue(null) },
    };
    global.CONFIG = {};

    ({ VisionAnalyzer } = await import('../../../scripts/visibility/auto-visibility/VisionAnalyzer.js'));
  });

  test('blocks sound when observer-level wall intersects ray to cross-level target', async () => {
    const { LevelsIntegration } = await import('../../../scripts/services/LevelsIntegration.js');
    LevelsIntegration._instance = null;
    const inst = LevelsIntegration.getInstance();
    inst._isLevelsActive = false;
    inst._initialized = true;

    const soundBlockingWall = {
      document: {
        sound: 20,
        door: 0,
        ds: 0,
        levels: new Set(['floor-1']),
        c: [100, 0, 100, 100],
      },
    };
    global.foundry.utils.lineLineIntersection = jest.fn().mockReturnValue({ t0: 0.5, x: 100, y: 50 });
    global.canvas.walls = { placeables: [soundBlockingWall] };

    const analyzer = new VisionAnalyzer();

    const observer = {
      center: { x: 50, y: 50 },
      document: { elevation: 0, level: 'floor-1' },
      actor: null,
    };
    const target = {
      center: { x: 250, y: 50 },
      document: { elevation: 10, level: 'floor-2' },
      actor: null,
    };

    const result = analyzer.isSoundBlocked(observer, target);
    expect(result).toBe(true);
  });

  test('target-level wall blocks sound for cross-level pair', async () => {
    const { LevelsIntegration } = await import('../../../scripts/services/LevelsIntegration.js');
    LevelsIntegration._instance = null;
    const inst = LevelsIntegration.getInstance();
    inst._isLevelsActive = false;
    inst._initialized = true;

    const floor2Wall = {
      document: {
        sound: 20,
        door: 0,
        ds: 0,
        levels: new Set(['floor-2']),
        c: [100, 0, 100, 100],
      },
    };
    global.foundry.utils.lineLineIntersection = jest.fn().mockReturnValue({ t0: 0.5, x: 100, y: 50 });
    global.canvas.walls = { placeables: [floor2Wall] };

    const analyzer = new VisionAnalyzer();

    const observer = {
      center: { x: 50, y: 50 },
      document: { elevation: 0, level: 'floor-1' },
      actor: null,
    };
    const target = {
      center: { x: 250, y: 50 },
      document: { elevation: 10, level: 'floor-2' },
      actor: null,
    };

    const result = analyzer.isSoundBlocked(observer, target);
    expect(result).toBe(true);
  });

  test('wall with empty levels Set applies to all levels', async () => {
    const { LevelsIntegration } = await import('../../../scripts/services/LevelsIntegration.js');
    LevelsIntegration._instance = null;
    const inst = LevelsIntegration.getInstance();
    inst._isLevelsActive = false;
    inst._initialized = true;

    const globalWall = {
      document: {
        sound: 20,
        door: 0,
        ds: 0,
        levels: new Set(),
        c: [100, 0, 100, 100],
      },
    };
    global.foundry.utils.lineLineIntersection = jest.fn().mockReturnValue({ t0: 0.5, x: 100, y: 50 });
    global.canvas.walls = { placeables: [globalWall] };

    const analyzer = new VisionAnalyzer();

    const observer = {
      center: { x: 50, y: 50 },
      document: { elevation: 0, level: 'floor-1' },
      actor: null,
    };
    const target = {
      center: { x: 250, y: 50 },
      document: { elevation: 10, level: 'floor-2' },
      actor: null,
    };

    const result = analyzer.isSoundBlocked(observer, target);
    expect(result).toBe(true);
  });
});

describe('Cross-level visibility in tokenStateToInput', () => {
  let tokenStateToInput;
  let LevelsIntegration;
  let mockObserver;
  let mockTarget;
  let mockLightingCalculator;
  let mockVisionAnalyzer;
  let mockConditionManager;

  beforeEach(async () => {
    global.canvas = {
      grid: { size: 100 },
      dimensions: { distance: 5 },
      scene: {
        grid: { distance: 5 },
        levels: { size: 1 },
      },
      perception: { update: jest.fn() },
    };
    global.CONFIG = {};

    ({ LevelsIntegration } = await import('../../../scripts/services/LevelsIntegration.js'));
    ({ tokenStateToInput } = await import('../../../scripts/visibility/VisibilityCalculatorAdapter.js'));

    mockObserver = {
      name: 'Observer',
      id: 'obs-1',
      document: { x: 0, y: 0, width: 1, height: 1, elevation: 0, level: 'floor-1', id: 'obs-1', flags: { 'pf2e-visioner': {} }, getFlag: jest.fn().mockReturnValue(null) },
      actor: { system: { perception: { senses: [] } } },
      get center() { return { x: 50, y: 50 }; },
    };

    mockTarget = {
      name: 'Target',
      id: 'tgt-1',
      document: { x: 200, y: 0, width: 1, height: 1, elevation: 10, level: 'floor-2', id: 'tgt-1', flags: { 'pf2e-visioner': {} }, getFlag: jest.fn().mockReturnValue(null) },
      actor: { system: { traits: { value: [] } }, conditions: [] },
      get center() { return { x: 250, y: 50 }; },
    };

    mockLightingCalculator = {
      getLightLevelAt: jest.fn().mockReturnValue({ level: 'bright', darknessRank: 0, isDarknessSource: false }),
    };

    mockVisionAnalyzer = {
      getVisionCapabilities: jest.fn().mockReturnValue({
        hasVision: true,
        hasGreaterDarkvision: false,
        darkvisionRange: 0,
        sensingSummary: {
          precise: [{ type: 'vision', range: Infinity }],
          imprecise: [{ type: 'hearing', range: 30 }],
        },
      }),
      extractObserverConditions: jest.fn().mockReturnValue({ blinded: false, deafened: false, dazzled: false }),
      hasLineOfSight: jest.fn().mockReturnValue(true),
      isSoundBlocked: jest.fn().mockReturnValue(false),
    };

    mockConditionManager = {
      getConditions: jest.fn().mockReturnValue([]),
      isBlinded: jest.fn().mockReturnValue(false),
      isDeafened: jest.fn().mockReturnValue(false),
      isDazzled: jest.fn().mockReturnValue(false),
    };
  });

  afterEach(() => {
    LevelsIntegration._instance = null;
  });

  test('cross-level tokens preserve LOS from visionAnalyzer when no surface blocks', async () => {
    LevelsIntegration._instance = null;
    const inst = LevelsIntegration.getInstance();
    inst._isLevelsActive = false;
    inst._initialized = true;

    const result = await tokenStateToInput(
      mockObserver,
      mockTarget,
      mockLightingCalculator,
      mockVisionAnalyzer,
      mockConditionManager,
      null,
      { skipLOS: false },
    );

    expect(result).not.toBeNull();
    expect(result.hasLineOfSight).toBe(true);
  });

  test('wall-blocked LOS returns false even cross-level', async () => {
    mockVisionAnalyzer.hasLineOfSight.mockReturnValue(false);

    LevelsIntegration._instance = null;
    const inst = LevelsIntegration.getInstance();
    inst._isLevelsActive = false;
    inst._initialized = true;

    const result = await tokenStateToInput(
      mockObserver,
      mockTarget,
      mockLightingCalculator,
      mockVisionAnalyzer,
      mockConditionManager,
      null,
      { skipLOS: false },
    );

    expect(result).not.toBeNull();
    expect(result.hasLineOfSight).toBe(false);
    expect(result.soundBlocked).toBe(false);
  });

  test('base-level token vs leveled token preserves LOS when no surface blocks', async () => {
    LevelsIntegration._instance = null;
    const inst = LevelsIntegration.getInstance();
    inst._isLevelsActive = false;
    inst._initialized = true;

    const baseLevelObserver = {
      ...mockObserver,
      document: { ...mockObserver.document, level: '' },
    };

    const result = await tokenStateToInput(
      baseLevelObserver,
      mockTarget,
      mockLightingCalculator,
      mockVisionAnalyzer,
      mockConditionManager,
      null,
      { skipLOS: false },
    );

    expect(result).not.toBeNull();
    expect(result.hasLineOfSight).toBe(true);
  });

  test('same-level tokens preserve LOS result from visionAnalyzer', async () => {
    LevelsIntegration._instance = null;
    const inst = LevelsIntegration.getInstance();
    inst._isLevelsActive = false;
    inst._initialized = true;

    const sameLevelTarget = {
      ...mockTarget,
      document: { ...mockTarget.document, level: 'floor-1' },
    };

    const result = await tokenStateToInput(
      mockObserver,
      sameLevelTarget,
      mockLightingCalculator,
      mockVisionAnalyzer,
      mockConditionManager,
      null,
      { skipLOS: false },
    );

    expect(result).not.toBeNull();
    expect(result.hasLineOfSight).toBe(true);
  });

  test('skipLOS option bypasses LOS check', async () => {
    LevelsIntegration._instance = null;
    const inst = LevelsIntegration.getInstance();
    inst._isLevelsActive = false;
    inst._initialized = true;

    const result = await tokenStateToInput(
      mockObserver,
      mockTarget,
      mockLightingCalculator,
      mockVisionAnalyzer,
      mockConditionManager,
      null,
      { skipLOS: true },
    );

    expect(result).not.toBeNull();
    expect(result.hasLineOfSight).toBeUndefined();
  });
});
