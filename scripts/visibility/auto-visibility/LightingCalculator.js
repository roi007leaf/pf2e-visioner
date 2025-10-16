/**
 * Handles all lighting-related calculations for the auto-visibility system
 * Manages light sources, token light emission, scene darkness, and caching
 * SINGLETON PATTERN
 */

import { MODULE_ID } from '../../constants.js';
import { getLogger } from '../../utils/logger.js';
import { LightingModifier } from '../../rule-elements/operations/LightingModifier.js';
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
    // if (log.enabled()) log.debug(() => ({ step: 'start-getLightLevelAt', position }));

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
      //console.trace(`getLightLevelAt(${token.name || token?.id || 'unknown'}, ${position ? `${position.x},${position.y}` : 'token center'}) => ${result.level}`);
      return result;
    }

    // Check if token has a lighting modification from a rule element
    if (token && LightingModifier.hasLightingModification(token)) {
      const modifiedLighting = LightingModifier.getEffectiveLighting(token);
      if (modifiedLighting) {
        const illuminationMap = {
          'darkness': DARK,
          'dim': DIM,
          'bright': BRIGHT,
          'magicalDarkness': DARK,
          'greaterMagicalDarkness': DARK
        };
        const illumination = illuminationMap[modifiedLighting] ?? DIM;
        const extras = { modified: true, source: 'rule-element' };
        
        // Add magical darkness flags if applicable
        if (modifiedLighting === 'magicalDarkness') {
          extras.magicalDarkness = true;
          extras.isDarknessSource = true;
          extras.darknessRank = 2;
          extras.isHeightenedDarkness = false;
        } else if (modifiedLighting === 'greaterMagicalDarkness') {
          extras.greaterMagicalDarkness = true;
          extras.isDarknessSource = true;
          extras.darknessRank = 4;
          extras.isHeightenedDarkness = true;
        }
        
        return makeIlluminationResult(illumination, extras);
      }
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
    const elevation = position?.elevation ?? token?.document?.elevation ?? 0;

    // Rebuild token shape in world coordinates anchored at provided center
    const baseX = position ? position.x - tokenWidth / 2 : token.x;
    const baseY = position ? position.y - tokenHeight / 2 : token.y;
    let shapeInWorld;
    if (token && token.shape && token.shape?.points?.length) {
      shapeInWorld = token.shape.clone();
      const numberOfPoints = shapeInWorld.points.length || 0;
      for (let i = 0; i < numberOfPoints;) {
        shapeInWorld.points[i++] += baseX;
        shapeInWorld.points[i++] += baseY;
      }
    } else {
      // Final fallback - create a PIXI.Polygon with the rectangle points
      shapeInWorld = new PIXI.Polygon([
        baseX,
        baseY,
        baseX + tokenWidth,
        baseY,
        baseX + tokenWidth,
        baseY + tokenHeight,
        baseX,
        baseY + tokenHeight,
      ]);
    }

    // Convert the shape to clipper points
    const tokenClipperPoints = shapeInWorld.toClipperPoints({ scalingFactor: 1.0 });
    const tokenRadius = token?.externalRadius ?? Math.max(tokenWidth, tokenHeight) / 2;

    // First process all non-hidden darkness sources since they override illumination
    let maxDarknessResult = null;
    const darknessSources = canvas.effects?.darknessSources || [];

    for (const light of darknessSources) {
      if (!light.active) continue;

      const dx = center.x - light.x;
      const dy = center.y - light.y;
      const radius = Math.max(light.data.bright, light.data.dim);
      if (dx * dx + dy * dy > radius * radius) continue;

      // If our token clipper points don't intersect the darkness light shape, skip it
      const solution = light.shape.intersectClipper(tokenClipperPoints);
      if (!solution.length) continue;

      // Turn the intersection points back into a PIXI polygon to check full containment
      // For now "full containment" is just checking that the number of points match
      const intersection = PIXI.Polygon.fromClipperPoints(solution[0], { scalingFactor: 1.0 });
      if (intersection.points.length !== shapeInWorld.points.length) continue;

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
        isHeightenedDarkness,
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

    // A darkness source cancels out all other illumination
    if (maxDarknessResult) return maxDarknessResult;

    // Get the base scene darkness level
    const globalLight = scene.environment.globalLight;
    const maxDarknessInBright = globalLight?.darkness?.max || 0.0;
    let sceneDarkness = globalLight?.enabled ? scene.environment.darknessLevel : 1.0;

    // Find all the darkness regions that apply to our position
    const adlRegions = scene.regions.filter(
      (r) =>
        elevation >= r.elevation.bottom &&
        elevation <= r.elevation.top &&
        r.polygonTree &&
        r.behaviors.some((b) => b.active && b.type === 'adjustDarknessLevel'),
    );

    // Apply all the darkness behaviors for regions that we intersect
    for (const region of adlRegions) {
      const polygonTree = region.polygonTree;
      const circleTest = polygonTree.testCircle(center, tokenRadius);
      if (circleTest === -1) continue;

      // The region applies, so iterate its darkness behaviors
      for (const behavior of region.behaviors) {
        if (!behavior.active || behavior.type !== 'adjustDarknessLevel') continue;
        let regionDarkness;
        switch (behavior.system.mode) {
          case 0:
            regionDarkness = behavior.system.modifier;
            break; // override
          case 1:
            regionDarkness = sceneDarkness * (1 - behavior.system.modifier);
            break; // brighten
          case 2:
            regionDarkness = 1 - (1 - sceneDarkness) * (1 - behavior.system.modifier);
            break; // darken
        }

        // If the region is darker, it only applies if we are fully inside it
        if (regionDarkness < sceneDarkness || circleTest === 1) sceneDarkness = regionDarkness;
      }
    }

    // If the token isn't fully in darkness by GI, then it is in bright light and we can skip the rest
    // Addendum: dimThreshhold is a scene-level setting that allows a token to be considered in dim light
    // rather than as bright
    const dimThreshold = Math.min(scene.flags?.[MODULE_ID]?.dimThreshold || 0.25, maxDarknessInBright);
    if (sceneDarkness <= dimThreshold) return makeIlluminationResult(BRIGHT);
    let illumination = (sceneDarkness <= maxDarknessInBright) ? DIM : DARK;

    // iterate the lights, skipping hidden or inactive lights as well as global lights
    for (const light of canvas.effects.lightSources) {
      if (!light.active || light instanceof foundry.canvas.sources.GlobalLightSource) continue;

      // Do a cheap distance check to skip obviously out-of-range sources
      // We nudge out the radius a bit to not reject partially illuminated tokens
      const distanceSquared =
        (center.x - light.x) * (center.x - light.x) + (center.y - light.y) * (center.y - light.y);
      const bumpedRadius = Math.max(light.data.dim, light.data.bright) + tokenRadius;
      if (distanceSquared > bumpedRadius * bumpedRadius) continue;

      // Do the complete polygon intersection check, and if there is any intersection, the token
      // is at least partially illuminated by this light
      const solution = light.shape.intersectClipper(tokenClipperPoints);
      if (!solution.length) continue;

      // See if we are in the bright area of the light
      const brightRadiusSquared = light.data.bright * light.data.bright;

      if (distanceSquared < brightRadiusSquared) return makeIlluminationResult(BRIGHT);
      illumination = Math.max(illumination, DIM);
    }

    // After considering all light sources, return the final illumination result
    return makeIlluminationResult(illumination);
  }
}
