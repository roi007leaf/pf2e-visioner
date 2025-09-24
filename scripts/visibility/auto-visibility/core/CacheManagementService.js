/**
 * CacheManagementService - Centralized cache management for visibility system
 * Handles global LOS cache, visibility cache, and validation cache operations
 */

export class CacheManagementService {
    /** @type {any} - Global LOS cache for optimization */
    #globalLosCache = null;

    /** @type {any} - Global visibility cache for optimization */
    #globalVisibilityCache = null;

    /** @type {Map<string, {result:any, expire:number, obsPos:string, tgtPos:string}>} - Short-lived pairwise validation cache */
    #pairwiseValidationCache = new Map();

    /** @type {number} - TTL for cached pairwise validity results (ms) */
    #pairwiseValidationCacheTtl = 500;

    /** @type {number} - Last time cache was pruned */
    #lastCachePruning = 0;

    /** @type {number} - How often to prune expired cache entries (ms) */
    #cachePruningInterval = 2000;

    /**
     * Initialize cache management with global cache references
     * @param {Object} coreServices - Core services with cache instances
     */
    initialize(coreServices) {
        this.#globalLosCache = coreServices.globalLosCache;
        this.#globalVisibilityCache = coreServices.globalVisibilityCache;
    }

    /**
     * Get the global LOS cache instance
     * @returns {any} Global LOS cache
     */
    getGlobalLosCache() {
        return this.#globalLosCache;
    }

    /**
     * Get the global visibility cache instance
     * @returns {any} Global visibility cache
     */
    getGlobalVisibilityCache() {
        return this.#globalVisibilityCache;
    }

    /**
     * Check if a validation result is cached
     * @param {string} cacheKey - Cache key for the validation
     * @returns {Object|null} Cached result or null if not found/expired
     */
    getCachedValidationResult(cacheKey) {
        this.#pruneCacheIfNeeded();

        const cached = this.#pairwiseValidationCache.get(cacheKey);
        if (!cached) return null;

        if (Date.now() > cached.expire) {
            this.#pairwiseValidationCache.delete(cacheKey);
            return null;
        }

        return cached.result;
    }

    /**
     * Cache a validation result
     * @param {string} cacheKey - Cache key for the validation
     * @param {any} result - Result to cache
     * @param {string} obsPos - Observer position string
     * @param {string} tgtPos - Target position string
     */
    setCachedValidationResult(cacheKey, result, obsPos, tgtPos) {
        this.#pairwiseValidationCache.set(cacheKey, {
            result,
            expire: Date.now() + this.#pairwiseValidationCacheTtl,
            obsPos,
            tgtPos
        });
    }

    /**
     * Clear all cached validation results
     */
    clearValidationCache() {
        this.#pairwiseValidationCache.clear();
    }

    clearAllCaches() {
        if (this.#globalLosCache?.clear) this.#globalLosCache.clear();
        if (this.#globalVisibilityCache?.clear) this.#globalVisibilityCache.clear();
        this.clearValidationCache();
    }

    /**
     * Prune expired entries from the validation cache occasionally
     */
    #pruneCacheIfNeeded() {
        const now = Date.now();
        if (now - this.#lastCachePruning < this.#cachePruningInterval) return;

        this.#lastCachePruning = now;
        for (const [key, entry] of this.#pairwiseValidationCache.entries()) {
            if (now > entry.expire) {
                this.#pairwiseValidationCache.delete(key);
            }
        }
    }

    /**
     * Get cache statistics for debugging
     * @returns {Object} Cache statistics
     */
    getCacheStats() {
        return {
            pairwiseValidationCacheSize: this.#pairwiseValidationCache.size,
            hasGlobalLosCache: !!this.#globalLosCache,
            hasGlobalVisibilityCache: !!this.#globalVisibilityCache,
            lastPruning: this.#lastCachePruning
        };
    }

    /**
     * Create a cache key for pairwise validation
     * @param {string} observerId - Observer token ID
     * @param {string} targetId - Target token ID
     * @param {string} obsPos - Observer position string
     * @param {string} tgtPos - Target position string
     * @returns {string} Cache key
     */
    createValidationCacheKey(observerId, targetId, obsPos, tgtPos) {
        return `${observerId}-${targetId}-${obsPos}-${tgtPos}`;
    }
}