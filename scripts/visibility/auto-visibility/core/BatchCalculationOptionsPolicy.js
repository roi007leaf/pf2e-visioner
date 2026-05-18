export const DEFAULT_BURST_LOS_MEMO_TTL_MS = 500;

export function resolveBurstLosMemo({
  lastLosMemo = { map: null, ts: 0 },
  now = Date.now(),
  ttlMs = DEFAULT_BURST_LOS_MEMO_TTL_MS,
} = {}) {
  const timeSinceLastBatch = lastLosMemo.ts ? now - lastLosMemo.ts : Number.POSITIVE_INFINITY;
  const shouldReuseMemo = !!lastLosMemo.map && timeSinceLastBatch < ttlMs;

  return {
    map: shouldReuseMemo ? lastLosMemo.map : new Map(),
    ts: now,
  };
}

export function buildBatchCalculationOptions({
  lastLosMemo = { map: null, ts: 0 },
  now = Date.now(),
  hasDarknessSources = false,
  precomputedLights = null,
  precomputeStats = null,
  isTokenMoving = false,
  movementSession = null,
  isMovementBatch = false,
  postBatchPerceptionSuppression = null,
  ttlMs = DEFAULT_BURST_LOS_MEMO_TTL_MS,
} = {}) {
  const nextLosMemo = resolveBurstLosMemo({ lastLosMemo, now, ttlMs });

  return {
    nextLosMemo,
    calcOptions: {
      hasDarknessSources,
      precomputedLights,
      precomputeStats,
      burstLosMemo: nextLosMemo.map,
      fastMode: isTokenMoving,
      skipPrecomputedLOS: !!movementSession,
      skipViewportFilter: isMovementBatch,
      postBatchPerceptionSuppression,
    },
  };
}
