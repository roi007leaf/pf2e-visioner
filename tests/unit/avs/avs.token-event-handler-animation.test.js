import '../../setup.js';
import { TokenEventHandler } from '../../../scripts/visibility/auto-visibility/core/TokenEventHandler.js';

describe('TokenEventHandler - animation detection on position change', () => {
  let handler;
  let markTokenChangedWithSpatialOptimization;
  let notifyTokenMovementStart;
  let storeUpdatedTokenDoc;
  let pinTokenDestination;

  beforeEach(() => {
    markTokenChangedWithSpatialOptimization = jest.fn();
    notifyTokenMovementStart = jest.fn();
    storeUpdatedTokenDoc = jest.fn();
    pinTokenDestination = jest.fn();

    const systemState = {
      shouldProcessEvents: () => true,
      shouldProcessEventsForToken: undefined,
      debug: jest.fn(),
    };

    const visibilityState = {
      markTokenChangedWithSpatialOptimization,
      markTokenChangedImmediate: jest.fn(),
      markAllTokensChangedImmediate: jest.fn(),
      recalculateForTokens: jest.fn(),
    };

    const spatialAnalyzer = {
      getAffectedTokens: jest.fn(() => []),
    };

    const exclusionManager = {
      isExcludedToken: () => false,
    };

    const overrideValidationManager = {
      queueOverrideValidation: jest.fn(),
      processQueuedValidations: jest.fn(() => Promise.resolve()),
    };

    const positionManager = {
      storeUpdatedTokenDoc,
      pinTokenDestination,
      pinPosition: jest.fn(),
      clearUpdatedTokenDocsCache: jest.fn(),
      getPinDurationMs: () => 500,
    };

    const cacheManager = {
      getGlobalVisibilityCache: () => null,
      clearLosCache: jest.fn(),
      clearVisibilityCache: jest.fn(),
    };

    const batchOrchestrator = {
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
});
