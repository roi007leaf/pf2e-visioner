/**
 * CoverDetector.js
 * Handles the logic for detecting cover between tokens or points
 */

import { MODULE_ID } from '../../constants.js';
// Removed unused imports that were only used by the removed center intersection mode
import {
  intersectsBetweenTokens,
  segmentRectIntersectionLength,
} from '../../helpers/line-intersection.js';
import {
  getSizeRank,
  getTokenCorners,
  getTokenRect,
  getTokenVerticalSpanFt,
} from '../../helpers/size-elevation-utils.js';

import { getVisibilityBetween } from '../../utils.js';

export class CoverDetector {
  // Define token disposition constants for use within this class
  static TOKEN_DISPOSITIONS = {
    FRIENDLY: 1,
    NEUTRAL: 0,
    HOSTILE: -1,
  };
  /**
   * Detect cover using an arbitrary origin point instead of an attacker token
   * @param {Object} origin - Point with x,y coordinates
   * @param {Object} target - Target token
   * @param {Object} options - Additional options
   * @returns {string} Cover state ('none', 'lesser', 'standard', 'greater')
   */
  detectFromPoint(origin, target, options = {}) {
    try {
      if (!origin || !target) return 'none';

      // Build a minimal attacker-like object with a center at the origin point
      const pseudoAttacker = {
        id: 'template-origin',
        center: { x: Number(origin.x) || 0, y: Number(origin.y) || 0 },
        getCenter: () => ({ x: Number(origin.x) || 0, y: Number(origin.y) || 0 }),
        actor: null,
        document: { x: origin.x, y: origin.y, width: 0, height: 0 },
      };

      // Reuse the normal path using the pseudo attacker
      return this.detectBetweenTokens(pseudoAttacker, target, options);
    } catch (error) {
      console.error('PF2E Visioner | CoverDetector.detectFromPoint error:', error);
      return 'none';
    }
  }

  /**
   * Detect cover state for an attack between two tokens
   * @param {Object} attacker - Attacker token
   * @param {Object} target - Target token
   * @param {Object} options - Additional options
   * @returns {string} Cover state ('none', 'lesser', 'standard', 'greater')
   */
  detectBetweenTokens(attacker, target) {
    try {
      if (!attacker || !target) return 'none';

      // Exclude same token (attacker and target are the same)
      if (attacker.id === target.id) return 'none';

      const p1 = attacker.center ?? attacker.getCenter();
      const p2 = target.center ?? target.getCenter();

      // Check if there's any blocking terrain (walls) in the way
      const segmentAnalysis = this._analyzeSegmentObstructions(p1, p2);
      const hasWallsInTheWay = segmentAnalysis.hasBlockingTerrain;

      // NEW LOGIC: Priority based on wall presence
      if (!hasWallsInTheWay) {
        // Case 1: No walls in the way - use token cover
        const intersectionMode = this._getIntersectionMode();
        const filters = { ...this._getAutoCoverFilterSettings(attacker) };
        let blockers = this._getEligibleBlockingTokens(attacker, target, filters);

        // Apply elevation filtering (mode-aware)
        blockers = this._filterBlockersByElevation(attacker, target, blockers, intersectionMode);

        // Determine token cover based on intersection mode
        let tokenCover;
        if (intersectionMode === 'tactical') {
          tokenCover = this._evaluateCoverByTactical(attacker, target, blockers);
        } else if (intersectionMode === 'coverage') {
          tokenCover = this._evaluateCoverByCoverage(attacker, target, blockers);
        } else {
          tokenCover = this._evaluateCreatureSizeCover(attacker, target, blockers);
        }

        // Apply token cover overrides
        tokenCover = this._applyTokenCoverOverrides(attacker, target, blockers, tokenCover);

        return tokenCover;
      } else {
        // Case 2: There IS a wall in the way - use new wall cover rules
        const wallCover = this._evaluateWallsCover(p1, p2);
        return wallCover;
      }
    } catch (error) {
      console.error('PF2E Visioner | CoverDetector.detectForAttack error:', error);
      return 'none';
    }
  }

  /**
   * Get the intersection mode from settings
   * @returns {string}
   * @private
   */
  _getIntersectionMode() {
    try {
      const mode = game.settings.get('pf2e-visioner', 'autoCoverTokenIntersectionMode');
      return mode || 'tactical';
    } catch (error) {
      console.warn(
        'PF2E Visioner | Could not read autoCoverTokenIntersectionMode setting, using default',
        error,
      );
      return 'tactical';
    }
  }

  /**
   * Get auto cover filter settings
   * @param {Object} attacker
   * @returns {Object}
   * @private
   */
  _getAutoCoverFilterSettings(attacker) {
    const ignoreUndetected = !!game.settings?.get?.(MODULE_ID, 'autoCoverIgnoreUndetected');
    const ignoreDead = !!game.settings?.get?.(MODULE_ID, 'autoCoverIgnoreDead');
    const ignoreAllies = !!game.settings?.get?.(MODULE_ID, 'autoCoverIgnoreAllies');
    const allowProneBlockers = !!game.settings?.get?.(MODULE_ID, 'autoCoverAllowProneBlockers');

    return {
      ignoreUndetected,
      ignoreDead,
      ignoreAllies,
      allowProneBlockers,
      attackerAlliance: attacker?.actor?.alliance,
    };
  }

  /**
   * Check if a wall blocks sight from a given direction based on its sight settings
   * A wall blocks only if BOTH door state AND direction allow blocking, then applies cover overrides only when wall would naturally block
   * @param {Object} wallDoc - Wall document
   * @param {Object} attackerPos - Attacker position {x, y}
   * @returns {boolean} True if wall blocks sight from attacker position
   * @private
   */
  _doesWallBlockFromDirection(wallDoc, attackerPos) {
    try {
      // If wall doesn't block sight at all, it doesn't provide cover
      if (wallDoc.sight === 0) return false; // NONE

      // Check if this is a door and if it's open
      const isDoor = Number(wallDoc.door) > 0; // 0 none, 1 door, 2 secret (treat as door-like)
      const doorState = Number(wallDoc.ds ?? wallDoc.doorState ?? 0); // 0 closed/secret, 1 open, 2 locked

      // First check: Does the door state allow blocking?
      let doorAllowsBlocking = true;
      if (isDoor && doorState === 1) {
        doorAllowsBlocking = false; // Open doors don't block
      }

      // Second check: Does the directional logic allow blocking from this direction?
      let directionAllowsBlocking = true;
      if (wallDoc.dir != null && typeof wallDoc.dir === 'number') {
        // Foundry wall direction constants:
        // BOTH: 0 - wall blocks from both directions
        // LEFT: 1 - wall blocks only when ray strikes its left side
        // RIGHT: 2 - wall blocks only when a ray strikes its right side

        if (wallDoc.dir === 0) {
          directionAllowsBlocking = true; // BOTH - blocks from both directions
        } else {
          // Get wall coordinates
          const [x1, y1, x2, y2] = Array.isArray(wallDoc.c)
            ? wallDoc.c
            : [wallDoc.x, wallDoc.y, wallDoc.x2, wallDoc.y2];

          // Calculate wall direction vector
          const wallDx = x2 - x1;
          const wallDy = y2 - y1;

          // Calculate vector from wall start to attacker
          const attackerDx = attackerPos.x - x1;
          const attackerDy = attackerPos.y - y1;

          // Use cross product to determine which side of the wall the attacker is on
          // Positive cross product means attacker is on the "left" side of the wall (as drawn)
          // Negative cross product means attacker is on the "right" side of the wall
          const crossProduct = wallDx * attackerDy - wallDy * attackerDx;

          // Apply the actual wall direction logic
          if (wallDoc.dir === 1) {
            // LEFT - wall blocks only when ray strikes left side
            directionAllowsBlocking = crossProduct < 0; // Attacker on left side = wall blocks
          } else if (wallDoc.dir === 2) {
            // RIGHT - wall blocks only when ray strikes right side
            directionAllowsBlocking = crossProduct > 0; // Attacker on right side = wall blocks
          }
        }
      }

      // Wall blocks only if BOTH door state and direction allow it
      const wouldNaturallyBlock = doorAllowsBlocking && directionAllowsBlocking;

      // Now check for manual cover override - but only apply it if the wall would naturally block from this direction
      const coverOverride = wallDoc.getFlag?.(MODULE_ID, 'coverOverride');
      if (coverOverride && coverOverride !== 'auto') {
        // Only apply override if the wall would naturally block from this direction
        if (wouldNaturallyBlock) {
          // If override is 'none', don't block despite natural blocking
          if (coverOverride === 'none') return false;
          // For any other override (lesser, standard, greater), the wall blocks
          return true;
        }
        // If wall wouldn't naturally block, ignore the override
        return false;
      }

      // Return the natural blocking behavior
      return wouldNaturallyBlock;
    } catch (error) {
      console.warn('PF2E Visioner | Error checking wall direction:', error);
      return true; // Default to blocking if we can't determine
    }
  }

  /**
   * Evaluate walls cover using center-to-center segment analysis
   * @param {Object} p1 - Attacker center point
   * @param {Object} p2 - Target center point
   * @returns {string} Cover category ('none', 'lesser', 'standard', 'greater')
   * @private
   */
  _evaluateWallsCover(p1, p2) {
    if (!canvas?.walls) return 'none';

    // First check for manual wall cover overrides
    const wallOverride = this._checkWallCoverOverrides(p1, p2);
    if (wallOverride === 'none') {
      return 'none';
    }

    // Analyze the center-to-center segment
    const segmentAnalysis = this._analyzeSegmentObstructions(p1, p2);

    // Determine cover category based on new rules
    let coverCategory = 'none';

    // Rule 1: No obstructions
    if (!segmentAnalysis.hasBlockingTerrain && !segmentAnalysis.hasCreatures) {
      coverCategory = 'none';
    }
    // Rule 2: Creature space only, no blocking terrain
    else if (!segmentAnalysis.hasBlockingTerrain && segmentAnalysis.hasCreatures) {
      coverCategory = 'lesser';
    }
    // Rule 3: Any blocking terrain
    else if (segmentAnalysis.hasBlockingTerrain) {
      // Calculate wall coverage percentage using existing method
      const target = this._findNearestTokenToPoint(p2);
      let wallCoveragePercent = 0;

      if (target) {
        wallCoveragePercent = this._estimateWallCoveragePercent(p1, target);
      }

      // Get threshold settings
      const stdThreshold = Math.max(
        0,
        Number(game.settings.get('pf2e-visioner', 'wallCoverStandardThreshold') ?? 50),
      );
      const grtThreshold = Math.max(
        0,
        Number(game.settings.get('pf2e-visioner', 'wallCoverGreaterThreshold') ?? 70),
      );
      const allowGreater = !!game.settings.get('pf2e-visioner', 'wallCoverAllowGreater');

      // Determine cover level based on coverage percentage
      if (allowGreater && wallCoveragePercent >= grtThreshold) {
        coverCategory = 'greater';
      } else if (wallCoveragePercent >= stdThreshold) {
        coverCategory = 'standard';
      } else {
        // Fallback for cases where coverage calculation fails but walls are detected
        coverCategory = 'standard';
      }
    }

    // Apply wall override as ceiling if present
    if (wallOverride !== null) {
      const coverOrder = ['none', 'lesser', 'standard', 'greater'];
      const calculatedIndex = coverOrder.indexOf(coverCategory);
      const overrideIndex = coverOrder.indexOf(wallOverride);

      // Return the lower of the two (override acts as ceiling)
      return calculatedIndex <= overrideIndex ? coverCategory : wallOverride;
    }

    return coverCategory;
  }

  /**
   * Analyze what obstructions the center-to-center segment passes through
   * @param {Object} p1 - Start point (attacker center)
   * @param {Object} p2 - End point (target center)
   * @returns {Object} Analysis object with obstruction details
   * @private
   */
  _analyzeSegmentObstructions(p1, p2) {
    const segmentLength = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);

    const analysis = {
      hasBlockingTerrain: false,
      hasCreatures: false,
      blockingWalls: [],
      intersectingCreatures: [],
      totalBlockedLength: 0,
      segmentLength: segmentLength,
    };

    // Check for blocking walls/terrain
    const walls = canvas?.walls?.objects?.children || [];
    for (const wall of walls) {
      const wallDoc = wall.document || wall;

      // Skip walls that don't block from the attacker's direction
      if (!this._doesWallBlockFromDirection(wallDoc, p1)) continue;

      const coords = wall?.coords;
      if (!coords) continue;

      // Check if segment intersects this wall
      const intersection = this._lineIntersectionPoint(
        p1.x,
        p1.y,
        p2.x,
        p2.y,
        coords[0],
        coords[1],
        coords[2],
        coords[3],
      );

      if (intersection) {
        analysis.hasBlockingTerrain = true;
        analysis.blockingWalls.push({
          wall: wallDoc,
          intersection: intersection,
          coords: coords,
        });
      }
    }

    // Check for creatures along the segment
    const tokens = canvas?.tokens?.placeables || [];
    for (const token of tokens) {
      if (!token?.actor) continue;

      // Skip the attacker and target themselves
      if (this._isPointNearToken(p1, token) || this._isPointNearToken(p2, token)) continue;

      const tokenRect = getTokenRect(token);
      const intersectionLength = segmentRectIntersectionLength(p1, p2, tokenRect);

      if (intersectionLength > 0) {
        analysis.hasCreatures = true;
        analysis.intersectingCreatures.push({
          token: token,
          intersectionLength: intersectionLength,
        });
        analysis.totalBlockedLength += intersectionLength;
      }
    }

    // Calculate total blocked length from walls
    // For walls crossing the segment, estimate the blocked portion based on wall pattern density
    if (analysis.blockingWalls.length > 0) {
      // If there are multiple walls or walls seem to form a substantial barrier,
      // we'll let the substantial obstruction logic handle this
      // For now, just track that walls exist
    }

    return analysis;
  }

  /**
   * Check if a point is near a token's center (within token bounds)
   * @param {Object} point - Point to check
   * @param {Object} token - Token to check against
   * @returns {boolean} True if point is within token bounds
   * @private
   */
  _isPointNearToken(point, token) {
    try {
      const tokenRect = getTokenRect(token);
      return (
        point.x >= tokenRect.x1 &&
        point.x <= tokenRect.x2 &&
        point.y >= tokenRect.y1 &&
        point.y <= tokenRect.y2
      );
    } catch {
      return false;
    }
  }

  /**
   * Check for manual wall cover overrides along the line of sight
   * @param {Object} p1 - Start point
   * @param {Object} p2 - End point
   * @returns {string|null} Cover override ('none', 'lesser', 'standard', 'greater') or null if no override
   * @private
   */
  _checkWallCoverOverrides(p1, p2) {
    try {
      const ray = this._createRay(p1, p2);
      const walls = canvas.walls.objects?.children || [];

      let highestCover = 'none';
      const coverOrder = ['none', 'lesser', 'standard', 'greater'];

      for (const wall of walls) {
        const wallDoc = wall.document || wall;
        const coverOverride = wallDoc.getFlag?.(MODULE_ID, 'coverOverride');

        // Skip walls without cover override
        if (!coverOverride) continue;

        // Check if this wall blocks from the attacker's direction
        if (!this._doesWallBlockFromDirection(wallDoc, p1)) continue;

        // Check if this wall intersects the ray
        const coords = wall?.coords;
        if (!coords) continue;

        const intersection = this._lineIntersectionPoint(
          ray.A.x,
          ray.A.y,
          ray.B.x,
          ray.B.y,
          coords[0],
          coords[1],
          coords[2],
          coords[3],
        );

        if (intersection) {
          // This wall intersects the line of sight and has a cover override
          const coverIndex = coverOrder.indexOf(coverOverride);
          const currentIndex = coverOrder.indexOf(highestCover);

          if (coverIndex > currentIndex) {
            highestCover = coverOverride;
          }
        }
      }

      // Return the highest cover found, or null if no overrides were found
      // If highestCover is still 'none' (initial value), no overrides were found -> return null (auto-detection)
      // If highestCover is 'none' from an actual override -> return 'none' (force no cover)
      // Otherwise return the override value

      let foundAnyOverride = false;
      for (const wall of walls) {
        const wallDoc = wall.document || wall;
        const coverOverride = wallDoc.getFlag?.(MODULE_ID, 'coverOverride');
        if (coverOverride) {
          // Check if this wall blocks from the attacker's direction
          if (!this._doesWallBlockFromDirection(wallDoc, p1)) continue;

          const coords = wall?.coords;
          if (coords) {
            const intersection = this._lineIntersectionPoint(
              ray.A.x,
              ray.A.y,
              ray.B.x,
              ray.B.y,
              coords[0],
              coords[1],
              coords[2],
              coords[3],
            );
            if (intersection) {
              foundAnyOverride = true;
              break;
            }
          }
        }
      }

      return foundAnyOverride ? highestCover : null;
    } catch {
      return null;
    }
  }

  /**
   * Find nearest token to a point (screen coords). Best-effort helper for wall coverage.
   */
  _findNearestTokenToPoint(p) {
    try {
      const tokens = canvas?.tokens?.placeables || [];
      let best = null;
      let bestD = Infinity;
      for (const t of tokens) {
        const c = t.center ?? t.getCenter?.();
        if (!c) continue;
        const dx = c.x - p.x;
        const dy = c.y - p.y;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = t;
        }
      }
      return best;
    } catch {
      return null;
    }
  }

  /**
   * Estimate percent of the target token's edge directions that are blocked by walls from origin p1.
   * Samples multiple points along the target perimeter and casts rays to each, counting wall collisions.
   * Uses a more accurate D&D/PF2e style approach based on corner-to-corner line blocking.
   */
  _estimateWallCoveragePercent(p1, target) {
    try {
      const rect = getTokenRect(target);

      // Sample points around the target's perimeter more densely for accuracy
      const points = [];
      const samplePerEdge = 5; // Increased sampling for better accuracy

      // Helper to interpolate points along an edge
      const pushLerp = (ax, ay, bx, by) => {
        for (let i = 0; i <= samplePerEdge; i++) {
          const t = i / samplePerEdge;
          points.push({ x: ax + (bx - ax) * t, y: ay + (by - ay) * t });
        }
      };

      // Add the four corners explicitly (most important for D&D/PF2e rules)
      points.push({ x: rect.x1, y: rect.y1 }); // Top-left corner
      points.push({ x: rect.x2, y: rect.y1 }); // Top-right corner
      points.push({ x: rect.x2, y: rect.y2 }); // Bottom-right corner
      points.push({ x: rect.x1, y: rect.y2 }); // Bottom-left corner

      // Add center point for additional context
      const targetCenter = { x: (rect.x1 + rect.x2) / 2, y: (rect.y1 + rect.y2) / 2 };
      points.push(targetCenter);

      // Sample edges: top, right, bottom, left
      pushLerp(rect.x1, rect.y1, rect.x2, rect.y1); // Top edge
      pushLerp(rect.x2, rect.y1, rect.x2, rect.y2); // Right edge
      pushLerp(rect.x2, rect.y2, rect.x1, rect.y2); // Bottom edge
      pushLerp(rect.x1, rect.y2, rect.x1, rect.y1); // Left edge

      // Count blocked sight lines
      let blocked = 0;
      for (const pt of points) {
        if (this._isRayBlockedByWalls(p1, pt)) blocked++;
      }

      // Calculate raw percentage
      const rawPct = (blocked / Math.max(1, points.length)) * 100;

      // Remove the arbitrary center weight reduction - let the actual blockage speak for itself
      // This provides more intuitive and predictable cover calculations
      return rawPct;
    } catch {
      return 0;
    }
  }

  /**
   * Check if a ray from point A to point B is blocked by walls
   * Only counts walls that are actually between the points, not beyond point B
   * @param {Object} a - Start point {x, y}
   * @param {Object} b - End point {x, y}
   * @returns {boolean} True if ray is blocked by walls
   * @private
   */
  _isRayBlockedByWalls(a, b) {
    const ray = this._createRay(a, b);
    const rayLength = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);

    // Check if there are any walls at all
    const totalWalls = canvas?.walls?.objects?.children?.length || 0;
    if (totalWalls === 0) {
      return false;
    }

    // Use our custom directional wall logic for accurate results
    const walls = canvas.walls.objects?.children || [];
    for (const wall of walls) {
      const c = wall?.coords;
      if (!c) continue;

      // Check wall type and direction - walls that block sight should provide cover
      const wallDoc = wall.document || wall;

      // Skip walls that don't block sight from this direction
      if (!this._doesWallBlockFromDirection(wallDoc, a)) continue;

      // Check if the ray intersects this wall
      const intersection = this._lineIntersectionPoint(
        ray.A.x,
        ray.A.y,
        ray.B.x,
        ray.B.y,
        c[0],
        c[1],
        c[2],
        c[3],
      );
      if (intersection) {
        const intersectionDist = Math.sqrt(
          (intersection.x - a.x) ** 2 + (intersection.y - a.y) ** 2,
        );
        if (intersectionDist < rayLength - 1) {
          // 1 pixel tolerance
          return true;
        }
      }
    }

    // No walls blocked this ray
    return false;
  }

  /**
   * Filter blockers by elevation - check if blocker can intersect the 3D line of sight
   * @param {Object} attacker - Attacker token
   * @param {Object} target - Target token
   * @param {Array} blockers - Array of potential blocking tokens
   * @param {string} mode - Intersection mode to determine elevation calculation method
   * @returns {Array} Filtered array of blockers that can actually block the line of sight
   * @private
   */
  _filterBlockersByElevation(attacker, target, blockers, mode = 'any') {
    try {
      const attSpan = getTokenVerticalSpanFt(attacker);
      const tgtSpan = getTokenVerticalSpanFt(target);

      if (mode === 'tactical') {
        // Tactical mode: use corner-to-corner elevation calculations
        return this._filterBlockersByElevationTactical(
          attacker,
          target,
          blockers,
          attSpan,
          tgtSpan,
        );
      } else if (mode === 'any' || mode === 'length10') {
        // Any/10% modes: use permissive elevation filtering (horizontal intersection focus)
        return this._filterBlockersByElevationPermissive(
          attacker,
          target,
          blockers,
          attSpan,
          tgtSpan,
        );
      } else if (mode === 'coverage') {
        // Coverage mode: use moderate elevation filtering
        return this._filterBlockersByElevationModerate(
          attacker,
          target,
          blockers,
          attSpan,
          tgtSpan,
        );
      } else {
        // Default: use center-to-center elevation calculations
        return this._filterBlockersByElevationCenterToCenter(
          attacker,
          target,
          blockers,
          attSpan,
          tgtSpan,
        );
      }
    } catch {
      // If elevation filtering fails, return all blockers
      return blockers;
    }
  }

  /**
   * Filter blockers by elevation using center-to-center line of sight
   * @param {Object} attacker - Attacker token
   * @param {Object} target - Target token
   * @param {Array} blockers - Array of potential blocking tokens
   * @param {Object} attSpan - Attacker vertical span
   * @param {Object} tgtSpan - Target vertical span
   * @returns {Array} Filtered array of blockers
   * @private
   */
  _filterBlockersByElevationCenterToCenter(attacker, target, blockers, attSpan, tgtSpan) {
    // Get horizontal positions
    const attPos = attacker.center ?? attacker.getCenter();
    const tgtPos = target.center ?? target.getCenter();

    return blockers.filter((blocker) => {
      try {
        const blockerSpan = getTokenVerticalSpanFt(blocker);
        const blockerPos = blocker.center ?? blocker.getCenter();

        // Check if blocker is horizontally between attacker and target
        // If not, it can't block regardless of elevation
        if (!this._isHorizontallyBetween(attPos, tgtPos, blockerPos)) {
          return false;
        }

        // Calculate the elevation of the line of sight at the blocker's horizontal position
        const lineOfSightElevationAtBlocker = this._calculateLineOfSightElevationAt(
          attPos,
          attSpan,
          tgtPos,
          tgtSpan,
          blockerPos,
        );

        // Check if the blocker's vertical span intersects with the line of sight elevation range
        return this._verticalSpansIntersect(blockerSpan, lineOfSightElevationAtBlocker);
      } catch {
        // If we can't determine elevation, include the blocker to be safe
        return true;
      }
    });
  }

  /**
   * Filter blockers by elevation using permissive logic (any/10% modes)
   * These modes focus on horizontal intersection, so we're more lenient with elevation
   * @param {Object} attacker - Attacker token
   * @param {Object} target - Target token
   * @param {Array} blockers - Array of potential blocking tokens
   * @param {Object} attSpan - Attacker vertical span
   * @param {Object} tgtSpan - Target vertical span
   * @returns {Array} Filtered array of blockers
   * @private
   */
  _filterBlockersByElevationPermissive(attacker, target, blockers, attSpan, tgtSpan) {
    // Get horizontal positions
    const attPos = attacker.center ?? attacker.getCenter();
    const tgtPos = target.center ?? target.getCenter();

    return blockers.filter((blocker) => {
      try {
        const blockerSpan = getTokenVerticalSpanFt(blocker);
        const blockerPos = blocker.center ?? blocker.getCenter();

        // Check if blocker is horizontally between attacker and target
        if (!this._isHorizontallyBetween(attPos, tgtPos, blockerPos)) {
          return false;
        }

        // For any/10% modes, we use a very permissive elevation check
        // These modes focus on horizontal intersection, so we're very lenient with elevation
        // Only filter out blockers that are completely above or below all possible sight lines

        // Calculate the interpolation factor (how far along the line the blocker is)
        const totalDist = Math.sqrt((tgtPos.x - attPos.x) ** 2 + (tgtPos.y - attPos.y) ** 2);
        const blockerDist = Math.sqrt(
          (blockerPos.x - attPos.x) ** 2 + (blockerPos.y - attPos.y) ** 2,
        );
        const t = totalDist > 0 ? blockerDist / totalDist : 0;

        // Calculate the range of all possible sight lines at the blocker position
        const highestSightLine = attSpan.top + t * (tgtSpan.top - attSpan.top);
        const lowestSightLine = attSpan.bottom + t * (tgtSpan.bottom - attSpan.bottom);
        const sightLineRange = {
          bottom: Math.min(highestSightLine, lowestSightLine),
          top: Math.max(highestSightLine, lowestSightLine),
        };

        // Very permissive check: blocker provides cover if it has ANY overlap with the sight line range
        return blockerSpan.bottom < sightLineRange.top && blockerSpan.top > sightLineRange.bottom;
      } catch {
        // If we can't determine elevation, include the blocker to be safe
        return true;
      }
    });
  }

  /**
   * Filter blockers by elevation using moderate logic (coverage mode)
   * Coverage mode uses a balanced approach between strict and permissive
   * @param {Object} attacker - Attacker token
   * @param {Object} target - Target token
   * @param {Array} blockers - Array of potential blocking tokens
   * @param {Object} attSpan - Attacker vertical span
   * @param {Object} tgtSpan - Target vertical span
   * @returns {Array} Filtered array of blockers
   * @private
   */
  _filterBlockersByElevationModerate(attacker, target, blockers, attSpan, tgtSpan) {
    // Get horizontal positions
    const attPos = attacker.center ?? attacker.getCenter();
    const tgtPos = target.center ?? target.getCenter();

    return blockers.filter((blocker) => {
      try {
        const blockerSpan = getTokenVerticalSpanFt(blocker);
        const blockerPos = blocker.center ?? blocker.getCenter();

        // Check if blocker is horizontally between attacker and target
        if (!this._isHorizontallyBetween(attPos, tgtPos, blockerPos)) {
          return false;
        }

        // For coverage mode, use center-to-center line but with more tolerance
        const lineOfSightElevationAtBlocker = this._calculateLineOfSightElevationAt(
          attPos,
          attSpan,
          tgtPos,
          tgtSpan,
          blockerPos,
        );

        // Use a larger tolerance for coverage mode (3ft instead of exact)
        const tolerance = 3; // 3 feet tolerance
        const adjustedRange = {
          bottom: lineOfSightElevationAtBlocker.bottom - tolerance,
          top: lineOfSightElevationAtBlocker.top + tolerance,
        };

        // Check if the blocker's vertical span intersects with the adjusted line of sight range
        return blockerSpan.bottom < adjustedRange.top && blockerSpan.top > adjustedRange.bottom;
      } catch {
        // If we can't determine elevation, include the blocker to be safe
        return true;
      }
    });
  }

  /**
   * Filter blockers by elevation using corner-to-corner line of sight (tactical mode)
   * @param {Object} attacker - Attacker token
   * @param {Object} target - Target token
   * @param {Array} blockers - Array of potential blocking tokens
   * @param {Object} attSpan - Attacker vertical span
   * @param {Object} tgtSpan - Target vertical span
   * @returns {Array} Filtered array of blockers
   * @private
   */
  _filterBlockersByElevationTactical(attacker, target, blockers, attSpan, tgtSpan) {
    // Get token rectangles and corners
    const attackerRect = getTokenRect(attacker);
    const targetRect = getTokenRect(target);
    const attackerSizeValue = attacker?.actor?.system?.traits?.size?.value ?? 'med';
    const targetSizeValue = target?.actor?.system?.traits?.size?.value ?? 'med';
    const attackerCorners = getTokenCorners(attacker, attackerRect, attackerSizeValue);
    const targetCorners = getTokenCorners(target, targetRect, targetSizeValue);

    return blockers.filter((blocker) => {
      try {
        const blockerSpan = getTokenVerticalSpanFt(blocker);
        const blockerPos = blocker.center ?? blocker.getCenter();

        // Check if any corner-to-corner line could potentially intersect this blocker
        for (const attackerCorner of attackerCorners) {
          for (const targetCorner of targetCorners) {
            // Check if blocker is horizontally between these corners
            if (!this._isHorizontallyBetween(attackerCorner, targetCorner, blockerPos)) {
              continue;
            }

            // Calculate elevation of this corner-to-corner line at blocker position
            const lineOfSightElevation = this._calculateCornerToCornerElevationAt(
              attackerCorner,
              attSpan,
              targetCorner,
              tgtSpan,
              blockerPos,
            );

            // If this line intersects the blocker, include the blocker
            if (this._verticalSpansIntersect(blockerSpan, lineOfSightElevation)) {
              return true;
            }
          }
        }

        // No corner-to-corner line intersects this blocker
        return false;
      } catch {
        // If we can't determine elevation, include the blocker to be safe
        return true;
      }
    });
  }

  /**
   * Check if a point is horizontally between two other points (roughly on the line)
   * @param {Object} p1 - First point {x, y}
   * @param {Object} p2 - Second point {x, y}
   * @param {Object} test - Test point {x, y}
   * @returns {boolean} True if test point is roughly between p1 and p2
   * @private
   */
  _isHorizontallyBetween(p1, p2, test) {
    // Use a simple distance check - if the sum of distances from test to p1 and p2
    // is approximately equal to the distance from p1 to p2, then test is on the line
    const d1 = Math.sqrt((test.x - p1.x) ** 2 + (test.y - p1.y) ** 2);
    const d2 = Math.sqrt((test.x - p2.x) ** 2 + (test.y - p2.y) ** 2);
    const total = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);

    // Allow some tolerance for floating point precision and token size
    const tolerance = Math.max(50, total * 0.1); // 50 pixels or 10% of line length
    return Math.abs(d1 + d2 - total) <= tolerance;
  }

  /**
   * Calculate the elevation of a corner-to-corner line of sight at a specific horizontal position
   * @param {Object} attackerCorner - Attacker corner position {x, y}
   * @param {Object} attSpan - Attacker vertical span {bottom, top}
   * @param {Object} targetCorner - Target corner position {x, y}
   * @param {Object} tgtSpan - Target vertical span {bottom, top}
   * @param {Object} blockerPos - Blocker position {x, y}
   * @returns {Object} Elevation range {bottom, top} at the blocker position
   * @private
   */
  _calculateCornerToCornerElevationAt(attackerCorner, attSpan, targetCorner, tgtSpan, blockerPos) {
    // Calculate the interpolation factor (how far along the line the blocker is)
    const totalDist = Math.sqrt(
      (targetCorner.x - attackerCorner.x) ** 2 + (targetCorner.y - attackerCorner.y) ** 2,
    );
    const blockerDist = Math.sqrt(
      (blockerPos.x - attackerCorner.x) ** 2 + (blockerPos.y - attackerCorner.y) ** 2,
    );
    const t = totalDist > 0 ? blockerDist / totalDist : 0;

    // For corner-to-corner, we use the center elevations of the tokens
    // (corners are horizontal positions, but elevation is still based on token center)
    const attackerCenterElevation = (attSpan.bottom + attSpan.top) / 2;
    const targetCenterElevation = (tgtSpan.bottom + tgtSpan.top) / 2;

    // Interpolate the corner-to-corner line of sight elevation at the blocker position
    const lineOfSightElevation =
      attackerCenterElevation + t * (targetCenterElevation - attackerCenterElevation);

    // Small tolerance for practical implementation
    const tolerance = 1; // 1 foot tolerance

    return {
      bottom: lineOfSightElevation - tolerance,
      top: lineOfSightElevation + tolerance,
    };
  }

  /**
   * Calculate the elevation of the center-to-center line of sight at a specific horizontal position
   * PF2E uses center-to-center line of sight for cover calculations
   * @param {Object} attPos - Attacker position {x, y}
   * @param {Object} attSpan - Attacker vertical span {bottom, top}
   * @param {Object} tgtPos - Target position {x, y}
   * @param {Object} tgtSpan - Target vertical span {bottom, top}
   * @param {Object} blockerPos - Blocker position {x, y}
   * @returns {Object} Elevation range {bottom, top} at the blocker position
   * @private
   */
  _calculateLineOfSightElevationAt(attPos, attSpan, tgtPos, tgtSpan, blockerPos) {
    // Calculate the interpolation factor (how far along the line the blocker is)
    const totalDist = Math.sqrt((tgtPos.x - attPos.x) ** 2 + (tgtPos.y - attPos.y) ** 2);
    const blockerDist = Math.sqrt((blockerPos.x - attPos.x) ** 2 + (blockerPos.y - attPos.y) ** 2);
    const t = totalDist > 0 ? blockerDist / totalDist : 0;

    // PF2E uses center-to-center line of sight
    // Calculate the center elevations of attacker and target
    const attackerCenterElevation = (attSpan.bottom + attSpan.top) / 2;
    const targetCenterElevation = (tgtSpan.bottom + tgtSpan.top) / 2;

    // Interpolate the center-to-center line of sight elevation at the blocker position
    const lineOfSightElevation =
      attackerCenterElevation + t * (targetCenterElevation - attackerCenterElevation);

    // For cover purposes, we need to consider the blocker's height
    // A blocker provides cover if the line of sight passes through its vertical space
    // Use the blocker's height as tolerance rather than arbitrary 1ft
    return {
      bottom: lineOfSightElevation,
      top: lineOfSightElevation,
    };
  }

  /**
   * Check if a blocker can provide cover by blocking the center-to-center line of sight
   * @param {Object} blockerSpan - Blocker's vertical span {bottom, top}
   * @param {Object} lineOfSightRange - Line of sight elevation {bottom, top} (same value for center-to-center)
   * @returns {boolean} True if blocker can provide cover
   * @private
   */
  _verticalSpansIntersect(blockerSpan, lineOfSightRange) {
    // In PF2E, a blocker provides cover if the center-to-center line of sight passes through its vertical space
    // The line of sight is at a specific elevation, check if it's within the blocker's height
    const lineOfSightElevation = lineOfSightRange.bottom; // Same as .top for center-to-center
    return lineOfSightElevation >= blockerSpan.bottom && lineOfSightElevation <= blockerSpan.top;
  }

  /**
   * Get eligible blocking tokens
   * @param {Object} attacker
   * @param {Object} target
   * @param {Object} filters
   * @returns {Array}
   * @private
   */
  _getEligibleBlockingTokens(attacker, target, filters) {
    const out = [];

    for (const blocker of canvas.tokens.placeables) {
      if (!blocker?.actor) continue;
      if (blocker === attacker || blocker === target) continue;

      // Exclude controlled/selected tokens from being blockers
      if (
        canvas.tokens.controlled.includes(blocker) ||
        blocker.id === attacker.id ||
        blocker.id === target.id
      )
        continue;

      const type = blocker.actor?.type;
      if (type === 'loot' || type === 'hazard') continue;
      // Token cover overrides are handled later in _applyTokenCoverOverrides
      // Don't filter out tokens here based on cover override
      // Always ignore Foundry hidden tokens
      if (blocker.document.hidden) {
        continue;
      }

      // Check PF2e undetected tokens only if the setting is enabled
      if (filters.ignoreUndetected) {
        try {
          // Use custom visibility perspective if provided, otherwise use attacker
          const perspectiveToken = filters.visibilityPerspective || attacker;
          const vis = getVisibilityBetween(perspectiveToken, blocker);
          if (vis === 'undetected') {
            continue;
          }
        } catch { }
      }
      if (filters.ignoreDead && blocker.actor?.hitPoints?.value === 0) {
        continue;
      }
      if (!filters.allowProneBlockers) {
        try {
          const itemConditions = blocker.actor?.itemTypes?.condition || [];
          const legacyConditions =
            blocker.actor?.conditions?.conditions || blocker.actor?.conditions || [];
          const isProne =
            itemConditions.some((c) => c?.slug === 'prone') ||
            legacyConditions.some((c) => c?.slug === 'prone');
          if (isProne) {
            continue;
          }
        } catch { }
      }
      if (filters.ignoreAllies && blocker.actor?.alliance === filters.attackerAlliance) {
        continue;
      }

      // Check size-based cover rules
      if (!this._canTokenProvideCover(attacker, target, blocker)) {
        continue;
      }

      out.push(blocker);
    }

    return out;
  }

  /**
   * Check if a blocker token can provide cover based on PF2E cover rules
   * @param {Object} attacker - Attacker token
   * @param {Object} target - Target token
   * @param {Object} blocker - Potential blocker token
   * @returns {boolean} True if blocker can provide cover
   * @private
   */
  _canTokenProvideCover(attacker, target, blocker) {
    try {
      // Rule 1: Tokens in the same square as attacker or target cannot provide cover
      if (
        this._tokensInSameSquare(attacker, blocker) ||
        this._tokensInSameSquare(target, blocker)
      ) {
        return false;
      }

      // Rule 2: Get sizes for cover rules
      const targetSize = this._getTokenSizeCategory(target);
      const blockerSize = this._getTokenSizeCategory(blocker);

      // Rule 3: Tiny tokens cannot provide cover to non-tiny creatures
      if (blockerSize === 'tiny' && targetSize !== 'tiny') {
        return false;
      }

      // Rule 4: Additional size-based rules from the PF2E cover table
      // Tiny targets can only get cover from Small+ blockers (already covered by rule 3)
      // Small+ targets cannot get cover from tiny blockers (already covered by rule 3)

      return true;
    } catch {
      // If we can't determine sizes/positions, allow cover to be safe
      return true;
    }
  }

  /**
   * Check if two tokens are in the same grid square
   * @param {Object} token1 - First token
   * @param {Object} token2 - Second token
   * @returns {boolean} True if tokens occupy the same grid square
   * @private
   */
  _tokensInSameSquare(token1, token2) {
    try {
      // Get grid positions (top-left corner of tokens in grid units)
      const gridSize = canvas?.grid?.size || 50;

      const token1GridX = Math.floor(token1.document.x / gridSize);
      const token1GridY = Math.floor(token1.document.y / gridSize);
      const token2GridX = Math.floor(token2.document.x / gridSize);
      const token2GridY = Math.floor(token2.document.y / gridSize);

      // For tokens larger than 1x1, check if their grid areas overlap
      const token1Width = token1.document.width || 1;
      const token1Height = token1.document.height || 1;
      const token2Width = token2.document.width || 1;
      const token2Height = token2.document.height || 1;

      // Check for overlap in both X and Y dimensions
      const xOverlap =
        token1GridX < token2GridX + token2Width && token1GridX + token1Width > token2GridX;
      const yOverlap =
        token1GridY < token2GridY + token2Height && token1GridY + token1Height > token2GridY;

      return xOverlap && yOverlap;
    } catch {
      return false;
    }
  }

  /**
   * Get the size category of a token for cover calculations
   * @param {Object} token - Token object
   * @returns {string} Size category ('tiny', 'small', 'medium', 'large', 'huge', 'gargantuan')
   * @private
   */
  _getTokenSizeCategory(token) {
    try {
      const size = token?.actor?.system?.traits?.size?.value;
      if (!size) return 'medium'; // Default to medium if unknown

      // Normalize size values
      const sizeMap = {
        tiny: 'tiny',
        sm: 'small',
        small: 'small',
        med: 'medium',
        medium: 'medium',
        lg: 'large',
        large: 'large',
        huge: 'huge',
        grg: 'gargantuan',
        gargantuan: 'gargantuan',
      };

      return sizeMap[size] || 'medium';
    } catch {
      return 'medium';
    }
  }

  /**
   * Helper method to create a ray object
   * @param {Object} p1 - Start point {x, y}
   * @param {Object} p2 - End point {x, y}
   * @returns {Object} - A ray-like object with A, B, and distance properties
   * @private
   */
  _createRay(p1, p2) {
    // Use Foundry V13+ namespaced Ray class if available
    if (foundry?.canvas?.geometry?.Ray) {
      return new foundry.canvas.geometry.Ray(p1, p2);
    }
    // Fallback to global Ray if available (pre-V13)
    else if (typeof globalThis.Ray !== 'undefined') {
      return new globalThis.Ray(p1, p2);
    }

    // Otherwise, create a simple ray-like object
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    return {
      A: { x: p1.x, y: p1.y },
      B: { x: p2.x, y: p2.y },
      distance: distance,
    };
  }

  /**
   * Evaluate cover provided by the creature's size
   * @param {Object} attacker - Attacker token
   * @param {Object} target - Target token
   * @param {Array} blockers - Array of potential blocking tokens
   * @returns {string} Cover state ('none', 'lesser', 'standard', 'greater')
   * @private
   */
  _evaluateCreatureSizeCover(attacker, target, blockers) {
    try {
      if (!attacker || !target) return 'none';

      let any = false;
      let standard = false;
      const attackerSize = getSizeRank(attacker);
      const targetSize = getSizeRank(target);

      for (const blocker of blockers) {
        // Skip if blocker is the same as attacker or target
        if (blocker.id === attacker.id || blocker.id === target.id) continue;

        const rect = getTokenRect(blocker);

        // Create rectangle in the format expected by intersectsBetweenTokens
        const rectForIntersection = {
          x1: rect.x1,
          y1: rect.y1,
          x2: rect.x2,
          y2: rect.y2,
        };

        // Check if blocker intersects between tokens
        if (
          !intersectsBetweenTokens(
            attacker,
            target,
            rectForIntersection,
            this._getIntersectionMode(),
            blocker,
          )
        )
          continue;

        any = true;
        const blockerSize = getSizeRank(blocker);
        const sizeDiffAttacker = blockerSize - attackerSize;
        const sizeDiffTarget = blockerSize - targetSize;
        const grantsStandard = sizeDiffAttacker >= 2 && sizeDiffTarget >= 2;

        if (grantsStandard) standard = true;
      }

      const result = any ? (standard ? 'standard' : 'lesser') : 'none';

      return result;
    } catch (error) {
      console.error('PF2E Visioner | Error in evaluateCreatureSizeCover:', error);
      return 'none';
    }
  }

  // Using segmentIntersectsRect from geometry-utils.js instead of _rayIntersectRect

  /**
   * Evaluate cover by tactical rules
   * @param {Object} attacker
   * @param {Object} target
   * @param {Array} blockers
   * @returns {string}
   * @private
   */
  _evaluateCoverByTactical(attacker, target, blockers) {
    // Tactical mode: corner-to-corner calculations
    // Choose the best corner of the attacker and check lines from all target corners to that corner
    // This matches the "choose a corner" tactical rule

    const attackerRect = getTokenRect(attacker);
    const targetRect = getTokenRect(target);

    // Debug token sizes and rectangles
    const attackerSizeValue = attacker?.actor?.system?.traits?.size?.value ?? 'med';
    const targetSizeValue = target?.actor?.system?.traits?.size?.value ?? 'med';

    const attackerCorners = getTokenCorners(attacker, attackerRect, attackerSizeValue);
    const targetCorners = getTokenCorners(target, targetRect, targetSizeValue);

    let bestCover = 'greater'; // Start with worst case

    // Try each attacker corner and find the one with the least cover (best for attacking)
    for (let a = 0; a < attackerCorners.length; a++) {
      const attackerCorner = attackerCorners[a];
      let blockedLines = 0;

      // Check lines from all target corners to this attacker corner
      for (let t = 0; t < targetCorners.length; t++) {
        const targetCorner = targetCorners[t];
        let lineBlocked = false;

        // Check if this line is blocked by walls
        if (this._isRayBlockedByWalls(targetCorner, attackerCorner)) {
          lineBlocked = true;
        }

        // Check if this line is blocked by any token blockers
        if (!lineBlocked) {
          for (const blocker of blockers) {
            if (blocker === attacker || blocker === target) continue;

            const blockerRect = getTokenRect(blocker);
            const intersectionLength = segmentRectIntersectionLength(
              targetCorner,
              attackerCorner,
              blockerRect,
            );
            if (intersectionLength > 0) {
              lineBlocked = true;
              break;
            }
          }
        }

        if (lineBlocked) blockedLines++;
      }

      // Determine cover level for this attacker corner
      let coverForThisCorner;
      if (blockedLines === 0) coverForThisCorner = 'none';
      else if (blockedLines === 1) coverForThisCorner = 'lesser';
      else if (blockedLines <= 3) coverForThisCorner = 'standard';
      else coverForThisCorner = 'greater';

      // Keep the best (lowest) cover result
      const coverOrder = ['none', 'lesser', 'standard', 'greater'];
      if (coverOrder.indexOf(coverForThisCorner) < coverOrder.indexOf(bestCover)) {
        bestCover = coverForThisCorner;
      }
    }

    // Return the best (lowest) cover across attacker corners
    return bestCover;
  }

  /**
   * Evaluate cover by coverage percentage
   * @param {Object} attacker
   * @param {Object} target
   * @param {Array} blockers
   * @returns {string}
   * @private
   */
  _evaluateCoverByCoverage(attacker, target, blockers) {
    try {
      // If no blockers, no cover
      if (!blockers.length) return 'none';

      // Get centers
      const p1 = attacker.center ?? attacker.getCenter();
      const p2 = target.center ?? target.getCenter();

      // Calculate total coverage by all blockers
      let totalCoverage = 0;

      for (const blocker of blockers) {
        // Calculate coverage contribution of this blocker
        const coverage = this._calculateCoverageByBlocker(p1, p2, [blocker]);
        totalCoverage += coverage;
      }

      // Cap total coverage at 100%
      totalCoverage = Math.min(totalCoverage, 100);

      // Determine cover based on percentage
      if (totalCoverage >= 75) return 'greater';
      if (totalCoverage >= 50) return 'standard';
      if (totalCoverage >= 20) return 'lesser';
      return 'none';
    } catch (error) {
      console.error('PF2E Visioner | Error in evaluateCoverByCoverage:', error);
      return 'none';
    }
  }

  /**
   * 2D line segment intersection that returns the intersection point.
   * @param {number} x1, y1, x2, y2 - First line segment coordinates
   * @param {number} x3, y3, x4, y4 - Second line segment coordinates
   * @returns {Object|null} Intersection point {x, y} or null if no intersection
   */
  _lineIntersectionPoint(x1, y1, x2, y2, x3, y3, x4, y4) {
    const d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (d === 0) return null; // Lines are parallel

    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / d;
    const u = -(((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / d);

    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
      // Calculate intersection point
      const x = x1 + t * (x2 - x1);
      const y = y1 + t * (y2 - y1);
      return { x, y };
    }

    return null; // No intersection within segments
  }

  /**
   * Calculate coverage percentage by a single blocker
   * @param {Object} blocker - The blocker token
   * @param {Ray} ray - The ray from attacker to target
   * @param {number} rayLength - The length of the ray
   * @returns {number} - Coverage percentage (0-100)
   * @private
   */
  _calculateCoverageByBlocker(p1, p2, blockers) {
    // Fixed side coverage thresholds: Standard at 50%, Greater at 70%
    const lesserT = 50;
    const greaterT = 70;

    let sawAny = false;
    let meetsStd = false;
    let meetsGrt = false;
    for (const b of blockers) {
      const rect = getTokenRect(b);
      const len = segmentRectIntersectionLength(p1, p2, rect);
      if (len <= 0) continue;
      sawAny = true;
      const width = Math.abs(rect.x2 - rect.x1);
      const height = Math.abs(rect.y2 - rect.y1);
      const side = Math.max(width, height); // larger side in pixels
      const f = (len / Math.max(1, side)) * 100; // percent side coverage
      if (f >= greaterT) {
        meetsGrt = true;
        break;
      }
      if (f >= lesserT) {
        meetsStd = true;
      }
    }

    const result = meetsGrt ? 'greater' : meetsStd ? 'standard' : sawAny ? 'lesser' : 'none';
    return result;
  }

  /**
   * Apply token cover overrides as direct replacements to the calculated cover
   * @param {Object} attacker - Attacking token
   * @param {Object} target - Target token
   * @param {Array} blockers - Array of blocking tokens
   * @param {string} calculatedCover - The cover calculated by normal rules
   * @returns {string} Final cover after applying overrides
   * @private
   */
  _applyTokenCoverOverrides(attacker, target, blockers, calculatedCover) {
    try {
      if (!blockers.length) {
        return calculatedCover;
      }

      // Check each blocker for cover overrides
      for (const blocker of blockers) {
        const tokenCoverOverride = blocker.document?.getFlag?.(MODULE_ID, 'coverOverride');

        // If this token has an override, return it directly
        if (tokenCoverOverride && tokenCoverOverride !== 'auto') {
          return tokenCoverOverride;
        }
      }

      // No overrides found, use calculated cover
      return calculatedCover;
    } catch {
      return calculatedCover;
    }
  }
}

const coverDetector = new CoverDetector();
export default coverDetector;
