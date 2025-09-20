/**
 * Handles all vision-related analysis for the auto-visibility system
 * Manages vision capabilities, senses, line of sight, and caching
 * SINGLETON PATTERN
 */

import { MODULE_ID } from '../../constants.js';
import { getLogger } from '../../utils/logger.js';
const log = getLogger('VisionAnalyzer');

export class VisionAnalyzer {
  /** @type {VisionAnalyzer} */
  static #instance = null;

  #visionCapabilitiesCache = new Map();
  #visionCacheTimestamp = new Map();
  #visionCacheTimeout = 5000; // 5 second cache

  constructor() {
    if (VisionAnalyzer.#instance) {
      return VisionAnalyzer.#instance;
    }

    this.#visionCapabilitiesCache = new Map();
    this.#visionCacheTimestamp = new Map();

    VisionAnalyzer.#instance = this;
  }

  /**
   * Get the singleton instance
   * @returns {VisionAnalyzer}
   */
  static getInstance() {
    if (!VisionAnalyzer.#instance) {
      VisionAnalyzer.#instance = new VisionAnalyzer();
    }
    return VisionAnalyzer.#instance;
  }

  /**
   * Get vision capabilities for a token (with caching)
   * @param {Token} token
   * @returns {Object} Vision capabilities
   */
  getVisionCapabilities(token) {
    if (!token?.actor) {
      return { hasVision: false, hasDarkvision: false, hasLowLightVision: false, hasGreaterDarkvision: false };
    }

    const tokenId = token.document.id;
    const now = Date.now();

    // Check cache first
    if (this.#visionCapabilitiesCache.has(tokenId)) {
      const cacheTime = this.#visionCacheTimestamp.get(tokenId) || 0;
      if (now - cacheTime < this.#visionCacheTimeout) {
        return this.#visionCapabilitiesCache.get(tokenId);
      }
    }

    // Calculate vision capabilities
    const capabilities = this.#calculateVisionCapabilities(token);

    // Cache the result
    this.#visionCapabilitiesCache.set(tokenId, capabilities);
    this.#visionCacheTimestamp.set(tokenId, now);

    return capabilities;
  }

  /**
   * Parse an actor's senses into a normalized summary.
   * Supports both array (NPC) and object (PC) formats and values under value.*
   * Returns { precise: [{type, range}], imprecise: [{type, range}], hearing: { acuity, range }|null, echolocationActive, echolocationRange }
   * Note: This does not include normal visual sight; see getVisionCapabilities for that.
   */
  getSensingSummary(token) {
    const actor = token?.actor;
    const summary = {
      precise: [],
      imprecise: [],
      hearing: null,
      echolocationActive: false,
      echolocationRange: 0,
    };
    if (!actor) return summary;

    // Echolocation detection: prefer PF2e effect item (effect-echolocation) over our module flag
    try {
      const effects = actor.itemTypes?.effect ?? actor.items?.filter?.((i) => i?.type === 'effect') ?? [];
      const hasEchoEffect = !!effects?.some?.((e) => (e?.slug || e?.system?.slug || e?.name)?.toLowerCase?.() === 'effect-echolocation');
      if (hasEchoEffect) {
        summary.echolocationActive = true;
        summary.echolocationRange = 40; // RAW default; effect does not typically encode range separately
      } else {
        // Back-compat: support temporary module flag if present
        const echo = actor.getFlag?.('pf2e-visioner', 'echolocation') || null;
        if (echo?.active) {
          summary.echolocationActive = true;
          summary.echolocationRange = Number(echo.range) || 40;
        }
      }
    } catch { /* ignore */ }

    let senses = null;
    try {
      senses = actor.system?.perception?.senses ?? actor.perception?.senses ?? null;
    } catch { /* ignore */ }
    if (!senses) return summary;

    const pushSense = (type, acuity, range) => {
      const r = Number(range);
      const entry = { type: String(type || '').toLowerCase(), range: Number.isFinite(r) ? r : Infinity };
      const a = String(acuity || '').toLowerCase();
      if (entry.type === 'hearing') {
        summary.hearing = { acuity: a || 'imprecise', range: entry.range };
      }
      if (a === 'precise') summary.precise.push(entry);
      else if (a === 'imprecise' || a === 'vague' || !a) summary.imprecise.push(entry);
      else summary.imprecise.push(entry);
    };

    try {
      if (Array.isArray(senses)) {
        for (const s of senses) {
          const type = s?.type ?? s?.slug ?? s?.name ?? s?.label;
          const val = s?.value ?? s;
          const acuity = val?.acuity ?? s?.acuity ?? val?.value;
          const range = val?.range ?? s?.range;
          pushSense(type, acuity, range);
        }
      } else if (typeof senses === 'object') {
        for (const [type, obj] of Object.entries(senses)) {
          const val = obj?.value ?? obj;
          const acuity = val?.acuity ?? obj?.acuity ?? val?.value;
          const range = val?.range ?? obj?.range;
          pushSense(type, acuity, range);
        }
      }
    } catch { /* ignore */ }

    // Upgrade hearing to precise within echolocation range when active
    try {
      if (summary.hearing && summary.echolocationActive) {
        const r = summary.echolocationRange || summary.hearing.range || 40;
        // Represent precise-hearing as a precise sense with capped range
        summary.precise.push({ type: 'hearing', range: r });
      }
    } catch { /* ignore */ }

    return summary;
  }

  /**
   * Return whether any imprecise sense can reach the target.
   */
  canSenseImprecisely(observer, target) {
    try {
      const s = this.getSensingSummary(observer);
      if (!s.imprecise.length && !s.hearing) return false;
      const dist = this.#distanceFeet(observer, target);
      for (const ent of s.imprecise) {
        if (!ent || typeof ent.range !== 'number') continue;
        if (ent.range === Infinity || ent.range >= dist) return true;
      }
      if (s.hearing) {
        const hr = Number(s.hearing.range);
        if (!Number.isFinite(hr) || hr >= dist) return true;
      }
    } catch { }
    return false;
  }

  /**
   * Whether any precise non-visual sense can reach the target (includes echolocation precise-hearing when active)
   */
  hasPreciseNonVisualInRange(observer, target) {
    try {
      const s = this.getSensingSummary(observer);
      if (!s.precise.length) return false;
      const dist = this.#distanceFeet(observer, target);
      for (const ent of s.precise) {
        if (!ent || typeof ent.range !== 'number') continue;
        if (ent.type === 'vision' || ent.type === 'sight') continue;
        if (ent.range === Infinity || ent.range >= dist) return true;
      }
    } catch { }
    return false;
  }

  /**
   * Check if environment distorts hearing for this observer (e.g., noisy room)
   */
  isHearingDistorted(observer) {
    // Noisy environment feature removed; hearing is not distorted by environment.
    void observer; // satisfy linter
    return false;
  }

  /**
   * Distance between tokens in feet (center-to-center)
   * @private
   */
  #distanceFeet(a, b) {
    try {
      const dx = a.center.x - b.center.x;
      const dy = a.center.y - b.center.y;
      const px = Math.hypot(dx, dy);
      const gridSize = canvas?.grid?.size || 100;
      const unitDist = canvas?.scene?.grid?.distance || 5;
      return (px / gridSize) * unitDist;
    } catch { return Infinity; }
  }

  /**
   * Calculate vision capabilities for a token
   * @param {Token} token
   * @returns {Object} Vision capabilities
   */
  #calculateVisionCapabilities(token) {
    const actor = token.actor;
    if (!actor) {
      return { hasVision: false, hasDarkvision: false, hasLowLightVision: false, hasGreaterDarkvision: false };
    }

    let hasVision = true;
    let hasDarkvision = false;
    let hasLowLightVision = false;
    let hasGreaterDarkvision = false;
    let darkvisionRange = 0;
    let lowLightRange = 0;
    let isBlinded = false;
    let isDazzled = false;

    try {
      // Local helper to normalize slugs/names for robust matching
      const normalizeSlug = (value = '') => {
        try {
          const lower = String(value).toLowerCase();
          const noApos = lower.replace(/\u2019/g, "'").replace(/'+/g, '');
          return noApos.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        } catch {
          return value;
        }
      };
      // Check for blinded and dazzled conditions first (these override other vision capabilities)
      isBlinded = this.#hasCondition(actor, 'blinded');
      isDazzled = this.#hasCondition(actor, 'dazzled');

      // Blinded overrides dazzled and disables all vision
      if (isBlinded) {
        hasVision = false;
      }

      // Check if actor has vision at all
      if (actor.system?.perception?.vision === false) {
        hasVision = false;
      }

      // Multiple paths to check for senses
      let senses = null;

      // Try different property paths for senses
      if (actor.system?.perception?.senses) {
        senses = actor.system.perception.senses;
      } else if (actor.perception?.senses) {
        senses = actor.perception.senses;
      }

      if (senses) {
        // Handle senses as array (NPCs) or object (PCs)
        if (Array.isArray(senses)) {
          // NPC format: array of sense objects
          for (const sense of senses) {
            if (sense.type === 'greater-darkvision' || sense.type === 'greaterDarkvision') {
              hasDarkvision = true;
              hasGreaterDarkvision = true;
              darkvisionRange = sense.range || Infinity;
            } else if (sense.type === 'darkvision') {
              hasDarkvision = true;
              darkvisionRange = sense.range || Infinity;
            } else if (sense.type === 'low-light-vision') {
              hasLowLightVision = true;
              lowLightRange = sense.range || Infinity;
            }
          }
        } else {
          // PC format: object with sense properties
          if (senses['greater-darkvision'] || senses.greaterDarkvision) {
            hasDarkvision = true;
            hasGreaterDarkvision = true;
            darkvisionRange = (senses['greater-darkvision']?.range || senses.greaterDarkvision?.range || Infinity);
          }
          if (senses.darkvision) {
            hasDarkvision = true;
            darkvisionRange = senses.darkvision.range || Infinity;
          }
          if (senses['low-light-vision']) {
            hasLowLightVision = true;
            lowLightRange = senses['low-light-vision'].range || Infinity;
          }
        }
      }

      // Fallback: check direct properties on actor
      if (!hasDarkvision && (actor.darkvision || actor.system?.darkvision)) {
        hasDarkvision = true;
        darkvisionRange = actor.darkvision || actor.system?.darkvision || Infinity;
      }

      // Greater darkvision via flags or custom fields
      if (!hasGreaterDarkvision && (actor['greater-darkvision'] || actor.system?.['greater-darkvision'])) {
        hasDarkvision = true;
        hasGreaterDarkvision = true;
        darkvisionRange = actor['greater-darkvision'] || actor.system?.['greater-darkvision'] || darkvisionRange || Infinity;
      }

      if (!hasLowLightVision && (actor['low-light-vision'] || actor.system?.['low-light-vision'])) {
        hasLowLightVision = true;
        lowLightRange = actor['low-light-vision'] || actor.system?.['low-light-vision'] || Infinity;
      }

      // Check flags as additional fallback
      const flags = actor.flags || {};
      if (!hasDarkvision && flags.darkvision) {
        hasDarkvision = true;
        darkvisionRange = flags.darkvision.range || Infinity;
      }
      if (!hasGreaterDarkvision && (flags['greater-darkvision'] || flags.greaterDarkvision)) {
        hasDarkvision = true;
        hasGreaterDarkvision = true;
        darkvisionRange = (flags['greater-darkvision']?.range || flags.greaterDarkvision?.range || darkvisionRange || Infinity);
      }
      if (!hasLowLightVision && flags['low-light-vision']) {
        hasLowLightVision = true;
        lowLightRange = flags['low-light-vision'].range || Infinity;
      }

      // New: support PF2e ancestry feat "Greater Darkvision" for PCs that don't list a separate sense
      if (!hasGreaterDarkvision) {
        try {
          const feats = actor.itemTypes?.feat
            ?? (actor.items?.filter?.((i) => i?.type === 'feat') || []);
          const hasFeat = !!feats?.some?.((it) => normalizeSlug(it?.system?.slug ?? it?.slug ?? it?.name) === 'greater-darkvision');
          if (hasFeat) {
            hasGreaterDarkvision = true;
            hasDarkvision = true;
            if (!darkvisionRange) darkvisionRange = Infinity;
          }
        } catch { /* ignore feat read errors */ }
      }
    } catch {
    }

    const result = {
      hasVision,
      hasDarkvision,
      hasLowLightVision,
      darkvisionRange,
      lowLightRange,
      isBlinded,
      isDazzled,
      hasGreaterDarkvision,
    };

    return result;
  }

  /**
   * Check if observer has line of sight to target
   * @param {Token} observer
   * @param {Token} target
   * @returns {boolean}
   */
  hasLineOfSight(observer, target, raw = false) {
    if (!observer || !target) return false;

    try {
      if (raw) {
        const res = this.#hasDirectLineOfSight(observer, target);
        if (log.enabled()) log.debug(() => ({ step: 'los-raw', observer: observer?.name, target: target?.name, res }));
        return res;
      }
      // Special handling for sneaking tokens - bypass Foundry's detection system
      // to avoid interference from detection wrapper
      const isTargetSneaking = target.document.getFlag('pf2e-visioner', 'sneak-active');
      const isObserverSneaking = observer.document.getFlag('pf2e-visioner', 'sneak-active');

      if (isTargetSneaking || isObserverSneaking) {
        // For sneaking tokens, use direct ray casting instead of Foundry's testVisibility
        // This bypasses the detection wrapper and gives us true line-of-sight
        return this.#hasDirectLineOfSight(observer, target);
      }

      // For normal tokens, use FoundryVTT's built-in visibility testing
      const result = canvas.visibility.testVisibility(target.center, {
        tolerance: 0,
        object: target,
      });
      if (log.enabled()) log.debug(() => ({ step: 'los-foundry', observer: observer?.name, target: target?.name, result }));

      return result;
    } catch (error) {
      console.warn(`${MODULE_ID} | Error testing line of sight:`, error);
      return false;
    }
  }

  /**
   * Direct line-of-sight check that bypasses Foundry's detection system
   * @param {Token} observer
   * @param {Token} target
   * @returns {boolean}
   * @private
   */
  #hasDirectLineOfSight(observer, target) {
    try {
      // Use Foundry's walls collision test for sight. This checks only topology (walls),
      // bypassing detection modes/wrappers that affect canvas.visibility.testVisibility.
      const RayClass = foundry?.canvas?.geometry?.Ray || foundry?.utils?.Ray;
      const ray = new RayClass(observer.center, target.center);
      const blocked = canvas.walls?.checkCollision?.(ray, { type: 'sight' }) ?? false;
      const res = !blocked;
      if (log.enabled()) log.debug(() => ({ step: 'raycast-sight', observer: observer?.name, target: target?.name, blocked, res }));
      return res;
    } catch (error) {
      console.warn(`${MODULE_ID} | Error in direct line of sight check:`, error);
      // Fallback to Foundry's method if direct check fails
      return canvas.visibility.testVisibility(target.center, {
        tolerance: 0,
        object: target,
      });
    }
  }

  /**
   * Check if observer can detect target without sight (special senses)
   * @param {Token} observer
   * @param {Token} target
   * @returns {boolean}
   */
  canDetectWithoutSight(observer, target) {
    if (!observer?.actor || !target?.actor) return false;

    // Blinded creatures might still have special senses
    // Check for special senses that work without vision
    // This could be expanded for tremorsense, echolocation, etc.

    // TODO: Implement special senses detection
    // const observerCapabilities = this.getVisionCapabilities(observer);
    // Check observerCapabilities for tremorsense, echolocation, scent, etc.

    // For now, return false - most creatures rely on vision
    // Future enhancement: check for tremorsense, echolocation, scent, etc.
    return false;
  }

  /**
   * Determine visibility based on lighting conditions and observer's vision
   * @param {Object} lightLevel - Light level information from LightingCalculator
   * @param {Object} observerVision - Vision capabilities from getVisionCapabilities
   * @param {Token} target - The target token (for sneaking checks)
   * @returns {string} Visibility state
   */
  determineVisibilityFromLighting(lightLevel, observerVision) {
    if (log.enabled()) log.debug(() => ({ step: 'determineVisibility', lightLevel: lightLevel?.level, observerVision }));
    // Blinded: Can't see anything (handled by hasVision = false)
    if (!observerVision.hasVision) {
      return 'hidden';
    }

    // Dazzled: If vision is only precise sense, everything is concealed
    // Note: In PF2E, most creatures only have vision as their precise sense
    // unless they have special senses like tremorsense, echolocation, etc.
    if (observerVision.isDazzled) {
      // For simplicity, we assume vision is the only precise sense for most creatures
      // This could be enhanced later to check for other precise senses
      return 'concealed';
    }

    let result;
    const isMagicalDarkness = !!lightLevel?.isMagicalDarkness; // tagged by LightingCalculator when magical darkness
    const darknessRank = Number(lightLevel?.darknessRank || 0) || 0;
    switch (lightLevel.level) {
      case 'bright':
        result = 'observed';
        break;

      case 'dim':
        if (observerVision.hasLowLightVision || observerVision.hasDarkvision) {
          result = 'observed';
        } else {
          result = 'concealed';
        }
        break;

      case 'darkness':
        if (isMagicalDarkness) {
          // Heightened darkness (rank >= 4): darkvision becomes concealed; greater darkvision still observed
          if (observerVision.hasGreaterDarkvision) result = 'observed';
          else if (darknessRank >= 4 && observerVision.hasDarkvision) result = 'concealed';
          else result = 'hidden';
        } else if (observerVision.hasDarkvision) {
          result = 'observed';
        } else {
          result = 'hidden';
        }
        break;

      default:
        result = 'observed';
    }

    return result;
  }

  /**
   * Invalidate vision cache for a specific token or all tokens
   * @param {string} [tokenId] - Specific token ID, or undefined to clear all
   */
  invalidateVisionCache(tokenId = null) {
    if (tokenId) {
      this.#visionCapabilitiesCache.delete(tokenId);
      this.#visionCacheTimestamp.delete(tokenId);
    } else {
      this.#visionCapabilitiesCache.clear();
      this.#visionCacheTimestamp.clear();
    }
  }

  /**
   * Clear vision cache (public API)
   * @param {string} actorId - Optional actor ID to clear specific cache entry
   */
  clearVisionCache(actorId = null) {
    if (actorId) {
      // Clear cache for specific actor
      this.#visionCapabilitiesCache.delete(actorId);
      this.#visionCacheTimestamp.delete(actorId);
    } else {
      // Clear entire cache
      this.invalidateVisionCache();
    }
  }

  /**
   * Check if an actor has a specific condition
   * @param {Actor} actor
   * @param {string} conditionSlug - The condition slug (e.g., 'blinded', 'dazzled')
   * @returns {boolean}
   * @private
   */
  #hasCondition(actor, conditionSlug) {
    try {
      // Try multiple methods to detect conditions in PF2E

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

      // Method 4: Iterate through conditions collection
      if (actor.conditions) {
        try {
          return actor.conditions.some(
            (condition) => condition.slug === conditionSlug || condition.key === conditionSlug,
          );
        } catch {
          // Ignore iteration errors
        }
      }

      return false;
    } catch (error) {
      console.warn(
        `${MODULE_ID} | Error checking condition ${conditionSlug} for ${actor.name}:`,
        error,
      );
      return false;
    }
  }
}
