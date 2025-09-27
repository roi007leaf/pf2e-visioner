/**
 * Simplified Position Tracker - Condensed position tracking for sneak actions
 * Replaces the complex SneakPositionTracker with a streamlined approach
 * Uses unified system integration as the single source of truth
 */

import unifiedSystemIntegration from './unified-system-integration.js';
import errorHandlingService, { SYSTEM_TYPES } from './infra/error-handling-service.js';

/**
 * Simplified position state
 * @typedef {Object} PositionState
 * @property {string} visibility - Visibility state
 * @property {string} coverState - Cover state
 * @property {number} stealthBonus - Stealth bonus
 * @property {number} distance - Distance between tokens
 * @property {boolean} calculated - Whether calculation succeeded
 * @property {Array<string>} errors - Any errors
 * @property {number} timestamp - When captured
 */

/**
 * Position transition
 * @typedef {Object} PositionTransition
 * @property {PositionState} startPosition - Start position
 * @property {PositionState} endPosition - End position
 * @property {boolean} hasChanged - Whether position changed
 * @property {boolean} visibilityChanged - Whether visibility changed
 * @property {boolean} coverChanged - Whether cover changed
 * @property {number} stealthBonusChange - Change in stealth bonus
 * @property {string} transitionType - 'improved', 'worsened', or 'unchanged'
 */

export class SimplifiedPositionTracker {
  constructor() {
    this._systemIntegration = unifiedSystemIntegration;
  }

  /**
   * Capture positions for multiple observers
   * @param {Token} sneakingToken - The sneaking token
   * @param {Array<Token>} observers - Observer tokens
   * @param {Object} options - Capture options
   * @returns {Promise<Map<string, PositionState>>} Map of observer ID to position state
   */
  async capturePositions(sneakingToken, observers, options = {}) {
    const timestamp = options.timestamp || Date.now();
    const positions = new Map();

    try {
      // Use batch processing for efficiency
      const batchResults = await this._systemIntegration.getBatchCombinedStates(
        sneakingToken,
        observers,
        options
      );

      // Convert to position states
      for (const [observerId, systemState] of batchResults) {
        const observer = observers.find(obs => obs.document.id === observerId);
        if (observer) {
          positions.set(observerId, {
            visibility: systemState.visibility,
            coverState: systemState.coverState,
            stealthBonus: systemState.stealthBonus,
            distance: this._calculateDistance(sneakingToken, observer),
            calculated: systemState.calculated,
            errors: systemState.warnings || [],
            timestamp
          });
        }
      }

      return positions;
    } catch (error) {
      // Handle errors with fallback
      await errorHandlingService.handleSystemError(
        SYSTEM_TYPES.POSITION_TRACKER,
        error,
        { sneakingToken, observers, options }
      );

      // Create fallback positions
      for (const observer of observers) {
        positions.set(observer.document.id, this._createFallbackPosition(timestamp, error));
      }

      return positions;
    }
  }

  /**
   * Analyze transitions between start and end positions
   * @param {Map<string, PositionState>} startPositions - Start positions
   * @param {Map<string, PositionState>} endPositions - End positions
   * @returns {Map<string, PositionTransition>} Map of observer ID to transition
   */
  analyzeTransitions(startPositions, endPositions) {
    const transitions = new Map();

    for (const [observerId, startPos] of startPositions) {
      const endPos = endPositions.get(observerId);
      if (!endPos) continue;

      const transition = this._analyzeTransition(startPos, endPos);
      transitions.set(observerId, transition);
    }

    return transitions;
  }

  /**
   * Analyze a single position transition
   * @private
   */
  _analyzeTransition(startPos, endPos) {
    const visibilityChanged = startPos.visibility !== endPos.visibility;
    const coverChanged = startPos.coverState !== endPos.coverState;
    const hasChanged = visibilityChanged || coverChanged;
    const stealthBonusChange = endPos.stealthBonus - startPos.stealthBonus;

    // Determine transition type
    let transitionType = 'unchanged';
    if (hasChanged) {
      // Improved if visibility got better OR stealth bonus increased
      const visibilityImproved = this._isVisibilityImproved(startPos.visibility, endPos.visibility);
      const bonusImproved = stealthBonusChange > 0;
      
      if (visibilityImproved || bonusImproved) {
        transitionType = 'improved';
      } else {
        transitionType = 'worsened';
      }
    }

    return {
      startPosition: startPos,
      endPosition: endPos,
      hasChanged,
      visibilityChanged,
      coverChanged,
      stealthBonusChange,
      transitionType
    };
  }

  /**
   * Check if visibility improved for stealth purposes
   * @private
   */
  _isVisibilityImproved(fromVisibility, toVisibility) {
    const order = ['observed', 'concealed', 'hidden', 'undetected'];
    const fromIndex = order.indexOf(fromVisibility);
    const toIndex = order.indexOf(toVisibility);
    return toIndex > fromIndex;
  }

  /**
   * Calculate distance between tokens
   * @private
   */
  _calculateDistance(token1, token2) {
    if (!token1?.center || !token2?.center) return 0;
    
    const dx = token1.center.x - token2.center.x;
    const dy = token1.center.y - token2.center.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Create fallback position state
   * @private
   */
  _createFallbackPosition(timestamp, error) {
    return {
      visibility: 'observed',
      coverState: 'none',
      stealthBonus: 0,
      distance: 0,
      calculated: false,
      errors: [error?.message || 'Position calculation failed'],
      timestamp
    };
  }

  /**
   * Get system diagnostics
   */
  getSystemDiagnostics() {
    return {
      systemIntegration: this._systemIntegration.getSystemDiagnostics(),
      timestamp: Date.now()
    };
  }

  /**
   * Batch capture with performance optimization
   * @param {Token} sneakingToken - The sneaking token
   * @param {Array<Token>} observers - Observer tokens
   * @param {Object} options - Options
   * @returns {Promise<Map<string, PositionState>>} Batch results
   */
  async captureBatchPositions(sneakingToken, observers, options = {}) {
    // For large numbers of observers, process in chunks
    if (observers.length > 20) {
      const chunkSize = 10;
      const chunks = [];
      
      for (let i = 0; i < observers.length; i += chunkSize) {
        chunks.push(observers.slice(i, i + chunkSize));
      }
      
      const allResults = new Map();
      
      for (const chunk of chunks) {
        const chunkResults = await this.capturePositions(sneakingToken, chunk, options);
        for (const [id, state] of chunkResults) {
          allResults.set(id, state);
        }
      }
      
      return allResults;
    }
    
    // Standard processing for smaller groups
    return this.capturePositions(sneakingToken, observers, options);
  }

  /**
   * Check if a token has moved since a timestamp
   * @param {Token} token - Token to check
   * @param {number} since - Timestamp to check against
   * @returns {boolean} Whether token has moved
   */
  hasTokenMoved(token, since) {
    // Simple heuristic - assume movement if enough time has passed
    // Could be enhanced with actual position tracking if needed
    return Date.now() - since > 1000;
  }

  /**
   * Clear any cached position data (simplified - no complex caching)
   */
  clearCache() {
    // No-op in simplified version - no complex caching to clear
    console.debug('PF2E Visioner | SimplifiedPositionTracker cache cleared');
  }
}

export default new SimplifiedPositionTracker();