/**
 * OptimizedTokenUpdateManager - Zero-delay token update handling for event-driven system
 * Removes throttling since event-driven batching naturally prevents excessive updates
 */

import { MODULE_ID } from '../../constants.js';

export class OptimizedTokenUpdateManager {
  /** @type {OptimizedTokenUpdateManager} */
  static #instance = null;

  /** @type {Set<string>} */
  #processingTokens = new Set();

  /** @type {Function} */
  #visibilityCalculator = null;

  /** @type {Function} */
  #perceptionRefreshCallback = null;

  constructor() {
    if (OptimizedTokenUpdateManager.#instance) {
      return OptimizedTokenUpdateManager.#instance;
    }
    OptimizedTokenUpdateManager.#instance = this;
  }

  /**
   * Get the singleton instance
   * @returns {OptimizedTokenUpdateManager}
   */
  static getInstance() {
    if (!OptimizedTokenUpdateManager.#instance) {
      OptimizedTokenUpdateManager.#instance = new OptimizedTokenUpdateManager();
    }
    return OptimizedTokenUpdateManager.#instance;
  }

  /**
   * Initialize with required dependencies
   * @param {Function} visibilityCalculator - Function to calculate visibility between tokens
   * @param {Function} perceptionRefreshCallback - Function to refresh perception
   */
  initialize(visibilityCalculator, perceptionRefreshCallback) {
    this.#visibilityCalculator = visibilityCalculator;
    this.#perceptionRefreshCallback = perceptionRefreshCallback;
  }

  /**
   * Handle token updates (movement, light changes, etc.) - IMMEDIATE processing
   * @param {TokenDocument} tokenDoc
   * @param {Object} changes
   * @returns {boolean} Whether an update was triggered
   */
  handleTokenUpdate(tokenDoc, changes) {

    // Check if position or light properties changed
    const positionChanged = changes.x !== undefined || changes.y !== undefined;
    const lightChanged = changes.light !== undefined;
    const actorChanged = changes.actorId !== undefined || changes.actorData !== undefined;

    // Handle movement updates (gated by movement setting)

    let significantPositionChange = false;
    if (positionChanged) {
      significantPositionChange = this.#isSignificantPositionChange(tokenDoc, changes);
    }
    const shouldUpdateForLighting = lightChanged;

    // Handle actor changes (always processed if movement updates are enabled)
    const shouldUpdateForActor = actorChanged;

    if (significantPositionChange || shouldUpdateForLighting || shouldUpdateForActor) {

      // IMMEDIATE update - no delays
      this.updateTokenVisibility(tokenDoc);
      return true;
    }

    return false;
  }

  /**
   * Handle token creation - IMMEDIATE processing
   * @param {TokenDocument} tokenDoc
   * @param {Function} cacheInvalidationCallback - Function to invalidate caches
   */
  handleTokenCreate(tokenDoc, cacheInvalidationCallback) {
    // Invalidate caches when new tokens are created
    if (cacheInvalidationCallback) {
      cacheInvalidationCallback();
    }

    // Update visibility for the new token IMMEDIATELY
    this.updateTokenVisibility(tokenDoc);
  }

  /**
   * Check if position change is significant enough to warrant an update
   * @param {TokenDocument} tokenDoc
   * @param {Object} changes
   * @returns {boolean}
   */
  #isSignificantPositionChange(tokenDoc, changes) {
    const currentX = tokenDoc.x || 0;
    const currentY = tokenDoc.y || 0;
    const newX = changes.x !== undefined ? changes.x : currentX;
    const newY = changes.y !== undefined ? changes.y : currentY;

    // Only update if moved more than half a grid square (50 pixels default)
    const gridSize = canvas.grid?.size || 100;
    const threshold = gridSize * 0.5;
    const distance = Math.sqrt(Math.pow(newX - currentX, 2) + Math.pow(newY - currentY, 2));
    const significantChange = distance >= threshold;

    return significantChange;
  }

  /**
   * Update visibility for a specific token relative to all other tokens - IMMEDIATE
   * @param {TokenDocument} tokenDoc
   */
  async updateTokenVisibility(tokenDoc) {
    if (this.#processingTokens.has(tokenDoc.id)) return;

    this.#processingTokens.add(tokenDoc.id);

    try {
      const tokens = canvas.tokens?.placeables?.filter((t) => t.actor) || [];
      const targetToken = tokens.find((t) => t.document.id === tokenDoc.id);

      if (!targetToken) {
        return;
      }

      // Process visibility with all other tokens immediately
      await this.updateAllTokensVisibility([targetToken]);
    } finally {
      this.#processingTokens.delete(tokenDoc.id);
    }
  }

  /**
   * Process all tokens for visibility updates - IMMEDIATE
   * @param {Array<Token>} tokens - Array of tokens to process
   */
  async updateAllTokensVisibility(tokens) {
    const maxTokensToProcess = 50; // Increased limit since we're not throttling
    const tokensToProcess = tokens.slice(0, maxTokensToProcess);

    // Process all updates immediately
    for (const observerToken of tokensToProcess) {
      if (!observerToken?.actor) continue;

      // Calculate visibility to all other tokens
      for (const targetToken of tokensToProcess) {
        if (!targetToken?.actor || observerToken === targetToken) continue;

        // Calculate and apply new visibility
        if (this.#visibilityCalculator) {
          await this.#visibilityCalculator(observerToken, targetToken);
          // Visibility application is handled by the event-driven system
        }
      }
    }

    // Refresh perception once for all updates
    if (this.#perceptionRefreshCallback) {
      this.#perceptionRefreshCallback();
    }
  }

  /**
   * Check if a token is currently being processed
   * @param {string} tokenId
   * @returns {boolean}
   */
  isProcessingToken(tokenId) {
    return this.#processingTokens.has(tokenId);
  }

  /**
   * Get status information
   * @returns {Object}
   */
  getStatus() {
    return {
      processingTokens: Array.from(this.#processingTokens),
      processingCount: this.#processingTokens.size,
    };
  }

  /**
   * Clean up resources
   */
  cleanup() {
    this.#processingTokens.clear();
  }
}

// Export singleton instance
export const optimizedTokenUpdateManager = OptimizedTokenUpdateManager.getInstance();
