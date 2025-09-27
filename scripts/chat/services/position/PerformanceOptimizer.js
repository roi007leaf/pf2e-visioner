/**
 * Performance Optimizer - Optimizations for large token counts and complex scenarios
 * Provides intelligent batching, throttling, and performance monitoring
 * for the Enhanced Sneak AVS Integration system.
 */

import { MODULE_ID } from '../../../constants.js';
import positionCacheManager from './PositionCacheManager.js';

/**
 * Performance configuration
 * @typedef {Object} PerformanceConfig
 * @property {number} maxBatchSize - Maximum tokens to process in one batch
 * @property {number} batchDelay - Delay between batches in milliseconds
 * @property {number} maxConcurrentOperations - Maximum concurrent operations
 * @property {number} timeoutMs - Operation timeout in milliseconds
 * @property {boolean} enableProfiling - Whether to enable performance profiling
 */

/**
 * Performance metrics
 * @typedef {Object} PerformanceMetrics
 * @property {number} totalOperations - Total operations performed
 * @property {number} averageOperationTime - Average operation time in ms
 * @property {number} peakOperationTime - Peak operation time in ms
 * @property {number} totalTokensProcessed - Total tokens processed
 * @property {number} averageTokensPerSecond - Average tokens processed per second
 * @property {number} memoryUsage - Current memory usage estimate
 * @property {Object} batchMetrics - Batch processing metrics
 */

export class PerformanceOptimizer {
  constructor(config = {}) {
    // Performance configuration
    this.config = {
      maxBatchSize: config.maxBatchSize || 20,
      batchDelay: config.batchDelay || 10, // 10ms between batches
      maxConcurrentOperations: config.maxConcurrentOperations || 5,
      timeoutMs: config.timeoutMs || 5000, // 5 second timeout
      enableProfiling: config.enableProfiling !== false,
      adaptiveBatching: config.adaptiveBatching !== false
    };
    
    // Performance tracking
    this.metrics = {
      totalOperations: 0,
      averageOperationTime: 0,
      peakOperationTime: 0,
      totalTokensProcessed: 0,
      averageTokensPerSecond: 0,
      memoryUsage: 0,
      batchMetrics: {
        totalBatches: 0,
        averageBatchSize: 0,
        averageBatchTime: 0,
        adaptiveAdjustments: 0
      }
    };
    
    // Operation tracking
    this._activeOperations = new Set();
    this._operationQueue = [];
    this._isProcessingQueue = false;
    
    // Adaptive batching
    this._performanceHistory = [];
    this._currentOptimalBatchSize = this.config.maxBatchSize;
  }

  /**
   * Optimizes position calculation for large token counts
   * @param {Token} observer - Observer token
   * @param {Array<Token>} targets - Target tokens
   * @param {Function} calculator - Position calculation function
   * @param {Object} options - Optimization options
   * @returns {Promise<Map<string, *>>} Optimized results
   */
  async optimizePositionCalculation(observer, targets, calculator, options = {}) {
    const startTime = performance.now();
    const operationId = this._generateOperationId();
    
    try {
      this._activeOperations.add(operationId);
      
      // Filter and validate targets
      const validTargets = this._filterValidTargets(targets);
      
      if (validTargets.length === 0) {
        return new Map();
      }
      
      // Check cache first for all targets
      const results = new Map();
      const uncachedTargets = [];
      
      for (const target of validTargets) {
        const cached = positionCacheManager.getCachedPositionState(observer, target);
        if (cached !== null) {
          results.set(target.document.id, cached);
        } else {
          uncachedTargets.push(target);
        }
      }
      
      // Process uncached targets with optimized batching
      if (uncachedTargets.length > 0) {
        const batchResults = await this._processBatchedCalculations(
          observer, 
          uncachedTargets, 
          calculator, 
          options
        );
        
        // Merge results
        for (const [targetId, result] of batchResults) {
          results.set(targetId, result);
        }
      }
      
      // Update metrics
      const duration = performance.now() - startTime;
      this._updateMetrics(duration, validTargets.length);
      
      return results;
      
    } finally {
      this._activeOperations.delete(operationId);
    }
  }

  /**
   * Processes calculations in optimized batches
   * @param {Token} observer - Observer token
   * @param {Array<Token>} targets - Uncached target tokens
   * @param {Function} calculator - Calculation function
   * @param {Object} options - Processing options
   * @returns {Promise<Map<string, *>>} Batch results
   * @private
   */
  async _processBatchedCalculations(observer, targets, calculator, options) {
    const results = new Map();
    const batchSize = this._getOptimalBatchSize(targets.length);
    const batches = this._createBatches(targets, batchSize);
    
    // Process batches with controlled concurrency
    const semaphore = new Semaphore(this.config.maxConcurrentOperations);
    
    const batchPromises = batches.map(async (batch, batchIndex) => {
      return semaphore.acquire(async () => {
        const batchStartTime = performance.now();
        
        try {
          // Add delay between batches to prevent overwhelming the system
          if (batchIndex > 0 && this.config.batchDelay > 0) {
            await this._delay(this.config.batchDelay);
          }
          
          const batchResults = await this._processBatch(
            observer, 
            batch, 
            calculator, 
            options
          );
          
          // Cache results
          const cacheEntries = [];
          for (const [targetId, result] of batchResults) {
            const target = batch.find(t => t.document.id === targetId);
            if (target) {
              cacheEntries.push({ observer, target, state: result });
            }
          }
          
          positionCacheManager.batchCachePositionStates(cacheEntries, {
            ttl: options.cacheTTL || 30000
          });
          
          // Update adaptive batching metrics
          const batchDuration = performance.now() - batchStartTime;
          this._updateBatchMetrics(batch.length, batchDuration);
          
          return batchResults;
          
        } catch (error) {
          console.warn(`${MODULE_ID} | Batch processing failed:`, error);
          
          // Return error results for failed batch
          const errorResults = new Map();
          for (const target of batch) {
            errorResults.set(target.document.id, this._createErrorResult(error));
          }
          return errorResults;
        }
      });
    });
    
    // Wait for all batches to complete
    const batchResultArrays = await Promise.all(batchPromises);
    
    // Merge all batch results
    for (const batchResults of batchResultArrays) {
      for (const [targetId, result] of batchResults) {
        results.set(targetId, result);
      }
    }
    
    return results;
  }

  /**
   * Processes a single batch of targets
   * @param {Token} observer - Observer token
   * @param {Array<Token>} batch - Batch of target tokens
   * @param {Function} calculator - Calculation function
   * @param {Object} options - Processing options
   * @returns {Promise<Map<string, *>>} Batch results
   * @private
   */
  async _processBatch(observer, batch, calculator, options) {
    const results = new Map();
    const timeout = options.timeout || this.config.timeoutMs;
    
    // Create timeout promise
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Batch processing timeout')), timeout);
    });
    
    // Process batch with timeout
    const batchPromise = Promise.all(
      batch.map(async (target) => {
        try {
          const result = await calculator(observer, target);
          return { id: target.document.id, result };
        } catch (error) {
          console.warn(`${MODULE_ID} | Target calculation failed:`, error);
          return { id: target.document.id, result: this._createErrorResult(error) };
        }
      })
    );
    
    try {
      const batchResults = await Promise.race([batchPromise, timeoutPromise]);
      
      for (const { id, result } of batchResults) {
        results.set(id, result);
      }
      
    } catch (error) {
      console.warn(`${MODULE_ID} | Batch processing failed with timeout:`, error);
      
      // Return error results for all targets in batch
      for (const target of batch) {
        results.set(target.document.id, this._createErrorResult(error));
      }
    }
    
    return results;
  }

  /**
   * Queues operation for processing with concurrency control
   * @param {Function} operation - Operation to queue
   * @param {Object} options - Queue options
   * @returns {Promise<*>} Operation result
   */
  async queueOperation(operation, options = {}) {
    return new Promise((resolve, reject) => {
      const queueItem = {
        operation,
        resolve,
        reject,
        priority: options.priority || 0,
        timestamp: Date.now(),
        timeout: options.timeout || this.config.timeoutMs
      };
      
      // Insert based on priority (higher priority first)
      const insertIndex = this._operationQueue.findIndex(
        item => item.priority < queueItem.priority
      );
      
      if (insertIndex === -1) {
        this._operationQueue.push(queueItem);
      } else {
        this._operationQueue.splice(insertIndex, 0, queueItem);
        }

      
      this._processQueue();
    });
  }

  /**
   * Optimizes multi-target processing with intelligent batching and caching
   * @param {Token} observer - Observer token
   * @param {Array<Token>} targets - Target tokens
   * @param {Function} calculator - Position calculation function
   * @param {Object} options - Optimization options
   * @returns {Promise<Map<string, *>>} Optimized results
   */
  async optimizeMultiTargetProcessing(observer, targets, calculator, options = {}) {
    const startTime = performance.now();
    
    // Early return for small target counts
    if (targets.length <= 5) {
      return this.optimizePositionCalculation(observer, targets, calculator, options);
    }
    
    // Spatial clustering for large token counts
    const clusters = this._spatialClusterTargets(observer, targets, options.maxClusterSize || 8);
    const results = new Map();
    
    // Process clusters in parallel with controlled concurrency
    const clusterPromises = clusters.map(async (cluster, index) => {
      // Stagger cluster processing to prevent system overload
      if (index > 0) {
        await this._delay(this.config.batchDelay * index);
      }
      
      return this.optimizePositionCalculation(observer, cluster, calculator, {
        ...options,
        clustered: true
      });
    });
    
    const clusterResults = await Promise.all(clusterPromises);
    
    // Merge cluster results
    for (const clusterResult of clusterResults) {
      for (const [targetId, result] of clusterResult) {
        results.set(targetId, result);
      }
    }
    
    // Update performance metrics for multi-target processing
    const duration = performance.now() - startTime;
    this._updateMultiTargetMetrics(targets.length, clusters.length, duration);
    
    return results;
  }

  /**
   * Implements memory-efficient streaming for very large token counts
   * @param {Token} observer - Observer token
   * @param {Array<Token>} targets - Target tokens (potentially very large)
   * @param {Function} calculator - Position calculation function
   * @param {Object} options - Streaming options
   * @returns {AsyncGenerator<Map<string, *>>} Streaming results
   */
  async* streamLargeTokenProcessing(observer, targets, calculator, options = {}) {
    const streamBatchSize = options.streamBatchSize || 50;
    const maxMemoryMB = options.maxMemoryMB || 100;
    
    let processedCount = 0;
    let currentMemoryUsage = 0;
    
    for (let i = 0; i < targets.length; i += streamBatchSize) {
      const batch = targets.slice(i, i + streamBatchSize);
      
      // Check memory usage before processing
      if (currentMemoryUsage > maxMemoryMB * 1024 * 1024) {
        // Force garbage collection hint
        if (global.gc) {
          global.gc();
        }
        currentMemoryUsage = 0;
      }
      
      const batchResults = await this.optimizePositionCalculation(
        observer, 
        batch, 
        calculator, 
        options
      );
      
      // Estimate memory usage
      currentMemoryUsage += this._estimateResultsMemoryUsage(batchResults);
      processedCount += batch.length;
      
      // Yield batch results
      yield {
        results: batchResults,
        progress: {
          processed: processedCount,
          total: targets.length,
          percentage: Math.round((processedCount / targets.length) * 100)
        }
      };
      
      // Allow other operations to run
      await this._delay(1);
    }
  }

  /**
   * Implements adaptive performance tuning based on system performance
   * @param {Object} performanceData - Current performance metrics
   */
  adaptPerformanceSettings(performanceData) {
    const { averageOperationTime, memoryUsage, systemLoad } = performanceData;
    
    // Adapt batch size based on performance
    if (averageOperationTime > 100) { // Slow operations
      this._currentOptimalBatchSize = Math.max(5, this._currentOptimalBatchSize - 2);
    } else if (averageOperationTime < 20) { // Fast operations
      this._currentOptimalBatchSize = Math.min(
        this.config.maxBatchSize, 
        this._currentOptimalBatchSize + 1
      );
    }
    
    // Adapt concurrency based on system load
    if (systemLoad > 0.8) {
      this.config.maxConcurrentOperations = Math.max(1, this.config.maxConcurrentOperations - 1);
    } else if (systemLoad < 0.4) {
      this.config.maxConcurrentOperations = Math.min(10, this.config.maxConcurrentOperations + 1);
    }
    
    // Adapt delays based on memory usage
    if (memoryUsage > 0.8) {
      this.config.batchDelay = Math.min(100, this.config.batchDelay + 5);
    } else if (memoryUsage < 0.4) {
      this.config.batchDelay = Math.max(1, this.config.batchDelay - 2);
    }
    
    this.metrics.batchMetrics.adaptiveAdjustments++;
  }

  /**
   * Processes the operation queue
   * @private
   */
  async _processQueue() {
    if (this._isProcessingQueue || this._operationQueue.length === 0) {
      return;
    }
    
    this._isProcessingQueue = true;
    
    while (this._operationQueue.length > 0 && 
           this._activeOperations.size < this.config.maxConcurrentOperations) {
      
      const queueItem = this._operationQueue.shift();
      const operationId = this._generateOperationId();
      
      this._activeOperations.add(operationId);
      
      // Process operation with timeout
      this._processQueueItem(queueItem, operationId);
    }
    
    this._isProcessingQueue = false;
  }

  /**
   * Processes a single queue item
   * @param {Object} queueItem - Queue item to process
   * @param {string} operationId - Operation ID
   * @private
   */
  async _processQueueItem(queueItem, operationId) {
    try {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Operation timeout')), queueItem.timeout);
      });
      
      const result = await Promise.race([
        queueItem.operation(),
        timeoutPromise
      ]);
      
      queueItem.resolve(result);
      
    } catch (error) {
      queueItem.reject(error);
    } finally {
      this._activeOperations.delete(operationId);
      
      // Continue processing queue
      if (this._operationQueue.length > 0) {
        setTimeout(() => this._processQueue(), 0);
      }
    }
  }

  /**
   * Spatially clusters targets for efficient processing
   * @param {Token} observer - Observer token
   * @param {Array<Token>} targets - Target tokens
   * @param {number} maxClusterSize - Maximum cluster size
   * @returns {Array<Array<Token>>} Clustered targets
   * @private
   */
  _spatialClusterTargets(observer, targets, maxClusterSize) {
    if (targets.length <= maxClusterSize) {
      return [targets];
    }
    
    // Simple distance-based clustering
    const clusters = [];
    const remaining = [...targets];
    
    while (remaining.length > 0) {
      const cluster = [remaining.shift()];
      const clusterCenter = cluster[0];
      
      // Find nearby targets for this cluster
      for (let i = remaining.length - 1; i >= 0 && cluster.length < maxClusterSize; i--) {
        const target = remaining[i];
        const distance = this._calculateTokenDistance(clusterCenter, target);
        
        // Add to cluster if within reasonable distance
        if (distance < 500) { // 500 pixels threshold
          cluster.push(remaining.splice(i, 1)[0]);
        }
      }
      
      clusters.push(cluster);
    }
    
    return clusters;
  }

  /**
   * Calculates distance between two tokens
   * @param {Token} token1 - First token
   * @param {Token} token2 - Second token
   * @returns {number} Distance in pixels
   * @private
   */
  _calculateTokenDistance(token1, token2) {
    const dx = token1.x - token2.x;
    const dy = token1.y - token2.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Estimates memory usage of results
   * @param {Map} results - Results map
   * @returns {number} Estimated memory usage in bytes
   * @private
   */
  _estimateResultsMemoryUsage(results) {
    try {
      const serialized = JSON.stringify(Array.from(results.entries()));
      return serialized.length * 2; // Rough estimate
    } catch {
      return results.size * 1024; // Fallback estimate
    }
  }

  /**
   * Updates multi-target processing metrics
   * @param {number} targetCount - Number of targets processed
   * @param {number} clusterCount - Number of clusters used
   * @param {number} duration - Processing duration
   * @private
   */
  _updateMultiTargetMetrics(targetCount, clusterCount, duration) {
    this.metrics.batchMetrics.totalBatches += clusterCount;
    this.metrics.batchMetrics.averageBatchSize = 
      (this.metrics.batchMetrics.averageBatchSize * (this.metrics.batchMetrics.totalBatches - clusterCount) + 
       targetCount) / this.metrics.batchMetrics.totalBatches;
    
    this.metrics.batchMetrics.averageBatchTime = 
      (this.metrics.batchMetrics.averageBatchTime * (this.metrics.batchMetrics.totalBatches - clusterCount) + 
       duration) / this.metrics.batchMetrics.totalBatches;
  }

  /**
   * Filters valid targets for processing
   * @param {Array<Token>} targets - Target tokens
   * @returns {Array<Token>} Valid targets
   * @private
   */
  _filterValidTargets(targets) {
    return targets.filter(target => 
      target && 
      target.document && 
      target.document.id && 
      target.x !== undefined && 
      target.y !== undefined
    );
  }

  /**
   * Gets optimal batch size based on current performance
   * @param {number} totalTargets - Total number of targets
   * @returns {number} Optimal batch size
   * @private
   */
  _getOptimalBatchSize(totalTargets) {
    if (this.config.adaptiveBatching) {
      return Math.min(this._currentOptimalBatchSize, totalTargets);
    }
    return Math.min(this.config.maxBatchSize, totalTargets);
  }

  /**
   * Creates batches from targets
   * @param {Array<Token>} targets - Target tokens
   * @param {number} batchSize - Batch size
   * @returns {Array<Array<Token>>} Batches
   * @private
   */
  _createBatches(targets, batchSize) {
    const batches = [];
    for (let i = 0; i < targets.length; i += batchSize) {
      batches.push(targets.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Updates performance metrics
   * @param {number} duration - Operation duration
   * @param {number} tokenCount - Number of tokens processed
   * @private
   */
  _updateMetrics(duration, tokenCount) {
    this.metrics.totalOperations++;
    this.metrics.totalTokensProcessed += tokenCount;
    
    // Update average operation time
    const totalTime = this.metrics.averageOperationTime * (this.metrics.totalOperations - 1);
    this.metrics.averageOperationTime = (totalTime + duration) / this.metrics.totalOperations;
    
    // Update peak operation time
    if (duration > this.metrics.peakOperationTime) {
      this.metrics.peakOperationTime = duration;
    }
    
    // Update tokens per second
    const totalDuration = this.metrics.averageOperationTime * this.metrics.totalOperations;
    this.metrics.averageTokensPerSecond = (this.metrics.totalTokensProcessed / totalDuration) * 1000;
  }

  /**
   * Updates batch processing metrics
   * @param {number} batchSize - Size of the batch
   * @param {number} duration - Batch processing duration
   * @private
   */
  _updateBatchMetrics(batchSize, duration) {
    this.metrics.batchMetrics.totalBatches++;
    
    // Update average batch size
    const totalSize = this.metrics.batchMetrics.averageBatchSize * (this.metrics.batchMetrics.totalBatches - 1);
    this.metrics.batchMetrics.averageBatchSize = (totalSize + batchSize) / this.metrics.batchMetrics.totalBatches;
    
    // Update average batch time
    const totalTime = this.metrics.batchMetrics.averageBatchTime * (this.metrics.batchMetrics.totalBatches - 1);
    this.metrics.batchMetrics.averageBatchTime = (totalTime + duration) / this.metrics.batchMetrics.totalBatches;
  }

  /**
   * Creates an error result
   * @param {Error} error - The error
   * @returns {Object} Error result
   * @private
   */
  _createErrorResult(error) {
    return {
      error: true,
      message: error.message,
      timestamp: Date.now()
    };
  }

  /**
   * Generates a unique operation ID
   * @returns {string} Operation ID
   * @private
   */
  _generateOperationId() {
    return `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Delays execution for specified milliseconds
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise<void>} Delay promise
   * @private
   */
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Gets current performance metrics
   * @returns {PerformanceMetrics} Performance metrics
   */
  getMetrics() {
    return { ...this.metrics };
  }

  /**
   * Resets performance metrics
   */
  resetMetrics() {
    this.metrics = {
      totalOperations: 0,
      averageOperationTime: 0,
      peakOperationTime: 0,
      totalTokensProcessed: 0,
      averageTokensPerSecond: 0,
      memoryUsage: 0,
      batchMetrics: {
        totalBatches: 0,
        averageBatchSize: 0,
        averageBatchTime: 0,
        adaptiveAdjustments: 0
      }
    };
  }

  /**
   * Destroys the optimizer and cleans up resources
   */
  destroy() {
    this._operationQueue.length = 0;
    this._activeOperations.clear();
    this.resetMetrics();
  }
}

/**
 * Simple semaphore implementation for concurrency control
 */
class Semaphore {
  constructor(maxConcurrency) {
    this.maxConcurrency = maxConcurrency;
    this.currentConcurrency = 0;
    this.queue = [];
  }

  async acquire(operation) {
    return new Promise((resolve, reject) => {
      const task = async () => {
        this.currentConcurrency++;
        try {
          const result = await operation();
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          this.currentConcurrency--;
          this._processQueue();
        }
      };

      if (this.currentConcurrency < this.maxConcurrency) {
        task();
      } else {
        this.queue.push(task);
      }
    });
  }

  _processQueue() {
    if (this.queue.length > 0 && this.currentConcurrency < this.maxConcurrency) {
      const task = this.queue.shift();
      task();
    }
  }
}

// Export singleton instance with default configuration
export default new PerformanceOptimizer({
  maxBatchSize: 20,
  batchDelay: 10,
  maxConcurrentOperations: 5,
  timeoutMs: 5000,
  enableProfiling: true,
  adaptiveBatching: true
});