/**
 * Handles all lighting-related calculations for the auto-visibility system
 * Manages light sources, token light emission, scene darkness, and caching
 * SINGLETON PATTERN
 */

import { MODULE_ID } from '../../constants.js';
import RegionHelper from '../../utils/region.js';

export class LightingCalculator {
  /** @type {LightingCalculator} */
  static #instance = null;

  #lightEmittingTokensCache = null;
  #lightCacheTimestamp = 0;
  #lightCacheTimeout = 250; // 250ms cache for faster response

  constructor() {
    if (LightingCalculator.#instance) {
      return LightingCalculator.#instance;
    }

    this.#lightEmittingTokensCache = null;
    this.#lightCacheTimestamp = 0;

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
   * @param {Object} position - {x, y} coordinates
   * @returns {Object} Light level information
   */
  getLightLevelAt(position) {

    const sceneDarkness = canvas.scene?.environment?.darknessLevel ?? canvas.scene?.darkness ?? 0;

    // Determine if the scene actually has global illumination enabled.
    // If not, there should be no base illumination and only light sources contribute.
    // v13+: Use environment.globalLight.enabled; fall back to hasGlobalIllumination for older scenes
    const hasGlobalIllumination =
      canvas.scene?.environment?.globalLight?.enabled ??
      canvas.scene?.hasGlobalIllumination ??
      false;

    // Start with base illumination only when global illumination is active
    // Foundry determines dark to be 75% or higher darkness
    // Addition of global dim lighting requires addtion of a scene-wide setting.
    // This also doesn't take darkness regions into consideration.
    const DARK = 0;
    const DIM = 1;
    const BRIGHT = 2;
    const FOUNDRY_DARK = 0.25;

    // Check for region-specific darkness level
    const regionDarkness = this.#getRegionDarknessAt(position);
    const effectiveDarkness = regionDarkness !== null ? regionDarkness : sceneDarkness;

    const baseIllumination = hasGlobalIllumination ? 1.0 - effectiveDarkness : 0.0;

    function makeIlluminationResult(illumination) {
      const LIGHT_LEVELS = ['darkness', 'dim', 'bright'];
      const LIGHT_THRESHOLDS = [0.0, 0.5, 1.0];
      return {
        level: LIGHT_LEVELS[illumination],
        illumination,
        sceneDarkness,
        baseIllumination,
        lightIllumination: LIGHT_THRESHOLDS[illumination],
      };
    }
    let illumination = baseIllumination > FOUNDRY_DARK ? BRIGHT : DARK;

    // Check if position is illuminated by any light sources OR light-emitting tokens
    const lightSources = canvas.lighting?.placeables || [];

    // Convert light radii from scene units (feet) to pixels for distance comparison
    const pixelsPerGridSquare = canvas.grid?.size || 100;
    const unitsPerGridSquare = canvas.scene?.grid?.distance || 5;
    const pixelsPerUnit = pixelsPerGridSquare / unitsPerGridSquare;

    // Check dedicated light sources first (including darkness sources)
    for (const light of lightSources) {
      // Determine if this light is a "darkness" (negative) source. Support multiple possible paths for robustness across Foundry versions.
      const isDarknessSource = !!(
        light.isDarknessSource ||
        light.document?.config?.negative ||
        light.document?.config?.darkness?.negative ||
        light.document?.negative ||
        light.config?.negative
      );

      // Skip if the light is hidden. For non-darkness lights also skip if they do not emit light.
      // Darkness sources often report emitsLight=false, but we still need to process them so they can impose darkness.
      if (light.document.hidden || (!isDarknessSource && !light.emitsLight))
        continue;

      // Check if position is inside the light polygon first
      const isInPolygon = this.#isPositionInLightPolygon(position, light);

      // If polygon check is available and position is outside, skip this light
      if (isInPolygon === false) {
        continue;
      }

      // Try multiple property paths for light radius FIRST
      const brightRadius =
        light.document.config?.bright || light.document.bright || light.config?.bright || 0;
      const dimRadius = light.document.config?.dim || light.document.dim || light.config?.dim || 0;

      // Use the correct coordinate properties - light.x and light.y (not light.center)
      const lightX = light.x || light.document.x;
      const lightY = light.y || light.document.y;

      // Only do distance calculation if polygon check is not available or position is inside polygon
      if (isInPolygon === null) {
        // Calculated distances are in squared pixel units
        const distanceSquared =
          Math.pow(position.x - lightX, 2) + Math.pow(position.y - lightY, 2);
        const brightRadiusSquared = Math.pow(brightRadius * pixelsPerUnit, 2);
        const dimRadiusSquared = Math.pow(dimRadius * pixelsPerUnit, 2);

        // Handle darkness sources (they eliminate illumination)
        // For darkness sources, both bright and dim areas provide full darkness
        if (isDarknessSource) {
          if (distanceSquared <= brightRadiusSquared || distanceSquared <= dimRadiusSquared) {
            return makeIlluminationResult(DARK);
          }
        } else {
          // Handle normal light sources (they increase illumination) - use pixel-converted radii
          if (distanceSquared <= brightRadiusSquared) {
            // can't return right away because darkness source trumps this
            illumination = BRIGHT;
          } else if (distanceSquared <= dimRadiusSquared) {
            illumination = Math.max(illumination, DIM); // Dim light
          }
        }
      } else {
        // Position is inside the light polygon, determine if it's bright or dim
        // This requires checking if it's within the bright radius or just the dim radius
        const distanceSquared =
          Math.pow(position.x - lightX, 2) + Math.pow(position.y - lightY, 2);
        const brightRadiusSquared = Math.pow(brightRadius * pixelsPerUnit, 2);

        if (isDarknessSource) {
          return makeIlluminationResult(DARK);
        } else {
          // Within polygon - check if it's bright or dim illumination
          if (distanceSquared <= brightRadiusSquared) {
            illumination = BRIGHT;
          } else {
            illumination = Math.max(illumination, DIM);
          }
        }
      }
    }

    // If we were in a darkness source then we've already returned DARK
    // If we find ourselves in BRIGHT illumination we can return immediately
    if (illumination === BRIGHT)
      return makeIlluminationResult(BRIGHT);

    // Check light-emitting tokens using cached results
    const lightEmittingTokens = this.#getLightEmittingTokens();
    for (const tokenInfo of lightEmittingTokens) {

      const distanceSquared =
        Math.pow(position.x - tokenInfo.x, 2) + Math.pow(position.y - tokenInfo.y, 2);

      const brightRadiusSquared = Math.pow(tokenInfo.brightRadius * pixelsPerUnit, 2);
      const dimRadiusSquared = Math.pow(tokenInfo.dimRadius * pixelsPerUnit, 2);

      if (distanceSquared <= brightRadiusSquared) {
        return makeIlluminationResult(BRIGHT);
      } else if (distanceSquared <= dimRadiusSquared) {
        // no need for max here since BRIGHT case already returned
        illumination = DIM;
      }
    }

    return makeIlluminationResult(illumination);
  }

  /**
   * Get darkness level from scene regions at a specific position
   * @param {Object} position - {x, y} coordinates
   * @returns {number|null} Region darkness level or null if no region affects this position
   */
  #getRegionDarknessAt(position) {
    // Check if scene regions exist (v12+)
    if (!canvas.scene?.regions || !canvas.regions?.placeables) {
      return null;
    }

    // Check each region to see if the position is within it
    for (const region of canvas.regions.placeables) {
      if (!region.document || region.document.hidden) {
        continue;
      }

      // Check if position is within this region's bounds
      if (this.#isPositionInRegion(position, region)) {
        // Look for darkness behaviors (support legacy 'environment' and new 'adjustDarknessLevel')
        const behaviors = region.document.behaviors || [];
        for (const behavior of behaviors) {
          if (behavior?.type === 'adjustDarknessLevel') {
            const mode = behavior.system?.mode; // 0=set, 1=add, 2=mult (assumed semantics)
            const modifier = Number(behavior.system?.modifier ?? 0);
            const base = canvas.scene?.environment?.darknessLevel ?? canvas.scene?.darkness ?? 0;
            let value = base;
            switch (mode) {
              case 0: // set
                value = modifier; break;
              case 1: // add
                value = base + modifier; break;
              case 2: // multiply
                value = base * modifier; break;
              default:
                value = base + modifier; // fallback treat as additive
            }
            // Clamp between 0 and 1
            value = Math.min(1, Math.max(0, value));
            return value;
          }
        }
      }
    }

    return null;
  }

  /**
   * Check if a position is within a region
   * @param {Object} position - {x, y} coordinates
   * @param {Object} region - The region object
   * @returns {boolean} True if position is within the region
   */
  #isPositionInRegion(position, region) {
    try {
      return RegionHelper.isPointInside(region, position);
    } catch (error) {
      console.warn(`${MODULE_ID} | Error checking region bounds:`, error);
      return false;
    }
  }

  /**
   * Check if a position is within a light source's polygon
   * @param {Object} position - {x, y} coordinates
   * @param {Object} light - The light source object
   * @returns {boolean} True if position is within the light polygon
   */
  #isPositionInLightPolygon(position, light) {
    try {
      const shape = light.shape || light.lightSource?.shape || light.source?.shape || null;

      const testPoly = (poly) => {
        if (!poly) return null;
        // Built-in contains
        if (typeof poly.contains === 'function') {
          try { return !!poly.contains(position.x, position.y); } catch { return null; }
        }
        // Manual ray-cast on point array (x0,y0,x1,y1,...)
        if (Array.isArray(poly.points) && poly.points.length >= 6) {
          const pts = poly.points;
          const b = poly.bounds || poly.boundingBox;
          if (b) {
            if (position.x < b.x || position.x > b.x + b.width || position.y < b.y || position.y > b.y + b.height) {
              return false; // outside bounds
            }
          }
          let inside = false;
          for (let i = 0, j = pts.length - 2; i < pts.length; i += 2) {
            const xi = pts[i];
            const yi = pts[i + 1];
            const xj = pts[j];
            const yj = pts[j + 1];
            const intersects = ((yi > position.y) !== (yj > position.y)) &&
              (position.x < (xj - xi) * (position.y - yi) / ((yj - yi) || 1e-9) + xi);
            if (intersects) inside = !inside;
            j = i;
          }
          return inside;
        }
        return null; // insufficient data
      };

      const shapeResult = testPoly(shape);
      if (shapeResult !== null) return shapeResult; // true/false inside/outside
      return null; // fallback to distance
    } catch {
      return null;
    }
  }

  /**
   * Get cached light-emitting tokens or refresh cache if expired
   * @returns {Array} Array of light-emitting token information
   */
  #getLightEmittingTokens() {
    const now = Date.now();
    if (this.#lightEmittingTokensCache && (now - this.#lightCacheTimestamp) < this.#lightCacheTimeout) {
      return this.#lightEmittingTokensCache;
    }
    this.#refreshLightEmittingTokensCache();
    return this.#lightEmittingTokensCache || [];
  }
  /**
   * Refresh the cache of light-emitting tokens
   */
  #refreshLightEmittingTokensCache() {
    // const debugMode = game.settings.get(MODULE_ID, 'autoVisibilityDebugMode'); // currently unused
    const tokens = canvas.tokens?.placeables || [];

    this.#lightEmittingTokensCache = tokens
      .filter((token) => {
        if (!token?.document || token.document.hidden) return false;

        // Check multiple property paths for light emission
        const brightRadius =
          token.document.light?.bright ||
          token.light?.bright ||
          token.document.config?.light?.bright ||
          token.document.data?.light?.bright ||
          token.data?.light?.bright ||
          0;
        const dimRadius =
          token.document.light?.dim ||
          token.light?.dim ||
          token.document.config?.light?.dim ||
          token.document.data?.light?.dim ||
          token.data?.light?.dim ||
          0;

        // Don't treat vision range as light emission - only actual light sources count
        const hasLight = brightRadius > 0 || dimRadius > 0;

        // Debug logging for each token if debug mode is on (only for tokens with light)

        return hasLight;
      })
      .map((token) => ({
        name: token.name,
        x: token.center.x,
        y: token.center.y,
        brightRadius:
          token.document.light?.bright ||
          token.light?.bright ||
          token.document.config?.light?.bright ||
          token.document.data?.light?.bright ||
          token.data?.light?.bright ||
          0,
        dimRadius:
          token.document.light?.dim ||
          token.light?.dim ||
          token.document.config?.light?.dim ||
          token.document.data?.light?.dim ||
          token.data?.light?.dim ||
          0,
      }));

    this.#lightCacheTimestamp = Date.now();
  }

  /**
   * Invalidate the light cache (call when lighting changes)
   */
  invalidateLightCache() {
    this.#lightEmittingTokensCache = null;
    this.#lightCacheTimestamp = 0;
  }

  /**
   * Clear the light cache (public API)
   */
  clearLightCache() {
    this.invalidateLightCache();
  }
}
