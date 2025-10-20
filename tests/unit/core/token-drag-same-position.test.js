import { TokenEventHandler } from '../../../scripts/visibility/auto-visibility/core/TokenEventHandler.js';
import '../../setup.js';

describe('TokenEventHandler - Drag to Same Position', () => {
  let tokenHandler;
  let mockSystemState;
  let mockVisibilityState;
  let mockSpatialAnalyzer;
  let mockExclusionManager;
  let mockOverrideValidationManager;
  let mockPositionManager;
  let mockCacheManager;
  let mockBatchOrchestrator;

  beforeEach(() => {
    mockSystemState = {
      shouldProcessEvents: jest.fn(() => true),
      debug: jest.fn(),
    };

    mockVisibilityState = {
      markTokenChangedImmediate: jest.fn(),
      markAllTokensChangedImmediate: jest.fn(),
      markTokenChangedWithSpatialOptimization: jest.fn(),
      recalculateForTokens: jest.fn(),
      removeChangedToken: jest.fn(),
    };

    mockSpatialAnalyzer = {
      tokenEmitsLight: jest.fn(() => false),
    };

    mockExclusionManager = {
      isExcludedToken: jest.fn(() => false),
    };

    mockOverrideValidationManager = {
      queueOverrideValidation: jest.fn(),
      processQueuedValidations: jest.fn().mockResolvedValue(undefined),
    };

    mockPositionManager = {
      storeUpdatedTokenDoc: jest.fn(),
      pinPosition: jest.fn(),
      pinTokenDestination: jest.fn(),
      clearTokenPositionData: jest.fn(),
      getPinDurationMs: jest.fn(() => 2000),
    };

    mockCacheManager = {
      clearAllCaches: jest.fn(),
    };

    mockBatchOrchestrator = {
      notifyTokenMovementStart: jest.fn(),
    };

    global.canvas = {
      tokens: {
        placeables: [],
        get: jest.fn(() => null),
      },
      grid: {
        size: 100,
      },
    };

    global.game = {
      pf2eVisioner: {},
    };

    tokenHandler = new TokenEventHandler(
      mockSystemState,
      mockVisibilityState,
      mockSpatialAnalyzer,
      mockExclusionManager,
      mockOverrideValidationManager,
      mockPositionManager,
      mockCacheManager,
      mockBatchOrchestrator,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should clear cached positions when token dragged to same position', () => {
    const tokenDoc = {
      id: 'token1',
      name: 'Test Token',
      x: 100,
      y: 200,
      width: 1,
      height: 1,
      hidden: false,
      object: {
        _animation: { state: 'completed' },
      },
    };

    const changes = {
      x: 100,
      y: 200,
    };

    tokenHandler.handleTokenUpdate(tokenDoc, changes);

    expect(mockPositionManager.clearTokenPositionData).toHaveBeenCalledWith('token1');
    expect(mockSystemState.debug).toHaveBeenCalledWith(
      'token-drag-same-position',
      'token1',
      'cleared cached positions',
    );
    expect(mockPositionManager.storeUpdatedTokenDoc).not.toHaveBeenCalled();
    expect(mockPositionManager.pinPosition).not.toHaveBeenCalled();
    expect(mockVisibilityState.markTokenChangedWithSpatialOptimization).not.toHaveBeenCalled();
  });

  test('should process normally when token moved to different position', () => {
    const tokenDoc = {
      id: 'token1',
      name: 'Test Token',
      x: 100,
      y: 200,
      width: 1,
      height: 1,
      elevation: 0,
      hidden: false,
      object: {
        _animation: { state: 'completed' },
      },
    };

    const changes = {
      x: 200,
      y: 300,
    };

    tokenHandler.handleTokenUpdate(tokenDoc, changes);

    expect(mockPositionManager.clearTokenPositionData).not.toHaveBeenCalled();
    expect(mockPositionManager.storeUpdatedTokenDoc).toHaveBeenCalledWith('token1', {
      id: 'token1',
      x: 200,
      y: 300,
      width: 1,
      height: 1,
      name: 'Test Token',
    });
    expect(mockPositionManager.pinPosition).toHaveBeenCalled();
    expect(mockVisibilityState.markTokenChangedWithSpatialOptimization).toHaveBeenCalled();
  });

  test('should clear cached positions when x changed but returned to same value', () => {
    const tokenDoc = {
      id: 'token1',
      name: 'Test Token',
      x: 150,
      y: 250,
      width: 1,
      height: 1,
      hidden: false,
      object: {
        _animation: { state: 'completed' },
      },
    };

    const changes = {
      x: 150,
    };

    tokenHandler.handleTokenUpdate(tokenDoc, changes);

    expect(mockPositionManager.clearTokenPositionData).toHaveBeenCalledWith('token1');
    expect(mockSystemState.debug).toHaveBeenCalledWith(
      'token-drag-same-position',
      'token1',
      'cleared cached positions',
    );
  });

  test('should clear cached positions when y changed but returned to same value', () => {
    const tokenDoc = {
      id: 'token1',
      name: 'Test Token',
      x: 150,
      y: 250,
      width: 1,
      height: 1,
      hidden: false,
      object: {
        _animation: { state: 'completed' },
      },
    };

    const changes = {
      y: 250,
    };

    tokenHandler.handleTokenUpdate(tokenDoc, changes);

    expect(mockPositionManager.clearTokenPositionData).toHaveBeenCalledWith('token1');
    expect(mockSystemState.debug).toHaveBeenCalledWith(
      'token-drag-same-position',
      'token1',
      'cleared cached positions',
    );
  });

  test('should not interfere with dragging state detection', () => {
    const tokenDoc = {
      id: 'token1',
      name: 'Test Token',
      x: 100,
      y: 200,
      width: 1,
      height: 1,
      hidden: false,
      object: {
        _animation: { state: 'completed' },
        _dragHandle: {},
      },
    };

    const changes = {
      x: 100,
      y: 200,
    };

    tokenHandler.handleTokenUpdate(tokenDoc, changes);

    expect(mockPositionManager.clearTokenPositionData).not.toHaveBeenCalled();
  });

  test('should not interfere with animation state detection', () => {
    const tokenDoc = {
      id: 'token1',
      name: 'Test Token',
      x: 100,
      y: 200,
      width: 1,
      height: 1,
      hidden: false,
      object: {
        _animation: {
          state: 'active',
          promise: Promise.resolve(),
        },
      },
    };

    const changes = {
      x: 100,
      y: 200,
    };

    tokenHandler.handleTokenUpdate(tokenDoc, changes);

    expect(mockPositionManager.clearTokenPositionData).not.toHaveBeenCalled();
  });
});
