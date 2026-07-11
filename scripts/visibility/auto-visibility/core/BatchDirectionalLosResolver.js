import { peekRegistry } from '../../../services/Peek/PeekRegistry.js';

function increment(counterBag, key, amount = 1) {
  if (!counterBag) return;
  counterBag[key] = (Number(counterBag[key]) || 0) + amount;
}

/**
 * Resolves directional LOS with the same cache order BatchProcessor needs:
 * per-batch cache, burst memo, global cache, then VisionAnalyzer computation.
 */
export class BatchDirectionalLosResolver {
  #visionAnalyzer;
  #globalLosCache;
  #batchLosCache;
  #burstLosMemo;
  #precomputedLOS;
  #breakdown;
  #skipLosCache;
  #sourcePolygonLosResolver;
  #movementSightLineResolver;

  constructor({
    visionAnalyzer,
    globalLosCache = null,
    batchLosCache = new Map(),
    burstLosMemo = null,
    precomputedLOS = new Map(),
    breakdown = null,
    skipLosCache = false,
    sourcePolygonLosResolver = null,
    movementSightLineResolver = null,
  } = {}) {
    this.#visionAnalyzer = visionAnalyzer;
    this.#globalLosCache = globalLosCache;
    this.#batchLosCache = batchLosCache;
    this.#burstLosMemo = burstLosMemo;
    this.#precomputedLOS = precomputedLOS;
    this.#breakdown = breakdown;
    this.#skipLosCache = !!skipLosCache;
    this.#sourcePolygonLosResolver =
      typeof sourcePolygonLosResolver === 'function' ? sourcePolygonLosResolver : null;
    this.#movementSightLineResolver =
      typeof movementSightLineResolver === 'function' ? movementSightLineResolver : null;
  }

  #applyLosOverrides(directionalLos, observerToken, targetToken) {
    if (directionalLos === true) return true;
    if (this.#sourcePolygonLosResolver?.(observerToken, targetToken)) return true;
    if (this.#movementSightLineResolver?.(observerToken, targetToken)) return true;
    return directionalLos;
  }

  get(observerToken, targetToken, cacheKey) {
    let directionalLos = this.#batchLosCache.get(cacheKey);
    if (directionalLos !== undefined) {
      increment(this.#breakdown, 'losCacheHits');
      const overriddenLos = this.#applyLosOverrides(directionalLos, observerToken, targetToken);
      if (overriddenLos !== directionalLos) {
        directionalLos = overriddenLos;
        this.#batchLosCache.set(cacheKey, directionalLos);
        this.#precomputedLOS.set(
          `${observerToken.document.id}-${targetToken.document.id}`,
          directionalLos,
        );
      }
      return directionalLos;
    }

    increment(this.#breakdown, 'losCacheMisses');

    // A peeking observer's LOS to a target can flip true/false purely from re-aiming, without
    // its position changing at all - the burst/global caches are keyed on position only, so they
    // would keep serving whatever result was cached before the peek started aiming at the
    // target. Bypass them for this specific observer only (not the whole batch), so every other
    // pair in the batch still benefits from caching even while this one token is peeking.
    const skipCache = this.#skipLosCache || peekRegistry.has(observerToken?.document?.id);

    const burstLos = skipCache ? null : this.#burstLosMemo;
    if (burstLos?.has?.(cacheKey)) {
      directionalLos = burstLos.get(cacheKey);
      increment(this.#breakdown, 'losCacheHits');
      increment(this.#breakdown, 'burstMemoHits');
      directionalLos = this.#applyLosOverrides(directionalLos, observerToken, targetToken);
    }

    if (directionalLos === undefined && this.#globalLosCache && !skipCache) {
      const globalResult = this.#globalLosCache.getWithMeta(cacheKey);
      if (globalResult.state === 'hit') {
        directionalLos = globalResult.value;
        increment(this.#breakdown, 'losGlobalHits');
        directionalLos = this.#applyLosOverrides(directionalLos, observerToken, targetToken);
      } else if (globalResult.state === 'expired') {
        increment(this.#breakdown, 'losGlobalExpired');
        increment(this.#breakdown, 'losGlobalMisses');
      } else {
        increment(this.#breakdown, 'losGlobalMisses');
      }
    } else if (directionalLos === undefined && skipCache) {
      increment(this.#breakdown, 'losGlobalMisses');
    }

    if (directionalLos === undefined) {
      directionalLos = this.#visionAnalyzer.hasLineOfSight(observerToken, targetToken, 'sight');
      directionalLos = this.#applyLosOverrides(directionalLos, observerToken, targetToken);

      if (this.#globalLosCache && !skipCache) {
        this.#globalLosCache.set(cacheKey, directionalLos);
      }

      try {
        if (!skipCache && this.#burstLosMemo) {
          this.#burstLosMemo.set(cacheKey, directionalLos);
        }
      } catch {
        /* burst memo write-through is best-effort */
      }
    }

    this.#batchLosCache.set(cacheKey, directionalLos);
    this.#precomputedLOS.set(
      `${observerToken.document.id}-${targetToken.document.id}`,
      directionalLos,
    );

    return directionalLos;
  }
}
