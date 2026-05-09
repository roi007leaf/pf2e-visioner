import '../../setup.js';

describe('checkForValidTargets loot actor handling', () => {
  beforeEach(() => {
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
});
