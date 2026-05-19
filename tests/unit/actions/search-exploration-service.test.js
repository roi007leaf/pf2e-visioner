import '../../setup.js';

describe('Search exploration Seek automation helpers', () => {
  beforeEach(() => {
    global.canvas.scene = {
      id: 'scene-1',
      grid: { size: 100, distance: 5 },
    };
    global.canvas.grid = { size: 100, distance: 5 };
    global.canvas.tokens.placeables = [];
    game.actors = { contents: [], get: jest.fn() };
    game.combat = null;
  });

  test('detects PF2E Search exploration activity from actor system data', async () => {
    const { actorHasSearchExplorationActivity } = await import(
      '../../../scripts/chat/services/search-exploration-service.js'
    );

    expect(
      actorHasSearchExplorationActivity({
        system: { exploration: ['search'] },
      }),
    ).toBe(true);

    expect(
      actorHasSearchExplorationActivity({
        system: { exploration: [{ slug: 'search' }] },
      }),
    ).toBe(true);

    expect(
      actorHasSearchExplorationActivity({
        system: { exploration: [] },
        items: [{ slug: 'expeditious-search', name: 'Expeditious Search' }],
      }),
    ).toBe(false);

    expect(
      actorHasSearchExplorationActivity({
        system: { exploration: [] },
        itemTypes: { action: [{ slug: 'search', name: 'Search' }] },
        items: [{ slug: 'search', name: 'Search' }],
      }),
    ).toBe(false);
  });

  test('detects active PF2E Search exploration effect items', async () => {
    const { actorHasSearchExplorationActivity } = await import(
      '../../../scripts/chat/services/search-exploration-service.js'
    );

    expect(
      actorHasSearchExplorationActivity({
        system: { exploration: [] },
        itemTypes: {
          effect: [{ type: 'effect', name: 'Search', system: { slug: 'effect-search' } }],
        },
      }),
    ).toBe(true);

    expect(
      actorHasSearchExplorationActivity({
        system: { exploration: [] },
        items: [{ type: 'effect', name: 'Search', system: { slug: 'effect-search' } }],
      }),
    ).toBe(true);

    expect(
      actorHasSearchExplorationActivity({
        system: { exploration: [] },
        items: [{ type: 'action', name: 'Search', slug: 'search' }],
      }),
    ).toBe(false);
  });

  test('filters Search exploration to hidden walls, hazards, hidden loot, and hidden NPCs in range', async () => {
    const { filterSearchExplorationSubjects } = await import(
      '../../../scripts/chat/services/search-exploration-service.js'
    );
    const seeker = createMockToken({
      id: 'seeker',
      center: { x: 0, y: 0 },
    });
    const hiddenWallSubject = {
      _isWall: true,
      _isHiddenWall: true,
      wall: {
        id: 'wall-1',
        document: { id: 'wall-1', c: [100, 0, 300, 0] },
      },
    };
    const hiddenLoot = createMockToken({
      id: 'loot-1',
      actor: createMockActor({
        id: 'loot-actor',
        type: 'loot',
        conditions: { conditions: [{ slug: 'hidden' }] },
      }),
      center: { x: 200, y: 0 },
    });
    const hazard = createMockToken({
      id: 'hazard-1',
      actor: createMockActor({
        id: 'hazard-actor',
        type: 'hazard',
        system: { attributes: { stealth: { dc: 20 } } },
      }),
      center: { x: 300, y: 0 },
    });
    const npc = createMockToken({
      id: 'npc-1',
      actor: createMockActor({ id: 'npc-actor', type: 'npc' }),
      center: { x: 200, y: 0 },
    });
    const hiddenNpc = createMockToken({
      id: 'npc-2',
      actor: createMockActor({
        id: 'npc-actor-2',
        type: 'npc',
        conditions: { conditions: [{ slug: 'hidden' }] },
      }),
      center: { x: 200, y: 0 },
    });
    const visibleLoot = createMockToken({
      id: 'loot-2',
      actor: createMockActor({ id: 'loot-actor-2', type: 'loot' }),
      center: { x: 200, y: 0 },
    });
    const farHiddenLoot = createMockToken({
      id: 'loot-3',
      actor: createMockActor({
        id: 'loot-actor-3',
        type: 'loot',
        conditions: { conditions: [{ slug: 'hidden' }] },
      }),
      center: { x: 800, y: 0 },
    });

    const filtered = filterSearchExplorationSubjects(
      [hiddenWallSubject, hiddenLoot, hazard, npc, hiddenNpc, visibleLoot, farHiddenLoot],
      seeker,
      30,
    );

    expect(filtered).toEqual([hiddenWallSubject, hiddenLoot, hazard, hiddenNpc]);
  });

  test('rolls Search exploration as blind GM roll', async () => {
    let rollOptions = null;
    const roll = { total: 17, dice: [{ total: 10, results: [{ result: 10 }] }] };
    const token = createMockToken({
      actor: createMockActor({
        getStatistic: jest.fn(() => ({
          roll: jest.fn(async (options) => {
            rollOptions = options;
            return roll;
          }),
        })),
      }),
    });

    const { rollSearchPerception } = await import(
      '../../../scripts/chat/services/search-exploration-service.js'
    );
    await rollSearchPerception(token);

    expect(rollOptions).toMatchObject({
      secret: true,
      rollMode: 'blindgm',
    });
    expect(rollOptions.messageMode).toBe('blind');
    expect(rollOptions.extraRollOptions).toEqual(
      expect.arrayContaining([
        'action:seek',
        'concentrate',
        'secret',
        'item:trait:concentrate',
        'item:trait:secret',
        'exploration:search',
      ]),
    );
    expect(rollOptions.traits).toEqual(['concentrate', 'secret']);
  });

  test('uses one PF2E statistic roll and does not fall through to extra rolls', async () => {
    const previousRoll = global.Roll;
    const fallbackToMessage = jest.fn();
    global.Roll = jest.fn(() => ({
      total: 19,
      dice: [{ total: 12, results: [{ result: 12 }] }],
      evaluate: jest.fn(async () => {}),
      toMessage: fallbackToMessage,
    }));

    try {
      const statisticRoll = jest.fn(async () => ({
        rolls: [{ total: 14, dice: [{ total: 7, results: [{ result: 7 }] }] }],
      }));
      const statisticCheckRoll = jest.fn(async () => ({
        rolls: [{ total: 15, dice: [{ total: 8, results: [{ result: 8 }] }] }],
      }));
      const token = createMockToken({
        actor: createMockActor({
          getStatistic: jest.fn(() => ({
            roll: statisticRoll,
            check: { roll: statisticCheckRoll },
          })),
        }),
      });

      const { rollSearchPerception } = await import(
        '../../../scripts/chat/services/search-exploration-service.js'
      );
      const roll = await rollSearchPerception(token);

      expect(roll.total).toBe(14);
      expect(statisticRoll).toHaveBeenCalledTimes(1);
      expect(statisticCheckRoll).not.toHaveBeenCalled();
      expect(global.Roll).not.toHaveBeenCalled();
      expect(fallbackToMessage).not.toHaveBeenCalled();
    } finally {
      global.Roll = previousRoll;
    }
  });

  test('patches created PF2E statistic chat messages with Search exploration target flags', async () => {
    const update = jest.fn();
    const target = createMockToken({
      id: 'hidden-loot',
      actor: createMockActor({ id: 'hidden-loot-actor', type: 'loot' }),
    });
    const statisticRoll = jest.fn(async () => ({
      roll: { total: 17, dice: [{ total: 10, results: [{ result: 10 }] }] },
      message: {
        id: 'msg-1',
        flags: {},
        update,
      },
    }));
    const token = createMockToken({
      id: 'pc-searching',
      actor: createMockActor({
        id: 'pc-searching-actor',
        getStatistic: jest.fn(() => ({ roll: statisticRoll })),
      }),
    });

    const { rollSearchPerception } = await import(
      '../../../scripts/chat/services/search-exploration-service.js'
    );
    await rollSearchPerception(token, {
      targetToken: target,
      groupId: 'group-1',
    });

    expect(update).toHaveBeenCalledWith({
      'flags.pf2e-visioner.searchExploration': expect.objectContaining({
        tokenId: 'pc-searching',
        targetTokenId: 'hidden-loot',
        targetWallId: null,
        groupId: 'group-1',
      }),
    });
  });

  test('detects Search exploration HUD targets', async () => {
    const { isSearchExplorationHudTarget } = await import(
      '../../../scripts/chat/services/search-exploration-service.js'
    );
    const hiddenLoot = createMockToken({
      actor: createMockActor({
        type: 'loot',
        conditions: { conditions: [{ slug: 'hidden' }] },
      }),
    });
    const hiddenNpc = createMockToken({
      actor: createMockActor({
        type: 'npc',
        conditions: { conditions: [{ slug: 'undetected' }] },
      }),
    });
    const visibleNpc = createMockToken({
      actor: createMockActor({ type: 'npc' }),
    });

    expect(isSearchExplorationHudTarget(hiddenLoot)).toBe(true);
    expect(isSearchExplorationHudTarget(hiddenNpc)).toBe(true);
    expect(isSearchExplorationHudTarget(visibleNpc)).toBe(false);
  });

  test('exposes Search exploration targets during combat encounters for GM control', async () => {
    const { isSearchExplorationHudTarget, isSearchExplorationWallTarget } = await import(
      '../../../scripts/chat/services/search-exploration-service.js'
    );
    const hiddenLoot = createMockToken({
      actor: createMockActor({
        type: 'loot',
        conditions: { conditions: [{ slug: 'hidden' }] },
      }),
    });
    const hiddenWall = {
      document: {
        getFlag: jest.fn((scope, key) =>
          scope === 'pf2e-visioner' && key === 'hiddenWall' ? true : undefined,
        ),
      },
    };

    game.combat = { started: true, combatants: new Map([['c1', {}]]) };

    expect(isSearchExplorationHudTarget(hiddenLoot)).toBe(true);
    expect(isSearchExplorationWallTarget(hiddenWall)).toBe(true);
  });

  test('allows hidden wall Search exploration when active combat is on another scene', async () => {
    const { isSearchExplorationWallTarget } = await import(
      '../../../scripts/chat/services/search-exploration-service.js'
    );
    const hiddenWall = {
      document: {
        getFlag: jest.fn((scope, key) =>
          scope === 'pf2e-visioner' && key === 'hiddenWall' ? true : undefined,
        ),
      },
    };

    global.canvas.scene.id = 'exploration-scene';
    game.combat = {
      started: true,
      scene: { id: 'combat-scene' },
      combatants: new Map([['c1', {}]]),
    };

    expect(isSearchExplorationWallTarget(hiddenWall)).toBe(true);
  });

  test('target HUD action rolls once for each PC with Search exploration active', async () => {
    const rollOptions = [];
    const statisticRoll = jest.fn(async (options) => {
      rollOptions.push(options);
      return { total: 17, dice: [{ total: 10, results: [{ result: 10 }] }] };
    });
    const target = createMockToken({
      id: 'hidden-loot',
      actor: createMockActor({
        id: 'hidden-loot-actor',
        type: 'loot',
        conditions: { conditions: [{ slug: 'hidden' }] },
      }),
    });
    const searchingPc = createMockToken({
      id: 'pc-searching',
      actor: createMockActor({
        id: 'pc-searching-actor',
        type: 'character',
        hasPlayerOwner: true,
        system: { exploration: ['search'] },
        getStatistic: jest.fn(() => ({ roll: statisticRoll })),
      }),
    });
    const idlePc = createMockToken({
      id: 'pc-idle',
      actor: createMockActor({
        id: 'pc-idle-actor',
        type: 'character',
        hasPlayerOwner: true,
        system: { exploration: [] },
        getStatistic: jest.fn(() => ({ roll: jest.fn() })),
      }),
    });
    const npc = createMockToken({
      id: 'npc-search',
      actor: createMockActor({
        id: 'npc-search-actor',
        type: 'npc',
        system: { exploration: ['search'] },
        getStatistic: jest.fn(() => ({ roll: jest.fn() })),
      }),
    });
    global.canvas.tokens.placeables = [target, searchingPc, idlePc, npc];

    const { runSearchExplorationForTarget } = await import(
      '../../../scripts/chat/services/search-exploration-service.js'
    );
    const count = await runSearchExplorationForTarget(target);

    expect(count).toBe(1);
    expect(statisticRoll).toHaveBeenCalledTimes(1);
    expect(rollOptions[0]).toMatchObject({
      secret: true,
      rollMode: 'blindgm',
      messageMode: 'blind',
    });
    expect(
      rollOptions[0].message.flags['pf2e-visioner'].searchExploration,
    ).toMatchObject({
      tokenId: 'pc-searching',
      sceneId: 'scene-1',
      targetTokenId: 'hidden-loot',
    });
    expect(
      rollOptions[0].message.flags['pf2e-visioner'].searchExploration.groupId,
    ).toEqual(expect.any(String));
  });

  test('reuses Search activity scan per actor while resolving token seekers', async () => {
    const effectValues = jest.fn(() => [
      { type: 'effect', name: 'Search', system: { slug: 'effect-search' } },
    ]);
    const actor = createMockActor({
      id: 'pc-linked-actor',
      type: 'character',
      hasPlayerOwner: true,
      system: { exploration: [] },
      itemTypes: { effect: { values: effectValues } },
    });
    const firstToken = createMockToken({ id: 'pc-1', actor });
    const secondToken = createMockToken({ id: 'pc-2', actor });

    const { getSearchExplorationSeekers } = await import(
      '../../../scripts/chat/services/search-exploration-service.js'
    );
    const seekers = getSearchExplorationSeekers(null, [firstToken, secondToken]);

    expect(seekers).toEqual([firstToken, secondToken]);
    expect(effectValues).toHaveBeenCalledTimes(1);
  });

  test('target HUD action rolls for PC actors with Search active when no PC tokens are on the scene', async () => {
    const rollOptions = [];
    const statisticRoll = jest.fn(async (options) => {
      rollOptions.push(options);
      return { total: 17, dice: [{ total: 10, results: [{ result: 10 }] }] };
    });
    const target = createMockToken({
      id: 'hidden-loot',
      actor: createMockActor({
        id: 'hidden-loot-actor',
        type: 'loot',
        conditions: { conditions: [{ slug: 'hidden' }] },
      }),
    });
    const searchingPcActor = createMockActor({
      id: 'pc-searching-actor',
      name: 'Searching PC',
      type: 'character',
      hasPlayerOwner: true,
      system: { exploration: ['search'] },
      getStatistic: jest.fn(() => ({ roll: statisticRoll })),
    });
    const idlePcActor = createMockActor({
      id: 'pc-idle-actor',
      name: 'Idle PC',
      type: 'character',
      hasPlayerOwner: true,
      system: { exploration: [] },
      getStatistic: jest.fn(() => ({ roll: jest.fn() })),
    });
    const npcActor = createMockActor({
      id: 'npc-search-actor',
      type: 'npc',
      system: { exploration: ['search'] },
      getStatistic: jest.fn(() => ({ roll: jest.fn() })),
    });
    global.canvas.tokens.placeables = [target];
    game.actors = {
      contents: [searchingPcActor, idlePcActor, npcActor],
      get: jest.fn((id) => [searchingPcActor, idlePcActor, npcActor].find((a) => a.id === id)),
    };

    const { runSearchExplorationForTarget } = await import(
      '../../../scripts/chat/services/search-exploration-service.js'
    );
    const count = await runSearchExplorationForTarget(target);

    expect(count).toBe(1);
    expect(statisticRoll).toHaveBeenCalledTimes(1);
    expect(
      rollOptions[0].message.flags['pf2e-visioner'].searchExploration,
    ).toMatchObject({
      tokenId: 'pc-searching-actor',
      sceneId: 'scene-1',
      targetTokenId: 'hidden-loot',
    });
  });

  test('wall tool action rolls once for each PC with Search exploration active against a hidden wall', async () => {
    const rollOptions = [];
    const statisticRoll = jest.fn(async (options) => {
      rollOptions.push(options);
      return { total: 18, dice: [{ total: 11, results: [{ result: 11 }] }] };
    });
    const hiddenWall = {
      id: 'hidden-wall',
      document: {
        id: 'hidden-wall',
        getFlag: jest.fn((scope, key) => {
          if (scope !== 'pf2e-visioner') return undefined;
          if (key === 'hiddenWall') return true;
          if (key === 'stealthDC') return 22;
          return undefined;
        }),
      },
    };
    const searchingPc = createMockToken({
      id: 'pc-searching',
      actor: createMockActor({
        id: 'pc-searching-actor',
        type: 'character',
        hasPlayerOwner: true,
        system: { exploration: ['search'] },
        getStatistic: jest.fn(() => ({ roll: statisticRoll })),
      }),
    });
    const idlePc = createMockToken({
      id: 'pc-idle',
      actor: createMockActor({
        id: 'pc-idle-actor',
        type: 'character',
        hasPlayerOwner: true,
        system: { exploration: [] },
        getStatistic: jest.fn(() => ({ roll: jest.fn() })),
      }),
    });
    global.canvas.tokens.placeables = [searchingPc, idlePc];

    const { runSearchExplorationForWall } = await import(
      '../../../scripts/chat/services/search-exploration-service.js'
    );
    const count = await runSearchExplorationForWall(hiddenWall);

    expect(count).toBe(1);
    expect(statisticRoll).toHaveBeenCalledTimes(1);
    expect(
      rollOptions[0].message.flags['pf2e-visioner'].searchExploration,
    ).toMatchObject({
      tokenId: 'pc-searching',
      sceneId: 'scene-1',
      targetTokenId: null,
      targetWallId: 'hidden-wall',
    });
    expect(
      rollOptions[0].message.flags['pf2e-visioner'].searchExploration.groupId,
    ).toEqual(expect.any(String));
  });

  test('wall tool action rolls for PC actors with Search active when no PC tokens are on the scene', async () => {
    const rollOptions = [];
    const statisticRoll = jest.fn(async (options) => {
      rollOptions.push(options);
      return { total: 18, dice: [{ total: 11, results: [{ result: 11 }] }] };
    });
    const hiddenWall = {
      id: 'hidden-wall',
      document: {
        id: 'hidden-wall',
        getFlag: jest.fn((scope, key) => {
          if (scope !== 'pf2e-visioner') return undefined;
          if (key === 'hiddenWall') return true;
          if (key === 'stealthDC') return 22;
          return undefined;
        }),
      },
    };
    const searchingPcActor = createMockActor({
      id: 'pc-searching-actor',
      name: 'Searching PC',
      type: 'character',
      hasPlayerOwner: true,
      system: { exploration: ['search'] },
      getStatistic: jest.fn(() => ({ roll: statisticRoll })),
    });
    const idlePcActor = createMockActor({
      id: 'pc-idle-actor',
      name: 'Idle PC',
      type: 'character',
      hasPlayerOwner: true,
      system: { exploration: [] },
      getStatistic: jest.fn(() => ({ roll: jest.fn() })),
    });
    global.canvas.tokens.placeables = [];
    game.actors = {
      contents: [searchingPcActor, idlePcActor],
      get: jest.fn((id) => [searchingPcActor, idlePcActor].find((a) => a.id === id)),
    };

    const { runSearchExplorationForWall } = await import(
      '../../../scripts/chat/services/search-exploration-service.js'
    );
    const count = await runSearchExplorationForWall(hiddenWall);

    expect(count).toBe(1);
    expect(statisticRoll).toHaveBeenCalledTimes(1);
    expect(
      rollOptions[0].message.flags['pf2e-visioner'].searchExploration,
    ).toMatchObject({
      tokenId: 'pc-searching-actor',
      sceneId: 'scene-1',
      targetTokenId: null,
      targetWallId: 'hidden-wall',
    });
  });

  test('wall tool action rolls during combat when GM chooses Search exploration', async () => {
    const statisticRoll = jest.fn(async () => ({
      total: 18,
      dice: [{ total: 11, results: [{ result: 11 }] }],
    }));
    const hiddenWall = {
      id: 'hidden-wall',
      document: {
        id: 'hidden-wall',
        getFlag: jest.fn((scope, key) => {
          if (scope !== 'pf2e-visioner') return undefined;
          if (key === 'hiddenWall') return true;
          if (key === 'stealthDC') return 22;
          return undefined;
        }),
      },
    };
    const searchingPc = createMockToken({
      id: 'pc-searching',
      actor: createMockActor({
        id: 'pc-searching-actor',
        type: 'character',
        hasPlayerOwner: true,
        system: { exploration: ['search'] },
        getStatistic: jest.fn(() => ({ roll: statisticRoll })),
      }),
    });
    global.canvas.tokens.placeables = [searchingPc];
    game.combat = { started: true, combatants: new Map([['c1', {}]]) };

    const { runSearchExplorationForWall } = await import(
      '../../../scripts/chat/services/search-exploration-service.js'
    );
    const count = await runSearchExplorationForWall(hiddenWall);

    expect(count).toBe(1);
    expect(statisticRoll).toHaveBeenCalledTimes(1);
  });

  test('token movement no longer creates Search exploration rolls', async () => {
    const statisticRoll = jest.fn(async () => ({
      total: 17,
      dice: [{ total: 10, results: [{ result: 10 }] }],
    }));
    const token = createMockToken({
      id: 'pc-searching',
      actor: createMockActor({
        id: 'pc-searching-actor',
        type: 'character',
        hasPlayerOwner: true,
        system: { exploration: ['search'] },
        getStatistic: jest.fn(() => ({ roll: statisticRoll })),
      }),
    });
    token.document.object = token;
    global.canvas.tokens.placeables = [token];

    const { handleSearchExplorationTokenUpdate } = await import(
      '../../../scripts/chat/services/search-exploration-service.js'
    );
    const count = await handleSearchExplorationTokenUpdate(token.document, { x: 50 }, {}, 'gm');

    expect(count).toBe(0);
    expect(statisticRoll).not.toHaveBeenCalled();
  });
});
