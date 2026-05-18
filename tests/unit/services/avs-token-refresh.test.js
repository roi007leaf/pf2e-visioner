import '../../setup.js';

describe('AVS token refresh service', () => {
  let service;
  let windowAutoVisibilitySystem;
  let importedAutoVisibilitySystem;
  let overrideValidationManager;
  let runtimeState;
  let perception;

  beforeEach(async () => {
    jest.resetModules();
    jest.clearAllMocks();

    windowAutoVisibilitySystem = {
      recalculateForTokens: jest.fn().mockResolvedValue(undefined),
    };
    overrideValidationManager = {
      queueOverrideValidation: jest.fn(),
      processQueuedValidations: jest.fn().mockResolvedValue(undefined),
    };
    importedAutoVisibilitySystem = {
      recalculateForTokens: jest.fn().mockResolvedValue(undefined),
      orchestrator: {
        overrideValidationManager,
      },
    };
    runtimeState = {
      getLastMovedTokenId: jest.fn(() => 'moved-token'),
      clearLastMovedTokenId: jest.fn(),
      setLastMovedTokenId: jest.fn(),
    };
    perception = {
      update: jest.fn(),
    };

    service = await import('../../../scripts/services/avs-token-refresh.js');
  });

  test('normalizes token ids before refreshing', async () => {
    const refreshService = service.createAvsTokenRefreshService({
      getWindowAutoVisibilitySystem: () => windowAutoVisibilitySystem,
      loadAutoVisibilitySystem: async () => importedAutoVisibilitySystem,
      getCanvasPerception: () => perception,
      runtimeState,
    });

    const result = await refreshService.refreshTokenMapChanges([
      'token-2',
      null,
      'token-1',
      'token-2',
      undefined,
    ]);

    expect(result.tokenIds).toEqual(['token-2', 'token-1']);
    expect(windowAutoVisibilitySystem.recalculateForTokens).toHaveBeenCalledWith([
      'token-2',
      'token-1',
    ]);
    expect(importedAutoVisibilitySystem.recalculateForTokens).toHaveBeenCalledWith([
      'token-2',
      'token-1',
    ]);
  });

  test('preserves last-moved-token suppression around forced override validation', async () => {
    const refreshService = service.createAvsTokenRefreshService({
      getWindowAutoVisibilitySystem: () => windowAutoVisibilitySystem,
      loadAutoVisibilitySystem: async () => importedAutoVisibilitySystem,
      getCanvasPerception: () => perception,
      runtimeState,
    });

    await refreshService.refreshTokenMapChanges(['token-1', 'token-2']);

    expect(runtimeState.clearLastMovedTokenId.mock.invocationCallOrder[0]).toBeLessThan(
      overrideValidationManager.queueOverrideValidation.mock.invocationCallOrder[0],
    );
    expect(overrideValidationManager.queueOverrideValidation).toHaveBeenCalledWith('token-1');
    expect(overrideValidationManager.queueOverrideValidation).toHaveBeenCalledWith('token-2');
    expect(overrideValidationManager.processQueuedValidations).toHaveBeenCalledWith({
      skipMovedFilter: true,
    });
    expect(runtimeState.setLastMovedTokenId).toHaveBeenCalledWith('moved-token');
  });

  test('skips duplicate module recalculation when the global refresh already succeeded on the same system', async () => {
    windowAutoVisibilitySystem.orchestrator = {
      overrideValidationManager,
    };
    importedAutoVisibilitySystem = windowAutoVisibilitySystem;
    const refreshService = service.createAvsTokenRefreshService({
      getWindowAutoVisibilitySystem: () => windowAutoVisibilitySystem,
      loadAutoVisibilitySystem: async () => importedAutoVisibilitySystem,
      getCanvasPerception: () => perception,
      runtimeState,
    });

    const result = await refreshService.refreshTokenMapChanges(['token-1']);

    expect(windowAutoVisibilitySystem.recalculateForTokens).toHaveBeenCalledTimes(1);
    expect(result.windowRecalculated).toBe(true);
    expect(result.moduleRecalculated).toBe(false);
    expect(result.overrideValidated).toBe(true);
  });

  test('still attempts imported recalculation when the global refresh fails', async () => {
    windowAutoVisibilitySystem.recalculateForTokens.mockRejectedValueOnce(new Error('boom'));
    importedAutoVisibilitySystem = {
      ...windowAutoVisibilitySystem,
      recalculateForTokens: jest.fn().mockResolvedValue(undefined),
      orchestrator: {
        overrideValidationManager,
      },
    };
    const refreshService = service.createAvsTokenRefreshService({
      getWindowAutoVisibilitySystem: () => windowAutoVisibilitySystem,
      loadAutoVisibilitySystem: async () => importedAutoVisibilitySystem,
      getCanvasPerception: () => perception,
      runtimeState,
    });

    const result = await refreshService.refreshTokenMapChanges(['token-1']);

    expect(result.windowRecalculated).toBe(false);
    expect(importedAutoVisibilitySystem.recalculateForTokens).toHaveBeenCalledWith(['token-1']);
    expect(result.moduleRecalculated).toBe(true);
  });

  test('refreshes canvas perception after map sync refresh work', async () => {
    const refreshService = service.createAvsTokenRefreshService({
      getWindowAutoVisibilitySystem: () => null,
      loadAutoVisibilitySystem: async () => importedAutoVisibilitySystem,
      getCanvasPerception: () => perception,
      runtimeState,
    });

    const result = await refreshService.refreshTokenMapChanges(['token-1']);

    expect(perception.update).toHaveBeenCalledWith({
      refreshVision: true,
      refreshOcclusion: true,
    });
    expect(result.perceptionRefreshed).toBe(true);
  });

  test('does no work when there are no token ids', async () => {
    const refreshService = service.createAvsTokenRefreshService({
      getWindowAutoVisibilitySystem: () => windowAutoVisibilitySystem,
      loadAutoVisibilitySystem: async () => importedAutoVisibilitySystem,
      getCanvasPerception: () => perception,
      runtimeState,
    });

    const result = await refreshService.refreshTokenMapChanges([null, undefined, '']);

    expect(result.tokenIds).toEqual([]);
    expect(windowAutoVisibilitySystem.recalculateForTokens).not.toHaveBeenCalled();
    expect(importedAutoVisibilitySystem.recalculateForTokens).not.toHaveBeenCalled();
    expect(overrideValidationManager.queueOverrideValidation).not.toHaveBeenCalled();
    expect(perception.update).not.toHaveBeenCalled();
  });

  test('recalculates token ids through the runtime AVS service without override validation', async () => {
    const refreshService = service.createAvsTokenRefreshService({
      getWindowAutoVisibilitySystem: () => windowAutoVisibilitySystem,
      getCanvasPerception: () => perception,
    });

    const result = await refreshService.recalculateRuntimeTokenIds(['token-1', 'token-1']);

    expect(windowAutoVisibilitySystem.recalculateForTokens).toHaveBeenCalledWith(['token-1']);
    expect(overrideValidationManager.queueOverrideValidation).not.toHaveBeenCalled();
    expect(perception.update).not.toHaveBeenCalled();
    expect(result.windowRecalculated).toBe(true);
  });

  test('runtime token recalculation falls back to perception when AVS is unavailable', async () => {
    const refreshService = service.createAvsTokenRefreshService({
      getWindowAutoVisibilitySystem: () => null,
      getCanvasPerception: () => perception,
    });

    const result = await refreshService.recalculateRuntimeTokenIds(['token-1']);

    expect(perception.update).toHaveBeenCalledWith({
      refreshVision: true,
      refreshOcclusion: true,
    });
    expect(result.perceptionRefreshed).toBe(true);
  });
});
