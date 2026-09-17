import '../../setup.js';

describe('player peek block setting', () => {
  let originalRegisterMenu;
  let originalModules;
  let originalControls;

  beforeEach(() => {
    jest.resetModules();
    originalRegisterMenu = globalThis.game.settings.registerMenu;
    originalModules = globalThis.game.modules;
    originalControls = globalThis.ui.controls;
    globalThis.game.settings.registerMenu = jest.fn();
    globalThis.ui.controls = {
      controls: {
        tokens: {
          tools: [
            {
              name: 'pf2e-visioner-block-player-peek',
              title: 'PF2E_VISIONER.PEEK.BLOCK_MODE_BOTH',
              icon: 'fa-solid fa-lock',
              active: true,
            },
          ],
        },
      },
      render: jest.fn(),
    };
  });

  afterEach(() => {
    globalThis.game.settings.registerMenu = originalRegisterMenu;
    globalThis.game.modules = originalModules;
    globalThis.ui.controls = originalControls;
    jest.restoreAllMocks();
  });

  test('mode changes clear only newly blocked peeks and refresh scene-control indicator', async () => {
    const endBlockedPeeks = jest.fn();
    globalThis.game.modules = {
      get: jest.fn(() => ({ api: { peekManager: { endBlockedPeeks } } })),
    };
    const { registerSettings } = await import('../../../scripts/settings.js');

    registerSettings();

    const config = globalThis.game.settings.register.mock.calls.find(
      ([namespace, key]) => namespace === 'pf2e-visioner' && key === 'playerPeekBlockMode',
    )?.[2];
    expect(config).toMatchObject({ scope: 'world', config: false, restricted: true });

    config.onChange('corner');

    expect(endBlockedPeeks).toHaveBeenCalledWith('corner');
    expect(globalThis.ui.controls.controls.tokens.tools[0]).toMatchObject({
      title: 'PF2E_VISIONER.PEEK.BLOCK_MODE_CORNER',
      icon: 'fa-solid fa-turn-down',
      active: true,
    });
    expect(globalThis.ui.controls.render).toHaveBeenCalledWith(true);
  });
});
