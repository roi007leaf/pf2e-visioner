import '../../setup.js';

describe('seek wall subjects', () => {
  afterEach(() => {
    jest.dontMock('../../../scripts/utils.js');
    jest.resetModules();
  });

  test('builds hidden wall subjects with custom or default DC', async () => {
    const { buildHiddenWallSeekSubjects } = await import(
      '../../../scripts/chat/services/actions/Seek/seek-wall-subjects.js'
    );
    const hiddenDefault = {
      id: 'wall-default',
      document: {
        getFlag: jest.fn((_moduleId, flag) => (flag === 'hiddenWall' ? true : undefined)),
      },
    };
    const hiddenCustom = {
      id: 'wall-custom',
      document: {
        getFlag: jest.fn((_moduleId, flag) => {
          if (flag === 'hiddenWall') return true;
          if (flag === 'stealthDC') return 28;
          return undefined;
        }),
      },
    };
    const visible = {
      id: 'wall-visible',
      document: {
        getFlag: jest.fn(() => false),
      },
    };

    const subjects = buildHiddenWallSeekSubjects([hiddenDefault, hiddenCustom, visible], 15);

    expect(subjects).toEqual([
      { _isWall: true, _isHiddenWall: true, wall: hiddenDefault, dc: 15 },
      { _isWall: true, _isHiddenWall: true, wall: hiddenCustom, dc: 28 },
    ]);
  });

  test('reads current wall visibility from another token of the same actor when needed', async () => {
    const { getSeekWallCurrentVisibility } = await import(
      '../../../scripts/chat/services/actions/Seek/seek-wall-subjects.js'
    );
    const actorToken = {
      actor: { id: 'actor-1' },
      document: {
        getFlag: jest.fn(() => ({})),
      },
    };
    const siblingToken = {
      actor: { id: 'actor-1' },
      document: {
        getFlag: jest.fn(() => ({ 'wall-1': 'observed' })),
      },
    };
    canvas.tokens.placeables = [actorToken, siblingToken];

    const result = getSeekWallCurrentVisibility(
      { actorToken },
      { wall: { id: 'wall-1' } },
    );

    expect(result).toBe('observed');
  });

  test('builds wall metadata for hidden wall display rows', async () => {
    jest.doMock('../../../scripts/utils.js', () => ({
      __esModule: true,
      getWallImage: jest.fn(() => 'icons/secret-door.svg'),
    }));

    const { buildSeekWallMetadata } = await import(
      '../../../scripts/chat/services/actions/Seek/seek-wall-subjects.js'
    );
    const wall = {
      id: 'wall-1',
      document: {
        door: 2,
        getFlag: jest.fn(() => 'North Door'),
      },
    };

    await expect(buildSeekWallMetadata({ _isWall: true, wall })).resolves.toMatchObject({
      _isWall: true,
      wall,
      wallId: 'wall-1',
      wallIdentifier: 'North Door',
      wallImg: 'icons/secret-door.svg',
    });
  });

  test('calculates horizontal wall distance in scene feet', async () => {
    const { calculateDistanceToWall } = await import(
      '../../../scripts/chat/services/actions/Seek/seek-wall-subjects.js'
    );
    canvas.grid.size = 100;
    canvas.scene.grid.distance = 5;

    const distance = calculateDistanceToWall(
      { center: { x: 0, y: 0 } },
      { center: { x: 300, y: 400 }, document: {} },
    );

    expect(distance).toBe(25);
  });
});
