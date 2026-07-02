import '../../setup.js';

describe('door peek keybinding registration', () => {
  let originalKeybindings;
  let originalModules;

  beforeEach(() => {
    jest.resetModules();
    originalKeybindings = globalThis.game.keybindings;
    originalModules = globalThis.game.modules;
  });

  afterEach(() => {
    globalThis.game.keybindings = originalKeybindings;
    globalThis.game.modules = originalModules;
  });

  test('Door Peek keybind starts hovered-door peek without right-click', async () => {
    const registered = new Map();
    const peekManager = {};
    globalThis.game.keybindings = {
      register: jest.fn((_moduleId, key, config) => registered.set(key, config)),
    };
    globalThis.game.modules = {
      get: jest.fn(() => ({ api: { peekManager } })),
    };

    const doorControl = await import('../../../scripts/services/Peek/peek-door-control.js');
    const keyDown = jest.spyOn(doorControl, 'handleDoorPeekKeyDown').mockResolvedValue(true);
    const { registerKeybindings } = await import('../../../scripts/settings.js');

    registerKeybindings();
    await registered.get('holdDoorPeek').onDown();

    expect(keyDown).toHaveBeenCalledWith(peekManager);
  });
});
