import { jest } from '@jest/globals';

import {
  AvsMovementInvalidationWorkflow,
  tokenHasTakeCoverExpirationState,
} from '../../../scripts/visibility/auto-visibility/core/AvsMovementInvalidationWorkflow.js';

function makeVisibilityState() {
  return {
    markTokenChangedImmediate: jest.fn(),
    markTokenChangedWithSpatialOptimization: jest.fn(),
  };
}

function makeCacheManager() {
  return {
    getGlobalVisibilityCache: jest.fn(() => 'global-visibility-cache'),
    clearVisibilityCache: jest.fn(),
    clearLosCache: jest.fn(),
  };
}

function makeWorkflow(overrides = {}) {
  return new AvsMovementInvalidationWorkflow({
    shouldProcessEvents: jest.fn(() => true),
    visibilityState: makeVisibilityState(),
    cacheManager: makeCacheManager(),
    batchOrchestrator: {
      notifyTokenMovementStart: jest.fn(),
      notifyTokenMovementComplete: jest.fn(),
    },
    visionAnalyzer: { clearCache: jest.fn() },
    lightingPrecomputer: { clearLightingCaches: jest.fn() },
    ...overrides,
  });
}

describe('AvsMovementInvalidationWorkflow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('completed movement clears position caches, marks spatial recalculation, then closes movement', () => {
    const visibilityState = makeVisibilityState();
    const cacheManager = makeCacheManager();
    const batchOrchestrator = {
      notifyTokenMovementStart: jest.fn(),
      notifyTokenMovementComplete: jest.fn(),
    };
    const visionAnalyzer = { clearCache: jest.fn() };
    const lightingPrecomputer = { clearLightingCaches: jest.fn() };
    const workflow = makeWorkflow({
      visibilityState,
      cacheManager,
      batchOrchestrator,
      visionAnalyzer,
      lightingPrecomputer,
      overrideValidationManager: null,
    });
    const tokenDoc = { id: 'token1', x: 100, y: 200 };
    const movementChanges = { x: 150, y: 250 };

    const result = workflow.handleTokenMovementCompleted(tokenDoc, movementChanges);

    expect(result).toBe(true);
    expect(cacheManager.getGlobalVisibilityCache).toHaveBeenCalledTimes(1);
    expect(lightingPrecomputer.clearLightingCaches).toHaveBeenCalledWith(
      'global-visibility-cache',
    );
    expect(cacheManager.clearLosCache).toHaveBeenCalledTimes(1);
    expect(cacheManager.clearVisibilityCache).toHaveBeenCalledTimes(1);
    expect(visionAnalyzer.clearCache).toHaveBeenCalledWith(tokenDoc);
    expect(visibilityState.markTokenChangedWithSpatialOptimization).toHaveBeenCalledWith(
      tokenDoc,
      movementChanges,
    );
    expect(batchOrchestrator.notifyTokenMovementComplete).toHaveBeenCalledTimes(1);
    expect(
      visibilityState.markTokenChangedWithSpatialOptimization.mock.invocationCallOrder[0],
    ).toBeLessThan(batchOrchestrator.notifyTokenMovementComplete.mock.invocationCallOrder[0]);
  });

  test('completed movement expires Take Cover before queueing and scheduling override validation', async () => {
    jest.useFakeTimers();
    let finishExpiration;
    const requestTakeCoverExpirationForToken = jest.fn(
      () =>
        new Promise((resolve) => {
          finishExpiration = resolve;
        }),
    );
    const overrideValidationManager = {
      queueOverrideValidation: jest.fn(),
      processQueuedValidations: jest.fn().mockResolvedValue(undefined),
    };
    const token = {
      id: 'token1',
      document: {
        id: 'token1',
        flags: {
          'pf2e-visioner': {
            cover: { source: 'take_cover_action', coverOnly: true, expectedCover: 'standard' },
          },
        },
      },
    };
    const workflow = makeWorkflow({
      overrideValidationManager,
      requestTakeCoverExpirationForToken,
    });

    const result = workflow.handleTokenMovementCompleted({ id: 'token1', object: token }, {});

    expect(result).toBe(true);
    expect(requestTakeCoverExpirationForToken).toHaveBeenCalledWith(token, 'movement');
    expect(overrideValidationManager.queueOverrideValidation).not.toHaveBeenCalled();

    finishExpiration();
    await Promise.resolve();
    await Promise.resolve();

    expect(overrideValidationManager.queueOverrideValidation).toHaveBeenCalledWith('token1');
    expect(overrideValidationManager.processQueuedValidations).not.toHaveBeenCalled();
    await jest.runOnlyPendingTimersAsync();
    expect(overrideValidationManager.processQueuedValidations).toHaveBeenCalledTimes(1);
    expect(requestTakeCoverExpirationForToken.mock.invocationCallOrder[0]).toBeLessThan(
      overrideValidationManager.queueOverrideValidation.mock.invocationCallOrder[0],
    );
    jest.useRealTimers();
  });

  test('coalesces repeated completed movement override validation processing', async () => {
    jest.useFakeTimers();
    const overrideValidationManager = {
      queueOverrideValidation: jest.fn(),
      processQueuedValidations: jest.fn().mockResolvedValue(undefined),
    };
    const workflow = makeWorkflow({
      overrideValidationManager,
      requestTakeCoverExpirationForToken: jest.fn().mockResolvedValue(undefined),
    });

    workflow.handleTokenMovementCompleted({ id: 'token1' }, {});
    workflow.handleTokenMovementCompleted({ id: 'token1' }, {});
    await Promise.resolve();
    await Promise.resolve();

    expect(overrideValidationManager.queueOverrideValidation).toHaveBeenCalledTimes(2);
    expect(overrideValidationManager.processQueuedValidations).not.toHaveBeenCalled();
    await jest.runOnlyPendingTimersAsync();
    expect(overrideValidationManager.processQueuedValidations).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  test('position update records moved token and queues override validation after Take Cover expiration', async () => {
    let finishExpiration;
    const requestTakeCoverExpirationForToken = jest.fn(
      () =>
        new Promise((resolve) => {
          finishExpiration = resolve;
        }),
    );
    const setMovedTokenId = jest.fn();
    const overrideValidationManager = {
      queueOverrideValidation: jest.fn(),
      processQueuedValidations: jest.fn(),
    };
    const token = {
      id: 'token1',
      document: {
        id: 'token1',
        flags: {
          'pf2e-visioner': {
            cover: { coverOverrideSource: 'take_cover_action' },
          },
        },
      },
    };
    const workflow = makeWorkflow({
      overrideValidationManager,
      requestTakeCoverExpirationForToken,
      setMovedTokenId,
    });

    const result = workflow.handleTokenPositionUpdated({ id: 'token1', object: token }, {});

    expect(result).toBe(true);
    expect(setMovedTokenId).toHaveBeenCalledWith('token1');
    expect(requestTakeCoverExpirationForToken).toHaveBeenCalledWith(token, 'movement');
    expect(overrideValidationManager.queueOverrideValidation).not.toHaveBeenCalled();

    finishExpiration();
    await Promise.resolve();
    await Promise.resolve();

    expect(overrideValidationManager.queueOverrideValidation).toHaveBeenCalledWith('token1');
    expect(overrideValidationManager.processQueuedValidations).not.toHaveBeenCalled();
  });

  test('movement action handlers keep cache and token marking narrow', () => {
    const visibilityState = makeVisibilityState();
    const cacheManager = makeCacheManager();
    const workflow = makeWorkflow({
      visibilityState,
      cacheManager,
    });

    expect(workflow.handleTokenMovementActionCacheInvalidated()).toBe(true);
    expect(cacheManager.clearVisibilityCache).toHaveBeenCalledTimes(1);
    expect(cacheManager.clearLosCache).not.toHaveBeenCalled();
    expect(visibilityState.markTokenChangedImmediate).not.toHaveBeenCalled();

    expect(workflow.handleTokenMovementActionUpdated({ id: 'token1' })).toBe(true);
    expect(visibilityState.markTokenChangedImmediate).toHaveBeenCalledWith('token1');
  });

  test('identifies all Take Cover tracking sources that should expire on movement', () => {
    expect(
      tokenHasTakeCoverExpirationState({
        document: {
          flags: { 'pf2e-visioner': { cover: { coverOnly: true } } },
        },
      }),
    ).toBe(true);
    expect(
      tokenHasTakeCoverExpirationState({
        actor: {
          itemTypes: {
            effect: [{ flags: { 'pf2e-visioner': { takeCoverProneRangedOnly: true } } }],
          },
        },
      }),
    ).toBe(true);
    expect(tokenHasTakeCoverExpirationState({ document: { flags: {} } })).toBe(false);
  });
});
