import '../../setup.js';

describe('CoverDetector ledge cover', () => {
  let coverDetector;
  let originalSettingsGet;
  let allowGreater;

  function makeLedgeWall({ id = 'ledge', c, ledge = true, ledgeElevation }) {
    const visionerFlags = ledge ? { ledge: true } : {};
    if (ledgeElevation !== undefined) visionerFlags.ledgeElevation = ledgeElevation;
    return {
      id,
      coords: c,
      document: {
        id,
        c,
        sight: 0,
        move: 0,
        light: 0,
        sound: 0,
        door: 0,
        dir: 0,
        flags: { 'pf2e-visioner': visionerFlags },
        getFlag: jest.fn(() => null),
      },
    };
  }

  function makeToken(id, x, elevation) {
    return createMockToken({
      id,
      x,
      y: 0,
      width: 1,
      height: 1,
      elevation,
      center: { x: x + 25, y: 25 },
    });
  }

  function setup({ lowX = 0, highX = 300, highElevation = 10, edgeX = 275, ledgeElevation = highElevation } = {}) {
    const low = makeToken('low', lowX, 0);
    const high = makeToken('high', highX, highElevation);
    canvas.tokens.placeables = [low, high];
    canvas.walls.placeables = [makeLedgeWall({ c: [edgeX, -100, edgeX, 150], ledgeElevation })];
    return { low, high };
  }

  beforeEach(async () => {
    jest.resetModules();
    coverDetector = (await import('../../../scripts/cover/auto-cover/CoverDetector.js')).default;
    canvas.walls.placeables = [];
    canvas.tokens.placeables = [];
    canvas.tokens.controlled = [];
    canvas.tiles = { placeables: [] };
    allowGreater = true;
    originalSettingsGet = game.settings.get;
    game.settings.get = jest.fn((_moduleId, key) => {
      if (key === 'wallCoverAllowGreater') return allowGreater;
      if (key === 'wallCoverStandardThreshold') return 50;
      if (key === 'wallCoverGreaterThreshold') return 70;
      if (key === 'autoCoverTokenIntersectionMode') return 'tactical';
      return false;
    });
  });

  afterEach(() => {
    game.settings.get = originalSettingsGet;
    delete canvas.tiles;
    jest.restoreAllMocks();
  });

  test('creature mostly visible over a ledge gets no cover from below', () => {
    const { low, high } = setup();
    expect(coverDetector.detectBetweenTokens(low, high)).toBe('none');
  });

  test('distant creature below a ledge gets no cover from above', () => {
    const { low, high } = setup();
    expect(coverDetector.detectBetweenTokens(high, low)).toBe('none');
  });

  test('creature hugging the base of a tall cliff gets greater cover from above', () => {
    const { low, high } = setup({ lowX: 0, highX: 300, highElevation: 20, edgeX: 50 });
    expect(coverDetector.detectBetweenTokens(high, low)).toBe('greater');
  });

  test('greater ledge cover is capped to standard when wall greater cover is disallowed', () => {
    allowGreater = false;
    const { low, high } = setup({ lowX: 0, highX: 300, highElevation: 20, edgeX: 50 });
    expect(coverDetector.detectBetweenTokens(high, low)).toBe('standard');
  });

  test('ledge with no elevation has no effect', () => {
    const { low, high } = setup({ highElevation: 20, edgeX: 50, ledgeElevation: null });
    expect(coverDetector.detectBetweenTokens(high, low)).toBe('none');
  });

  test('ledge between creatures at the same elevation grants no cover', () => {
    const { low, high } = setup({ highElevation: 0 });
    expect(coverDetector.detectBetweenTokens(low, high)).toBe('none');
  });

  test('unflagged no-sight wall grants no ledge cover', () => {
    const { low, high } = setup();
    canvas.walls.placeables = [makeLedgeWall({ c: [275, -100, 275, 150], ledge: false })];
    expect(coverDetector.detectBetweenTokens(low, high)).toBe('none');
  });

  test('ledge elevation flag sets the ledge height', () => {
    const { low, high } = setup();
    canvas.walls.placeables = [makeLedgeWall({ c: [275, -100, 275, 150], ledgeElevation: 13 })];
    expect(coverDetector.detectBetweenTokens(low, high)).toBe('greater');
  });

  test('terraced ledges use the most restrictive edge', () => {
    const low = makeToken('low', -25, 0);
    const high = makeToken('high', 550, 15);
    canvas.tokens.placeables = [low, high];
    canvas.walls.placeables = [
      makeLedgeWall({ id: 'wall-1', c: [225, -100, 225, 150], ledgeElevation: 10 }),
      makeLedgeWall({ id: 'step', c: [475, -100, 475, 150], ledgeElevation: 15 }),
    ];
    expect(coverDetector.detectBetweenTokens(low, high)).toBe('standard');
    canvas.walls.placeables = [canvas.walls.placeables[1]];
    expect(coverDetector.detectBetweenTokens(low, high)).toBe('none');
  });

  test('ledge outside the attack line grants no cover', () => {
    const { low, high } = setup();
    canvas.walls.placeables = [makeLedgeWall({ c: [275, 100, 275, 300] })];
    expect(coverDetector.detectBetweenTokens(low, high)).toBe('none');
  });
});
