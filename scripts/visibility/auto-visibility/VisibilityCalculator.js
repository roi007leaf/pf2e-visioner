/**
 * VisibilityCalculator - Zero-delay visibility calculation
 * Bypasses all throttling and circuit breaking for immediate processing
 * 
 * NOTE: This class now uses the StatelessVisibilityCalculator as its backend
 * via the adapter pattern, maintaining the same interface while using pure
 * function-based calculation logic.
 */

import { calculateVisibilityFromTokens } from '../VisibilityCalculatorAdapter.js';

export class VisibilityCalculator {
  /** @type {VisibilityCalculator} */
  static #instance = null;

  /** @type {LightingCalculator} */
  #lightingCalculator;

  /** @type {VisionAnalyzer} */
  #visionAnalyzer;

  /** @type {ConditionManager} */
  #conditionManager;

  /** @type {LightingRasterService} */
  #lightingRasterService = null;

  /** @type {MinimumVisibilityService} */
  #minimumVisibilityService = null;

  constructor() {
    if (VisibilityCalculator.#instance) {
      return VisibilityCalculator.#instance;
    }
    VisibilityCalculator.#instance = this;
  }

  /**
   * Get the singleton instance
   * @returns {VisibilityCalculator}
   */
  static getInstance() {
    if (!VisibilityCalculator.#instance) {
      VisibilityCalculator.#instance = new VisibilityCalculator();
    }
    return VisibilityCalculator.#instance;
  }

  /**
   * Initialize with required components
   * @param {LightingCalculator} lightingCalculator
   * @param {VisionAnalyzer} visionAnalyzer
   * @param {ConditionManager} ConditionManager
   * @param {LightingRasterService} lightingRasterService - Optional lighting raster service for ray darkness checks
   * @param {MinimumVisibilityService} minimumVisibilityService - Optional minimum visibility service for enforcing visibility limits
   */
  initialize(
    lightingCalculator,
    visionAnalyzer,
    ConditionManager,
    lightingRasterService,
    minimumVisibilityService = null,
  ) {
    this.#lightingCalculator = lightingCalculator;
    this.#visionAnalyzer = visionAnalyzer;
    this.#conditionManager = ConditionManager;
    this.#lightingRasterService = lightingRasterService || null;
    this.#minimumVisibilityService = minimumVisibilityService;
  }

  /**
   * Calculate visibility between observer and target tokens - IMMEDIATE, NO THROTTLING
   * @param {Token} observer
   * @param {Token} target
   * @returns {Promise<string>} Visibility state
   */
  async calculateVisibility(observer, target, options = undefined) {
    // Check if we should skip this calculation based on spatial/LOS optimizations
    const shouldSkip = this._shouldSkipCalculation(observer, target);

    if (shouldSkip) {
      return { state: 'observed', reason: 'skip_calculation_fallback' };
    }

    const result = await this.calculateVisibilityBetweenTokens(
      observer,
      target,
      null,
      null,
      options,
    );

    // Extract state for backward compatibility
    if (typeof result === 'object' && result.state) {
      return result.state;
    }
    return result;
  }

  /**
   * Check if we should skip calculation based on spatial/LOS optimizations
   * @param {Token} observer - Observer token
   * @param {Token} target - Target token
   * @returns {boolean} Whether to skip the calculation
   * @private
   */
  _shouldSkipCalculation(observer, target) {
    // Skip optimization is disabled to ensure accurate calculations
    return false;
  }

  /**
   * Calculate visibility between observer and target tokens, IGNORING AVS override flags.
   * This is used for override validation to get the "true" AVS-calculated state.
   * @param {Token} observer
   * @param {Token} target
   * @returns {Promise<string>} Visibility state
   */
  async calculateVisibilityWithoutOverrides(observer, target, options = undefined) {
    if (!observer?.actor || !target?.actor) {
      return { state: 'observed', reason: 'missing_actor_fallback' };
    }

    // Temporarily remove any AVS override flag for this observer-target pair
    const targetFlags = target?.document?.flags?.['pf2e-visioner'] || {};
    const observerFlagKey = `avs-override-from-${observer?.document?.id}`;
    let removedOverride = null;
    if (targetFlags[observerFlagKey]) {
      removedOverride = targetFlags[observerFlagKey];
      // Remove override
      delete target.document.flags['pf2e-visioner'][observerFlagKey];
    }
    let result;
    try {
      // Use raw LoS to bypass detection wrappers for the override-free calculation
      result = await this.calculateVisibilityBetweenTokens(observer, target, null, null, options);
    } finally {
      // Restore override if it was present
      if (removedOverride) {
        target.document.flags['pf2e-visioner'][observerFlagKey] = removedOverride;
      }
    }

    return result;
  }

  /**
   * Calculate visibility between observer and target tokens with optional position overrides - IMMEDIATE, NO THROTTLING
   * @param {Token} observer - The observing token
   * @param {Token} target - The target token
   * @param {Object} observerPositionOverride - Optional {x, y} position override for observer (reserved for future use)
   * @param {Object} targetPositionOverride - Optional {x, y} position override for target
   * @param {Object} options - Optional calculation options (precomputed lights, senses cache, etc.)
   * @returns {Promise<string>} Visibility state
   */
  async calculateVisibilityBetweenTokens(
    observer,
    target,
    _observerPositionOverride = null,
    targetPositionOverride = null,
    options = undefined,
  ) {
    // Use stateless calculator via adapter
    const result = await calculateVisibilityFromTokens(
      observer,
      target,
      {
        lightingCalculator: this.#lightingCalculator,
        visionAnalyzer: this.#visionAnalyzer,
        conditionManager: this.#conditionManager,
        lightingRasterService: this.#lightingRasterService,
        minimumVisibilityService: this.#minimumVisibilityService
      },
      options
    );

    return result.state;
  }


  /**
   * Clear caches in all components
   */
  clearCaches() {
    // Note: LightingCalculator doesn't maintain internal caches that need clearing
    // Lighting data is computed on-demand from Foundry's lighting system

    if (this.#visionAnalyzer && typeof this.#visionAnalyzer.clearVisionCache === 'function') {
      this.#visionAnalyzer.clearVisionCache();
    }
  }

  /**
   * Get component instances for direct access if needed
   * @returns {Object}
   */
  getComponents() {
    return {
      lightingCalculator: this.#lightingCalculator,
      visionAnalyzer: this.#visionAnalyzer,
      ConditionManager: this.#conditionManager,
    };
  }
}

// Export singleton instance
export const visibilityCalculator = VisibilityCalculator.getInstance();

// Also export with the legacy name for backward compatibility
export const optimizedVisibilityCalculator = visibilityCalculator;
