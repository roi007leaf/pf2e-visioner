export function buildBatchPreflightPlan({
  sceneAvsDisabled = false,
  isTokenMoving = false,
  animatingChangedTokenIds = [],
  hasVisibleChangedTokens = true,
} = {}) {
  if (sceneAvsDisabled) {
    return {
      shouldProcess: false,
      shouldClearPendingTokens: true,
      shouldQueueChangedTokens: false,
      shouldNotifyMovementStart: false,
      logKind: 'skipped',
      reason: 'avs-disabled-for-scene',
      animatingTokenIds: [],
    };
  }

  if (isTokenMoving) {
    return {
      shouldProcess: false,
      shouldClearPendingTokens: false,
      shouldQueueChangedTokens: true,
      shouldNotifyMovementStart: false,
      logKind: 'deferred',
      reason: 'tokens-still-moving',
      animatingTokenIds: [],
    };
  }

  if (animatingChangedTokenIds.length > 0) {
    return {
      shouldProcess: false,
      shouldClearPendingTokens: false,
      shouldQueueChangedTokens: true,
      shouldNotifyMovementStart: true,
      logKind: 'deferred',
      reason: 'changed-token-animation-still-active',
      animatingTokenIds: [...animatingChangedTokenIds],
    };
  }

  if (!hasVisibleChangedTokens) {
    return {
      shouldProcess: false,
      shouldClearPendingTokens: false,
      shouldQueueChangedTokens: false,
      shouldNotifyMovementStart: false,
      logKind: 'skipped',
      reason: 'changed-tokens-outside-viewport',
      animatingTokenIds: [],
    };
  }

  return {
    shouldProcess: true,
    shouldClearPendingTokens: false,
    shouldQueueChangedTokens: false,
    shouldNotifyMovementStart: false,
    logKind: null,
    reason: 'ready',
    animatingTokenIds: [],
  };
}
