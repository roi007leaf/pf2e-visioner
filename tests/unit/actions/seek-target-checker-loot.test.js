import '../../setup.js';

describe('checkForValidTargets loot actor handling', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.dontMock('../../../scripts/utils.js');
    global.canvas.tokens.placeables = [];
    global.canvas.walls.placeables = [];
    global.canvas.scene = {
      grid: { size: 100, distance: 5 },
    };
    global.canvas.grid = { size: 100, distance: 5 };
  });

  test('allows Seek when the only valid target is a hidden loot actor', async () => {
    const seeker = createMockToken({
      id: 'seeker-1',
      actor: createMockActor({
        id: 'seeker-actor',
        type: 'character',
      }),
    });
    const hiddenLoot = createMockToken({
      id: 'loot-1',
      actor: createMockActor({
        id: 'loot-actor',
        type: 'loot',
        conditions: { conditions: [{ slug: 'hidden' }] },
      }),
      center: { x: 100, y: 0 },
    });

    global.canvas.tokens.placeables = [seeker, hiddenLoot];

    const { checkForValidTargets } = await import(
      '../../../scripts/chat/services/infra/target-checker.js'
    );

    const canSeek = checkForValidTargets({
      actionType: 'seek',
      actor: seeker,
      seekTemplateCenter: { x: 100, y: 0 },
      seekTemplateRadiusFeet: 15,
    });

    expect(canSeek).toBe(true);
  });

  test('allows Seek when the only valid target is a hidden wall inside the template', async () => {
    const seeker = createMockToken({
      id: 'seeker-1',
      actor: createMockActor({
        id: 'seeker-actor',
        type: 'character',
      }),
    });
    const hiddenWall = {
      id: 'wall-1',
      document: {
        id: 'wall-1',
        c: [50, 0, 150, 0],
        getFlag: jest.fn((scope, key) =>
          scope === 'pf2e-visioner' && key === 'hiddenWall' ? true : undefined,
        ),
      },
    };

    global.canvas.tokens.placeables = [seeker];
    global.canvas.walls.placeables = [hiddenWall];

    const { checkForValidTargets } = await import(
      '../../../scripts/chat/services/infra/target-checker.js'
    );

    const canSeek = checkForValidTargets({
      actionType: 'seek',
      actor: seeker,
      seekTemplateCenter: { x: 100, y: 0 },
      seekTemplateRadiusFeet: 15,
    });

    expect(canSeek).toBe(true);
  });

  test('checks seeker perception rank once across rank-gated Seek targets', async () => {
    const getStatistic = jest.fn(() => ({ proficiency: { rank: 1 } }));
    const seeker = createMockToken({
      id: 'seeker-1',
      actor: createMockActor({
        id: 'seeker-actor',
        type: 'character',
        getStatistic,
      }),
    });
    const makeHazard = (id) =>
      createMockToken({
        id,
        actor: createMockActor({ id: `${id}-actor`, type: 'hazard' }),
        flags: {
          'pf2e-visioner': {
            minPerceptionRank: 3,
          },
        },
      });

    global.canvas.tokens.placeables = [seeker, makeHazard('hazard-1'), makeHazard('hazard-2')];

    const { checkForValidTargets } = await import(
      '../../../scripts/chat/services/infra/target-checker.js'
    );

    const canSeek = checkForValidTargets({
      actionType: 'seek',
      actor: seeker,
    });

    expect(canSeek).toBe(false);
    expect(getStatistic).toHaveBeenCalledTimes(1);
  });

  test('reads actor roll options once across visible Seek targets', async () => {
    const getRollOptions = jest.fn(() => []);
    const seeker = createMockToken({
      id: 'seeker-1',
      actor: createMockActor({
        id: 'seeker-actor',
        type: 'character',
        getRollOptions,
      }),
    });
    const makeNpc = (id) =>
      createMockToken({
        id,
        actor: createMockActor({ id: `${id}-actor`, type: 'npc' }),
      });

    global.canvas.tokens.placeables = [seeker, makeNpc('npc-1'), makeNpc('npc-2')];

    const { checkForValidTargets } = await import(
      '../../../scripts/chat/services/infra/target-checker.js'
    );

    const canSeek = checkForValidTargets({
      actionType: 'seek',
      actor: seeker,
    });

    expect(canSeek).toBe(false);
    expect(getRollOptions).toHaveBeenCalledTimes(1);
  });

  test('does not allow Seek for only concealed targets without ignore-concealment rule element', async () => {
    jest.doMock('../../../scripts/utils.js', () => ({
      getVisibilityBetween: jest.fn(() => 'concealed'),
    }));
    const seeker = createMockToken({
      id: 'seeker-1',
      actor: createMockActor({ id: 'seeker-actor', type: 'character' }),
    });
    const concealedNpc = createMockToken({
      id: 'npc-1',
      actor: createMockActor({ id: 'npc-actor', type: 'npc' }),
    });
    global.canvas.tokens.placeables = [seeker, concealedNpc];

    const { checkForValidTargets } = await import(
      '../../../scripts/chat/services/infra/target-checker.js'
    );

    const canSeek = checkForValidTargets({
      actionType: 'seek',
      actor: seeker,
    });

    expect(canSeek).toBe(false);
  });

  test('allows Seek for concealed targets when seeker ignores concealment by rule element', async () => {
    jest.doMock('../../../scripts/utils.js', () => ({
      getVisibilityBetween: jest.fn(() => 'concealed'),
    }));
    const seeker = createMockToken({
      id: 'seeker-1',
      actor: createMockActor({ id: 'seeker-actor', type: 'character' }),
      flags: {
        'pf2e-visioner': {
          actionQualifications: {
            'thousand-visions': {
              id: 'thousand-visions',
              priority: 100,
              qualifications: {
                seek: { ignoreConcealment: true },
              },
            },
          },
        },
      },
    });
    const concealedNpc = createMockToken({
      id: 'npc-1',
      actor: createMockActor({ id: 'npc-actor', type: 'npc' }),
    });
    global.canvas.tokens.placeables = [seeker, concealedNpc];

    const { checkForValidTargets } = await import(
      '../../../scripts/chat/services/infra/target-checker.js'
    );

    const canSeek = checkForValidTargets({
      actionType: 'seek',
      actor: seeker,
    });

    expect(canSeek).toBe(true);
  });
});
