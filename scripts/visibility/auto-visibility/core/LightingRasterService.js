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
      return {passesThroughDarkness: false, maxDarknessRank: 0};
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
    const targetRadius = target?.externalRadius ?? (Math.max(tokenWidth, tokenHeight) / 2);

    // If the two tokens are overlapping, we can't possibly pass through darkness
    if (aLen <= targetRadius) {
      return {passesThroughDarkness: false, maxDarknessRank: 0};
    }

    // Angle from target center to observer center
    const angleToP = Math.atan2(-aY, -aX);

    // Angle between center-external and tangent line
    const theta = Math.acos(targetRadius / aLen);

    // Two tangent points
    const angles = [angleToP + theta, angleToP - theta];
    const tangentPoints = angles.map(a => ({
      x: targetPos.x + targetRadius * Math.cos(a),
      y: targetPos.y + targetRadius * Math.sin(a)
    }));

    // Process all non-hidden darkness sources
    let maxDarknessResult = null;
    for (const light of darknessSources) {
      if (!light.active) continue;

      // Make sure the ray intersects the light's radius before doing more complex math
      //
      // Get the vector from observer to light source and its squared length. This will be the hypotenuse
      // of our right triangle, which we'll name 'h'
      const hX = light.x - observerPos.x;
      const hY = light.y - observerPos.y;
      const hDot = hX * hX + hY * hY;

      // Get the squared radius of the darkness area
      const radius = Math.max(light.data.bright, light.data.dim);
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
        const tX = light.x - targetPos.x;
        const tY = light.y - targetPos.y;
        const tDot = tX * tX + tY * tY;
        if (tDot > radiusDot) continue;
      }

      // By right triangle properties, the length of the perpindicular side squared is h^2 - (p/|a|)^2
      else {
        p /= aLen; // p is now the true length of the adjacent side
        if (hDot - p*p > radiusDot) continue;
      }

      // We are close enough to the light to possibly be affected, but before we check the shape, we will
      // use the tangent point on the opposite side of the light from the original ray. This will handle
      // most cases where we get false positives due to the center ray passing just inside the darkness
      // while a portion of the target is still visible outside.
      const lightCross = hX*aY - hY*aX;
      let tangentPoint = tangentPoints[0];
      const crossProduct = (tangentPoint.x - observerPos.x)*aY - (tangentPoint.y - observerPos.y)*aX;
      if (crossProduct * lightCross > 0)
        tangentPoint = tangentPoints[1];

      // Test the ray against the light's edges, any intersection means the ray passes through darkness
      const points = light?.shape?.points ?? [];
      let intersects = false;
      for (let i = 0; i < points.length; i += 2) {
        const a = {x: points[i], y: points[i+1]};
        const b = {x: points[(i+2)%points.length], y: points[(i+3)%points.length]};
        if (foundry.utils.lineSegmentIntersects(observerPos, tangentPoint, a, b)) {
          intersects = true;
          break;
        }
      }
      if (!intersects) continue;

      //
      // Read heightened darkness rank from our module flag if present
      let darknessRank = Number(light.document?.getFlag?.(MODULE_ID, 'darknessRank') || 0) || 0;
      console.log('🌑 RASTER: Initial rank from light.document:', darknessRank, 'for light:', light.id);

      // If no document but has sourceId, try to find the source document and read its flags
      if (darknessRank === 0 && !light.document && light.sourceId) {
        console.log('🌑 RASTER: No document, trying sourceId:', light.sourceId);
        try {
          // sourceId format is usually "DocumentType.documentId"
          const [docType, docId] = light.sourceId.split('.');
          console.log('🌑 RASTER: Parsed sourceId - docType:', docType, 'docId:', docId);
          if (docType === 'AmbientLight' && docId) {
            const sourceDocument = canvas.scene.lights.get(docId);
            console.log('🌑 RASTER: Found source document:', !!sourceDocument, 'id:', sourceDocument?.id);
            if (sourceDocument) {
              darknessRank = Number(sourceDocument.getFlag?.(MODULE_ID, 'darknessRank') || 0) || 0;
              console.log('🌑 RASTER: Darkness rank from source document:', darknessRank);
            }
          }
        } catch (error) {
          console.log('🌑 RASTER: Error parsing sourceId:', error.message);
        }
      }

      // Try alternative method if we still have no rank
      if (darknessRank === 0 && light.sourceId) {
        console.log('🌑 RASTER: Still no rank, trying alternative lookup for sourceId:', light.sourceId);
        try {
          const [docType, docId] = light.sourceId.split('.');
          if (docType === 'AmbientLight' && docId) {
            const sourceDocument = canvas.scene.lights.get(docId);
            if (sourceDocument) {
              console.log('🌑 RASTER: Alternative lookup - found document with flags:', Object.keys(sourceDocument.flags || {}));
              if (sourceDocument.flags && sourceDocument.flags[MODULE_ID]) {
                console.log('🌑 RASTER: Module flags found:', sourceDocument.flags[MODULE_ID]);
                darknessRank = Number(sourceDocument.flags[MODULE_ID].darknessRank || 0) || 0;
                console.log('🌑 RASTER: Final darkness rank:', darknessRank);
              }
            }
          }
        } catch (error) {
          console.log('🌑 RASTER: Alternative lookup error:', error.message);
        }
      }

      // Default to rank 4 if we couldn't find a specific rank (typical darkness spell)
      if (darknessRank === 0) {
        darknessRank = 4;
        console.log('🌑 RASTER: No specific rank found, defaulting to rank 4');
      }

      // Heightened darkness only applies for rank 4+ spells
      const darknessResult = {
        passesThroughDarkness: true,
        maxDarknessRank: darknessRank,
      }
      
      console.log('🌑 RASTER: Final darkness result:', darknessResult);

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
    return {passesThroughDarkness: false, maxDarknessRank: 0};
  }
}
