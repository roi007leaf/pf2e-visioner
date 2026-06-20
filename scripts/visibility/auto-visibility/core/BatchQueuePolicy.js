export function buildCoalesceDrainPlan({
  pendingTokens = new Set(),
  isTokenMoving = false,
  processingBatch = false,
} = {}) {
  if (isTokenMoving) {
    return {
      shouldDrain: false,
      shouldClearPending: false,
      tokens: new Set(),
      reason: 'movement-active',
    };
  }

  if (processingBatch) {
    return {
      shouldDrain: false,
      shouldClearPending: false,
      tokens: new Set(),
      reason: 'batch-active',
    };
  }

  if (pendingTokens.size === 0) {
    return {
      shouldDrain: false,
      shouldClearPending: false,
      tokens: new Set(),
      reason: 'empty',
    };
  }

  return {
    shouldDrain: true,
    shouldClearPending: true,
    tokens: new Set(pendingTokens),
    reason: 'ready',
  };
}

export function buildProcessBatchAdmissionPlan({
  changedTokens = new Set(),
  processingBatch = false,
  movementSession = null,
} = {}) {
  if (changedTokens.size === 0) {
    return {
      shouldProcess: false,
      shouldQueue: false,
      queuedTokens: new Set(),
      pendingMovementSessionData: null,
      reason: 'empty',
    };
  }

  if (processingBatch) {
    return {
      shouldProcess: false,
      shouldQueue: true,
      queuedTokens: new Set(changedTokens),
      pendingMovementSessionData: movementSession || null,
      reason: 'batch-active',
    };
  }

  return {
    shouldProcess: true,
    shouldQueue: false,
    queuedTokens: new Set(),
    pendingMovementSessionData: null,
    reason: 'ready',
  };
}
