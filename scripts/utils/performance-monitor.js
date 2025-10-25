/**
 * Performance Monitor - Track FPS drops and identify bottlenecks
 * Helps identify why ephemeral effects still cause FPS drops
 */

import { MODULE_ID } from '../constants.js';
import { debugLogger } from './debug-logger.js';

export class PerformanceMonitor {
  static #instance = null;
  #fpsHistory = [];
  #operationTimings = new Map();
  #isMonitoring = false;
  #lastFrameTime = 0;
  #frameCount = 0;
  #fpsDropThreshold = 45; // Consider FPS < 45 as a drop
  #maxHistorySize = 100;

  constructor() {
    if (PerformanceMonitor.#instance) {
      return PerformanceMonitor.#instance;
    }
    PerformanceMonitor.#instance = this;
  }

  static getInstance() {
    if (!PerformanceMonitor.#instance) {
      PerformanceMonitor.#instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.#instance;
  }

  /**
   * Start monitoring FPS and performance
   */
  startMonitoring() {
    if (this.#isMonitoring) return;
    
    this.#isMonitoring = true;
    this.#lastFrameTime = performance.now();
    this.#frameCount = 0;
    
    debugLogger.generalLog('Performance monitoring started');
    
    // Monitor FPS using requestAnimationFrame
    const monitorFrame = (currentTime) => {
      if (!this.#isMonitoring) return;
      
      this.#frameCount++;
      const deltaTime = currentTime - this.#lastFrameTime;
      
      if (deltaTime >= 1000) { // Update FPS every second
        const fps = Math.round((this.#frameCount * 1000) / deltaTime);
        this.#recordFPS(fps, currentTime);
        this.#frameCount = 0;
        this.#lastFrameTime = currentTime;
      }
      
      requestAnimationFrame(monitorFrame);
    };
    
    requestAnimationFrame(monitorFrame);
    
    debugLogger.generalLog('Performance monitoring started');
  }

  /**
   * Stop monitoring
   */
  stopMonitoring() {
    this.#isMonitoring = false;
    debugLogger.generalLog('Performance monitoring stopped');
  }

  /**
   * Record FPS measurement
   */
  #recordFPS(fps, timestamp) {
    this.#fpsHistory.push({ fps, timestamp });
    
    // Keep only recent history
    if (this.#fpsHistory.length > this.#maxHistorySize) {
      this.#fpsHistory.shift();
    }
    
    // Check for FPS drops
    if (fps < this.#fpsDropThreshold) {
      this.#logFPSDrop(fps, timestamp);
    }
  }

  /**
   * Log FPS drop with context
   */
  #logFPSDrop(fps, timestamp) {
    const recentOperations = Array.from(this.#operationTimings.entries())
      .filter(([_, timing]) => timestamp - timing.endTime < 2000) // Last 2 seconds
      .sort((a, b) => b[1].endTime - a[1].endTime)
      .slice(0, 5); // Top 5 recent operations
    
    debugLogger.generalWarn(`FPS DROP DETECTED: ${fps} FPS`, {
      timestamp: new Date(timestamp).toISOString(),
      recentOperations: recentOperations.map(([name, timing]) => ({
        operation: name,
        duration: timing.duration,
        endTime: new Date(timing.endTime).toISOString()
      })),
      fpsHistory: this.#fpsHistory.slice(-5).map(h => h.fps)
    });
  }

  /**
   * Time an operation
   */
  timeOperation(operationName, operationFn) {
    const startTime = performance.now();
    const result = operationFn();
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    this.#operationTimings.set(operationName, {
      startTime,
      endTime,
      duration
    });
    
    // Log slow operations
    if (duration > 16) { // > 1 frame at 60fps
      debugLogger.generalWarn(`SLOW OPERATION: ${operationName} took ${duration.toFixed(2)}ms`, {
        timestamp: new Date(endTime).toISOString()
      });
    }
    
    return result;
  }

  /**
   * Time an async operation
   */
  async timeAsyncOperation(operationName, operationFn) {
    const startTime = performance.now();
    const result = await operationFn();
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    this.#operationTimings.set(operationName, {
      startTime,
      endTime,
      duration
    });
    
    // Log slow operations
    if (duration > 16) { // > 1 frame at 60fps
      debugLogger.generalWarn(`SLOW ASYNC OPERATION: ${operationName} took ${duration.toFixed(2)}ms`, {
        timestamp: new Date(endTime).toISOString()
      });
    }
    
    return result;
  }

  /**
   * Get performance statistics
   */
  getStats() {
    const recentFPS = this.#fpsHistory.slice(-10);
    const avgFPS = recentFPS.length > 0 
      ? Math.round(recentFPS.reduce((sum, h) => sum + h.fps, 0) / recentFPS.length)
      : 0;
    
    const recentOperations = Array.from(this.#operationTimings.entries())
      .sort((a, b) => b[1].endTime - a[1].endTime)
      .slice(0, 10);
    
    return {
      isMonitoring: this.#isMonitoring,
      avgFPS,
      recentFPS: recentFPS.map(h => h.fps),
      recentOperations: recentOperations.map(([name, timing]) => ({
        operation: name,
        duration: `${timing.duration.toFixed(2)}ms`,
        endTime: new Date(timing.endTime).toISOString()
      })),
      fpsDrops: this.#fpsHistory.filter(h => h.fps < this.#fpsDropThreshold).length
    };
  }

  /**
   * Clear all data
   */
  clear() {
    this.#fpsHistory = [];
    this.#operationTimings.clear();
  }

  /**
   * Enable/disable monitoring based on settings
   */
  updateSettings() {
    const enabled = game.settings?.get?.(MODULE_ID, 'enablePerformanceMonitoring') ?? false;
    if (enabled && !this.#isMonitoring) {
      this.startMonitoring();
    } else if (!enabled && this.#isMonitoring) {
      this.stopMonitoring();
    }
  }
}

// Export singleton instance
export const performanceMonitor = PerformanceMonitor.getInstance();
