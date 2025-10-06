/**
 * Cover Modifier Service
 * Manages original cover modifiers that were applied to rolls
 * This service provides access to cover modifier storage without creating circular dependencies
 * Singleton pattern ensures all parts of the application share the same storage
 */
class CoverModifierService {
  constructor() {
    // Ensure singleton pattern
    if (CoverModifierService._instance) {
      return CoverModifierService._instance;
    }
    CoverModifierService._instance = this;

    /** @type {Map<string, Object>} Private storage for original cover modifiers */
    this._modifiers = new Map();

    /** @type {number} Maximum age for stored modifiers in milliseconds (10 minutes) */
    this._maxAge = 10 * 60 * 1000;

    /** @type {number|null} Cleanup interval timer */
    this._cleanupTimer = null;

  }

  /**
   * Get the singleton instance of the CoverModifierService
   * @returns {CoverModifierService} The singleton instance
   */
  static getInstance() {
    if (!CoverModifierService._instance) {
      CoverModifierService._instance = new CoverModifierService();
    }
    return CoverModifierService._instance;
  }

  /**
   * Get the original cover modifier that was applied to a roll
   * @param {string} rollId - The roll ID
   * @returns {Object|null} Original cover modifier data or null if not found
   */
  getOriginalCoverModifier(rollId) {
    if (!rollId) return null;

    const modifier = this._modifiers.get(rollId);
    if (!modifier) return null;

    // Check if modifier is expired
    if (this._isExpired(modifier)) {
      this._modifiers.delete(rollId);
      return null;
    }

    return modifier;
  }

  /**
   * Store an original cover modifier for a roll
   * @param {string} rollId - The roll ID
   * @param {Object} modifier - The modifier data to store
   */
  setOriginalCoverModifier(rollId, modifier) {
    if (!rollId || !modifier) return;

    // Ensure timestamp is set
    if (!modifier.timestamp) {
      modifier.timestamp = Date.now();
    }

    this._modifiers.set(rollId, modifier);
  }

  /**
   * Remove an original cover modifier for a roll
   * @param {string} rollId - The roll ID
   * @returns {boolean} True if the modifier was removed, false if it didn't exist
   */
  removeOriginalCoverModifier(rollId) {
    if (!rollId) return false;
    return this._modifiers.delete(rollId);
  }

  /**
   * Clear all original cover modifiers
   */
  clearAllOriginalCoverModifiers() {
    this._modifiers.clear();
  }

  /**
   * Get the size of the modifier storage (for debugging/testing)
   * @returns {number} Number of stored modifiers
   */
  getModifierStorageSize() {
    return this._modifiers.size;
  }

  /**
   * Check if a roll ID has a stored modifier
   * @param {string} rollId - The roll ID
   * @returns {boolean} True if the roll ID has a stored modifier
   */
  hasModifierForRoll(rollId) {
    if (!rollId) return false;

    const modifier = this._modifiers.get(rollId);
    if (!modifier) return false;

    // Check if modifier is expired
    if (this._isExpired(modifier)) {
      this._modifiers.delete(rollId);
      return false;
    }

    return true;
  }

  /**
   * Clean up expired modifiers
   * @returns {number} Number of modifiers cleaned up
   */
  cleanupExpiredModifiers() {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [rollId, modifier] of this._modifiers.entries()) {
      if (this._isExpired(modifier, now)) {
        this._modifiers.delete(rollId);
        cleanedCount++;
      }
    }

    return cleanedCount;
  }

  /**
   * Get all stored modifiers (for debugging)
   * @returns {Array<{rollId: string, modifier: Object}>} Array of all stored modifiers
   */
  getAllModifiers() {
    const result = [];
    for (const [rollId, modifier] of this._modifiers.entries()) {
      if (!this._isExpired(modifier)) {
        result.push({ rollId, modifier });
      }
    }
    return result;
  }

  /**
   * Stop the cleanup timer (called on module unload)
   */
  destroy() {
    if (this._cleanupTimer) {
      clearInterval(this._cleanupTimer);
      this._cleanupTimer = null;
    }
    this._modifiers.clear();
  }

  /**
   * Check if a modifier is expired
   * @param {Object} modifier - The modifier object
   * @param {number} [now] - Current timestamp (optional)
   * @returns {boolean} True if expired
   * @private
   */
  _isExpired(modifier, now = Date.now()) {
    return modifier.timestamp && now - modifier.timestamp > this._maxAge;
  }
}

// Create and export singleton instance
const coverModifierService = CoverModifierService.getInstance();

// Export convenience functions for backward compatibility
export function getOriginalCoverModifier(rollId) {
  return coverModifierService.getOriginalCoverModifier(rollId);
}

export function setOriginalCoverModifier(rollId, modifier) {
  return coverModifierService.setOriginalCoverModifier(rollId, modifier);
}

export function removeOriginalCoverModifier(rollId) {
  return coverModifierService.removeOriginalCoverModifier(rollId);
}

export function clearAllOriginalCoverModifiers() {
  return coverModifierService.clearAllOriginalCoverModifiers();
}

export function getModifierStorageSize() {
  return coverModifierService.getModifierStorageSize();
}

export function hasModifierForRoll(rollId) {
  return coverModifierService.hasModifierForRoll(rollId);
}

// Export the service class and instance
export { CoverModifierService, coverModifierService as default };
