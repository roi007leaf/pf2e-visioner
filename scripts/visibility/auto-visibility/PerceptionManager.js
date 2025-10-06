/**
 * OptimizedPerceptionManager - Zero-delay perception refresh for event-driven system
 * Removes throttling since event-driven batching naturally prevents spam
 */

import { MODULE_ID } from '../../constants.js';
import { refreshEveryonesPerception } from '../../services/socket.js';

export class OptimizedPerceptionManager {
  /** @type {OptimizedPerceptionManager} */
  static #instance = null;

  /** @type {boolean} */
  #refreshScheduled = false;

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
   * No artificial delays - relies on event-driven batching to prevent spam
   */
  refreshPerception() {
    // If already scheduled, don't duplicate
    if (this.#refreshScheduled) return;

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
    };
  }
}

// Export singleton instance
export const optimizedPerceptionManager = OptimizedPerceptionManager.getInstance();
