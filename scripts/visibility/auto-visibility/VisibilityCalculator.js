/**
 * VisibilityCalculator - Zero-delay visibility calculation
 * Bypasses all throttling and circuit breaking for immediate processing
 */

import { MODULE_ID } from '../../constants.js';
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

  /** @type {EventDrivenVisibilitySystem} */
  #eventDrivenSystem;

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
   * @param {EventDrivenVisibilitySystem} eventDrivenSystem - Optional event-driven system for optimizations
   */
  initialize(lightingCalculator, visionAnalyzer, ConditionManager, eventDrivenSystem = null) {
    this.#lightingCalculator = lightingCalculator;
    this.#visionAnalyzer = visionAnalyzer;
    this.#conditionManager = ConditionManager;
    this.#eventDrivenSystem = eventDrivenSystem;
  }

  /**
   * Calculate visibility between observer and target tokens - IMMEDIATE, NO THROTTLING
   * @param {Token} observer
   * @param {Token} target
   * @returns {Promise<string>} Visibility state
   */
  async calculateVisibility(observer, target) {
    // Check if we should skip this calculation based on spatial/LOS optimizations
    if (this._shouldSkipCalculation(observer, target)) {
      return 'observed'; // Default fallback
    }

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
      // Step 1: Check if observer is blinded (cannot see anything)
      const isBlinded = this.#conditionManager.isBlinded(observer);
      // if (log.enabled())
      //   log.debug(() => ({ step: 'blinded-check', observer: observer.name, result: isBlinded }));
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
      // if (log.enabled())
      //   log.debug(() => ({
      //     step: 'invisible-check',
      //     observer: observer.name,
      //     target: target.name,
      //     result: isInvisible,
      //   }));
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
      // if (log.enabled())
      //   log.debug(() => ({ step: 'dazzled-check', observer: observer.name, result: isDazzled }));
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
        // if (log.enabled())
        //   log.debug(() => ({
        //     step: 'los-raw',
        //     observer: observer.name,
        //     target: target.name,
        //     losClear,
        //   }));
        if (!losClear) {
          // If LoS blocked, but a precise non-visual sense is in range → observed
          try {
            if (this.#visionAnalyzer.hasPreciseNonVisualInRange(observer, target))
              return 'observed';
            // If only imprecise sense can detect → hidden; if none → undetected
            if (this.#visionAnalyzer.canSenseImprecisely(observer, target)) return 'hidden';
            return 'undetected';
          } catch {
            return 'hidden';
          }
        }
      } catch {
        /* best effort: continue */
      }

      // Step 5: Check lighting conditions at target's position
      // Use position override if provided, otherwise calculate from document
      const targetPosition = targetPositionOverride || {
        x: target.document.x + (target.document.width * canvas.grid.size) / 2,
        y: target.document.y + (target.document.height * canvas.grid.size) / 2,
        elevation: target.document.elevation || 0,
      };

      // New API prefers passing a token; supports position objects for overrides
      const lightLevel = this.#lightingCalculator.getLightLevelAt(targetPosition, target);
      const observerVision = this.#visionAnalyzer.getVisionCapabilities(observer);
      // if (log.enabled())
      //   log.debug(() => ({
      //     step: 'lighting',
      //     target: target.name,
      //     pos: targetPosition,
      //     lightLevel,
      //   }));
      // if (log.enabled())
      //   log.debug(() => ({ step: 'vision-capabilities', observer: observer.name, observerVision }));

      // Step 5.5: Check for rank 4 darkness cross-boundary concealment
      // When one token is inside rank 4 darkness and the other is outside, darkvision sees concealed
      const observerPosition = _observerPositionOverride || {
        x: observer.document.x + (observer.document.width * canvas.grid.size) / 2,
        y: observer.document.y + (observer.document.height * canvas.grid.size) / 2,
        elevation: observer.document.elevation || 0,
      };
      const observerLightLevel = this.#lightingCalculator.getLightLevelAt(
        observerPosition,
        observer,
      );

      // Debug logging
      // if (log.enabled())
      //   log.debug(() => ({
      //     step: 'cross-boundary-debug',
      //     observer: observer.name,
      //     target: target.name,
      //     observerPos: observerPosition,
      //     targetPos: targetPosition,
      //     observerLight: observerLightLevel,
      //     targetLight: lightLevel,
      //   })); // Check if we have a cross-boundary rank 4 darkness situation

      const observerInDarkness = (observerLightLevel?.darknessRank ?? 0) >= 1;
      const targetInDarkness = (lightLevel?.darknessRank ?? 0) >= 1;

      // Always check if line passes through darkness
      // This handles the case where tokens are on opposite sides of a darkness effect

      const darknessResult = this.#doesLinePassThroughDarkness(observer, target);
      const linePassesThroughDarkness = darknessResult.passesThroughDarkness;
      const rayDarknessRank = darknessResult.maxDarknessRank;

      // Check for cross-boundary darkness: either different darkness states OR line passes through darkness
      // Note: We need to check linePassesThroughDarkness even when both tokens are in darkness
      const isCrossBoundary = observerInDarkness !== targetInDarkness || linePassesThroughDarkness;

      debugger;
      if (isCrossBoundary) {
        // Cross-boundary: one inside darkness, one outside, OR line passes through darkness

        // Cross-boundary darkness rules
        if (observerInDarkness && !targetInDarkness) {
          // Observer inside darkness, target outside - observer's vision matters
          if (observerVision.hasVision) {
            if (observerVision.hasGreaterDarkvision) {
              // Greater darkvision sees observed across darkness boundaries
              return 'observed';
            } else if (observerVision.hasDarkvision) {
              // Regular darkvision: observed for rank 3 and below, concealed for rank 4+
              // Use the maximum darkness rank from the ray intersection or observer position
              const effectiveDarknessRank = Math.max(
                rayDarknessRank,
                observerLightLevel?.darknessRank ?? 0,
              );
              if (effectiveDarknessRank >= 4) {
                return 'concealed';
              } else {
                return 'observed';
              }
            } else {
              // No darkvision sees hidden when looking out of darkness
              return 'hidden';
            }
          }
        } else if (!observerInDarkness && targetInDarkness) {
          // Observer outside darkness, target inside - observer's vision capabilities matter
          if (observerVision.hasVision) {
            if (observerVision.hasGreaterDarkvision) {
              // Greater darkvision sees observed when looking into darkness
              return 'observed';
            } else if (observerVision.hasDarkvision) {
              // Regular darkvision: observed for rank 3 and below, concealed for rank 4+
              // Use the maximum darkness rank from the ray intersection or target position
              const effectiveDarknessRank = Math.max(
                rayDarknessRank,
                lightLevel?.darknessRank ?? 0,
              );
              if (effectiveDarknessRank >= 4) {
                return 'concealed';
              } else {
                return 'observed';
              }
            } else {
              // No darkvision sees hidden when looking into darkness
              return 'hidden';
            }
          }
        } else if (linePassesThroughDarkness) {
          if (observerVision.hasVision) {
            if (observerVision.hasGreaterDarkvision) {
              // Greater darkvision can see through darkness barriers
              return 'observed';
            } else if (observerVision.hasDarkvision) {
              // Regular darkvision: observed for rank 3 and below, concealed for rank 4+
              if (rayDarknessRank >= 4) {
                return 'concealed';
              } else {
                return 'observed';
              }
            } else {
              // No darkvision sees hidden when line passes through darkness
              return 'hidden';
            }
          }
        }
      } else {
        // Both tokens in same area (both inside or both outside darkness)

        // If both tokens are inside darkness, apply darkness rules
        if (observerInDarkness && targetInDarkness) {
          if (observerVision.hasVision) {
            if (observerVision.hasGreaterDarkvision) {
              // Greater darkvision sees observed within darkness
              return 'observed';
            } else if (observerVision.hasDarkvision) {
              // Regular darkvision: observed for rank 3 and below, concealed for rank 4+
              if (lightLevel?.darknessRank >= 4) {
                return 'concealed';
              } else {
                return 'observed';
              }
            } else {
              // No darkvision sees hidden in darkness
              return 'hidden';
            }
          } else {
            // No vision sees hidden
            return 'hidden';
          }
        }
        // If both tokens are outside darkness, use normal lighting calculation
      } // Step 6: Determine visibility based on light level and observer's vision
      let result = this.#visionAnalyzer.determineVisibilityFromLighting(lightLevel, observerVision);

      // Clamp per imprecise-only rule: if observer has no precise senses on target (including vision), but can sense imprecisely, treat as hidden
      try {
        const preciseNonVisual = this.#visionAnalyzer.hasPreciseNonVisualInRange(observer, target);
        const canImprecise = this.#visionAnalyzer.canSenseImprecisely(observer, target);
        const hasSight = observerVision?.hasVision !== false; // visual path already considered in determineVisibilityFromLighting

        // Only downgrade if BOTH no visual senses AND no precise non-visual senses, but can sense imprecisely
        if (!hasSight && !preciseNonVisual && canImprecise) {
          // If lighting result says observed but only imprecise senses apply (e.g., darkness without darkvision), degrade to hidden
          if (result === 'observed') {
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
      if (log.enabled())
        log.info(() => ({ step: 'result', observer: observer.name, target: target.name, result }));

      return result;
    } catch (error) {
      try {
        console.warn('PF2E Visioner | calcVis: error, default observed', error);
      } catch { }
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

  /**
   * Check if we should skip this calculation based on spatial/LOS optimizations
   * @param {Token} observer - Observer token
   * @param {Token} target - Target token
   * @returns {boolean} Whether to skip the calculation
   * @private
   */
  _shouldSkipCalculation(observer, target) {
    try {
      // Use the stored EventDrivenVisibilitySystem instance, fallback to global if not available
      let eventDrivenSystem = this.#eventDrivenSystem;
      if (!eventDrivenSystem) {
        eventDrivenSystem = this._getEventDrivenSystem();
        if (!eventDrivenSystem) {
          return false; // If no system available, proceed with calculation
        }
      }

      // Check if tokens are excluded from AVS calculations
      const observerExcluded = eventDrivenSystem.isExcludedToken?.(observer);
      const targetExcluded = eventDrivenSystem.isExcludedToken?.(target);

      if (observerExcluded || targetExcluded) {
        return true;
      }

      // Check spatial distance optimization
      const maxDistance = eventDrivenSystem.getMaxVisibilityDistance?.() || 20;
      const observerPos = this._getTokenPosition(observer);
      const targetPos = this._getTokenPosition(target);

      const distance = Math.hypot(observerPos.x - targetPos.x, observerPos.y - targetPos.y);
      const gridDistance = distance / (canvas.grid?.size || 1);

      if (gridDistance > maxDistance) {
        return true;
      }

      // Check line of sight optimization
      if (eventDrivenSystem.canTokensSeeEachOther) {
        const canSee = eventDrivenSystem.canTokensSeeEachOther(observer, target);
        if (!canSee) {
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error(
        'PF2E Visioner | VisibilityCalculator: Error in _shouldSkipCalculation:',
        error,
      );
      // If any error occurs, proceed with calculation (conservative approach)
      return false;
    }
  }

  /**
   * Get the EventDrivenVisibilitySystem instance
   * @returns {EventDrivenVisibilitySystem|null}
   * @private
   */
  _getEventDrivenSystem() {
    try {
      // Try to get the system from the global scope
      if (typeof window !== 'undefined' && window.Pf2eVisionerEventDrivenSystem) {
        return window.Pf2eVisionerEventDrivenSystem;
      }

      return null;
    } catch {
      return null;
    }
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
  #doesLinePassThroughDarkness(observer, target) {
    try {
      const observerPos = this._getTokenPosition(observer);
      const targetPos = this._getTokenPosition(target);

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
            const radius = light.radius || Math.max(light.data?.bright || 0, light.data?.dim || 0);
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
        // Get the proper darkness rank from flags (like LightingCalculator does)
        let darknessRank =
          Number(lightSource.document?.getFlag?.(MODULE_ID, 'darknessRank') || 0) || 0;

        // If no document but has sourceId, try to find the source document and read its flags
        if (darknessRank === 0 && !lightSource.document && lightSource.sourceId) {
          try {
            // sourceId format is usually "DocumentType.documentId"
            const [docType, docId] = lightSource.sourceId.split('.');
            if (docType === 'AmbientLight' && docId) {
              const sourceDocument = canvas.scene.lights.get(docId);
              if (sourceDocument) {
                darknessRank =
                  Number(sourceDocument.getFlag?.(MODULE_ID, 'darknessRank') || 0) || 0;
              }
            }
          } catch (error) {
            // Silently continue if we can't parse the sourceId
          }
        }

        // Default to rank 1 if no specific rank is set (regular darkness)
        debugger;
        if (darknessRank === 0) darknessRank = 1;

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
      return false;
    }
  }
}

// Export singleton instance
export const visibilityCalculator = VisibilityCalculator.getInstance();

// Also export with the legacy name for backward compatibility
export const optimizedVisibilityCalculator = visibilityCalculator;
