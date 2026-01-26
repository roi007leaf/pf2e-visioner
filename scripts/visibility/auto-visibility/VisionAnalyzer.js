/**
 * VisionAnalyzer - Query Interface for Vision and Sensing Capabilities
 *
 * Clean query interface that answers questions about what tokens can sense.
 * Uses SensingCapabilitiesBuilder internally to get capabilities data.
 *
 * Responsibilities:
 * - Answer queries: "Can this token sense that token?"
 * - Provide vision/sensing capabilities for a token
 * - Calculate distances and line of sight
 * - Cache capabilities for performance
 *
 * Does NOT:
 * - Build sensing data (delegates to SensingCapabilitiesBuilder)
 * - Make visibility state decisions (that's StatelessVisibilityCalculator)
 * - Handle UI/dialog concerns (that's SeekDialogAdapter)
 *
 * SINGLETON PATTERN
 */

import { MODULE_ID } from '../../constants.js';
import { calculateDistanceInFeet } from '../../helpers/geometry-utils.js';
import { getTokenVerticalSpanFt } from '../../helpers/size-elevation-utils.js';
import { doesWallBlockAtElevation } from '../../helpers/wall-height-utils.js';
import { LevelsIntegration } from '../../services/LevelsIntegration.js';
import { getLogger } from '../../utils/logger.js';
import { SensingCapabilitiesBuilder } from './SensingCapabilitiesBuilder.js';

const log = getLogger('VisionAnalyzer');

export class VisionAnalyzer {
  static #instance = null;

  #capabilitiesCache = new Map();
  #cacheTimestamp = new Map();
  #cacheTimeout = 5000; // 5 seconds

  #wallCache = new Map();
  #wallCacheTimestamp = new Map();
  #wallCacheTimeout = 5000;

  #positionManager = null;

  constructor(positionManager = null) {
    if (VisionAnalyzer.#instance) {
      return VisionAnalyzer.#instance;
    }
    this.#positionManager = positionManager;
    VisionAnalyzer.#instance = this;
  }

  /**
   * Get singleton instance
   * @param {PositionManager} [positionManager] - Optional PositionManager to inject
   * @returns {VisionAnalyzer}
   */
  static getInstance(positionManager = null) {
    if (!VisionAnalyzer.#instance) {
      VisionAnalyzer.#instance = new VisionAnalyzer(positionManager);
    }
    return VisionAnalyzer.#instance;
  }

  // ============================================================================
  // PUBLIC QUERY INTERFACE
  // ============================================================================

  /**
   * Get complete sensing capabilities for a token
   * @param {Token} token
   * @returns {SensingCapabilities}
   */
  getSensingCapabilities(token) {
    if (!token?.actor) {
      return this.#emptyCapabilities();
    }

    // Check cache
    const cached = this.#getFromCache(token);
    if (cached) return cached.sensing;

    // Build fresh capabilities
    const result = this.#buildCapabilities(token);

    // Cache it
    this.#setCache(token, result);

    return result.sensing;
  }

  /**
   * Get vision capabilities (legacy format for backward compatibility)
   * @param {Token} token
   * @returns {Object}
   */
  getVisionCapabilities(token) {
    if (!token?.actor) {
      return this.#emptyLegacyCapabilities();
    }

    // Check cache
    const cached = this.#getFromCache(token);
    if (cached) return cached.legacy;

    // Build fresh capabilities
    const result = this.#buildCapabilities(token);

    // Cache it
    this.#setCache(token, result);

    return result.legacy;
  }

  /**
   * Check if observer has precise sense within range
   * @param {Token} observer
   * @param {number} [maxRange] - Optional max range to check
   * @returns {boolean}
   */
  hasPreciseSense(observer, maxRange = Infinity) {
    const capabilities = this.getSensingCapabilities(observer);

    if (maxRange === Infinity) {
      return Object.keys(capabilities.precise).length > 0;
    }

    return Object.values(capabilities.precise).some((range) => range >= maxRange);
  }

  /**
   * Check if observer has imprecise sense within range
   * @param {Token} observer
   * @param {number} [maxRange] - Optional max range to check
   * @returns {boolean}
   */
  hasImpreciseSense(observer, maxRange = Infinity) {
    const capabilities = this.getSensingCapabilities(observer);

    if (maxRange === Infinity) {
      return Object.keys(capabilities.imprecise).length > 0;
    }

    return Object.values(capabilities.imprecise).some((range) => range >= maxRange);
  }

  /**
   * Check if observer can sense target imprecisely
   * @param {Token} observer
   * @param {Token} target
   * @param {string} [senseType] - Optional specific sense type
   * @returns {boolean}
   */
  canSenseImprecisely(observer, target, senseType = null) {
    const capabilities = this.getSensingCapabilities(observer);
    const distance = this.distanceFeet(observer, target);

    // Check specific sense type if requested
    if (senseType) {
      const range = capabilities.imprecise[senseType] || capabilities.precise[senseType];
      return range ? distance <= range : false;
    }

    // Check any imprecise or precise sense (precise can also sense imprecisely)
    const allSenses = { ...capabilities.imprecise, ...capabilities.precise };
    return Object.values(allSenses).some((range) => distance <= range);
  }

  /**
   * Check if observer can sense target precisely
   * @param {Token} observer
   * @param {Token} target
   * @param {string} [senseType] - Optional specific sense type
   * @returns {boolean}
   */
  canSensePrecisely(observer, target, senseType = null) {
    const capabilities = this.getSensingCapabilities(observer);
    const distance = this.distanceFeet(observer, target);

    // Check specific sense type if requested
    if (senseType) {
      const range = capabilities.precise[senseType];
      return range ? distance <= range : false;
    }

    // Check any precise sense
    return Object.values(capabilities.precise).some((range) => distance <= range);
  }

  /**
   * Check if observer has line of sight to target
   * Uses shape-based collision detection like LightingCalculator
   * Integrates with Levels module for 3D collision detection
   * @param {Token} observer
   * @param {Token} target
   * @returns {boolean}
   */
  hasLineOfSight(observer, target) {
    // Early exit: token always has LOS to itself
    if (observer?.document?.id === target?.document?.id) {
      return true;
    }

    // Check if LOS calculation is disabled
    const losDisabled = game.settings.get(MODULE_ID, 'disableLineOfSightCalculation');
    if (losDisabled) {
      return undefined;
    }

    let stage = 'init';
    try {
      // Check for 3D collision using Levels if available
      // When Levels is active, rely entirely on 3D collision detection
      // CRITICAL: Skip Levels 3D checks when window is minimized - they require rendered vision data
      const isMinimized = typeof document !== 'undefined' && document.hidden;
      const levelsIntegration = LevelsIntegration.getInstance();
      if (levelsIntegration.isActive && !isMinimized) {
        const has3DCollision = !levelsIntegration.hasFloorCeilingBetween(observer, target);
        return has3DCollision;
      } else if (levelsIntegration.isActive && isMinimized) {
        // Fall through to 2D geometric LOS calculation below
      }

      // If the observer has an los shape, use that for line of sight against the target's circle
      // Darkness sources may affect true LOS, so only return true/false if we can be sure
      stage = 'vision-polygon';
      const los = observer.vision?.los;
      // CRITICAL: Use PositionManager if available to get correct positions
      // This fixes the issue where token.center is stale during player movements
      let observerPos = { x: observer.center.x, y: observer.center.y };
      let targetPos = { x: target.center.x, y: target.center.y };
      let usingPositionManager = false;

      // Try to get more accurate positions from injected PositionManager
      if (this.#positionManager) {
        try {
          const pmObserverPos = this.#positionManager.getTokenPosition(observer);
          const pmTargetPos = this.#positionManager.getTokenPosition(target);

          if (pmObserverPos) {
            observerPos = { x: pmObserverPos.x, y: pmObserverPos.y };
            usingPositionManager = true;
          }
          if (pmTargetPos) {
            targetPos = { x: pmTargetPos.x, y: pmTargetPos.y };
            usingPositionManager = true;
          }

          // Debug log to verify PositionManager is being used
          if (usingPositionManager) {
            const log = getLogger('AVS/VisionAnalyzer');
            log.debug(
              () =>
                `using-position-manager-for-los: ${observer.name} -> ${target.name}, PM_obs=(${Math.round(observerPos.x)},${Math.round(observerPos.y)}), PM_tgt=(${Math.round(targetPos.x)},${Math.round(targetPos.y)}), Canvas_obs=(${Math.round(observer.center.x)},${Math.round(observer.center.y)}), Canvas_tgt=(${Math.round(target.center.x)},${Math.round(target.center.y)})`,
            );
          }
        } catch (e) {
          // Fall back to token.center if PositionManager access fails
        }
      }

      // Use vision polygon for LOS check - this is Foundry's accurate pre-computed vision
      // The vision polygon is based on the observer's position and respects all walls
      // HOWEVER: During token movement, the vision polygon may be stale (based on old position)
      // So we check if the observer position has changed significantly
      const visionPolygonStale =
        usingPositionManager &&
        los?.points &&
        (Math.abs(observerPos.x - observer.center.x) > 5 ||
          Math.abs(observerPos.y - observer.center.y) > 5);

      if (los?.points && !visionPolygonStale) {
        const radius = target.externalRadius;
        // Use targetPos from PositionManager for accurate target position
        const circle = new PIXI.Circle(targetPos.x, targetPos.y, radius);
        const intersection = los.intersectCircle(circle, { density: 8, scalingFactor: 1.0 });
        const visible = intersection?.points?.length > 0;

        const log = getLogger('AVS/VisionAnalyzer');
        log.debug(
          () =>
            `vision-polygon-check: ${observer.name} -> ${target.name}, hasIntersection=${visible}, polygonPoints=${los.points.length}`,
        );

        // HYBRID VALIDATION: Compare vision polygon with full geometric LOS
        // When they agree, trust the result. When they disagree, use geometric as tiebreaker.
        const cachedWalls = this.#getCachedWalls(null); // Get all walls for validation

        // Run full geometric LOS check (same logic as the fallback below)
        const observerCenter = { x: observerPos.x, y: observerPos.y };
        const targetPoints = this.#getTokenSamplePoints(target, targetPos);

        // Check center-to-center first
        const centerHasLOS = this.#checkSingleRayLOSWithWalls(
          observerCenter,
          targetPoints[0], // Target center
          cachedWalls,
        );

        let geometricResult = centerHasLOS;

        // If center is blocked, check for 2+ corner rays (same as fallback logic)
        if (!centerHasLOS) {
          let clearRays = 0;
          const requiredRays = 2;

          for (let i = 1; i < targetPoints.length; i++) {
            const hasLOS = this.#checkSingleRayLOSWithWalls(
              observerCenter,
              targetPoints[i],
              cachedWalls,
            );
            if (hasLOS) {
              clearRays++;
              if (clearRays >= requiredRays) {
                geometricResult = true;
                break;
              }
            }
          }
        }

        if (visible === geometricResult) {
          // Both systems agree - high confidence result
          log.debug(
            () =>
              `vision-polygon-AGREEMENT: ${observer.name} -> ${target.name}, both polygon and geometric agree: ${visible}`,
          );
          return visible;
        } else {
          // Systems disagree - use geometric as tiebreaker (more predictable)
          log.debug(
            () =>
              `vision-polygon-DISAGREEMENT: ${observer.name} -> ${target.name}, polygon=${visible}, geometric=${geometricResult}, using geometric result`,
          );
          return geometricResult;
        }
      } else if (visionPolygonStale) {
        const log = getLogger('AVS/VisionAnalyzer');
        log.debug(
          () => `vision-polygon-STALE: ${observer.name} moved, falling back to geometric LOS`,
        );
      } else if (!los?.points) {
        const log = getLogger('AVS/VisionAnalyzer');
        log.debug(
          () =>
            `vision-polygon-UNAVAILABLE: ${observer.name} -> ${target.name}, attempting testVisibility`,
        );

        // CRITICAL: When vision polygon is unavailable, use Foundry's testVisibility
        // This computes the vision polygon on-demand and is more accurate than geometric sampling
        try {
          // testVisibility requires a point to test - use target's center
          const testPoint = { x: targetPos.x, y: targetPos.y };
          const visionSource = observer.vision;

          log.debug(
            () =>
              `testVisibility-check: visionSource=${!!visionSource}, canvas.visibility=${!!canvas.visibility}`,
          );

          if (visionSource && canvas.visibility) {
            const isVisible = canvas.visibility.testVisibility(testPoint, {
              object: target,
              source: visionSource,
            });
            log.debug(
              () =>
                `testVisibility-result: ${observer.name} -> ${target.name}, isVisible=${isVisible}`,
            );
            return isVisible;
          } else {
            log.debug(
              () =>
                `testVisibility-unavailable: ${observer.name} -> ${target.name}, visionSource=${!!visionSource}, canvas.visibility=${!!canvas.visibility}, falling back to geometric LOS`,
            );
            // CRITICAL: When vision source is unavailable (token not controlled),
            // we can't compute accurate vision polygons. Fall back to geometric sampling
            // with the 2-ray requirement for better accuracy.
            // This is less accurate than vision polygons but better than center-only.
          }
        } catch (error) {
          log.debug(
            () =>
              `testVisibility-failed: ${observer.name} -> ${target.name}, error=${error.message}`,
          );
          // Fall through to geometric sampling if testVisibility fails
        }
      }

      // Use multi-point geometric sampling with cached wall filtering
      stage = 'elevation-calc';
      let elevationRange = null;
      try {
        const observerSpan = getTokenVerticalSpanFt(observer);
        const targetSpan = getTokenVerticalSpanFt(target);
        elevationRange = {
          bottom: Math.min(observerSpan.bottom, targetSpan.bottom),
          top: Math.max(observerSpan.top, targetSpan.top),
        };
      } catch (error) {}

      stage = 'get-walls';
      const cachedWalls = this.#getCachedWalls(elevationRange);

      // Early exit: if no walls, always have LOS
      stage = 'wall-check';
      if (cachedWalls.length === 0) {
        const log = getLogger('AVS/VisionAnalyzer');
        log.debug(
          () => `LOS-no-walls: ${observer.name} -> ${target.name}, returning true (no walls found)`,
        );
        return true;
      }

      stage = 'sample-points';
      // Get observer and target sample points
      const observerPoints = this.#getTokenSamplePoints(observer, observerPos);
      const targetPoints = this.#getTokenSamplePoints(target, targetPos);
      const observerCenter = observerPoints[0]; // Center is first point
      const targetCenter = targetPoints[0]; // Center is first point

      // Check center-to-center first (most common case)
      stage = 'center-check';
      const centerHasLOS = this.#checkSingleRayLOSWithWalls(
        observerCenter,
        targetCenter,
        cachedWalls,
      );

      // Debug log for center-to-center check
      const log = getLogger('AVS/VisionAnalyzer');
      log.debug(
        () =>
          `LOS-center-check: ${observer.name} -> ${target.name}, from=(${Math.round(observerCenter.x)},${Math.round(observerCenter.y)}), to=(${Math.round(targetCenter.x)},${Math.round(targetCenter.y)}), walls=${cachedWalls.length}, result=${centerHasLOS}`,
      );

      if (centerHasLOS) {
        return true;
      }

      // CONSERVATIVE RAY SAMPLING: When vision polygon is unavailable, be very conservative
      // Since Foundry's vision polygon is authoritative and accounts for complex geometry,
      // our geometric fallback should err on the side of "no LOS" to avoid false positives.
      // Only return true if we find multiple clear rays, indicating significant visibility.
      stage = 'target-sampling';
      let clearRays = 0;
      const requiredRays = 2; // Require at least 2 clear rays for conservative LOS

      for (let i = 1; i < targetPoints.length; i++) {
        // Skip index 0 (center), already checked
        const hasLOS = this.#checkSingleRayLOSWithWalls(
          observerCenter,
          targetPoints[i],
          cachedWalls,
        );
        if (hasLOS) {
          clearRays++;
          log.debug(
            () =>
              `LOS-center-to-target: ${observer.name} -> ${target.name}, from=(${Math.round(observerCenter.x)},${Math.round(observerCenter.y)}), to=(${Math.round(targetPoints[i].x)},${Math.round(targetPoints[i].y)}), pointIdx=${i}, clearRays=${clearRays}`,
          );

          // Conservative approach: require multiple clear rays to confirm LOS
          if (clearRays >= requiredRays) {
            log.debug(
              () =>
                `LOS-confirmed-conservative: ${observer.name} -> ${target.name}, found ${clearRays} clear rays (required ${requiredRays})`,
            );
            return true;
          }
        }
      }

      log.debug(
        () =>
          `LOS-no-clear-rays-conservative: ${observer.name} -> ${target.name}, found ${clearRays} clear rays (required ${requiredRays}), returning false`,
      );
      return false;
    } catch (error) {
      console.error(`[LineOfSight] Error in stage '${stage}':`, error);
      log.debug(`Error checking line of sight in stage '${stage}'`, error);
      return false;
    }
  }
  /**
   * Get cached filtered walls for elevation range
   * Caches the expensive wall filtering operation
   * @private
   * @param {Object} elevationRange
   * @returns {Array<Wall>}
   */
  #getCachedWalls(elevationRange) {
    const cacheKey = `${elevationRange?.bottom ?? 'none'}_${elevationRange?.top ?? 'none'}`;

    const timestamp = this.#wallCacheTimestamp.get(cacheKey);
    if (timestamp && Date.now() - timestamp < this.#wallCacheTimeout) {
      const cached = this.#wallCache.get(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const walls = this.#filterBlockingWalls(elevationRange);
    this.#wallCache.set(cacheKey, walls);
    this.#wallCacheTimestamp.set(cacheKey, Date.now());

    return walls;
  }

  /**
   * Filter walls that block sight, respecting elevation and custom rules
   * @private
   * @param {Object} elevationRange
   * @returns {Array<Wall>}
   */
  #filterBlockingWalls(elevationRange) {
    const blockingWalls = [];

    for (const wall of canvas.walls.placeables) {
      const isDoor = wall.document.door > 0;
      const isOpen = wall.document.ds === 1;
      if (isDoor && isOpen) {
        continue;
      }

      const blocksSight = wall.document.sight !== CONST.WALL_SENSE_TYPES.NONE;
      const blocksSound = wall.document.sound !== CONST.WALL_SENSE_TYPES.NONE;

      if (!blocksSight && !blocksSound) {
        continue;
      }

      if (elevationRange && !doesWallBlockAtElevation(wall.document, elevationRange)) {
        continue;
      }

      blockingWalls.push(wall);
    }

    return blockingWalls;
  }

  /**
   * Get sample points around a token's perimeter for multi-point LOS checks
   * Returns center + 8 edge/corner points for comprehensive coverage
   * @private
   */
  #getTokenSamplePoints(token, centerPos = null) {
    // Use provided center position or fall back to token.center
    const center = centerPos
      ? { x: centerPos.x, y: centerPos.y }
      : { x: token.center.x, y: token.center.y };
    const w = token.document.width * canvas.grid.size;
    const h = token.document.height * canvas.grid.size;

    // Calculate x,y based on center position if provided
    const x = centerPos ? centerPos.x - w / 2 : token.document.x;
    const y = centerPos ? centerPos.y - h / 2 : token.document.y;

    // Small inset to ensure points are inside token bounds
    const inset = 2;

    // Sample center + 4 corners + 4 edge midpoints for maximum coverage
    return [
      center, // Center
      { x: x + inset, y: y + inset }, // Top-left corner
      { x: x + w - inset, y: y + inset }, // Top-right corner
      { x: x + inset, y: y + h - inset }, // Bottom-left corner
      { x: x + w - inset, y: y + h - inset }, // Bottom-right corner
      { x: x + w * 0.5, y: y + inset }, // Top edge center
      { x: x + w * 0.5, y: y + h - inset }, // Bottom edge center
      { x: x + inset, y: y + h * 0.5 }, // Left edge center
      { x: x + w - inset, y: y + h * 0.5 }, // Right edge center
    ];
  }

  /**
   * Check if a single ray has clear line of sight using cached walls
   * @private
   */
  #checkSingleRayLOSWithWalls(fromPoint, toPoint, walls) {
    const ray = new foundry.canvas.geometry.Ray(fromPoint, toPoint);
    const rayLength = Math.sqrt((toPoint.x - fromPoint.x) ** 2 + (toPoint.y - fromPoint.y) ** 2);
    const limitedWallIntersections = [];

    // Debug: log ray details for problematic case
    const isProblematicRay = Math.abs(fromPoint.x - 1702) < 5 && Math.abs(fromPoint.y - 1102) < 5;

    for (const wall of walls) {
      // For doors, skip the distance optimization since they need special proximity handling
      // Doors can block vision even when the ray midpoint is far from the door midpoint
      const isDoor = wall.document.door > 0;

      if (!isDoor) {
        const wallMidX = (wall.document.c[0] + wall.document.c[2]) / 2;
        const wallMidY = (wall.document.c[1] + wall.document.c[3]) / 2;
        const distToRayMid = Math.sqrt(
          (wallMidX - (fromPoint.x + toPoint.x) / 2) ** 2 +
            (wallMidY - (fromPoint.y + toPoint.y) / 2) ** 2,
        );

        if (distToRayMid > rayLength * 1.5) {
          continue;
        }
      }

      // For doors, check if ray crosses through the door's area with threshold
      // This catches near-misses where ray passes within a few pixels of door
      if (isDoor) {
        const doorThreshold = 3; // pixels

        // Check if ray endpoints are on opposite sides of the door
        // and if the ray passes close enough to the door span
        const wallX1 = wall.document.c[0];
        const wallY1 = wall.document.c[1];
        const wallX2 = wall.document.c[2];
        const wallY2 = wall.document.c[3];

        // Determine if door is more horizontal or vertical
        const doorDx = Math.abs(wallX2 - wallX1);
        const doorDy = Math.abs(wallY2 - wallY1);
        const isHorizontalDoor = doorDx > doorDy;

        if (isHorizontalDoor) {
          // Horizontal door: check if ray crosses the Y plane
          const doorY = wallY1;
          const doorMinX = Math.min(wallX1, wallX2);
          const doorMaxX = Math.max(wallX1, wallX2);

          // Check if ray crosses the door's Y coordinate
          const rayMinY = Math.min(fromPoint.y, toPoint.y);
          const rayMaxY = Math.max(fromPoint.y, toPoint.y);

          if (rayMinY <= doorY + doorThreshold && rayMaxY >= doorY - doorThreshold) {
            // Ray crosses door's Y plane, check if it's within door's X span (with threshold)
            const rayX = fromPoint.x; // For vertical rays, X is constant
            if (rayX >= doorMinX - doorThreshold && rayX <= doorMaxX + doorThreshold) {
              return false;
            }
          }
        } else {
          // Vertical door: check if ray crosses the X plane
          const doorX = wallX1;
          const doorMinY = Math.min(wallY1, wallY2);
          const doorMaxY = Math.max(wallY1, wallY2);

          // Check if ray crosses the door's X coordinate
          const rayMinX = Math.min(fromPoint.x, toPoint.x);
          const rayMaxX = Math.max(fromPoint.x, toPoint.x);

          if (rayMinX <= doorX + doorThreshold && rayMaxX >= doorX - doorThreshold) {
            // Ray crosses door's X plane, check if it's within door's Y span (with threshold)
            const rayY = fromPoint.y; // For horizontal rays, Y is constant
            if (rayY >= doorMinY - doorThreshold && rayY <= doorMaxY + doorThreshold) {
              return false;
            }
          }
        }
      }

      // Walls are pre-filtered, check intersection
      const intersection = foundry.utils.lineLineIntersection(
        { x: ray.A.x, y: ray.A.y },
        { x: ray.B.x, y: ray.B.y },
        { x: wall.document.c[0], y: wall.document.c[1] },
        { x: wall.document.c[2], y: wall.document.c[3] },
      );

      if (isProblematicRay) {
        const log = getLogger('AVS/VisionAnalyzer');
        log.debug(
          () =>
            `wall-check: from=(${Math.round(fromPoint.x)},${Math.round(fromPoint.y)}), to=(${Math.round(toPoint.x)},${Math.round(toPoint.y)}), wall=(${wall.document.c[0]},${wall.document.c[1]})->(${wall.document.c[2]},${wall.document.c[3]}), hasIntersection=${!!intersection}, t0=${intersection?.t0?.toFixed(3)}`,
        );
      }

      // Check if intersection is within the ray segment (0 <= t0 <= 1)
      if (
        intersection &&
        typeof intersection.t0 === 'number' &&
        intersection.t0 >= 0 &&
        intersection.t0 <= 1
      ) {
        // Compute t1 for the wall segment
        const wallDx = wall.document.c[2] - wall.document.c[0];
        const wallDy = wall.document.c[3] - wall.document.c[1];
        let t1;

        // Use the larger component to avoid division by near-zero
        if (Math.abs(wallDx) > Math.abs(wallDy)) {
          t1 = (intersection.x - wall.document.c[0]) / wallDx;
        } else {
          t1 = (intersection.y - wall.document.c[1]) / wallDy;
        }

        // Check if t1 is also within [0, 1] (intersection within wall segment)
        if (t1 >= 0 && t1 <= 1) {
          // Ray intersects this wall

          if (isProblematicRay) {
            const log = getLogger('AVS/VisionAnalyzer');
            log.debug(
              () =>
                `wall-intersection-found: t1=${t1.toFixed(3)}, wallDir=${wall.document.dir}, checking directional...`,
            );
          }

          // Check for directional walls (one-way walls)
          // dir: 0 = both directions, 1 = left side blocks, 2 = right side blocks
          if (wall.document.dir && wall.document.dir !== 0) {
            const observerDx = fromPoint.x - wall.document.c[0];
            const observerDy = fromPoint.y - wall.document.c[1];

            // Cross product determines which side the observer is on
            const crossProduct = wallDx * observerDy - wallDy * observerDx;

            // dir=1: blocks from left (negative cross product)
            // dir=2: blocks from right (positive cross product)
            const blocksFromObserverSide =
              (wall.document.dir === 1 && crossProduct < 0) ||
              (wall.document.dir === 2 && crossProduct > 0);

            if (!blocksFromObserverSide) {
              continue; // One-way wall doesn't block from this direction
            }
          }

          // Check if this wall blocks sight
          const blocksSight = wall.document.sight !== CONST.WALL_SENSE_TYPES.NONE;

          // If wall doesn't block sight, skip it for LOS check
          if (!blocksSight) {
            if (isProblematicRay) {
              const log = getLogger('AVS/VisionAnalyzer');
              log.debug(() => `wall-doesnt-block-sight: sight=${wall.document.sight}, skipping`);
            }
            continue;
          }

          // Check if this is a Limited wall (sight/light/sound = LIMITED)
          const isLimitedSight = wall.document.sight === CONST.WALL_SENSE_TYPES.LIMITED;
          const isLimitedLight = wall.document.light === CONST.WALL_SENSE_TYPES.LIMITED;
          const isLimitedSound = wall.document.sound === CONST.WALL_SENSE_TYPES.LIMITED;
          const isLimited = isLimitedSight || isLimitedLight || isLimitedSound;

          if (isLimited) {
            if (isProblematicRay) {
              const log = getLogger('AVS/VisionAnalyzer');
              log.debug(() => `wall-limited: adding to limitedWallIntersections`);
            }
            limitedWallIntersections.push({
              x: intersection.x,
              y: intersection.y,
              t0: intersection.t0,
            });
          } else {
            if (isProblematicRay) {
              const log = getLogger('AVS/VisionAnalyzer');
              log.debug(() => `wall-BLOCKS-completely: returning false immediately`);
            }
            return false;
          }
        } else if (isProblematicRay) {
          const log = getLogger('AVS/VisionAnalyzer');
          log.debug(() => `wall-t1-out-of-range: t1=${t1?.toFixed(3)} not in [0,1]`);
        }
      } else if (isProblematicRay && intersection) {
        const log = getLogger('AVS/VisionAnalyzer');
        log.debug(() => `wall-t0-out-of-range: t0=${intersection.t0?.toFixed(3)} not in [0,1]`);
      }
    }

    if (isProblematicRay) {
      const log = getLogger('AVS/VisionAnalyzer');
      log.debug(
        () =>
          `ray-final-result: limitedWalls=${limitedWallIntersections.length}, returning=${limitedWallIntersections.length < 2}`,
      );
    }

    // Check if we hit 2+ Limited walls at different locations
    if (limitedWallIntersections.length >= 2) {
      // Check if all intersections are at approximately the same point (corner hit)
      const epsilon = 0.1; // Small tolerance for floating point comparison
      const first = limitedWallIntersections[0];
      const allSamePoint = limitedWallIntersections.every(
        (point) => Math.abs(point.x - first.x) < epsilon && Math.abs(point.y - first.y) < epsilon,
      );

      if (!allSamePoint) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if sound is blocked between two tokens
   * Integrates with Levels module for 3D collision detection
   * @param {Token} observer
   * @param {Token} target
   * @returns {boolean} True if sound is blocked by walls, floors/ceilings, or Silence effect
   */
  isSoundBlocked(observer, target) {
    try {
      // Check for Silence spell effect on observer or target
      const observerHasSilence = this.#hasSilenceEffect(observer.actor);
      const targetHasSilence = this.#hasSilenceEffect(target.actor);

      if (observerHasSilence || targetHasSilence) {
        return true;
      }

      // Check for sound-blocking walls manually, ignoring LIMITED walls
      // Limited walls (terrain walls) should NOT block sound - they represent fog/mist
      const ray = new foundry.canvas.geometry.Ray(observer.center, target.center);

      for (const wall of canvas.walls.placeables) {
        // Skip walls that don't block sound
        if (wall.document.sound === CONST.WALL_SENSE_TYPES.NONE) {
          continue;
        }

        // Skip LIMITED walls - they don't block sound (fog, mist, etc.)
        if (wall.document.sound === CONST.WALL_SENSE_TYPES.LIMITED) {
          continue;
        }

        // Skip open doors
        const isDoor = wall.document.door > 0;
        const isOpen = wall.document.ds === 1;
        if (isDoor && isOpen) {
          continue;
        }

        // Check if the ray intersects this sound-blocking wall
        const intersection = foundry.utils.lineLineIntersection(
          { x: ray.A.x, y: ray.A.y },
          { x: ray.B.x, y: ray.B.y },
          { x: wall.document.c[0], y: wall.document.c[1] },
          { x: wall.document.c[2], y: wall.document.c[3] },
        );

        if (
          intersection &&
          typeof intersection.t0 === 'number' &&
          intersection.t0 >= 0 &&
          intersection.t0 <= 1
        ) {
          const wallDx = wall.document.c[2] - wall.document.c[0];
          const wallDy = wall.document.c[3] - wall.document.c[1];
          let t1;

          if (Math.abs(wallDx) > Math.abs(wallDy)) {
            t1 = (intersection.x - wall.document.c[0]) / wallDx;
          } else {
            t1 = (intersection.y - wall.document.c[1]) / wallDy;
          }

          if (t1 >= 0 && t1 <= 1) {
            // Found a normal (non-limited) sound-blocking wall
            return true;
          }
        }
      }
      // Check for 3D collision using Levels if available
      const levelsIntegration = LevelsIntegration.getInstance();
      if (levelsIntegration.isActive) {
        return levelsIntegration.test3DCollision(observer, target, 'sound');
      }

      // Check if polygon backend for sound is available
      const soundBackend = CONFIG.Canvas.polygonBackends?.sound;
      if (!soundBackend?.testCollision) {
        return false;
      }

      return false;
    } catch (error) {
      console.error('[Sound-Blocking] Error checking sound blocking:', error);
      log.debug('Error checking sound blocking', error);
      // On error, assume sound is NOT blocked (fail open for better UX)
      return false;
    }
  } /**
   * Check if actor has Silence effect active
   * @private
   * @param {Actor} actor
   * @returns {boolean} True if Silence effect is active
   */
  #hasSilenceEffect(actor) {
    try {
      const effects =
        actor.itemTypes?.effect ?? actor.items?.filter?.((i) => i?.type === 'effect') ?? [];
      return effects?.some?.((effect) => {
        const slug = effect?.slug || effect?.system?.slug || '';
        const name = effect?.name?.toLowerCase() || '';
        return slug.toLowerCase() === 'spell-effect-silence' || name.includes('silence');
      });
    } catch {
      return false;
    }
  }

  /**
   * Calculate distance between tokens in feet
   * Uses Levels integration for 3D distance when available
   * @param {Token} a
   * @param {Token} b
   * @returns {number} Distance in feet
   */
  distanceFeet(a, b) {
    try {
      const levelsIntegration = LevelsIntegration.getInstance();

      if (levelsIntegration.isActive) {
        const distance3D = levelsIntegration.getTotalDistance(a, b);
        if (distance3D !== Infinity) {
          const feetPerGrid = canvas.scene?.grid?.distance || 5;
          const distanceInFeet = distance3D * feetPerGrid;
          return distanceInFeet;
        }
      }
      const distance2D = calculateDistanceInFeet(a, b);
      return distance2D;
    } catch (error) {
      console.error('[VisionAnalyzer] distanceFeet - Error:', error);
      log.debug('Error calculating distance', error);
      return Infinity;
    }
  }

  /**
   * Check if token has a specific condition
   * @param {Token} token
   * @param {string} conditionSlug
   * @returns {boolean}
   */
  hasCondition(token, conditionSlug) {
    const actor = token?.actor;
    if (!actor) return false;

    return this.#hasCondition(actor, conditionSlug);
  }

  /**
   * Check if observer has precise non-visual sense in range of target
   * @param {Token} observer
   * @param {Token} target
   * @returns {boolean}
   */
  hasPreciseNonVisualInRange(observer, target) {
    const capabilities = this.getSensingCapabilities(observer);
    const distance = this.distanceFeet(observer, target);

    // Check for precise non-visual senses within range
    const nonVisualSenses = Object.entries(capabilities.precise).filter(
      ([senseType]) =>
        senseType !== 'vision' && senseType !== 'sight' && !senseType.includes('vision'),
    );

    return nonVisualSenses.some(([_, range]) => distance <= range);
  }

  /**
   * Check if observer can detect elevated target
   * @param {Token} observer
   * @param {Token} target
   * @returns {boolean}
   */
  canDetectElevatedTarget(observer, target) {
    const targetElevation = target.document?.elevation || 0;
    const observerElevation = observer.document?.elevation || 0;

    // If both are at same elevation, no elevation issue
    if (targetElevation === observerElevation) {
      return true;
    }

    // If target is not elevated, any sense can detect it
    if (targetElevation <= 0) {
      return true;
    }

    // Get comprehensive capabilities
    const capabilities = this.getVisionCapabilities(observer);
    const sensingCaps = this.getSensingCapabilities(observer);

    // Visual senses can detect elevated targets only if there's line of sight
    if (
      (capabilities.hasDarkvision || capabilities.hasLowLightVision || capabilities.hasVision) &&
      this.hasLineOfSight(observer, target)
    ) {
      return true;
    }

    // Echolocation can detect flying/elevated targets
    if (sensingCaps.precise.echolocation || sensingCaps.imprecise.echolocation) {
      return true;
    }

    // Scent can potentially detect elevated targets
    if (sensingCaps.precise.scent || sensingCaps.imprecise.scent) {
      return true;
    }

    // If observer only has basic vision but no line of sight, and no special senses, cannot detect
    return false;
  }

  /**
   * Clear cache for specific token or all
   * @param {Token} [token] - Optional token to clear, or clear all if omitted
   */
  clearCache(token = null) {
    if (token) {
      const key = token.id || token.document?.id;
      if (key) {
        this.#capabilitiesCache.delete(key);
        this.#cacheTimestamp.delete(key);
      }
    } else {
      this.#capabilitiesCache.clear();
      this.#cacheTimestamp.clear();
      this.#wallCache.clear();
      this.#wallCacheTimestamp.clear();
    }
  }

  /**
   * Backward compatibility alias for clearCache
   * @param {string} [tokenId] - Optional token ID to clear, or clear all if omitted
   */
  clearVisionCache(tokenId = null) {
    if (tokenId) {
      this.#capabilitiesCache.delete(tokenId);
      this.#cacheTimestamp.delete(tokenId);
    } else {
      this.clearCache();
    }
  }

  /**
   * Backward compatibility alias for clearCache
   * @param {string} [tokenId] - Optional token ID to clear, or clear all if omitted
   */
  invalidateVisionCache(tokenId = null) {
    this.clearVisionCache(tokenId);
  }

  /**
   * Check if a special sense can detect a target based on creature type
   * @param {Token} target - Target token to check
   * @param {string} senseType - Type of sense (lifesense, scent, echolocation, tremorsense, etc.)
   * @returns {Promise<boolean>} - True if the sense can detect this creature type
   */
  async canDetectWithSpecialSense(target, senseType) {
    try {
      const { SPECIAL_SENSES } = await import('../../constants.js');
      const senseConfig = SPECIAL_SENSES[senseType];
      if (!senseConfig) return false;

      const actor = target?.actor;
      if (!actor) return false;

      const creatureType = actor.system?.details?.creatureType || actor.type;
      const traits = actor.system?.traits?.value || actor.system?.details?.traits?.value || [];

      // Check if this sense can detect constructs
      if (!senseConfig.detectsConstructs) {
        if (creatureType === 'construct') return false;
        if (
          Array.isArray(traits) &&
          traits.some((trait) =>
            typeof trait === 'string'
              ? trait.toLowerCase() === 'construct'
              : trait?.value?.toLowerCase() === 'construct',
          )
        ) {
          return false;
        }
      }

      // Check if this sense can detect undead
      if (!senseConfig.detectsUndead) {
        if (creatureType === 'undead') return false;
        if (
          Array.isArray(traits) &&
          traits.some((trait) =>
            typeof trait === 'string'
              ? trait.toLowerCase() === 'undead'
              : trait?.value?.toLowerCase() === 'undead',
          )
        ) {
          return false;
        }
      }

      // Check if this sense can detect living creatures
      if (!senseConfig.detectsLiving) {
        const livingTypes = [
          'character',
          'npc',
          'animal',
          'beast',
          'fey',
          'humanoid',
          'plant',
          'fiend',
          'celestial',
          'monitor',
          'elemental',
        ];
        if (livingTypes.includes(creatureType)) return false;
        if (
          Array.isArray(traits) &&
          traits.some((trait) =>
            typeof trait === 'string'
              ? trait.toLowerCase() === 'living'
              : trait?.value?.toLowerCase() === 'living',
          )
        ) {
          return false;
        }
      }

      // If we get here, the sense can detect this type of creature
      return true;
    } catch {
      return false;
    }
  }

  // ============================================================================
  // INTERNAL IMPLEMENTATION
  // ============================================================================

  /**
   * Build complete capabilities for a token
   * @private
   */
  #buildCapabilities(token) {
    const actor = token.actor;

    // Extract vision data and conditions
    const visionData = this.#extractVisionData(token, actor);

    // Build sensing capabilities using SensingCapabilitiesBuilder
    const rawSensing = SensingCapabilitiesBuilder.build({
      senses: visionData.senses,
      detectionModes: visionData.detectionModes,
      conditions: {
        blinded: visionData.isBlinded,
        deafened: visionData.isDeafened,
      },
    });

    // Enhance with special sense interpretation and echolocation detection
    const sensing = this.#enhanceSensingCapabilities(rawSensing, actor);

    // Build legacy format for backward compatibility
    const legacy = this.#buildLegacyFormat(visionData, sensing);

    return { sensing, legacy, visionData };
  }

  /**
   * Enhance sensing capabilities with condition filtering and echolocation
   * @private
   */
  #enhanceSensingCapabilities(rawSensing, actor) {
    // Check conditions
    const isBlinded = this.#hasCondition(actor, 'blinded');
    const isDeafened = this.#hasCondition(actor, 'deafened');

    const enhanced = {
      precise: { ...rawSensing.precise },
      imprecise: { ...rawSensing.imprecise },
    };

    // Filter out visual senses if blinded
    if (isBlinded) {
      const visualSenseTypes = [
        'vision',
        'sight',
        'darkvision',
        'greater-darkvision',
        'low-light-vision',
        'see-invisibility',
        'see-all',
      ];
      for (const senseType of visualSenseTypes) {
        delete enhanced.precise[senseType];
        delete enhanced.imprecise[senseType];
      }
    }

    // Filter out hearing-based senses if deafened (hearing + echolocation)
    if (isDeafened) {
      delete enhanced.precise.hearing;
      delete enhanced.precise.echolocation;
      delete enhanced.imprecise.hearing;
      delete enhanced.imprecise.echolocation;
    }

    // Detect echolocation and add as precise sense if not deafened
    if (!isDeafened) {
      const echolocation = this.#detectEcholocation(actor);
      if (echolocation.active) {
        // Add echolocation as a precise sense (keeping hearing as imprecise if it exists)
        enhanced.precise.echolocation = echolocation.range;
      }
    }

    return enhanced;
  }

  /**
   * Detect if actor has echolocation active
   * @private
   */
  #detectEcholocation(actor) {
    const state = { active: false, range: 0 };

    try {
      // Check for echolocation effect
      const effects =
        actor.itemTypes?.effect ?? actor.items?.filter?.((i) => i?.type === 'effect') ?? [];
      const hasEffect = effects?.some?.(
        (effect) =>
          (effect?.slug || effect?.system?.slug || effect?.name)?.toLowerCase?.() ===
          'effect-echolocation',
      );

      if (hasEffect) {
        state.active = true;
        state.range = 40;
        return state;
      }

      // Check for echolocation flag
      const flag = actor.getFlag?.('pf2e-visioner', 'echolocation');
      if (flag?.active) {
        state.active = true;
        state.range = Number(flag.range) || 40;
      }
    } catch {
      // Ignore errors
    }

    return state;
  }

  /**
   * Extract raw vision data from token/actor
   * @private
   */
  #extractVisionData(token, actor) {
    const result = {
      hasVision: true,
      hasDarkvision: false,
      hasLowLightVision: false,
      hasGreaterDarkvision: false,
      darkvisionRange: 0,
      lowLightRange: 0,
      isBlinded: false,
      isDeafened: false,
      isDazzled: false,
      senses: null,
      detectionModes: {},
    };

    try {
      // Check conditions
      result.isBlinded = this.#hasCondition(actor, 'blinded');
      result.isDeafened = this.#hasCondition(actor, 'deafened');
      result.isDazzled = this.#hasCondition(actor, 'dazzled');

      if (result.isBlinded) {
        result.hasVision = false;
      }

      if (actor.system?.perception?.vision === false) {
        result.hasVision = false;
      }

      // Extract senses
      if (actor.system?.perception?.senses) {
        result.senses = actor.system.perception.senses;
      } else if (actor.perception?.senses) {
        result.senses = actor.perception.senses;
      }

      // Process senses to extract vision types
      if (result.senses) {
        this.#processSensesForVisionTypes(result);
      }

      this.#checkForVisionFeats(actor, result);

      // Build detection modes object
      this.#buildDetectionModes(token, result);
    } catch (error) {
      log.debug('Error extracting vision data', error);
    }

    return result;
  }

  /**
   * Process senses to extract vision types (darkvision, low-light, etc.)
   * @private
   */
  #processSensesForVisionTypes(result) {
    const senses = result.senses;

    if (Array.isArray(senses)) {
      // NPC format
      for (const sense of senses) {
        const type = sense.type || sense.slug;
        if (type === 'greater-darkvision' || type === 'greaterDarkvision') {
          result.hasDarkvision = true;
          result.hasGreaterDarkvision = true;
          result.darkvisionRange = sense.range || Infinity;
        } else if (type === 'darkvision') {
          result.hasDarkvision = true;
          result.darkvisionRange = sense.range || Infinity;
        } else if (type === 'low-light-vision' || type === 'lowLightVision') {
          result.hasLowLightVision = true;
          result.lowLightRange = sense.range || Infinity;
        }
      }
    } else if (typeof senses === 'object') {
      // PC format
      if (senses['greater-darkvision'] || senses.greaterDarkvision) {
        result.hasDarkvision = true;
        result.hasGreaterDarkvision = true;
        const gd = senses['greater-darkvision'] || senses.greaterDarkvision;
        result.darkvisionRange = gd?.range || Infinity;
      } else if (senses.darkvision) {
        result.hasDarkvision = true;
        result.darkvisionRange = senses.darkvision?.range || Infinity;
      }

      if (senses['low-light-vision'] || senses.lowLightVision) {
        result.hasLowLightVision = true;
        const ll = senses['low-light-vision'] || senses.lowLightVision;
        result.lowLightRange = ll?.range || Infinity;
      }
    }
  }

  #checkForVisionFeats(actor, result) {
    if (!actor) return;

    try {
      const feats = actor.itemTypes?.feat ?? actor.items?.filter?.((i) => i?.type === 'feat') ?? [];

      for (const feat of feats) {
        const slug = feat?.system?.slug?.toLowerCase?.() || '';

        if (slug === 'greater-darkvision' && !result.hasGreaterDarkvision) {
          log.debug('Greater Darkvision feat detected (not in senses)', { actor: actor.name });
          result.hasDarkvision = true;
          result.hasGreaterDarkvision = true;
          if (!result.darkvisionRange) {
            result.darkvisionRange = Infinity;
          }
        } else if (slug === 'darkvision' && !result.hasDarkvision) {
          log.debug('Darkvision feat detected (not in senses)', { actor: actor.name });
          result.hasDarkvision = true;
          if (!result.darkvisionRange) {
            result.darkvisionRange = Infinity;
          }
        }
      }
    } catch (error) {
      log.debug('Error checking vision feats', error);
    }
  }

  /**
   * Build detection modes object
   * @private
   */
  #buildDetectionModes(token, result) {
    // Add detection modes from token
    const tokenDetectionModes = token.document?.detectionModes || [];
    for (const mode of tokenDetectionModes) {
      if (mode.id && mode.enabled && mode.range > 0) {
        result.detectionModes[mode.id] = {
          enabled: mode.enabled,
          range: mode.range,
          source: 'token',
        };
      }
    }

    // Add vision capabilities as detection modes
    if (result.hasVision) {
      result.detectionModes.basicSight = {
        enabled: true,
        range: Infinity,
        source: 'vision',
      };
    }

    if (result.hasGreaterDarkvision) {
      result.detectionModes.greaterDarkvision = {
        enabled: true,
        range: result.darkvisionRange || Infinity,
        source: 'vision',
      };
    } else if (result.hasDarkvision) {
      result.detectionModes.darkvision = {
        enabled: true,
        range: result.darkvisionRange || Infinity,
        source: 'vision',
      };
    }

    if (result.hasLowLightVision) {
      result.detectionModes.lowLightVision = {
        enabled: true,
        range: result.lowLightRange || Infinity,
        source: 'vision',
      };
    }
  }

  /**
   * Build legacy format for backward compatibility
   * @private
   */
  #buildLegacyFormat(visionData, sensing) {
    // Build legacy array-based format from object-based sensing
    const preciseArray = Object.entries(sensing.precise).map(([type, range]) => ({ type, range }));
    const impreciseArray = Object.entries(sensing.imprecise).map(([type, range]) => ({
      type,
      range,
    }));

    // Build individual sense properties for legacy access
    const hearingPrecise = sensing.precise.hearing;
    const hearingImprecise = sensing.imprecise.hearing;
    const hearing = hearingPrecise
      ? { acuity: 'precise', range: hearingPrecise }
      : hearingImprecise
        ? { acuity: 'imprecise', range: hearingImprecise }
        : null;

    const lifesensePrecise = sensing.precise.lifesense;
    const lifesenseImprecise = sensing.imprecise.lifesense;
    const lifesense = lifesensePrecise
      ? { acuity: 'precise', range: lifesensePrecise }
      : lifesenseImprecise
        ? { acuity: 'imprecise', range: lifesenseImprecise }
        : null;

    // Check for echolocation
    const echolocationActive = !!(sensing.precise.echolocation || sensing.imprecise.echolocation);
    const echolocationRange = sensing.precise.echolocation || sensing.imprecise.echolocation || 0;

    // Build individual senses object for all sense types
    const individualSenses = {};
    for (const [type, range] of Object.entries(sensing.precise)) {
      individualSenses[type] = { acuity: 'precise', range };
    }
    for (const [type, range] of Object.entries(sensing.imprecise)) {
      if (!individualSenses[type]) {
        individualSenses[type] = { acuity: 'imprecise', range };
      }
    }

    // Build sensingSummary with ARRAY-based format for legacy compatibility
    const sensingSummary = {
      // Legacy array-based API (for seek dialog and other UI)
      precise: preciseArray,
      imprecise: impreciseArray,

      // Legacy special properties
      hearing,
      lifesense,
      echolocationActive,
      echolocationRange,
      individualSenses,
    };

    return {
      // Vision flags
      hasVision: visionData.hasVision,
      hasDarkvision: visionData.hasDarkvision,
      hasLowLightVision: visionData.hasLowLightVision,
      hasGreaterDarkvision: visionData.hasGreaterDarkvision,
      hasRegularDarkvision: visionData.hasDarkvision && !visionData.hasGreaterDarkvision,
      darkvisionRange: visionData.darkvisionRange,
      lowLightRange: visionData.lowLightRange,

      // Conditions
      isBlinded: visionData.isBlinded,
      isDeafened: visionData.isDeafened,
      isDazzled: visionData.isDazzled,

      // Detection modes
      detectionModes: visionData.detectionModes,

      // Top-level: modern object-based structure (for new code)
      precise: sensing.precise,
      imprecise: sensing.imprecise,

      // Top-level: legacy special properties
      hearing,
      lifesense,
      echolocationActive,
      echolocationRange,
      individualSenses,
      ...individualSenses, // Spread for direct access

      // Nested sensingSummary: array-based for legacy UI (seek dialog, etc.)
      sensingSummary,
    };
  }

  /**
   * Check if actor has a specific condition
   * @private
   */
  #hasCondition(actor, conditionSlug) {
    try {
      // Method 1: hasCondition function (most reliable)
      if (actor.hasCondition && typeof actor.hasCondition === 'function') {
        return actor.hasCondition(conditionSlug);
      }

      // Method 2: Check system conditions
      if (actor.system?.conditions?.[conditionSlug]?.active) {
        return true;
      }

      // Method 3: Check conditions collection
      if (actor.conditions?.has?.(conditionSlug)) {
        return true;
      }

      // Method 4: Iterate through conditions
      if (actor.conditions) {
        try {
          return Array.from(actor.conditions).some(
            (condition) => condition.slug === conditionSlug || condition.key === conditionSlug,
          );
        } catch {
          // Ignore iteration errors
        }
      }

      // Method 5: Check itemTypes
      if (actor.itemTypes?.condition) {
        return actor.itemTypes.condition.some(
          (condition) =>
            condition.slug === conditionSlug || condition.system?.slug === conditionSlug,
        );
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Get cached capabilities
   * @private
   */
  #getFromCache(token) {
    const key = token.id || token.document?.id;
    if (!key) return null;

    const timestamp = this.#cacheTimestamp.get(key);
    if (!timestamp) return null;

    const age = Date.now() - timestamp;
    if (age > this.#cacheTimeout) {
      this.#capabilitiesCache.delete(key);
      this.#cacheTimestamp.delete(key);
      return null;
    }

    return this.#capabilitiesCache.get(key);
  }

  /**
   * Set cache
   * @private
   */
  #setCache(token, result) {
    const key = token.id || token.document?.id;
    if (!key) return;

    this.#capabilitiesCache.set(key, result);
    this.#cacheTimestamp.set(key, Date.now());
  }

  /**
   * Empty capabilities
   * @private
   */
  #emptyCapabilities() {
    return {
      precise: {},
      imprecise: {},
      hearing: null,
      lifesense: null,
      echolocationActive: false,
      echolocationRange: 0,
      individualSenses: {},
    };
  }

  /**
   * Empty legacy capabilities
   * @private
   */
  #emptyLegacyCapabilities() {
    return {
      hasVision: false,
      hasDarkvision: false,
      hasLowLightVision: false,
      hasGreaterDarkvision: false,
      hasRegularDarkvision: false,
      darkvisionRange: 0,
      lowLightRange: 0,
      isBlinded: false,
      isDeafened: false,
      isDazzled: false,
      detectionModes: {},
      precise: [],
      imprecise: [],
      hearing: null,
      lifesense: null,
      echolocationActive: false,
      echolocationRange: 0,
      individualSenses: {},
      sensingSummary: this.#emptyCapabilities(),
    };
  }
}
