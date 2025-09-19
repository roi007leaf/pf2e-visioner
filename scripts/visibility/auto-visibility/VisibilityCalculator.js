/**
 * VisibilityCalculator - Zero-delay visibility calculation
 * Bypasses all throttling and circuit breaking for immediate processing
 */

import { getLogger } from '../../utils/logger.js';
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
   */
  initialize(lightingCalculator, visionAnalyzer, ConditionManager) {
    this.#lightingCalculator = lightingCalculator;
    this.#visionAnalyzer = visionAnalyzer;
    this.#conditionManager = ConditionManager;
  }

  /**
   * Calculate visibility between observer and target tokens - IMMEDIATE, NO THROTTLING
   * @param {Token} observer
   * @param {Token} target
   * @returns {Promise<string>} Visibility state
   */
  async calculateVisibility(observer, target) {
    return this.calculateVisibilityWithPosition(observer, target, null, null, false);
  }

  /**
   * Calculate visibility between observer and target tokens, IGNORING AVS override flags.
   * This is used for override validation to get the "true" AVS-calculated state.
   * @param {Token} observer
   * @param {Token} target
   * @returns {Promise<string>} Visibility state
   */
  async calculateVisibilityWithoutOverrides(observer, target) {
    if (!observer?.actor || !target?.actor) {
      return 'observed';
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
      result = await this.calculateVisibilityWithPosition(observer, target, null, null, true);
    } finally {
      // Restore override if it was present
      if (removedOverride) {
        target.document.flags['pf2e-visioner'][observerFlagKey] = removedOverride;
      }
    }

    return result;
  }

  /**
   * Calculate visibility with position overrides - IMMEDIATE, NO THROTTLING
   * @param {Token} observer
   * @param {Token} target
   * @param {Object} observerPositionOverride - Optional {x, y} position override for observer (reserved for future use)
   * @param {Object} targetPositionOverride - Optional {x, y} position override for target
   * @returns {Promise<string>} Visibility state
   */
  async calculateVisibilityWithPosition(
    observer,
    target,
    _observerPositionOverride = null,
    targetPositionOverride = null,
  ) {
    if (!observer?.actor || !target?.actor) {
      return 'observed';
    }

    try {
      // Touch unused parameter to satisfy linter while preserving API
      void _observerPositionOverride;

      // Step 1: Check if observer is blinded (cannot see anything)
      const isBlinded = this.#conditionManager.isBlinded(observer);
      if (log.enabled()) log.debug(() => ({ step: 'blinded-check', observer: observer.name, result: isBlinded }));
      if (isBlinded) {
        // If blinded, but has precise non-visual sense in range, can still observe
        try {
          if (this.#visionAnalyzer.hasPreciseNonVisualInRange(observer, target)) return 'observed';
          // If any imprecise sense can detect, target is at least hidden rather than undetected
          if (this.#visionAnalyzer.canSenseImprecisely(observer, target)) return 'hidden';
        } catch { }
        return 'hidden';
      }

      // Step 2: Check if target is completely invisible to observer
      const isInvisible = this.#conditionManager.isInvisibleTo(observer, target);
      if (log.enabled()) log.debug(() => ({ step: 'invisible-check', observer: observer.name, target: target.name, result: isInvisible }));
      if (isInvisible) {
        // If observer has precise non-visual sense (e.g., tremorsense, echolocation) in range → observed
        try {
          if (this.#visionAnalyzer.hasPreciseNonVisualInRange(observer, target)) return 'observed';
          // If any imprecise sense can detect (e.g., hearing), invisible is at least hidden
          if (this.#visionAnalyzer.canSenseImprecisely(observer, target)) return 'hidden';
        } catch { }
        // Otherwise invisible = undetected
        return 'undetected';
      }

      // Step 3: Check if observer is dazzled (everything appears concealed)
      const isDazzled = this.#conditionManager.isDazzled(observer);
      if (log.enabled()) log.debug(() => ({ step: 'dazzled-check', observer: observer.name, result: isDazzled }));
      if (isDazzled) {
        // If you have a precise non-visual sense in range, dazzled doesn't matter for that target
        try {
          if (this.#visionAnalyzer.hasPreciseNonVisualInRange(observer, target)) return 'observed';
        } catch { }
        // Otherwise, everything is concealed
        return 'concealed';
      }

      // Step 4: Check line of sight directly against walls. If LoS is blocked, treat as hidden.
      try {
        const losClear = !!this.#visionAnalyzer.hasLineOfSight(observer, target, true);
        if (log.enabled()) log.debug(() => ({ step: 'los-raw', observer: observer.name, target: target.name, losClear }));
        if (!losClear) {
          // If LoS blocked, but a precise non-visual sense is in range → observed
          try {
            if (this.#visionAnalyzer.hasPreciseNonVisualInRange(observer, target)) return 'observed';
            // If only imprecise sense can detect → hidden; if none → undetected
            if (this.#visionAnalyzer.canSenseImprecisely(observer, target)) return 'hidden';
            return 'undetected';
          } catch { return 'hidden'; }
        }
      } catch { /* best effort: continue */ }

      // Step 5: Check lighting conditions at target's position
      // Use position override if provided, otherwise calculate from document
      const targetPosition = targetPositionOverride || {
        x: target.document.x + (target.document.width * canvas.grid.size) / 2,
        y: target.document.y + (target.document.height * canvas.grid.size) / 2,
        elevation: target.document.elevation || 0,
      };
      const lightLevel = this.#lightingCalculator.getLightLevelAt(targetPosition);
      const observerVision = this.#visionAnalyzer.getVisionCapabilities(observer);
      if (log.enabled()) log.debug(() => ({ step: 'lighting', target: target.name, pos: targetPosition, lightLevel }));
      if (log.enabled()) log.debug(() => ({ step: 'vision-capabilities', observer: observer.name, observerVision }));

      // Step 6: Determine visibility based on light level and observer's vision
      let result = this.#visionAnalyzer.determineVisibilityFromLighting(
        lightLevel,
        observerVision,
      );

      // Clamp per imprecise-only rule: if observer has no precise senses on target (including vision), but can sense imprecisely, treat as hidden
      try {
        const preciseNonVisual = this.#visionAnalyzer.hasPreciseNonVisualInRange(observer, target);
        const canImprecise = this.#visionAnalyzer.canSenseImprecisely(observer, target);
        const hasSight = observerVision?.hasVision !== false; // visual path already considered in determineVisibilityFromLighting
        if (!preciseNonVisual && canImprecise) {
          // If lighting result says observed but only imprecise senses apply (e.g., darkness without darkvision), degrade to hidden
          if (result === 'observed') {
            // If lighting made it observed due to visual capabilities, keep observed; otherwise, convert to hidden
            // When in darkness without darkvision, determineVisibilityFromLighting returns hidden/concealed; so only degrade in bright/dim cases where vision fails for other reasons
            result = 'hidden';
          }
          if (result === 'concealed') result = 'hidden';
          if (result === 'hidden' || result === 'undetected') {
            // Ensure not worse than hidden if we can sense imprecisely
            result = 'hidden';
          }
        } else if (!hasSight && !preciseNonVisual && !canImprecise) {
          // No senses can detect → undetected
          result = 'undetected';
        }
      } catch { }
      if (log.enabled()) log.info(() => ({ step: 'result', observer: observer.name, target: target.name, result }));

      return result;
    } catch (error) {
      try { console.warn('PF2E Visioner | calcVis: error, default observed', error); } catch { }
      return 'observed'; // Default fallback
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
   * Clear caches in all components
   */
  clearCaches() {
    if (this.#lightingCalculator) {
      this.#lightingCalculator.clearLightCache();
    }
    if (this.#visionAnalyzer) {
      this.#visionAnalyzer.clearCache();
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
}

// Export singleton instance
export const visibilityCalculator = VisibilityCalculator.getInstance();

// Also export with the legacy name for backward compatibility
export const optimizedVisibilityCalculator = visibilityCalculator;
