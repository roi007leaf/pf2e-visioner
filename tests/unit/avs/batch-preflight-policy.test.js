import { buildBatchPreflightPlan } from '../../../scripts/visibility/auto-visibility/core/BatchPreflightPolicy.js';

describe('BatchPreflightPolicy', () => {
  test('clears pending tokens when AVS is disabled for the scene', () => {
    expect(buildBatchPreflightPlan({ sceneAvsDisabled: true })).toEqual({
      shouldProcess: false,
      shouldClearPendingTokens: true,
      shouldQueueChangedTokens: false,
      shouldNotifyMovementStart: false,
      logKind: 'skipped',
      reason: 'avs-disabled-for-scene',
      animatingTokenIds: [],
    });
  });

  test('queues changed tokens while movement is active', () => {
    expect(buildBatchPreflightPlan({ isTokenMoving: true })).toEqual({
      shouldProcess: false,
      shouldClearPendingTokens: false,
      shouldQueueChangedTokens: true,
      shouldNotifyMovementStart: false,
      logKind: 'deferred',
      reason: 'tokens-still-moving',
      animatingTokenIds: [],
    });
  });

  test('queues changed tokens and starts movement watch when changed tokens are unsettled', () => {
    expect(buildBatchPreflightPlan({ animatingChangedTokenIds: ['A', 'B'] })).toEqual({
      shouldProcess: false,
      shouldClearPendingTokens: false,
      shouldQueueChangedTokens: true,
      shouldNotifyMovementStart: true,
      logKind: 'deferred',
      reason: 'changed-token-animation-still-active',
      animatingTokenIds: ['A', 'B'],
    });
  });

  test('skips without queueing when no changed tokens are visible to this client', () => {
    expect(buildBatchPreflightPlan({ hasVisibleChangedTokens: false })).toEqual({
      shouldProcess: false,
      shouldClearPendingTokens: false,
      shouldQueueChangedTokens: false,
      shouldNotifyMovementStart: false,
      logKind: 'skipped',
      reason: 'changed-tokens-outside-viewport',
      animatingTokenIds: [],
    });
  });

  test('allows processing when no preflight condition blocks the batch', () => {
    expect(buildBatchPreflightPlan()).toEqual({
      shouldProcess: true,
      shouldClearPendingTokens: false,
      shouldQueueChangedTokens: false,
      shouldNotifyMovementStart: false,
      logKind: null,
      reason: 'ready',
      animatingTokenIds: [],
    });
  });
});
