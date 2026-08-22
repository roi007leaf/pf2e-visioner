import '../../setup.js';

describe('GM Observer View keybinding', () => {
  let originalKeybindings;

  beforeEach(() => {
    jest.resetModules();
    originalKeybindings = globalThis.game.keybindings;
  });

  afterEach(() => {
    globalThis.game.keybindings = originalKeybindings;
    jest.restoreAllMocks();
  });

  it('reserves Ctrl+G and consumes it before PF2e GM Vision despite a saved empty override', async () => {
    const registered = new Map();
    globalThis.game.keybindings = {
      register: jest.fn((_moduleId, key, config) => registered.set(key, config)),
    };

    const observerModule = await import(
      '../../../scripts/services/GmObserverView/gm-observer-view.js'
    );
    const toggle = jest.spyOn(observerModule.gmObserverView, 'toggle').mockResolvedValue(true);
    const { KEYBINDINGS } = await import('../../../scripts/constants.js');
    const { registerKeybindings } = await import('../../../scripts/settings.js');

    registerKeybindings();
    expect(KEYBINDINGS.toggleGmObserverView.uneditable).toEqual([
      { key: 'KeyG', modifiers: ['Control'] },
    ]);
    expect(KEYBINDINGS.toggleGmObserverView.editable).toEqual([]);
    const config = registered.get('toggleGmObserverView');
    expect(config.precedence).toBe(0);

    // Foundry always concatenates uneditable bindings with any saved editable override.
    const resolvedBindings = config.uneditable.concat([]);
    expect(resolvedBindings).toContainEqual({ key: 'KeyG', modifiers: ['Control'] });

    const systemGmVision = jest.fn(() => true);
    const actions = [
      { precedence: 1, onDown: systemGmVision },
      { precedence: config.precedence, onDown: config.onDown },
    ].sort((left, right) => left.precedence - right.precedence);
    let handled = false;
    for (const action of actions) {
      handled = action.onDown();
      if (handled) break;
    }

    await handled;
    expect(toggle).toHaveBeenCalledTimes(1);
    expect(systemGmVision).not.toHaveBeenCalled();
  });
});
