const MODULE_ID = 'pf2e-visioner';

function createFlaggedActor(data = {}) {
  const flags = data.flags || {};
  return createMockActor({
    ...data,
    flags,
    getFlag: jest.fn((scope, key) => flags[scope]?.[key] ?? null),
    setFlag: jest.fn(async (scope, key, value) => {
      flags[scope] ||= {};
      flags[scope][key] = value;
      return value;
    }),
    unsetFlag: jest.fn(async (scope, key) => {
      if (flags[scope]) delete flags[scope][key];
      return true;
    }),
  });
}

function createActorSearchSeeker(actor) {
  const flags = {};
  const seeker = {
    id: actor.id,
    name: actor.name,
    actor,
    _isActorSearchSeeker: true,
    document: {
      id: actor.id,
      actor,
      getFlag: jest.fn((scope, key) => flags[scope]?.[key] ?? actor.getFlag?.(scope, key) ?? null),
      setFlag: jest.fn(async (scope, key, value) => {
        flags[scope] ||= {};
        flags[scope][key] = value;
        return value;
      }),
      unsetFlag: jest.fn(async (scope, key) => {
        if (flags[scope]) delete flags[scope][key];
        return true;
      }),
    },
  };
  seeker.document.object = seeker;
  return seeker;
}

function createFlaggedWall(data = {}) {
  const flags = data.flags || {};
  return {
    id: data.id,
    document: {
      id: data.id,
      c: data.c || [0, 0, 100, 0],
      getFlag: jest.fn((scope, key) => flags[scope]?.[key] ?? null),
      setFlag: jest.fn(async (scope, key, value) => {
        flags[scope] ||= {};
        flags[scope][key] = value;
        return value;
      }),
      unsetFlag: jest.fn(async (scope, key) => {
        if (flags[scope]) delete flags[scope][key];
        return true;
      }),
    },
  };
}

describe('Search exploration preview flow', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('Open Results delegates Search exploration rolls to grouped target dialog even without extracted target id', async () => {
    const openSearchExplorationGroupResults = jest.fn().mockResolvedValue(2);

    jest.doMock('../../../scripts/chat/services/search-exploration-service.js', () => ({
      openSearchExplorationGroupResults,
    }));
    jest.doMock('../../../scripts/chat/dialogs/SeekPreviewDialog.js', () => ({
      SeekPreviewDialog: { currentSeekDialog: null },
    }));
    jest.doMock('../../../scripts/chat/services/infra/notifications.js', () => ({
      log: { warn: jest.fn(), error: jest.fn() },
    }));

    const { previewActionResults } = await import(
      '../../../scripts/chat/services/preview/preview-service.js'
    );

    await previewActionResults({
      actionType: 'seek',
      messageId: 'message-1',
      actor: { id: 'pc-1', actor: { id: 'actor-1' } },
      searchExploration: true,
      searchExplorationGroupId: 'group-1',
    });

    expect(openSearchExplorationGroupResults).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: 'seek',
        messageId: 'message-1',
        searchExploration: true,
        searchExplorationGroupId: 'group-1',
      }),
    );
  });

  test('group results open SearchExplorationPreviewDialog with all searchers against target token', async () => {
    jest.resetModules();
    jest.dontMock('../../../scripts/chat/services/search-exploration-service.js');
    const render = jest.fn();
    const SearchExplorationPreviewDialog = jest.fn(() => ({ render }));
    const SeekPreviewDialog = jest.fn(() => ({ render: jest.fn() }));
    const analyzeOutcome = jest.fn(async (actionData, target) => ({
      target,
      rollTotal: actionData.roll.total,
      dc: 20,
      outcome: actionData.roll.total >= 20 ? 'success' : 'failure',
      oldVisibility: 'hidden',
      newVisibility: actionData.roll.total >= 20 ? 'observed' : 'hidden',
      changed: actionData.roll.total >= 20,
    }));

    jest.doMock('../../../scripts/chat/dialogs/SearchExplorationPreviewDialog.js', () => ({
      SearchExplorationPreviewDialog,
    }));
    jest.doMock('../../../scripts/chat/dialogs/SeekPreviewDialog.js', () => ({
      SeekPreviewDialog,
    }));
    jest.doMock('../../../scripts/chat/services/actions/SeekAction.js', () => ({
      SeekActionHandler: jest.fn(() => ({ analyzeOutcome })),
    }));

    const target = createMockToken({
      id: 'hidden-loot',
      name: 'Hidden Chest',
      actor: createMockActor({ id: 'loot-actor', type: 'loot' }),
    });
    const pc1 = createMockToken({
      id: 'pc-1',
      name: 'Searcher One',
      actor: createMockActor({ id: 'pc-actor-1', type: 'character' }),
    });
    const pc2 = createMockToken({
      id: 'pc-2',
      name: 'Searcher Two',
      actor: createMockActor({ id: 'pc-actor-2', type: 'character' }),
    });
    canvas.tokens.placeables = [target, pc1, pc2];
    canvas.tokens.get = jest.fn((id) => canvas.tokens.placeables.find((token) => token.id === id));

    const messages = [
      {
        id: 'msg-1',
        speaker: { token: 'pc-1' },
        rolls: [{ total: 21, dice: [{ total: 14 }] }],
        flags: {
          'pf2e-visioner': {
            searchExploration: {
              tokenId: 'pc-1',
              targetTokenId: 'hidden-loot',
              groupId: 'group-1',
            },
          },
        },
      },
      {
        id: 'msg-2',
        speaker: { token: 'pc-2' },
        rolls: [{ total: 12, dice: [{ total: 5 }] }],
        flags: {
          'pf2e-visioner': {
            searchExploration: {
              tokenId: 'pc-2',
              targetTokenId: 'hidden-loot',
              groupId: 'group-1',
            },
          },
        },
      },
    ];
    game.messages = {
      contents: messages,
      get: jest.fn((id) => messages.find((message) => message.id === id)),
    };

    const { openSearchExplorationGroupResults } = await import(
      '../../../scripts/chat/services/search-exploration-service.js'
    );

    const count = await openSearchExplorationGroupResults({
      messageId: 'msg-1',
      searchExploration: true,
      searchExplorationGroupId: 'group-1',
    });

    expect(count).toBe(2);
    expect(SearchExplorationPreviewDialog).toHaveBeenCalledTimes(1);
    expect(SeekPreviewDialog).not.toHaveBeenCalled();
    const [dialogTarget, outcomes, changes, actionData] =
      SearchExplorationPreviewDialog.mock.calls[0];
    expect(dialogTarget).toBe(target);
    expect(outcomes).toHaveLength(2);
    expect(outcomes.map((outcome) => outcome.searchExplorationObserverName)).toEqual([
      'Searcher One',
      'Searcher Two',
    ]);
    expect(changes).toHaveLength(1);
    expect(actionData).toMatchObject({
      searchExploration: true,
      searchExplorationGroup: true,
      searchExplorationTargetTokenId: 'hidden-loot',
    });
    expect(render).toHaveBeenCalledWith(true);
  });

  test('group results recover target and searchers when PF2E chat messages dropped Visioner flags', async () => {
    jest.resetModules();
    jest.dontMock('../../../scripts/chat/services/search-exploration-service.js');
    const render = jest.fn();
    const SearchExplorationPreviewDialog = jest.fn(() => ({ render }));
    const analyzeOutcome = jest.fn(async (actionData, target) => ({
      target,
      rollTotal: actionData.roll.total,
      dc: 20,
      outcome: actionData.roll.total >= 20 ? 'success' : 'failure',
      oldVisibility: 'hidden',
      newVisibility: actionData.roll.total >= 20 ? 'observed' : 'hidden',
      changed: actionData.roll.total >= 20,
    }));

    jest.doMock('../../../scripts/chat/dialogs/SearchExplorationPreviewDialog.js', () => ({
      SearchExplorationPreviewDialog,
    }));
    jest.doMock('../../../scripts/chat/dialogs/SeekPreviewDialog.js', () => ({
      SeekPreviewDialog: { currentSeekDialog: null },
    }));
    jest.doMock('../../../scripts/chat/services/actions/SeekAction.js', () => ({
      SeekActionHandler: jest.fn(() => ({ analyzeOutcome })),
    }));

    const target = createMockToken({
      id: 'hidden-loot',
      name: 'Hidden Chest',
      actor: createMockActor({
        id: 'loot-actor',
        type: 'loot',
        conditions: { conditions: [{ slug: 'hidden' }] },
      }),
    });
    const pc1 = createMockToken({
      id: 'pc-1',
      name: 'Celdar',
      actor: createMockActor({
        id: 'pc-actor-1',
        type: 'character',
        hasPlayerOwner: true,
        system: { exploration: ['search'] },
        getStatistic: jest.fn(() => ({
          roll: jest.fn(async () => ({
            roll: { total: 25, dice: [{ total: 18, results: [{ result: 18 }] }] },
          })),
        })),
      }),
    });
    const pc2 = createMockToken({
      id: 'pc-2',
      name: 'Flint',
      actor: createMockActor({
        id: 'pc-actor-2',
        type: 'character',
        hasPlayerOwner: true,
        system: { exploration: ['search'] },
        getStatistic: jest.fn(() => ({
          roll: jest.fn(async () => ({
            roll: { total: 16, dice: [{ total: 8, results: [{ result: 8 }] }] },
          })),
        })),
      }),
    });
    canvas.tokens.placeables = [target, pc1, pc2];
    canvas.tokens.get = jest.fn((id) => canvas.tokens.placeables.find((token) => token.id === id));

    const { runSearchExplorationForTarget, openSearchExplorationGroupResults } = await import(
      '../../../scripts/chat/services/search-exploration-service.js'
    );
    await runSearchExplorationForTarget(target, {
      seekers: [pc1, pc2],
      groupId: 'group-dropped-flags',
    });

    const messages = [
      {
        id: 'msg-1',
        speaker: { token: 'pc-1' },
        rolls: [{ total: 25, dice: [{ total: 18 }] }],
        flags: {
          pf2e: { context: { options: ['exploration:search'] } },
        },
      },
      {
        id: 'msg-2',
        speaker: { token: 'pc-2' },
        rolls: [{ total: 16, dice: [{ total: 8 }] }],
        flags: {
          pf2e: { context: { options: ['exploration:search'] } },
        },
      },
    ];
    game.messages = {
      contents: messages,
      get: jest.fn((id) => messages.find((message) => message.id === id)),
    };

    const count = await openSearchExplorationGroupResults({
      messageId: 'msg-1',
      searchExploration: true,
      searchExplorationTokenId: 'pc-1',
      roll: { total: 25, dice: [{ total: 18 }] },
    });

    expect(count).toBe(2);
    expect(SearchExplorationPreviewDialog).toHaveBeenCalledTimes(1);
    const [dialogTarget, outcomes, changes, actionData] =
      SearchExplorationPreviewDialog.mock.calls[0];
    expect(dialogTarget).toBe(target);
    expect(outcomes.map((outcome) => outcome.searchExplorationObserverName)).toEqual([
      'Celdar',
      'Flint',
    ]);
    expect(changes).toHaveLength(1);
    expect(actionData).toMatchObject({
      searchExploration: true,
      searchExplorationGroup: true,
      searchExplorationTargetTokenId: 'hidden-loot',
    });
    expect(render).toHaveBeenCalledWith(true);
  });

  test('group results open SearchExplorationPreviewDialog with all searchers against hidden wall target', async () => {
    jest.resetModules();
    jest.dontMock('../../../scripts/chat/services/search-exploration-service.js');
    const render = jest.fn();
    const SearchExplorationPreviewDialog = jest.fn(() => ({ render }));
    const analyzeOutcome = jest.fn(async (actionData, target) => ({
      _isWall: true,
      wall: target.wall,
      wallId: target.wall.id,
      wallIdentifier: 'Secret Door',
      target: actionData.actor,
      rollTotal: actionData.roll.total,
      dc: target.dc,
      outcome: 'success',
      oldVisibility: 'hidden',
      newVisibility: 'observed',
      changed: true,
    }));

    jest.doMock('../../../scripts/chat/dialogs/SearchExplorationPreviewDialog.js', () => ({
      SearchExplorationPreviewDialog,
    }));
    jest.doMock('../../../scripts/chat/dialogs/SeekPreviewDialog.js', () => ({
      SeekPreviewDialog: { currentSeekDialog: null },
    }));
    jest.doMock('../../../scripts/chat/services/actions/SeekAction.js', () => ({
      SeekActionHandler: jest.fn(() => ({ analyzeOutcome })),
    }));

    const wall = {
      id: 'wall-1',
      document: {
        id: 'wall-1',
        getFlag: jest.fn((scope, key) => {
          if (scope !== 'pf2e-visioner') return undefined;
          if (key === 'hiddenWall') return true;
          if (key === 'stealthDC') return 23;
          if (key === 'wallIdentifier') return 'Secret Door';
          return undefined;
        }),
      },
    };
    const pc1 = createMockToken({
      id: 'pc-1',
      name: 'Searcher One',
      actor: createMockActor({ id: 'pc-actor-1', type: 'character' }),
    });
    const pc2 = createMockToken({
      id: 'pc-2',
      name: 'Searcher Two',
      actor: createMockActor({ id: 'pc-actor-2', type: 'character' }),
    });
    canvas.tokens.placeables = [pc1, pc2];
    canvas.tokens.get = jest.fn((id) => canvas.tokens.placeables.find((token) => token.id === id));
    canvas.walls.placeables = [wall];
    canvas.walls.get = jest.fn((id) => canvas.walls.placeables.find((candidate) => candidate.id === id));

    const messages = [
      {
        id: 'msg-1',
        speaker: { token: 'pc-1' },
        rolls: [{ total: 21, dice: [{ total: 14 }] }],
        flags: {
          'pf2e-visioner': {
            searchExploration: {
              tokenId: 'pc-1',
              targetWallId: 'wall-1',
              groupId: 'group-1',
            },
          },
        },
      },
      {
        id: 'msg-2',
        speaker: { token: 'pc-2' },
        rolls: [{ total: 19, dice: [{ total: 12 }] }],
        flags: {
          'pf2e-visioner': {
            searchExploration: {
              tokenId: 'pc-2',
              targetWallId: 'wall-1',
              groupId: 'group-1',
            },
          },
        },
      },
    ];
    game.messages = {
      contents: messages,
      get: jest.fn((id) => messages.find((message) => message.id === id)),
    };

    const { openSearchExplorationGroupResults } = await import(
      '../../../scripts/chat/services/search-exploration-service.js'
    );

    const count = await openSearchExplorationGroupResults({
      messageId: 'msg-1',
      searchExploration: true,
      searchExplorationGroupId: 'group-1',
    });

    expect(count).toBe(2);
    expect(SearchExplorationPreviewDialog).toHaveBeenCalledTimes(1);
    const [dialogTarget, outcomes, changes, actionData] =
      SearchExplorationPreviewDialog.mock.calls[0];
    expect(dialogTarget).toMatchObject({
      _isWall: true,
      wall,
      dc: 23,
    });
    expect(outcomes.map((outcome) => outcome.searchExplorationObserverName)).toEqual([
      'Searcher One',
      'Searcher Two',
    ]);
    expect(outcomes.map((outcome) => outcome.searchExplorationTargetWallId)).toEqual([
      'wall-1',
      'wall-1',
    ]);
    expect(changes).toHaveLength(2);
    expect(actionData).toMatchObject({
      searchExploration: true,
      searchExplorationGroup: true,
      searchExplorationTargetTokenId: null,
      searchExplorationTargetWallId: 'wall-1',
    });
    expect(render).toHaveBeenCalledWith(true);
  });

  test('group results resolve hidden wall target from scene wall documents when wall layer is unavailable', async () => {
    jest.resetModules();
    jest.dontMock('../../../scripts/chat/services/search-exploration-service.js');
    const render = jest.fn();
    const SearchExplorationPreviewDialog = jest.fn(() => ({ render }));
    const analyzeOutcome = jest.fn(async (actionData, target) => ({
      _isWall: true,
      wall: target.wall,
      wallId: target.wall.id,
      target: actionData.actor,
      rollTotal: actionData.roll.total,
      dc: target.dc,
      outcome: 'success',
      oldVisibility: 'hidden',
      newVisibility: 'observed',
      changed: true,
    }));

    jest.doMock('../../../scripts/chat/dialogs/SearchExplorationPreviewDialog.js', () => ({
      SearchExplorationPreviewDialog,
    }));
    jest.doMock('../../../scripts/chat/dialogs/SeekPreviewDialog.js', () => ({
      SeekPreviewDialog: { currentSeekDialog: null },
    }));
    jest.doMock('../../../scripts/chat/services/actions/SeekAction.js', () => ({
      SeekActionHandler: jest.fn(() => ({ analyzeOutcome })),
    }));

    const wallDoc = {
      id: 'wall-doc-1',
      getFlag: jest.fn((scope, key) => {
        if (scope !== 'pf2e-visioner') return undefined;
        if (key === 'hiddenWall') return true;
        if (key === 'stealthDC') return 24;
        return undefined;
      }),
    };
    const pc = createMockToken({
      id: 'pc-1',
      name: 'Searcher One',
      actor: createMockActor({ id: 'pc-actor-1', type: 'character' }),
    });
    canvas.tokens.placeables = [pc];
    canvas.tokens.get = jest.fn((id) => canvas.tokens.placeables.find((token) => token.id === id));
    canvas.walls.placeables = [];
    canvas.walls.get = jest.fn(() => null);
    canvas.scene.walls = {
      get: jest.fn((id) => (id === 'wall-doc-1' ? wallDoc : null)),
    };

    const message = {
      id: 'msg-1',
      speaker: { token: 'pc-1' },
      rolls: [{ total: 22, dice: [{ total: 15 }] }],
      flags: {
        'pf2e-visioner': {
          searchExploration: {
            tokenId: 'pc-1',
            targetWallId: 'wall-doc-1',
            groupId: 'group-1',
          },
        },
      },
    };
    game.messages = {
      contents: [message],
      get: jest.fn((id) => (id === 'msg-1' ? message : null)),
    };

    const { openSearchExplorationGroupResults } = await import(
      '../../../scripts/chat/services/search-exploration-service.js'
    );

    const count = await openSearchExplorationGroupResults({
      messageId: 'msg-1',
      searchExploration: true,
      searchExplorationGroupId: 'group-1',
    });

    expect(count).toBe(1);
    expect(SearchExplorationPreviewDialog).toHaveBeenCalledTimes(1);
    const [dialogTarget] = SearchExplorationPreviewDialog.mock.calls[0];
    expect(dialogTarget).toMatchObject({
      _isWall: true,
      wall: { id: 'wall-doc-1', document: wallDoc },
      dc: 24,
    });
  });

  test('group results recover PC actor searchers when no PC tokens are on the scene', async () => {
    jest.resetModules();
    jest.dontMock('../../../scripts/chat/services/search-exploration-service.js');
    const render = jest.fn();
    const SearchExplorationPreviewDialog = jest.fn(() => ({ render }));
    const analyzeOutcome = jest.fn(async (actionData, target) => ({
      _isWall: true,
      wall: target.wall,
      wallId: target.wall.id,
      target: actionData.actor,
      rollTotal: actionData.roll.total,
      dc: target.dc,
      outcome: 'success',
      oldVisibility: 'hidden',
      newVisibility: 'observed',
      changed: true,
    }));

    jest.doMock('../../../scripts/chat/dialogs/SearchExplorationPreviewDialog.js', () => ({
      SearchExplorationPreviewDialog,
    }));
    jest.doMock('../../../scripts/chat/dialogs/SeekPreviewDialog.js', () => ({
      SeekPreviewDialog: { currentSeekDialog: null },
    }));
    jest.doMock('../../../scripts/chat/services/actions/SeekAction.js', () => ({
      SeekActionHandler: jest.fn(() => ({ analyzeOutcome })),
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
    const searchingPcActor = createMockActor({
      id: 'pc-searching-actor',
      name: 'Searching PC',
      type: 'character',
      hasPlayerOwner: true,
      system: { exploration: ['search'] },
      getStatistic: jest.fn(() => ({
        roll: jest.fn(async () => ({ total: 18, dice: [{ total: 11 }] })),
      })),
    });
    canvas.tokens.placeables = [];
    canvas.tokens.get = jest.fn(() => null);
    canvas.walls.placeables = [hiddenWall];
    canvas.walls.get = jest.fn((id) => (id === 'hidden-wall' ? hiddenWall : null));
    game.actors = {
      contents: [searchingPcActor],
      get: jest.fn((id) => (id === 'pc-searching-actor' ? searchingPcActor : null)),
    };
    game.messages = { contents: [], get: jest.fn(() => null) };

    const { runSearchExplorationForWall, openSearchExplorationGroupResults } = await import(
      '../../../scripts/chat/services/search-exploration-service.js'
    );
    await runSearchExplorationForWall(hiddenWall, { groupId: 'actor-group' });

    const count = await openSearchExplorationGroupResults({
      messageId: 'msg-actor',
      searchExploration: true,
      searchExplorationTokenId: 'pc-searching-actor',
      roll: { total: 18, dice: [{ total: 11 }] },
    });

    expect(count).toBe(1);
    expect(SearchExplorationPreviewDialog).toHaveBeenCalledTimes(1);
    const [dialogTarget, outcomes, changes, actionData] =
      SearchExplorationPreviewDialog.mock.calls[0];
    expect(dialogTarget).toMatchObject({ _isWall: true, wall: hiddenWall, dc: 22 });
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].searchExplorationObserverName).toBe('Searching PC');
    expect(changes).toHaveLength(1);
    expect(actionData).toMatchObject({
      searchExploration: true,
      searchExplorationGroup: true,
      searchExplorationTargetWallId: 'hidden-wall',
    });
    expect(render).toHaveBeenCalledWith(true);
  });

  test('SearchExplorationPreviewDialog uses target as subject and seeker rows as observers', async () => {
    jest.resetModules();
    jest.dontMock('../../../scripts/chat/dialogs/SearchExplorationPreviewDialog.js');
    jest.dontMock('../../../scripts/chat/dialogs/SeekPreviewDialog.js');
    const { SearchExplorationPreviewDialog } = await import(
      '../../../scripts/chat/dialogs/SearchExplorationPreviewDialog.js'
    );

    const target = createMockToken({
      id: 'hidden-loot',
      name: 'Hidden Chest',
      actor: createMockActor({ id: 'loot-actor', type: 'loot' }),
    });
    const seeker = createMockToken({
      id: 'pc-1',
      name: 'Searcher One',
      actor: createMockActor({ id: 'pc-actor-1', type: 'character' }),
    });
    const outcome = {
      target,
      observer: seeker,
      observerToken: seeker,
      searchExplorationObserver: seeker,
      searchExplorationObserverName: 'Searcher One',
      searchExplorationRowId: 'pc-1:hidden-loot',
      oldVisibility: 'hidden',
      newVisibility: 'observed',
      changed: true,
    };

    const dialog = new SearchExplorationPreviewDialog(target, [outcome], [outcome], {
      searchExplorationGroupedOutcomes: [outcome],
    });

    expect(dialog.actorToken).toBe(target);
    expect(dialog.searchExplorationTarget).toBe(target);
    expect(dialog.actionData.actorToken).toBe(target);
    expect(dialog.outcomes[0].observerToken).toBe(seeker);
    expect(dialog.outcomes[0].target).toBe(target);
  });

  test('applying consolidated token result updates seeker-to-target visibility, not target-to-seeker', async () => {
    jest.resetModules();
    jest.dontMock('../../../scripts/chat/services/actions/SeekAction.js');
    jest.dontMock('../../../scripts/stores/visibility-map.js');
    const { SeekActionHandler } = await import('../../../scripts/chat/services/actions/SeekAction.js');
    const { getVisibilityBetween } = await import('../../../scripts/stores/visibility-map.js');

    const target = createMockToken({
      id: 'hidden-loot',
      name: 'Hidden Chest',
      actor: createMockActor({ id: 'loot-actor', type: 'loot' }),
    });
    const seeker = createMockToken({
      id: 'pc-1',
      name: 'Searcher One',
      actor: createMockActor({ id: 'pc-actor-1', type: 'character' }),
    });
    canvas.tokens.placeables = [target, seeker];
    canvas.tokens.get = jest.fn((id) => canvas.tokens.placeables.find((token) => token.id === id));

    const outcome = {
      target,
      observer: seeker,
      observerToken: seeker,
      searchExplorationObserver: seeker,
      searchExplorationRowId: 'pc-1:hidden-loot',
      oldVisibility: 'undetected',
      currentVisibility: 'undetected',
      newVisibility: 'hidden',
      changed: true,
      hasActionableChange: true,
    };

    const handler = new SeekActionHandler();
    const applied = await handler.apply(
      {
        actionType: 'seek',
        actor: target,
        actorToken: target,
        searchExploration: true,
        searchExplorationGroup: true,
        searchExplorationGroupedOutcomes: [outcome],
      },
      { html: () => {}, attr: () => {} },
    );

    expect(applied).toBe(1);
    expect(getVisibilityBetween(seeker, target)).toBe('hidden');
    expect(getVisibilityBetween(target, seeker)).toBe('observed');
  });

  test('applying actor-based token result persists for that PC actor and future token', async () => {
    jest.resetModules();
    jest.dontMock('../../../scripts/chat/services/actions/SeekAction.js');
    jest.dontMock('../../../scripts/services/initial-scene-hidden-setup.js');
    jest.dontMock('../../../scripts/stores/visibility-map.js');
    const { SeekActionHandler } = await import('../../../scripts/chat/services/actions/SeekAction.js');
    const { applyDefaultPlayerVisibilityForToken } = await import(
      '../../../scripts/services/initial-scene-hidden-setup.js'
    );
    const { getVisibilityBetween } = await import('../../../scripts/stores/visibility-map.js');

    const target = createMockToken({
      id: 'hidden-loot',
      name: 'Hidden Chest',
      actor: createMockActor({ id: 'loot-actor', type: 'loot' }),
      flags: { [MODULE_ID]: { defaultPlayerVisibility: 'hidden' } },
    });
    const pcActor = createFlaggedActor({
      id: 'pc-actor-1',
      name: 'Searcher One',
      type: 'character',
      hasPlayerOwner: true,
    });
    const seeker = createActorSearchSeeker(pcActor);
    canvas.tokens.placeables = [target];
    canvas.tokens.get = jest.fn((id) => canvas.tokens.placeables.find((token) => token.id === id));

    const outcome = {
      target,
      observer: seeker,
      observerToken: seeker,
      searchExplorationObserver: seeker,
      searchExplorationRowId: 'pc-actor-1:hidden-loot',
      oldVisibility: 'hidden',
      currentVisibility: 'hidden',
      newVisibility: 'observed',
      changed: true,
      hasActionableChange: true,
    };

    const handler = new SeekActionHandler();
    const applied = await handler.apply(
      {
        actionType: 'seek',
        actor: target,
        actorToken: target,
        searchExploration: true,
        searchExplorationGroup: true,
        searchExplorationGroupedOutcomes: [outcome],
      },
      { html: () => {}, attr: () => {} },
    );

    expect(applied).toBe(1);
    expect(pcActor.getFlag(MODULE_ID, 'preparedSceneVisibility')).toMatchObject({
      'test-scene': { tokens: { 'hidden-loot': 'observed' } },
    });

    const futureToken = createMockToken({
      id: 'future-pc-token',
      name: 'Searcher One Token',
      actor: pcActor,
    });
    canvas.tokens.placeables = [target, futureToken];
    canvas.tokens.get = jest.fn((id) => canvas.tokens.placeables.find((token) => token.id === id));

    await applyDefaultPlayerVisibilityForToken(futureToken, {
      tokens: [target, futureToken],
      walls: [],
    });

    expect(getVisibilityBetween(futureToken, target)).toBe('observed');
  });

  test('applying actor-based wall result persists for that PC actor and future token', async () => {
    jest.resetModules();
    jest.dontMock('../../../scripts/chat/services/actions/SeekAction.js');
    jest.dontMock('../../../scripts/services/initial-scene-hidden-setup.js');
    const { SeekActionHandler } = await import('../../../scripts/chat/services/actions/SeekAction.js');
    const { applyDefaultPlayerVisibilityForToken } = await import(
      '../../../scripts/services/initial-scene-hidden-setup.js'
    );

    const wall = createFlaggedWall({
      id: 'hidden-wall',
      flags: {
        [MODULE_ID]: {
          defaultPlayerWallVisibility: 'hidden',
          hiddenWall: true,
          stealthDC: 22,
        },
      },
    });
    const pcActor = createFlaggedActor({
      id: 'pc-actor-1',
      name: 'Searcher One',
      type: 'character',
      hasPlayerOwner: true,
    });
    const seeker = createActorSearchSeeker(pcActor);
    canvas.tokens.placeables = [];
    canvas.walls.placeables = [wall];
    canvas.walls.get = jest.fn((id) => (id === 'hidden-wall' ? wall : null));

    const outcome = {
      _isWall: true,
      wall,
      wallId: 'hidden-wall',
      target: seeker,
      observer: seeker,
      observerToken: seeker,
      searchExplorationObserver: seeker,
      searchExplorationRowId: 'pc-actor-1:hidden-wall',
      oldVisibility: 'hidden',
      currentVisibility: 'hidden',
      newVisibility: 'observed',
      changed: true,
      hasActionableChange: true,
    };

    const handler = new SeekActionHandler();
    const applied = await handler.apply(
      {
        actionType: 'seek',
        actor: wall,
        actorToken: wall,
        searchExploration: true,
        searchExplorationGroup: true,
        searchExplorationGroupedOutcomes: [outcome],
      },
      { html: () => {}, attr: () => {} },
    );

    expect(applied).toBe(1);
    expect(pcActor.getFlag(MODULE_ID, 'preparedSceneVisibility')).toMatchObject({
      'test-scene': { walls: { 'hidden-wall': 'observed' } },
    });

    const futureToken = createMockToken({
      id: 'future-pc-token',
      name: 'Searcher One Token',
      actor: pcActor,
    });
    canvas.tokens.placeables = [futureToken];

    await applyDefaultPlayerVisibilityForToken(futureToken, {
      tokens: [futureToken],
      walls: [wall],
    });

    expect(futureToken.document.getFlag(MODULE_ID, 'walls')).toMatchObject({
      'hidden-wall': 'observed',
    });
  });
});
