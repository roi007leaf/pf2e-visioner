import '../../setup.js';

describe('Take Cover movement expiration', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('expires Take Cover before queuing AVS override validation for movement', async () => {
    const requestTakeCoverExpirationForToken = jest.fn().mockResolvedValue(true);
    jest.doMock('../../../scripts/chat/services/take-cover-expiration-service.js', () => ({
      __esModule: true,
      requestTakeCoverExpirationForToken,
    }));

    const { TokenEventHandler } = await import(
      '../../../scripts/visibility/auto-visibility/core/TokenEventHandler.js'
    );

    const queueOverrideValidation = jest.fn();
    const tokenHandler = new TokenEventHandler(
      {
        shouldProcessEvents: () => true,
        shouldProcessEventsForToken: () => true,
        debug: jest.fn(),
      },
      {
        markTokenChangedWithSpatialOptimization: jest.fn(),
        markTokenChangedImmediate: jest.fn(),
        markAllTokensChangedImmediate: jest.fn(),
        recalculateForTokens: jest.fn(),
      },
      { getAffectedTokens: jest.fn(() => []) },
      { isExcludedToken: jest.fn(() => false) },
      {
        queueOverrideValidation,
        processQueuedValidations: jest.fn().mockResolvedValue(undefined),
      },
      {
        storeUpdatedTokenDoc: jest.fn(),
        pinPosition: jest.fn(),
        pinTokenDestination: jest.fn(),
        clearUpdatedTokenDocsCache: jest.fn(),
        getPinDurationMs: jest.fn(() => 500),
      },
      {
        getGlobalVisibilityCache: jest.fn(() => null),
        clearLosCache: jest.fn(),
        clearVisibilityCache: jest.fn(),
      },
      { notifyTokenMovementStart: jest.fn() },
    );
    const tokenObject = {
      id: 'token-1',
      actor: { id: 'actor-1' },
      document: {
        id: 'token-1',
        flags: {
          'pf2e-visioner': {
            'avs-override-from-observer-1': {
              source: 'take_cover_action',
              coverOnly: true,
              expectedCover: 'standard',
            },
          },
        },
      },
      _animation: { state: 'completed' },
      _dragHandle: null,
    };
    const tokenDoc = {
      id: 'token-1',
      name: 'Mover',
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      elevation: 0,
      hidden: false,
      light: { enabled: false, bright: 0, dim: 0 },
      object: tokenObject,
    };

    tokenHandler.handleTokenUpdate(tokenDoc, { x: 100, y: 100 });

    expect(queueOverrideValidation).not.toHaveBeenCalled();
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(requestTakeCoverExpirationForToken).toHaveBeenCalledWith(tokenObject, 'movement');
    expect(queueOverrideValidation).toHaveBeenCalledWith('token-1');
    expect(requestTakeCoverExpirationForToken.mock.invocationCallOrder[0]).toBeLessThan(
      queueOverrideValidation.mock.invocationCallOrder[0],
    );
  });
});
