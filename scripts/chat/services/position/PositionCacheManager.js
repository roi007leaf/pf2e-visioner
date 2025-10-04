/**
 * Position Cache Manager - Optimized caching for expensive position calculations
 * Provides intelligent caching with TTL, memory management, and performance monitoring
 * for the Enhanced Sneak AVS Integration system.
 */

import { MODULE_ID } from '../../../constants.js';

/**
 * Cache entry structure
 * @typedef {Object} CacheEntry
 * @property {*} data - Cached data
 * @property {number} timestamp - When the entry was created
 * @property {number} ttl - Time to live in milliseconds
 * @property {number} accessCount - Number of times accessed
 * @property {number} lastAccess - Last access timestamp
 * @property {number} size - Estimated memory size in bytes
 */

/**
 * Cache statistics
 * @typedef {Object} CacheStats
 * @property {number} hits - Cache hits
 * @property {number} misses - Cache misses
 * @property {number} evictions - Number of evictions
 * @property {number} totalEntries - Current number of entries
 * @property {number} memoryUsage - Estimated memory usage in bytes
 * @property {number} hitRate - Hit rate percentage
 */

export class PositionCacheManager {
  constructor(options = {}) {
    // Cache configuration
    this.maxEntries = options.maxEntries || 1000;
    this.defaultTTL = options.defaultTTL || 30000; // 30 seconds
    this.maxMemoryMB = options.maxMemoryMB || 50; // 50MB limit
    this.cleanupInterval = options.cleanupInterval || 60000; // 1 minute
    
    // Cache storage
    this._cache = new Map();
    this._stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      totalEntries: 0,
      memoryUsage: 0
    };
    
    // Performance monitoring
    this._performanceMetrics = {
      averageCalculationTime: 0,
      totalCalculations: 0,
      cacheEfficiency: 0
    };
    
    // Cleanup timer
    this._cleanupTimer = null;
    this._startCleanupTimer();
  }

  /**
   * Gets cached position state or calculates if not cached
   * @param {string} key - Cache key
   * @param {Function} calculator - Function to calculate value if not cached
   * @param {Object} options - Cache options
   * @returns {Promise<*>} Cached or calculated value
   */
  async getOrCalculate(key, calculator, options = {}) {
    const startTime = performance.now();
    
    // Check cache first
    const cached = this._get(key);
    if (cached !== null) {
      this._stats.hits++;
      this._updatePerformanceMetrics(performance.now() - startTime, true);
      return cached;
    }
    
    // Calculate value
    this._stats.misses++;
    const value = await calculator();
    
    // Cache the result
    const ttl = options.ttl || this.defaultTTL;
    this._set(key, value, ttl);
    
    this._updatePerformanceMetrics(performance.now() - startTime, false);
    return value;
  }

  /**
   * Caches position state for a token pair
   * @param {Token} observer - Observer token
   * @param {Token} target - Target token
   * @param {*} positionState - Position state to cache
   * @param {Object} options - Cache options
   */
  cachePositionState(observer, target, positionState, options = {}) {
    const key = this._generatePositionKey(observer, target);
    const ttl = options.ttl || this.defaultTTL;
    this._set(key, positionState, ttl);
  }

  /**
   * Gets cached position state for a token pair
   * @param {Token} observer - Observer token
   * @param {Token} target - Target token
   * @returns {*|null} Cached position state or null
   */
  getCachedPositionState(observer, target) {
    const key = this._generatePositionKey(observer, target);
    const cached = this._get(key);
    
    if (cached !== null) {
      this._stats.hits++;
      return cached;
    }
    
    this._stats.misses++;
    return null;
  }

  /**
   * Batch cache multiple position states
   * @param {Array<{observer: Token, target: Token, state: *}>} entries - Entries to cache
   * @param {Object} options - Cache options
   */
  batchCachePositionStates(entries, options = {}) {
    const ttl = options.ttl || this.defaultTTL;
    
    for (const entry of entries) {
      if (entry.observer && entry.target && entry.state) {
        const key = this._generatePositionKey(entry.observer, entry.target);
        this._set(key, entry.state, ttl);
      }
    }
  }

  /**
   * Invalidates cache entries for a specific token
   * @param {Token} token - Token to invalidate cache for
   */
  invalidateTokenCache(token) {
    if (!token?.document?.id) return;
    
    const tokenId = token.document.id;
    const keysToDelete = [];
    
    for (const key of this._cache.keys()) {
      if (key.includes(tokenId)) {
        keysToDelete.push(key);
      }
    }
    
    for (const key of keysToDelete) {
      this._delete(key);
    }
  }

  /**
   * Invalidates cache entries for multiple tokens
   * @param {Array<Token>} tokens - Tokens to invalidate cache for
   */
  batchInvalidateTokenCache(tokens) {
    if (!Array.isArray(tokens)) return;
    
    const tokenIds = new Set(
      tokens
        .filter(token => token?.document?.id)
        .map(token => token.document.id)
    );
    
    const keysToDelete = [];
    
    for (const key of this._cache.keys()) {
      for (const tokenId of tokenIds) {
        if (key.includes(tokenId)) {
          keysToDelete.push(key);
          break;
        }
      }
    }
    
    for (const key of keysToDelete) {
      this._delete(key);
    }
  }

  /**
   * Preloads cache for a set of token pairs
   * @param {Token} observer - Observer token
   * @param {Array<Token>} targets - Target tokens
   * @param {Function} calculator - Function to calculate position states
   * @param {Object} options - Cache options
   * @returns {Promise<Map<string, *>>} Map of target IDs to position states
   */
  async preloadPositionStates(observer, targets, calculator, options = {}) {
    const results = new Map();
    const uncachedTargets = [];
    
    // Check which targets are already cached
    for (const target of targets) {
      if (!target?.document?.id) continue;
      
      const cached = this.getCachedPositionState(observer, target);
      if (cached !== null) {
        results.set(target.document.id, cached);
      } else {
        uncachedTargets.push(target);
      }
    }
    
    // Calculate uncached states in batches
    if (uncachedTargets.length > 0) {
      const batchSize = options.batchSize || 10;
      const ttl = options.ttl || this.defaultTTL;
      
      for (let i = 0; i < uncachedTargets.length; i += batchSize) {
        const batch = uncachedTargets.slice(i, i + batchSize);
        
        const batchPromises = batch.map(async (target) => {
          try {
            const state = await calculator(observer, target);
            this.cachePositionState(observer, target, state, { ttl });
            return { id: target.document.id, state };
          } catch (error) {
            console.warn(`${MODULE_ID} | Failed to preload position state:`, error);
            return null;
          }
        });
        
        const batchResults = await Promise.all(batchPromises);
        
        for (const result of batchResults) {
          if (result) {
            results.set(result.id, result.state);
          }
        }
      }
    }
    
    return results;
  }

  /**
   * Gets cache statistics
   * @returns {CacheStats} Cache statistics
   */
  getStats() {
    const hitRate = this._stats.hits + this._stats.misses > 0 
      ? (this._stats.hits / (this._stats.hits + this._stats.misses)) * 100 
      : 0;
    
    return {
      ...this._stats,
      totalEntries: this._cache.size,
      hitRate: Math.round(hitRate * 100) / 100,
      memoryUsageMB: Math.round((this._stats.memoryUsage / 1024 / 1024) * 100) / 100,
      performanceMetrics: { ...this._performanceMetrics }
    };
  }

  /**
   * Clears all cache entries
   */
  clear() {
    this._cache.clear();
    this._stats.totalEntries = 0;
    this._stats.memoryUsage = 0;
    this._stats.evictions += this._cache.size;
  }

  /**
   * Optimizes cache by removing least recently used entries
   * @param {number} targetSize - Target number of entries (optional)
   */
  optimize(targetSize = null) {
    const target = targetSize || Math.floor(this.maxEntries * 0.8);
    
    if (this._cache.size <= target) return;
    
    // Sort entries by access patterns (LRU + access count)
    const entries = Array.from(this._cache.entries()).map(([key, entry]) => ({
      key,
      entry,
      score: this._calculateEvictionScore(entry)
    }));
    
    entries.sort((a, b) => a.score - b.score);
    
    // Remove lowest scoring entries
    const toRemove = this._cache.size - target;
    for (let i = 0; i < toRemove; i++) {
      this._delete(entries[i].key);
    }
  }

  /**
   * Implements intelligent cache warming for frequently accessed token pairs
   * @param {Array<{observer: Token, target: Token}>} tokenPairs - Token pairs to warm
   * @param {Function} calculator - Function to calculate position states
   * @param {Object} options - Warming options
   * @returns {Promise<number>} Number of entries warmed
   */
  async warmCache(tokenPairs, calculator, options = {}) {
    const warmingStartTime = performance.now();
    let warmedCount = 0;
    const batchSize = options.batchSize || 10;
    const ttl = options.ttl || this.defaultTTL * 2; // Longer TTL for warmed entries
    
    // Process in batches to avoid overwhelming the system
    for (let i = 0; i < tokenPairs.length; i += batchSize) {
      const batch = tokenPairs.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async ({ observer, target }) => {
        try {
          // Skip if already cached
          if (this.getCachedPositionState(observer, target) !== null) {
            return false;
          }
          
          const state = await calculator(observer, target);
          this.cachePositionState(observer, target, state, { ttl });
          return true;
        } catch (error) {
          console.warn(`${MODULE_ID} | Cache warming failed for token pair:`, error);
          return false;
        }
      });
      
      const results = await Promise.all(batchPromises);
      warmedCount += results.filter(Boolean).length;
      
      // Small delay between batches
      if (i + batchSize < tokenPairs.length) {
        await new Promise(resolve => setTimeout(resolve, 5));
      }
    }
    
    return warmedCount;
  }

  /**
   * Implements predictive caching based on token movement patterns
   * @param {Token} observer - Observer token
   * @param {Array<Token>} nearbyTargets - Nearby target tokens
   * @param {Function} calculator - Position calculation function
   * @param {Object} options - Prediction options
   * @returns {Promise<void>} Prediction completion
   */
  async predictiveCache(observer, nearbyTargets, calculator, options = {}) {
    const predictionRadius = options.predictionRadius || 200; // pixels
    const maxPredictions = options.maxPredictions || 20;
    
    // Generate predicted positions based on movement patterns
    const predictions = this._generateMovementPredictions(observer, predictionRadius, maxPredictions);
    
    // Cache position states for predicted positions
    const cachePromises = [];
    
    for (const prediction of predictions) {
      for (const target of nearbyTargets.slice(0, 10)) { // Limit targets
        const cachePromise = this._cachePredictedPosition(
          prediction, 
          target, 
          calculator, 
          options
        );
        cachePromises.push(cachePromise);
      }
    }
    
    await Promise.all(cachePromises);
  }

  /**
   * Implements hierarchical caching with different TTLs based on importance
   * @param {string} key - Cache key
   * @param {*} data - Data to cache
   * @param {string} importance - Importance level ('critical', 'high', 'normal', 'low')
   * @param {Object} options - Cache options
   */
  cacheWithImportance(key, data, importance = 'normal', options = {}) {
    const importanceTTLs = {
      critical: this.defaultTTL * 4,  // 2 minutes
      high: this.defaultTTL * 2,      // 1 minute
      normal: this.defaultTTL,        // 30 seconds
      low: this.defaultTTL / 2        // 15 seconds
    };
    
    const ttl = importanceTTLs[importance] || this.defaultTTL;
    this._set(key, data, ttl);
    
    // Mark entry with importance for eviction priority
    const entry = this._cache.get(key);
    if (entry) {
      entry.importance = importance;
    }
  }

  /**
   * Implements memory-aware caching with automatic cleanup
   * @param {number} targetMemoryMB - Target memory usage in MB
   * @returns {Promise<void>} Cleanup completion
   */
  async memoryAwareCleanup(targetMemoryMB = null) {
    const target = targetMemoryMB || (this.maxMemoryMB * 0.7); // 70% of max
    const targetBytes = target * 1024 * 1024;
    
    if (this._stats.memoryUsage <= targetBytes) {
      return; // No cleanup needed
    }
    
    // Sort entries by eviction priority
    const entries = Array.from(this._cache.entries()).map(([key, entry]) => ({
      key,
      entry,
      priority: this._calculateMemoryEvictionPriority(entry)
    }));
    
    entries.sort((a, b) => a.priority - b.priority);
    
    // Remove entries until target memory is reached
    let currentMemory = this._stats.memoryUsage;
    
    for (const { key, entry } of entries) {
      if (currentMemory <= targetBytes) break;
      
      currentMemory -= entry.size;
      this._delete(key);
    }
  }

  /**
   * Implements cache compression for large entries
   * @param {*} data - Data to potentially compress
   * @returns {*} Compressed or original data
   * @private
   */
  _compressIfNeeded(data) {
    const estimatedSize = this._estimateSize(data);
    
    // Compress if entry is larger than 10KB
    if (estimatedSize > 10240) {
      try {
        // Simple compression by removing redundant data
        if (typeof data === 'object' && data !== null) {
          return this._compressObject(data);
        }
      } catch (error) {
        console.warn(`${MODULE_ID} | Compression failed:`, error);
      }
    }
    
    return data;
  }

  /**
   * Compresses object data by removing redundant information
   * @param {Object} obj - Object to compress
   * @returns {Object} Compressed object
   * @private
   */
  _compressObject(obj) {
    const compressed = { ...obj };
    
    // Remove redundant timestamp precision
    if (compressed.timestamp) {
      compressed.timestamp = Math.floor(compressed.timestamp / 1000) * 1000;
    }
    
    // Round floating point numbers to reduce precision
    for (const [key, value] of Object.entries(compressed)) {
      if (typeof value === 'number' && !Number.isInteger(value)) {
        compressed[key] = Math.round(value * 100) / 100;
      }
    }
    
    return compressed;
  }

  /**
   * Generates movement predictions for predictive caching
   * @param {Token} token - Token to predict movement for
   * @param {number} radius - Prediction radius
   * @param {number} maxPredictions - Maximum predictions to generate
   * @returns {Array<Object>} Predicted positions
   * @private
   */
  _generateMovementPredictions(token, radius, maxPredictions) {
    const predictions = [];
    const centerX = token.x;
    const centerY = token.y;
    
    // Generate grid-based predictions around current position
    const gridSize = Math.max(50, radius / 4);
    
    for (let x = centerX - radius; x <= centerX + radius; x += gridSize) {
      for (let y = centerY - radius; y <= centerY + radius; y += gridSize) {
        const distance = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
        
        if (distance <= radius && predictions.length < maxPredictions) {
          predictions.push({
            x: Math.round(x),
            y: Math.round(y),
            probability: 1 - (distance / radius) // Closer = higher probability
          });
        }
      }
    }
    
    // Sort by probability (higher first)
    predictions.sort((a, b) => b.probability - a.probability);
    
    return predictions.slice(0, maxPredictions);
  }

  /**
   * Caches position state for predicted position
   * @param {Object} prediction - Predicted position
   * @param {Token} target - Target token
   * @param {Function} calculator - Position calculator
   * @param {Object} options - Cache options
   * @returns {Promise<void>} Cache completion
   * @private
   */
  async _cachePredictedPosition(prediction, target, calculator, options) {
    try {
      // Create virtual token at predicted position
      const virtualToken = {
        x: prediction.x,
        y: prediction.y,
        document: { id: `virtual_${prediction.x}_${prediction.y}` },
        center: { x: prediction.x, y: prediction.y }
      };
      
      const state = await calculator(virtualToken, target);
      
      // Cache with shorter TTL for predictions
      const key = this._generatePositionKey(virtualToken, target);
      const ttl = (options.ttl || this.defaultTTL) * prediction.probability;
      
      this._set(key, state, ttl);
    } catch (error) {
      // Silently fail for predictions
    }
  }

  /**
   * Calculates memory eviction priority
   * @param {CacheEntry} entry - Cache entry
   * @returns {number} Eviction priority (lower = evict first)
   * @private
   */
  _calculateMemoryEvictionPriority(entry) {
    const now = Date.now();
    const age = now - entry.timestamp;
    const timeSinceAccess = now - entry.lastAccess;
    
    // Base priority calculation
    let priority = this._calculateEvictionScore(entry);
    
    // Adjust for importance
    const importanceMultipliers = {
      critical: 10,
      high: 5,
      normal: 1,
      low: 0.5
    };
    
    const multiplier = importanceMultipliers[entry.importance] || 1;
    priority *= multiplier;
    
    // Adjust for memory size (larger entries have lower priority)
    priority -= (entry.size / 1024); // Reduce priority by KB
    
    return priority;
  }

  /**
   * Destroys the cache manager and cleans up resources
   */
  destroy() {
    if (this._cleanupTimer) {
      clearInterval(this._cleanupTimer);
      this._cleanupTimer = null;
    }
    this.clear();
  }

  // Private methods

  /**
   * Gets value from cache
   * @param {string} key - Cache key
   * @returns {*|null} Cached value or null
   * @private
   */
  _get(key) {
    const entry = this._cache.get(key);
    
    if (!entry) return null;
    
    // Check if expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this._delete(key);
      return null;
    }
    
    // Update access statistics
    entry.accessCount++;
    entry.lastAccess = Date.now();
    
    return entry.data;
  }

  /**
   * Sets value in cache
   * @param {string} key - Cache key
   * @param {*} data - Data to cache
   * @param {number} ttl - Time to live in milliseconds
   * @private
   */
  _set(key, data, ttl) {
    // Check memory limits before adding
    const estimatedSize = this._estimateSize(data);
    
    if (this._stats.memoryUsage + estimatedSize > this.maxMemoryMB * 1024 * 1024) {
      this.optimize();
    }
    
    // Check entry limits
    if (this._cache.size >= this.maxEntries) {
      this.optimize();
    }
    
    const entry = {
      data,
      timestamp: Date.now(),
      ttl,
      accessCount: 1,
      lastAccess: Date.now(),
      size: estimatedSize
    };
    
    // Remove existing entry if present
    if (this._cache.has(key)) {
      this._delete(key);
    }
    
    this._cache.set(key, entry);
    this._stats.memoryUsage += estimatedSize;
  }

  /**
   * Deletes entry from cache
   * @param {string} key - Cache key
   * @private
   */
  _delete(key) {
    const entry = this._cache.get(key);
    if (entry) {
      this._stats.memoryUsage -= entry.size;
      this._stats.evictions++;
    }
    this._cache.delete(key);
  }

  /**
   * Generates cache key for token pair
   * @param {Token} observer - Observer token
   * @param {Token} target - Target token
   * @returns {string} Cache key
   * @private
   */
  _generatePositionKey(observer, target) {
    if (!observer?.document?.id || !target?.document?.id) {
      throw new Error('Invalid tokens for cache key generation');
    }
    
    // Include position data in key for position-sensitive caching
    const observerPos = `${Math.round(observer.x)},${Math.round(observer.y)}`;
    const targetPos = `${Math.round(target.x)},${Math.round(target.y)}`;
    
    return `pos:${observer.document.id}@${observerPos}:${target.document.id}@${targetPos}`;
  }

  /**
   * Estimates memory size of data
   * @param {*} data - Data to estimate
   * @returns {number} Estimated size in bytes
   * @private
   */
  _estimateSize(data) {
    try {
      // Rough estimation based on JSON serialization
      const jsonString = JSON.stringify(data);
      return jsonString.length * 2; // Assume 2 bytes per character
    } catch {
      return 1024; // Default estimate for non-serializable data
    }
  }

  /**
   * Calculates eviction score for cache entry
   * @param {CacheEntry} entry - Cache entry
   * @returns {number} Eviction score (lower = more likely to evict)
   * @private
   */
  _calculateEvictionScore(entry) {
    const now = Date.now();
    const age = now - entry.timestamp;
    const timeSinceAccess = now - entry.lastAccess;
    
    // Score based on age, access frequency, and recency
    const ageScore = age / entry.ttl; // Higher age = lower score
    const accessScore = Math.log(entry.accessCount + 1); // More accesses = higher score
    const recencyScore = 1 / (timeSinceAccess + 1); // More recent = higher score
    
    return ageScore - (accessScore * recencyScore);
  }

  /**
   * Updates performance metrics
   * @param {number} duration - Operation duration in milliseconds
   * @param {boolean} wasHit - Whether this was a cache hit
   * @private
   */
  _updatePerformanceMetrics(duration, wasHit) {
    if (!wasHit) {
      // Only track calculation time for cache misses
      this._performanceMetrics.totalCalculations++;
      const total = this._performanceMetrics.averageCalculationTime * 
                   (this._performanceMetrics.totalCalculations - 1);
      this._performanceMetrics.averageCalculationTime = 
        (total + duration) / this._performanceMetrics.totalCalculations;
    }
    
    // Update cache efficiency
    const totalOps = this._stats.hits + this._stats.misses;
    this._performanceMetrics.cacheEfficiency = totalOps > 0 
      ? (this._stats.hits / totalOps) * 100 
      : 0;
  }

  /**
   * Starts the cleanup timer for expired entries
   * @private
   */
  _startCleanupTimer() {
    this._cleanupTimer = setInterval(() => {
      this._cleanupExpiredEntries();
    }, this.cleanupInterval);
  }

  /**
   * Cleans up expired cache entries
   * @private
   */
  _cleanupExpiredEntries() {
    const now = Date.now();
    const keysToDelete = [];
    
    for (const [key, entry] of this._cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        keysToDelete.push(key);
      }
    }
    
    for (const key of keysToDelete) {
      this._delete(key);
    }
  }
}

// Export singleton instance with default configuration
export default new PositionCacheManager({
  maxEntries: 1000,
  defaultTTL: 30000, // 30 seconds
  maxMemoryMB: 50,
  cleanupInterval: 60000 // 1 minute
});