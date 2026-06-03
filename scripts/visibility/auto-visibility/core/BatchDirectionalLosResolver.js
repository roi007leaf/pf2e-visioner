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
    const movementSightLine = this.#movementSightLineResolver?.(observerToken, targetToken);
    if (movementSightLine === true || movementSightLine === false) return movementSightLine;
    if (directionalLos === true) return true;
    if (this.#sourcePolygonLosResolver?.(observerToken, targetToken)) return true;
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

    const burstLos = this.#skipLosCache ? null : this.#burstLosMemo;
    if (burstLos?.has?.(cacheKey)) {
      directionalLos = burstLos.get(cacheKey);
      increment(this.#breakdown, 'losCacheHits');
      increment(this.#breakdown, 'burstMemoHits');
      directionalLos = this.#applyLosOverrides(directionalLos, observerToken, targetToken);
    }

    if (directionalLos === undefined && this.#globalLosCache && !this.#skipLosCache) {
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
    } else if (directionalLos === undefined && this.#skipLosCache) {
      increment(this.#breakdown, 'losGlobalMisses');
    }

    if (directionalLos === undefined) {
      directionalLos = this.#visionAnalyzer.hasLineOfSight(observerToken, targetToken, 'sight');
      directionalLos = this.#applyLosOverrides(directionalLos, observerToken, targetToken);

      if (this.#globalLosCache && !this.#skipLosCache) {
        this.#globalLosCache.set(cacheKey, directionalLos);
      }

      try {
        if (!this.#skipLosCache && this.#burstLosMemo) {
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
