import { jest } from '@jest/globals';

import {
  AVS_INVALIDATION_REASON_HANDLERS,
  AvsInvalidationCoordinator,
} from '../../../scripts/visibility/auto-visibility/core/AvsInvalidationCoordinator.js';
import { LightingPrecomputer } from '../../../scripts/visibility/auto-visibility/core/LightingPrecomputer.js';
import {
  setSuppressLightingRefresh,
  setSuppressLightingRefreshAfterBatch,
} from '../../../scripts/services/runtime-state.js';

jest.mock('../../../scripts/visibility/auto-visibility/core/LightingPrecomputer.js', () => ({
  LightingPrecomputer: {
    clearLightingCaches: jest.fn(),
  },
}));

function makeSystemState(overrides = {}) {
  return {
    shouldProcessEvents: jest.fn(() => true),
    debug: jest.fn(),
    isSceneConfigOpen: jest.fn(() => false),
    markPendingLightingChange: jest.fn(),
    ...overrides,
  };
}

function makeVisibilityState() {
  return {
    markTokenChangedImmediate: jest.fn(),
    markTokenChangedWithSpatialOptimization: jest.fn(),
    markAllTokensChangedImmediate: jest.fn(),
    markAllTokensChangedThrottled: jest.fn(),
    recalculateForTokens: jest.fn(),
    removeChangedToken: jest.fn(),
  };
}

function makeCacheManager() {
  return {
    getGlobalVisibilityCache: jest.fn(() => 'global-visibility-cache'),
    clearVisibilityCache: jest.fn(),
    clearAllCaches: jest.fn(),
    clearLosCache: jest.fn(),
    clearGlobalVisibilityCache: jest.fn(),
  };
}

describe('AvsInvalidationCoordinator dispatch registry', () => {
  test('keeps all invalidation reason handlers in one named registry', () => {
    expect(AVS_INVALIDATION_REASON_HANDLERS).toEqual({
      'ambient-light-updated': 'ambientLightUpdated',
      'ambient-light-created': 'ambientLightCreatedOrDeleted',
      'ambient-light-deleted': 'ambientLightCreatedOrDeleted',
      'lighting-refresh': 'lightingRefresh',
      'wall-updated': 'wallUpdated',
      'wall-created': 'wallCreatedOrDeleted',
      'wall-deleted': 'wallCreatedOrDeleted',
      'scene-lighting-updated': 'fullSceneImmediateInvalidation',
      'scene-config-lighting-flushed': 'fullSceneImmediateInvalidation',
      'region-surface-updated': 'fullSceneImmediateInvalidation',
      'token-light-updated': 'tokenLightUpdated',
      'token-light-emitter-moved': 'tokenLightEmitterMoved',
      'token-light-recalculation-required': 'tokenLightRecalculationRequired',
      'token-position-updated': 'tokenPositionUpdated',
      'token-movement-completed': 'tokenMovementCompleted',
      'token-movement-override-validation-required': 'tokenMovementOverrideValidationRequired',
      'token-movement-action-cache-invalidated': 'tokenMovementActionCacheInvalidated',
      'token-movement-action-updated': 'tokenMovementActionUpdated',
      'token-hidden-toggled': 'tokenHiddenToggled',
      'token-created': 'tokenCreated',
      'token-deleted': 'tokenDeleted',
      'token-visibility-affecting-updated': 'tokenVisibilityAffectingUpdated',
      'effect-visibility-updated': 'effectVisibilityUpdated',
      'effect-light-emitter-updated': 'effectLightEmitterUpdated',
      'item-visibility-updated': 'itemVisibilityUpdated',
      'item-vision-equipment-updated': 'itemVisionEquipmentUpdated',
      'item-light-emitter-updated': 'itemLightEmitterUpdated',
      'actor-visibility-updated': 'actorVisibilityUpdated',
      'template-light-updated': 'templateLightUpdated',
    });
  });
});

describe('AvsInvalidationCoordinator lighting reasons', () => {
  let systemState;
  let visibilityState;
  let cacheManager;
  let coordinator;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    global.game.pf2eVisioner = {};
    AvsInvalidationCoordinator._lastControlTokenTime = 0;
    systemState = makeSystemState();
    visibilityState = makeVisibilityState();
    cacheManager = makeCacheManager();
    coordinator = new AvsInvalidationCoordinator({
      systemStateProvider: systemState,
      visibilityStateManager: visibilityState,
      cacheManager,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('ambient-light-updated waits for Foundry lighting refresh before immediate recalculation', async () => {
    global.foundry.utils.hasProperty.mockImplementation((obj, path) => {
      const keys = path.split('.');
      let current = obj;
      for (const key of keys) {
        if (current && typeof current === 'object' && key in current) current = current[key];
        else return false;
      }
      return true;
    });

    await coordinator.invalidate({
      reason: 'ambient-light-updated',
      changeData: { config: { bright: 20 } },
    });

    expect(cacheManager.clearVisibilityCache).toHaveBeenCalledTimes(1);
    expect(LightingPrecomputer.clearLightingCaches).toHaveBeenCalledTimes(1);
    expect(global.Hooks.once).toHaveBeenCalledWith('lightingRefresh', expect.any(Function));
    expect(visibilityState.markAllTokensChangedImmediate).not.toHaveBeenCalled();

    const finish = global.Hooks.once.mock.calls.find((call) => call[0] === 'lightingRefresh')[1];
    await finish();

    expect(visibilityState.markAllTokensChangedImmediate).toHaveBeenCalledTimes(1);
    expect(global.game.pf2eVisioner.suppressLightingRefresh).toBeUndefined();
  });

  test('ambient-light-updated ignores changes that do not affect visibility', async () => {
    global.foundry.utils.hasProperty.mockReturnValue(false);

    await coordinator.invalidate({
      reason: 'ambient-light-updated',
      changeData: { unrelated: true },
    });

    expect(cacheManager.clearVisibilityCache).not.toHaveBeenCalled();
    expect(LightingPrecomputer.clearLightingCaches).not.toHaveBeenCalled();
    expect(visibilityState.markAllTokensChangedImmediate).not.toHaveBeenCalled();
  });

  test.each(['ambient-light-created', 'ambient-light-deleted'])(
    '%s clears lighting caches and recalculates immediately',
    async (reason) => {
      await coordinator.invalidate({ reason });

      expect(cacheManager.clearVisibilityCache).toHaveBeenCalledTimes(1);
      expect(LightingPrecomputer.clearLightingCaches).toHaveBeenCalledTimes(1);
      expect(visibilityState.markAllTokensChangedImmediate).toHaveBeenCalledTimes(1);
    },
  );

  test('lighting-refresh is blocked by suppression flags and scene config deferral', async () => {
    setSuppressLightingRefresh(true);
    await coordinator.invalidate({ reason: 'lighting-refresh' });
    expect(visibilityState.markAllTokensChangedThrottled).not.toHaveBeenCalled();

    setSuppressLightingRefresh(false);
    systemState.isSceneConfigOpen.mockReturnValue(true);
    await coordinator.invalidate({ reason: 'lighting-refresh' });
    expect(systemState.markPendingLightingChange).toHaveBeenCalledTimes(1);
    expect(visibilityState.markAllTokensChangedThrottled).not.toHaveBeenCalled();

    systemState.isSceneConfigOpen.mockReturnValue(false);
    setSuppressLightingRefreshAfterBatch(true);
    await coordinator.invalidate({ reason: 'lighting-refresh' });
    expect(visibilityState.markAllTokensChangedThrottled).not.toHaveBeenCalled();
  });

  test('lighting-refresh clears all caches and throttles recalculation when not suppressed', async () => {
    await coordinator.invalidate({ reason: 'lighting-refresh' });

    expect(cacheManager.clearAllCaches).toHaveBeenCalledTimes(1);
    expect(visibilityState.markAllTokensChangedThrottled).toHaveBeenCalledTimes(1);
  });

  test('lighting-refresh is ignored while token movement is already queued', async () => {
    coordinator = new AvsInvalidationCoordinator({
      systemStateProvider: systemState,
      visibilityStateManager: visibilityState,
      cacheManager,
      batchOrchestrator: {
        isTokenMovementActive: jest.fn(() => true),
      },
    });

    const result = await coordinator.invalidate({ reason: 'lighting-refresh' });

    expect(result).toBe(false);
    expect(cacheManager.clearAllCaches).not.toHaveBeenCalled();
    expect(visibilityState.markAllTokensChangedThrottled).not.toHaveBeenCalled();
    expect(systemState.debug).toHaveBeenCalledWith(
      'LightingEventHandler: ignoring lightingRefresh during active token movement',
    );
  });
});

describe('AvsInvalidationCoordinator wall reasons', () => {
  let systemState;
  let visibilityState;
  let cacheManager;
  let batchOrchestrator;
  let visionAnalyzer;
  let coordinator;

  beforeEach(() => {
    jest.clearAllMocks();
    global.game.pf2eVisioner = {};
    systemState = makeSystemState();
    visibilityState = makeVisibilityState();
    cacheManager = makeCacheManager();
    batchOrchestrator = { clearBurstLosMemo: jest.fn() };
    visionAnalyzer = { clearCache: jest.fn() };
    coordinator = new AvsInvalidationCoordinator({
      systemStateProvider: systemState,
      visibilityStateManager: visibilityState,
      cacheManager,
      batchOrchestrator,
      visionAnalyzer,
    });
  });

  test('wall-updated clears LOS caches and recalculates when LOS-affecting fields change', () => {
    global.foundry.utils.hasProperty.mockImplementation((obj, path) => path === 'threshold.sight');

    const result = coordinator.invalidate({
      reason: 'wall-updated',
      changeData: { threshold: { sight: 10 } },
    });

    expect(result).toBe(true);
    expect(cacheManager.clearLosCache).toHaveBeenCalledTimes(1);
    expect(visionAnalyzer.clearCache).toHaveBeenCalledTimes(1);
    expect(cacheManager.clearGlobalVisibilityCache).toHaveBeenCalledTimes(1);
    expect(batchOrchestrator.clearBurstLosMemo).toHaveBeenCalledTimes(1);
    expect(visibilityState.markAllTokensChangedImmediate).toHaveBeenCalledTimes(1);
  });

  test('wall-updated ignores changes that do not affect LOS', () => {
    global.foundry.utils.hasProperty.mockReturnValue(false);

    const result = coordinator.invalidate({
      reason: 'wall-updated',
      changeData: { move: 1 },
    });

    expect(result).toBe(false);
    expect(cacheManager.clearLosCache).not.toHaveBeenCalled();
    expect(visibilityState.markAllTokensChangedImmediate).not.toHaveBeenCalled();
  });

  test.each(['wall-created', 'wall-deleted'])(
    '%s always clears LOS caches and recalculates immediately',
    (reason) => {
      const result = coordinator.invalidate({ reason });

      expect(result).toBe(true);
      expect(cacheManager.clearLosCache).toHaveBeenCalledTimes(1);
      expect(visionAnalyzer.clearCache).toHaveBeenCalledTimes(1);
      expect(cacheManager.clearGlobalVisibilityCache).toHaveBeenCalledTimes(1);
      expect(batchOrchestrator.clearBurstLosMemo).toHaveBeenCalledTimes(1);
      expect(visibilityState.markAllTokensChangedImmediate).toHaveBeenCalledTimes(1);
    },
  );
});

describe('AvsInvalidationCoordinator scene reasons', () => {
  let systemState;
  let visibilityState;
  let cacheManager;
  let coordinator;

  beforeEach(() => {
    jest.clearAllMocks();
    global.game.pf2eVisioner = {};
    systemState = makeSystemState();
    visibilityState = makeVisibilityState();
    cacheManager = makeCacheManager();
    coordinator = new AvsInvalidationCoordinator({
      systemStateProvider: systemState,
      visibilityStateManager: visibilityState,
      cacheManager,
    });
  });

  test.each(['scene-lighting-updated', 'scene-config-lighting-flushed', 'region-surface-updated'])(
    '%s clears all caches and recalculates immediately',
    (reason) => {
      const result = coordinator.invalidate({ reason });

      expect(result).toBe(true);
      expect(cacheManager.clearAllCaches).toHaveBeenCalledTimes(1);
      expect(visibilityState.markAllTokensChangedImmediate).toHaveBeenCalledTimes(1);
    },
  );

  test('scene reasons do not recalculate when events are disabled', () => {
    systemState.shouldProcessEvents.mockReturnValue(false);

    const result = coordinator.invalidate({ reason: 'scene-lighting-updated' });

    expect(result).toBe(false);
    expect(cacheManager.clearAllCaches).not.toHaveBeenCalled();
    expect(visibilityState.markAllTokensChangedImmediate).not.toHaveBeenCalled();
  });
});

describe('AvsInvalidationCoordinator token light reasons', () => {
  let systemState;
  let visibilityState;
  let cacheManager;
  let spatialAnalyzer;
  let coordinator;

  beforeEach(() => {
    jest.clearAllMocks();
    global.game.pf2eVisioner = {};
    systemState = makeSystemState();
    visibilityState = makeVisibilityState();
    cacheManager = makeCacheManager();
    spatialAnalyzer = {
      getAffectedTokens: jest.fn(() => [{ document: { id: 'token2' } }]),
    };
    coordinator = new AvsInvalidationCoordinator({
      systemStateProvider: systemState,
      visibilityStateManager: visibilityState,
      cacheManager,
      spatialAnalyzer,
    });
  });

  test('token-light-updated clears visibility cache and waits for lighting refresh before spatial fan-out', () => {
    const tokenDoc = { id: 'token1', x: 100, y: 200, width: 1, height: 1 };

    const result = coordinator.invalidate({
      reason: 'token-light-updated',
      document: tokenDoc,
      changeData: { light: { enabled: true, bright: 20 } },
    });

    expect(result).toBe(true);
    expect(cacheManager.clearVisibilityCache).toHaveBeenCalledTimes(1);
    expect(global.Hooks.once).toHaveBeenCalledWith('lightingRefresh', expect.any(Function));
    expect(visibilityState.markTokenChangedImmediate).not.toHaveBeenCalled();

    const lightingRefreshHandler = global.Hooks.once.mock.calls.find(
      (call) => call[0] === 'lightingRefresh',
    )[1];
    lightingRefreshHandler();

    expect(spatialAnalyzer.getAffectedTokens).toHaveBeenCalledWith(
      { x: 125, y: 225 },
      { x: 125, y: 225 },
      'token1',
    );
    expect(visibilityState.markTokenChangedImmediate).toHaveBeenCalledWith('token1');
    expect(visibilityState.markTokenChangedImmediate).toHaveBeenCalledWith('token2');
    expect(global.game.pf2eVisioner.suppressLightingRefresh).toBeUndefined();
  });

  test('token-light-updated falls back to full recalculation when spatial fan-out fails', () => {
    const tokenDoc = { id: 'token1', x: 100, y: 200, width: 1, height: 1 };
    const error = new Error('spatial failure');
    spatialAnalyzer.getAffectedTokens.mockImplementation(() => {
      throw error;
    });

    coordinator.invalidate({
      reason: 'token-light-updated',
      document: tokenDoc,
      changeData: { light: { enabled: true, bright: 20 } },
    });

    const lightingRefreshHandler = global.Hooks.once.mock.calls.find(
      (call) => call[0] === 'lightingRefresh',
    )[1];
    lightingRefreshHandler();

    expect(systemState.debug).toHaveBeenCalledWith('light-change-spatial-fallback', 'token1', error);
    expect(visibilityState.markAllTokensChangedImmediate).toHaveBeenCalledTimes(1);
    expect(global.game.pf2eVisioner.suppressLightingRefresh).toBeUndefined();
  });

  test('token-light-emitter-moved triggers a full immediate recalculation', () => {
    const result = coordinator.invalidate({
      reason: 'token-light-emitter-moved',
      document: { id: 'token1' },
      changeData: { x: 150 },
    });

    expect(result).toBe(true);
    expect(visibilityState.markAllTokensChangedImmediate).toHaveBeenCalledTimes(1);
    expect(visibilityState.markTokenChangedWithSpatialOptimization).not.toHaveBeenCalled();
    expect(cacheManager.clearVisibilityCache).not.toHaveBeenCalled();
  });

  test('token-light-recalculation-required triggers a full immediate recalculation', () => {
    const result = coordinator.invalidate({
      reason: 'token-light-recalculation-required',
      document: { id: 'token1' },
      changeData: { light: { enabled: true, bright: 20 } },
    });

    expect(result).toBe(true);
    expect(visibilityState.markAllTokensChangedImmediate).toHaveBeenCalledTimes(1);
  });
});

describe('AvsInvalidationCoordinator completed movement reasons', () => {
  let systemState;
  let visibilityState;
  let cacheManager;
  let batchOrchestrator;
  let visionAnalyzer;
  let overrideValidationManager;
  let requestTakeCoverExpirationForToken;
  let setMovedTokenId;
  let coordinator;

  beforeEach(() => {
    jest.clearAllMocks();
    global.game.pf2eVisioner = {};
    systemState = makeSystemState();
    visibilityState = makeVisibilityState();
    cacheManager = makeCacheManager();
    batchOrchestrator = {
      notifyTokenMovementStart: jest.fn(),
      notifyTokenMovementComplete: jest.fn(),
    };
    visionAnalyzer = { clearCache: jest.fn() };
    overrideValidationManager = {
      queueOverrideValidation: jest.fn(),
      processQueuedValidations: jest.fn().mockResolvedValue(undefined),
    };
    requestTakeCoverExpirationForToken = jest.fn().mockResolvedValue(undefined);
    setMovedTokenId = jest.fn();
    coordinator = new AvsInvalidationCoordinator({
      systemStateProvider: systemState,
      visibilityStateManager: visibilityState,
      cacheManager,
      batchOrchestrator,
      visionAnalyzer,
      overrideValidationManager,
      requestTakeCoverExpirationForToken,
      setMovedTokenId,
    });
  });

  test('token-movement-completed clears position-dependent caches and marks spatial recalculation', () => {
    const tokenDoc = { id: 'token1', x: 100, y: 200 };
    const movementChanges = { x: 150, y: 250 };

    const result = coordinator.invalidate({
      reason: 'token-movement-completed',
      document: tokenDoc,
      changeData: movementChanges,
    });

    expect(result).toBe(true);
    expect(cacheManager.getGlobalVisibilityCache).toHaveBeenCalledTimes(1);
    expect(LightingPrecomputer.clearLightingCaches).toHaveBeenCalledWith('global-visibility-cache');
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

  test('token-movement-completed expires Take Cover before queuing override validation and processing it', async () => {
    let finishExpiration;
    requestTakeCoverExpirationForToken.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishExpiration = resolve;
        }),
    );
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
    const tokenDoc = { id: 'token1', object: token };

    const result = coordinator.invalidate({
      reason: 'token-movement-completed',
      document: tokenDoc,
      changeData: { x: 150, y: 250 },
    });

    expect(result).toBe(true);
    expect(requestTakeCoverExpirationForToken).toHaveBeenCalledWith(token, 'movement');
    expect(overrideValidationManager.queueOverrideValidation).not.toHaveBeenCalled();

    finishExpiration();
    await Promise.resolve();
    await Promise.resolve();

    expect(overrideValidationManager.queueOverrideValidation).toHaveBeenCalledWith('token1');
    expect(overrideValidationManager.processQueuedValidations).toHaveBeenCalledTimes(1);
    expect(requestTakeCoverExpirationForToken.mock.invocationCallOrder[0]).toBeLessThan(
      overrideValidationManager.queueOverrideValidation.mock.invocationCallOrder[0],
    );
  });

  test('token-position-updated clears position caches, notifies movement start, and marks spatial recalculation', () => {
    const tokenDoc = { id: 'token1', x: 100, y: 200 };
    const movementChanges = { x: 150, y: 250 };

    const result = coordinator.invalidate({
      reason: 'token-position-updated',
      document: tokenDoc,
      changeData: movementChanges,
    });

    expect(result).toBe(true);
    expect(cacheManager.getGlobalVisibilityCache).toHaveBeenCalledTimes(1);
    expect(LightingPrecomputer.clearLightingCaches).toHaveBeenCalledWith('global-visibility-cache');
    expect(cacheManager.clearLosCache).toHaveBeenCalledTimes(1);
    expect(cacheManager.clearVisibilityCache).toHaveBeenCalledTimes(1);
    expect(batchOrchestrator.notifyTokenMovementStart).toHaveBeenCalledTimes(1);
    expect(batchOrchestrator.notifyTokenMovementComplete).not.toHaveBeenCalled();
    expect(visionAnalyzer.clearCache).not.toHaveBeenCalled();
    expect(visibilityState.markTokenChangedWithSpatialOptimization).toHaveBeenCalledWith(
      tokenDoc,
      movementChanges,
    );
  });

  test('token-position-updated queues override validation after movement Take Cover expiration without forcing validation processing', async () => {
    let finishExpiration;
    requestTakeCoverExpirationForToken.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishExpiration = resolve;
        }),
    );
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
    const tokenDoc = { id: 'token1', object: token };

    const result = coordinator.invalidate({
      reason: 'token-position-updated',
      document: tokenDoc,
      changeData: { x: 150, y: 250 },
    });

    expect(result).toBe(true);
    expect(requestTakeCoverExpirationForToken).toHaveBeenCalledWith(token, 'movement');
    expect(overrideValidationManager.queueOverrideValidation).not.toHaveBeenCalled();

    finishExpiration();
    await Promise.resolve();
    await Promise.resolve();

    expect(overrideValidationManager.queueOverrideValidation).toHaveBeenCalledWith('token1');
    expect(overrideValidationManager.processQueuedValidations).not.toHaveBeenCalled();
  });

  test('token-movement-override-validation-required only records movement and queues validation', async () => {
    let finishExpiration;
    requestTakeCoverExpirationForToken.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishExpiration = resolve;
        }),
    );
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
    const tokenDoc = { id: 'token1', object: token };

    const result = coordinator.invalidate({
      reason: 'token-movement-override-validation-required',
      document: tokenDoc,
    });

    expect(result).toBe(true);
    expect(setMovedTokenId).toHaveBeenCalledWith('token1');
    expect(requestTakeCoverExpirationForToken).toHaveBeenCalledWith(token, 'movement');
    expect(cacheManager.clearLosCache).not.toHaveBeenCalled();
    expect(cacheManager.clearVisibilityCache).not.toHaveBeenCalled();
    expect(batchOrchestrator.notifyTokenMovementStart).not.toHaveBeenCalled();
    expect(visibilityState.markTokenChangedWithSpatialOptimization).not.toHaveBeenCalled();
    expect(overrideValidationManager.queueOverrideValidation).not.toHaveBeenCalled();

    finishExpiration();
    await Promise.resolve();
    await Promise.resolve();

    expect(overrideValidationManager.queueOverrideValidation).toHaveBeenCalledWith('token1');
    expect(overrideValidationManager.processQueuedValidations).not.toHaveBeenCalled();
  });
});

describe('AvsInvalidationCoordinator movement action reasons', () => {
  let systemState;
  let visibilityState;
  let cacheManager;
  let coordinator;

  beforeEach(() => {
    jest.clearAllMocks();
    global.game.pf2eVisioner = {};
    systemState = makeSystemState();
    visibilityState = makeVisibilityState();
    cacheManager = makeCacheManager();
    coordinator = new AvsInvalidationCoordinator({
      systemStateProvider: systemState,
      visibilityStateManager: visibilityState,
      cacheManager,
    });
  });

  test('token-movement-action-cache-invalidated clears visibility cache only', () => {
    const result = coordinator.invalidate({ reason: 'token-movement-action-cache-invalidated' });

    expect(result).toBe(true);
    expect(cacheManager.clearVisibilityCache).toHaveBeenCalledTimes(1);
    expect(visibilityState.markTokenChangedImmediate).not.toHaveBeenCalled();
  });

  test('token-movement-action-updated marks the changed token immediately', () => {
    const tokenDoc = { id: 'token1' };

    const result = coordinator.invalidate({
      reason: 'token-movement-action-updated',
      document: tokenDoc,
      changeData: { movementAction: 'fly' },
    });

    expect(result).toBe(true);
    expect(cacheManager.clearVisibilityCache).not.toHaveBeenCalled();
    expect(visibilityState.markTokenChangedImmediate).toHaveBeenCalledWith('token1');
  });
});

describe('AvsInvalidationCoordinator hidden token reasons', () => {
  let systemState;
  let visibilityState;
  let coordinator;

  beforeEach(() => {
    jest.clearAllMocks();
    global.game.pf2eVisioner = {};
    global.canvas.tokens.placeables = [
      { document: { id: 'token1' } },
      { document: { id: 'token2' } },
    ];
    systemState = makeSystemState();
    visibilityState = makeVisibilityState();
    coordinator = new AvsInvalidationCoordinator({
      systemStateProvider: systemState,
      visibilityStateManager: visibilityState,
    });
  });

  test('token-hidden-toggled recalculates current canvas tokens', () => {
    const result = coordinator.invalidate({
      reason: 'token-hidden-toggled',
      document: { id: 'token1' },
      changeData: { hidden: true },
    });

    expect(result).toBe(true);
    expect(visibilityState.recalculateForTokens).toHaveBeenCalledWith(['token1', 'token2']);
  });
});

describe('AvsInvalidationCoordinator token lifecycle reasons', () => {
  let systemState;
  let visibilityState;
  let coordinator;

  beforeEach(() => {
    jest.clearAllMocks();
    global.game.pf2eVisioner = {};
    systemState = makeSystemState();
    visibilityState = makeVisibilityState();
    coordinator = new AvsInvalidationCoordinator({
      systemStateProvider: systemState,
      visibilityStateManager: visibilityState,
    });
  });

  test('token-created marks the created token immediately', () => {
    const result = coordinator.invalidate({
      reason: 'token-created',
      document: { id: 'token1' },
    });

    expect(result).toBe(true);
    expect(visibilityState.markTokenChangedImmediate).toHaveBeenCalledWith('token1');
  });

  test('token-deleted removes pending state for the deleted token', () => {
    const result = coordinator.invalidate({
      reason: 'token-deleted',
      document: { id: 'token1' },
    });

    expect(result).toBe(true);
    expect(visibilityState.removeChangedToken).toHaveBeenCalledWith('token1');
  });
});

describe('AvsInvalidationCoordinator generic token visibility reasons', () => {
  let systemState;
  let visibilityState;
  let coordinator;

  beforeEach(() => {
    jest.clearAllMocks();
    global.game.pf2eVisioner = {};
    systemState = makeSystemState();
    visibilityState = makeVisibilityState();
    coordinator = new AvsInvalidationCoordinator({
      systemStateProvider: systemState,
      visibilityStateManager: visibilityState,
    });
  });

  test('token-visibility-affecting-updated marks the changed token immediately', () => {
    const tokenDoc = { id: 'token1' };

    const result = coordinator.invalidate({
      reason: 'token-visibility-affecting-updated',
      document: tokenDoc,
      changeData: { vision: { enabled: true } },
    });

    expect(result).toBe(true);
    expect(visibilityState.markTokenChangedImmediate).toHaveBeenCalledWith('token1');
  });
});

describe('AvsInvalidationCoordinator effect reasons', () => {
  let systemState;
  let visibilityState;
  let cacheManager;
  let coordinator;

  beforeEach(() => {
    jest.clearAllMocks();
    global.game.pf2eVisioner = {};
    systemState = makeSystemState();
    visibilityState = makeVisibilityState();
    cacheManager = makeCacheManager();
    coordinator = new AvsInvalidationCoordinator({
      systemStateProvider: systemState,
      visibilityStateManager: visibilityState,
      cacheManager,
    });
  });

  test('effect-visibility-updated clears position caches and marks affected token ids', () => {
    const result = coordinator.invalidate({
      reason: 'effect-visibility-updated',
      document: { id: 'effect1' },
      metadata: { tokenIds: ['token1', 'token2'] },
    });

    expect(result).toBe(true);
    expect(cacheManager.clearVisibilityCache).toHaveBeenCalledTimes(1);
    expect(cacheManager.clearLosCache).toHaveBeenCalledTimes(1);
    expect(visibilityState.markTokenChangedImmediate).toHaveBeenCalledWith('token1');
    expect(visibilityState.markTokenChangedImmediate).toHaveBeenCalledWith('token2');
  });

  test('effect-light-emitter-updated clears position caches and recalculates all tokens', () => {
    const result = coordinator.invalidate({
      reason: 'effect-light-emitter-updated',
      document: { id: 'effect1' },
      metadata: { tokenIds: ['token1'] },
    });

    expect(result).toBe(true);
    expect(cacheManager.clearVisibilityCache).toHaveBeenCalledTimes(1);
    expect(cacheManager.clearLosCache).toHaveBeenCalledTimes(1);
    expect(visibilityState.markAllTokensChangedImmediate).toHaveBeenCalledTimes(1);
    expect(visibilityState.markTokenChangedImmediate).not.toHaveBeenCalled();
  });
});

describe('AvsInvalidationCoordinator item reasons', () => {
  let systemState;
  let visibilityState;
  let cacheManager;
  let visionAnalyzer;
  let globalVisibilityCache;
  let coordinator;

  beforeEach(() => {
    jest.clearAllMocks();
    global.game.pf2eVisioner = {};
    systemState = makeSystemState();
    visibilityState = makeVisibilityState();
    globalVisibilityCache = { clear: jest.fn() };
    cacheManager = makeCacheManager();
    cacheManager.getGlobalVisibilityCache.mockReturnValue(globalVisibilityCache);
    visionAnalyzer = { clearCache: jest.fn() };
    coordinator = new AvsInvalidationCoordinator({
      systemStateProvider: systemState,
      visibilityStateManager: visibilityState,
      cacheManager,
      visionAnalyzer,
    });
  });

  test('item-visibility-updated clears vision caches, global visibility cache, and marks affected tokens', () => {
    const token = { document: { id: 'token1' } };

    const result = coordinator.invalidate({
      reason: 'item-visibility-updated',
      document: { id: 'item1' },
      metadata: { tokens: [token], tokenIds: ['token1'] },
    });

    expect(result).toBe(true);
    expect(visionAnalyzer.clearCache).toHaveBeenCalledWith(token);
    expect(globalVisibilityCache.clear).toHaveBeenCalledTimes(1);
    expect(visibilityState.markTokenChangedImmediate).toHaveBeenCalledWith('token1');
  });

  test('item-vision-equipment-updated clears vision caches and marks affected tokens', () => {
    const token = { document: { id: 'token1' } };

    const result = coordinator.invalidate({
      reason: 'item-vision-equipment-updated',
      document: { id: 'item1' },
      metadata: { tokens: [token], tokenIds: ['token1'] },
    });

    expect(result).toBe(true);
    expect(visionAnalyzer.clearCache).toHaveBeenCalledWith(token);
    expect(globalVisibilityCache.clear).not.toHaveBeenCalled();
    expect(visibilityState.markTokenChangedImmediate).toHaveBeenCalledWith('token1');
  });

  test('item-light-emitter-updated clears vision caches and recalculates all tokens', () => {
    const token = { document: { id: 'token1' } };

    const result = coordinator.invalidate({
      reason: 'item-light-emitter-updated',
      document: { id: 'item1' },
      metadata: { tokens: [token], tokenIds: ['token1'] },
    });

    expect(result).toBe(true);
    expect(visionAnalyzer.clearCache).toHaveBeenCalledWith(token);
    expect(globalVisibilityCache.clear).not.toHaveBeenCalled();
    expect(visibilityState.markAllTokensChangedImmediate).toHaveBeenCalledTimes(1);
    expect(visibilityState.markTokenChangedImmediate).not.toHaveBeenCalled();
  });
});

describe('AvsInvalidationCoordinator actor reasons', () => {
  let systemState;
  let visibilityState;
  let coordinator;

  beforeEach(() => {
    jest.clearAllMocks();
    global.game.pf2eVisioner = {};
    systemState = makeSystemState();
    visibilityState = makeVisibilityState();
    coordinator = new AvsInvalidationCoordinator({
      systemStateProvider: systemState,
      visibilityStateManager: visibilityState,
    });
  });

  test('actor-visibility-updated marks affected token ids immediately', () => {
    const result = coordinator.invalidate({
      reason: 'actor-visibility-updated',
      document: { id: 'actor1' },
      metadata: { tokenIds: ['token1', 'token2'] },
    });

    expect(result).toBe(true);
    expect(visibilityState.markTokenChangedImmediate).toHaveBeenCalledWith('token1');
    expect(visibilityState.markTokenChangedImmediate).toHaveBeenCalledWith('token2');
  });
});

describe('AvsInvalidationCoordinator template reasons', () => {
  let systemState;
  let visibilityState;
  let coordinator;

  beforeEach(() => {
    jest.clearAllMocks();
    global.game.pf2eVisioner = {};
    systemState = makeSystemState();
    visibilityState = makeVisibilityState();
    coordinator = new AvsInvalidationCoordinator({
      systemStateProvider: systemState,
      visibilityStateManager: visibilityState,
    });
  });

  test('template-light-updated recalculates all tokens immediately', () => {
    const result = coordinator.invalidate({
      reason: 'template-light-updated',
      document: { id: 'template1' },
      metadata: { action: 'created' },
    });

    expect(result).toBe(true);
    expect(visibilityState.markAllTokensChangedImmediate).toHaveBeenCalledTimes(1);
  });
});
