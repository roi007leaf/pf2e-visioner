/**
 * VisibilityCalculator - Zero-delay visibility calculation
 * Bypasses all throttling and circuit breaking for immediate processing
 */

import { MODULE_ID } from '../../constants.js';
import { getLogger } from '../../utils/logger.js';
import { SpatialAnalysisService } from './core/SpatialAnalysisService.js';
const log = getLogger('VisibilityCalculator');

export class VisibilityCalculator {
  /** @type {VisibilityCalculator} */
  static #instance = null;

  /** @type {LightingCalculator} */
  #lightingCalculator;

  /** @type {VisionAnalyzer} */
  #visionAnalyzer;

  /** @type {ConditionManager} */
  #conditionManager;

  /** @type {import('./core/LightingRasterService.js').LightingRasterService|null} */
  #lightingRasterService = null;

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
   * @param {SpatialAnalysisService} spatialAnalyzer - Optional spatial analysis service for optimizations
   * @param {ExclusionManager} exclusionManager - Optional exclusion manager for token exclusions
   */
  initialize(
    lightingCalculator,
    visionAnalyzer,
    ConditionManager,
    spatialAnalyzer = null,
    exclusionManager = null,
    lightingRasterService = null,
  ) {
    this.#lightingCalculator = lightingCalculator;
    this.#visionAnalyzer = visionAnalyzer;
    this.#conditionManager = ConditionManager;
    this.#lightingRasterService = lightingRasterService || null;
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
    // Use the new baseline-first workflow
    const result = await this.#calculateVisibilityWithNewWorkflow(
      observer,
      target,
      _observerPositionOverride,
      targetPositionOverride,
      options,
    );

    // For backwards compatibility, return just the state for now
    // TODO: Update calling code to handle {state, reason} objects
    if (typeof result === 'object' && result.state) {
      return result.state;
    }
    return result;
  }
  /**
   * Light-condition-based visibility calculation workflow
   * Each lighting condition has its own specific workflow
   */
  async #calculateVisibilityWithNewWorkflow(
    observer,
    target,
    _observerPositionOverride,
    targetPositionOverride,
    options,
  ) {
    if (!observer?.actor || !target?.actor) {
      return { state: 'observed', reason: 'missing_actor' };
    }

    try {
      // Step 1: Get lighting conditions at target position
      const targetPosition = targetPositionOverride || {
        x: target.document.x + (target.document.width * canvas.grid.size) / 2,
        y: target.document.y + (target.document.height * canvas.grid.size) / 2,
        elevation: target.document.elevation || 0,
      };

      const lightLevel = this.#getTargetLightLevel(target, targetPositionOverride, options);
      const observerVision = this.#getObserverVisionCapabilities(observer, options);

      // Step 2: Route to appropriate lighting workflow based on actual lighting level
      const lightingLevel = lightLevel?.level || 'bright'; // 'bright', 'dim', or 'darkness'
      const isDarknessSource = lightLevel?.isDarknessSource ?? false;
      const isHeightenedDarkness = lightLevel?.isHeightenedDarkness ?? false;

      let result;
      if (lightingLevel === 'bright') {
        // Bright light workflow
        result = await this.#handleBrightLightWorkflow(
          observer,
          target,
          observerVision,
          targetPosition,
          options,
        );
      } else if (lightingLevel === 'dim') {
        // Dim light workflow
        result = await this.#handleDimLightWorkflow(
          observer,
          target,
          observerVision,
          lightLevel,
          targetPosition,
          options,
        );
      } else if (lightingLevel === 'darkness') {
        // Darkness workflow - route based on darkness spell rank and observer capabilities
        if (isDarknessSource && isHeightenedDarkness) {
          // Rank 4+ heightened darkness spells
          result = await this.#handleHeightenedDarknessWorkflow(
            observer,
            target,
            observerVision,
            lightLevel,
            targetPosition,
            options,
          );
        } else if (isDarknessSource) {
          // Rank 1-3 darkness spells
          result = await this.#handleDarknessSpellWorkflow(
            observer,
            target,
            observerVision,
            lightLevel,
            targetPosition,
            options,
          );
        } else {
          // Natural darkness (no light sources)
          result = await this.#handleNaturalDarknessWorkflow(
            observer,
            target,
            observerVision,
            lightLevel,
            targetPosition,
            options,
          );
        }
      } else {
        // Fallback to bright light if lighting level is unknown
        result = await this.#handleBrightLightWorkflow(
          observer,
          target,
          observerVision,
          targetPosition,
          options,
        );
      }

      // CRITICAL FIX: Check invisible condition LAST, after determining base visibility state
      // This allows us to apply proper PF2E invisible condition transitions based on what the
      // observer would normally see (the base state we just calculated)

      const invisibilityResult = await this.#checkInvisibilityConditionWithBaseState(
        observer,
        target,
        result.state,
        targetPositionOverride,
        options,
      );

      if (invisibilityResult) {
        return invisibilityResult;
      }

      return result;
    } catch (error) {
      console.error('PF2E Visioner | Error in visibility workflow:', error);
      return { state: 'observed', reason: 'error_fallback' };
    }
  }

  /**
   * Get vision capabilities for a token (public API)
   * @param {Token} token
   * @returns {Object}
   */
  getVisionCapabilities(token) {
    return this.#visionAnalyzer.getVisionCapabilities(token);
  }

  /**
   * Handle bright light workflow (darknessRank < 0)
   * Simple workflow: check vision → LoS → check conditions → return result
   */
  async #handleBrightLightWorkflow(observer, target, observerVision, targetPosition, options) {
    // Step 1: Check vision capabilities
    if (!observerVision.hasVision) {
      return await this.#handleNoVisionScenario(observer, target, options);
    }

    // Step 2: Check basic LoS and elevation
    const losResult = this.#handleLineOfSightCheck(observer, target);
    if (losResult) return losResult;

    const elevationResult = this.#checkElevationRules(observer, target);
    if (elevationResult) return elevationResult;

    // Step 2.5: Check for cross-boundary scenarios (observer in darkness, target in bright light)
    const lightLevel = {
      level: 'bright',
      darknessRank: 0,
      isDarknessSource: false,
      isHeightenedDarkness: false,
    };
    const crossBoundaryResult = await this.#checkCrossBoundaryDarkness(
      observer,
      target,
      observerVision,
      lightLevel,
      targetPosition,
      options,
    );
    if (crossBoundaryResult) return crossBoundaryResult;

    // Step 3: Check conditions (bright light = optimal visibility for normal vision)
    const blindnessResult = this.#checkBlindnessCondition(observer, target);
    if (blindnessResult) return blindnessResult;

    // Note: Invisible condition check moved to end of workflow for proper base state handling

    const dazzledResult = this.#checkDazzledCondition(observer, target);
    if (dazzledResult) return dazzledResult;

    // Default: bright light with no conditions = observed
    return { state: 'observed', reason: 'bright_light_clear' };
  }

  /**
   * Handle dim light workflow (lightingType = 'dim')
   * Check vision → LoS → apply dim light concealment → check conditions → return result
   */
  async #handleDimLightWorkflow(
    observer,
    target,
    observerVision,
    lightLevel,
    targetPosition,
    options,
  ) {
    // Step 1: Check vision capabilities
    if (!observerVision.hasVision) {
      return await this.#handleNoVisionScenario(observer, target, options);
    }

    // Step 2: Check basic LoS and elevation
    const losResult = this.#handleLineOfSightCheck(observer, target);
    if (losResult) return losResult;

    const elevationResult = this.#checkElevationRules(observer, target);
    if (elevationResult) return elevationResult;

    // Step 2.5: Check for cross-boundary scenarios (darkness between tokens or observer in different lighting)
    const crossBoundaryResult = await this.#checkCrossBoundaryDarkness(
      observer,
      target,
      observerVision,
      lightLevel,
      targetPosition,
      options,
    );
    if (crossBoundaryResult) return crossBoundaryResult;

    // Step 3: Determine base visibility in dim light
    let baseVisibility = 'concealed'; // Dim light causes concealment for normal vision

    // Low-light vision and darkvision can see normally in dim light
    if (
      observerVision.hasLowLightVision ||
      observerVision.hasDarkvision ||
      observerVision.hasGreaterDarkvision ||
      observerVision.hasRegularDarkvision
    ) {
      baseVisibility = 'observed';
    }

    // Step 4: Check conditions
    const blindnessResult = this.#checkBlindnessCondition(observer, target);
    if (blindnessResult) return blindnessResult;

    // Note: Invisible condition check moved to end of workflow for proper base state handling

    const dazzledResult = this.#checkDazzledCondition(observer, target);
    if (dazzledResult) return dazzledResult;

    return { state: baseVisibility, reason: 'dim_light_base_visibility' };
  }

  /**
   * Handle darkness spell workflow (lightingLevel = 'darkness', isDarknessSource = true, darknessRank 1-3)
   * Check darkvision capability → handle cross-boundary scenarios → check conditions → return result
   */
  async #handleDarknessSpellWorkflow(
    observer,
    target,
    observerVision,
    lightLevel,
    targetPosition,
    options,
  ) {
    // Step 1: Check vision capabilities
    if (!observerVision.hasVision) {
      return await this.#handleNoVisionScenario(observer, target, options);
    }

    // Step 2: Check if darkvision is effective in rank 1-3 darkness spells
    if (
      observerVision.hasGreaterDarkvision ||
      observerVision.hasDarkvision ||
      observerVision.hasRegularDarkvision
    ) {
      // Darkvision works normally in rank 1-3 darkness spells
      const losResult = this.#handleLineOfSightCheck(observer, target);
      if (losResult) return losResult;

      const elevationResult = this.#checkElevationRules(observer, target);
      if (elevationResult) return elevationResult;

      // Check for cross-boundary scenarios
      const crossBoundaryResult = await this.#checkCrossBoundaryDarkness(
        observer,
        target,
        observerVision,
        lightLevel,
        targetPosition,
        options,
      );
      if (crossBoundaryResult) return crossBoundaryResult;

      // Check conditions with darkvision active (darkvision sees observed in rank 1-3 darkness)
      return await this.#applyConditionsWithDarkvision(observer, target, 'observed', options);
    } else {
      // No darkvision in darkness spell area
      return await this.#handleNoVisionScenario(observer, target, options);
    }
  }

  /**
   * Handle heightened darkness workflow (lightingLevel = 'darkness', isDarknessSource = true, isHeightenedDarkness = true)
   * Check greater darkvision → handle darkvision concealment → check non-visual senses → check conditions → return result
   */
  async #handleHeightenedDarknessWorkflow(
    observer,
    target,
    observerVision,
    lightLevel,
    targetPosition,
    options,
  ) {
    // Step 1: Check vision capabilities
    if (!observerVision.hasVision) {
      return await this.#handleNoVisionScenario(observer, target, options);
    }

    // Step 2: Check darkvision capabilities for rank 4+ heightened darkness spells
    if (observerVision.hasGreaterDarkvision) {
      // Greater darkvision works perfectly in rank 4+ heightened darkness spells
      const losResult = this.#handleLineOfSightCheck(observer, target);
      if (losResult) return losResult;

      const elevationResult = this.#checkElevationRules(observer, target);
      if (elevationResult) return elevationResult;

      // Check for cross-boundary scenarios
      const crossBoundaryResult = await this.#checkCrossBoundaryDarkness(
        observer,
        target,
        observerVision,
        lightLevel,
        targetPosition,
        options,
      );
      if (crossBoundaryResult) return crossBoundaryResult;

      // Check conditions with greater darkvision active (sees observed)
      return await this.#applyConditionsWithDarkvision(observer, target, 'observed', options);
    } else if (observerVision.hasDarkvision || observerVision.hasRegularDarkvision) {
      // Regular darkvision sees concealed in rank 4+ heightened darkness spells
      const losResult = this.#handleLineOfSightCheck(observer, target);
      if (losResult) return losResult;

      const elevationResult = this.#checkElevationRules(observer, target);
      if (elevationResult) return elevationResult;

      // Check for cross-boundary scenarios
      const crossBoundaryResult = await this.#checkCrossBoundaryDarkness(
        observer,
        target,
        observerVision,
        lightLevel,
        targetPosition,
        options,
      );
      if (crossBoundaryResult) return crossBoundaryResult;

      // Check conditions with regular darkvision seeing concealed in rank 4+ heightened darkness
      const result = await this.#applyConditionsWithDarkvision(
        observer,
        target,
        'concealed',
        options,
      );
      return this.#wrapWithReason(result, 'heightened_darkness_darkvision');
    } else {
      // No darkvision in rank 4+ heightened darkness spell area
      return await this.#handleNoVisionScenario(observer, target, options);
    }
  }

  /**
   * Handle natural darkness workflow (lightingLevel = 'darkness', isDarknessSource = false)
   * This is just absence of light, not a magical darkness spell
   */
  async #handleNaturalDarknessWorkflow(
    observer,
    target,
    observerVision,
    lightLevel,
    targetPosition,
    options,
  ) {
    // Step 1: Check vision capabilities
    if (!observerVision.hasVision) {
      return await this.#handleNoVisionScenario(observer, target, options);
    }

    // Step 2: Natural darkness - darkvision works normally
    if (
      observerVision.hasGreaterDarkvision ||
      observerVision.hasDarkvision ||
      observerVision.hasRegularDarkvision
    ) {
      // Darkvision works normally in natural darkness
      const losResult = this.#handleLineOfSightCheck(observer, target);
      if (losResult) return losResult;

      const elevationResult = this.#checkElevationRules(observer, target);
      if (elevationResult) return elevationResult;

      // Check for cross-boundary scenarios
      const crossBoundaryResult = await this.#checkCrossBoundaryDarkness(
        observer,
        target,
        observerVision,
        lightLevel,
        targetPosition,
        options,
      );
      if (crossBoundaryResult) return crossBoundaryResult;

      // Check conditions with darkvision active (natural darkness = observed)
      return await this.#applyConditionsWithDarkvision(observer, target, 'observed', options);
    } else {
      // No darkvision in natural darkness
      return await this.#handleNoVisionScenario(observer, target, options);
    }
  }

  /**
   * Handle scenarios where observer has no effective vision
   * Falls back to non-visual senses
   */
  async #handleNoVisionScenario(observer, target, options) {
    try {
      // Check elevation rules first (even for no-vision scenarios)
      const elevationResult = this.#checkElevationRules(observer, target);
      if (elevationResult) {
        return elevationResult;
      }

      const hasPreciseNonVisual = this.#visionAnalyzer.hasPreciseNonVisualInRange(observer, target);
      const canSenseImprecisely = this.#visionAnalyzer.canSenseImprecisely(observer, target);

      if (hasPreciseNonVisual) {
        const result = await this.#applyConditionsWithDarkvision(
          observer,
          target,
          'observed',
          options,
        );
        return this.#wrapWithReason(result, 'precise_non_visual_sense');
      }

      if (canSenseImprecisely) {
        const result = await this.#applyConditionsWithDarkvision(
          observer,
          target,
          'hidden',
          options,
        );
        return this.#wrapWithReason(result, 'imprecise_sense');
      }

      // No senses at all - check conditions for undetected base
      const result = await this.#applyConditionsWithDarkvision(
        observer,
        target,
        'undetected',
        options,
      );
      return this.#wrapWithReason(result, 'no_senses');
    } catch (error) {
      return { state: 'hidden', reason: 'error_fallback' };
    }
  }

  /**
   * Helper method to wrap a result with a reason if it's not already wrapped
   */
  #wrapWithReason(result, defaultReason) {
    if (typeof result === 'object' && result.state && result.reason) {
      return result; // Already has state + reason
    }
    return { state: result, reason: defaultReason };
  }

  /**
   * Apply conditions with the given base visibility from darkvision/senses
   */
  async #applyConditionsWithDarkvision(observer, target, baseVisibility, options) {
    // Check conditions in order of precedence
    const blindnessResult = this.#checkBlindnessCondition(observer, target);
    if (blindnessResult) return this.#wrapWithReason(blindnessResult, 'blindness_condition');

    // NOTE: Invisible condition is now handled in the main workflow via #checkInvisibilityConditionWithBaseState
    // This ensures proper PF2E rule application based on the calculated base visibility state

    const dazzledResult = this.#checkDazzledCondition(observer, target);
    if (dazzledResult) {
      // Dazzled can only make things worse, not better
      if (baseVisibility === 'observed') return { state: 'concealed', reason: 'dazzled_condition' };
      return { state: baseVisibility, reason: 'dazzled_no_change' };
    }

    return { state: baseVisibility, reason: 'base_visibility' };
  }

  /**
   * Check for cross-boundary darkness scenarios (simplified)
   */
  async #checkCrossBoundaryDarkness(
    observer,
    target,
    observerVision,
    targetLightLevel,
    targetPosition,
    options,
  ) {
    try {
      // Cross-boundary darkness check
      // Get observer position and light level
      const observerPosition = {
        x: observer.document.x + (observer.document.width * canvas.grid.size) / 2,
        y: observer.document.y + (observer.document.height * canvas.grid.size) / 2,
        elevation: observer.document.elevation || 0,
      };

      const opts = options && typeof options === 'object' ? options : {};
      const pre = opts.precomputedLights || null;
      const observerId = observer?.document?.id;
      let observerLightLevel;
      if (pre && observerId && pre[observerId]) {
        observerLightLevel = pre[observerId];
      } else if (pre && observerId && typeof pre.get === 'function' && pre.has(observerId)) {
        observerLightLevel = pre.get(observerId);
      } else {
        observerLightLevel = this.#lightingCalculator.getLightLevelAt(observerPosition, observer);
      }

      const observerInDarkness = (observerLightLevel?.darknessRank ?? 0) >= 1;
      const targetInDarkness = (targetLightLevel?.darknessRank ?? 0) >= 1;
      // Check if this is truly a cross-boundary scenario OR if line passes through darkness
      const differentLightingStates = observerInDarkness !== targetInDarkness;

      if (differentLightingStates) {
        // Different lighting states detected
        // Use existing cross-boundary darkness handling
        return await this.#handleCrossBoundaryDarkness(
          observer,
          target,
          observerVision,
          targetLightLevel,
          observerPosition,
          targetPosition,
          pre,
          {},
          options,
        );
      } else {
        // Both tokens are in same lighting state - check if line passes through different darkness
        // Only apply cross-boundary rules if line actually passes through different darkness areas
        const { linePassesThroughDarkness, rayDarknessRank } =
          await this.#checkDarknessRayIntersection(
            observer,
            target,
            observerPosition,
            targetPosition,
          );

        // Only trigger cross-boundary handling if line passes through darkness of different rank
        if (
          linePassesThroughDarkness &&
          rayDarknessRank !== (targetLightLevel?.darknessRank ?? 0)
        ) {
          return await this.#handleCrossBoundaryDarkness(
            observer,
            target,
            observerVision,
            targetLightLevel,
            observerPosition,
            targetPosition,
            pre,
            {},
            options,
          );
        }

        // COMPREHENSIVE FIX: Handle ALL non-darkvision scenarios involving darkness
        // This covers "in and in", "out looking in", and "in looking out" scenarios

        if (
          (observerInDarkness || targetInDarkness) &&
          !observerVision.hasDarkvision &&
          !observerVision.hasGreaterDarkvision &&
          !observerVision.hasRegularDarkvision
        ) {
          // Check for special senses first
          const hasPreciseNonVisual = this.#visionAnalyzer.hasPreciseNonVisualInRange(
            observer,
            target,
          );
          const canSenseImprecisely = this.#visionAnalyzer.canSenseImprecisely(observer, target);

          if (hasPreciseNonVisual) {
            return { state: 'observed', reason: 'precise_non_visual_in_darkness' };
          }
          if (canSenseImprecisely) {
            return { state: 'hidden', reason: 'imprecise_sense_in_darkness' };
          }

          // Observer has vision but can't see in darkness = hidden (not undetected)
          const scenario =
            observerInDarkness && targetInDarkness
              ? 'both_in_darkness'
              : observerInDarkness && !targetInDarkness
                ? 'observer_in_target_out'
                : 'observer_out_target_in';
          return { state: 'hidden', reason: `no_darkvision_${scenario}` };
        }

        // Same lighting state and no cross-boundary darkness - continue with normal processing
        return null;
      }
    } catch (error) {
      console.error('ERROR in cross-boundary check:', error);
      return null; // Continue with normal processing
    }
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

  /**
   * Get status information
   * @returns {Object}
   */
  getStatus() {
    return {
      initialized: !!(this.#lightingCalculator && this.#visionAnalyzer && this.#conditionManager),
      optimized: true,
      throttling: false,
      circuitBreaker: false,
      description: 'Zero-delay visibility calculator - no throttling or circuit breaking',
      components: {
        lightingCalculator: !!this.#lightingCalculator,
        visionAnalyzer: !!this.#visionAnalyzer,
        ConditionManager: !!this.#conditionManager,
      },
    };
  }

  /**
   * Check if we should skip this calculation based on spatial/LOS optimizations
   * @param {Token} observer - Observer token
   * @param {Token} target - Target token
   * @returns {boolean} Whether to skip the calculation
   * @private
   */
  _shouldSkipCalculation(observer, target) {
    // TEMPORARY: Disable skip optimization to fix tremorsense ground-level detection
    return false;
  }

  /**
   * Get the maximum range of special senses that work without line of sight
   * @param {Object} observerVision - Vision capabilities object
   * @returns {number} Maximum range in grid units, or 0 if no special senses
   */
  _getMaxSpecialSenseRange(observerVision) {
    if (!observerVision) {
      return 0;
    }

    let maxRange = 0;

    // PART 1: Check detection modes from vision capabilities (single source of truth)
    const detectionModes = observerVision.detectionModes || {};

    // Check for non-visual detection modes (based on CONFIG.Canvas.detectionModes)
    const nonVisualDetectionModes = {
      feelTremor: 'tremorsense',
      hearing: 'hearing',
      senseInvisibility: 'sense-invisibility',
      // Potential non-CONFIG modes that might exist
      blindsense: 'blindsense',
      echolocation: 'echolocation',
      lifesense: 'lifesense',
      scent: 'scent',
    };

    for (const [modeName, senseName] of Object.entries(nonVisualDetectionModes)) {
      if (
        detectionModes[modeName] &&
        detectionModes[modeName].enabled &&
        detectionModes[modeName].range > 0
      ) {
        const range = detectionModes[modeName].range;
        maxRange = Math.max(maxRange, range);
      }
    }

    // Log all properties to find where other senses might be stored
    for (const [key, value] of Object.entries(observerVision)) {
      if (key !== 'observer') {
        // Skip the observer we added
      }
    }

    const sensingSummary = observerVision.sensingSummary || {};

    const allSenses = [...(sensingSummary.imprecise || []), ...(sensingSummary.precise || [])];

    // PART 2: Check traditional senses in sensingSummary
    const nonVisualSenseTypes = ['tremorsense', 'blindsense', 'echolocation', 'lifesense'];

    for (const sense of allSenses) {
      if (nonVisualSenseTypes.includes(sense.type)) {
        const range = sense.range || 0;
        maxRange = Math.max(maxRange, range);
      }
    }

    // FALLBACK: If no senses found in vision object, check observer actor directly
    if (maxRange === 0 && observerVision.observer) {
      const actor = observerVision.observer?.actor;
      if (actor) {
        const actorSenses = actor.system?.perception?.senses || actor.system?.senses || [];

        for (const sense of actorSenses) {
          if (sense.type === 'tremorsense') {
            const range = sense.range || sense.value || 60; // Default to 60 if no range specified
            maxRange = Math.max(maxRange, range);
          }
        }
      }
    }

    return maxRange;
  } /**
   * Check if observer has non-visual senses that can work without line of sight
   * @param {Object} observerVision - Vision capabilities object
   * @returns {boolean} True if observer has tremorsense, blindsense, or other non-visual senses
   */
  _hasNonVisualSenses(observerVision) {
    return this._getMaxSpecialSenseRange(observerVision) > 0;
  }

  /**
   * Get token position for distance calculations
   * @param {Token} token - Token to get position for
   * @returns {Object} Position {x, y}
   * @private
   */
  _getTokenPosition(token) {
    try {
      return {
        x: token.document.x + (token.document.width * canvas.grid.size) / 2,
        y: token.document.y + (token.document.height * canvas.grid.size) / 2,
      };
    } catch {
      return { x: 0, y: 0 };
    }
  }

  /**
   * Get lighting calculator for debugging
   * @returns {LightingCalculator} The lighting calculator instance
   */
  getLightingCalculator() {
    return this.#lightingCalculator;
  }

  /**
   * Get vision analyzer for debugging
   * @returns {VisionAnalyzer} The vision analyzer instance
   */
  getVisionAnalyzer() {
    return this.#visionAnalyzer;
  }

  /**
   * Get condition manager for debugging
   * @returns {ConditionManager} The condition manager instance
   */
  getConditionManager() {
    return this.#conditionManager;
  }

  /**
   * Manual line-rectangle intersection check
   * @param {Object} rayStart - Ray start point {x, y}
   * @param {Object} rayEnd - Ray end point {x, y}
   * @param {number} left - Rectangle left edge
   * @param {number} top - Rectangle top edge
   * @param {number} right - Rectangle right edge
   * @param {number} bottom - Rectangle bottom edge
   * @returns {boolean} - Whether the line intersects the rectangle
   */
  #lineIntersectsRectangle(rayStart, rayEnd, left, top, right, bottom) {
    // Check if either endpoint is inside the rectangle
    if (
      (rayStart.x >= left && rayStart.x <= right && rayStart.y >= top && rayStart.y <= bottom) ||
      (rayEnd.x >= left && rayEnd.x <= right && rayEnd.y >= top && rayEnd.y <= bottom)
    ) {
      return true;
    }

    // Check intersection with each edge of the rectangle
    const edges = [
      { x1: left, y1: top, x2: right, y2: top }, // top edge
      { x1: right, y1: top, x2: right, y2: bottom }, // right edge
      { x1: right, y1: bottom, x2: left, y2: bottom }, // bottom edge
      { x1: left, y1: bottom, x2: left, y2: top }, // left edge
    ];

    for (const edge of edges) {
      if (this.#lineSegmentsIntersect(rayStart, rayEnd, edge)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if two line segments intersect
   * @param {Object} line1Start - First line start point {x, y}
   * @param {Object} line1End - First line end point {x, y}
   * @param {Object} line2 - Second line with {x1, y1, x2, y2}
   * @returns {boolean} - Whether the line segments intersect
   */
  #lineSegmentsIntersect(line1Start, line1End, line2) {
    const x1 = line1Start.x,
      y1 = line1Start.y;
    const x2 = line1End.x,
      y2 = line1End.y;
    const x3 = line2.x1,
      y3 = line2.y1;
    const x4 = line2.x2,
      y4 = line2.y2;

    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denom) < 1e-10) return false; // Lines are parallel

    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
  }

  /**
   * Check if a ray intersects with a circle
   * @param {foundry.canvas.geometry.Ray} ray - The ray to check
   * @param {number} centerX - Circle center X coordinate
   * @param {number} centerY - Circle center Y coordinate
   * @param {number} radius - Circle radius
   * @returns {boolean} - Whether the ray intersects the circle
   */
  #rayIntersectsCircle(ray, centerX, centerY, radius) {
    try {
      const rayStart = ray.A;
      const rayEnd = ray.B;

      // Check if either endpoint is inside the circle
      const distStart = Math.sqrt((rayStart.x - centerX) ** 2 + (rayStart.y - centerY) ** 2);
      const distEnd = Math.sqrt((rayEnd.x - centerX) ** 2 + (rayEnd.y - centerY) ** 2);

      if (distStart <= radius || distEnd <= radius) {
        return true;
      }

      // Check if the line segment intersects the circle
      // Calculate closest point on line to circle center
      const dx = rayEnd.x - rayStart.x;
      const dy = rayEnd.y - rayStart.y;
      const lineLengthSquared = dx * dx + dy * dy;

      if (lineLengthSquared === 0) {
        // Ray start and end are the same point
        return distStart <= radius;
      }

      const t = Math.max(
        0,
        Math.min(
          1,
          ((centerX - rayStart.x) * dx + (centerY - rayStart.y) * dy) / lineLengthSquared,
        ),
      );
      const closestX = rayStart.x + t * dx;
      const closestY = rayStart.y + t * dy;

      const distToCenter = Math.sqrt((closestX - centerX) ** 2 + (closestY - centerY) ** 2);

      return distToCenter <= radius;
    } catch (error) {
      console.error('PF2E Visioner | Error checking ray-circle intersection:', {
        error: error.message,
        centerX,
        centerY,
        radius,
        ray: { A: ray.A, B: ray.B },
      });
      return false;
    }
  }

  /**
   * Check if a ray intersects with a FoundryVTT shape (polygon)
   * @param {foundry.canvas.geometry.Ray} ray - The ray to check
   * @param {PIXI.Polygon} shape - The shape to check against
   * @returns {boolean} - Whether the ray intersects the shape
   */
  #rayIntersectsShape(ray, shape) {
    try {
      // Convert ray to line segment points
      const rayStart = ray.A;
      const rayEnd = ray.B;

      // Check if either endpoint is inside the shape
      if (shape.contains(rayStart.x, rayStart.y) || shape.contains(rayEnd.x, rayEnd.y)) {
        return true;
      }

      // Check if ray intersects any edge of the polygon
      const points = shape.points;
      for (let i = 0; i < points.length; i += 2) {
        const j = (i + 2) % points.length;

        const edge = {
          x1: points[i],
          y1: points[i + 1],
          x2: points[j],
          y2: points[j + 1],
        };

        if (this.#lineSegmentsIntersect(rayStart, rayEnd, edge)) {
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error('PF2E Visioner | Error checking ray-shape intersection:', {
        error: error.message,
        hasShape: !!shape,
        hasPoints: !!shape?.points,
        ray: { A: ray.A, B: ray.B },
      });
      return false;
    }
  }

  /**
   * Check if the line between two tokens passes through darkness
   * This is used to detect when tokens are on opposite sides of a darkness effect
   * @param {Token} observer - The observing token
   * @param {Token} target - The target token
   * @returns {boolean} True if the line passes through darkness
   */
  #doesLinePassThroughDarkness(
    observer,
    target,
    observerPosOverride = null,
    targetPosOverride = null,
  ) {
    try {
      const observerPos = observerPosOverride || this._getTokenPosition(observer);
      const targetPos = targetPosOverride || this._getTokenPosition(target);

      // Precise darkness detection using shape-based intersection

      // Cast a ray between the tokens to check for darkness effects
      const ray = new foundry.canvas.geometry.Ray(observerPos, targetPos);

      // Get all darkness sources that the ray passes through
      let lightSources = [];
      try {
        // First check canvas.effects.darknessSources (used by LightingCalculator)
        const darknessSources = canvas.effects?.darknessSources || [];
        // Also check canvas.lighting for additional darkness sources
        const lightObjects =
          canvas.lighting?.objects?.children || canvas.lighting?.placeables || [];

        // Combine both sources
        const allSources = [...darknessSources, ...lightObjects];

        lightSources = allSources.filter((light) => {
          // Check for darkness sources - either isDarknessSource property or negative config
          const isDarkness = light.isDarknessSource || light.document?.config?.negative || false;

          // Treat undefined active as true (some darkness sources may not have explicit active property)
          const isActive = light.active !== false;
          const isVisible = light.visible !== false;

          if (!isDarkness || !isActive || !isVisible) {
            return false;
          }

          // Check if the ray intersects with the light source's area
          // For circular darkness sources, use precise circle-line intersection
          let intersects = false;
          try {
            // Get the radius for circular intersection test
            // For darkness sources, use total effective area (bright + dim) to match visual rendering
            // PointDarknessSource has calculated values in data property
            const brightValue = light.data?.bright || light.config?.bright || light.bright || 0;
            const dimValue = light.data?.dim || light.config?.dim || light.dim || 0;
            const totalRadius = brightValue + dimValue;

            // For darkness sources with visual coverage but no bright/dim values,
            // Use the actual configured radius without artificial expansion
            let radius = totalRadius > 0 ? totalRadius : light.radius || 0;

            const centerX = light.x;
            const centerY = light.y;

            if (radius > 0) {
              // Use precise circle-line intersection for circular darkness sources
              intersects = this.#rayIntersectsCircle(ray, centerX, centerY, radius);
            } else {
              // Fallback to shape-based intersection for non-circular sources
              if (light.shape) {
                intersects = this.#rayIntersectsShape(ray, light.shape);
              } else {
                // Final fallback to bounds check
                const lightBounds = light.bounds;
                if (!lightBounds) {
                  return false;
                }

                // Try different intersection methods
                if (typeof ray.intersectRectangle === 'function') {
                  intersects = ray.intersectRectangle(lightBounds);
                } else if (typeof ray.intersects === 'function') {
                  intersects = ray.intersects(lightBounds);
                } else {
                  // Manual rectangle intersection check
                  const rayStart = ray.A;
                  const rayEnd = ray.B;

                  // Check if ray intersects rectangle bounds
                  const left = lightBounds.x;
                  const right = lightBounds.x + lightBounds.width;
                  const top = lightBounds.y;
                  const bottom = lightBounds.y + lightBounds.height;

                  // Use line-rectangle intersection algorithm
                  intersects = this.#lineIntersectsRectangle(
                    rayStart,
                    rayEnd,
                    left,
                    top,
                    right,
                    bottom,
                  );
                }
              }
            }
          } catch (error) {
            console.error('PF2E Visioner | Ray intersection failed:', {
              id: light.id,
              error: error.message,
              errorType: error.constructor.name,
              hasRadius: !!(light.radius || light.data?.bright || light.data?.dim),
              ray: { A: ray.A, B: ray.B },
            });
            return false;
          }

          return intersects;
        });
      } catch (error) {
        console.error('PF2E Visioner | Error filtering light sources:', error);
      }

      // Check for darkness effects along the ray
      let passesThroughDarkness = false;
      let darknessEffects = [];

      // Check each darkness source the ray passes through
      for (const lightSource of lightSources) {
        // Find the ambient light document to get the proper rank flag
        let ambientDoc = null;
        let darknessRank = 0;

        // Try to get document directly
        if (lightSource.document) {
          ambientDoc = lightSource.document;
        }
        // Try to find by sourceId
        else if (lightSource.sourceId) {
          try {
            // sourceId format is usually "DocumentType.documentId"
            const [docType, docId] = lightSource.sourceId.split('.');
            if (docType === 'AmbientLight' && docId) {
              ambientDoc = canvas.scene.lights.get(docId);
            }
          } catch (error) {
            // Silently continue if we can't parse the sourceId
          }
        }
        // Try to find by ID
        else if (lightSource.id) {
          ambientDoc = canvas.scene.lights.get(lightSource.id);
        }

        // Get darkness rank from the ambient light document flag
        if (ambientDoc?.getFlag) {
          darknessRank = Number(ambientDoc.getFlag(MODULE_ID, 'darknessRank') || 0) || 0;
        }

        // Fallback to other methods if no flag found
        if (darknessRank === 0 && lightSource.data?.darknessRank) {
          darknessRank = Number(lightSource.data.darknessRank) || 0;
        }

        if (darknessRank === 0 && ambientDoc?.config) {
          const config = ambientDoc.config;
          darknessRank = Number(config.darknessRank || config.spellLevel || 0) || 0;
        }

        // Default to rank 4 for darkness sources if no specific rank is found
        // This matches the expectation that darkness spells are typically rank 4
        if (darknessRank === 0) darknessRank = 4;

        darknessEffects.push({
          light: lightSource,
          darkness: lightSource.data?.darkness || 1,
          darknessRank: darknessRank,
        });
        passesThroughDarkness = true;
      }

      // Return both whether it passes through darkness and the maximum darkness rank
      const maxDarknessRank =
        darknessEffects.length > 0
          ? Math.max(...darknessEffects.map((effect) => effect.darknessRank))
          : 0;

      return {
        passesThroughDarkness,
        maxDarknessRank,
      };
    } catch (error) {
      console.error('PF2E Visioner | Error checking darkness line of sight:', {
        observer: observer.name,
        target: target.name,
        error: error.message,
        stack: error.stack,
      });
      return { passesThroughDarkness: false, maxDarknessRank: 0 };
    }
  }

  /**
   * Check if observer is blinded and handle non-visual senses
   * @param {Token} observer - The observing token
   * @param {Token} target - The target token
   * @returns {string|null} Visibility result if blinded, null if not blinded
   * @private
   */
  #checkBlindnessCondition(observer, target) {
    const isBlinded = this.#conditionManager.isBlinded(observer);
    if (isBlinded) {
      // If blinded, but has precise non-visual sense in range, can still observe
      try {
        if (this.#visionAnalyzer.hasPreciseNonVisualInRange(observer, target))
          return { state: 'observed', reason: 'blinded_but_precise_sense' };
        // If any imprecise sense can detect, target is at least hidden rather than undetected
        if (this.#visionAnalyzer.canSenseImprecisely(observer, target))
          return { state: 'hidden', reason: 'blinded_but_imprecise_sense' };
      } catch {}
      return { state: 'hidden', reason: 'blinded_no_senses' };
    }
    return null;
  }

  /**
   * Check invisible condition using the calculated base visibility state
   * This is the correct approach: determine what observer would normally see,
   * then apply invisible condition transitions based on that base state
   * @param {Token} observer
   * @param {Token} target
   * @param {string} baseState - The visibility state without invisible condition
   * @param {Object} targetPositionOverride
   * @param {Object} options
   * @returns {Object|null} Invisibility result or null if not invisible
   * @private
   */
  async #checkInvisibilityConditionWithBaseState(
    observer,
    target,
    baseState,
    targetPositionOverride,
    options,
  ) {
    const isInvisible = this.#conditionManager.isInvisibleTo(observer, target);

    if (isInvisible) {
      // CRITICAL: Check for non-visual senses first - they completely bypass invisible condition
      // Both precise AND imprecise non-visual senses are unaffected by invisibility
      try {
        // If observer has precise non-visual sense (e.g., tremorsense, echolocation) in range → observed
        if (this.#visionAnalyzer.hasPreciseNonVisualInRange(observer, target)) {
          return { state: 'observed', reason: 'invisible_bypassed_precise_nonvisual_sense' };
        }

        // Check for specific imprecise non-visual senses that bypass invisibility
        // Tremorsense, scent, lifesense, etc. are unaffected by invisibility
        const capabilities = this.#visionAnalyzer.getVisionCapabilities(observer);
        const dist = this.#visionAnalyzer.distanceFeet(observer, target);

        // Check tremorsense using VisionAnalyzer's direct method
        const canDetectViaTremor = this.#visionAnalyzer.canDetectViaTremor(observer, target);

        if (canDetectViaTremor) {
          return { state: 'hidden', reason: 'invisible_bypassed_tremorsense' };
        }

        // Check scent
        if (
          capabilities.scent &&
          (capabilities.scent.range === Infinity || capabilities.scent.range >= dist)
        ) {
          return { state: 'hidden', reason: 'invisible_bypassed_scent' };
        }

        // Check lifesense
        if (
          capabilities.lifesense &&
          (capabilities.lifesense.range === Infinity || capabilities.lifesense.range >= dist) &&
          this.#visionAnalyzer.canDetectWithLifesense(target)
        ) {
          return { state: 'hidden', reason: 'invisible_bypassed_lifesense' };
        }
      } catch (error) {
        console.warn('Error checking non-visual senses:', error);
      }

      // CRITICAL: Check if there's already an established invisible state for this observer-target pair
      // This prevents lighting changes from affecting already-established invisible states
      // Note: Established states are cleared when invisible condition is applied or creature moves
      const observerId = observer?.document?.id;
      const targetId = target?.document?.id;

      if (observerId && targetId) {
        const invisibilityFlags = target.document.flags?.['pf2e-visioner']?.invisibility || {};
        const observerFlags = invisibilityFlags[observerId] || {};
        const establishedState = observerFlags.establishedState;

        if (establishedState) {
          return { state: establishedState, reason: `invisible_established_${establishedState}` };
        }
      }

      // No established state exists - calculate it based on current base state and establish it
      let invisibleState;
      switch (baseState) {
        case 'observed':
        case 'concealed':
          invisibleState = 'hidden';
          break;
        case 'hidden':
          invisibleState = 'undetected';
          break;
        case 'undetected':
        default:
          invisibleState = 'undetected';
          break;
      }

      // Establish this state for future calculations (until creature takes action)
      if (observerId && targetId) {
        try {
          const currentFlags = target.document.flags?.['pf2e-visioner']?.invisibility || {};
          const updatedFlags = {
            ...currentFlags,
            [observerId]: {
              ...currentFlags[observerId],
              establishedState: invisibleState,
              establishedAt: Date.now(),
            },
          };
          await target.document.setFlag('pf2e-visioner', 'invisibility', updatedFlags);
        } catch (error) {
          console.warn('Failed to establish invisible state:', error);
        }
      }

      // Note: Non-visual senses (both precise and imprecise) are checked first and bypass invisible condition entirely
      // Only visual-based observers with imprecise senses (like hearing) follow invisible condition rules
      // Non-visual imprecise senses are handled above and bypass invisibility completely

      // Check for sneak override that might upgrade to undetected
      try {
        const hasSneakOverride = async (obs, tgt) => {
          try {
            const targetFlags = tgt?.document?.flags?.['pf2e-visioner'] || {};
            const sneakOverrideKey = `sneak-override-from-${obs?.document?.id}`;
            return !!targetFlags[sneakOverrideKey]?.success;
          } catch {
            return false;
          }
        };

        if (await hasSneakOverride(observer, target)) {
          invisibleState = 'undetected';
        }
      } catch {}

      return { state: invisibleState, reason: `invisible_from_${baseState}` };
    }

    return null;
  }

  /**
   * Check if observer is dazzled and handle non-visual senses
   * @param {Token} observer - The observing token
   * @param {Token} target - The target token
   * @returns {string|null} Visibility result if dazzled, null if not dazzled
   * @private
   */
  #checkDazzledCondition(observer, target) {
    const isDazzled = this.#conditionManager.isDazzled(observer);
    if (isDazzled) {
      // If you have a precise non-visual sense in range, dazzled doesn't matter for that target
      try {
        if (this.#visionAnalyzer.hasPreciseNonVisualInRange(observer, target))
          return { state: 'observed', reason: 'dazzled_but_precise_sense' };
      } catch {}
      // Otherwise, everything is concealed
      return { state: 'concealed', reason: 'dazzled_condition' };
    }
    return null;
  }

  /**
   * Get observer vision capabilities with caching support
   * @param {Token} observer - The observing token
   * @param {Object} options - Calculation options
   * @returns {Object} Vision capabilities
   * @private
   */
  #getObserverVisionCapabilities(observer, options) {
    let observerVision = null;
    try {
      const capsMap = options?.sensesCache;
      const oid = observer?.document?.id;
      if (capsMap && oid && (capsMap.get?.(oid) || capsMap[oid])) {
        observerVision = capsMap.get ? capsMap.get(oid) : capsMap[oid];
      }
    } catch {
      /* ignore */
    }
    if (!observerVision) {
      observerVision = this.#visionAnalyzer.getVisionCapabilities(observer);
    }
    return observerVision;
  }

  /**
   * Get light level at target position with caching support
   * @param {Token} target - The target token
   * @param {Object} targetPositionOverride - Optional position override
   * @param {Object} options - Calculation options
   * @returns {Object} Light level information
   * @private
   */
  #getTargetLightLevel(target, targetPositionOverride, options) {
    const targetPosition = targetPositionOverride || {
      x: target.document.x + (target.document.width * canvas.grid.size) / 2,
      y: target.document.y + (target.document.height * canvas.grid.size) / 2,
      elevation: target.document.elevation || 0,
    };

    const opts = options && typeof options === 'object' ? options : {};
    const pre = opts.precomputedLights || null;
    const targetId = target?.document?.id;

    if (pre && targetId && pre[targetId]) {
      return pre[targetId];
    } else if (pre && targetId && typeof pre.get === 'function' && pre.has(targetId)) {
      return pre.get(targetId);
    } else {
      return this.#lightingCalculator.getLightLevelAt(targetPosition, target);
    }
  }

  /**
   * Handle line of sight checking with cross-boundary darkness rules
   * @param {Token} observer - The observing token
   * @param {Token} target - The target token
   * @returns {string|null} Visibility result if blocked/affected, null if clear
   * @private
   */
  #handleLineOfSightCheck(observer, target) {
    try {
      const losClear = !!this.#visionAnalyzer.hasLineOfSight(observer, target, true);

      if (!losClear) {
        // Check for cross-boundary darkness even when LoS is blocked
        const observerPos = { x: observer.x, y: observer.y };
        const targetPos = { x: target.x, y: target.y };
        const observerLight = this.#lightingCalculator.getLightLevelAt(observerPos, observer);
        const targetLight = this.#lightingCalculator.getLightLevelAt(targetPos, target);

        const observerInDarkness = (observerLight?.darknessRank ?? 0) >= 4;
        const targetInDarkness = (targetLight?.darknessRank ?? 0) >= 4;

        const hasDarknessSources = canvas.lighting.sources.some(
          (source) =>
            source.object &&
            source.object.document &&
            source.object.document.flags &&
            source.object.document.flags.pf2e &&
            source.object.document.flags.pf2e.darknessRank >= 4,
        );

        if (hasDarknessSources && (observerInDarkness || targetInDarkness)) {
          // Check ray intersection for cross-boundary darkness
          const rasterResult = this.#lightingRasterService?.linePassesThroughDarkness(
            observerPos.x,
            observerPos.y,
            targetPos.x,
            targetPos.y,
          ) || { passesThroughDarkness: false, maxDarknessRank: 0 };
          let passesThroughDarkness = rasterResult.passesThroughDarkness;
          let maxDarknessRank = rasterResult.maxDarknessRank;

          // Double-check with precise detector if no darkness found
          if (!passesThroughDarkness) {
            const preciseResult = this.linePassesThroughDarkness(observerPos, targetPos);
            passesThroughDarkness = preciseResult.passesThroughDarkness;
            maxDarknessRank = preciseResult.maxDarknessRank;
          }

          // Apply darkvision concealment rules for rank 4+ darkness
          if (passesThroughDarkness && maxDarknessRank >= 4) {
            const hasGreaterDarkvision = this.#visionAnalyzer.hasGreaterDarkvision(observer);
            const hasDarkvision = this.#visionAnalyzer.hasDarkvision(observer);

            if (hasGreaterDarkvision) {
              // Greater darkvision sees normally through rank 4+ darkness
            } else if (hasDarkvision) {
              // Regular darkvision sees concealed through rank 4+ darkness
              return { state: 'concealed', reason: 'darkvision_through_darkness' };
            }
          }
        }

        // No cross-boundary darkness concealment applies, check special senses with elevation rules
        return this.#checkSpecialSensesWhenBlocked(observer, target);
      }
    } catch {
      /* best effort: continue */
    }
    return null; // Line of sight is clear, continue with normal processing
  }

  /**
   * Check special senses when line of sight is blocked
   * This method handles cases where normal LOS fails but special senses might work
   * @param {Token} observer - The observing token
   * @param {Token} target - The target token
   * @returns {string|null} Visibility state if special senses apply, null otherwise
   * @private
   */
  #checkSpecialSensesWhenBlocked(observer, target) {
    try {
      const hasPreciseNonVisual = this.#visionAnalyzer.hasPreciseNonVisualInRange(observer, target);
      const canSenseImprecisely = this.#visionAnalyzer.canSenseImprecisely(observer, target);

      // For precise non-visual senses, return immediately
      if (hasPreciseNonVisual) return { state: 'observed', reason: 'precise_sense_blocked_los' };

      // For imprecise senses, we need to check elevation rules first
      if (canSenseImprecisely) {
        // Check if elevation would block the imprecise sense
        const elevationResult = this.#checkElevationRules(observer, target);
        if (elevationResult) {
          return elevationResult; // This would be {state: 'undetected', reason: ...} for tremorsense vs elevated targets
        }

        return { state: 'hidden', reason: 'imprecise_sense_blocked_los' };
      }

      return { state: 'undetected', reason: 'blocked_los_no_senses' };
    } catch (error) {
      return { state: 'hidden', reason: 'error_fallback' };
    }
  }

  /**
   * Check if target is elevated and observer lacks appropriate senses
   * @param {Token} observer - The observing token
   * @param {Token} target - The target token
   * @returns {string|null} 'undetected' if elevation blocks vision, null otherwise
   * @private
   */
  #checkElevationRules(observer, target) {
    const observerElevation = observer.document?.elevation || 0;
    const targetElevation = target.document?.elevation || 0;

    if (targetElevation > 0 && targetElevation !== observerElevation) {
      // Check if observer has tremorsense (feelTremor detection mode)
      const observerVision = this.#visionAnalyzer.getVisionCapabilities(observer);

      // Check for tremorsense in vision capabilities (single source of truth)
      const hasTremorsenseFromVision =
        observerVision.detectionModes?.feelTremor?.enabled &&
        observerVision.detectionModes?.feelTremor?.range > 0;

      // Fallback check in sensing summary for compatibility
      const hasTremorsenseFromSenses = [
        ...(observerVision.imprecise || []),
        ...(observerVision.precise || []),
      ].some((sense) => sense.type === 'tremorsense');

      const hasTremorsense = hasTremorsenseFromVision || hasTremorsenseFromSenses;

      if (hasTremorsense) {
        // Debug logging

        const hasViableSensesForElevation =
          observerVision.hasDarkvision ||
          observerVision.hasLowLightVision ||
          observerVision.hasVision ||
          observerVision.echolocationActive ||
          observerVision.scent;

        if (!hasViableSensesForElevation) {
          return { state: 'undetected', reason: 'tremorsense_elevated_target' };
        }
      }

      // Check if observer has senses that can detect elevated targets
      const canDetectElevated = this.#visionAnalyzer.canDetectElevatedTarget(observer, target);

      if (!canDetectElevated) {
        return { state: 'undetected', reason: 'elevated_target_no_detection' };
      }
    }
    return null;
  }

  /**
   * Handle cross-boundary darkness scenarios and darkness ray intersections
   * @param {Token} observer
   * @param {Token} target
   * @param {Object} observerVision
   * @param {Object} lightLevel
   * @param {Object|null} _observerPositionOverride
   * @param {Object} targetPosition
   * @param {Object} pre - Pre-computed lighting cache
   * @param {Object} stats - Statistics tracking object
   * @param {Object} options - Processing options
   * @returns {Promise<string|null>} Visibility state if darkness rules apply, null otherwise
   * @private
   */
  async #handleCrossBoundaryDarkness(
    observer,
    target,
    observerVision,
    lightLevel,
    _observerPositionOverride,
    targetPosition,
    pre,
    stats,
    options,
  ) {
    // Get observer position and light level
    const observerPosition = _observerPositionOverride || {
      x: observer.document.x + (observer.document.width * canvas.grid.size) / 2,
      y: observer.document.y + (observer.document.height * canvas.grid.size) / 2,
      elevation: observer.document.elevation || 0,
    };

    const observerLightLevel = this.#getObserverLightLevel(observer, observerPosition, pre, stats);

    const observerInDarkness = (observerLightLevel?.darknessRank ?? 0) >= 1;
    const targetInDarkness = (lightLevel?.darknessRank ?? 0) >= 1;

    // Check for darkness ray intersection
    const { linePassesThroughDarkness, rayDarknessRank } = await this.#checkDarknessRayIntersection(
      observer,
      target,
      observerPosition,
      targetPosition,
    );

    // Check for cross-boundary darkness scenarios
    const isCrossBoundary = observerInDarkness !== targetInDarkness || linePassesThroughDarkness;

    if (isCrossBoundary) {
      return this.#applyCrossBoundaryDarknessRules(
        observerVision,
        observerInDarkness,
        targetInDarkness,
        linePassesThroughDarkness,
        rayDarknessRank,
        observerLightLevel,
        lightLevel,
      );
    } else {
      return this.#applySameBoundaryDarknessRules(
        observerVision,
        observerInDarkness,
        targetInDarkness,
        linePassesThroughDarkness,
        rayDarknessRank,
        observerLightLevel,
        lightLevel,
      );
    }
  }

  /**
   * Get observer light level from cache or calculate
   * @param {Token} observer
   * @param {Object} observerPosition
   * @param {Object} pre - Pre-computed lighting cache
   * @param {Object} stats - Statistics tracking object
   * @returns {Object} Observer light level
   * @private
   */
  #getObserverLightLevel(observer, observerPosition, pre, stats) {
    const observerId = observer?.document?.id;
    let observerLightLevel;

    if (pre && observerId && pre[observerId]) {
      observerLightLevel = pre[observerId];
      try {
        if (stats) stats.observerUsed = (stats.observerUsed || 0) + 1;
      } catch {}
    } else if (pre && observerId && typeof pre.get === 'function' && pre.has(observerId)) {
      observerLightLevel = pre.get(observerId);
      try {
        if (stats) stats.observerUsed = (stats.observerUsed || 0) + 1;
      } catch {}
    } else {
      observerLightLevel = this.#lightingCalculator.getLightLevelAt(observerPosition, observer);
      try {
        if (stats) stats.observerMiss = (stats.observerMiss || 0) + 1;
      } catch {}
    }

    return observerLightLevel;
  }

  /**
   * Check if line passes through darkness and get the maximum darkness rank
   * @param {Token} observer
   * @param {Token} target
   * @param {Object} observerPosition
   * @param {Object} targetPosition
   * @returns {Promise<Object>} Object with linePassesThroughDarkness and rayDarknessRank
   * @private
   */
  async #checkDarknessRayIntersection(observer, target, observerPosition, targetPosition) {
    let linePassesThroughDarkness = false;
    let rayDarknessRank = 0;

    // Prefer raster service for fast approximation
    let darknessResult = null;
    try {
      if (
        this.#lightingRasterService &&
        typeof this.#lightingRasterService.getRayDarknessInfo === 'function'
      ) {
        darknessResult = await this.#lightingRasterService.getRayDarknessInfo(
          observer,
          target,
          observerPosition,
          targetPosition,
        );
      }
    } catch (error) {
      // Raster service failed, will use fallback
    }

    if (!darknessResult) {
      // Fallback to precise shape-based detector
      darknessResult = this.#doesLinePassThroughDarkness(
        observer,
        target,
        observerPosition,
        targetPosition,
      ) || { passesThroughDarkness: false, maxDarknessRank: 0 };
    } else if (
      darknessResult &&
      darknessResult.passesThroughDarkness === false &&
      darknessResult.maxDarknessRank === 0
    ) {
      // Double-check with precise detector if raster found no darkness
      const preciseResult = this.#doesLinePassThroughDarkness(
        observer,
        target,
        observerPosition,
        targetPosition,
      ) || { passesThroughDarkness: false, maxDarknessRank: 0 };

      if (preciseResult.passesThroughDarkness || preciseResult.maxDarknessRank > 0) {
        darknessResult = preciseResult;
      }
    }

    linePassesThroughDarkness = !!darknessResult.passesThroughDarkness;
    rayDarknessRank = Number(darknessResult.maxDarknessRank || 0) || 0;

    // If raster service detected darkness but rank is 0, find actual darkness sources
    if (linePassesThroughDarkness && rayDarknessRank === 0) {
      rayDarknessRank = await this.#findIntersectedDarknessRank(observerPosition, targetPosition);
    }

    return { linePassesThroughDarkness, rayDarknessRank };
  }

  /**
   * Find darkness rank from intersected darkness sources
   * @param {Object} observerPosition
   * @param {Object} targetPosition
   * @returns {Promise<number>} Maximum darkness rank found
   * @private
   */
  async #findIntersectedDarknessRank(observerPosition, targetPosition) {
    const ray = new foundry.canvas.geometry.Ray(observerPosition, targetPosition);

    // Get all darkness sources
    const allSources = this.#getAllDarknessSources();
    const intersectedSources = this.#filterIntersectedDarknessSources(ray, allSources);

    let maxFoundRank = this.#getDarknessRankFromSources(intersectedSources);

    if (maxFoundRank === 0) {
      // Fallback: check all sources for any darkness rank
      const fallbackRank = this.#getFallbackDarknessRank(allSources);
      maxFoundRank = fallbackRank > 0 ? fallbackRank : 3; // Default to rank 3
    }

    return maxFoundRank;
  }

  /**
   * Get all available darkness sources from canvas
   * @returns {Array} Array of darkness sources
   * @private
   */
  #getAllDarknessSources() {
    let allSources = [];
    try {
      const darknessSources = canvas.effects?.darknessSources || [];
      const lightObjects = canvas.lighting?.objects?.children || canvas.lighting?.placeables || [];
      allSources = [...darknessSources, ...lightObjects];
    } catch (error) {
      console.error('DEBUG Error getting light sources:', error);
    }
    return allSources;
  }

  /**
   * Filter darkness sources that intersect with the ray
   * @param {Ray} ray
   * @param {Array} allSources
   * @returns {Array} Filtered intersected sources
   * @private
   */
  #filterIntersectedDarknessSources(ray, allSources) {
    return allSources.filter((light) => {
      const isDarkness = light.isDarknessSource || light.document?.config?.negative || false;
      const isActive = light.active !== false;
      const isVisible = light.visible !== false;

      if (!isDarkness || !isActive || !isVisible) {
        return false;
      }

      try {
        const brightValue = light.data?.bright || light.config?.bright || light.bright || 0;
        const dimValue = light.data?.dim || light.config?.dim || light.dim || 0;
        const totalRadius = brightValue + dimValue;
        let radius = totalRadius > 0 ? totalRadius : light.radius || 0;

        const centerX = light.x;
        const centerY = light.y;

        if (radius > 0) {
          return this.#rayIntersectsCircle(ray, centerX, centerY, radius);
        }
      } catch (error) {
        console.error('DEBUG Error checking ray intersection:', error);
      }

      return false;
    });
  }

  /**
   * Get darkness rank from intersected sources
   * @param {Array} intersectedSources
   * @returns {number} Maximum darkness rank found
   * @private
   */
  #getDarknessRankFromSources(intersectedSources) {
    let maxFoundRank = 0;

    for (const lightSource of intersectedSources) {
      let darknessRank = 0;
      const ambientDoc = this.#findAmbientLightDocument(lightSource);

      if (ambientDoc?.getFlag) {
        darknessRank = Number(ambientDoc.getFlag('pf2e-visioner', 'darknessRank') || 0) || 0;
      }

      // Fallback methods
      if (darknessRank === 0 && lightSource.data?.darknessRank) {
        darknessRank = Number(lightSource.data.darknessRank) || 0;
      }

      if (darknessRank === 0 && ambientDoc?.config) {
        const config = ambientDoc.config;
        darknessRank = Number(config.darknessRank || config.spellLevel || 0) || 0;
      }

      // Default to rank 2 if we can't determine (most darkness spells are rank 1-3)
      if (darknessRank === 0) darknessRank = 2;

      maxFoundRank = Math.max(maxFoundRank, darknessRank);
    }

    return maxFoundRank;
  }

  /**
   * Find ambient light document for a light source
   * @param {Object} lightSource
   * @returns {Object|null} Ambient light document
   * @private
   */
  #findAmbientLightDocument(lightSource) {
    if (lightSource.document) {
      return lightSource.document;
    }

    if (lightSource.sourceId) {
      try {
        const [docType, docId] = lightSource.sourceId.split('.');
        if (docType === 'AmbientLight' && docId) {
          return canvas.scene.lights.get(docId);
        }
      } catch (error) {
        console.error('DEBUG Error parsing sourceId:', lightSource.sourceId, error);
      }
    }

    if (lightSource.id) {
      return canvas.scene.lights.get(lightSource.id);
    }

    return null;
  }

  /**
   * Get fallback darkness rank from all available sources
   * @param {Array} allSources
   * @returns {number} Maximum darkness rank found in fallback
   * @private
   */
  #getFallbackDarknessRank(allSources) {
    let fallbackRank = 0;

    for (const lightSource of allSources) {
      const isDarkness =
        lightSource.isDarknessSource || lightSource.document?.config?.negative || false;
      if (!isDarkness) continue;

      const ambientDoc = this.#findAmbientLightDocument(lightSource);
      const sourceRank = this.#extractDarknessRankFromDocument(ambientDoc);

      if (sourceRank > 0) {
        fallbackRank = Math.max(fallbackRank, sourceRank);
      }
    }

    return fallbackRank;
  }

  /**
   * Extract darkness rank from ambient document using multiple methods
   * @param {Object|null} ambientDoc
   * @returns {number} Extracted darkness rank
   * @private
   */
  #extractDarknessRankFromDocument(ambientDoc) {
    if (!ambientDoc?.getFlag) return 0;

    // Try multiple flag locations
    const flagValue = ambientDoc.getFlag('pf2e-visioner', 'darknessRank');
    const pf2eFlags = ambientDoc.getFlag('pf2e');

    let sourceRank = 0;
    if (flagValue === '') {
      sourceRank = 3; // Empty string = rank 3 darkness
    } else if (flagValue && !isNaN(Number(flagValue))) {
      sourceRank = Number(flagValue);
    }

    // Check PF2e spell data
    if (sourceRank === 0 && pf2eFlags) {
      if (pf2eFlags.spellLevel || pf2eFlags.heightenLevel) {
        sourceRank = pf2eFlags.spellLevel || pf2eFlags.heightenLevel || 0;
      }
    }

    // Check intensity
    if (sourceRank === 0 && ambientDoc.config?.intensity !== undefined) {
      if (ambientDoc.config.intensity < 0) {
        sourceRank = Math.abs(ambientDoc.config.intensity);
      }
    }

    // Check system data
    if (sourceRank === 0) {
      const docData = ambientDoc.data || ambientDoc;
      const systemData = docData.system;

      if (systemData?.level) sourceRank = systemData.level;
      if (systemData?.spellLevel) sourceRank = systemData.spellLevel;
      if (systemData?.heightenLevel) sourceRank = systemData.heightenLevel;
      if (systemData?.rank) sourceRank = systemData.rank;
      if (systemData?.darknessRank) sourceRank = systemData.darknessRank;

      // Check document properties directly
      if (docData.level) sourceRank = docData.level;
      if (docData.spellLevel) sourceRank = docData.spellLevel;
      if (docData.heightenLevel) sourceRank = docData.heightenLevel;
      if (docData.rank) sourceRank = docData.rank;
    }

    return sourceRank;
  }

  /**
   * Apply cross-boundary darkness rules
   * @param {Object} observerVision
   * @param {boolean} observerInDarkness
   * @param {boolean} targetInDarkness
   * @param {boolean} linePassesThroughDarkness
   * @param {number} rayDarknessRank
   * @param {Object} observerLightLevel
   * @param {Object} lightLevel
   * @returns {string|null} Visibility result or null to continue processing
   * @private
   */
  #applyCrossBoundaryDarknessRules(
    observerVision,
    observerInDarkness,
    targetInDarkness,
    linePassesThroughDarkness,
    rayDarknessRank,
    observerLightLevel,
    lightLevel,
  ) {
    if (observerInDarkness && !targetInDarkness) {
      // Observer inside darkness, target outside
      if (observerVision.hasVision) {
        if (observerVision.hasGreaterDarkvision) {
          return { state: 'observed', reason: 'greater_darkvision_through_darkness' };
        } else if (observerVision.hasDarkvision) {
          const effectiveDarknessRank = Math.max(
            rayDarknessRank,
            observerLightLevel?.darknessRank ?? 0,
          );
          const result =
            effectiveDarknessRank >= 4
              ? { state: 'concealed', reason: 'darkvision_cross_boundary_rank_4+' }
              : { state: 'observed', reason: 'darkvision_cross_boundary' };
          return result;
        } else {
          return { state: 'hidden', reason: 'no_darkvision_in_darkness' };
        }
      }
    } else if (!observerInDarkness && targetInDarkness) {
      // Observer outside darkness, target inside
      if (observerVision.hasVision) {
        if (observerVision.hasGreaterDarkvision) {
          return { state: 'observed', reason: 'greater_darkvision_through_darkness' };
        } else if (observerVision.hasDarkvision) {
          const effectiveDarknessRank = Math.max(rayDarknessRank, lightLevel?.darknessRank ?? 0);
          const result =
            effectiveDarknessRank >= 4
              ? { state: 'concealed', reason: 'darkvision_cross_boundary_rank_4+' }
              : { state: 'observed', reason: 'darkvision_cross_boundary' };
          return result;
        } else {
          return { state: 'hidden', reason: 'no_darkvision_in_darkness' };
        }
      }
    } else if (linePassesThroughDarkness) {
      // Line passes through darkness but both tokens are in same lighting state
      if (observerVision.hasVision) {
        if (observerVision.hasGreaterDarkvision) {
          return { state: 'observed', reason: 'greater_darkvision_through_darkness' };
        } else if (observerVision.hasDarkvision) {
          const result =
            rayDarknessRank >= 4
              ? { state: 'concealed', reason: 'darkness_rank_4+' }
              : { state: 'observed', reason: 'darkvision_through_darkness' };
          return result;
        } else {
          return { state: 'hidden', reason: 'no_darkvision_in_darkness' };
        }
      }
    }

    return null;
  }

  /**
   * Apply same-boundary darkness rules
   * @param {Object} observerVision
   * @param {boolean} observerInDarkness
   * @param {boolean} targetInDarkness
   * @param {boolean} linePassesThroughDarkness
   * @param {number} rayDarknessRank
   * @param {Object} observerLightLevel
   * @param {Object} lightLevel
   * @returns {string|null} Visibility result or null to continue processing
   * @private
   */
  #applySameBoundaryDarknessRules(
    observerVision,
    observerInDarkness,
    targetInDarkness,
    linePassesThroughDarkness,
    rayDarknessRank,
    observerLightLevel,
    lightLevel,
  ) {
    // Both tokens outside darkness but line passes through darkness
    if (!observerInDarkness && !targetInDarkness && linePassesThroughDarkness) {
      if (observerVision.hasVision) {
        if (observerVision.hasGreaterDarkvision) {
          return { state: 'observed', reason: 'greater_darkvision_through_darkness' };
        } else if (observerVision.hasDarkvision) {
          return rayDarknessRank >= 4
            ? { state: 'concealed', reason: 'darkness_rank_4+_darkvision' }
            : { state: 'observed', reason: 'darkvision_through_darkness' };
        } else {
          return { state: 'hidden', reason: 'no_darkvision_in_darkness' };
        }
      }
    }

    // Both tokens inside darkness
    if (observerInDarkness && targetInDarkness) {
      if (observerVision.hasVision) {
        const effectiveDarknessRank = Math.max(
          rayDarknessRank,
          lightLevel?.darknessRank ?? 0,
          observerLightLevel?.darknessRank ?? 0,
        );

        if (observerVision.hasGreaterDarkvision) {
          // Greater darkvision always sees observed regardless of darkness rank
          return { state: 'observed', reason: 'greater_darkvision_through_darkness' };
        } else if (observerVision.hasDarkvision) {
          // Regular darkvision sees concealed in rank 4+ darkness, observed otherwise
          return effectiveDarknessRank >= 4
            ? { state: 'concealed', reason: 'darkness_rank_4+' }
            : { state: 'observed', reason: 'darkvision_through_darkness' };
        } else {
          return { state: 'hidden', reason: 'no_darkvision_in_darkness' };
        }
      } else {
        return { state: 'hidden', reason: 'no_darkvision_in_darkness' };
      }
    }

    // If both tokens are outside darkness, use normal lighting calculation
    return null;
  }
}

// Export singleton instance
export const visibilityCalculator = VisibilityCalculator.getInstance();

// Also export with the legacy name for backward compatibility
export const optimizedVisibilityCalculator = visibilityCalculator;
