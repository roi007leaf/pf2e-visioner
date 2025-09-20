/**
 * VisibilityOverrideManager.js
 * Centralized management of visibility overrides to prevent AVS from recalculating manually set states
 * Similar to CoverOverrideManager but specifically for visibility states
 */

export class VisibilityOverrideManager {
  constructor() {
    this.visibilityOverrides = new Map(); // Key: "tokenId1->tokenId2", Value: override data
  }

  /**
   * Generate a key for token pair
   * @param {Object|string} token1 - First token or ID
   * @param {Object|string} token2 - Second token or ID
   * @returns {string}
   */
  _generateKey(token1, token2) {
    const id1 = typeof token1 === 'string' ? token1 : token1?.document?.id || token1?.id;
    const id2 = typeof token2 === 'string' ? token2 : token2?.document?.id || token2?.id;

    if (!id1 || !id2) {
      throw new Error('Invalid tokens provided to visibility override manager');
    }

    return `${id1}->${id2}`;
  }

  /**
   * Set a visibility override for a token pair
   * @param {Object|string} observer - Observer token or ID
   * @param {Object|string} target - Target token or ID
   * @param {string} visibilityState - Visibility state to override with
   * @param {number} durationMinutes - How long the override should last (default: 5 minutes)
   * @param {string} source - Source of the override (e.g., 'manual_action', 'sneak', 'dialog')
   */
  setVisibilityOverride(observer, target, visibilityState, durationMinutes = 5, source = 'manual') {
    const key = this._generateKey(observer, target);
    const expiryTime = Date.now() + (durationMinutes * 60 * 1000);

    const observerId = typeof observer === 'string' ? observer : observer?.document?.id || observer?.id;
    const targetId = typeof target === 'string' ? target : target?.document?.id || target?.id;

    this.visibilityOverrides.set(key, {
      observerId,
      targetId,
      visibilityState,
      timestamp: Date.now(),
      expiryTime,
      source,
    });
  }

  /**
   * Get visibility override for a token pair
   * @param {Object|string} observer - Observer token or ID
   * @param {Object|string} target - Target token or ID
   * @returns {Object|null} Override data or null if none exists
   */
  getVisibilityOverride(observer, target) {
    const key = this._generateKey(observer, target);
    const override = this.visibilityOverrides.get(key);

    if (!override) {
      return null;
    }

    // Check if override has expired
    if (Date.now() > override.expiryTime) {
      this.visibilityOverrides.delete(key);
      return null;
    }

    return override;
  }

  /**
   * Check if there's an active override for a token pair
   * @param {Object|string} observer - Observer token or ID
   * @param {Object|string} target - Target token or ID
   * @returns {boolean} Whether an active override exists
   */
  hasVisibilityOverride(observer, target) {
    return this.getVisibilityOverride(observer, target) !== null;
  }

  /**
   * Remove visibility override for a token pair
   * @param {Object|string} observer - Observer token or ID
   * @param {Object|string} target - Target token or ID
   * @returns {boolean} Whether an override was removed
   */
  removeVisibilityOverride(observer, target) {
    const key = this._generateKey(observer, target);
    const existed = this.visibilityOverrides.has(key);

    if (existed) {
      this.visibilityOverrides.delete(key);
    }

    return existed;
  }

  /**
   * Remove all overrides involving a specific token
   * @param {string} tokenId - Token ID
   */
  removeAllOverridesInvolving(tokenId) {
    const keysToRemove = [];

    for (const [key, override] of this.visibilityOverrides.entries()) {
      if (override.observerId === tokenId || override.targetId === tokenId) {
        keysToRemove.push(key);
      }
    }

    for (const key of keysToRemove) {
      this.visibilityOverrides.delete(key);
    }
  }

  /**
   * Clean up expired overrides
   */
  cleanup() {
    const now = Date.now();
    const keysToRemove = [];

    for (const [key, override] of this.visibilityOverrides.entries()) {
      if (now > override.expiryTime) {
        keysToRemove.push(key);
      }
    }

    for (const key of keysToRemove) {
      this.visibilityOverrides.delete(key);
    }
  }

  /**
   * Clear all overrides
   */
  clearAll() {
    this.visibilityOverrides.clear();
  }

  /**
   * Destroy the manager and clean up resources
   */
  destroy() {
    this.clearAll();
  }
}

const visibilityOverrideManager = new VisibilityOverrideManager();

// Set up periodic cleanup (every 2 minutes)
setInterval(() => {
  visibilityOverrideManager.cleanup();
}, 2 * 60 * 1000);


export default visibilityOverrideManager;