/**
 * Smoke tests for the public autoVisibility facade in scripts/api.js
 */

describe('API.autoVisibility facade', () => {
  beforeEach(() => {
    jest.resetModules();
    global.game = global.game || {};
    global.game.user = global.game.user || {};
    global.game.user.isGM = true;
    global.canvas?.tokens?.get?.mockReset?.();
  });

  test('enable/disable/isEnabled wiring', async () => {
    // Spy on underlying system
    const modulePath = '../../../scripts/visibility/auto-visibility/index.js';
    const realMod = await import(modulePath);
    const enableSpy = jest.spyOn(realMod.autoVisibilitySystem, 'enable').mockImplementation(() => { });
    const disableSpy = jest.spyOn(realMod.autoVisibilitySystem, 'disable').mockImplementation(() => { });

    const api = await import('../../../scripts/api.js');

    api.autoVisibility.enable();
    api.autoVisibility.disable();

    expect(enableSpy).toHaveBeenCalled();
    expect(disableSpy).toHaveBeenCalled();

    enableSpy.mockRestore();
    disableSpy.mockRestore();
  });

  test('recalculateAll delegates and updateTokens is safe when missing', async () => {
    const modulePath = '../../../scripts/visibility/auto-visibility/index.js';
    const realMod = await import(modulePath);
    const recalcSpy = jest
      .spyOn(realMod.autoVisibilitySystem, 'recalculateAllVisibility')
      .mockImplementation(() => { });

    // Ensure updateVisibilityForTokens is undefined to exercise warning path
    const originalUpdate = realMod.autoVisibilitySystem.updateVisibilityForTokens;
    delete realMod.autoVisibilitySystem.updateVisibilityForTokens;
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => { });

    const api = await import('../../../scripts/api.js');
    api.autoVisibility.recalculateAll();
    api.autoVisibility.updateTokens([{ id: 't1' }]);

    expect(recalcSpy).toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith('updateTokens method not available in refactored system');

    // Restore
    recalcSpy.mockRestore();
    warnSpy.mockRestore();
    if (originalUpdate) realMod.autoVisibilitySystem.updateVisibilityForTokens = originalUpdate;
  });

  test('getMovementPerformanceSnapshot delegates to auto visibility system', async () => {
    const modulePath = '../../../scripts/visibility/auto-visibility/index.js';
    const realMod = await import(modulePath);
    const snapshot = {
      active: false,
      currentSession: null,
      totals: { suppressedLightingRefreshes: 3 },
    };
    const snapshotSpy = jest
      .spyOn(realMod.autoVisibilitySystem, 'getMovementPerformanceSnapshot')
      .mockReturnValue(snapshot);

    const api = await import('../../../scripts/api.js');

    expect(api.autoVisibility.getMovementPerformanceSnapshot()).toBe(snapshot);

    snapshotSpy.mockRestore();
  });

  test('debugPendingMovementVisualRefresh toggles runtime profiling suppression', async () => {
    global.game = {};
    const api = await import('../../../scripts/api.js');

    expect(api.autoVisibility.debugPendingMovementVisualRefresh(false)).toBe(false);
    expect(global.game.pf2eVisioner.suppressPendingMovementVisualRefresh).toBe(true);

    expect(api.autoVisibility.debugPendingMovementVisualRefresh(true)).toBe(true);
    expect(global.game.pf2eVisioner.suppressPendingMovementVisualRefresh).toBe(false);
  });

  test('debugMovementPerformanceDiagnostics toggles runtime performance diagnostics', async () => {
    global.game = {};
    const api = await import('../../../scripts/api.js');

    expect(api.autoVisibility.debugMovementPerformanceDiagnostics(true)).toBe(true);
    expect(global.game.pf2eVisioner.enableMovementPerformanceDiagnostics).toBe(true);

    expect(api.autoVisibility.debugMovementPerformanceDiagnostics(false)).toBe(false);
    expect(global.game.pf2eVisioner.enableMovementPerformanceDiagnostics).toBe(false);
  });

  test('v2 perception profile API reads and writes canonical profiles', async () => {
    const observer = createMockToken({ id: 'observer' });
    const target = createMockToken({ id: 'target' });
    canvas.tokens.get.mockImplementation((id) => {
      if (id === 'observer') return observer;
      if (id === 'target') return target;
      return null;
    });

    const api = await import('../../../scripts/api.js');

    await expect(
      api.autoVisibility.setPerceptionProfile('observer', 'target', {
        detectionState: 'hidden',
        hasConcealment: true,
      }),
    ).resolves.toBe(true);

    expect(observer.document.setFlag).toHaveBeenCalledWith(
      'pf2e-visioner',
      'visibilityV2',
      {
        target: expect.objectContaining({
          detectionState: 'hidden',
          hasConcealment: true,
        }),
      },
    );
    expect(api.autoVisibility.getPerceptionProfile('observer', 'target')).toMatchObject({
      detectionState: 'hidden',
      hasConcealment: true,
    });
  });
});
