const PENDING_MOVEMENT_EVALUATION_CACHE_STACK_KEY = Symbol.for(
  'pf2e-visioner.pendingMovementEvaluationCacheStack',
);

const pendingMovementEvaluationCacheStack =
  globalThis[PENDING_MOVEMENT_EVALUATION_CACHE_STACK_KEY] ?? [];
globalThis[PENDING_MOVEMENT_EVALUATION_CACHE_STACK_KEY] = pendingMovementEvaluationCacheStack;

export function withPendingMovementEvaluationCache(callback) {
  if (typeof callback !== 'function') return undefined;
  if (pendingMovementEvaluationCacheStack.length) return callback();

  const cache = new Map();
  pendingMovementEvaluationCacheStack.push(cache);
  try {
    return callback();
  } finally {
    pendingMovementEvaluationCacheStack.pop();
  }
}

function activePendingMovementEvaluationCache() {
  return pendingMovementEvaluationCacheStack[pendingMovementEvaluationCacheStack.length - 1] ?? null;
}

export function cachePendingMovementEvaluation(kind, key, compute) {
  if (typeof compute !== 'function') return undefined;

  const cache = activePendingMovementEvaluationCache();
  if (!cache || !kind || !key) return compute();

  const cacheKey = `${kind}:${key}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const result = compute();
  cache.set(cacheKey, result);
  return result;
}

export function cachePendingMovementObjectEvaluation(kind, object, compute) {
  if (typeof compute !== 'function') return undefined;

  const cache = activePendingMovementEvaluationCache();
  const canUseObjectKey = object && (typeof object === 'object' || typeof object === 'function');
  if (!cache || !kind || !canUseObjectKey) return compute();

  const cacheKey = `object:${kind}`;
  let objectCache = cache.get(cacheKey);
  if (!objectCache) {
    objectCache = new WeakMap();
    cache.set(cacheKey, objectCache);
  }
  if (objectCache.has(object)) return objectCache.get(object);

  const result = compute();
  objectCache.set(object, result);
  return result;
}
