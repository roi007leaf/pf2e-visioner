import '../../setup.js';

describe('GM Observer View settings', () => {
  let originalRegisterMenu;

  beforeEach(() => {
    jest.resetModules();
    originalRegisterMenu = globalThis.game.settings.registerMenu;
  });

  afterEach(() => {
    globalThis.game.settings.registerMenu = originalRegisterMenu;
    jest.restoreAllMocks();
  });

  it('hides GM Vision warning suppression while GM Observer View is enabled', async () => {
    const values = {
      gmObserverView: false,
      suppressAvsGmVisionWarning: false,
    };
    globalThis.game.settings.get.mockImplementation((namespace, key) => {
      if (namespace !== 'pf2e-visioner') return false;
      return values[key] ?? false;
    });
    globalThis.game.settings.registerMenu = jest.fn();

    const { registerSettings } = await import('../../../scripts/settings.js');
    registerSettings();

    const menuConfig = globalThis.game.settings.registerMenu.mock.calls.find(
      ([namespace, key]) => namespace === 'pf2e-visioner' && key === 'groupedSettings',
    )?.[2];
    const app = new menuConfig.type();
    app.activeGroupKey = 'A.V.S. Settings';

    const visibleContext = await app._prepareContext();
    expect(visibleContext.groups.flatMap((group) => group.items.map((item) => item.key))).toContain(
      'suppressAvsGmVisionWarning',
    );

    values.gmObserverView = true;
    const hiddenContext = await app._prepareContext();
    expect(
      hiddenContext.groups.flatMap((group) => group.items.map((item) => item.key)),
    ).not.toContain('suppressAvsGmVisionWarning');

    app._pendingChanges['settings.gmObserverView'] = false;
    const pendingDisabledContext = await app._prepareContext();
    expect(
      pendingDisabledContext.groups.flatMap((group) => group.items.map((item) => item.key)),
    ).toContain('suppressAvsGmVisionWarning');
  });

  it('shows wall highlights in GM Vision settings only for GMs', async () => {
    const originalIsGM = globalThis.game.user.isGM;
    globalThis.game.settings.registerMenu = jest.fn();
    const { registerSettings } = await import('../../../scripts/settings.js');
    registerSettings();
    const menuConfig = globalThis.game.settings.registerMenu.mock.calls.find(
      ([namespace, key]) => namespace === 'pf2e-visioner' && key === 'groupedSettings',
    )?.[2];
    const app = new menuConfig.type();
    app.activeGroupKey = 'Vision';

    try {
      globalThis.game.user.isGM = true;
      const gmKeys = (await app._prepareContext()).groups.flatMap((group) =>
        group.items.map((item) => item.key),
      );
      expect(gmKeys).toContain('showGmObserverWallHighlights');

      globalThis.game.user.isGM = false;
      const playerKeys = (await app._prepareContext()).groups.flatMap((group) =>
        group.items.map((item) => item.key),
      );
      expect(playerKeys).not.toContain('showGmObserverWallHighlights');
    } finally {
      globalThis.game.user.isGM = originalIsGM;
    }
  });
});
