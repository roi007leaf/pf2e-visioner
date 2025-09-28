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
      return {
        hasVision: false,
        hasDarkvision: false,
        hasLowLightVision: false,
        hasGreaterDarkvision: false,
      };
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
   * Check if a target can be detected by lifesense based on creature type and traits
   * Lifesense can detect living creatures (vitality energy) and undead creatures (void energy)
   * @param {Token} target - The target token to check
   * @returns {boolean} True if the target can be detected by lifesense
   */
  canDetectWithLifesense(target) {
    try {
      const actor = target?.actor;
      if (!actor) return false;

      // Check creature type
      const creatureType = actor.system?.details?.creatureType || actor.type;

      // Lifesense CANNOT detect these truly non-living, non-undead creature types
      const nonDetectableTypes = ['construct'];
      if (nonDetectableTypes.includes(creatureType)) return false;

      // Check traits for construct trait (some creatures might have construct trait but different type)
      const traits = actor.system?.traits?.value || actor.system?.details?.traits?.value || [];
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

      // Lifesense can detect undead creatures (void energy)
      if (creatureType === 'undead') return true;
      if (
        Array.isArray(traits) &&
        traits.some((trait) =>
          typeof trait === 'string'
            ? trait.toLowerCase() === 'undead'
            : trait?.value?.toLowerCase() === 'undead',
        )
      ) {
        return true;
      }

      // Check for explicit living trait
      if (
        Array.isArray(traits) &&
        traits.some((trait) =>
          typeof trait === 'string'
            ? trait.toLowerCase() === 'living'
            : trait?.value?.toLowerCase() === 'living',
        )
      ) {
        return true;
      }

      // Default to detectable for unknown types (most creatures have either vitality or void energy)
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if a target can be detected by a specific special sense
   * @param {Token} target - The target token to check
   * @param {string} senseType - The type of special sense (lifesense, echolocation, etc.)
   * @returns {boolean} True if detectable by the sense
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

  /**
   * Parse an actor's senses into a normalized summary.
   * Supports both array (NPC) and object (PC) formats and values under value.*
   * Returns { precise: [{type, range}], imprecise: [{type, range}], hearing: { acuity, range }|null, echolocationActive, echolocationRange, lifesense: { range }|null }
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
      lifesense: null,
    };
    if (!actor) return summary;

    // Echolocation detection: prefer PF2e effect item (effect-echolocation) over our module flag
    try {
      const effects =
        actor.itemTypes?.effect ?? actor.items?.filter?.((i) => i?.type === 'effect') ?? [];
      const hasEchoEffect = !!effects?.some?.(
        (e) => (e?.slug || e?.system?.slug || e?.name)?.toLowerCase?.() === 'effect-echolocation',
      );
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
    } catch {
      /* ignore */
    }

    let senses = null;
    try {
      senses = actor.system?.perception?.senses ?? actor.perception?.senses ?? null;

    } catch {
      /* ignore */
    }

    // If no senses found in traditional location or empty array/collection, check detectionModes as fallback
    const shouldFallback = !senses || (Array.isArray(senses) && senses.length === 0) || (senses?.size !== undefined && senses.size === 0);
    if (shouldFallback || token.name === 'Kyra') {
      try {
        const detectionModes = token.document?.detectionModes ?? [];

        if (Array.isArray(detectionModes) && detectionModes.length > 0) {
          senses = detectionModes.filter(dm => dm.enabled && dm.id !== 'basicSight' && dm.id !== 'lightPerception');
        }
      } catch {
        /* ignore */
      }
    }

    if (!senses) return summary;

    const pushSense = (type, acuity, range) => {
      const r = Number(range);
      const entry = {
        type: String(type || '').toLowerCase(),
        range: Number.isFinite(r) ? r : Infinity,
      };
      let a = String(acuity || 'imprecise').toLowerCase();

      // Skip visual senses if blinded
      if ((entry.type === 'vision' ||
        entry.type === 'sight' ||
        entry.type === 'darkvision' ||
        entry.type === 'greater-darkvision' ||
        entry.type === 'greaterdarkvision' ||
        entry.type === 'low-light-vision' ||
        entry.type === 'lowlightvision' ||
        entry.type.includes('vision') ||
        entry.type.includes('sight')) && this.#isBlinded(token)) {
        return; // Skip all visual senses if blinded
      }

      // Special case: hearing blocked by deafened condition
      if (entry.type === 'hearing' && this.#isDeafened(token)) {
        return; // Skip hearing if deafened
      }

      // Special case: echolocation upgrades hearing to precise within echolocation range
      if (entry.type === 'hearing' && summary.echolocationActive) {
        a = 'precise';
        entry.range = summary.echolocationRange || 40; // Use echolocation range
      }

      // Store hearing separately for backward compatibility
      if (entry.type === 'hearing') {
        summary.hearing = { acuity: a, range: entry.range };
      }

      // Store lifesense separately for backward compatibility  
      if (entry.type === 'lifesense') {
        summary.lifesense = { range: entry.range };
      }

      // Store other senses separately for backward compatibility (tremorsense, scent, etc.)
      if (entry.type !== 'hearing' && entry.type !== 'lifesense') {
        summary[entry.type] = { range: entry.range };
      }

      // Add to appropriate acuity array based on final acuity value
      if (a === 'precise') {
        summary.precise.push(entry);
      } else {
        // imprecise, vague, or default to imprecise
        summary.imprecise.push(entry);
      }
    };

    try {
      if (Array.isArray(senses)) {
        for (const s of senses) {
          // Check if this is a detection mode (has id but no traditional sense properties)
          if (s?.id && !s?.type && !s?.slug && !s?.name && !s?.label) {
            // This is a detection mode format
            const detectionType = s.id;
            const range = s.range;
            let acuity;

            // Set default acuity based on detection mode type
            if (detectionType === 'hearing') {
              acuity = 'imprecise'; // Hearing is typically imprecise
            } else if (detectionType === 'tremorsense' || detectionType === 'blindsight') {
              acuity = 'precise'; // These are typically precise
            } else {
              acuity = 'imprecise'; // Default to imprecise for unknown types
            }

            pushSense(detectionType, acuity, range);
          } else {
            // Handle traditional senses format
            const type = s?.type ?? s?.slug ?? s?.name ?? s?.label ?? s?.id;
            const val = s?.value ?? s;
            let acuity = val?.acuity ?? s?.acuity ?? val?.value;
            let range = val?.range ?? s?.range;

            pushSense(type, acuity, range);
          }
        }
      } else if (typeof senses === 'object') {
        for (const [type, obj] of Object.entries(senses)) {
          const val = obj?.value ?? obj;
          const acuity = val?.acuity ?? obj?.acuity ?? val?.value;
          const range = val?.range ?? obj?.range;
          pushSense(type, acuity, range);
        }
      }
    } catch {
      /* ignore */
    }

    return summary;
  }

  /**
   * Check if lifesense can detect the target
   * @param {Token} observer - The observing token
   * @param {Token} target - The target token
   * @returns {boolean} True if lifesense can detect the target
   */
  canDetectWithLifesenseInRange(observer, target) {
    try {
      const s = this.getSensingSummary(observer);
      if (!s.lifesense) return false;

      // Check if target can be detected by lifesense (living/undead)
      if (!this.canDetectWithLifesense(target)) return false;

      // Check range
      const dist = this.#distanceFeet(observer, target);
      const range = Number(s.lifesense.range);
      return Number.isFinite(range) ? range >= dist : true;
    } catch {
      return false;
    }
  }

  /**
   * Return whether any imprecise sense can reach the target.
   */
  canSenseImprecisely(observer, target) {
    try {
      const s = this.getSensingSummary(observer);
      const dist = this.#distanceFeet(observer, target);



      if (!s.imprecise.length && !s.hearing) return false;

      // Check regular imprecise senses (including lifesense)
      for (const ent of s.imprecise) {
        if (!ent || typeof ent.range !== 'number') continue;

        // Special handling for lifesense - must check if target is detectable
        if (ent.type === 'lifesense') {
          if (
            this.canDetectWithLifesense(target) &&
            (ent.range === Infinity || ent.range >= dist)
          ) {
            return true;
          }
          continue;
        }

        // Special handling for tremorsense - target must be in contact with ground (elevation 0)
        if (ent.type === 'tremorsense') {
          const targetElevation = target?.document?.elevation || 0;
          if (targetElevation > 0) {
            continue; // Cannot detect flying/elevated creatures with tremorsense
          }
        }

        // Regular imprecise senses
        if (ent.range === Infinity || ent.range >= dist) {
          return true;
        }
      }

      // Check hearing
      if (s.hearing) {
        const hr = Number(s.hearing.range);
        if (!Number.isFinite(hr) || hr >= dist) {
          return true;
        }
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
        // Exclude all visual senses: plain vision/sight, darkvision, greater-darkvision, low-light-vision, truesight, infrared vision, etc.
        // Exception: see-invisibility is treated as non-visual for invisibility detection purposes
        const t = String(ent.type || '').toLowerCase();
        const isVisual =
          t === 'vision' ||
          t === 'sight' ||
          t === 'darkvision' ||
          t === 'greater-darkvision' ||
          t === 'greaterdarkvision' ||
          t === 'low-light-vision' ||
          t === 'lowlightvision' ||
          t.includes('vision') ||
          t.includes('sight');

        // Special case: see-invisibility should not be excluded even though it contains "sight"
        const isSeeInvisibility = t === 'see-invisibility' || t === 'seeinvisibility';

        if (isVisual && !isSeeInvisibility) continue;

        // Special check for echolocation - requires hearing (can't use if deafened)
        if (t === 'echolocation' && this.#isDeafened(observer)) continue;

        // Special check for tremorsense - target must be in contact with ground (elevation 0)
        if (t === 'tremorsense') {
          const targetElevation = target?.document?.elevation || 0;
          if (targetElevation > 0) {
            continue; // Cannot detect flying/elevated creatures with tremorsense
          }
        }

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
    } catch {
      return Infinity;
    }
  }

  /**
   * Calculate vision capabilities for a token
   * @param {Token} token
   * @returns {Object} Vision capabilities
   */
  #calculateVisionCapabilities(token) {
    const actor = token.actor;
    if (!actor) {
      return {
        hasVision: false,
        hasDarkvision: false,
        hasLowLightVision: false,
        hasGreaterDarkvision: false,
      };
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
            darkvisionRange =
              senses['greater-darkvision']?.range || senses.greaterDarkvision?.range || Infinity;
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
      if (
        !hasGreaterDarkvision &&
        (actor['greater-darkvision'] || actor.system?.['greater-darkvision'])
      ) {
        hasDarkvision = true;
        hasGreaterDarkvision = true;
        darkvisionRange =
          actor['greater-darkvision'] ||
          actor.system?.['greater-darkvision'] ||
          darkvisionRange ||
          Infinity;
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
        darkvisionRange =
          flags['greater-darkvision']?.range ||
          flags.greaterDarkvision?.range ||
          darkvisionRange ||
          Infinity;
      }
      if (!hasLowLightVision && flags['low-light-vision']) {
        hasLowLightVision = true;
        lowLightRange = flags['low-light-vision'].range || Infinity;
      }

      // New: support PF2e ancestry feat "Greater Darkvision" for PCs that don't list a separate sense
      if (!hasGreaterDarkvision) {
        try {
          const feats =
            actor.itemTypes?.feat ?? (actor.items?.filter?.((i) => i?.type === 'feat') || []);
          const hasFeat = !!feats?.some?.(
            (it) =>
              normalizeSlug(it?.system?.slug ?? it?.slug ?? it?.name) === 'greater-darkvision',
          );
          if (hasFeat) {
            hasGreaterDarkvision = true;
            hasDarkvision = true;
            if (!darkvisionRange) darkvisionRange = Infinity;
          }
        } catch (error) {
          /* ignore feat read errors */
        }
      }
    } catch { }

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
      // First check if the observer has vision capabilities at all
      // Creatures with "no vision" cannot have line of sight to anything
      const observerCapabilities = this.getVisionCapabilities(observer);
      if (!observerCapabilities.hasVision) {
        if (log.enabled())
          log.debug(() => ({
            step: 'los-no-vision',
            observer: observer?.name,
            target: target?.name,
            result: false,
            reason: 'observer has no vision'
          }));
        return false;
      }

      // Always use direct line-of-sight check for LOS filtering
      // canvas.visibility.testVisibility() is designed for current observer vision,
      // not for arbitrary token-to-token line of sight checks
      const res = this.#hasDirectLineOfSight(observer, target);

      if (log.enabled())
        log.debug(() => ({
          step: 'los-check',
          observer: observer?.name,
          target: target?.name,
          result: res,
          method: 'direct'
        }));

      return res;
    } catch (error) {
      console.warn(`${MODULE_ID} | Error testing line of sight:`, error);
      return false;
    }
  }

  /**
 * True if source can detect target via the 'feelTremor' detection mode.
 * (Respects range/angle/ground rules from the mode; ignores walls because walls:false.)
 */
  canDetectViaTremor(sourceToken, targetToken) {
    const modeData = sourceToken.document.detectionModes?.find(dm => dm.id === "feelTremor" && dm.enabled !== false);
    if (!modeData) return false;
    const mode = CONFIG.Canvas.detectionModes[modeData.id];
    const visionSource = sourceToken.vision;
    if (!mode || !visionSource) return false;

    const point = targetToken.getCenterPoint(targetToken.center.x, targetToken.center.y);
    const tests = [{ point, los: new Map() }];
    return !!mode.testVisibility(visionSource, modeData, { object: targetToken, tests });
  }

  /**
   * True if there is a *wall* blocking direct 'sight' between source and target.
   * This ignores FOV/angles and only asks "is there a sight-type wall in between?"
   */
  isBehindWall(sourceToken, targetToken) {
    const origin = sourceToken.getCenterPoint({ elevation: sourceToken.document.elevation });
    const dest = targetToken.getCenterPoint({ elevation: targetToken.document.elevation });

    // Preferred: use the sight polygon backend's collision test
    const backend = CONFIG.Canvas.polygonBackends?.sight;
    if (backend?.testCollision) {
      // mode:"any" → return truthy if any wall collides
      return !!backend.testCollision(origin, dest, {
        type: "sight",
        mode: "any",
        // Supplying the vision source can let the backend apply relevant filters
        source: sourceToken.vision
      });
    }

    // Fallback (older/alt builds): use the walls layer API if present
    if (canvas.walls?.checkCollision) {
      return !!canvas.walls.checkCollision(origin, dest, { type: "sight" });
    }
    if (canvas.walls?.testCollision) {
      const ray = new foundry.canvas.geometry.Ray(origin, dest);
      return !!canvas.walls.testCollision(ray, { type: "sight" });
    }

    console.warn("No wall-collision API available");
    debugger;
    return false;
  }

  /**
   * Combined helper: can detect via tremor, and if so, whether that’s through a wall.
   */
  tremorDetectionResult(sourceToken, targetToken) {
    const detectable = this.canDetectViaTremor(sourceToken, targetToken);
    debugger;
    if (!detectable) return { detectable: false, throughWall: false };

    // If detectable and a sight wall is between → it's a through-wall tremor detection
    const throughWall = this.isBehindWall(sourceToken, targetToken);
    return { detectable: true, throughWall };
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
      // Use proper sight-based wall collision check for visual line of sight
      // This should NOT use tremor detection, which ignores walls
      return this.#fallbackWallCollisionCheck(observer, target);
    } catch (error) {
      console.warn(`${MODULE_ID} | Error in vision polygon check:`, error);
      // Fallback to wall collision detection on error
      return this.#fallbackWallCollisionCheck(observer, target);
    }
  }

  /**
   * Fallback wall collision check when vision polygon is unavailable
   * @param {Token} observer
   * @param {Token} target
   * @returns {boolean}
   * @private
   */
  #fallbackWallCollisionCheck(observer, target) {
    try {
      let blocked = false;

      try {
        const sightBlocked = CONFIG.Canvas?.polygonBackends?.sight?.testCollision?.(
          observer.center,
          target.center,
          { type: "sight", mode: "any" }
        ) ?? false;

        const soundBlocked = CONFIG.Canvas?.polygonBackends?.sound?.testCollision?.(
          observer.center,
          target.center,
          { type: "sound", mode: "any" }
        ) ?? false;

        // Only consider truly blocked if BOTH sight and sound are blocked
        // This helps filter out darkness light sources that only block sight
        blocked = sightBlocked && soundBlocked;

        // For visibility calculations, only sight blocking matters
        // Walls that block sight (but not sound) should still make tokens hidden
        blocked = sightBlocked;
      } catch (e) {
        // Fallback to canvas.walls.checkCollision if polygonBackends fails
        try {
          const RayClass = foundry?.canvas?.geometry?.Ray || foundry?.utils?.Ray;
          const ray = new RayClass(observer.center, target.center);
          blocked = canvas.walls?.checkCollision?.(ray, { type: 'sight' }) ?? false;
        } catch (e2) {
          return false; // If all methods fail, assume no LOS
        }
      }

      const res = !blocked;
      if (log.enabled())
        log.debug(() => ({
          step: 'fallback-wall-collision',
          observer: observer?.name,
          target: target?.name,
          blocked,
          res,
        }));
      return res;
    } catch (error) {
      console.warn(`${MODULE_ID} | Error in fallback wall collision check:`, error);
      return false;
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
    if (log.enabled())
      log.debug(() => ({
        step: 'determineVisibility',
        lightLevel: lightLevel?.level,
        observerVision,
      }));

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

      case 'darkness': {
        // Check for heightened darkness (rank 4+ spells)
        const darknessRank = lightLevel?.darknessRank || 1;

        if (darknessRank >= 4) {
          // Rank 4+ darkness: heightened darkness rules
          if (observerVision.hasGreaterDarkvision) {
            result = 'observed';
          } else if (observerVision.hasDarkvision) {
            result = 'concealed';
          } else {
            result = 'hidden';
          }
        } else {
          // Rank 1-3 darkness: normal darkvision behavior
          if (observerVision.hasDarkvision || observerVision.hasGreaterDarkvision) {
            result = 'observed';
          } else {
            result = 'hidden';
          }
        }
        break;
      }

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
   * Check if an observer is deafened (cannot hear anything)
   * @param {Token} observer
   * @returns {boolean}
   * @private
   */
  #isDeafened(observer) {
    return this.#hasCondition(observer?.actor, 'deafened');
  }

  /**
   * Check if an observer is blinded (cannot see anything)
   * @param {Token} observer
   * @returns {boolean}
   * @private
   */
  #isBlinded(observer) {
    return this.#hasCondition(observer?.actor, 'blinded');
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

  /**
   * Check if observer can detect elevated targets
   * @param {Token} observer - The observing token
   * @param {Token} target - The target token
   * @returns {boolean} True if observer can detect elevated targets
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

    // Get sensing summary to check what senses the observer has
    const sensingSummary = this.getSensingSummary(observer, observer.actor);

    // Check for senses that can work across elevation differences
    // Visual senses (darkvision, low-light vision) can see elevated targets if there's line of sight
    const observerVision = this.getVisionCapabilities(observer);
    if (observerVision.hasDarkvision || observerVision.hasLowLightVision || observerVision.hasVision) {
      return true;
    }

    // Echolocation can detect flying/elevated targets  
    if (sensingSummary.echolocation) {
      return true;
    }

    // Scent can potentially detect elevated targets (depending on air currents, etc.)
    if (sensingSummary.scent) {
      return true;
    }

    // Check if observer ONLY has ground-based senses like tremorsense
    const hasOnlyGroundBasedSenses = sensingSummary.tremorsense &&
      !observerVision.hasDarkvision &&
      !observerVision.hasLowLightVision &&
      !observerVision.hasVision &&
      !sensingSummary.echolocation &&
      !sensingSummary.scent;

    if (hasOnlyGroundBasedSenses) {
      return false;
    }

    // If we get here, observer likely has some form of non-ground-based sense
    return true;
  }

  /**
   * Check if observer has tremorsense in range of target
   * @param {Token} observer - The observing token
   * @param {Token} target - The target token
   * @returns {boolean} True if observer has tremorsense that can reach the target
   */
  hasTremorsenseInRange(observer, target) {
    try {
      const sensingSummary = this.getSensingSummary(observer);

      // Check if observer has tremorsense
      if (!sensingSummary || !sensingSummary.tremorsense) {
        return false;
      }

      const dist = this.#distanceFeet(observer, target);
      const tremorsenseRange = sensingSummary.tremorsense.range;

      // Check if target is within tremorsense range
      return tremorsenseRange === Infinity || tremorsenseRange >= dist;
    } catch {
      return false;
    }
  }


}
