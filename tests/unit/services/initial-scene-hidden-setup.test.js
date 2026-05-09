import { MODULE_ID } from '../../../scripts/constants.js';
import {
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
  };
  return { id, document };
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
});
