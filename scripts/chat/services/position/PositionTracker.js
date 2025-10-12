/**
 * SneakPositionTracker - Service for tracking position states during sneak actions
 * Integrates with both AVS visibility system and Auto-Cover system to provide
 * unified position state information for enhanced sneak mechanics.
 */

// import { getVisibilityBetween } from '../../../utils.js';
import { LevelsIntegration } from '../../../services/LevelsIntegration.js';
import { LightingCalculator } from '../../../visibility/auto-visibility/LightingCalculator.js';
import { visibilityCalculator } from '../../../visibility/auto-visibility/VisibilityCalculator.js';
import errorHandlingService, { SYSTEM_TYPES } from '../infra/ErrorHandlingService.js';
import dualSystemIntegration from './DualSystemIntegration.js';
import performanceOptimizer from './PerformanceOptimizer.js';
import positionCacheManager from './PositionCacheManager.js';

/**
 * Position state data structure combining AVS and Auto-Cover information
 * @typedef {Object} PositionState
 * @property {string} avsVisibility - AVS visibility state ('hidden', 'concealed', 'observed', 'undetected')
 * @property {boolean} avsCalculated - Whether AVS calculation was successful
 * @property {string} coverState - Auto-Cover state ('none', 'lesser', 'standard', 'greater')
 * @property {boolean} coverCalculated - Whether cover calculation was successful
 * @property {string|null} coverOverride - Any cover override applied
 * @property {number} stealthBonus - Stealth bonus from cover
 * @property {string} effectiveVisibility - Final visibility considering both systems
 * @property {number} distance - Distance between tokens
 * @property {boolean} hasLineOfSight - Whether there's line of sight
 * @property {string} lightingConditions - Current lighting conditions
 * @property {number} timestamp - When this state was captured
 * @property {boolean} avsEnabled - Whether AVS system is enabled
 * @property {boolean} autoCoverEnabled - Whether Auto-Cover system is enabled
 * @property {Array<string>} systemErrors - Any errors encountered during calculation
 */

/**
 * Position transition data structure
 * @typedef {Object} PositionTransition
 * @property {string} targetId - ID of the target token
 * @property {PositionState} startPosition - Position state at start
 * @property {PositionState} endPosition - Position state at end
 * @property {boolean} hasChanged - Whether any position data changed
 * @property {boolean} avsVisibilityChanged - Whether AVS visibility changed
 * @property {boolean} coverStateChanged - Whether cover state changed
 * @property {number} impactOnDC - Impact on DC calculations
 * @property {number} stealthBonusChange - Change in stealth bonus
 * @property {string} transitionType - 'improved', 'worsened', or 'unchanged'
 * @property {Object} avsTransition - AVS-specific transition data
 * @property {Object} coverTransition - Cover-specific transition data
 */

export class PositionTracker {
  constructor() {
    this._initialized = false;
  }

  /**
   * Initialize the tracker with required systems
   * @private
   */
  async _initialize() {
    if (this._initialized) return;


    try {
      // Initialize dual system integration
      this._initialized = true;
    } catch (error) {
      console.warn('PF2E Visioner | Failed to initialize SneakPositionTracker:', error);
      this._initialized = false;
    }
  }

  /**
   * Captures current position state for all potential targets using both systems
   * @param {Token} sneakingToken - The token performing the sneak
   * @param {Array<Token>} targets - Array of potential observer tokens
   * @param {Object} storedStartPosition - Optional stored coordinates from StealthCheckUseCase
   * @param {Object} options - Capture options
   * @returns {Promise<Map<string, PositionState>>} Map of target ID to combined position state
   */
  async captureStartPositions(sneakingToken, targets, storedStartPosition = null, options = {}) {
    await this._initialize();

    if (!sneakingToken || !Array.isArray(targets)) {
      const error = new Error('Invalid parameters for captureStartPositions');
      await errorHandlingService.handleSystemError(SYSTEM_TYPES.POSITION_TRACKER, error, {
        sneakingToken,
        targets,
      });
      return new Map();
    }

    // Use performance optimizer for large token counts
    if (targets.length > 10) {
      return performanceOptimizer.optimizeMultiTargetProcessing(
        sneakingToken,
        targets,
        (observer, target) => this._capturePositionState(observer, target, Date.now()),
        {
          ...options,
          cacheTTL: 30000,
          timeout: 5000,
        },
      );
    }

    // Standard processing for smaller counts
    const positionStates = new Map();
    const timestamp = Date.now();


    for (const target of targets) {
      if (!target?.document?.id) continue;


      try {
        // Pass stored position data for historical distance calculation
        const captureOptions = storedStartPosition
          ? { storedSneakingPosition: storedStartPosition }
          : {};

        const positionState = await this._capturePositionState(
          sneakingToken,
          target,
          timestamp,
          captureOptions
        );
        positionStates.set(target.document.id, positionState);
      } catch (error) {
        const errorResult = await errorHandlingService.handleSystemError(
          SYSTEM_TYPES.POSITION_TRACKER,
          error,
          { sneakingToken, target, timestamp },
        );

        // Create error state with fallback data if available
        const errorState = errorResult.fallbackApplied
          ? this._createFallbackState(timestamp, errorResult.fallbackData)
          : this._createErrorState(timestamp, error);

        positionStates.set(target.document.id, errorState);
      }
    }
    return positionStates;
  }


  /**
   * Captures position state between two tokens using dual system integration
   * @param {Token} sneakingToken - The sneaking token
   * @param {Token} observerToken - The observing token
   * @param {number} timestamp - Timestamp for this capture
   * @param {Object} options - Capture options including storedSneakingPosition for historical calculations
   * @returns {Promise<PositionState>} Combined position state
   * @private
   */
  async _capturePositionState(sneakingToken, observerToken, timestamp, options = {}) {
    await this._initialize();

    try {
      // Check cache first unless forced fresh
      if (!options.forceFresh) {
        const cached = positionCacheManager.getCachedPositionState(observerToken, sneakingToken);
        if (cached !== null) {
          return cached;
        }
      }

      // Use dual system integration for safe system calls
      // Pass stored position information for accurate calculations
      const integrationOptions = {
        ...options,
        storedSneakingPosition: options.storedSneakingPosition,
      };

      const combinedState = await dualSystemIntegration.getCombinedSystemState(
        observerToken,
        sneakingToken,
        integrationOptions,
      );


      // Calculate additional position data (cached separately for performance)
      let distance = 0;
      let hasLineOfSight = true;
      let lightingConditions = 'unknown';

      try {
        // Use stored coordinates if provided (for historical position calculations)
        if (options.storedSneakingPosition) {
          distance = this._calculateDistanceWithStoredPosition(
            options.storedSneakingPosition,
            observerToken
          );
        } else {
          distance = this._calculateDistance(sneakingToken, observerToken);
        }
      } catch (error) {
        console.warn('PF2E Visioner | Distance calculation failed:', error);
      }

      try {
        hasLineOfSight = this._hasLineOfSight(sneakingToken, observerToken);
      } catch (error) {
        console.warn('PF2E Visioner | Line of sight calculation failed:', error);
      }

      try {
        lightingConditions = this._getLightingConditions(observerToken);
      } catch (error) {
        console.warn('PF2E Visioner | Lighting calculation failed:', error);
      }

      const positionState = {
        // AVS System Data
        avsVisibility: combinedState.avsResult.data,
        avsCalculated: combinedState.avsResult.success,

        // Auto-Cover System Data
        coverState: combinedState.coverResult.data.state,
        coverCalculated: combinedState.coverResult.success,
        coverOverride:
          combinedState.coverResult.source === 'manual'
            ? combinedState.coverResult.data.state
            : null,
        stealthBonus: combinedState.stealthBonus,

        // Combined/Derived Data
        effectiveVisibility: combinedState.effectiveVisibility,
        distance,
        hasLineOfSight,
        lightingConditions,
        timestamp,

        // Position calculation metadata
        usedStoredPosition: !!options.storedSneakingPosition,
        positionNote: options.storedSneakingPosition ?
          'Distance calculated from stored coordinates; visibility/cover from current position' :
          'All calculations from current position',

        // System Status
        avsEnabled: combinedState.avsResult.success || combinedState.avsResult.fallbackUsed,
        autoCoverEnabled:
          combinedState.coverResult.success || combinedState.coverResult.fallbackUsed,
        systemErrors: combinedState.warnings,
      };

      // Cache the result with appropriate importance
      const importance = this._determinePositionImportance(positionState);
      positionCacheManager.cacheWithImportance(
        positionCacheManager._generatePositionKey(observerToken, sneakingToken),
        positionState,
        importance,
        { ttl: options.cacheTTL || 30000 },
      );

      return positionState;
    } catch (error) {
      console.warn('PF2E Visioner | Failed to capture position state:', error);
      return this._createErrorState(timestamp, error);
    }
  }

  /**
   * Calculates distance between two tokens using FoundryVTT v13 APIs
   * @param {Token} token1 - First token
   * @param {Token} token2 - Second token
   * @returns {number} Distance in grid units
   * @private
   */
  _calculateDistance(token1, token2) {
    try {
      const levelsIntegration = LevelsIntegration.getInstance();
      if (levelsIntegration.isActive) {
        const distance3D = levelsIntegration.getTotalDistance(token1, token2);
        if (distance3D !== null) {
          return distance3D;
        }
      }

      if (canvas.grid.measurePath) {
        const path = canvas.grid.measurePath([token1.center, token2.center]);
        return path.distance;
      } else if (canvas.grid.measureDistance) {
        return canvas.grid.measureDistance(token1.center, token2.center);
      } else {
        const dx = token1.center.x - token2.center.x;
        const dy = token1.center.y - token2.center.y;
        return Math.sqrt(dx * dx + dy * dy);
      }
    } catch {
      const dx = token1.center.x - token2.center.x;
      const dy = token1.center.y - token2.center.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      console.warn('PF2E Visioner | Using fallback distance calculation:', distance);
      return distance;
    }
  }

  /**
   * Calculates distance using stored coordinates instead of current token position
   * @param {Object} storedPosition - Stored position with x, y coordinates
   * @param {Token} observerToken - The observer token
   * @returns {number} Distance in grid units
   * @private
   */
  _calculateDistanceWithStoredPosition(storedPosition, observerToken) {
    try {
      const storedCenter = { x: storedPosition.x, y: storedPosition.y };

      const levelsIntegration = LevelsIntegration.getInstance();
      if (levelsIntegration.isActive && storedPosition.elevation !== undefined) {
        const dx = storedCenter.x - observerToken.center.x;
        const dy = storedCenter.y - observerToken.center.y;
        const distance2D = Math.sqrt(dx * dx + dy * dy);

        const observerElevation = levelsIntegration.getTokenElevation(observerToken);
        const dz = storedPosition.elevation - observerElevation;
        const distance3D = Math.sqrt(distance2D * distance2D + dz * dz);

        const gridSize = canvas?.grid?.size || 100;
        const unitDist = canvas?.scene?.grid?.distance || 5;
        return (distance3D / gridSize) * unitDist;
      }

      if (canvas.grid.measurePath) {
        const path = canvas.grid.measurePath([storedCenter, observerToken.center]);
        return path.distance;
      } else if (canvas.grid.measureDistance) {
        return canvas.grid.measureDistance(storedCenter, observerToken.center);
      } else {
        const dx = storedCenter.x - observerToken.center.x;
        const dy = storedCenter.y - observerToken.center.y;
        return Math.sqrt(dx * dx + dy * dy);
      }
    } catch {
      const dx = storedPosition.x - observerToken.center.x;
      const dy = storedPosition.y - observerToken.center.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      console.warn('PF2E Visioner | Using fallback distance calculation with stored position:', distance);
      return distance;
    }
  }

  /**
   * Checks if there's line of sight between tokens using FoundryVTT v13 APIs
   * @param {Token} token1 - First token
   * @param {Token} token2 - Second token
   * @returns {boolean} Whether there's line of sight
   * @private
   */
  _hasLineOfSight(token1, token2) {
    try {
      // Use AVS VisionAnalyzer for line of sight calculation
      const visionAnalyzer = visibilityCalculator.getComponents().visionAnalyzer;
      if (visionAnalyzer && visionAnalyzer.hasLineOfSight) {
        return visionAnalyzer.hasLineOfSight(token1, token2);
      }

      // Fallback to Foundry's built-in collision detection
      const ray = new foundry.canvas.geometry.Ray(token1.center, token2.center);

      // Check if walls block line of sight using v13+ API
      if (canvas.walls?.testCollision) {
        return !canvas.walls.testCollision(ray.A, ray.B, { type: 'sight' });
      } else if (canvas.walls?.checkCollision) {
        return !canvas.walls.checkCollision(ray, { type: 'sight' });
      } else {
        // Fallback: assume line of sight exists
        console.warn(
          'PF2E Visioner | No wall collision detection available, assuming line of sight',
        );
        return true;
      }
    } catch (error) {
      console.warn('PF2E Visioner | Line of sight calculation failed:', error);
      return true; // Default to true if calculation fails
    }
  }

  /**
   * Gets lighting conditions between tokens
   * @param {Token} token1 - First token
   * @param {Token} token2 - Second token
   * @returns {string} Lighting condition description
   * @private
   */
  _getLightingConditions(token2) {
    try {
      // Use the LightingCalculator singleton directly for accurate lighting analysis
      const lightingCalculator = LightingCalculator.getInstance();

      // Use target token directly for lighting calculation

      const targetPosition = {
        x: token2.center.x,
        y: token2.center.y,
        elevation: token2.document.elevation || 0,
      };

      const lightLevelInfo = lightingCalculator.getLightLevelAt(targetPosition, token2);

      // Return the light level directly from the calculator
      return lightLevelInfo.level; // Returns 'bright', 'dim', or 'darkness'
    } catch (error) {
      console.warn('PF2E Visioner | Lighting calculation failed:', error);
      return 'unknown';
    }
  }


  /**
   * Creates an error state when position calculation fails
   * @param {number} timestamp - Timestamp for the error state
   * @param {Error} error - The error that occurred
   * @returns {PositionState} Error position state
   * @private
   */
  _createErrorState(timestamp, error) {
    const diagnostics = dualSystemIntegration.getSystemDiagnostics();

    return {
      avsVisibility: 'observed',
      avsCalculated: false,
      coverState: 'none',
      coverCalculated: false,
      coverOverride: null,
      stealthBonus: 0,
      effectiveVisibility: 'observed',
      distance: 0,
      hasLineOfSight: true,
      lightingConditions: 'unknown',
      timestamp,
      avsEnabled: diagnostics.avs.available,
      autoCoverEnabled: diagnostics.autoCover.available,
      systemErrors: [`Position calculation failed: ${error.message}`],
    };
  }

  /**
   * Creates a fallback state when error handling provides fallback data
   * @param {number} timestamp - Timestamp for the state
   * @param {*} fallbackData - Fallback data from error handling
   * @returns {PositionState} Fallback position state
   * @private
   */
  _createFallbackState(timestamp, fallbackData) {
    const diagnostics = dualSystemIntegration.getSystemDiagnostics();

    return {
      avsVisibility: fallbackData?.visibility || 'observed',
      avsCalculated: false,
      coverState: fallbackData?.cover?.state || 'none',
      coverCalculated: false,
      coverOverride: null,
      stealthBonus: fallbackData?.cover?.bonus || 0,
      effectiveVisibility: fallbackData?.visibility || 'observed',
      distance: 0,
      hasLineOfSight: true,
      lightingConditions: 'unknown',
      timestamp,
      avsEnabled: diagnostics.avs.available,
      autoCoverEnabled: diagnostics.autoCover.available,
      systemErrors: ['Using fallback data due to system failure'],
    };
  }



  /**
   * Determines the importance level of a position state for caching
   * @param {PositionState} positionState - Position state to evaluate
   * @returns {string} Importance level
   * @private
   */
  _determinePositionImportance(positionState) {
    // Critical: Hidden or undetected states (most important for stealth)
    if (positionState.avsVisibility === 'hidden' || positionState.avsVisibility === 'undetected') {
      return 'critical';
    }

    // High: Concealed states or significant cover
    if (positionState.avsVisibility === 'concealed' || positionState.stealthBonus >= 2) {
      return 'high';
    }

    // Low: Observed states with no cover
    if (positionState.avsVisibility === 'observed' && positionState.stealthBonus === 0) {
      return 'low';
    }

    // Normal: Everything else
    return 'normal';
  }
}

// Export singleton instance
export default new PositionTracker();
