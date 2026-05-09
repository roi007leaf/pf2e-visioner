import { MODULE_ID } from '../../../scripts/constants.js';
import { registerUIHooks } from '../../../scripts/hooks/ui.js';

function getSceneControlsHook() {
  registerUIHooks();
  return Hooks.on.mock.calls.find(([hookName]) => hookName === 'getSceneControlButtons')?.[1];
}

describe('initial scene hidden setup token tool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    game.user.isGM = true;
    game.settings.set(MODULE_ID, 'showVisionerSceneTools', true);
    game.settings.set(MODULE_ID, 'showQuickEditTool', false);
  });

  test('adds a GM token tool for initial hidden scene setup', () => {
    const hook = getSceneControlsHook();
    const controls = [{ name: 'tokens', tools: [] }];

    hook(controls);

    const tool = controls[0].tools.find(
      (candidate) => candidate.name === 'pf2e-visioner-initialize-hidden-scene',
    );
    expect(tool).toMatchObject({
      name: 'pf2e-visioner-initialize-hidden-scene',
      title: 'Initialize Hidden Scene Visibility',
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
