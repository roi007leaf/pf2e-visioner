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

    const tokenId = token?.document?.id || token?.id || 'unknown';
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
   * DEPRECATED: Use getVisionCapabilities instead for comprehensive data
   * This method now delegates to getVisionCapabilities for consistency
   */
  getSensingSummary(token) {
    // Delegate to the comprehensive getVisionCapabilities method
    const capabilities = this.getVisionCapabilities(token);

    // Return only the sensing summary portion for backward compatibility
    return {
      precise: capabilities.precise || [],
      imprecise: capabilities.imprecise || [],
      hearing: capabilities.hearing || null,
      echolocationActive: capabilities.echolocationActive || false,
      echolocationRange: capabilities.echolocationRange || 0,
      lifesense: capabilities.lifesense || null,
      // Include individual senses for backward compatibility
      ...Object.fromEntries(
        Object.entries(capabilities).filter(
          ([key]) =>
            ![
              'hasVision',
              'hasDarkvision',
              'hasLowLightVision',
              'darkvisionRange',
              'lowLightRange',
              'isBlinded',
              'isDazzled',
              'hasGreaterDarkvision',
              'detectionModes',
              'precise',
              'imprecise',
              'hearing',
              'echolocationActive',
              'echolocationRange',
              'lifesense',
            ].includes(key),
        ),
      ),
    };
  }

  /**
   * Check if lifesense can detect the target
   * @param {Token} observer - The observing token
   * @param {Token} target - The target token
   * @returns {boolean} True if lifesense can detect the target
   */
  canDetectWithLifesenseInRange(observer, target) {
    try {
      const capabilities = this.getVisionCapabilities(observer);
      if (!capabilities.lifesense) return false;

      // Check if target can be detected by lifesense (living/undead)
      if (!this.canDetectWithLifesense(target)) return false;

      // Check range
      const dist = this.distanceFeet(observer, target);
      const range = Number(capabilities.lifesense.range);
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
      const capabilities = this.getVisionCapabilities(observer);
      const dist = this.distanceFeet(observer, target);
      const targetElevation = target?.document?.elevation || 0;
      const observerElevation = observer?.document?.elevation || 0;

      if (!capabilities.imprecise.length && !capabilities.hearing) {
        return false;
      } // Check regular imprecise senses (including lifesense)
      for (let i = 0; i < capabilities.imprecise.length; i++) {
        const ent = capabilities.imprecise[i];

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
          if (targetElevation > 0) {
            continue; // Cannot detect flying/elevated creatures with tremorsense
          }
        }

        // Regular imprecise senses - ensure range comparison uses correct units
        // dist is in feet, ent.range should also be in feet
        const shouldReturn = ent.range === Infinity || ent.range >= dist;

        if (shouldReturn) {
          return true;
        }
      }

      // Check hearing - but only if it's not the observer's only sense for elevated targets
      if (capabilities.hearing) {
        const hr = Number(capabilities.hearing.range);
        if (!Number.isFinite(hr) || hr >= dist) {
          // Check if target is elevated and observer only has ground-based senses
          if (targetElevation > 0) {
            // If observer only has tremorsense + hearing (no vision), hearing alone might not be enough
            // to precisely locate an elevated target behind a wall
            const hasOnlyGroundBasedSenses =
              capabilities.tremorsense &&
              !capabilities.hasDarkvision &&
              !capabilities.hasLowLightVision &&
              !capabilities.hasVision &&
              !capabilities.echolocationActive &&
              !capabilities.scent;

            if (hasOnlyGroundBasedSenses) {
              // Observer only has tremorsense + basic hearing, cannot precisely locate elevated targets
              return false;
            }
          }
          return true;
        }
      }
    } catch (error) {
      // Log error but continue
    }

    return false;
  }

  /**
   * Whether any precise non-visual sense can reach the target (includes echolocation precise-hearing when active)
   */
  hasPreciseNonVisualInRange(observer, target) {
    try {
      const capabilities = this.getVisionCapabilities(observer);
      if (!capabilities.precise.length) return false;
      const dist = this.distanceFeet(observer, target);
      for (const ent of capabilities.precise) {
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
    } catch {}
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
   * Standardized distance calculation for PF2e that converts grid squares to feet
   * with proper 5-foot rounding for the grid system.
   */
  distanceFeet(a, b) {
    try {
      // Use Foundry's built-in distance calculation method
      // PF2e's distanceTo returns distance in grid squares, so convert to feet
      const gridDistance = a.distanceTo?.(b) ?? Infinity;

      // Convert grid squares to feet using the scene's grid distance setting
      const gridUnits = global.canvas?.scene?.grid?.distance || 5;
      const feetDistance = gridDistance * gridUnits;

      // Round down to nearest 5-foot increment (PF2e uses 5-foot squares)
      const result = Math.floor(feetDistance / 5) * 5;

      return result;
    } catch (error) {
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
    let detectionModes = {};
    let sensingSummary = null;

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

      // Merge detection modes from both token document and traditional senses
      // First, add detection modes from token document (tremorsense will likely be here)
      const tokenDetectionModes = token.document?.detectionModes || [];
      for (const mode of tokenDetectionModes) {
        if (mode.id && mode.enabled && mode.range > 0) {
          detectionModes[mode.id] = {
            enabled: mode.enabled,
            range: mode.range,
            source: 'detectionModes',
          };
        }
      }

      // Also check traditional senses for non-visual senses (echolocation, lifesense, etc.)
      if (senses) {
        const nonVisualSenseMap = {
          tremorsense: 'feelTremor',
          echolocation: 'echolocation',
          lifesense: 'lifesense',
          blindsense: 'blindsense',
        };

        if (Array.isArray(senses)) {
          // NPC format: array of sense objects
          for (const sense of senses) {
            const detectionModeId = nonVisualSenseMap[sense.type];
            if (detectionModeId && sense.range > 0) {
              // Only add if not already present from detectionModes (detectionModes takes precedence)
              if (!detectionModes[detectionModeId]) {
                detectionModes[detectionModeId] = {
                  enabled: true,
                  range: sense.range,
                  source: 'senses',
                };
              }
            }
          }
        } else {
          // PC format: object with sense properties
          for (const [senseType, senseData] of Object.entries(senses)) {
            const detectionModeId = nonVisualSenseMap[senseType];
            if (detectionModeId && senseData?.range > 0) {
              // Only add if not already present from detectionModes (detectionModes takes precedence)
              if (!detectionModes[detectionModeId]) {
                detectionModes[detectionModeId] = {
                  enabled: true,
                  range: senseData.range,
                  source: 'senses',
                };
              }
            }
          }
        }
      }

      // Add comprehensive sensing summary (merge getSensingSummary functionality)
      sensingSummary = this.#calculateSensingSummary(token, senses, detectionModes);
    } catch {}

    // Ensure sensingSummary exists even if try block failed
    if (!sensingSummary) {
      sensingSummary = this.#calculateSensingSummary(token, null, detectionModes);
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
      detectionModes, // Detection modes from both sources
      // Sensing summary (replaces getSensingSummary)
      precise: sensingSummary.precise,
      imprecise: sensingSummary.imprecise,
      hearing: sensingSummary.hearing,
      echolocationActive: sensingSummary.echolocationActive,
      echolocationRange: sensingSummary.echolocationRange,
      lifesense: sensingSummary.lifesense,
      // Individual senses for backward compatibility
      ...sensingSummary.individualSenses,
    };

    return result;
  }

  /**
   * Calculate comprehensive sensing summary from both traditional senses and detection modes
   * @param {Token} token - The token to analyze
   * @param {Array|Object} senses - Traditional senses from actor
   * @param {Object} detectionModes - Detection modes already processed
   * @returns {Object} Comprehensive sensing summary
   * @private
   */
  #calculateSensingSummary(token, senses, detectionModes) {
    const summary = {
      precise: [],
      imprecise: [],
      hearing: null,
      echolocationActive: false,
      echolocationRange: 0,
      lifesense: null,
      individualSenses: {}, // For backward compatibility
    };

    const actor = token?.actor;
    if (!actor) return summary;

    // Check for echolocation effects
    try {
      const effects =
        actor.itemTypes?.effect ?? actor.items?.filter?.((i) => i?.type === 'effect') ?? [];
      const hasEchoEffect = !!effects?.some?.(
        (e) => (e?.slug || e?.system?.slug || e?.name)?.toLowerCase?.() === 'effect-echolocation',
      );
      if (hasEchoEffect) {
        summary.echolocationActive = true;
        summary.echolocationRange = 40;
      } else {
        const echo = actor.getFlag?.('pf2e-visioner', 'echolocation') || null;
        if (echo?.active) {
          summary.echolocationActive = true;
          summary.echolocationRange = Number(echo.range) || 40;
        }
      }
    } catch {
      /* ignore */
    }

    // Process detection modes first (these take precedence)
    for (const [modeId, modeData] of Object.entries(detectionModes)) {
      if (!modeData.enabled || modeData.range <= 0) continue;

      let senseType = modeId;
      let acuity = 'imprecise'; // Default

      // Map detection mode IDs to sense types and determine acuity
      // Based on CONFIG.Canvas.detectionModes from Foundry/PF2e
      const detectionModeMapping = {
        // Core tremorsense detection - imprecise by default unless explicitly marked precise
        feelTremor: { type: 'tremorsense', acuity: 'imprecise' },

        // Hearing-based detection
        hearing: { type: 'hearing', acuity: 'imprecise' },

        // Other non-visual senses (may not be in CONFIG but could exist)
        echolocation: { type: 'echolocation', acuity: 'precise' },
        lifesense: { type: 'lifesense', acuity: 'precise' },
        blindsense: { type: 'blindsense', acuity: 'precise' },
        scent: { type: 'scent', acuity: 'imprecise' },

        // Invisibility detection (precise when it comes to invisibility)
        senseInvisibility: { type: 'sense-invisibility', acuity: 'precise' },
        seeInvisibility: { type: 'see-invisibility', acuity: 'precise' },
      };

      if (detectionModeMapping[modeId]) {
        senseType = detectionModeMapping[modeId].type;
        acuity = detectionModeMapping[modeId].acuity;
      }

      this.#addSenseToSummary(summary, senseType, acuity, modeData.range, token);
    }

    // Process traditional senses (if not already added by detection modes)
    if (senses) {
      try {
        if (Array.isArray(senses)) {
          for (const s of senses) {
            // Check if this is a detection mode format
            if (s?.id && !s?.type && !s?.slug && !s?.name && !s?.label) {
              // Skip - already processed in detection modes
              continue;
            } else {
              // Traditional sense format
              const type = s?.type ?? s?.slug ?? s?.name ?? s?.label ?? s?.id;
              const val = s?.value ?? s;
              let acuity = val?.acuity ?? s?.acuity ?? val?.value;
              let range = val?.range ?? s?.range;

              this.#addSenseToSummary(summary, type, acuity, range, token);
            }
          }
        } else if (typeof senses === 'object') {
          for (const [type, obj] of Object.entries(senses)) {
            const val = obj?.value ?? obj;
            const acuity = val?.acuity ?? obj?.acuity ?? val?.value;
            const range = val?.range ?? obj?.range;
            this.#addSenseToSummary(summary, type, acuity, range, token);
          }
        }
      } catch {
        /* ignore */
      }
    }

    return summary;
  }

  /**
   * Add a sense to the sensing summary with proper categorization
   * @param {Object} summary - The summary object to modify
   * @param {string} type - Sense type
   * @param {string} acuity - Sense acuity (precise/imprecise)
   * @param {number} range - Sense range
   * @param {Token} token - The token (for condition checks)
   * @private
   */
  #addSenseToSummary(summary, type, acuity, range, token) {
    if (!type) return;

    const r = Number(range);
    const entry = {
      type: String(type).toLowerCase(),
      range: Number.isFinite(r) ? r : Infinity,
    };
    let a = String(acuity || 'imprecise').toLowerCase();

    // Skip visual senses if blinded
    if (
      (entry.type === 'vision' ||
        entry.type === 'sight' ||
        entry.type === 'darkvision' ||
        entry.type === 'greater-darkvision' ||
        entry.type === 'greaterdarkvision' ||
        entry.type === 'low-light-vision' ||
        entry.type === 'lowlightvision' ||
        entry.type.includes('vision') ||
        entry.type.includes('sight')) &&
      this.#hasCondition(token.actor, 'blinded')
    ) {
      return;
    }

    // Skip hearing if deafened
    if (entry.type === 'hearing' && this.#hasCondition(token.actor, 'deafened')) {
      return;
    }

    // Special case: echolocation upgrades hearing to precise within echolocation range
    if (entry.type === 'hearing' && summary.echolocationActive) {
      a = 'precise';
      entry.range = summary.echolocationRange || 40;
    }

    // Store special senses for backward compatibility
    if (entry.type === 'hearing') {
      summary.hearing = { acuity: a, range: entry.range };
    }
    if (entry.type === 'lifesense') {
      summary.lifesense = { range: entry.range };
    }
    if (entry.type !== 'hearing' && entry.type !== 'lifesense') {
      summary.individualSenses[entry.type] = { range: entry.range };
    }

    // Add to appropriate acuity array
    if (a === 'precise') {
      summary.precise.push(entry);
    } else {
      summary.imprecise.push(entry);
    }
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
            reason: 'observer has no vision',
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
          method: 'direct',
        }));

      return res;
    } catch (error) {
      console.error(`${MODULE_ID} | Error testing line of sight:`, error);
      return false;
    }
  }

  /**
   * True if source can detect target via the 'feelTremor' detection mode.
   * (Respects range/angle/ground rules from the mode; ignores walls because walls:false.)
   */
  canDetectViaTremor(sourceToken, targetToken) {
    const modeData = sourceToken.document.detectionModes?.find(
      (dm) => dm.id === 'feelTremor' && dm.enabled !== false,
    );
    if (!modeData) return false;

    // Manual tremorsense check since vision system might not be available for non-visual tokens
    let distance;
    try {
      distance = this.distanceFeet(sourceToken, targetToken);
      // If distance calculation fails, try a direct calculation
      if (distance === Infinity || isNaN(distance)) {
        const dx = sourceToken.center.x - targetToken.center.x;
        const dy = sourceToken.center.y - targetToken.center.y;
        const pixelDistance = Math.sqrt(dx * dx + dy * dy);
        // Convert pixels to feet (assuming 5ft grid squares)
        const gridSize = canvas?.scene?.grid?.size || 100;
        const gridDistance = canvas?.scene?.grid?.distance || 5;
        distance = (pixelDistance / gridSize) * gridDistance;
      }
    } catch (error) {
      console.error('Distance calculation failed:', error);
      distance = Infinity;
    }

    const range = modeData.range || 30;
    const targetElevation = targetToken?.document?.elevation || 0;

    // Tremorsense requirements:
    // 1. Within range
    // 2. Target must be on ground (elevation 0)
    if (distance > range) {
      return false;
    }

    if (targetElevation > 0) {
      return false;
    }

    return true;
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
        type: 'sight',
        mode: 'any',
        // Supplying the vision source can let the backend apply relevant filters
        source: sourceToken.vision,
      });
    }

    // Fallback (older/alt builds): use the walls layer API if present
    if (canvas.walls?.checkCollision) {
      return !!canvas.walls.checkCollision(origin, dest, { type: 'sight' });
    }
    if (canvas.walls?.testCollision) {
      const ray = new foundry.canvas.geometry.Ray(origin, dest);
      return !!canvas.walls.testCollision(ray, { type: 'sight' });
    }

    return false;
  }

  /**
   * Combined helper: can detect via tremor, and if so, whether that’s through a wall.
   */
  tremorDetectionResult(sourceToken, targetToken) {
    const detectable = this.canDetectViaTremor(sourceToken, targetToken);
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
      console.error(`${MODULE_ID} | Error in vision polygon check:`, error);
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
        const sightBlocked =
          CONFIG.Canvas?.polygonBackends?.sight?.testCollision?.(observer.center, target.center, {
            type: 'sight',
            mode: 'any',
          }) ?? false;

        const soundBlocked =
          CONFIG.Canvas?.polygonBackends?.sound?.testCollision?.(observer.center, target.center, {
            type: 'sound',
            mode: 'any',
          }) ?? false;

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
      console.error(`${MODULE_ID} | Error in fallback wall collision check:`, error);
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
      console.error(
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

    // Get comprehensive capabilities to check what senses the observer has
    const capabilities = this.getVisionCapabilities(observer);

    // Check for senses that can work across elevation differences
    // Visual senses (darkvision, low-light vision) can see elevated targets if there's line of sight
    const observerVision = this.getVisionCapabilities(observer);

    // Visual senses can detect elevated targets only if there's actual line of sight
    // Having vision but being blocked by walls doesn't help with elevated targets
    if (
      (observerVision.hasDarkvision ||
        observerVision.hasLowLightVision ||
        observerVision.hasVision) &&
      this.hasLineOfSight(observer, target)
    ) {
      return true;
    }

    // Echolocation can detect flying/elevated targets
    if (capabilities.echolocationActive) {
      return true;
    }

    // Scent can potentially detect elevated targets (depending on air currents, etc.)
    if (capabilities.scent) {
      return true;
    }

    // Check if observer has non-visual senses that can detect elevated targets
    const hasViableElevationSenses =
      capabilities.echolocationActive ||
      capabilities.scent ||
      capabilities.hasDarkvision ||
      capabilities.hasLowLightVision;

    // If observer has viable elevation senses, they can detect elevated targets
    if (hasViableElevationSenses) {
      return true;
    }

    // If observer only has basic vision but no line of sight, and no special senses,
    // they cannot detect elevated targets
    return false;
  }

  /**
   * Check if observer has tremorsense in range of target
   * @param {Token} observer - The observing token
   * @param {Token} target - The target token
   * @returns {boolean} True if observer has tremorsense that can reach the target
   */
  hasTremorsenseInRange(observer, target) {
    try {
      const capabilities = this.getVisionCapabilities(observer);

      // Check if observer has tremorsense
      if (!capabilities || !capabilities.tremorsense) {
        return false;
      }

      const dist = this.distanceFeet(observer, target);
      const tremorsenseRange = capabilities.tremorsense.range;

      // Check if target is within tremorsense range
      return tremorsenseRange === Infinity || tremorsenseRange >= dist;
    } catch {
      return false;
    }
  }
}
