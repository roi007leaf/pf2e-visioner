import { MODULE_ID } from '../../../scripts/constants.js';
import { registerUIHooks } from '../../../scripts/hooks/ui.js';
import { VisionerConfirmDialog } from '../../../scripts/ui/dialogs/ConfirmDialog.js';

function getSceneControlsHook() {
  registerUIHooks();
  return Hooks.on.mock.calls.find(([hookName]) => hookName === 'getSceneControlButtons')?.[1];
}

function makeToken(id, actorType) {
  const flags = {};
  const document = {
    id,
    hidden: false,
    getFlag: jest.fn((moduleId, key) => flags[moduleId]?.[key]),
    setFlag: jest.fn(async (moduleId, key, value) => {
      flags[moduleId] = flags[moduleId] || {};
      flags[moduleId][key] = value;
      return value;
    }),
    unsetFlag: jest.fn(async (moduleId, key) => {
      delete flags[moduleId]?.[key];
      return true;
    }),
    update: jest.fn(async (changes) => Object.assign(document, changes)),
  };

  return {
    id,
    document,
    actor: {
      type: actorType,
      hasPlayerOwner: false,
    },
  };
}

function makeWall(id, options = {}) {
  const flags = {
    [MODULE_ID]: {
      hiddenWall: !!options.hiddenWall,
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
      delete flags[moduleId]?.[key];
      return true;
    }),
  };

  return { id, document };
}

describe('initial scene hidden setup token tool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    game.user.isGM = true;
    game.settings.set(MODULE_ID, 'showVisionerSceneTools', true);
    game.settings.set(MODULE_ID, 'showQuickEditTool', false);
    canvas.tokens.placeables = [];
    canvas.walls.placeables = [];
  });

  test('adds a single GM token tool for hidden scene visibility actions', () => {
    const hook = getSceneControlsHook();
    const controls = [{ name: 'tokens', tools: [] }];

    hook(controls);

    const toolNames = controls[0].tools.map((tool) => tool.name);
    expect(toolNames).toContain('pf2e-visioner-hidden-scene-visibility');
    expect(toolNames).not.toContain('pf2e-visioner-initialize-hidden-scene');
    expect(toolNames).not.toContain('pf2e-visioner-clear-hidden-scene');

    const tool = controls[0].tools.find(
      (candidate) => candidate.name === 'pf2e-visioner-hidden-scene-visibility',
    );
    expect(tool).toMatchObject({
      name: 'pf2e-visioner-hidden-scene-visibility',
      title: 'Hidden Scene Visibility',
      icon: 'fa-solid fa-eye-slash',
      button: true,
    });
    expect(typeof tool.onChange).toBe('function');
  });

  test('adds a GM token tool for the hazard/loot manager', () => {
    const hook = getSceneControlsHook();
    const controls = [{ name: 'tokens', tools: [] }];

    hook(controls);

    const tool = controls[0].tools.find(
      (candidate) => candidate.name === 'pf2e-visioner-hazard-loot-manager',
    );
    expect(tool).toMatchObject({
      name: 'pf2e-visioner-hazard-loot-manager',
      title: 'Hazard/Loot Manager',
      icon: 'fa-solid fa-box-open',
      button: true,
    });
    expect(typeof tool.onChange).toBe('function');
  });

  test('reports saved prep defaults instead of warning when setting hidden without PCs', async () => {
    const hook = getSceneControlsHook();
    const controls = [{ name: 'tokens', tools: [] }];
    const loot = makeToken('loot', 'loot');
    const hazard = makeToken('hazard', 'hazard');
    canvas.tokens.placeables = [loot, hazard];
    jest.spyOn(VisionerConfirmDialog, 'confirm').mockResolvedValue('set-hidden');

    hook(controls);
    const tool = controls[0].tools.find(
      (candidate) => candidate.name === 'pf2e-visioner-hidden-scene-visibility',
    );

    await tool.onChange();

    expect(ui.notifications.warn).not.toHaveBeenCalledWith(
      'PF2E Visioner: No player character tokens found.',
    );
    expect(ui.notifications.info).toHaveBeenCalledWith(
      'PF2E Visioner: Prepared 2 loot/hazard token(s) as Hidden for future PC token(s).',
    );
    expect(loot.document.getFlag(MODULE_ID, 'defaultPlayerVisibility')).toBe('hidden');
    expect(hazard.document.getFlag(MODULE_ID, 'defaultPlayerVisibility')).toBe('hidden');
  });

  test('reports saved hidden wall prep defaults instead of warning when setting hidden without PCs', async () => {
    const hook = getSceneControlsHook();
    const controls = [{ name: 'tokens', tools: [] }];
    const hiddenWall = makeWall('wall-hidden', { hiddenWall: true });
    canvas.walls.placeables = [hiddenWall];
    jest.spyOn(VisionerConfirmDialog, 'confirm').mockResolvedValue('set-hidden');

    hook(controls);
    const tool = controls[0].tools.find(
      (candidate) => candidate.name === 'pf2e-visioner-hidden-scene-visibility',
    );

    await tool.onChange();

    expect(ui.notifications.warn).not.toHaveBeenCalledWith(
      'PF2E Visioner: No player character tokens found.',
    );
    expect(ui.notifications.info).toHaveBeenCalledWith(
      'PF2E Visioner: Prepared 1 hidden wall(s) as Hidden for future PC token(s).',
    );
    expect(hiddenWall.document.getFlag(MODULE_ID, 'defaultPlayerWallVisibility')).toBe('hidden');
  });

  test('adds a GM wall tool for Search exploration against selected hidden walls', () => {
    const hook = getSceneControlsHook();
    const controls = [{ name: 'walls', tools: [] }];

    hook(controls);

    const tool = controls[0].tools.find(
      (candidate) => candidate.name === 'pf2e-visioner-search-exploration-wall',
    );
    expect(tool).toMatchObject({
      name: 'pf2e-visioner-search-exploration-wall',
      title: 'Roll Search Exploration (Selected Hidden Wall)',
      icon: 'fa-solid fa-search',
      button: true,
    });
    expect(typeof tool.onChange).toBe('function');
  });
});
