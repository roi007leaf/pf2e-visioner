let cacheInvalidationRevision = 0;

export const CACHE_INVALIDATION_REASONS = Object.freeze({
  tokenFlagWrite: 'token-flag-write',
  manualClear: 'manual-clear',
});

export function getCacheInvalidationRevision() {
  return cacheInvalidationRevision;
}

export function invalidateCaches(_reason = CACHE_INVALIDATION_REASONS.manualClear, _payload = {}) {
  cacheInvalidationRevision += 1;
  return cacheInvalidationRevision;
}

export function resetCacheInvalidationRevisionForTests() {
  cacheInvalidationRevision = 0;
}
