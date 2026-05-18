function increment(counterBag, key, amount = 1) {
  if (!counterBag) return;
  counterBag[key] = (Number(counterBag[key]) || 0) + amount;
}

/**
 * Resolves one directional visibility value with per-batch and global cache write-through.
 */
export class BatchDirectionalVisibilityResolver {
  #optimizedVisibilityCalculator;
  #globalVisibilityCache;
  #batchVisibilityCache;
  #commonCalcOptions;
  #breakdown;
  #skipGlobalVisCache;

  constructor({
    optimizedVisibilityCalculator,
    globalVisibilityCache = null,
    batchVisibilityCache = new Map(),
    commonCalcOptions = {},
    breakdown = null,
    skipGlobalVisCache = false,
  } = {}) {
    this.#optimizedVisibilityCalculator = optimizedVisibilityCalculator;
    this.#globalVisibilityCache = globalVisibilityCache;
    this.#batchVisibilityCache = batchVisibilityCache;
    this.#commonCalcOptions = commonCalcOptions;
    this.#breakdown = breakdown;
    this.#skipGlobalVisCache = !!skipGlobalVisCache;
  }

  async get({ observerToken, targetToken, observerPosition, targetPosition, cacheKey }) {
    let visibility = this.#batchVisibilityCache.get(cacheKey);

    if (visibility !== undefined) {
      increment(this.#breakdown, 'pairsCached');
      return visibility;
    }

    if (this.#globalVisibilityCache && !this.#skipGlobalVisCache) {
      const globalResult = this.#globalVisibilityCache.getWithMeta(cacheKey);
      if (globalResult.state === 'hit' && globalResult.value !== undefined) {
        visibility = globalResult.value;
        increment(this.#breakdown, 'visGlobalHits');
      } else if (globalResult.state === 'expired') {
        increment(this.#breakdown, 'visGlobalExpired');
        increment(this.#breakdown, 'visGlobalMisses');
      } else {
        increment(this.#breakdown, 'visGlobalMisses');
      }
    } else if (this.#skipGlobalVisCache) {
      increment(this.#breakdown, 'visGlobalMisses');
    }

    if (visibility === undefined) {
      visibility = await this.#optimizedVisibilityCalculator.calculateVisibilityBetweenTokens(
        observerToken,
        targetToken,
        observerPosition,
        targetPosition,
        this.#commonCalcOptions,
      );

      if (this.#globalVisibilityCache && !this.#skipGlobalVisCache) {
        this.#globalVisibilityCache.set(cacheKey, visibility);
      }
      increment(this.#breakdown, 'pairsComputed');
    }

    this.#batchVisibilityCache.set(cacheKey, visibility);
    return visibility;
  }
}
