import '../../setup.js';
import { TokenEventHandler } from '../../../scripts/visibility/auto-visibility/core/TokenEventHandler.js';
import {
  clearPendingTokenMovementPosition,
  setPendingTokenMovementPosition,
} from '../../../scripts/services/PendingMovement/pending-token-movement.js';

describe('TokenEventHandler - animation detection on position change', () => {
  let handler;
  let markTokenChangedWithSpatialOptimization;
  let notifyTokenMovementStart;
  let storeUpdatedTokenDoc;
  let pinTokenDestination;
  let queueOverrideValidation;
  let processQueuedValidations;
  let systemState;
  let visibilityState;
  let spatialAnalyzer;
  let exclusionManager;
  let overrideValidationManager;
  let positionManager;
  let cacheManager;
  let batchOrchestrator;

  beforeEach(() => {
    markTokenChangedWithSpatialOptimization = jest.fn();
    notifyTokenMovementStart = jest.fn();
    storeUpdatedTokenDoc = jest.fn();
    pinTokenDestination = jest.fn();
    queueOverrideValidation = jest.fn();
    processQueuedValidations = jest.fn(() => Promise.resolve());

    systemState = {
      shouldProcessEvents: () => true,
      shouldProcessEventsForToken: undefined,
      debug: jest.fn(),
    };

    visibilityState = {
      markTokenChangedWithSpatialOptimization,
      markTokenChangedImmediate: jest.fn(),
      markAllTokensChangedImmediate: jest.fn(),
      recalculateForTokens: jest.fn(),
    };

    spatialAnalyzer = {
      getAffectedTokens: jest.fn(() => []),
    };

    exclusionManager = {
      isExcludedToken: () => false,
    };

    overrideValidationManager = {
      queueOverrideValidation,
      processQueuedValidations,
    };

    positionManager = {
      storeUpdatedTokenDoc,
      pinTokenDestination,
      pinPosition: jest.fn(),
      clearUpdatedTokenDocsCache: jest.fn(),
      getPinDurationMs: () => 500,
    };

    cacheManager = {
      getGlobalVisibilityCache: () => null,
      clearLosCache: jest.fn(),
      clearVisibilityCache: jest.fn(),
    };

    batchOrchestrator = {
      notifyTokenMovementStart,
    };

    handler = new TokenEventHandler(
      systemState,
      visibilityState,
      spatialAnalyzer,
      exclusionManager,
      overrideValidationManager,
      positionManager,
      cacheManager,
      batchOrchestrator,
    );
  });

  afterEach(() => {
    clearPendingTokenMovementPosition('token-1');
    jest.useRealTimers();
  });

  function makeTokenDoc(overrides = {}) {
    return {
      id: 'token-1',
      name: 'TestToken',
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      elevation: 0,
      hidden: false,
      light: { enabled: false, bright: 0, dim: 0 },
      object: {
        _animation: null,
        _dragHandle: null,
        actor: { id: 'actor-1' },
        ...overrides.object,
      },
      getFlag: jest.fn(() => null),
      ...overrides,
    };
  }

  test('position change with null _animation should NOT be treated as animating', () => {
    const tokenDoc = makeTokenDoc({
      object: { _animation: null, _dragHandle: null, actor: { id: 'actor-1' } },
    });

    handler.handleTokenUpdate(tokenDoc, { x: 100, y: 100 });

    expect(markTokenChangedWithSpatialOptimization).toHaveBeenCalled();
  });

  test('position change with undefined _animation should NOT be treated as animating', () => {
    const tokenDoc = makeTokenDoc({
      object: { _dragHandle: null, actor: { id: 'actor-1' } },
    });

    handler.handleTokenUpdate(tokenDoc, { x: 100, y: 100 });

    expect(markTokenChangedWithSpatialOptimization).toHaveBeenCalled();
  });

  test('position change with active animation and promise should wait for animation', () => {
    let resolveAnimation;
    const animationPromise = new Promise((resolve) => {
      resolveAnimation = resolve;
    });

    const tokenDoc = makeTokenDoc({
      object: {
        _animation: { state: 'running', promise: animationPromise },
        _dragHandle: null,
        actor: { id: 'actor-1' },
      },
    });

    global.canvas.tokens.get = jest.fn(() => ({
      document: tokenDoc,
    }));

    handler.handleTokenUpdate(tokenDoc, { x: 100, y: 100 });

    expect(markTokenChangedWithSpatialOptimization).not.toHaveBeenCalled();
    expect(notifyTokenMovementStart).toHaveBeenCalled();
    expect(storeUpdatedTokenDoc).toHaveBeenCalled();
    expect(pinTokenDestination).not.toHaveBeenCalled();
  });

  test('position change with active public animation and promise should wait for animation', () => {
    const animationPromise = new Promise(() => {});

    const tokenDoc = makeTokenDoc({
      object: {
        animation: { state: 'running', promise: animationPromise },
        _animation: null,
        _dragHandle: null,
        actor: { id: 'actor-1' },
      },
    });

    global.canvas.tokens.get = jest.fn(() => ({
      document: tokenDoc,
    }));

    handler.handleTokenUpdate(tokenDoc, { x: 100, y: 100 });

    expect(markTokenChangedWithSpatialOptimization).not.toHaveBeenCalled();
    expect(notifyTokenMovementStart).toHaveBeenCalled();
    expect(storeUpdatedTokenDoc).toHaveBeenCalled();
  });

  test('position change with completed animation should process normally', () => {
    const tokenDoc = makeTokenDoc({
      object: {
        _animation: { state: 'completed' },
        _dragHandle: null,
        actor: { id: 'actor-1' },
      },
    });

    handler.handleTokenUpdate(tokenDoc, { x: 100, y: 100 });

    expect(markTokenChangedWithSpatialOptimization).toHaveBeenCalled();
  });

  test('position update delegates movement invalidation without directly queuing override validation', async () => {
    const invalidationCoordinator = { invalidate: jest.fn(() => true) };
    handler = new TokenEventHandler(
      systemState,
      visibilityState,
      spatialAnalyzer,
      exclusionManager,
      overrideValidationManager,
      positionManager,
      cacheManager,
      batchOrchestrator,
      invalidationCoordinator,
    );
    const tokenDoc = makeTokenDoc({
      object: {
        _animation: { state: 'completed' },
        _dragHandle: null,
        actor: { id: 'actor-1' },
      },
    });
    const changes = { x: 100, y: 100 };
    const options = { diff: true };

    handler.handleTokenUpdate(tokenDoc, changes, options, 'user-1');
    await Promise.resolve();
    await Promise.resolve();

    expect(invalidationCoordinator.invalidate).toHaveBeenCalledWith({
      reason: 'token-position-updated',
      document: tokenDoc,
      changeData: changes,
      options,
      userId: 'user-1',
    });
    expect(queueOverrideValidation).not.toHaveBeenCalled();
  });

  test('position update for v14 token light without enabled flag emits token light movement invalidation', () => {
    const invalidationCoordinator = { invalidate: jest.fn(() => true) };
    handler = new TokenEventHandler(
      systemState,
      visibilityState,
      spatialAnalyzer,
      exclusionManager,
      overrideValidationManager,
      positionManager,
      cacheManager,
      batchOrchestrator,
      invalidationCoordinator,
    );
    const tokenDoc = makeTokenDoc({
      light: { bright: 20, dim: 40 },
      object: {
        _animation: { state: 'completed' },
        _dragHandle: null,
        actor: { id: 'actor-1' },
      },
    });
    const changes = { x: 100, y: 100 };

    handler.handleTokenUpdate(tokenDoc, changes, {}, 'user-1');

    expect(invalidationCoordinator.invalidate).toHaveBeenCalledWith({
      reason: 'token-light-emitter-moved',
      document: tokenDoc,
      changeData: changes,
      options: {},
      userId: 'user-1',
    });
  });

  test('position update for explicitly disabled token light does not emit token light movement invalidation', () => {
    const invalidationCoordinator = { invalidate: jest.fn(() => true) };
    handler = new TokenEventHandler(
      systemState,
      visibilityState,
      spatialAnalyzer,
      exclusionManager,
      overrideValidationManager,
      positionManager,
      cacheManager,
      batchOrchestrator,
      invalidationCoordinator,
    );
    const tokenDoc = makeTokenDoc({
      light: { enabled: false, bright: 20, dim: 40 },
      object: {
        _animation: { state: 'completed' },
        _dragHandle: null,
        actor: { id: 'actor-1' },
      },
    });

    handler.handleTokenUpdate(tokenDoc, { x: 100, y: 100 }, {}, 'user-1');

    expect(
      invalidationCoordinator.invalidate.mock.calls.some(
        ([change]) => change.reason === 'token-light-emitter-moved',
      ),
    ).toBe(false);
  });

  test('position change while dragging should defer processing', () => {
    const tokenDoc = makeTokenDoc({
      object: {
        _animation: null,
        _dragHandle: {},
        actor: { id: 'actor-1' },
      },
    });

    handler.handleTokenUpdate(tokenDoc, { x: 100, y: 100 });

    expect(markTokenChangedWithSpatialOptimization).not.toHaveBeenCalled();
    expect(notifyTokenMovementStart).toHaveBeenCalled();
  });

  test('hidden sneaking movement delegates override validation without recalculating visibility', () => {
    const invalidationCoordinator = { invalidate: jest.fn(() => true) };
    handler = new TokenEventHandler(
      systemState,
      visibilityState,
      spatialAnalyzer,
      exclusionManager,
      overrideValidationManager,
      positionManager,
      cacheManager,
      batchOrchestrator,
      invalidationCoordinator,
    );
    const hiddenToken = {
      document: {
        id: 'token-1',
        getFlag: jest.fn(() => true),
      },
    };
    global.canvas.tokens.get = jest.fn(() => hiddenToken);
    const tokenDoc = makeTokenDoc({
      hidden: true,
      object: {
        _animation: { state: 'completed' },
        _dragHandle: null,
        actor: { id: 'actor-1' },
      },
    });
    const changes = { x: 100, y: 100 };

    handler.handleTokenUpdate(tokenDoc, changes, {}, 'user-1');

    expect(invalidationCoordinator.invalidate).toHaveBeenCalledWith({
      reason: 'token-movement-override-validation-required',
      document: hiddenToken,
      changeData: changes,
      options: {},
      userId: 'user-1',
    });
    expect(markTokenChangedWithSpatialOptimization).not.toHaveBeenCalled();
    expect(queueOverrideValidation).not.toHaveBeenCalled();
  });

  test('excluded sneaking movement delegates override validation without recalculating visibility', () => {
    const invalidationCoordinator = { invalidate: jest.fn(() => true) };
    exclusionManager.isExcludedToken = jest.fn(() => true);
    handler = new TokenEventHandler(
      systemState,
      visibilityState,
      spatialAnalyzer,
      exclusionManager,
      overrideValidationManager,
      positionManager,
      cacheManager,
      batchOrchestrator,
      invalidationCoordinator,
    );
    const excludedToken = {
      document: {
        id: 'token-1',
        getFlag: jest.fn(() => true),
      },
    };
    global.canvas.tokens.get = jest.fn(() => excludedToken);
    const tokenDoc = makeTokenDoc({
      object: {
        _animation: { state: 'completed' },
        _dragHandle: null,
        actor: { id: 'actor-1' },
      },
    });
    const changes = { x: 100, y: 100 };

    handler.handleTokenUpdate(tokenDoc, changes, {}, 'user-1');

    expect(invalidationCoordinator.invalidate).toHaveBeenCalledWith({
      reason: 'token-movement-override-validation-required',
      document: excludedToken,
      changeData: changes,
      options: {},
      userId: 'user-1',
    });
    expect(markTokenChangedWithSpatialOptimization).not.toHaveBeenCalled();
    expect(queueOverrideValidation).not.toHaveBeenCalled();
  });

  test('final move waits for active animation promise before processing', async () => {
    let resolveAnimation;
    const animationPromise = new Promise((resolve) => {
      resolveAnimation = resolve;
    });

    const tokenDoc = makeTokenDoc({
      object: {
        _animation: { state: 'running', promise: animationPromise },
        _dragHandle: null,
        actor: { id: 'actor-1', items: [] },
      },
    });

    const movePromise = handler.handleMoveToken(
      tokenDoc,
      { destination: { x: 100, y: 100 }, chain: [] },
      {},
      'user-1',
    );

    await Promise.resolve();

    expect(markTokenChangedWithSpatialOptimization).not.toHaveBeenCalled();

    resolveAnimation();
    await movePromise;

    expect(markTokenChangedWithSpatialOptimization).toHaveBeenCalledWith(tokenDoc, {
      x: 100,
      y: 100,
    });
  });

  test('final move waits for active public animation promise before processing', async () => {
    let resolveAnimation;
    const animationPromise = new Promise((resolve) => {
      resolveAnimation = resolve;
    });

    const tokenDoc = makeTokenDoc({
      object: {
        animation: { state: 'running', promise: animationPromise },
        _animation: null,
        _dragHandle: null,
        actor: { id: 'actor-1', items: [] },
      },
    });

    const movePromise = handler.handleMoveToken(
      tokenDoc,
      { destination: { x: 100, y: 100 }, chain: [] },
      {},
      'user-1',
    );

    await Promise.resolve();

    expect(markTokenChangedWithSpatialOptimization).not.toHaveBeenCalled();

    resolveAnimation();
    await movePromise;

    expect(markTokenChangedWithSpatialOptimization).toHaveBeenCalledWith(tokenDoc, {
      x: 100,
      y: 100,
    });
  });

  test('final animated move waits for animation to attach before processing', async () => {
    jest.useFakeTimers();
    const invalidationCoordinator = { invalidate: jest.fn(() => true) };
    handler = new TokenEventHandler(
      systemState,
      visibilityState,
      spatialAnalyzer,
      exclusionManager,
      overrideValidationManager,
      positionManager,
      cacheManager,
      batchOrchestrator,
      invalidationCoordinator,
    );

    let resolveAnimation;
    const animationPromise = new Promise((resolve) => {
      resolveAnimation = resolve;
    });
    const tokenDoc = makeTokenDoc({
      object: {
        _animation: null,
        _dragHandle: null,
        actor: { id: 'actor-1', items: [] },
      },
    });

    const movePromise = handler.handleMoveToken(
      tokenDoc,
      { destination: { x: 100, y: 100 }, chain: [] },
      { animate: true },
      'user-1',
    );

    expect(invalidationCoordinator.invalidate).not.toHaveBeenCalled();
    expect(notifyTokenMovementStart).toHaveBeenCalled();
    expect(storeUpdatedTokenDoc).toHaveBeenCalledWith('token-1', {
      id: 'token-1',
      x: 100,
      y: 100,
      width: 1,
      height: 1,
      name: 'TestToken',
      elevation: 0,
    });

    tokenDoc.object._animation = { state: 'running', promise: animationPromise };
    await jest.advanceTimersByTimeAsync(0);
    await Promise.resolve();

    expect(invalidationCoordinator.invalidate).not.toHaveBeenCalled();

    resolveAnimation();
    await movePromise;
    jest.useRealTimers();

    expect(invalidationCoordinator.invalidate).toHaveBeenCalledWith({
      reason: 'token-movement-completed',
      document: tokenDoc,
      changeData: { x: 100, y: 100 },
      options: { animate: true },
      userId: 'user-1',
    });
  });

  test('final animated move still processes when no animation attaches', async () => {
    jest.useFakeTimers();
    const invalidationCoordinator = { invalidate: jest.fn(() => true) };
    handler = new TokenEventHandler(
      systemState,
      visibilityState,
      spatialAnalyzer,
      exclusionManager,
      overrideValidationManager,
      positionManager,
      cacheManager,
      batchOrchestrator,
      invalidationCoordinator,
    );
    const tokenDoc = makeTokenDoc({
      object: {
        _animation: null,
        _dragHandle: null,
        actor: { id: 'actor-1', items: [] },
      },
    });

    const movePromise = handler.handleMoveToken(
      tokenDoc,
      { destination: { x: 100, y: 100 }, chain: [] },
      { animate: true },
      'user-1',
    );

    expect(invalidationCoordinator.invalidate).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(150);
    await movePromise;
    jest.useRealTimers();

    expect(invalidationCoordinator.invalidate).toHaveBeenCalledWith({
      reason: 'token-movement-completed',
      document: tokenDoc,
      changeData: { x: 100, y: 100 },
      options: { animate: true },
      userId: 'user-1',
    });
  });

  test('final move does not finalize while token visual has not reached destination', async () => {
    jest.useFakeTimers();
    const invalidationCoordinator = { invalidate: jest.fn(() => true) };
    handler = new TokenEventHandler(
      systemState,
      visibilityState,
      spatialAnalyzer,
      exclusionManager,
      overrideValidationManager,
      positionManager,
      cacheManager,
      batchOrchestrator,
      invalidationCoordinator,
    );
    const tokenDoc = makeTokenDoc({
      object: {
        x: 0,
        y: 0,
        _animation: null,
        _dragHandle: null,
        actor: { id: 'actor-1', items: [] },
      },
    });
    global.canvas.tokens.get = jest.fn(() => ({
      document: tokenDoc,
    }));

    const result = await handler._finalizeCompletedMovement(
      tokenDoc,
      { x: 100, y: 100 },
      { options: {}, userId: 'user-1' },
    );

    expect(result).toBe(false);
    await jest.advanceTimersByTimeAsync(300);
    expect(invalidationCoordinator.invalidate).not.toHaveBeenCalled();

    jest.useRealTimers();
  });

  test('final move waits for visual destination after animation promise resolves early', async () => {
    jest.useFakeTimers();
    const invalidationCoordinator = { invalidate: jest.fn(() => true) };
    handler = new TokenEventHandler(
      systemState,
      visibilityState,
      spatialAnalyzer,
      exclusionManager,
      overrideValidationManager,
      positionManager,
      cacheManager,
      batchOrchestrator,
      invalidationCoordinator,
    );
    let resolveAnimation;
    const animationPromise = new Promise((resolve) => {
      resolveAnimation = resolve;
    });
    const tokenDoc = makeTokenDoc({
      object: {
        x: 0,
        y: 0,
        _animation: { state: 'running', promise: animationPromise },
        _dragHandle: null,
        actor: { id: 'actor-1', items: [] },
      },
    });
    global.canvas.tokens.get = jest.fn(() => ({
      document: tokenDoc,
    }));

    const result = await handler._finalizeCompletedMovement(
      tokenDoc,
      { x: 100, y: 100 },
      { options: {}, userId: 'user-1' },
    );

    expect(result).toBe(false);
    resolveAnimation();
    await animationPromise;
    await jest.advanceTimersByTimeAsync(300);
    expect(invalidationCoordinator.invalidate).not.toHaveBeenCalled();

    tokenDoc.object.x = 100;
    tokenDoc.object.y = 100;
    tokenDoc.object._animation = { state: 'completed' };
    await jest.advanceTimersByTimeAsync(50);

    expect(invalidationCoordinator.invalidate).toHaveBeenCalledWith({
      reason: 'token-movement-completed',
      document: tokenDoc,
      changeData: { x: 100, y: 100 },
      options: {},
      userId: 'user-1',
    });

    jest.useRealTimers();
  });

  test('move hook without explicit destination does not finalize at current token position', async () => {
    const invalidationCoordinator = { invalidate: jest.fn(() => true) };
    handler = new TokenEventHandler(
      systemState,
      visibilityState,
      spatialAnalyzer,
      exclusionManager,
      overrideValidationManager,
      positionManager,
      cacheManager,
      batchOrchestrator,
      invalidationCoordinator,
    );
    const tokenDoc = makeTokenDoc({
      x: 4200,
      y: 2600,
      object: {
        _animation: null,
        _dragHandle: null,
        actor: { id: 'actor-1', items: [] },
      },
    });

    await handler.handleMoveToken(
      tokenDoc,
      { chain: [] },
      { method: 'dragging', _movement: { 'token-1': { passed: { waypoints: [] } } } },
      'user-1',
    );

    expect(notifyTokenMovementStart).toHaveBeenCalledWith('token-1');
    expect(invalidationCoordinator.invalidate).not.toHaveBeenCalled();
    expect(markTokenChangedWithSpatialOptimization).not.toHaveBeenCalled();
  });

  test('move hook skips finalization while PendingMovement owns the token animation', async () => {
    const invalidationCoordinator = { invalidate: jest.fn(() => true) };
    handler = new TokenEventHandler(
      systemState,
      visibilityState,
      spatialAnalyzer,
      exclusionManager,
      overrideValidationManager,
      positionManager,
      cacheManager,
      batchOrchestrator,
      invalidationCoordinator,
    );
    const tokenDoc = makeTokenDoc({
      object: {
        _animation: null,
        _dragHandle: null,
        actor: { id: 'actor-1', items: [] },
      },
    });
    tokenDoc.object.document = tokenDoc;

    expect(
      setPendingTokenMovementPosition(tokenDoc, { x: 700, y: 700 }, [tokenDoc.object], {
        userId: global.game.user.id,
      }),
    ).toBe(true);

    await handler.handleMoveToken(
      tokenDoc,
      { destination: { x: 700, y: 700 }, chain: [] },
      { method: 'dragging', _movement: { 'token-1': { passed: { waypoints: [] } } } },
      'user-1',
    );

    expect(invalidationCoordinator.invalidate).not.toHaveBeenCalled();
    expect(notifyTokenMovementStart).not.toHaveBeenCalled();
  });

  test('dragging update waits for late-attached animation instead of fallback finalizing mid-move', async () => {
    jest.useFakeTimers();
    const invalidationCoordinator = { invalidate: jest.fn(() => true) };
    handler = new TokenEventHandler(
      systemState,
      visibilityState,
      spatialAnalyzer,
      exclusionManager,
      overrideValidationManager,
      positionManager,
      cacheManager,
      batchOrchestrator,
      invalidationCoordinator,
    );
    let resolveAnimation;
    const animationPromise = new Promise((resolve) => {
      resolveAnimation = resolve;
    });
    const tokenDoc = makeTokenDoc({
      object: {
        _animation: null,
        _dragHandle: null,
        actor: { id: 'actor-1', items: [] },
      },
    });
    global.canvas.tokens.get = jest.fn(() => ({
      document: tokenDoc,
    }));

    handler.handleTokenUpdate(
      tokenDoc,
      { x: 700, y: 700 },
      { method: 'dragging' },
      'user-1',
    );

    tokenDoc.object._animation = { state: 'running', promise: animationPromise };
    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(2000);

    expect(invalidationCoordinator.invalidate).not.toHaveBeenCalled();

    resolveAnimation();
    for (let i = 0; i < 8; i += 1) {
      await Promise.resolve();
    }
    jest.useRealTimers();

    expect(invalidationCoordinator.invalidate).toHaveBeenCalledTimes(1);
    expect(invalidationCoordinator.invalidate).toHaveBeenCalledWith({
      reason: 'token-movement-completed',
      document: tokenDoc,
      changeData: { x: 700, y: 700 },
      options: { method: 'dragging' },
      userId: 'user-1',
    });
  });

  test('animated position update waits for late-attached animation without dragging method', async () => {
    jest.useFakeTimers();
    const invalidationCoordinator = { invalidate: jest.fn(() => true) };
    handler = new TokenEventHandler(
      systemState,
      visibilityState,
      spatialAnalyzer,
      exclusionManager,
      overrideValidationManager,
      positionManager,
      cacheManager,
      batchOrchestrator,
      invalidationCoordinator,
    );
    let resolveAnimation;
    const animationPromise = new Promise((resolve) => {
      resolveAnimation = resolve;
    });
    const tokenDoc = makeTokenDoc({
      object: {
        _animation: null,
        _dragHandle: null,
        actor: { id: 'actor-1', items: [] },
      },
    });
    global.canvas.tokens.get = jest.fn(() => ({
      document: tokenDoc,
    }));

    handler.handleTokenUpdate(tokenDoc, { x: 900, y: 500 }, { animate: true }, 'user-1');

    tokenDoc.object._animation = { state: 'running', promise: animationPromise };
    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(2000);

    expect(invalidationCoordinator.invalidate).not.toHaveBeenCalled();

    resolveAnimation();
    for (let i = 0; i < 8; i += 1) {
      await Promise.resolve();
    }
    jest.useRealTimers();

    expect(invalidationCoordinator.invalidate).toHaveBeenCalledTimes(1);
    expect(invalidationCoordinator.invalidate).toHaveBeenCalledWith({
      reason: 'token-movement-completed',
      document: tokenDoc,
      changeData: { x: 900, y: 500 },
      options: { animate: true },
      userId: 'user-1',
    });
  });

  test('final move delegates completed movement invalidation without directly queuing override validation', async () => {
    const invalidationCoordinator = { invalidate: jest.fn(() => true) };
    handler = new TokenEventHandler(
      systemState,
      visibilityState,
      spatialAnalyzer,
      exclusionManager,
      overrideValidationManager,
      positionManager,
      cacheManager,
      batchOrchestrator,
      invalidationCoordinator,
    );
    const tokenDoc = makeTokenDoc({
      object: {
        _animation: null,
        _dragHandle: null,
        actor: { id: 'actor-1', items: [] },
      },
    });

    await handler.handleMoveToken(
      tokenDoc,
      { destination: { x: 100, y: 100 }, chain: [] },
      { animate: false },
      'user-1',
    );

    expect(invalidationCoordinator.invalidate).toHaveBeenCalledWith({
      reason: 'token-movement-completed',
      document: tokenDoc,
      changeData: { x: 100, y: 100 },
      options: { animate: false },
      userId: 'user-1',
    });
    expect(queueOverrideValidation).not.toHaveBeenCalled();
  });

  test('final move skips only recently handled duplicate destination', async () => {
    const invalidationCoordinator = { invalidate: jest.fn(() => true) };
    handler = new TokenEventHandler(
      systemState,
      visibilityState,
      spatialAnalyzer,
      exclusionManager,
      overrideValidationManager,
      positionManager,
      cacheManager,
      batchOrchestrator,
      invalidationCoordinator,
    );
    const tokenDoc = makeTokenDoc({
      object: {
        _animation: null,
        _dragHandle: null,
        actor: { id: 'actor-1', items: [] },
      },
    });

    handler._markAnimatedMoveHandledRecently('token-1', { x: 100, y: 100 });
    await handler.handleMoveToken(
      tokenDoc,
      { destination: { x: 100, y: 100 }, chain: [] },
      { animate: true },
      'user-1',
    );

    expect(invalidationCoordinator.invalidate).not.toHaveBeenCalled();
  });

  test('final move processes recently handled token when destination changes', async () => {
    const invalidationCoordinator = { invalidate: jest.fn(() => true) };
    handler = new TokenEventHandler(
      systemState,
      visibilityState,
      spatialAnalyzer,
      exclusionManager,
      overrideValidationManager,
      positionManager,
      cacheManager,
      batchOrchestrator,
      invalidationCoordinator,
    );
    const tokenDoc = makeTokenDoc({
      object: {
        _animation: null,
        _dragHandle: null,
        actor: { id: 'actor-1', items: [] },
      },
    });

    handler._markAnimatedMoveHandledRecently('token-1', { x: 100, y: 100 });
    await handler.handleMoveToken(
      tokenDoc,
      { destination: { x: 200, y: 100 }, chain: [] },
      { animate: false },
      'user-1',
    );

    expect(invalidationCoordinator.invalidate).toHaveBeenCalledWith({
      reason: 'token-movement-completed',
      document: tokenDoc,
      changeData: { x: 200, y: 100 },
      options: { animate: false },
      userId: 'user-1',
    });
  });

  test('final move stores destination coordinates before completed movement invalidation', async () => {
    const invalidationCoordinator = { invalidate: jest.fn(() => true) };
    handler = new TokenEventHandler(
      systemState,
      visibilityState,
      spatialAnalyzer,
      exclusionManager,
      overrideValidationManager,
      positionManager,
      cacheManager,
      batchOrchestrator,
      invalidationCoordinator,
    );
    const tokenDoc = makeTokenDoc({
      width: 2,
      height: 3,
      elevation: 7,
      object: {
        _animation: null,
        _dragHandle: null,
        actor: { id: 'actor-1', items: [] },
      },
    });

    await handler.handleMoveToken(
      tokenDoc,
      { destination: { x: 250, y: 300 }, chain: [] },
      { animate: false },
      'user-1',
    );

    expect(storeUpdatedTokenDoc).toHaveBeenCalledWith('token-1', {
      id: 'token-1',
      x: 250,
      y: 300,
      width: 2,
      height: 3,
      name: 'TestToken',
      elevation: 7,
    });
    expect(storeUpdatedTokenDoc.mock.invocationCallOrder[0]).toBeLessThan(
      invalidationCoordinator.invalidate.mock.invocationCallOrder[0],
    );
  });

  test('final move defers while v13 movement tween is pending even though token doc is already at destination', async () => {
    jest.useFakeTimers();
    const invalidationCoordinator = { invalidate: jest.fn(() => true) };
    handler = new TokenEventHandler(
      systemState,
      visibilityState,
      spatialAnalyzer,
      exclusionManager,
      overrideValidationManager,
      positionManager,
      cacheManager,
      batchOrchestrator,
      invalidationCoordinator,
    );

    let resolveMovement;
    const movementAnimationPromise = new Promise((resolve) => {
      resolveMovement = resolve;
    });

    const tokenDoc = makeTokenDoc({
      object: {
        x: 100,
        y: 100,
        _animation: null,
        _dragHandle: null,
        movementAnimationPromise,
        actor: { id: 'actor-1', items: [] },
      },
    });
    global.canvas.tokens.get = jest.fn(() => ({ document: tokenDoc }));

    const result = await handler._finalizeCompletedMovement(
      tokenDoc,
      { x: 100, y: 100 },
      { options: {}, userId: 'user-1' },
    );

    expect(result).toBe(false);
    await jest.advanceTimersByTimeAsync(300);
    expect(invalidationCoordinator.invalidate).not.toHaveBeenCalled();

    tokenDoc.object.movementAnimationPromise = null;
    resolveMovement();
    await movementAnimationPromise;
    await jest.advanceTimersByTimeAsync(50);
    for (let i = 0; i < 8; i += 1) {
      await Promise.resolve();
    }

    expect(invalidationCoordinator.invalidate).toHaveBeenCalledWith({
      reason: 'token-movement-completed',
      document: tokenDoc,
      changeData: { x: 100, y: 100 },
      options: {},
      userId: 'user-1',
    });

    jest.useRealTimers();
  });

  test('final move does not process early when updateToken already deferred to animation completion', async () => {
    let resolveAnimation;
    const animationPromise = new Promise((resolve) => {
      resolveAnimation = resolve;
    });

    const tokenDoc = makeTokenDoc({
      object: {
        _animation: { state: 'running', promise: animationPromise },
        _dragHandle: null,
        actor: { id: 'actor-1', items: [] },
      },
    });

    global.canvas.tokens.get = jest.fn(() => ({
      document: tokenDoc,
    }));

    handler.handleTokenUpdate(tokenDoc, { x: 100, y: 100 });

    const movePromise = handler.handleMoveToken(
      tokenDoc,
      { destination: { x: 100, y: 100 }, chain: [] },
      {},
      'user-1',
    );

    await Promise.resolve();

    expect(markTokenChangedWithSpatialOptimization).not.toHaveBeenCalled();

    resolveAnimation();
    await animationPromise;
    await movePromise;
    await Promise.resolve();

    expect(markTokenChangedWithSpatialOptimization).toHaveBeenCalledTimes(1);
    expect(markTokenChangedWithSpatialOptimization).toHaveBeenCalledWith(tokenDoc, {
      x: 100,
      y: 100,
    });
    expect(queueOverrideValidation).toHaveBeenCalledWith('token-1');
  });

});
