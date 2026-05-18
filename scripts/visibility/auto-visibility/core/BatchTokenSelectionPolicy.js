export function isMovementVisibilityBatch({
  changedTokens = new Set(),
  movementSession = null,
  lastMovedTokenId = null,
} = {}) {
  return !!movementSession || (!!lastMovedTokenId && changedTokens.has(lastMovedTokenId));
}

export function resolveVisibleBatchTokens({
  changedTokens = new Set(),
  candidateTokens = [],
  exclusionManager = null,
} = {}) {
  const allTokens = [];
  const visibleIdSet = new Set();

  for (const token of candidateTokens || []) {
    if (exclusionManager?.isExcludedToken?.(token)) continue;

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
