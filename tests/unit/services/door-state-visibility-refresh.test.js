import '../../setup.js';

import {
  buildDoorStateSuppression,
  createDoorStateVisibilityRefreshService,
  getDoorStateValidationTokens,
} from '../../../scripts/services/door-state-visibility-refresh.js';

describe('door state visibility refresh service', () => {
  test('builds a bounded post-batch perception suppression payload', () => {
    const suppression = buildDoorStateSuppression(
      {
        id: 'door-1',
        c: [0, 1, 2, 3],
      },
      1,
      { now: () => 1000 },
    );

    expect(suppression).toEqual({
      reason: 'door-state-change',
      doorId: 'door-1',
      doorCoords: [0, 1, 2, 3],
      doorState: 1,
      until: 2000,
      perceptionRefreshed: false,
    });
  });

  test('uses controlled tokens for post-door validation when present', () => {
    const controlled = [{ document: { id: 'controlled' } }];
    const placeables = [{ document: { id: 'placeable' } }];

    expect(getDoorStateValidationTokens({ controlled, placeables })).toBe(controlled);
  });

  test('falls back to all placeable tokens for post-door validation', () => {
    const placeables = [{ document: { id: 'placeable' } }];

    expect(getDoorStateValidationTokens({ controlled: [], placeables })).toBe(placeables);
  });

  test('handles immediate door-state AVS invalidation and registers post-batch work', async () => {
    const setSuppression = jest.fn();
    const markAllTokensChangedImmediate = jest.fn();
    const hooksOnce = jest.fn();
    const service = createDoorStateVisibilityRefreshService({
      setPostBatchPerceptionRefreshSuppression: setSuppression,
      loadAutoVisibilitySystem: async () => ({
        orchestrator: {
          visibilityState: {
            markAllTokensChangedImmediate,
          },
        },
      }),
      loadDeferredSeekManager: async () => ({ checkAndApplyDeferred: jest.fn() }),
      hooksOnce,
      getCanvasTokens: () => ({ controlled: [], placeables: [] }),
      now: () => 5000,
    });

    await service.handleDoorStateChange({ id: 'door-1', c: [0, 0, 1, 1] }, 2);

    expect(setSuppression).toHaveBeenCalledWith({
      reason: 'door-state-change',
      doorId: 'door-1',
      doorCoords: [0, 0, 1, 1],
      doorState: 2,
      until: 6000,
      perceptionRefreshed: false,
    });
    expect(markAllTokensChangedImmediate).toHaveBeenCalledTimes(1);
    expect(hooksOnce).toHaveBeenCalledWith('pf2e-visioner.batchComplete', expect.any(Function));
  });

  test('post-batch work validates selected tokens before applying deferred seeks', async () => {
    const queueOverrideValidation = jest.fn();
    const processQueuedValidations = jest.fn().mockResolvedValue(undefined);
    const checkAndApplyDeferred = jest.fn().mockResolvedValue(undefined);
    let batchCompleteCallback;
    const controlledToken = {
      document: {
        id: 'controlled',
        getFlag: jest.fn(() => []),
      },
    };
    const deferredToken = {
      document: {
        id: 'deferred',
        getFlag: jest.fn((moduleId, key) => {
          if (moduleId === 'pf2e-visioner' && key === 'deferredSeekResults') return ['result'];
          return undefined;
        }),
      },
    };

    const service = createDoorStateVisibilityRefreshService({
      setPostBatchPerceptionRefreshSuppression: jest.fn(),
      loadAutoVisibilitySystem: async () => ({
        orchestrator: {
          visibilityState: {
            markAllTokensChangedImmediate: jest.fn(),
          },
          overrideValidationManager: {
            queueOverrideValidation,
            processQueuedValidations,
          },
        },
      }),
      loadDeferredSeekManager: async () => ({ checkAndApplyDeferred }),
      hooksOnce: jest.fn((hookName, callback) => {
        batchCompleteCallback = callback;
      }),
      getCanvasTokens: () => ({
        controlled: [controlledToken],
        placeables: [controlledToken, deferredToken],
      }),
    });

    await service.handleDoorStateChange({ id: 'door-1' }, 1);
    await batchCompleteCallback();

    expect(queueOverrideValidation).toHaveBeenCalledWith('controlled');
    expect(processQueuedValidations).toHaveBeenCalledWith({ skipMovedFilter: true });
    expect(checkAndApplyDeferred).toHaveBeenCalledWith('deferred');
    expect(processQueuedValidations.mock.invocationCallOrder[0]).toBeLessThan(
      checkAndApplyDeferred.mock.invocationCallOrder[0],
    );
  });
});
