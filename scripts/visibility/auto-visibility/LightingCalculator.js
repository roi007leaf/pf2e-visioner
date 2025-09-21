/**
 * Handles all lighting-related calculations for the auto-visibility system
 * Manages light sources, token light emission, scene darkness, and caching
 * SINGLETON PATTERN
 */

import { MODULE_ID } from '../../constants.js';
import { getLogger } from '../../utils/logger.js';
const log = getLogger('LightingCalculator');

export class LightingCalculator {
  /** @type {LightingCalculator} */
  static #instance = null;

  constructor() {
    if (LightingCalculator.#instance) {
      return LightingCalculator.#instance;
    }

    LightingCalculator.#instance = this;
  }

  /**
   * Get the singleton instance
   * @returns {LightingCalculator}
   */
  static getInstance() {
    if (!LightingCalculator.#instance) {
      LightingCalculator.#instance = new LightingCalculator();
    }
    return LightingCalculator.#instance;
  }

  /**
   * Get the light level at a specific position
   * @param {Object} position - {x, y, elevation} coordinates
   * @returns {Object} Light level information
   */
  getLightLevelAt(position, token) {
    if (log.enabled()) log.debug(() => ({ step: 'start-getLightLevelAt', position }));

    const DARK = 0;
    const DIM = 1;
    const BRIGHT = 2;
    function makeIlluminationResult(illumination, extras = {}) {
      const LIGHT_LEVELS = ['darkness', 'dim', 'bright'];
      const LIGHT_THRESHOLDS = [0.0, 0.5, 1.0];
      const result = {
        level: LIGHT_LEVELS[illumination],
        illumination,
        lightIllumination: LIGHT_THRESHOLDS[illumination],
        ...extras,
      };
      if (log.enabled()) log.debug(() => ({ step: 'illumination-result', res: result }));
      return result;
    }

    // Convert light radii from scene units (feet) to pixels for distance comparison
    const scene = canvas.scene;

    // Derive the evaluation center and token polygon at that center (not the possibly stale canvas position)
    const gridSize = canvas.grid?.size || 100;
    const tokenWidth = (token?.document?.width ?? token?.width ?? 1) * gridSize;
    const tokenHeight = (token?.document?.height ?? token?.height ?? 1) * gridSize;
    const center = {
      x: position?.x ?? token?.center?.x ?? (token?.x ?? 0) + tokenWidth / 2,
      y: position?.y ?? token?.center?.y ?? (token?.y ?? 0) + tokenHeight / 2,
    };
    // Rebuild token shape in world coordinates anchored at provided center
    const baseX = position ? position.x - tokenWidth / 2 : token.x;
    const baseY = position ? position.y - tokenHeight / 2 : token.y;
    let shapeInWorld;
    if (token && token.shape) {
      shapeInWorld = token.shape.clone();
      for (let i = 0; i < shapeInWorld.points.length; ) {
        shapeInWorld.points[i++] += baseX;
        shapeInWorld.points[i++] += baseY;
      }
    } else {
      // Final fallback - create a simple object with points
      shapeInWorld = {
        points: [
          baseX,
          baseY,
          baseX + tokenWidth,
          baseY,
          baseX + tokenWidth,
          baseY + tokenHeight,
          baseX,
          baseY + tokenHeight,
        ],
      };
    }
    // Approximate token radius as half the diagonal (for cheap distance checks)
    const tokenRadius = Math.hypot(tokenWidth / 2, tokenHeight / 2);

    // First process all non-hidden darkness sources since they override illumination
    // Darkness applies if the token's center is within the darkness radius (no need for full polygon containment).
    // This aligns with Foundry's perception behavior and avoids the "extra move" requirement at borders.
    let maxDarknessResult = null;
    const darknessSources = canvas.effects?.darknessSources || [];

    for (const light of darknessSources) {
      if (!light.active) continue;

      const dx = center.x - light.x;
      const dy = center.y - light.y;
      const radius = Math.max(light.data.bright, light.data.dim);
      if (dx * dx + dy * dy > radius * radius) continue;

      // Read heightened darkness rank from our module flag if present
      let darknessRank = Number(light.document?.getFlag?.(MODULE_ID, 'darknessRank') || 0) || 0;

      // If no document but has sourceId, try to find the source document and read its flags
      if (darknessRank === 0 && !light.document && light.sourceId) {
        try {
          // sourceId format is usually "DocumentType.documentId"
          const [docType, docId] = light.sourceId.split('.');
          if (docType === 'AmbientLight' && docId) {
            const sourceDocument = canvas.scene.lights.get(docId);
            if (sourceDocument) {
              darknessRank = Number(sourceDocument.getFlag?.(MODULE_ID, 'darknessRank') || 0) || 0;
            }
          }
        } catch (error) {
          // Silently continue if we can't parse the sourceId
        }
      }

      // Heightened darkness only applies for rank 4+ spells
      const isHeightenedDarkness = darknessRank >= 4;
      const darknessResult = makeIlluminationResult(DARK, {
        isDarknessSource: true,
        isHeightenedDarkness: isHeightenedDarkness,
        darknessRank,
      });

      // Keep the darkness source with the highest rank, or if ranks are equal, keep the first one
      if (
        maxDarknessResult === null ||
        darknessResult.darknessRank > maxDarknessResult.darknessRank
      ) {
        maxDarknessResult = darknessResult;
      }
    }

    // Darkness cancels out all other illumination
    if (maxDarknessResult) return maxDarknessResult;

    // Foundry/pf2e system determines dark to be 75% or higher darkness
    // This needs to process darkness regions for full containment of token rather than just single point
    // const darknessRegions = scene.regions
    //   .filter((r) => r.behaviors.some((b) => b.type === 'adjustDarknessLevel'))
    // console.log("[Visibility Calculator] darknessRegions", darknessRegions);
    const sceneDarkness = scene.environment.globalLight?.enabled
      ? canvas.effects.getDarknessLevel(center)
      : 0.0;

    // If the token isn't fully in darkness by GI, then it is in bright light and we can skip the rest
    // This means a global DIM light is approximated using:
    //   - scene darkness >= 0.75
    //   - large dim radius ambient that ignores wall constraints
    if (sceneDarkness < 0.75) return makeIlluminationResult(BRIGHT);
    let illumination = DARK;

    // iterate the lights, skipping hidden or inactive lights as well as global lights
    for (const light of canvas.effects.lightSources) {
      if (!light.active || light instanceof foundry.canvas.sources.GlobalLightSource) continue;

      // Do a cheap distance check to skip obviously out-of-range sources
      // We nudge out the radius a bit to not reject partially illuminated tokens
      const cheapDistanceSquared =
        (center.x - light.x) * (center.x - light.x) + (center.y - light.y) * (center.y - light.y);
      const radiusSquared = Math.pow(Math.max(light.data.dim, light.data.bright) + tokenRadius, 2);
      if (cheapDistanceSquared > radiusSquared) continue;

      // Do the complete polygon intersection check, and if there is any intersection, the token
      // is at least partially illuminated by this light
      const intersection = light.shape.intersectPolygon(shapeInWorld, { scalingFactor: 1.0 });
      if (!intersection.points.length) continue;

      // See if we are in the bright area of the light
      const distanceSquared =
        (center.x - light.x) * (center.x - light.x) + (center.y - light.y) * (center.y - light.y);
      const brightRadiusSquared = Math.pow(light.data.bright, 2);

      if (distanceSquared < brightRadiusSquared) return makeIlluminationResult(BRIGHT);
      illumination = Math.max(illumination, DIM);
    }

    // After considering all light sources, return the final illumination result
    return makeIlluminationResult(illumination);
  }
}
