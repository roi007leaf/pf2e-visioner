const PENDING_MOVEMENT_ANIMATION_REFRESH_DELAYS_MS = [
  16,
  33,
  50,
  66,
  75,
  83,
  90,
  100,
  150,
  200,
  250,
  300,
  350,
  400,
  450,
  500,
  550,
  600,
  650,
  800,
];
const PENDING_MOVEMENT_POST_COMPLETION_REFRESH_DELAYS_MS = [100, 300, 700, 1200];
const PENDING_MOVEMENT_DETECTION_FILTER_RESTORE_DELAYS_MS = [16, 50, 100, 200];

const pendingMovementAnimationRefreshTimeouts = new Map();
const pendingMovementPostCompletionRefreshTimeouts = new Map();
const pendingMovementDetectionFilterRestoreTimeouts = new Map();

function addRefreshTimeout(timeoutMap, key, timeoutId) {
  if (!key || !timeoutId) return;
  if (!timeoutMap.has(key)) timeoutMap.set(key, new Set());
  timeoutMap.get(key).add(timeoutId);
}

function removeRefreshTimeout(timeoutMap, key, timeoutId) {
  const timeouts = timeoutMap.get(key);
  if (!timeouts) return;
  timeouts.delete(timeoutId);
  if (!timeouts.size) timeoutMap.delete(key);
}

function clearRefreshTimeouts(timeoutMap, key) {
  const timeouts = timeoutMap.get(key);
  if (!timeouts) return;

  for (const timeoutId of timeouts) {
    clearTimeout(timeoutId);
  }
  timeoutMap.delete(key);
}

export function clearAnimationRenderRefreshes(tokenId) {
  clearRefreshTimeouts(pendingMovementAnimationRefreshTimeouts, tokenId);
}

export function clearPostCompletionRenderRefreshes(tokenId) {
  clearRefreshTimeouts(pendingMovementPostCompletionRefreshTimeouts, tokenId);
}

export function clearDetectionFilterRestoreTimeouts(targetId) {
  clearRefreshTimeouts(pendingMovementDetectionFilterRestoreTimeouts, targetId);
}

export function scheduleAnimationRenderRefreshes(
  tokenId,
  serial,
  { getEntry, getTargetTokenIds, refreshTokenVisibility } = {},
) {
  clearAnimationRenderRefreshes(tokenId);
  for (const delayMs of PENDING_MOVEMENT_ANIMATION_REFRESH_DELAYS_MS) {
    const timeoutId = setTimeout(() => {
      removeRefreshTimeout(pendingMovementAnimationRefreshTimeouts, tokenId, timeoutId);
      const currentEntry = getEntry?.(tokenId);
      if (!currentEntry || currentEntry.serial !== serial) return;

      const targetTokenIds = getTargetTokenIds?.(tokenId) ?? [];
      if (!targetTokenIds.length) return;

      refreshTokenVisibility?.([tokenId], {
        ignoreObservedGrace: true,
        skipPerceptionRefresh: true,
        targetTokenIds,
      });
    }, delayMs);
    addRefreshTimeout(pendingMovementAnimationRefreshTimeouts, tokenId, timeoutId);
  }
}

export function scheduleDetectionFilterRestoreRefreshes(
  targetId,
  { hasRenderWork, refreshTokenVisibility } = {},
) {
  if (!targetId) return;

  clearDetectionFilterRestoreTimeouts(targetId);
  for (const delayMs of PENDING_MOVEMENT_DETECTION_FILTER_RESTORE_DELAYS_MS) {
    const timeoutId = setTimeout(() => {
      removeRefreshTimeout(pendingMovementDetectionFilterRestoreTimeouts, targetId, timeoutId);
      if (!hasRenderWork?.()) return;

      refreshTokenVisibility?.([], {
        ignoreObservedGrace: true,
        skipPerceptionRefresh: true,
        targetTokenIds: [targetId],
      });
    }, delayMs);
    addRefreshTimeout(pendingMovementDetectionFilterRestoreTimeouts, targetId, timeoutId);
  }
}

export function schedulePostCompletionRenderRefreshes(
  tokenId,
  serial,
  { hasActivePendingMovementForObserver, hasRenderWork, refreshTokenVisibility } = {},
) {
  clearPostCompletionRenderRefreshes(tokenId);
  for (const delayMs of PENDING_MOVEMENT_POST_COMPLETION_REFRESH_DELAYS_MS) {
    const timeoutId = setTimeout(() => {
      removeRefreshTimeout(pendingMovementPostCompletionRefreshTimeouts, tokenId, timeoutId);
      if (hasActivePendingMovementForObserver?.(tokenId)) return;
      if (!hasRenderWork?.()) return;

      refreshTokenVisibility?.([], { ignoreObservedGrace: true });
    }, delayMs);
    addRefreshTimeout(pendingMovementPostCompletionRefreshTimeouts, tokenId, timeoutId);
  }
}
