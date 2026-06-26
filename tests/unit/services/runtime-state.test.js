describe('runtime state service', () => {
  let service;

  beforeEach(async () => {
    jest.resetModules();
    global.game = {};
    service = await import('../../../scripts/services/runtime-state.js');
  });

  test('creates and returns the shared game.pf2eVisioner state object', () => {
    const state = service.getRuntimeState();

    expect(state).toBe(global.game.pf2eVisioner);
    state.existing = 'kept';
    expect(service.getRuntimeState().existing).toBe('kept');
  });

  test('reads, writes, and clears generic runtime flags', () => {
    service.setRuntimeFlag('customFlag', 42);

    expect(service.getRuntimeFlag('customFlag')).toBe(42);

    service.clearRuntimeFlag('customFlag');

    expect(service.getRuntimeFlag('customFlag')).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(global.game.pf2eVisioner, 'customFlag')).toBe(false);
  });

  test('preserves unrelated keys while changing timing-sensitive flags', () => {
    service.setRuntimeFlag('unrelated', 'value');
    service.setSuppressLightingRefresh(true);
    service.setSuppressRefreshTokenProcessing(true);
    service.setSuppressPendingMovementVisualRefresh(true);
    service.setMovementPerformanceDiagnosticsEnabled(true);
    service.setSuppressLightingRefreshAfterBatch(true);
    service.setLastMovedTokenId('token-1');

    expect(service.isLightingRefreshSuppressed()).toBe(true);
    expect(service.isRefreshTokenProcessingSuppressed()).toBe(true);
    expect(service.isPendingMovementVisualRefreshSuppressed()).toBe(true);
    expect(service.isMovementPerformanceDiagnosticsEnabled()).toBe(true);
    expect(service.isLightingRefreshAfterBatchSuppressed()).toBe(true);
    expect(service.getLastMovedTokenId()).toBe('token-1');
    expect(service.getRuntimeFlag('unrelated')).toBe('value');
  });

  test('named clear helpers preserve existing flag semantics', () => {
    service.setSuppressLightingRefresh(true);
    service.clearSuppressLightingRefresh();
    expect(service.getRuntimeFlag('suppressLightingRefresh')).toBeUndefined();

    service.setSuppressRefreshTokenProcessing(true);
    service.clearSuppressRefreshTokenProcessing();
    expect(service.getRuntimeFlag('suppressRefreshTokenProcessing')).toBe(false);

    service.setSuppressPendingMovementVisualRefresh(true);
    service.clearSuppressPendingMovementVisualRefresh();
    expect(service.getRuntimeFlag('suppressPendingMovementVisualRefresh')).toBe(false);

    service.setMovementPerformanceDiagnosticsEnabled(true);
    service.clearMovementPerformanceDiagnosticsEnabled();
    expect(service.getRuntimeFlag('enableMovementPerformanceDiagnostics')).toBe(false);

    service.setSuppressLightingRefreshAfterBatch(true);
    service.clearSuppressLightingRefreshAfterBatch();
    expect(service.getRuntimeFlag('suppressLightingRefreshAfterBatch')).toBe(false);

    service.setPostBatchPerceptionRefreshSuppression({ reason: 'door-state-change' });
    service.clearPostBatchPerceptionRefreshSuppression();
    expect(service.getRuntimeFlag('suppressNextAvsPostBatchPerceptionRefresh')).toBeNull();
  });

  test('full-scope recalc request is consumed once then cleared', () => {
    expect(service.consumeFullVisibilityScopeRecalc()).toBe(false);

    service.requestFullVisibilityScopeRecalc();
    expect(service.getRuntimeFlag('forceFullVisibilityScopeRecalc')).toBe(true);

    expect(service.consumeFullVisibilityScopeRecalc()).toBe(true);
    expect(service.consumeFullVisibilityScopeRecalc()).toBe(false);
    expect(
      Object.prototype.hasOwnProperty.call(global.game.pf2eVisioner, 'forceFullVisibilityScopeRecalc'),
    ).toBe(false);
  });

  test('returns nullish values without creating state when game is unavailable', () => {
    delete global.game;

    expect(service.getRuntimeState({ create: false })).toBeNull();
    expect(service.getRuntimeFlag('lastMovedTokenId')).toBeUndefined();
  });
});
