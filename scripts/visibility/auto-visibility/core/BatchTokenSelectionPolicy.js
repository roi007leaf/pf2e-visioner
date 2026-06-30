export function isMovementVisibilityBatch({
  movementSession = null,
} = {}) {
  // lastMovedTokenId is diagnostic/runtime memory, not proof of active movement.
  // It can outlive movement and otherwise make normal batches act like movement forever.
  return !!movementSession;
}

export function shouldUseFullTokenScope({
  isMovementBatch = false,
  forceFullScope = false,
} = {}) {
  return !!isMovementBatch || !!forceFullScope;
}

export function resolveVisibleBatchTokens({
  changedTokens = new Set(),
  candidateTokens = [],
  exclusionManager = null,
} = {}) {
  const allTokens = [];
  const visibleIdSet = new Set();

  const isExcludedAsTarget = (token) =>
    exclusionManager?.isExcludedAsTarget
      ? exclusionManager.isExcludedAsTarget(token)
      : !!exclusionManager?.isExcludedToken?.(token);

  for (const token of candidateTokens || []) {
    if (isExcludedAsTarget(token)) continue;

    allTokens.push(token);
    const id = token?.document?.id;
    if (id) visibleIdSet.add(id);
  }

  const visibleChangedTokens = new Set();
  for (const id of changedTokens) {
    if (visibleIdSet.has(id)) visibleChangedTokens.add(id);
  }

  return {
    allTokens,
    visibleChangedTokens,
    hasVisibleChangedTokens: visibleChangedTokens.size > 0,
  };
}
