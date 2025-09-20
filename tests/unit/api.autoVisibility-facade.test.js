/**
 * Smoke tests for the public autoVisibility facade in scripts/api.js
 */

describe('API.autoVisibility facade', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('enable/disable/isEnabled wiring', async () => {
    // Spy on underlying system
    const modulePath = '../../scripts/visibility/auto-visibility/index.js';
    const realMod = await import(modulePath);
    const enableSpy = jest.spyOn(realMod.autoVisibilitySystem, 'enable').mockImplementation(() => {});
    const disableSpy = jest.spyOn(realMod.autoVisibilitySystem, 'disable').mockImplementation(() => {});
    const getStatusSpy = jest
      .spyOn(realMod.autoVisibilitySystem, 'getStatus')
      .mockReturnValue({ enabled: true });

    const api = await import('../../scripts/api.js');

    api.autoVisibility.enable();
    api.autoVisibility.disable();
    const enabled = api.autoVisibility.isEnabled();

    expect(enableSpy).toHaveBeenCalled();
    expect(disableSpy).toHaveBeenCalled();
    expect(getStatusSpy).toHaveBeenCalled();
    expect(enabled).toBe(true);

    enableSpy.mockRestore();
    disableSpy.mockRestore();
    getStatusSpy.mockRestore();
  });

  test('recalculateAll delegates and updateTokens is safe when missing', async () => {
    const modulePath = '../../scripts/visibility/auto-visibility/index.js';
    const realMod = await import(modulePath);
    const recalcSpy = jest
      .spyOn(realMod.autoVisibilitySystem, 'recalculateAllVisibility')
      .mockImplementation(() => {});

    // Ensure updateVisibilityForTokens is undefined to exercise warning path
    const originalUpdate = realMod.autoVisibilitySystem.updateVisibilityForTokens;
    delete realMod.autoVisibilitySystem.updateVisibilityForTokens;
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const api = await import('../../scripts/api.js');
    api.autoVisibility.recalculateAll();
    api.autoVisibility.updateTokens([{ id: 't1' }]);

    expect(recalcSpy).toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith('updateTokens method not available in refactored system');

    // Restore
    recalcSpy.mockRestore();
    warnSpy.mockRestore();
    if (originalUpdate) realMod.autoVisibilitySystem.updateVisibilityForTokens = originalUpdate;
  });
});
