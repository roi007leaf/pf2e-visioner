/**
 * SneakCore - Unified service for all sneak action functionality
 * Consolidates position tracking, system integration, state management, and dialog logic
 * Eliminates duplication across SneakActionHandler, SneakPreviewDialog, DualSystemIntegration, and SneakPositionTracker
 */

import { shouldFilterAlly } from './infra/shared-utils.js';
import simplifiedPositionTracker from './simplified-position-tracker.js';
import unifiedSystemIntegration from './unified-system-integration.js';

/**
 * Unified sneak state data structure
 * @typedef {Object} SneakState
 * @property {Token} sneakingToken - The token performing the sneak
 * @property {Array<Token>} observers - Observer tokens
 * @property {Map<string, PositionState>} startPositions - Start position states
 * @property {Map<string, PositionState>} endPositions - End position states
 * @property {Map<string, PositionTransition>} transitions - Position transitions
 * @property {Object} actionData - Action data from the original action
 * @property {boolean} isTracking - Whether position tracking is active
 * @property {number} timestamp - When the sneak action started
 */

/**
 * Simplified position state combining all necessary data
 * @typedef {Object} PositionState
 * @property {string} visibility - Current visibility state
 * @property {string} coverState - Current cover state
 * @property {number} stealthBonus - Stealth bonus from cover
 * @property {number} distance - Distance between tokens
 * @property {boolean} calculated - Whether calculation was successful
 * @property {Array<string>} errors - Any errors encountered
 */

export class SneakCore {
  constructor() {
    this._activeStates = new Map(); // messageId -> SneakState
    this._initialized = false;
    this._systemIntegration = unifiedSystemIntegration;
    this._positionTracker = simplifiedPositionTracker;
  }

  /**
   * Initialize the core service
   */
  async initialize() {
    if (this._initialized) return true;

    try {
      await this._systemIntegration.initialize();
      this._initialized = true;
      return true;
    } catch (error) {
      console.warn('PF2E Visioner | SneakCore initialization failed:', error);
      return false;
    }
  }

  /**
   * Start a new sneak action session
   * @param {Token} sneakingToken - The sneaking token
   * @param {Array<Token>} observers - Observer tokens
   * @param {Object} actionData - Action data
   * @returns {Promise<string>} Session ID
   */
  async startSneakSession(sneakingToken, observers, actionData) {
    await this.initialize();

    const sessionId = actionData.messageId || `sneak-${Date.now()}`;
    const timestamp = Date.now();

    // Filter observers based on ally settings
    const filteredObservers = observers.filter(observer =>
      !shouldFilterAlly(observer, sneakingToken)
    );

    // If no explicit stored start position was provided, populate a default using the token's current center
    try {
      if (!actionData.storedStartPosition && sneakingToken) {
        const cx = sneakingToken?.center?.x;
        const cy = sneakingToken?.center?.y;
        const ex = sneakingToken?.document?.elevation || 0;
        if (typeof cx === 'number' && typeof cy === 'number') {
          actionData.storedStartPosition = {
            x: typeof sneakingToken.x === 'number' ? sneakingToken.x : undefined,
            y: typeof sneakingToken.y === 'number' ? sneakingToken.y : undefined,
            center: { x: cx, y: cy },
            elevation: ex,
            tokenId: sneakingToken.id,
            tokenName: sneakingToken.name,
            timestamp
          };
        }
      }
    } catch { }

    // Capture start positions
    const startPositions = await this._capturePositions(sneakingToken, filteredObservers, {
      timestamp,
      useStoredPosition: actionData.storedStartPosition
    });

    // Create sneak state
    const sneakState = {
      sneakingToken,
      observers: filteredObservers,
      startPositions,
      endPositions: new Map(),
      transitions: new Map(),
      actionData,
      isTracking: true,
      timestamp
    };

    this._activeStates.set(sessionId, sneakState);

    // Set sneak flag unless this is a preview-only session
    if (!actionData?.previewOnly) {
      await this._setSneakFlag(sneakingToken, true);
    }

    return sessionId;
  }


  /**
   * Apply sneak results using unified system
   * @param {string} sessionId - Session ID
   * @param {Array<Object>} outcomes - Processed outcomes
   * @param {Object} options - Application options
   * @returns {Promise<Object>} Application result
   */
  async applyResults(sessionId, outcomes, options = {}) {

    const state = this._activeStates.get(sessionId);
    if (!state) {
      console.error('PF2E Visioner | No active sneak state for session:', sessionId);
      throw new Error(`No active sneak state for session: ${sessionId}`);
    }

    try {
      // Convert outcomes to sneak results format
      const sneakResults = this._convertToSneakResults(outcomes, state);

      // Apply using dual system (only visibility changes for sneak)
      const { default: dualSystemApplication } = await import('./dual-system-result-application.js');

      const result = await dualSystemApplication.applySneakResults(sneakResults, {
        direction: 'observer_to_target',
        skipCoverChanges: true, // Sneak only affects visibility
        ...options
      });

      if (result.success) {
        // Cache for revert functionality
        this._cacheApplicationResult(sessionId, result);
      }

      return result;
    } catch (error) {
      console.error('PF2E Visioner | Failed to apply sneak results:', error);
      throw error;
    }
  }

  /**
   * Revert sneak results
   * @param {string} sessionId - Session ID
   * @returns {Promise<boolean>} Whether revert succeeded
   */
  async revertResults(sessionId) {
    const cachedResult = this._getCachedResult(sessionId);
    if (!cachedResult) {
      console.warn('PF2E Visioner | No cached result to revert for session:', sessionId);
      return false;
    }

    try {
      const { default: dualSystemApplication } = await import('./dual-system-result-application.js');
      const success = await dualSystemApplication.rollbackTransaction(cachedResult.transactionId);

      if (success) {
        this._clearCachedResult(sessionId);
      }

      return success;
    } catch (error) {
      console.error('PF2E Visioner | Failed to revert sneak results:', error);
      return false;
    }
  }


  /**
   * Get current sneak state for a session
   * @param {string} sessionId - Session ID
   * @returns {SneakState|null} Current state or null
   */
  getSneakState(sessionId) {
    return this._activeStates.get(sessionId) || null;
  }

  // Private methods

  /**
   * Capture position states for all observers
   * @private
   */
  async _capturePositions(sneakingToken, observers, options = {}) {
    // Use simplified position tracker for batch processing
    return await this._positionTracker.capturePositions(sneakingToken, observers, options);
  }

  /**
   * Convert outcomes to sneak results format
   * @private
   */
  _convertToSneakResults(outcomes, state) {
    return outcomes.map(outcome => ({
      token: outcome.token,
      actor: state.sneakingToken,
      newVisibility: outcome.newVisibility,
      oldVisibility: outcome.oldVisibility || outcome.currentVisibility,
      positionTransition: outcome.positionTransition,
      overrideState: outcome.overrideState
    }));
  }

  async _setSneakFlag(token, active) {
    try {
      if (active) {
        await token.document.setFlag('pf2e-visioner', 'sneak-active', true);
      } else {
        await token.document.unsetFlag('pf2e-visioner', 'sneak-active');
      }
    } catch (error) {
      console.warn('PF2E Visioner | Failed to set sneak flag:', error);
    }
  }

  // Cache management for apply/revert functionality
  _cacheApplicationResult(sessionId, result) {
    if (!this._resultCache) this._resultCache = new Map();
    this._resultCache.set(sessionId, result);
  }

  _getCachedResult(sessionId) {
    return this._resultCache?.get(sessionId) || null;
  }

  _clearCachedResult(sessionId) {
    this._resultCache?.delete(sessionId);
  }
}

export default new SneakCore();