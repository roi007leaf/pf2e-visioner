/**
 * OptimizedPerceptionManager - Zero-delay perception refresh for event-driven system
 * Removes throttling since event-driven batching naturally prevents spam
 */

import { MODULE_ID } from '../../constants.js';
import { refreshEveryonesPerception } from '../../services/socket.js';
import { performanceMonitor } from '../../utils/performance-monitor.js';

export class OptimizedPerceptionManager {
  /** @type {OptimizedPerceptionManager} */
  static #instance = null;

  /** @type {boolean} */
  #refreshScheduled = false;

  /** @type {number} */
  #lastRefreshTime = 0;

  /** @type {number} */
  #minRefreshInterval = 16; // ~60fps minimum interval (16ms)

  /** @type {number} */
  #animationRefreshInterval = 33; // ~30fps during animations (33ms)

  /** @type {boolean} */
  #isTokenAnimating = false;

  /** @type {Set<string>} */
  #animatingTokens = new Set();

  constructor() {
    if (OptimizedPerceptionManager.#instance) {
      return OptimizedPerceptionManager.#instance;
    }
    OptimizedPerceptionManager.#instance = this;
  }

  /**
   * Get the singleton instance
   * @returns {OptimizedPerceptionManager}
   */
  static getInstance() {
    if (!OptimizedPerceptionManager.#instance) {
      OptimizedPerceptionManager.#instance = new OptimizedPerceptionManager();
    }
    return OptimizedPerceptionManager.#instance;
  }

  /**
   * Refresh perception immediately or schedule for next frame
   * Includes moderate throttling during animations to prevent FPS drops
   * without breaking LOS functionality
   */
  refreshPerception() {
    const now = performance.now();
    
    // If already scheduled, don't duplicate
    if (this.#refreshScheduled) return;
    
    const timeSinceLastRefresh = now - this.#lastRefreshTime;
    
    // During animations, use moderate throttling (50ms = 20fps max)
    if (this.#isTokenAnimating) {
      if (timeSinceLastRefresh < 50) {
        this.#refreshScheduled = true;
        requestAnimationFrame(() => {
          this.#doRefreshPerception();
          this.#refreshScheduled = false;
        });
        return;
      }
    } else {
      // Normal throttling when not animating
      if (timeSinceLastRefresh < this.#minRefreshInterval) {
        this.#refreshScheduled = true;
        requestAnimationFrame(() => {
          this.#doRefreshPerception();
          this.#refreshScheduled = false;
        });
        return;
      }
    }

    this.#refreshScheduled = true;

    // Use requestAnimationFrame for optimal timing with rendering
    requestAnimationFrame(() => {
      this.#doRefreshPerception();
      this.#refreshScheduled = false;
    });
  }

  /**
   * Force immediate perception refresh without scheduling
   * Use sparingly - prefer refreshPerception() for normal use
   */
  forceRefreshPerception() {
    this.#refreshScheduled = false;
    this.#doRefreshPerception();
  }

  /**
   * Internal method that actually performs the perception refresh
   * @private
   */
  #doRefreshPerception() {
    performanceMonitor.timeOperation('perceptionRefresh', () => {
      this.#lastRefreshTime = performance.now();
      
      try {
        // Refresh everyone's perception via socket
        refreshEveryonesPerception();
      } catch (error) {
        console.warn(`${MODULE_ID} | Error refreshing everyone's perception:`, error);
      }

      try {
        // Also refresh local canvas perception
        canvas.perception.update({
          refreshVision: true,
          refreshLighting: false,
          refreshOcclusion: true,
        });
      } catch (error) {
        console.warn(`${MODULE_ID} | Error refreshing canvas perception:`, error);
      }
    });
  }

  /**
   * Check if a perception refresh is currently scheduled
   * @returns {boolean}
   */
  isRefreshScheduled() {
    return this.#refreshScheduled;
  }

  /**
   * Cancel any scheduled perception refresh
   */
  cancelScheduledRefresh() {
    this.#refreshScheduled = false;
  }

  /**
   * Mark a token as animating to reduce perception update frequency
   * @param {string} tokenId - The token ID
   */
  markTokenAnimating(tokenId) {
    this.#animatingTokens.add(tokenId);
    this.#isTokenAnimating = this.#animatingTokens.size > 0;
  }

  /**
   * Mark a token as finished animating
   * @param {string} tokenId - The token ID
   */
  markTokenAnimationComplete(tokenId) {
    this.#animatingTokens.delete(tokenId);
    this.#isTokenAnimating = this.#animatingTokens.size > 0;
  }

  /**
   * Check if any tokens are currently animating
   * @returns {boolean}
   */
  isAnyTokenAnimating() {
    return this.#isTokenAnimating;
  }

  /**
   * Clean up resources
   */
  cleanup() {
    this.cancelScheduledRefresh();
  }

  /**
   * Get status information
   * @returns {Object}
   */
  getStatus() {
    return {
      refreshScheduled: this.#refreshScheduled,
      isTokenAnimating: this.#isTokenAnimating,
      animatingTokens: Array.from(this.#animatingTokens),
      currentRefreshInterval: this.#isTokenAnimating ? this.#animationRefreshInterval : this.#minRefreshInterval
    };
  }
}

// Export singleton instance
export const optimizedPerceptionManager = OptimizedPerceptionManager.getInstance();
