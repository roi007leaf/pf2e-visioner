/**
 * Dual System Integration Utilities
 * Provides safe integration between AVS visibility system and Auto-Cover system
 * with comprehensive error handling and fallback mechanisms for FoundryVTT v13
 */

import { COVER_STATES, MODULE_ID } from '../../../constants.js';
import errorHandlingService, { SYSTEM_TYPES } from '../infra/error-handling-service.js';

/**
 * Options for system integration calls
 * @typedef {Object} SystemResult
 * @property {boolean} success - Whether the operation succeeded
 * @property {*} data - The result data (varies by operation)
 * @property {string|null} error - Error message if operation failed
 * @property {boolean} fallbackUsed - Whether fallback mechanism was used
 * @property {string} source - Source of the data ('avs', 'auto-cover', 'fallback', 'manual')
 */

/**
 * Combined system state result
 * @typedef {Object} CombinedSystemState
 * @property {SystemResult} avsResult - AVS system result
 * @property {SystemResult} coverResult - Auto-Cover system result
 * @property {string} effectiveVisibility - Combined effective visibility state
 * @property {number} stealthBonus - Combined stealth bonus
 * @property {Array<string>} warnings - Any warnings from system integration
 * @property {boolean} systemsAvailable - Whether both systems are available
 */

export class DualSystemIntegration {
  constructor() {
    this._autoCoverSystem = null;
    this._initialized = false;
    this._systemStatus = {
      avs: { available: false, lastCheck: 0 },
      autoCover: { available: false, lastCheck: 0 },
    };
  }

  /**
   * Initialize the integration with required systems
   * @returns {Promise<boolean>} Whether initialization succeeded
   */
  async initialize() {
    if (this._initialized) return true;

    try {
      // Initialize Auto-Cover system
      await this._initializeAutoCoverSystem();

      await this._initializeAVSService();

      this._initialized = true;
      return true;
    } catch (error) {
      console.warn(`${MODULE_ID} | Failed to initialize DualSystemIntegration:`, error);
      return false;
    }
  }

  /**
   * Safely calls AVS visibility detection methods using v13 token and vision APIs
   * @param {Token} observer - Observer token
   * @param {Token} target - Target token
   * @param {Object} options - Additional options
   * @returns {Promise<SystemResult>} AVS visibility result with error handling
   */
  async getAVSVisibilityState(observer, target, options = {}) {
    const result = {
      success: false,
      data: 'observed',
      error: null,
      fallbackUsed: false,
      source: 'avs',
    };

    // Validate inputs using v13 token APIs
    if (!this._validateTokens(observer, target)) {
      const error = new Error('Invalid observer or target token');
      const errorResult = await errorHandlingService.handleSystemError(SYSTEM_TYPES.AVS, error, {
        observer,
        target,
        options,
      });

      result.error = error.message;
      result.data = errorResult.fallbackData || 'observed';
      result.fallbackUsed = errorResult.fallbackApplied;
      result.success = errorResult.fallbackApplied;
      return result;
    }

    // Check if AVS system is available
    if (!this._isAVSSystemAvailable()) {
      const error = new Error('AVS system is not available');
      const errorResult = await errorHandlingService.handleSystemError(SYSTEM_TYPES.AVS, error, {
        observer,
        target,
        options,
      });

      result.error = error.message;
      result.data = errorResult.fallbackData || 'observed';
      result.fallbackUsed = errorResult.fallbackApplied;
      result.success = errorResult.fallbackApplied;
      return result;
    }

    try {
      // Use existing visibility detection with v13 APIs
      const visibilityState = await this._detectAVSVisibility(observer, target, options);

      result.success = true;
      result.data = visibilityState;
      return result;
    } catch (error) {
      const errorResult = await errorHandlingService.handleSystemError(SYSTEM_TYPES.AVS, error, {
        observer,
        target,
        options,
      });

      result.error = error.message;
      result.data = errorResult.fallbackData || 'observed';
      result.fallbackUsed = errorResult.fallbackApplied;
      result.success = errorResult.fallbackApplied;
      return result;
    }
  }

  /**
   * Alias for getAVSVisibilityState for consistency with naming conventions
   * @param {Token} observer - Observer token
   * @param {Token} target - Target token
   * @param {Object} options - Additional options
   * @returns {Promise<SystemResult>} AVS visibility result with error handling
   */
  async getAVSState(observer, target, options = {}) {
    return await this.getAVSVisibilityState(observer, target, options);
  }

  /**
   * Safely calls Auto-Cover system detection methods using v13 wall and geometry APIs
   * @param {Token} observer - Observer token
   * @param {Token} target - Target token
   * @param {Object} options - Additional options
   * @returns {Promise<SystemResult>} Auto-Cover result with error handling
   */
  async getAutoCoverState(observer, target, options = {}) {
    const result = {
      success: false,
      data: { state: 'none', bonus: 0 },
      error: null,
      fallbackUsed: false,
      source: 'auto-cover',
    };

    // Validate inputs using v13 token APIs
    if (!this._validateTokens(observer, target)) {
      const error = new Error('Invalid observer or target token');
      const errorResult = await errorHandlingService.handleSystemError(
        SYSTEM_TYPES.AUTO_COVER,
        error,
        { observer, target, options },
      );

      result.error = error.message;
      result.data = errorResult.fallbackData || { state: 'none', bonus: 0 };
      result.fallbackUsed = errorResult.fallbackApplied;
      result.success = errorResult.fallbackApplied;
      return result;
    }

    try {
      await this.initialize();

      // First check for manual cover overrides using v13 flag APIs
      const manualCover = await this._getManualCoverState(observer, target);
      if (manualCover && manualCover !== 'none') {
        const bonus = this._calculateCoverBonus(manualCover);
        result.success = true;
        result.data = { state: manualCover, bonus };
        result.source = 'manual';
        return result;
      }

      // Use Auto-Cover system detection with v13 wall and geometry APIs
      const coverState = await this._detectAutoCover(observer, target, options);
      const bonus = this._calculateCoverBonus(coverState);

      result.success = true;
      result.data = { state: coverState, bonus };
      return result;
    } catch (error) {
      const errorResult = await errorHandlingService.handleSystemError(
        SYSTEM_TYPES.AUTO_COVER,
        error,
        { observer, target, options },
      );

      result.error = error.message;
      result.data = errorResult.fallbackData || { state: 'none', bonus: 0 };
      result.fallbackUsed = errorResult.fallbackApplied;
      result.success = errorResult.fallbackApplied;
      return result;
    }
  }

  /**
   * Gets combined state from both systems with comprehensive error handling
   * @param {Token} observer - Observer token
   * @param {Token} target - Target token
   * @param {Object} options - Additional options
   * @returns {Promise<CombinedSystemState>} Combined system state
   */
  async getCombinedSystemState(observerToken, targetToken, options = {}) {
    try {
      // Get both AVS and Auto-Cover states
      let avsResult, coverResult;

      try {
        avsResult = await this.getAVSState(observerToken, targetToken, options);
      } catch (avsError) {
        console.warn('PF2E Visioner: AVS failed, using fallback', avsError);
        avsResult = {
          success: false,
          data: 'observed',
          error: avsError.message,
          fallbackUsed: true,
          source: 'fallback',
        };
      }

      try {
        coverResult = await this.getAutoCoverState(observerToken, targetToken, options);
      } catch (autoCoverError) {
        console.warn('PF2E Visioner: Auto-Cover failed, using fallback', autoCoverError);
        coverResult = {
          success: false,
          data: { state: 'none', bonus: 0 },
          error: autoCoverError.message,
          fallbackUsed: true,
          source: 'fallback',
        };
      }

      // Calculate combined effective visibility and stealth bonus
      const effectiveVisibility = this._combineSystemStates(avsResult.data, coverResult.data.state);
      const stealthBonus = coverResult.data.bonus || 0;

      return {
        avsResult,
        coverResult,
        effectiveVisibility,
        stealthBonus,
      };
    } catch (error) {
      console.error('PF2E Visioner: Combined system state failed', error);
      return {
        avsResult: {
          success: false,
          data: 'observed',
          error: error.message,
          fallbackUsed: true,
          source: 'fallback',
        },
        coverResult: {
          success: false,
          data: { state: 'none', bonus: 0 },
          error: error.message,
          fallbackUsed: true,
          source: 'fallback',
        },
        effectiveVisibility: 'observed',
        stealthBonus: 0,
      };
    }
  } /**
   * Batch processing for multiple token pairs with v13 performance optimizations
   * @param {Token} observer - Observer token
   * @param {Array<Token>} targets - Array of target tokens
   * @param {Object} options - Additional options
   * @returns {Promise<Map<string, CombinedSystemState>>} Map of target ID to combined state
   */
  async getBatchCombinedStates(observer, targets, options = {}) {
    if (!Array.isArray(targets) || targets.length === 0) {
      return new Map();
    }

    const results = new Map();
    const batchSize = options.batchSize || 10; // Process in batches for performance

    // Process targets in batches to avoid overwhelming the system
    for (let i = 0; i < targets.length; i += batchSize) {
      const batch = targets.slice(i, i + batchSize);

      const batchPromises = batch.map(async (target) => {
        if (!target?.document?.id) return null;

        try {
          const state = await this.getCombinedSystemState(observer, target, options);
          return { id: target.document.id, state };
        } catch (error) {
          console.warn(
            `${MODULE_ID} | Batch processing failed for target ${target.document.id}:`,
            error,
          );
          return { id: target.document.id, state: this._createErrorState(error) };
        }
      });

      const batchResults = await Promise.all(batchPromises);

      // Add successful results to map
      for (const result of batchResults) {
        if (result) {
          results.set(result.id, result.state);
        }
      }
    }

    return results;
  }

  /**
   * Validates system availability and provides diagnostic information
   * @returns {Object} System diagnostic information
   */
  getSystemDiagnostics() {
    return {
      avs: {
        available: this._isAVSSystemAvailable(),
        enabled: this._isAVSEnabled(),
        lastError: this._systemStatus.avs.lastError || null,
      },
      autoCover: {
        available: this._isAutoCoverSystemAvailable(),
        enabled: this._isAutoCoverEnabled(),
        lastError: this._systemStatus.autoCover.lastError || null,
      },
      integration: {
        initialized: this._initialized,
        foundryVersion: game.version,
        moduleVersion: game.modules.get(MODULE_ID)?.version || 'unknown',
      },
    };
  }

  // Private methods for system initialization and management

  /**
   * Initialize Auto-Cover system
   * @private
   */
  async _initializeAutoCoverSystem() {
    try {
      const autoCoverModule = await import('../../../cover/auto-cover/AutoCoverSystem.js');
      this._autoCoverSystem = autoCoverModule.default;
      this._systemStatus.autoCover.available = true;
      this._systemStatus.autoCover.lastCheck = Date.now();
    } catch (error) {
      this._systemStatus.autoCover.available = false;
      this._systemStatus.autoCover.lastError = error.message;
      console.warn(`${MODULE_ID} | Failed to initialize Auto-Cover system:`, error);
    }
  }

  /**
   * Initialize AVS override service
   * @private
   */
  async _initializeAVSService() {
    try {
      this._systemStatus.avs.available = true;
      this._systemStatus.avs.lastCheck = Date.now();
    } catch (error) {
      this._systemStatus.avs.available = false;
      this._systemStatus.avs.lastError = error.message;
      console.warn(`${MODULE_ID} | Failed to initialize AVS service:`, error);
    }
  }

  /**
   * Validates tokens using v13 APIs
   * @param {Token} observer - Observer token
   * @param {Token} target - Target token
   * @returns {boolean} Whether tokens are valid
   * @private
   */
  _validateTokens(observer, target) {
    // Allow same token (self-visibility checks are valid)
    if (observer?.document?.id === target?.document?.id) {
      return observer?.document?.id && canvas?.tokens?.get(observer.document.id);
    }

    // Different tokens validation
    return (
      observer?.document?.id &&
      target?.document?.id &&
      canvas?.tokens?.get(observer.document.id) &&
      canvas?.tokens?.get(target.document.id)
    );
  }

  /**
   * Checks if AVS system is available
   * @returns {boolean} Whether AVS is available
   * @private
   */
  _isAVSSystemAvailable() {
    // Check cache first (avoid repeated expensive checks)
    const now = Date.now();
    if (now - this._systemStatus.avs.lastCheck < 5000) {
      // 5 second cache
      return this._systemStatus.avs.available;
    }

    try {
      // AVS is built into this module, so check if it's enabled
      const available = this._isAVSEnabled() && typeof canvas !== 'undefined';
      this._systemStatus.avs.available = available;
      this._systemStatus.avs.lastCheck = now;
      return available;
    } catch (error) {
      this._systemStatus.avs.available = false;
      this._systemStatus.avs.lastError = error.message;
      return false;
    }
  }

  /**
   * Checks if Auto-Cover system is available
   * @returns {boolean} Whether Auto-Cover is available
   * @private
   */
  _isAutoCoverSystemAvailable() {
    // Check cache first
    const now = Date.now();
    if (now - this._systemStatus.autoCover.lastCheck < 5000) {
      // 5 second cache
      return this._systemStatus.autoCover.available;
    }

    try {
      const available = this._autoCoverSystem?.isEnabled() || false;
      this._systemStatus.autoCover.available = available;
      this._systemStatus.autoCover.lastCheck = now;
      return available;
    } catch (error) {
      this._systemStatus.autoCover.available = false;
      this._systemStatus.autoCover.lastError = error.message;
      return false;
    }
  }

  /**
   * Checks if AVS is enabled in settings
   * @returns {boolean} Whether AVS is enabled
   * @private
   */
  _isAVSEnabled() {
    try {
      return game.settings.get(MODULE_ID, 'autoVisibilityEnabled') !== false;
    } catch {
      return true; // Default to enabled
    }
  }

  /**
   * Checks if Auto-Cover is enabled in settings
   * @returns {boolean} Whether Auto-Cover is enabled
   * @private
   */
  _isAutoCoverEnabled() {
    try {
      return game.settings.get(MODULE_ID, 'autoCover') === true;
    } catch {
      return false; // Default to disabled
    }
  }

  /**
   * Detects AVS visibility using existing utilities
   * @param {Token} observer - Observer token
   * @param {Token} target - Target token
   * @param {Object} options - Additional options
   * @returns {Promise<string>} Visibility state
   * @private
   */
  async _detectAVSVisibility(observer, target, options) {
    try {
      // Check if we have stored position information for historical visibility calculation
      const storedSneakingPosition = options?.storedSneakingPosition;

      if (storedSneakingPosition && target) {
        return await this._detectVisibilityWithStoredPosition(
          observer,
          target,
          storedSneakingPosition,
          options,
        );
      }

      // Use current positions for normal visibility detection
      const { getVisibilityBetween } = await import('../../../utils.js');
      return getVisibilityBetween(observer, target) || 'observed';
    } catch (error) {
      console.warn(`${MODULE_ID} | AVS visibility detection failed:`, error);
      throw error;
    }
  }

  /**
   * Detect visibility using stored position coordinates for accurate historical state
   * @param {Token} observer - Observer token
   * @param {Token} target - Target token (the sneaking token)
   * @param {Object} storedPosition - Stored position of the sneaking token with x, y coordinates
   * @param {Object} options - Detection options
   * @returns {string} Visibility state
   * @private
   */
  async _detectVisibilityWithStoredPosition(observer, target, storedPosition, options) {
    try {
      // For now, use a simplified visibility calculation based on line of sight and lighting
      // This could be enhanced to use more sophisticated AVS logic with stored positions

      const observerCenter = observer.center;
      const storedSneakingCenter = {
        x: storedPosition.x + (target.document.width * canvas.grid.size) / 2,
        y: storedPosition.y + (target.document.height * canvas.grid.size) / 2,
      };

      // Check line of sight using wall collision
      const ray = new foundry.canvas.geometry.Ray(observerCenter, storedSneakingCenter);
      let hasLineOfSight = true;

      try {
        if (typeof canvas.walls.testCollision === 'function') {
          // If walls block the ray, there's no line of sight
          hasLineOfSight = !canvas.walls.testCollision(ray.A, ray.B, { type: 'sight' });
        } else if (typeof canvas.walls.checkCollision === 'function') {
          // Fallback for older versions
          hasLineOfSight = !canvas.walls.checkCollision(ray, { type: 'sight' });
        }
      } catch (collisionError) {
        console.warn(
          'PF2E Visioner | Sight collision detection failed, defaulting to visible',
          collisionError,
        );
        hasLineOfSight = true;
      }

      // Basic visibility determination
      const visibilityState = hasLineOfSight ? 'observed' : 'hidden';

      return visibilityState;
    } catch (error) {
      console.warn(`${MODULE_ID} | Stored position visibility detection failed:`, error);
      return 'observed';
    }
  }

  /**
   * Gets manual cover state using existing utilities
   * @param {Token} observer - Observer token
   * @param {Token} target - Target token
   * @returns {Promise<string>} Manual cover state
   * @private
   */
  async _getManualCoverState(observer, target) {
    try {
      const { getCoverBetween } = await import('../../../utils.js');
      return getCoverBetween(observer, target) || 'none';
    } catch (error) {
      console.warn(`${MODULE_ID} | Manual cover detection failed:`, error);
      return 'none';
    }
  }

  /**
   * Detects auto-cover using Auto-Cover system with v13 APIs
   * @param {Token} observer - Observer token
   * @param {Token} target - Target token
   * @param {Object} options - Additional options
   * @returns {Promise<string>} Cover state
   * @private
   */
  async _detectAutoCover(observer, target, options) {
    try {

      if (!this._autoCoverSystem?.isEnabled()) {
        return 'none';
      }

      // Check if we have stored position information
      const storedSneakingPosition = options?.storedSneakingPosition;

      // If we have stored positions and we're not explicitly requesting current position for cover,
      // use fallback collision detection with custom coordinates
      if (storedSneakingPosition && target && !options?.useCurrentPositionForCover) {
        return this._detectCoverWithStoredPosition(
          observer,
          target,
          storedSneakingPosition,
          options,
        );
      }

      // Use Auto-Cover system detection with v13 wall and geometry APIs (current position)
      const detectedCover =
        this._autoCoverSystem.detectCoverBetweenTokens(observer, target, options) || 'none';
      return detectedCover;
    } catch (error) {
      console.warn(`${MODULE_ID} | Auto-Cover detection failed:`, error);
      throw error;
    }
  }

  /**
   * Detect cover using stored position coordinates for accurate historical state
   * @param {Token} observer - Observer token
   * @param {Token} target - Target token (the sneaking token)
   * @param {Object} storedPosition - Stored position of the sneaking token with x, y coordinates
   * @param {Object} options - Detection options
   * @returns {string} Cover state
   * @private
   */
  async _detectCoverWithStoredPosition(observer, target, storedPosition, options) {
    try {
      // Create a ray from observer center to stored sneaking token position
      const observerCenter = observer.center;
      const storedSneakingCenter = {
        x: storedPosition.x + (target.document.width * canvas.grid.size) / 2,
        y: storedPosition.y + (target.document.height * canvas.grid.size) / 2,
      };

      const ray = new foundry.canvas.geometry.Ray(observerCenter, storedSneakingCenter);

      // Use FoundryVTT v13+ collision detection
      let hasWallCollision = false;
      try {
        if (typeof canvas.walls.testCollision === 'function') {
          hasWallCollision = canvas.walls.testCollision(ray.A, ray.B, { type: 'move' });
        } else if (typeof canvas.walls.checkCollision === 'function') {
          // Fallback for older versions
          hasWallCollision = canvas.walls.checkCollision(ray, { type: 'move' });
        }
      } catch (collisionError) {
        console.warn(
          'PF2E Visioner | Wall collision detection failed, defaulting to no collision',
          collisionError,
        );
        hasWallCollision = false;
      }

      // Return basic cover state based on wall collision
      const coverState = hasWallCollision ? 'standard' : 'none';

      return coverState;
    } catch (error) {
      console.warn(`${MODULE_ID} | Stored position cover detection failed:`, error);
      return 'none';
    }
  }

  /**
   * Calculates stealth bonus from cover state
   * @param {string} coverState - Cover state
   * @returns {number} Stealth bonus
   * @private
   */
  _calculateCoverBonus(coverState) {
    try {
      const coverConfig = COVER_STATES[coverState];
      return coverConfig?.bonusStealth || 0;
    } catch {
      return 0;
    }
  }

  /**
   * Combines AVS and Auto-Cover states into effective visibility
   * @param {string} avsVisibility - AVS visibility state
   * @param {string} coverState - Cover state
   * @returns {string} Combined effective visibility
   * @private
   */
  _combineSystemStates(avsVisibility, coverState) {
    // If already hidden or undetected, cover doesn't change that
    if (['hidden', 'undetected'].includes(avsVisibility)) {
      return avsVisibility;
    }

    // If observed but has cover that allows hiding, consider it concealed
    if (avsVisibility === 'observed' && coverState && COVER_STATES[coverState]?.canHide) {
      return 'concealed';
    }

    // Otherwise, return the AVS visibility state
    return avsVisibility;
  }

  /**
   * Creates error state for failed operations
   * @param {Error} error - The error that occurred
   * @returns {CombinedSystemState} Error state
   * @private
   */
  _createErrorState(error) {
    return {
      avsResult: {
        success: false,
        data: 'observed',
        error: error.message,
        fallbackUsed: false,
        source: 'error',
      },
      coverResult: {
        success: false,
        data: { state: 'none', bonus: 0 },
        error: error.message,
        fallbackUsed: false,
        source: 'error',
      },
      effectiveVisibility: 'observed',
      stealthBonus: 0,
      warnings: [`System error: ${error.message}`],
      systemsAvailable: false,
    };
  }
}

// Export singleton instance
export default new DualSystemIntegration();
