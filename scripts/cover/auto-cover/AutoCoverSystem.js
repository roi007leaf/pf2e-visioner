/**
 * Main manager for the auto-cover system
 * Coordinates between different subsystems and provides main API
 */

import { MODULE_ID } from '../../constants.js';
import coverOverrideManager from '../../cover/CoverOverrideManager.js';
import { getCoverBonusByState } from '../../helpers/cover-helpers.js';
import coverDetector from './CoverDetector.js';
import coverStateManager from './CoverStateManager.js';
export class AutoCoverSystem {
  /**
   * @type {CoverDetector}
   * @private
   */
  _detector = null;

  /**
   * @type {CoverStateManager}
   * @private
   */
  _stateManager = null;

  /**
   * @type {CoverOverrideManager}
   * @private
   */
  _overrideManager = null;

  /**
   * Store attacker→target pairs for cleanup
   * @type {Map<string, Set<string>>}
   * @private
   */
  _activePairsByAttacker = new Map();

  constructor() {
    this._detector = coverDetector;
    this._stateManager = coverStateManager;
    this._overrideManager = coverOverrideManager;
  }

  /**
   * Check if auto-cover is enabled in settings
   * @returns {boolean}
   */
  isEnabled() {
    return game.settings.get(MODULE_ID, 'autoCover');
  }

  /**
   * Records an attacker-target pair for later cleanup
   * @param {string} attackerId
   * @param {string} targetId
   */
  recordPair(attackerId, targetId) {
    if (!attackerId || !targetId) return;
    let set = this._activePairsByAttacker.get(attackerId);
    if (!set) {
      set = new Set();
      this._activePairsByAttacker.set(attackerId, set);
    }
    set.add(targetId);
  }

  /**
   * Consumes and returns all target IDs associated with an attacker
   * @param {string} attackerId
   * @returns {Array<string>}
   */
  consumePairs(attackerId) {
    const set = this._activePairsByAttacker.get(attackerId);
    if (!set) return [];
    const arr = Array.from(set);
    this._activePairsByAttacker.delete(attackerId);
    return arr;
  }

  /**
   * Gets all active pairs involving a specific token ID
   * @param {string} tokenId
   * @returns {Array<{attackerId: string, targetId: string}>}
   */
  getActivePairsInvolving(tokenId) {
    const pairs = [];
    // As attacker
    const tset = this._activePairsByAttacker.get(tokenId);
    if (tset && tset.size > 0) {
      for (const targetId of tset) pairs.push({ attackerId: tokenId, targetId });
    }
    // As target
    for (const [attackerId, set] of this._activePairsByAttacker.entries()) {
      if (set.has(tokenId)) pairs.push({ attackerId, targetId: tokenId });
    }
    return pairs;
  }

  /**
   * Detects cover from a point to a target
   * @param {Object} origin - Point with x,y coordinates
   * @param {Object} target - Target token
   * @param {Object} options - Additional options
   * @returns {string} Cover state ('none', 'lesser', 'standard', 'greater')
   */
  detectCoverFromPoint(origin, target, options = {}) {
    return this._detector.detectFromPoint(origin, target, options);
  }

  /**
   * Detects cover between an attacker and target
   * @param {Object} attacker - Attacker token
   * @param {Object} target - Target token
   * @param {Object} options - Additional options
   * @returns {string} Cover state ('none', 'lesser', 'standard', 'greater')
   */
  detectCoverBetweenTokens(attacker, target, options = {}) {
    return this._detector.detectBetweenTokens(attacker, target, options);
  }

  /**
   * Applies auto-cover between two tokens
   * @param {Object} attacker - Attacker token
   * @param {Object} target - Target token
   * @param {string} state - Cover state
   * @param {Object} options - Additional options
   */
  async setCoverBetween(attacker, target, state, options = {}) {
    return this._stateManager.setCoverBetween(attacker, target, state, options);
  }

  getCoverBetween(attacker, target) {
    return this._stateManager.getCoverBetween(attacker, target);
  }

  /**
   * Cleans up cover for an attacker-target pair
   * @param {Object} attacker - Attacker token
   * @param {Object} target - Target token
   */
  async cleanupCover(attacker, target) {
    if (!attacker || !target) return;
    await this.setCoverBetween(attacker, target, 'none', { skipEphemeralUpdate: false });
    const targets = this._activePairsByAttacker.get(attacker.id);
    targets?.delete(target.id);
    if (targets?.size === 0) {
      this._activePairsByAttacker.delete(attacker.id);
    }
  }

  /**
   * Gets the override manager
   * @returns {CoverOverrideManager}
   */
  getOverrideManager() {
    return this._overrideManager;
  }

  /**
   * Set a popup override for token pair
   * @param {Object|string} token1
   * @param {Object|string} token2
   * @param {string} coverState
   * @param {string} originalState
   */
  setPopupOverride(token1, token2, coverState, originalState) {
    this._overrideManager.setPopupOverride(token1, token2, coverState, originalState);
  }

  /**
   * Set a dialog override for token pair
   * @param {Object|string} token1
   * @param {Object|string} token2
   * @param {string} coverState
   * @param {string} originalState
   */
  setDialogOverride(token1, token2, coverState, originalState) {
    this._overrideManager.setDialogOverride(token1, token2, coverState, originalState);
  }

  setRollOverride(token1, token2, rollId, originalState, coverState) {
    this._overrideManager.setRollOverride(token1, token2, coverState, originalState, rollId);
  }

  /**
   * Get and consume override for token pair
   * @param {Object|string} token1
   * @param {Object|string} token2
   * @param {string} rollId
   * @param {boolean} deleteOnConsume - Whether to delete the override after consuming (default: true)
   * @returns {Object|null}
   */
  consumeCoverOverride(token1, token2, rollId = null, deleteOnConsume = true) {
    return this._overrideManager.consumeOverride(token1, token2, rollId, deleteOnConsume);
  }

  /**
   * Get popup override for token pair without consuming
   * @param {Object|string} token1
   * @param {Object|string} token2
   * @returns {Object|null}
   */
  getPopupOverride(token1, token2) {
    return this._overrideManager.getPopupOverride(token1, token2);
  }

  /**
   * Get dialog override for token pair without consuming
   * @param {Object|string} token1
   * @param {Object|string} token2
   * @returns {Object|null}
   */
  getDialogOverride(token1, token2) {
    return this._overrideManager.getDialogOverride(token1, token2);
  }

  /**
   * Consume popup override only
   * @param {Object|string} token1
   * @param {Object|string} token2
   * @param {boolean} deleteOnConsume
   * @returns {Object|null}
   */
  consumePopupOverride(token1, token2, deleteOnConsume = true) {
    return this._overrideManager.consumePopupOverride(token1, token2, deleteOnConsume);
  }

  /**
   * Consume dialog override only
   * @param {Object|string} token1
   * @param {Object|string} token2
   * @param {boolean} deleteOnConsume
   * @returns {Object|null}
   */
  consumeDialogOverride(token1, token2, deleteOnConsume = true) {
    return this._overrideManager.consumeDialogOverride(token1, token2, deleteOnConsume);
  }

  /**
   * Check if there's an override for token pair
   * @param {Object|string} token1
   * @param {Object|string} token2
   * @param {string} rollId
   * @returns {boolean}
   */
  hasCoverOverride(token1, token2, rollId = null) {
    return this._overrideManager.hasOverride(token1, token2, rollId);
  }

  /**
   * Clear overrides for a token pair
   * @param {Object|string} token1
   * @param {Object|string} token2
   */
  clearCoverOverrides(token1, token2) {
    this._overrideManager.clearOverrides(token1, token2);
  }

  /**
   * Remove all cover involving a specific token
   * @param {string} tokenId - Token ID
   */
  removeAllCoverInvolving(tokenId) {
    // As attacker: delete all entries from this attacker
    this._activePairsByAttacker.delete(tokenId);

    // As target: remove from any attackers that target this token
    for (const [, targets] of this._activePairsByAttacker.entries()) {
      if (targets.has(tokenId)) {
        targets.delete(tokenId);
      }
    }
  }

  async onUpdateDocument(document, changes) {
    if (document?.documentName !== 'Token') return;
    // Skip if auto-cover is disabled
    if (!this.isEnabled()) return;

    // Skip if not a position or size change
    if (!('x' in changes) && !('y' in changes) && !('width' in changes) && !('height' in changes)) return;

    const tokenId = document.id;
    const token = canvas?.tokens?.get(tokenId);
    if (!token) return;

    // Update all active cover relationships
    const pairs = this.getActivePairsInvolving(tokenId);
    for (const pair of pairs) {
      const attacker = canvas.tokens.get(pair.attackerId);
      const target = canvas.tokens.get(pair.targetId);

      if (attacker && target) {
        await this.cleanupCover(attacker, target);
      }
    }
    return;
  }

  async onDeleteDocument(document) {
    // Handle token deletion
    if (!document?.documentName === 'Token') return;
    const tokenId = document.id;
    this.removeAllCoverInvolving(tokenId);
  }

  getCoverBonusByState(state) {
    return getCoverBonusByState(state);
  }

  normalizeTokenRef(ref) {
    try {
      if (!ref) return null;

      // Handle object types with _id or id properties
      if (typeof ref === 'object' && ref !== null) {
        if (ref._id) return ref._id;
        if (ref.id) return ref.id;
        // If it's a complex object, try to convert to string and process
        ref = String(ref);
      }

      let s = typeof ref === 'string' ? ref.trim() : String(ref);
      // Strip surrounding quotes
      if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))
        s = s.slice(1, -1);
      // If it's a UUID, extract the final Token.<id> segment
      const m = s.match(/Token\.([^.\s]+)$/);
      if (m && m[1]) return m[1];
      // Otherwise assume it's already the token id
      return s;
    } catch (_) {
      return ref;
    }
  }
}

// Singleton instance
const autoCoverSystem = new AutoCoverSystem();
export default autoCoverSystem;
