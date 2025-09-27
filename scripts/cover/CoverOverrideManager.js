/**
 * CoverOverrideManager.js
 * Centralized management of cover overrides across different contexts
 */

export class CoverOverrideManager {
  constructor() {
    this.popupOverrides = new Map(); // For popup-based overrides
    this.dialogOverrides = new Map(); // For dialog-based overrides
    this.rollOverrides = new Map(); // For roll-specific overrides

    // Cleanup old overrides periodically
    this.cleanupInterval = setInterval(() => this.cleanup(), 30000); // 30 seconds
  }

  /**
   * Generate a key for token pair
   * @param {Object|string} token1 - First token or ID
   * @param {Object|string} token2 - Second token or ID
   * @returns {string}
   */
  _generateKey(token1, token2) {
    const id1 = typeof token1 === 'string' ? token1 : token1?.id;
    const id2 = typeof token2 === 'string' ? token2 : token2?.id;
    return `${id1}-${id2}`;
  }

  /**
   * Set a popup override (from quick popup during rolls)
   * @param {Object|string} token1
   * @param {Object|string} token2
   * @param {string} coverState
   * @param {string} originalState - The originally detected state
   */
  setPopupOverride(token1, token2, coverState, originalState) {
    // Only store if it's actually different from the original
    if (coverState !== originalState) {
      const key = this._generateKey(token1, token2);
      this.popupOverrides.set(key, {
        state: coverState,
        originalState,
        timestamp: Date.now(),
        source: 'popup',
      });
    }
  }

  /**
   * Set a dialog override (from check modifier dialogs)
   * @param {Object|string} token1
   * @param {Object|string} token2
   * @param {string} coverState
   * @param {string} originalState - The originally detected state
   */
  setDialogOverride(token1, token2, coverState, originalState) {
    // Only store if it's actually different from the original
    if (coverState !== originalState) {
      const key = this._generateKey(token1, token2);
      this.dialogOverrides.set(key, {
        state: coverState,
        originalState,
        timestamp: Date.now(),
        source: 'dialog',
      });
    }
  }

  /**
   * Set a roll-specific override (attached to specific roll instances)
   * @param {Object|string} token1
   * @param {Object|string} token2
   * @param {string} coverState
   * @param {string} originalState
   * @param {string} rollId - Unique identifier for the roll
   */
  setRollOverride(token1, token2, coverState, originalState, rollId) {
    if (coverState !== originalState) {
      const key = `${this._generateKey(token1, token2)}-${rollId}`;
      this.rollOverrides.set(key, {
        state: coverState,
        originalState,
        timestamp: Date.now(),
        source: 'roll',
        rollId,
      });
    }
  }

  /**
   * Get the highest priority override for a token pair
   * @param {Object|string} token1
   * @param {Object|string} token2
   * @param {string} rollId - Optional roll ID for roll-specific overrides
   * @returns {Object|null} Override info or null
   */
  getOverride(token1, token2, rollId = null) {
    const key = this._generateKey(token1, token2);

    // Priority order: roll-specific > dialog > popup
    if (rollId) {
      const rollKey = `${key}-${rollId}`;
      if (this.rollOverrides.has(rollKey)) {
        return this.rollOverrides.get(rollKey);
      }
    }

    if (this.dialogOverrides.has(key)) {
      return this.dialogOverrides.get(key);
    }

    if (this.popupOverrides.has(key)) {
      return this.popupOverrides.get(key);
    }

    return null;
  }

  /**
   * Check if there's an override for a token pair
   * @param {Object|string} token1
   * @param {Object|string} token2
   * @param {string} rollId - Optional roll ID
   * @returns {boolean}
   */
  hasOverride(token1, token2, rollId = null) {
    return this.getOverride(token1, token2, rollId) !== null;
  }

  /**
   * Consume (get and optionally remove) an override
   * @param {Object|string} token1
   * @param {Object|string} token2
   * @param {string} rollId - Optional roll ID
   * @param {boolean} deleteOnConsume - Whether to delete the override after consuming (default: true)
   * @returns {Object|null}
   */
  consumeOverride(token1, token2, rollId = null, deleteOnConsume = true) {
    const key = this._generateKey(token1, token2);

    // Check roll-specific first
    if (rollId) {
      const rollKey = `${key}-${rollId}`;
      if (this.rollOverrides.has(rollKey)) {
        const override = this.rollOverrides.get(rollKey);
        if (deleteOnConsume) {
          this.rollOverrides.delete(rollKey);
        }
        return override;
      }
    }

    // Then dialog overrides
    if (this.dialogOverrides.has(key)) {
      const override = this.dialogOverrides.get(key);
      if (deleteOnConsume) {
        this.dialogOverrides.delete(key);
      }
      return override;
    }

    // Finally popup overrides
    if (this.popupOverrides.has(key)) {
      const override = this.popupOverrides.get(key);
      if (deleteOnConsume) {
        this.popupOverrides.delete(key);
      }
      return override;
    }

    return null;
  }

  /**
   * Get popup override without consuming it
   * @param {Object|string} token1
   * @param {Object|string} token2
   * @returns {Object|null}
   */
  getPopupOverride(token1, token2) {
    const key = this._generateKey(token1, token2);
    return this.popupOverrides.get(key) || null;
  }

  /**
   * Get dialog override without consuming it
   * @param {Object|string} token1
   * @param {Object|string} token2
   * @returns {Object|null}
   */
  getDialogOverride(token1, token2) {
    const key = this._generateKey(token1, token2);
    return this.dialogOverrides.get(key) || null;
  }

  /**
   * Consume popup override only
   * @param {Object|string} token1
   * @param {Object|string} token2
   * @param {boolean} deleteOnConsume
   * @returns {Object|null}
   */
  consumePopupOverride(token1, token2, deleteOnConsume = true) {
    const key = this._generateKey(token1, token2);
    if (this.popupOverrides.has(key)) {
      const override = this.popupOverrides.get(key);
      if (deleteOnConsume) {
        this.popupOverrides.delete(key);
      }
      return override;
    }
    return null;
  }

  /**
   * Consume dialog override only
   * @param {Object|string} token1
   * @param {Object|string} token2
   * @param {boolean} deleteOnConsume
   * @returns {Object|null}
   */
  consumeDialogOverride(token1, token2, deleteOnConsume = true) {
    const key = this._generateKey(token1, token2);
    if (this.dialogOverrides.has(key)) {
      const override = this.dialogOverrides.get(key);
      if (deleteOnConsume) {
        this.dialogOverrides.delete(key);
      }
      return override;
    }
    return null;
  }

  /**
   * Clear overrides for a token pair
   * @param {Object|string} token1
   * @param {Object|string} token2
   */
  clearOverrides(token1, token2) {
    const key = this._generateKey(token1, token2);
    this.popupOverrides.delete(key);
    this.dialogOverrides.delete(key);

    // Clear roll-specific overrides for this pair
    for (const rollKey of this.rollOverrides.keys()) {
      if (rollKey.startsWith(key + '-')) {
        this.rollOverrides.delete(rollKey);
      }
    }
  }

  /**
   * Clear all overrides
   */
  clearAll() {
    this.popupOverrides.clear();
    this.dialogOverrides.clear();
    this.rollOverrides.clear();
  }

  /**
   * Clean up old overrides (older than 5 minutes)
   */
  cleanup() {
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;

    for (const [key, override] of this.popupOverrides.entries()) {
      if (override.timestamp < fiveMinutesAgo) {
        this.popupOverrides.delete(key);
      }
    }

    for (const [key, override] of this.dialogOverrides.entries()) {
      if (override.timestamp < fiveMinutesAgo) {
        this.dialogOverrides.delete(key);
      }
    }

    for (const [key, override] of this.rollOverrides.entries()) {
      if (override.timestamp < fiveMinutesAgo) {
        this.rollOverrides.delete(key);
      }
    }
  }

  /**
   * Destroy the manager and clean up resources
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clearAll();
  }
}

const coverOverrideManager = new CoverOverrideManager();
export default coverOverrideManager;
