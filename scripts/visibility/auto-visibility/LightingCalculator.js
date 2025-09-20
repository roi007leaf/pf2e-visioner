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
   * Get the light level at a specific location.
   * Accepts either a Token (preferred) or a raw position object.
   * @param {Token|Object} tokenOrPosition - Token instance or {x, y, elevation}
   * @returns {Object} Light level information
   */
  getLightLevelAt(tokenOrPosition) {
    // Normalize input to a position object
    let position;
    try {
      // If a Token-like object is provided
      if (tokenOrPosition?.document && (tokenOrPosition?.center || (typeof tokenOrPosition?.document?.x === 'number' && typeof tokenOrPosition?.document?.y === 'number'))) {
        const doc = tokenOrPosition.document;
        const gridSize = canvas.grid?.size || 100;
        const cx = tokenOrPosition.center?.x ?? (doc.x + (doc.width * gridSize) / 2);
        const cy = tokenOrPosition.center?.y ?? (doc.y + (doc.height * gridSize) / 2);
        position = { x: cx, y: cy, elevation: doc.elevation || 0 };
      }
      // If a raw position object is provided
      else if (typeof tokenOrPosition?.x === 'number' && typeof tokenOrPosition?.y === 'number') {
        const elev = typeof tokenOrPosition.elevation === 'number' ? tokenOrPosition.elevation : 0;
        position = { x: tokenOrPosition.x, y: tokenOrPosition.y, elevation: elev };
      }
    } catch { /* ignore and fallback below */ }

    // Fallback if input was invalid
    if (!position) {
      position = { x: 0, y: 0, elevation: 0 };
    }

    if (log.enabled()) log.debug(() => ({ step: 'start-getLightLevelAt', inputType: tokenOrPosition?.document ? 'token' : 'position', position }));

    const scene = canvas.scene;
    const sceneDarkness = (scene.environment.globalLight.enabled)
      ? canvas.effects.getDarknessLevel(position)
      : 0.0;

    // Foundry determines dark to be 75% or higher darkness
    const DARK = 0;
    const DIM = 1;
    const BRIGHT = 2;
    const FOUNDRY_DARK = 0.75;

    const baseIllumination = 1.0 - sceneDarkness;
    let illumination = sceneDarkness < FOUNDRY_DARK ? BRIGHT : DARK;

    function makeIlluminationResult(illumination, extras = {}) {
      const LIGHT_LEVELS = ['darkness', 'dim', 'bright'];
      const LIGHT_THRESHOLDS = [0.0, 0.5, 1.0];
      const res = {
        level: LIGHT_LEVELS[illumination],
        illumination,
        sceneDarkness,
        baseIllumination,
        lightIllumination: LIGHT_THRESHOLDS[illumination],
        ...extras,
      };
      if (log.enabled()) log.debug(() => ({ step: 'illumination-result', res }));
      return res;
    }

    // Check if position is illuminated by any light sources OR light-emitting tokens
    const lightSources = canvas.lighting?.placeables || [];

    // Convert light radii from scene units (feet) to pixels for distance comparison
    const pixelsPerGridSquare = canvas.grid?.size || 100;
    const unitsPerGridSquare = canvas.scene?.grid?.distance || 5;
    const pixelsPerUnit = pixelsPerGridSquare / unitsPerGridSquare;

    // Check dedicated light sources first (including darkness sources)
    for (const light of lightSources) {
      // Determine if this light is a "darkness" (negative) source. Support multiple possible paths for robustness across Foundry versions.
      const isNegative = !!(
        light.isDarknessSource ||
        light.document?.config?.negative ||
        light.document?.config?.darkness?.negative ||
        light.document?.negative ||
        light.config?.negative
      );
      // Read heightened darkness rank from our module flag if present
      const darknessRank = Number(light.document?.getFlag?.(MODULE_ID, 'darknessRank') || 0) || 0;
      // PF2E Visioner: backward-compatible flags
      const heightenedFlag = !!light.document?.getFlag?.(MODULE_ID, 'heightenedDarkness');
      const isMagicalDarkness = !!(heightenedFlag || darknessRank >= 4);

      // Skip if the light is hidden. For non-darkness lights also skip if they do not emit light.
      // Darkness sources often report emitsLight=false, but we still need to process them so they can impose darkness.
      if (light.document.hidden || (!isNegative && !light.emitsLight))
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
        if (isNegative) {
          if (distanceSquared <= brightRadiusSquared || distanceSquared <= dimRadiusSquared) {
            return makeIlluminationResult(DARK, { isDarknessSource: true, isMagicalDarkness, darknessRank });
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
        // Position is inside the light polygon: compute distance and compare against both radii
        const distanceSquared =
          Math.pow(position.x - lightX, 2) + Math.pow(position.y - lightY, 2);
        const brightRadiusSquared = Math.pow(brightRadius * pixelsPerUnit, 2);
        const dimRadiusSquared = Math.pow(dimRadius * pixelsPerUnit, 2);

        if (isNegative) {
          return makeIlluminationResult(DARK, { isDarknessSource: true, isMagicalDarkness, darknessRank });
        } else {
          // If beyond the configured dim radius, this light does not contribute
          if (dimRadius > 0 && distanceSquared > dimRadiusSquared) {
            // no contribution from this light
          } else if (distanceSquared <= brightRadiusSquared) {
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
    if (log.enabled()) log.debug(() => ({ step: 'token-lights-count', count: lightEmittingTokens.length }));
    for (const tokenInfo of lightEmittingTokens) {
      // Optional: lightweight debug for token light entries
      if (log.enabled()) log.debug(() => ({ step: 'token-light-entry', name: tokenInfo.name }));
      // Prefer checking against the token's light polygon if available, which already
      // accounts for wall clipping. Fall back to radial distance + wall occlusion checks.
      let usedPolygon = false;
      try {
        const tok = canvas.tokens?.get?.(tokenInfo.id);
        if (tok) {
          const inPoly = this.#isPositionInTokenLightPolygon(position, tok);
          if (log.enabled()) log.debug(() => ({ step: 'token-light-polygon-check', token: tok.name, inPoly }));
          if (inPoly === false) {
            usedPolygon = true;
            continue;
          } else if (inPoly === true) {
            usedPolygon = true;
            const distanceSquared = Math.pow(position.x - tokenInfo.x, 2) + Math.pow(position.y - tokenInfo.y, 2);
            const brightRadiusSquared = Math.pow(tokenInfo.brightRadius * pixelsPerUnit, 2);
            const dimRadiusSquared = Math.pow(tokenInfo.dimRadius * pixelsPerUnit, 2);

            // Even if the polygon includes the point, verify a wall does not occlude the token light.
            const { occluded: isOccludedByWall, details: occlusionDetails } = this.#isPathOccludedByWalls(
              { x: tokenInfo.x, y: tokenInfo.y },
              { x: position.x, y: position.y },
            );
            if (log.enabled()) log.debug(() => ({ step: 'token-light-polygon-occlusion-ray', token: tok.name ?? tokenInfo.name, isOccludedByWall, samples: occlusionDetails?.samples?.length ?? 0 }));

            if (isOccludedByWall) {
              // Occluded: this token light does not contribute illumination at this position.
              continue;
            }

            // If beyond the configured dim radius, this token light does not contribute
            if (tokenInfo.dimRadius > 0 && distanceSquared > dimRadiusSquared) {
              continue;
            } else if (distanceSquared <= brightRadiusSquared) {
              return makeIlluminationResult(BRIGHT);
            } else {
              illumination = Math.max(illumination, DIM);
              // Continue evaluating other sources only if not bright.
              continue;
            }
          }
        }
      } catch (err) {
        if (log.enabled()) log.warn(() => ({ step: 'token-light-polygon-error', token: tokenInfo.name, error: err }));
        /* noop, will fallback below */
      }

      // Fallback path: radial distance with explicit wall occlusion checks
      if (!usedPolygon) {
        const distanceSquared = Math.pow(position.x - tokenInfo.x, 2) + Math.pow(position.y - tokenInfo.y, 2);
        const brightRadiusSquared = Math.pow(tokenInfo.brightRadius * pixelsPerUnit, 2);
        const dimRadiusSquared = Math.pow(tokenInfo.dimRadius * pixelsPerUnit, 2);

        const { occluded: isOccludedByWall, details: occlusionDetails } = this.#isPathOccludedByWalls(
          { x: tokenInfo.x, y: tokenInfo.y },
          { x: position.x, y: position.y },
        );
        if (log.enabled()) log.debug(() => ({ step: 'token-light-occlusion-ray', token: tokenInfo.name, isOccludedByWall, samples: occlusionDetails?.samples?.length ?? 0 }));

        if (!isOccludedByWall) {
          if (distanceSquared <= brightRadiusSquared) {
            if (log.enabled()) log.debug(() => ({ step: 'token-light-fallback-bright', token: tokenInfo.name }));
            return makeIlluminationResult(BRIGHT);
          } else if (distanceSquared <= dimRadiusSquared) {
            if (log.enabled()) log.debug(() => ({ step: 'token-light-fallback-dim', token: tokenInfo.name }));
            illumination = DIM;
          }
        }
      }

    }

    // After considering all light sources and token lights, return the final illumination result
    return makeIlluminationResult(illumination);
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
      if (log.enabled()) {
        const srcName = light?.constructor?.name;
        log.debug(() => ({ step: 'polygon-shape-detect', src: srcName, hasShape: !!shape }));
      }

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
   * Robust wall-occlusion test between two points using multi-ray sampling.
   * Returns { occluded: boolean, details: object }
   */
  #isPathOccludedByWalls(A, B) {
    const details = { samples: [], used: 'checkCollision', epsilon: 0 };
    try {
      const RayClass = foundry?.canvas?.geometry?.Ray || foundry?.utils?.Ray;
      const dx = B.x - A.x;
      const dy = B.y - A.y;
      const len = Math.hypot(dx, dy) || 1;
      // Perpendicular unit vector
      const px = -dy / len;
      const py = dx / len;
      const grid = canvas.grid?.size || 100;
      const eps = Math.max(1, Math.round(grid * 0.02)); // ~2% grid size, at least 1px
      details.epsilon = eps;

      const offsets = [0, +eps, -eps];
      let centralBlocked = false;
      let blockedCount = 0;
      for (const off of offsets) {
        const Ao = { x: A.x + px * off, y: A.y + py * off };
        const Bo = { x: B.x + px * off, y: B.y + py * off };
        let blockedLight = false, blockedSight = false, blockedFallback = false;
        try {
          if (RayClass) {
            const ray = new RayClass(Ao, Bo);
            blockedLight = !!(canvas.walls?.checkCollision?.(ray, { type: 'light', mode: 'any' }) ?? false);
            blockedSight = !!(canvas.walls?.checkCollision?.(ray, { type: 'sight', mode: 'any' }) ?? false);
            blockedFallback = !!(canvas.walls?.checkCollision?.(ray) ?? false);
          } else if (canvas.walls?.checkCollision) {
            const seg = { A: Ao, B: Bo };
            blockedLight = !!canvas.walls.checkCollision(seg, { type: 'light', mode: 'any' });
            blockedSight = !!canvas.walls.checkCollision(seg, { type: 'sight', mode: 'any' });
            blockedFallback = !!canvas.walls.checkCollision(seg);
          } else if (canvas.walls?.raycast) {
            details.used = 'raycast';
            blockedFallback = !!canvas.walls.raycast(Ao, Bo);
          }
        } catch { /* ignore */ }

        const blocked = !!(blockedLight || blockedSight || blockedFallback);
        if (off === 0) centralBlocked = blocked;
        if (blocked) blockedCount++;
        details.samples.push({ off, Ao, Bo, blockedLight, blockedSight, blockedFallback, blocked });
      }

      // Conservative rule: if the central ray is blocked OR at least two samples are blocked, treat as occluded
      const occluded = centralBlocked || blockedCount >= 2;
      details.centralBlocked = centralBlocked;
      details.blockedCount = blockedCount;
      return { occluded, details };
    } catch (error) {
      return { occluded: false, details: { error } };
    }
  }

  /**
   * Check if a position lies within a token's emitted light polygon, if available.
   * Returns:
   * - true if inside
   * - false if outside
   * - null if no polygon is available (callers should fallback to distance checks)
   */
  #isPositionInTokenLightPolygon(position, token) {
    try {
      // Try multiple paths to find a LightSource-like object with a shape
      // Foundry versions may expose token light via different properties
      const source = this.#getTokenLightSource(token);
      if (!source) return null;
      // Reuse existing polygon tester by passing the source, which has a .shape
      return this.#isPositionInLightPolygon(position, source);
    } catch {
      return null;
    }
  }

  /**
   * Attempt to retrieve a token's LightSource-like object across Foundry versions.
   * Returns undefined/null if not found.
   */
  #getTokenLightSource(token) {
    try {
      // Common paths across v10-v13
      return (
        token?.light?.source ||
        token?.lightSource ||
        token?.source ||
        // Some builds expose the shape directly on token.light
        (token?.light?.shape ? { shape: token.light.shape } : null) ||
        null
      );
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
      try {
        // Verify freshness: if any token center or radii changed since cache, refresh now
        const placeables = canvas.tokens?.placeables || [];
        let stale = false;
        if (placeables.length !== this.#lightEmittingTokensCache.length) {
          stale = true;
        } else {
          const byId = new Map(this.#lightEmittingTokensCache.map(t => [t.id, t]));
          for (const tok of placeables) {
            const c = byId.get(tok.id);
            if (!c) { stale = true; break; }
            const cx = tok.center?.x ?? tok.x;
            const cy = tok.center?.y ?? tok.y;
            const br = tok.document.light?.bright || tok.light?.bright || tok.document.config?.light?.bright || tok.document.data?.light?.bright || tok.data?.light?.bright || 0;
            const dr = tok.document.light?.dim || tok.light?.dim || tok.document.config?.light?.dim || tok.document.data?.light?.dim || tok.data?.light?.dim || 0;
            if (c.x !== cx || c.y !== cy || c.brightRadius !== br || c.dimRadius !== dr) { stale = true; break; }
          }
        }
        if (!stale) {
          if (log.enabled()) log.debug(() => ({ step: 'token-cache-hit', count: this.#lightEmittingTokensCache?.length || 0 }));
          return this.#lightEmittingTokensCache;
        }
      } catch { /* if any error, refresh below */ }
    }
    this.#refreshLightEmittingTokensCache();
    if (log.enabled()) log.debug(() => ({ step: 'token-cache-refreshed', count: this.#lightEmittingTokensCache?.length || 0 }));
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
        id: token.id,
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
    if (log.enabled()) log.debug(() => ({ step: 'invalidateLightCache' }));
  }

  /**
   * Clear the light cache (public API)
   */
  clearLightCache() {
    this.invalidateLightCache();
  }
}
