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

    // Grab the token's shape in world coordinates
    let shapeInWorld = token.shape.clone();
    for (let i = 0; i < shapeInWorld.points.length;) {
      shapeInWorld.points[i++] += token.x;
      shapeInWorld.points[i++] += token.y
    }
    const center = token.center;
    const tokenRadius = Math.sqrt(Math.pow(center.x - token.x, 2), Math.pow(center.y - token.y, 2));

    // First process all non-hidden darkness sources since they override illumination
    let maxDarknessResult = null;
    for (const light of canvas.effects.darknessSources) {
      if (!light.active) continue;

      // Do a cheap distance check to skip obviously out-of-range sources
      const distanceSquared =
        Math.pow(center.x - light.x, 2) + Math.pow(center.y - light.y, 2);
      const radiusSquared = Math.pow(Math.max(light.data.dim, light.data.bright), 2);
      if (distanceSquared > radiusSquared) continue;

      // Do the complete polygon intersection check
      const intersection = light.shape.intersectPolygon(shapeInWorld, {scalingFactor: 1.0});

      // If the points differ between the intersection and the shape, it's a partial intersection and can be skipped
      if (intersection.points.length !== shapeInWorld.points.length) continue;

      // We should compare the intersection points to the shape points to ensure full containment, but
      // the circular nature of the light means that the same number of points probably means no clipping
      // happened. The points may not be in the same order and we don't
      // know the threshold for "close enough" due to scaling and rounding, so skip this for now

      // Read heightened darkness rank from our module flag if present
      const darknessRank = Number(light.document?.getFlag?.(MODULE_ID, 'darknessRank') || 0) || 0;

      // PF2E Visioner: backward-compatible flags
      const heightenedFlag = !!light.document?.getFlag?.(MODULE_ID, 'heightenedDarkness');
      const isMagicalDarkness = !!(heightenedFlag || darknessRank >= 4);
      const darknessResult = 
        makeIlluminationResult(DARK, { isDarknessSource: true, isMagicalDarkness, darknessRank });

      // Return the most potent darkness source if multiple overlap
      if (maxDarknessResult === null || darknessResult.darknessRank > maxDarknessResult.darknessRank) {
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
    const sceneDarkness = (scene.environment.globalLight?.enabled)
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
        Math.pow(center.x - light.x, 2) + Math.pow(center.y - light.y, 2);
      const radiusSquared = Math.pow(Math.max(light.data.dim, light.data.bright) + tokenRadius, 2);
      if (cheapDistanceSquared > radiusSquared) continue;

      // Do the complete polygon intersection check, and if there is any intersection, the token
      // is at least partially illuminated by this light
      const intersection = light.shape.intersectPolygon(shapeInWorld, {scalingFactor: 1.0});
      if (!intersection.points.length) continue;

      // See if we are in the bright area of the light
      const distanceSquared =
        Math.pow(center.x - light.x, 2) + Math.pow(center.y - light.y, 2);
      const brightRadiusSquared = Math.pow(light.data.bright, 2);

      if (distanceSquared < brightRadiusSquared) return makeIlluminationResult(BRIGHT);
      illumination = Math.max(illumination, DIM);
    }

    // After considering all light sources, return the final illumination result
    return makeIlluminationResult(illumination);
  }
}
