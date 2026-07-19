import '../../setup.js';

describe('CoverDetector tile cover', () => {
  let coverDetector;
  let originalSettingsGet;

  function makeTile({
    id,
    x,
    y,
    width,
    height,
    elevation = 0,
    rotation = 0,
    coverOverride = null,
  }) {
    return {
      id,
      document: {
        id,
        x,
        y,
        width,
        height,
        elevation,
        rotation,
        getFlag: jest.fn((moduleId, key) =>
          moduleId === 'pf2e-visioner' && key === 'coverOverride' ? coverOverride : undefined,
        ),
      },
    };
  }

  function makePair() {
    const attacker = createMockToken({
      id: 'attacker',
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      elevation: 0,
      center: { x: 25, y: 25 },
    });
    const target = createMockToken({
      id: 'target',
      x: 200,
      y: 0,
      width: 1,
      height: 1,
      elevation: 0,
      center: { x: 225, y: 25 },
    });
    canvas.tokens.placeables = [attacker, target];
    return { attacker, target };
  }

  beforeEach(async () => {
    jest.resetModules();
    coverDetector = (await import('../../../scripts/cover/auto-cover/CoverDetector.js')).default;
    canvas.walls.placeables = [];
    canvas.tokens.placeables = [];
    canvas.tokens.controlled = [];
    canvas.tiles = { placeables: [] };
    originalSettingsGet = game.settings.get;
    game.settings.get = jest.fn((_moduleId, key) => {
      if (key === 'wallCoverAllowGreater') return true;
      if (key === 'autoCoverTokenIntersectionMode') return 'tactical';
      return false;
    });
  });

  afterEach(() => {
    game.settings.get = originalSettingsGet;
    delete canvas.tiles;
    jest.restoreAllMocks();
  });

  test.each(['lesser', 'standard', 'greater'])(
    'returns explicit %s cover when attack segment crosses configured tile',
    (coverOverride) => {
      const { attacker, target } = makePair();
      canvas.tiles.placeables = [
        makeTile({ id: 'cover-tile', x: 90, y: 0, width: 60, height: 50, coverOverride }),
      ];

      expect(coverDetector.detectBetweenTokens(attacker, target)).toBe(coverOverride);
    },
  );

  test.each([null, 'auto', 'none'])(
    'ignores tile cover value %s',
    (coverOverride) => {
      const { attacker, target } = makePair();
      canvas.tiles.placeables = [
        makeTile({ id: 'ignored-tile', x: 90, y: 0, width: 60, height: 50, coverOverride }),
      ];

      expect(coverDetector.detectBetweenTokens(attacker, target)).toBe('none');
    },
  );

  test('ignores configured tile outside attack segment', () => {
    const { attacker, target } = makePair();
    canvas.tiles.placeables = [
      makeTile({
        id: 'off-ray-tile',
        x: 90,
        y: 150,
        width: 60,
        height: 50,
        coverOverride: 'greater',
      }),
    ];

    expect(coverDetector.detectBetweenTokens(attacker, target)).toBe('none');
  });

  test('uses the rendered bounds of a rotated tile', () => {
    const { attacker, target } = makePair();
    canvas.tiles.placeables = [
      makeTile({
        id: 'rotated-tile',
        x: 100,
        y: 60,
        width: 100,
        height: 20,
        rotation: 90,
        coverOverride: 'standard',
      }),
    ];

    expect(coverDetector.detectBetweenTokens(attacker, target)).toBe('standard');
  });

  test('uses highest cover from intersected configured tiles', () => {
    const { attacker, target } = makePair();
    canvas.tiles.placeables = [
      makeTile({ id: 'lesser-tile', x: 60, y: 0, width: 40, height: 50, coverOverride: 'lesser' }),
      makeTile({ id: 'greater-tile', x: 130, y: 0, width: 40, height: 50, coverOverride: 'greater' }),
    ];

    expect(coverDetector.detectBetweenTokens(attacker, target)).toBe('greater');
  });

  test('combines tile cover with intersected wall override using highest state', () => {
    const { attacker, target } = makePair();
    canvas.tiles.placeables = [
      makeTile({ id: 'lesser-tile', x: 90, y: 0, width: 60, height: 50, coverOverride: 'lesser' }),
    ];
    canvas.walls.placeables = [
      {
        document: {
          id: 'standard-wall',
          c: [125, -50, 125, 75],
          door: 0,
          ds: 0,
          dir: 0,
          sight: 20,
          getFlag: jest.fn((moduleId, key) =>
            moduleId === 'pf2e-visioner' && key === 'coverOverride' ? 'standard' : undefined,
          ),
        },
      },
    ];

    expect(coverDetector.detectBetweenTokens(attacker, target)).toBe('standard');
  });

  test('clamps explicit greater tile cover when greater wall cover is disabled', () => {
    const { attacker, target } = makePair();
    canvas.tiles.placeables = [
      makeTile({ id: 'greater-tile', x: 90, y: 0, width: 60, height: 50, coverOverride: 'greater' }),
    ];
    game.settings.get = jest.fn((_moduleId, key) => {
      if (key === 'wallCoverAllowGreater') return false;
      if (key === 'autoCoverTokenIntersectionMode') return 'tactical';
      return false;
    });

    expect(coverDetector.detectBetweenTokens(attacker, target)).toBe('standard');
  });

  test('ignores configured tile outside attacker-target elevation span', () => {
    const { attacker, target } = makePair();
    canvas.tiles.placeables = [
      makeTile({
        id: 'high-tile',
        x: 90,
        y: 0,
        width: 60,
        height: 50,
        elevation: 100,
        coverOverride: 'greater',
      }),
    ];

    expect(coverDetector.detectBetweenTokens(attacker, target)).toBe('none');
  });
});
