/**
 * Unified System Integration - Simplified and consolidated system integration
 * Replaces the complex DualSystemIntegration with a streamlined approach
 * Eliminates duplication and provides a single source of truth for system integration
 */

import { COVER_STATES } from '../../constants.js';
import autoCoverSystem from '../../cover/auto-cover/AutoCoverSystem.js';
import { getCoverBetween, getVisibilityBetween } from '../../utils.js';
import errorHandlingService, { SYSTEM_TYPES } from './infra/error-handling-service.js';

/**
 * Simplified system result structure
 * @typedef {Object} SystemResult
 * @property {boolean} success - Whether the operation succeeded
 * @property {*} data - The result data
 * @property {string|null} error - Error message if failed
 * @property {string} source - Source of the data ('avs', 'auto-cover', 'manual', 'fallback')
 */

/**
 * Combined state result
 * @typedef {Object} CombinedState
 * @property {string} visibility - Effective visibility state
 * @property {string} coverState - Cover state
 * @property {number} stealthBonus - Stealth bonus from cover
 * @property {boolean} calculated - Whether calculation was successful
 * @property {Array<string>} warnings - Any warnings
 */

export class UnifiedSystemIntegration {
  constructor() {
    this._initialized = false;
    this._avsAvailable = false;
    this._autoCoverAvailable = false;
  }

  /**
   * Initialize the integration service
   */
  async initialize() {
    if (this._initialized) return true;

    try {
      // Check AVS availability
      this._avsAvailable = this._checkAVSAvailability();
      
      // Check Auto-Cover availability
      this._autoCoverAvailable = autoCoverSystem?.isEnabled?.() || false;
      
      this._initialized = true;
      
      return true;
    } catch (error) {
      console.warn('PF2E Visioner | Failed to initialize UnifiedSystemIntegration:', error);
      return false;
    }
  }

  /**
   * Get combined system state for observer-target pair
   * @param {Token} observer - Observer token
   * @param {Token} target - Target token
   * @param {Object} options - Additional options
   * @returns {Promise<CombinedState>} Combined state
   */
  async getCombinedState(observer, target, options = {}) {
    await this.initialize();

    const result = {
      visibility: 'observed',
      coverState: 'none',
      stealthBonus: 0,
      calculated: false,
      warnings: []
    };

    try {
      // Get visibility state
      const visibilityResult = await this._getVisibilityState(observer, target, options);
      result.visibility = visibilityResult.data || 'observed';
      
      if (!visibilityResult.success) {
        result.warnings.push(`Visibility calculation failed: ${visibilityResult.error}`);
      }

      // Get cover state
      const coverResult = await this._getCoverState(observer, target, options);
      result.coverState = coverResult.data?.state || 'none';
      result.stealthBonus = coverResult.data?.bonus || 0;
      
      if (!coverResult.success) {
        result.warnings.push(`Cover calculation failed: ${coverResult.error}`);
      }

      // Mark as calculated if at least one system succeeded
      result.calculated = visibilityResult.success || coverResult.success;

      return result;
    } catch (error) {
      result.warnings.push(`System integration error: ${error.message}`);
      return result;
    }
  }

  /**
   * Get visibility state using available systems
   * @private
   */
  async _getVisibilityState(observer, target, options = {}) {
    const result = {
      success: false,
      data: 'observed',
      error: null,
      source: 'fallback'
    };

    try {
      // Try AVS first if available
      if (this._avsAvailable) {
        const avsVisibility = await this._detectAVSVisibility(observer, target, options);
        if (avsVisibility) {
          result.success = true;
          result.data = avsVisibility;
          result.source = 'avs';
          return result;
        }
      }

      // Fallback to manual detection
      const manualVisibility = getVisibilityBetween(observer, target);
      if (manualVisibility) {
        result.success = true;
        result.data = manualVisibility;
        result.source = 'manual';
        return result;
      }

      // Ultimate fallback
      result.data = 'observed';
      result.source = 'fallback';
      return result;
    } catch (error) {
      result.error = error.message;
      return result;
    }
  }

  /**
   * Get cover state using available systems
   * @private
   */
  async _getCoverState(observer, target, options = {}) {
    const result = {
      success: false,
      data: { state: 'none', bonus: 0 },
      error: null,
      source: 'fallback'
    };

    try {
      // Try Auto-Cover first if available
      if (this._autoCoverAvailable) {
        const autoCover = await this._detectAutoCover(observer, target, options);
        if (autoCover) {
          result.success = true;
          result.data = {
            state: autoCover,
            bonus: this._getCoverBonus(autoCover)
          };
          result.source = 'auto-cover';
          return result;
        }
      }

      // Fallback to manual detection
      const manualCover = getCoverBetween(observer, target);
      if (manualCover) {
        result.success = true;
        result.data = {
          state: manualCover,
          bonus: this._getCoverBonus(manualCover)
        };
        result.source = 'manual';
        return result;
      }

      // Ultimate fallback
      result.data = { state: 'none', bonus: 0 };
      result.source = 'fallback';
      return result;
    } catch (error) {
      result.error = error.message;
      return result;
    }
  }

  /**
   * Detect AVS visibility (simplified)
   * @private
   */
  async _detectAVSVisibility(observer, target, options = {}) {
    try {
      // Check if AVS module is available and enabled
      if (!game.settings.get('pf2e-visioner', 'autoVisibilityEnabled')) {
        return null;
      }

      // Use stored position if provided
      if (options.storedSneakingPosition) {
        return await this._detectVisibilityWithStoredPosition(
          observer, 
          target, 
          options.storedSneakingPosition
        );
      }

      // Try to use visibility calculator if available
      const { visibilityCalculator } = await import('../../visibility/auto-visibility/VisibilityCalculator.js');
      if (visibilityCalculator?.calculateVisibility) {
        return await visibilityCalculator.calculateVisibility(observer, target);
      }

      return null;
    } catch (error) {
      console.error('PF2E Visioner | AVS detection failed:', error);
      return null;
    }
  }

  /**
   * Detect Auto-Cover (simplified)
   * @private
   */
  async _detectAutoCover(observer, target, options = {}) {
    try {
      if (!autoCoverSystem?.isEnabled?.()) {
        return null;
      }

      // Use stored position if provided
      if (options.storedSneakingPosition) {
        return await this._detectCoverWithStoredPosition(
          observer, 
          target, 
          options.storedSneakingPosition
        );
      }

      // Try to detect cover using Auto-Cover system
      if (autoCoverSystem.detectCover) {
        return await autoCoverSystem.detectCover(observer, target);
      }

      return null;
    } catch (error) {
      console.error('PF2E Visioner | Auto-Cover detection failed:', error);
      return null;
    }
  }

  /**
   * Detect visibility with stored position
   * @private
   */
  async _detectVisibilityWithStoredPosition(observer, target, storedPosition) {
    try {
      // Create temporary position for calculation
      const originalX = target.x;
      const originalY = target.y;
      
      // Temporarily move target to stored position
      target.x = storedPosition.x;
      target.y = storedPosition.y;
      
      // Calculate visibility
      const visibility = await this._detectAVSVisibility(observer, target);
      
      // Restore original position
      target.x = originalX;
      target.y = originalY;
      
      return visibility;
    } catch (error) {
      console.error('PF2E Visioner | Stored position visibility detection failed:', error);
      return null;
    }
  }

  /**
   * Detect cover with stored position
   * @private
   */
  async _detectCoverWithStoredPosition(observer, target, storedPosition) {
    try {
      // Create temporary position for calculation
      const originalX = target.x;
      const originalY = target.y;
      
      // Temporarily move target to stored position
      target.x = storedPosition.x;
      target.y = storedPosition.y;
      
      // Calculate cover
      const cover = await this._detectAutoCover(observer, target);
      
      // Restore original position
      target.x = originalX;
      target.y = originalY;
      
      return cover;
    } catch (error) {
      console.error('PF2E Visioner | Stored position cover detection failed:', error);
      return null;
    }
  }

  /**
   * Get stealth bonus for cover state
   * @private
   */
  _getCoverBonus(coverState) {
    return COVER_STATES[coverState]?.bonusStealth || 0;
  }

  /**
   * Check AVS availability
   * @private
   */
  _checkAVSAvailability() {
    try {
      return game.settings.get('pf2e-visioner', 'autoVisibilityEnabled') || false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get system diagnostics
   */
  getSystemDiagnostics() {
    return {
      initialized: this._initialized,
      avsAvailable: this._avsAvailable,
      autoCoverAvailable: this._autoCoverAvailable,
      timestamp: Date.now()
    };
  }

  /**
   * Batch process multiple observer-target pairs
   * @param {Token} target - Target token
   * @param {Array<Token>} observers - Observer tokens
   * @param {Object} options - Options
   * @returns {Promise<Map>} Map of observer ID to combined state
   */
  async getBatchCombinedStates(target, observers, options = {}) {
    const results = new Map();
    
    // Process in parallel for better performance
    const promises = observers.map(async (observer) => {
      const state = await this.getCombinedState(observer, target, options);
      return [observer.document.id, state];
    });
    
    const resolvedResults = await Promise.all(promises);
    
    for (const [observerId, state] of resolvedResults) {
      results.set(observerId, state);
    }
    
    return results;
  }
}

export default new UnifiedSystemIntegration();