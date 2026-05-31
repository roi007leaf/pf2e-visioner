import { MODULE_ID } from '../../../scripts/constants.js';
import {
  clearSceneHiddenForPCs,
  DEFAULT_PLAYER_WALL_VISIBILITY_FLAG,
  getInitialHiddenSceneTargets,
  initializeSceneHiddenForPCs,
} from '../../../scripts/services/initial-scene-hidden-setup.js';
import { getVisibilityBetween } from '../../../scripts/stores/visibility-map.js';

function makeToken(id, actorType, options = {}) {
  const flags = { ...(options.flags || {}) };
  const document = {
    id,
    name: options.name || id,
    hidden: !!options.hidden,
    x: 0,
    y: 0,
    getFlag: jest.fn((moduleId, key) => flags[moduleId]?.[key]),
    setFlag: jest.fn(async (moduleId, key, value) => {
      flags[moduleId] = flags[moduleId] || {};
      flags[moduleId][key] = value;
      return value;
    }),
    unsetFlag: jest.fn(async (moduleId, key) => {
      if (flags[moduleId]) {
        delete flags[moduleId][key];
        if (Object.keys(flags[moduleId]).length === 0) delete flags[moduleId];
      }
      return true;
    }),
    update: jest.fn(async (changes) => {
      Object.assign(document, changes);
      return document;
    }),
  };

  return {
    id,
    name: options.name || id,
    document,
    actor: {
      id: options.actorId || `${id}-actor`,
      type: actorType,
      hasPlayerOwner: !!options.hasPlayerOwner,
    },
  };
}

function makeWall(id, options = {}) {
  const flags = {
    [MODULE_ID]: {
      hiddenWall: !!options.hiddenWall,
      wallIdentifier: options.identifier,
      connectedWalls: options.connectedWalls || [],
    },
  };
  const document = {
    id,
    getFlag: jest.fn((moduleId, key) => flags[moduleId]?.[key]),
    setFlag: jest.fn(async (moduleId, key, value) => {
      flags[moduleId] = flags[moduleId] || {};
      flags[moduleId][key] = value;
      return value;
    }),
    unsetFlag: jest.fn(async (moduleId, key) => {
      if (flags[moduleId]) {
        delete flags[moduleId][key];
        if (Object.keys(flags[moduleId]).length === 0) delete flags[moduleId];
      }
      return true;
    }),
  };
  return { id, document };
}

function makeActor(id, options = {}) {
  const flags = { ...(options.flags || {}) };
  return {
    id,
    type: 'character',
    hasPlayerOwner: true,
    flags,
    getFlag: jest.fn((moduleId, key) => flags[moduleId]?.[key]),
    setFlag: jest.fn(async (moduleId, key, value) => {
      flags[moduleId] = flags[moduleId] || {};
      flags[moduleId][key] = value;
      return value;
    }),
    unsetFlag: jest.fn(async (moduleId, key) => {
      if (flags[moduleId]) {
        delete flags[moduleId][key];
        if (Object.keys(flags[moduleId]).length === 0) delete flags[moduleId];
      }
      return true;
    }),
  };
}

function hiddenVisibilityV2Map(ids) {
  return Object.fromEntries(ids.map((id) => [id, { detectionState: 'hidden' }]));
}

describe('initial scene hidden setup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    game.user.isGM = true;
    canvas.tokens.placeables = [];
    canvas.walls.placeables = [];
    canvas.walls.get = jest.fn((id) => canvas.walls.placeables.find((wall) => wall.id === id));
    canvas.scene.walls = {
      get: jest.fn((id) => canvas.walls.placeables.find((wall) => wall.id === id)?.document),
    };
  });

  test('finds PCs, loot, hazards, and hidden walls for initial setup', () => {
    const pc = makeToken('pc', 'character', { hasPlayerOwner: true });
    const npc = makeToken('npc', 'npc');
    const loot = makeToken('loot', 'loot');
    const hazard = makeToken('hazard', 'hazard');
    const hiddenWall = makeWall('wall-hidden', { hiddenWall: true });
    const normalWall = makeWall('wall-normal');

    const targets = getInitialHiddenSceneTargets({
      tokens: [pc, npc, loot, hazard],
      walls: [hiddenWall, normalWall],
    });

    expect(targets.observers).toEqual([pc]);
    expect(targets.tokenTargets).toEqual([loot, hazard]);
    expect(targets.wallTargets).toEqual([hiddenWall]);
  });

  test('sets all loot tokens, hazards, and hidden walls hidden to all PCs', async () => {
    const pc1 = makeToken('pc1', 'character', { hasPlayerOwner: true });
    const pc2 = makeToken('pc2', 'character', { hasPlayerOwner: true });
    const npc = makeToken('npc', 'npc');
    const loot = makeToken('loot', 'loot');
    const hazard = makeToken('hazard', 'hazard');
    const hiddenWall = makeWall('wall-hidden', { hiddenWall: true });

    const result = await initializeSceneHiddenForPCs({
      tokens: [pc1, pc2, npc, loot, hazard],
      walls: [hiddenWall],
    });

    expect(getVisibilityBetween(pc1, loot)).toBe('hidden');
    expect(getVisibilityBetween(pc1, hazard)).toBe('hidden');
    expect(getVisibilityBetween(pc2, loot)).toBe('hidden');
    expect(getVisibilityBetween(pc2, hazard)).toBe('hidden');
    expect(getVisibilityBetween(npc, loot)).toBe('observed');
    expect(pc1.document.setFlag).toHaveBeenCalledWith(MODULE_ID, 'walls', {
      'wall-hidden': 'hidden',
    });
    expect(pc2.document.setFlag).toHaveBeenCalledWith(MODULE_ID, 'walls', {
      'wall-hidden': 'hidden',
    });
    expect(result).toMatchObject({
      observers: 2,
      tokenTargets: 2,
      wallTargets: 1,
      tokenPairs: 4,
      wallEntries: 2,
    });
  });

  test('unhides Foundry-hidden loot and hazard tokens during initial setup', async () => {
    const pc = makeToken('pc', 'character', { hasPlayerOwner: true });
    const loot = makeToken('loot', 'loot', { hidden: true });
    const hazard = makeToken('hazard', 'hazard', { hidden: true });
    const npc = makeToken('npc', 'npc', { hidden: true });

    const result = await initializeSceneHiddenForPCs({
      tokens: [pc, loot, hazard, npc],
      walls: [],
    });

    expect(loot.document.update).toHaveBeenCalledWith({ hidden: false });
    expect(hazard.document.update).toHaveBeenCalledWith({ hidden: false });
    expect(npc.document.update).not.toHaveBeenCalled();
    expect(loot.document.hidden).toBe(false);
    expect(hazard.document.hidden).toBe(false);
    expect(getVisibilityBetween(pc, loot)).toBe('hidden');
    expect(getVisibilityBetween(pc, hazard)).toBe('hidden');
    expect(result).toMatchObject({ foundryUnhidden: 2 });
  });

  test('keeps Foundry-hidden scene targets hidden until PC visibility maps are written', async () => {
    const pc = makeToken('pc', 'character', { hasPlayerOwner: true });
    const loot = makeToken('loot', 'loot', { hidden: true });
    const hiddenAtPcVisibilityWrite = [];
    const originalSetFlag = pc.document.setFlag.getMockImplementation();
    pc.document.setFlag.mockImplementation(async (...args) => {
      hiddenAtPcVisibilityWrite.push(loot.document.hidden);
      return originalSetFlag(...args);
    });

    await initializeSceneHiddenForPCs({
      tokens: [pc, loot],
      walls: [],
    });

    expect(hiddenAtPcVisibilityWrite).toContain(true);
    expect(loot.document.update).toHaveBeenCalledWith({ hidden: false });
    expect(loot.document.hidden).toBe(false);
    expect(getVisibilityBetween(pc, loot)).toBe('hidden');
  });

  test('stores default hidden visibility for prep scenes without player character tokens', async () => {
    const loot = makeToken('loot', 'loot');
    const hazard = makeToken('hazard', 'hazard');

    const result = await initializeSceneHiddenForPCs({
      tokens: [loot, hazard],
      walls: [],
    });

    expect(loot.document.getFlag(MODULE_ID, 'defaultPlayerVisibility')).toBe('hidden');
    expect(hazard.document.getFlag(MODULE_ID, 'defaultPlayerVisibility')).toBe('hidden');
    expect(result).toMatchObject({
      observers: 0,
      tokenTargets: 2,
      tokenPairs: 0,
    });
  });

  test('stores default hidden wall visibility for prep scenes without player character tokens', async () => {
    const hiddenWall = makeWall('wall-hidden', { hiddenWall: true });
    const normalWall = makeWall('wall-normal');

    const result = await initializeSceneHiddenForPCs({
      tokens: [],
      walls: [hiddenWall, normalWall],
    });

    expect(hiddenWall.document.getFlag(MODULE_ID, DEFAULT_PLAYER_WALL_VISIBILITY_FLAG)).toBe(
      'hidden',
    );
    expect(normalWall.document.getFlag(MODULE_ID, DEFAULT_PLAYER_WALL_VISIBILITY_FLAG)).toBeUndefined();
    expect(result).toMatchObject({
      observers: 0,
      tokenTargets: 0,
      wallTargets: 1,
      wallDefaults: 1,
      wallEntries: 0,
    });
  });

  test('applies default hidden visibility to future player character tokens', async () => {
    const service = await import('../../../scripts/services/initial-scene-hidden-setup.js');
    const pc = makeToken('pc', 'character', { hasPlayerOwner: true });
    pc.document.actor = pc.actor;
    const loot = makeToken('loot', 'loot', {
      flags: { [MODULE_ID]: { defaultPlayerVisibility: 'hidden' } },
    });
    const hazard = makeToken('hazard', 'hazard', {
      flags: { [MODULE_ID]: { defaultPlayerVisibility: 'hidden' } },
    });
    const visibleLoot = makeToken('visible-loot', 'loot');
    const npc = makeToken('npc', 'npc', {
      flags: { [MODULE_ID]: { defaultPlayerVisibility: 'hidden' } },
    });

    expect(typeof service.applyDefaultPlayerVisibilityForToken).toBe('function');

    const result = await service.applyDefaultPlayerVisibilityForToken(pc.document, {
      tokens: [pc, loot, hazard, visibleLoot, npc],
    });

    expect(result).toMatchObject({ applied: 2, targetDefaults: 2 });
    expect(getVisibilityBetween(pc, loot)).toBe('hidden');
    expect(getVisibilityBetween(pc, hazard)).toBe('hidden');
    expect(getVisibilityBetween(pc, visibleLoot)).toBe('observed');
    expect(getVisibilityBetween(pc, npc)).toBe('observed');
  });

  test('applies default hidden wall visibility to future player character tokens', async () => {
    const service = await import('../../../scripts/services/initial-scene-hidden-setup.js');
    const pc = makeToken('pc', 'character', { hasPlayerOwner: true });
    pc.document.actor = pc.actor;
    const hiddenWall = makeWall('wall-a', {
      hiddenWall: true,
      identifier: 'a',
      connectedWalls: ['b'],
    });
    await hiddenWall.document.setFlag(MODULE_ID, DEFAULT_PLAYER_WALL_VISIBILITY_FLAG, 'hidden');
    const connectedWall = makeWall('wall-b', {
      identifier: 'b',
      connectedWalls: [],
    });
    const visibleHiddenWall = makeWall('wall-c', { hiddenWall: true });

    const result = await service.applyDefaultPlayerVisibilityForToken(pc.document, {
      tokens: [pc],
      walls: [hiddenWall, connectedWall, visibleHiddenWall],
    });

    expect(pc.document.setFlag).toHaveBeenCalledWith(MODULE_ID, 'walls', {
      'wall-a': 'hidden',
      'wall-b': 'hidden',
    });
    expect(result).toMatchObject({ wallDefaults: 1, wallEntries: 2 });
  });

  test('preserves existing wall visibility and expands connected hidden walls', async () => {
    const pc = makeToken('pc', 'character', {
      hasPlayerOwner: true,
      flags: { [MODULE_ID]: { walls: { existing: 'observed' } } },
    });
    const hiddenWall = makeWall('wall-a', {
      hiddenWall: true,
      identifier: 'a',
      connectedWalls: ['b'],
    });
    const connectedWall = makeWall('wall-b', {
      identifier: 'b',
      connectedWalls: [],
    });

    await initializeSceneHiddenForPCs({
      tokens: [pc],
      walls: [hiddenWall, connectedWall],
    });

    expect(pc.document.setFlag).toHaveBeenCalledWith(MODULE_ID, 'walls', {
      existing: 'observed',
      'wall-a': 'hidden',
      'wall-b': 'hidden',
    });
  });

  test('clears prep defaults and sets PC token and hidden wall visibility observed', async () => {
    const pc = makeToken('pc', 'character', {
      hasPlayerOwner: true,
      flags: {
        [MODULE_ID]: {
          visibilityV2: hiddenVisibilityV2Map(['loot', 'hazard', 'npc']),
          walls: { existing: 'observed', 'wall-a': 'hidden', 'wall-b': 'hidden' },
        },
      },
    });
    const loot = makeToken('loot', 'loot', {
      flags: { [MODULE_ID]: { defaultPlayerVisibility: 'hidden' } },
    });
    const hazard = makeToken('hazard', 'hazard', {
      flags: { [MODULE_ID]: { defaultPlayerVisibility: 'hidden' } },
    });
    const npc = makeToken('npc', 'npc');
    const hiddenWall = makeWall('wall-a', {
      hiddenWall: true,
      identifier: 'a',
      connectedWalls: ['b'],
    });
    const connectedWall = makeWall('wall-b', {
      identifier: 'b',
      connectedWalls: [],
    });

    const result = await clearSceneHiddenForPCs({
      tokens: [pc, loot, hazard, npc],
      walls: [hiddenWall, connectedWall],
    });

    expect(loot.document.getFlag(MODULE_ID, 'defaultPlayerVisibility')).toBeUndefined();
    expect(hazard.document.getFlag(MODULE_ID, 'defaultPlayerVisibility')).toBeUndefined();
    expect(getVisibilityBetween(pc, loot)).toBe('observed');
    expect(getVisibilityBetween(pc, hazard)).toBe('observed');
    expect(getVisibilityBetween(pc, npc)).toBe('hidden');
    expect(pc.document.setFlag).toHaveBeenCalledWith(MODULE_ID, 'walls', {
      existing: 'observed',
      'wall-a': 'observed',
      'wall-b': 'observed',
    });
    expect(result).toMatchObject({
      observers: 1,
      tokenTargets: 2,
      wallTargets: 1,
      tokenPairs: 2,
      wallEntries: 2,
      defaultsCleared: 2,
      wallDefaultsCleared: 0,
    });
  });

  test('clears hidden wall prep defaults', async () => {
    const hiddenWall = makeWall('wall-a', { hiddenWall: true });
    await hiddenWall.document.setFlag(MODULE_ID, DEFAULT_PLAYER_WALL_VISIBILITY_FLAG, 'hidden');

    const result = await clearSceneHiddenForPCs({
      tokens: [],
      walls: [hiddenWall],
    });

    expect(hiddenWall.document.getFlag(MODULE_ID, DEFAULT_PLAYER_WALL_VISIBILITY_FLAG)).toBeUndefined();
    expect(result).toMatchObject({
      observers: 0,
      tokenTargets: 0,
      wallTargets: 1,
      defaultsCleared: 0,
      wallDefaultsCleared: 1,
    });
  });

  test('clears actor-specific scene prep results', async () => {
    const actor = makeActor('pc-actor', {
      flags: {
        [MODULE_ID]: {
          preparedSceneVisibility: {
            'test-scene': {
              tokens: { loot: 'observed' },
              walls: { wall: 'observed' },
            },
            'other-scene': {
              tokens: { other: 'hidden' },
              walls: {},
            },
          },
        },
      },
    });

    const result = await clearSceneHiddenForPCs({
      tokens: [],
      walls: [],
      actors: [actor],
    });

    expect(actor.getFlag(MODULE_ID, 'preparedSceneVisibility')).toEqual({
      'other-scene': {
        tokens: { other: 'hidden' },
        walls: {},
      },
    });
    expect(result).toMatchObject({ actorPrepCleared: 1 });
  });

  test('does nothing for non-GM users', async () => {
    game.user.isGM = false;
    const pc = makeToken('pc', 'character', { hasPlayerOwner: true });
    const loot = makeToken('loot', 'loot');

    const result = await initializeSceneHiddenForPCs({ tokens: [pc, loot], walls: [] });

    expect(getVisibilityBetween(pc, loot)).toBe('observed');
    expect(result).toMatchObject({
      observers: 0,
      tokenTargets: 0,
      wallTargets: 0,
      tokenPairs: 0,
      wallEntries: 0,
    });
  });

  test('clear scene hidden setup does nothing for non-GM users', async () => {
    game.user.isGM = false;
    const pc = makeToken('pc', 'character', {
      hasPlayerOwner: true,
      flags: { [MODULE_ID]: { visibilityV2: hiddenVisibilityV2Map(['loot']) } },
    });
    const loot = makeToken('loot', 'loot', {
      flags: { [MODULE_ID]: { defaultPlayerVisibility: 'hidden' } },
    });

    const result = await clearSceneHiddenForPCs({ tokens: [pc, loot], walls: [] });

    expect(getVisibilityBetween(pc, loot)).toBe('hidden');
    expect(loot.document.getFlag(MODULE_ID, 'defaultPlayerVisibility')).toBe('hidden');
    expect(result).toMatchObject({
      observers: 0,
      tokenTargets: 0,
      wallTargets: 0,
      tokenPairs: 0,
      wallEntries: 0,
      defaultsCleared: 0,
      wallDefaultsCleared: 0,
    });
  });
});
