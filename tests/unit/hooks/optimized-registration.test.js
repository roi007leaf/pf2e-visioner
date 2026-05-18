import '../../setup.js';

describe('optimized hook registration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  test('leaves token and wall document lifecycle hooks to their main registrars', async () => {
    const { registerHooks } = await import('../../../scripts/hooks/optimized-registration.js');

    registerHooks();

    const registeredHooks = Hooks.on.mock.calls.map(([hookName]) => hookName);

    expect(registeredHooks).not.toContain('createToken');
    expect(registeredHooks).not.toContain('deleteToken');
    expect(registeredHooks).not.toContain('createWall');
    expect(registeredHooks).not.toContain('updateWall');
    expect(registeredHooks).not.toContain('deleteWall');
  });

  test('still registers non-wall-document visual refresh hooks', async () => {
    const { registerHooks } = await import('../../../scripts/hooks/optimized-registration.js');

    registerHooks();

    const registeredHooks = Hooks.on.mock.calls.map(([hookName]) => hookName);

    expect(registeredHooks).toEqual(
      expect.arrayContaining([
        'renderTokenConfig',
        'renderWallConfig',
        'updateAmbientLight',
        'createAmbientLight',
        'deleteAmbientLight',
        'canvasReady',
        'getSceneControlButtons',
        'renderSceneControls',
        'renderSettingsConfig',
      ]),
    );
  });
});
