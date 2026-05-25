const PENDING_MOVEMENT_CONTROLLED_DRAG_REFRESH_DELAYS_MS = [100, 180, 260, 340, 420, 560, 760];
const PENDING_MOVEMENT_CONTROLLED_DRAG_INTENT_TTL_MS = 1200;
const PENDING_MOVEMENT_CONTROLLED_DRAG_INTENT_RELEASE_MS = 150;

const pendingControlledTokenDragIntentState = (globalThis.__pf2eVisionerPendingControlledDragIntent ??= {
  tokenIds: new Map(),
  timers: new Map(),
  refreshTimers: new Map(),
});

function defaultTokenIdOf(tokenOrDoc) {
  return tokenOrDoc?.document?.id || tokenOrDoc?.id || null;
}

function clearControlledTokenDragIntentRefreshes(tokenId) {
  const timers = pendingControlledTokenDragIntentState.refreshTimers.get(tokenId);
  if (!timers) return;

  for (const timer of timers) clearTimeout(timer);
  pendingControlledTokenDragIntentState.refreshTimers.delete(tokenId);
}

function removeControlledTokenDragIntentRefresh(tokenId, timer) {
  const timers = pendingControlledTokenDragIntentState.refreshTimers.get(tokenId);
  if (!timers) return;
  timers.delete(timer);
  if (!timers.size) pendingControlledTokenDragIntentState.refreshTimers.delete(tokenId);
}

function scheduleControlledTokenDragIntentRefreshes(
  tokenId,
  { getRefreshTargetIds, refreshTokenVisibility } = {},
) {
  if (!tokenId) return;

  clearControlledTokenDragIntentRefreshes(tokenId);
  const timers = new Set();
  pendingControlledTokenDragIntentState.refreshTimers.set(tokenId, timers);

  for (const delayMs of PENDING_MOVEMENT_CONTROLLED_DRAG_REFRESH_DELAYS_MS) {
    const timer = setTimeout(() => {
      removeControlledTokenDragIntentRefresh(tokenId, timer);
      pruneControlledTokenDragIntents();
      if (!pendingControlledTokenDragIntentState.tokenIds.has(tokenId)) return;

      const targetTokenIds = getRefreshTargetIds?.(tokenId) ?? [];
      if (!targetTokenIds.length) return;

      refreshTokenVisibility?.([tokenId], {
        ignoreObservedGrace: true,
        skipPerceptionRefresh: true,
        source: 'controlled-drag-intent',
        targetTokenIds,
      });
    }, delayMs);
    timers.add(timer);
  }
}

function pruneControlledTokenDragIntents(now = Date.now()) {
  for (const [tokenId, expiresAt] of pendingControlledTokenDragIntentState.tokenIds.entries()) {
    if (!expiresAt || expiresAt <= now) {
      pendingControlledTokenDragIntentState.tokenIds.delete(tokenId);
      const timer = pendingControlledTokenDragIntentState.timers.get(tokenId);
      if (timer) clearTimeout(timer);
      pendingControlledTokenDragIntentState.timers.delete(tokenId);
      clearControlledTokenDragIntentRefreshes(tokenId);
    }
  }
}

export function primeControlledTokenDragIntent(
  tokenOrDoc,
  {
    tokenIdOf = defaultTokenIdOf,
    getRefreshTargetIds,
    refreshTokenVisibility,
    ttlMs = PENDING_MOVEMENT_CONTROLLED_DRAG_INTENT_TTL_MS,
  } = {},
) {
  const tokenId = tokenIdOf(tokenOrDoc);
  if (!tokenId) return false;

  const existingTimer = pendingControlledTokenDragIntentState.timers.get(tokenId);
  if (existingTimer) clearTimeout(existingTimer);
  pendingControlledTokenDragIntentState.timers.delete(tokenId);
  pendingControlledTokenDragIntentState.tokenIds.set(tokenId, Date.now() + ttlMs);
  scheduleControlledTokenDragIntentRefreshes(tokenId, {
    getRefreshTargetIds,
    refreshTokenVisibility,
  });
  return true;
}

export function releaseControlledTokenDragIntent(
  tokenOrDoc = null,
  {
    tokenIdOf = defaultTokenIdOf,
    delayMs = PENDING_MOVEMENT_CONTROLLED_DRAG_INTENT_RELEASE_MS,
  } = {},
) {
  pruneControlledTokenDragIntents();
  const tokenId = tokenIdOf(tokenOrDoc);
  const tokenIds = tokenId ? [tokenId] : [...pendingControlledTokenDragIntentState.tokenIds.keys()];

  for (const id of tokenIds) {
    const existingTimer = pendingControlledTokenDragIntentState.timers.get(id);
    if (existingTimer) clearTimeout(existingTimer);
    pendingControlledTokenDragIntentState.timers.delete(id);

    if (delayMs <= 0) {
      pendingControlledTokenDragIntentState.tokenIds.delete(id);
      clearControlledTokenDragIntentRefreshes(id);
      continue;
    }

    const timer = setTimeout(() => {
      pendingControlledTokenDragIntentState.tokenIds.delete(id);
      pendingControlledTokenDragIntentState.timers.delete(id);
      clearControlledTokenDragIntentRefreshes(id);
    }, delayMs);
    pendingControlledTokenDragIntentState.timers.set(id, timer);
  }
}

export function hasControlledTokenDragIntent(
  tokenOrDoc,
  { tokenIdOf = defaultTokenIdOf } = {},
) {
  const tokenId = tokenIdOf(tokenOrDoc);
  if (!tokenId) return false;
  pruneControlledTokenDragIntents();
  return pendingControlledTokenDragIntentState.tokenIds.has(tokenId);
}
