import { MODULE_ID } from '../../../constants.js';

/**
 * LightingRasterService
 * Fast, approximate darkness sampling along a ray using LightingCalculator.
 * Avoids iterating light shapes and complex geometry in hot paths.
 */
export class LightingRasterService {
  constructor() {
    this._lightingCalculator = null;
  }

  async _ensureCalculator() {
    if (this._lightingCalculator) return this._lightingCalculator;
    const { LightingCalculator } = await import('../LightingCalculator.js');
    this._lightingCalculator = LightingCalculator.getInstance?.();
    return this._lightingCalculator;
  }

  /**
   * Sample along the ray between observer and target and report darkness presence and max rank.
   * @param {Token} observer
   * @param {Token} target
   * @param {{x:number,y:number,elevation?:number}} observerPos
   * @param {{x:number,y:number,elevation?:number}} targetPos
   * @returns {Promise<{passesThroughDarkness:boolean, maxDarknessRank:number}>}
   */
  async getRayDarknessInfo(observer, target, observerPos, targetPos) {
    const darknessSources = canvas.effects?.darknessSources || [];
    if (darknessSources.length === 0) {
      return { passesThroughDarkness: false, maxDarknessRank: 0 };
    }

    // Get the vector from observer to target and its squared length. This will be one of the sides
    // of our right triangle, which we'll name 'a'
    const aX = targetPos.x - observerPos.x;
    const aY = targetPos.y - observerPos.y;
    const aDot = aX * aX + aY * aY;
    const aLen = Math.sqrt(aDot);

    // Figure out the target's radius in pixels
    const gridSize = canvas.grid?.size || 100;
    const tokenWidth = (target?.document?.width ?? target?.width ?? 1) * gridSize;
    const tokenHeight = (target?.document?.height ?? target?.height ?? 1) * gridSize;
    // Use native Foundry external radius property with fallback
    const targetRadius = target?.externalRadius ?? Math.max(tokenWidth, tokenHeight) / 2;

    // If the two tokens are overlapping, we can't possibly pass through darkness
    if (aLen <= targetRadius) {
      return { passesThroughDarkness: false, maxDarknessRank: 0 };
    }

    // Angle from target center to observer center
    const angleToP = Math.atan2(-aY, -aX);

    // Angle between center-external and tangent line
    const theta = Math.acos(targetRadius / aLen);

    // Two tangent points
    const angles = [angleToP + theta, angleToP - theta];
    const tangentPoints = angles.map((a) => ({
      x: targetPos.x + targetRadius * Math.cos(a),
      y: targetPos.y + targetRadius * Math.sin(a),
    }));

    // Process all non-hidden darkness sources
    let maxDarknessResult = null;
    for (const light of darknessSources) {
      // Use native Foundry light visibility check with fallback for tests
      if (!(light.isVisible !== false || light.active !== false)) continue;

      // Make sure the ray intersects the light's radius before doing more complex math
      //
      // Get the vector from observer to light source and its squared length. This will be the hypotenuse
      // of our right triangle, which we'll name 'h'
      // Use native Foundry light center position with fallback for tests
      const lightCenter = light.center || { x: light.x || 0, y: light.y || 0 };
      const hX = lightCenter.x - observerPos.x;
      const hY = lightCenter.y - observerPos.y;
      const hDot = hX * hX + hY * hY;

      // Get the squared radius of the darkness area
      // Use native Foundry light radius properties with fallback for tests
      const radius = Math.max(
        light.brightRadius || light.data?.bright || 0,
        light.dimRadius || light.data?.dim || 0
      );
      const radiusDot = radius * radius;

      // Now project h onto a to get the length of the adjacent side of our triangle, which tells us
      // how far along a the perpendicular from the observer to light falls. Since a isn't normalized, we'll
      // keep in mind that p is scaled by |a|.
      let p = hX * aX + hY * aY;

      // If p is negative, the perpendicular falls "before" the observer, so the observer is the point
      // of closest approach and we just need to test h against radius
      if (p <= 0) {
        if (hDot > radiusDot) continue;
      }

      // If p is greater than |a|^2, the perpendicular falls "beyond" the target, so the target is the point
      // we need to check against radius
      else if (p >= aDot) {
        // Use native Foundry light center position with fallback for tests
        const lightCenter = light.center || { x: light.x || 0, y: light.y || 0 };
        const tX = lightCenter.x - targetPos.x;
        const tY = lightCenter.y - targetPos.y;
        const tDot = tX * tX + tY * tY;
        if (tDot > radiusDot) continue;
      }

      // By right triangle properties, the length of the perpindicular side squared is h^2 - (p/|a|)^2
      else {
        p /= aLen; // p is now the true length of the adjacent side
        if (hDot - p * p > radiusDot) continue;
      }

      // We are close enough to the light to possibly be affected, but before we check the shape, we will
      // use the tangent point on the opposite side of the light from the original ray. This will handle
      // most cases where we get false positives due to the center ray passing just inside the darkness
      // while a portion of the target is still visible outside.
      const lightCross = hX * aY - hY * aX;
      let tangentPoint = tangentPoints[0];
      const crossProduct =
        (tangentPoint.x - observerPos.x) * aY - (tangentPoint.y - observerPos.y) * aX;
      if (crossProduct * lightCross > 0) tangentPoint = tangentPoints[1];

      // Test the ray against the light's edges, any intersection means the ray passes through darkness
      const points = light?.shape?.points ?? [];
      let intersects = false;
      for (let i = 0; i < points.length; i += 2) {
        const a = { x: points[i], y: points[i + 1] };
        const b = { x: points[(i + 2) % points.length], y: points[(i + 3) % points.length] };
        if (foundry.utils.lineSegmentIntersects(observerPos, tangentPoint, a, b)) {
          intersects = true;
          break;
        }
      }
      if (!intersects) continue;

      //
      // Read heightened darkness rank from our module flag if present
      let darknessRank = 0;
      const initialFlagValue = light.document?.getFlag?.(MODULE_ID, 'darknessRank');
      if (initialFlagValue === '') {
        darknessRank = 3; // Empty string = rank 3 darkness
      } else if (initialFlagValue && !isNaN(Number(initialFlagValue))) {
        darknessRank = Number(initialFlagValue);
      }

      // If no document but has sourceId, try to find the source document and read its flags
      if (darknessRank === 0 && !light.document && light.sourceId) {
        try {
          // sourceId format is usually "DocumentType.documentId"
          const [docType, docId] = light.sourceId.split('.');
          if (docType === 'AmbientLight' && docId) {
            const sourceDocument = canvas.scene.lights.get(docId);
            if (sourceDocument) {
              const sourceFlagValue = sourceDocument.getFlag?.(MODULE_ID, 'darknessRank');
              if (sourceFlagValue === '') {
                darknessRank = 3; // Empty string = rank 3 darkness
              } else if (sourceFlagValue && !isNaN(Number(sourceFlagValue))) {
                darknessRank = Number(sourceFlagValue);
              }
            }
          }
        } catch (error) {
          console.error('🌑 RASTER: Error parsing sourceId:', error.message);
        }
      }

      // Try alternative method if we still have no rank
      if (darknessRank === 0 && light.sourceId) {
        try {
          const [docType, docId] = light.sourceId.split('.');
          if (docType === 'AmbientLight' && docId) {
            const sourceDocument = canvas.scene.lights.get(docId);
            if (sourceDocument) {
              if (sourceDocument.flags && sourceDocument.flags[MODULE_ID]) {
                const flagValue = sourceDocument.flags[MODULE_ID].darknessRank;
                if (flagValue === '') {
                  darknessRank = 3; // Empty string = rank 3 darkness
                } else if (flagValue && !isNaN(Number(flagValue))) {
                  darknessRank = Number(flagValue);
                }
              }
            }
          }
        } catch (error) {
          console.error('🌑 RASTER: Alternative lookup error:', error.message);
        }
      }

      // Default to rank 2 if we couldn't find a specific rank (most darkness spells are rank 1-3)
      if (darknessRank === 0) {
        darknessRank = 2;
      }

      // Heightened darkness only applies for rank 4+ spells
      const darknessResult = {
        passesThroughDarkness: true,
        maxDarknessRank: darknessRank,
      };

      // Keep the darkness source with the highest rank, or if ranks are equal, keep the first one
      if (
        maxDarknessResult === null ||
        darknessResult.maxDarknessRank > maxDarknessResult.maxDarknessRank
      ) {
        maxDarknessResult = darknessResult;
      }
    }

    // A darkness source cancels out all other illumination
    if (maxDarknessResult) return maxDarknessResult;
    return { passesThroughDarkness: false, maxDarknessRank: 0 };
  }
}
