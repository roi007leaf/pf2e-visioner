/**
 * VisionAnalyzer - Query Interface for Vision and Sensing Capabilities
 * 
 * Clean query interface that answers questions about what tokens can sense.
 * Uses SensingCapabilitiesBuilder internally to get capabilities data.
 * 
 * Responsibilities:
 * - Answer queries: "Can this token sense that token?"
 * - Provide vision/sensing capabilities for a token
 * - Calculate distances and line of sight
 * - Cache capabilities for performance
 * 
 * Does NOT:
 * - Build sensing data (delegates to SensingCapabilitiesBuilder)
 * - Make visibility state decisions (that's StatelessVisibilityCalculator)
 * - Handle UI/dialog concerns (that's SeekDialogAdapter)
 * 
 * SINGLETON PATTERN
 */

import { MODULE_ID } from '../../constants.js';
import { calculateDistanceInFeet } from '../../helpers/geometry-utils.js';
import { getLogger } from '../../utils/logger.js';
import { SensingCapabilitiesBuilder } from './SensingCapabilitiesBuilder.js';
import { getTokenVerticalSpanFt } from '../../helpers/size-elevation-utils.js';
import { doesWallBlockAtElevation } from '../../helpers/wall-height-utils.js';

const log = getLogger('VisionAnalyzer');

export class VisionAnalyzer {
  static #instance = null;

  #capabilitiesCache = new Map();
  #cacheTimestamp = new Map();
  #cacheTimeout = 5000; // 5 seconds

  constructor() {
    if (VisionAnalyzer.#instance) {
      return VisionAnalyzer.#instance;
    }
    VisionAnalyzer.#instance = this;
  }

  /**
   * Get singleton instance
   * @returns {VisionAnalyzer}
   */
  static getInstance() {
    if (!VisionAnalyzer.#instance) {
      VisionAnalyzer.#instance = new VisionAnalyzer();
    }
    return VisionAnalyzer.#instance;
  }

  // ============================================================================
  // PUBLIC QUERY INTERFACE
  // ============================================================================

  /**
   * Get complete sensing capabilities for a token
   * @param {Token} token
   * @returns {SensingCapabilities}
   */
  getSensingCapabilities(token) {
    if (!token?.actor) {
      return this.#emptyCapabilities();
    }

    // Check cache
    const cached = this.#getFromCache(token);
    if (cached) return cached.sensing;

    // Build fresh capabilities
    const result = this.#buildCapabilities(token);

    // Cache it
    this.#setCache(token, result);

    return result.sensing;
  }

  /**
   * Get vision capabilities (legacy format for backward compatibility)
   * @param {Token} token
   * @returns {Object}
   */
  getVisionCapabilities(token) {
    if (!token?.actor) {
      return this.#emptyLegacyCapabilities();
    }

    // Check cache
    const cached = this.#getFromCache(token);
    if (cached) return cached.legacy;

    // Build fresh capabilities
    const result = this.#buildCapabilities(token);

    // Cache it
    this.#setCache(token, result);

    return result.legacy;
  }

  /**
   * Check if observer has precise sense within range
   * @param {Token} observer
   * @param {number} [maxRange] - Optional max range to check
   * @returns {boolean}
   */
  hasPreciseSense(observer, maxRange = Infinity) {
    const capabilities = this.getSensingCapabilities(observer);

    if (maxRange === Infinity) {
      return Object.keys(capabilities.precise).length > 0;
    }

    return Object.values(capabilities.precise).some(range => range >= maxRange);
  }

  /**
   * Check if observer has imprecise sense within range
   * @param {Token} observer
   * @param {number} [maxRange] - Optional max range to check
   * @returns {boolean}
   */
  hasImpreciseSense(observer, maxRange = Infinity) {
    const capabilities = this.getSensingCapabilities(observer);

    if (maxRange === Infinity) {
      return Object.keys(capabilities.imprecise).length > 0;
    }

    return Object.values(capabilities.imprecise).some(range => range >= maxRange);
  }

  /**
   * Check if observer can sense target imprecisely
   * @param {Token} observer
   * @param {Token} target
   * @param {string} [senseType] - Optional specific sense type
   * @returns {boolean}
   */
  canSenseImprecisely(observer, target, senseType = null) {
    const capabilities = this.getSensingCapabilities(observer);
    const distance = this.distanceFeet(observer, target);

    // Check specific sense type if requested
    if (senseType) {
      const range = capabilities.imprecise[senseType] || capabilities.precise[senseType];
      return range ? distance <= range : false;
    }

    // Check any imprecise or precise sense (precise can also sense imprecisely)
    const allSenses = { ...capabilities.imprecise, ...capabilities.precise };
    return Object.values(allSenses).some(range => distance <= range);
  }

  /**
   * Check if observer can sense target precisely
   * @param {Token} observer
   * @param {Token} target
   * @param {string} [senseType] - Optional specific sense type
   * @returns {boolean}
   */
  canSensePrecisely(observer, target, senseType = null) {
    const capabilities = this.getSensingCapabilities(observer);
    const distance = this.distanceFeet(observer, target);

    // Check specific sense type if requested
    if (senseType) {
      const range = capabilities.precise[senseType];
      return range ? distance <= range : false;
    }

    // Check any precise sense
    return Object.values(capabilities.precise).some(range => distance <= range);
  }

  /**
   * Check if observer has line of sight to target
   * Uses shape-based collision detection like LightingCalculator
   * @param {Token} observer
   * @param {Token} target
   * @returns {boolean}
   */
  hasLineOfSight(observer, target) {
    try {
      // If the observer has an los shape, use that for line of sight against the target's circle
      // Darkness sources may affect true LOS, so only return true/false if we can be sure
      const los = observer.vision?.los;
      if (los?.points) {
        const radius = target.externalRadius;
        const circle = new PIXI.Circle(target.center.x, target.center.y, radius);
        const intersection = los.intersectCircle(circle, {density: 8, scalingFactor: 1.0});
        const visible = intersection?.points?.length > 0;
        if (visible || !canvas.effects?.darknessSources?.length) return visible;
      }

      // Check if LOS calculation is disabled
      const losDisabled = game.settings.get(MODULE_ID, 'disableLineOfSightCalculation');
      if (losDisabled) {
        return undefined; // return undefined if LOS calculation is disabled
      }

      // Calculate elevation range for wall height checks
      let elevationRange = null;
      try {
        const observerSpan = getTokenVerticalSpanFt(observer);
        const targetSpan = getTokenVerticalSpanFt(target);
        elevationRange = {
          bottom: Math.min(observerSpan.bottom, targetSpan.bottom),
          top: Math.max(observerSpan.top, targetSpan.top),
        };
      } catch (error) {
      }

      const ray = new foundry.canvas.geometry.Ray(observer.center, target.center);
      let limitedWallCrossings = 0;

      // Check for walls that block BOTH movement AND (sight OR sound)
      // Darkness walls typically block ONLY movement, not sight/sound
      // Physical walls block movement + sight/sound
      for (const wall of canvas.walls.placeables) {
        // Skip walls that don't block movement (not physical barriers)
        if (wall.document.move === CONST.WALL_SENSE_TYPES.NONE) {
          continue;
        }

        // Skip open doors - they don't block line of sight
        // door: 0 = not a door, 1 = door, 2 = secret door
        // ds: 0 = closed, 1 = open, 2 = locked
        const isDoor = wall.document.door > 0;
        const isOpen = wall.document.ds === 1;
        if (isDoor && isOpen) {
          continue;
        }

        // Skip walls that block ONLY movement (darkness walls)
        // Physical walls must also block sight or sound
        const blocksSight = wall.document.sight !== CONST.WALL_SENSE_TYPES.NONE;
        const blocksSound = wall.document.sound !== CONST.WALL_SENSE_TYPES.NONE;

        if (!blocksSight && !blocksSound) {
          continue;
        }

        // Check wall elevation if Wall Height module is active and elevation range is available
        if (elevationRange && !doesWallBlockAtElevation(wall.document, elevationRange)) {
          continue;
        }

        // Check if the ray intersects this physical wall
        const intersection = foundry.utils.lineLineIntersection(
          { x: ray.A.x, y: ray.A.y },
          { x: ray.B.x, y: ray.B.y },
          { x: wall.document.c[0], y: wall.document.c[1] },
          { x: wall.document.c[2], y: wall.document.c[3] }
        );

        // Check if intersection is within the ray segment (0 <= t0 <= 1)
        if (intersection && typeof intersection.t0 === 'number' && intersection.t0 >= 0 && intersection.t0 <= 1) {
          // Compute t1 for the wall segment
          const wallDx = wall.document.c[2] - wall.document.c[0];
          const wallDy = wall.document.c[3] - wall.document.c[1];
          let t1;

          // Use the larger component to avoid division by near-zero
          if (Math.abs(wallDx) > Math.abs(wallDy)) {
            t1 = (intersection.x - wall.document.c[0]) / wallDx;
          } else {
            t1 = (intersection.y - wall.document.c[1]) / wallDy;
          }

          // Check if t1 is also within [0, 1] (intersection within wall segment)
          if (t1 >= 0 && t1 <= 1) {
            // Ray intersects this wall

            // Check for directional walls (one-way walls)
            // dir: 0 = both directions, 1 = left side blocks, 2 = right side blocks
            if (wall.document.dir && wall.document.dir !== 0) {
              const observerDx = observer.center.x - wall.document.c[0];
              const observerDy = observer.center.y - wall.document.c[1];

              // Cross product determines which side the observer is on
              const crossProduct = wallDx * observerDy - wallDy * observerDx;

              // dir=1: blocks from left (negative cross product)
              // dir=2: blocks from right (positive cross product)
              const blocksFromObserverSide =
                (wall.document.dir === 1 && crossProduct < 0) ||
                (wall.document.dir === 2 && crossProduct > 0);

              if (!blocksFromObserverSide) {
                continue; // One-way wall doesn't block from this direction
              }
            }

            // Check if this is a Limited wall (sight/light/sound = LIMITED)
            const isLimitedSight = wall.document.sight === CONST.WALL_SENSE_TYPES.LIMITED;
            const isLimitedLight = wall.document.light === CONST.WALL_SENSE_TYPES.LIMITED;
            const isLimitedSound = wall.document.sound === CONST.WALL_SENSE_TYPES.LIMITED;
            const isLimited = isLimitedSight || isLimitedLight || isLimitedSound;

            if (isLimited) {
              // Limited walls: count crossings, block only if > 1
              limitedWallCrossings++;
              if (limitedWallCrossings > 1) {
                return false; // More than one Limited wall crossed
              }
            } else {
              // Normal wall: blocks immediately
              return false;
            }
          }
        }
      }

      return true; // No walls block line of sight
    } catch (error) {
      console.error('[LineOfSight] Error:', error);
      log.debug('Error checking line of sight', error);
      return false;
    }
  }

  /**
   * Check if sound is blocked between observer and target
   * @param {Token} observer
   * @param {Token} target
   * @returns {boolean} True if sound is blocked by walls or Silence effect
   */
  isSoundBlocked(observer, target) {
    try {
      // Check for Silence spell effect on observer or target
      const observerHasSilence = this.#hasSilenceEffect(observer.actor);
      const targetHasSilence = this.#hasSilenceEffect(target.actor);

      if (observerHasSilence || targetHasSilence) {
        return true;
      }

      // Check if polygon backend for sound is available
      const soundBackend = CONFIG.Canvas.polygonBackends?.sound;
      if (!soundBackend?.testCollision) {
        return false;
      }

      // Check for sound-blocking walls using polygon backend
      const hasSoundWall = soundBackend.testCollision(
        observer.center,
        target.center,
        { type: 'sound', mode: 'any' }
      );


      return hasSoundWall;
    } catch (error) {
      console.error('[Sound-Blocking] Error checking sound blocking:', error);
      log.debug('Error checking sound blocking', error);
      // On error, assume sound is NOT blocked (fail open for better UX)
      return false;
    }
  }

  /**
   * Check if actor has Silence effect active
   * @private
   * @param {Actor} actor
   * @returns {boolean} True if Silence effect is active
   */
  #hasSilenceEffect(actor) {
    try {
      const effects = actor.itemTypes?.effect ?? actor.items?.filter?.(i => i?.type === 'effect') ?? [];
      return effects?.some?.(effect => {
        const slug = effect?.slug || effect?.system?.slug || '';
        const name = effect?.name?.toLowerCase() || '';
        return slug.toLowerCase() === 'spell-effect-silence' ||
          name.includes('silence');
      });
    } catch {
      return false;
    }
  }

  /**
   * Calculate distance between tokens in feet
   * @param {Token} a
   * @param {Token} b
   * @returns {number} Distance in feet
   */
  distanceFeet(a, b) {
    try {
      return calculateDistanceInFeet(a, b);
    } catch (error) {
      log.debug('Error calculating distance', error);
      return Infinity;
    }
  }

  /**
   * Check if token has a specific condition
   * @param {Token} token
   * @param {string} conditionSlug
   * @returns {boolean}
   */
  hasCondition(token, conditionSlug) {
    const actor = token?.actor;
    if (!actor) return false;

    return this.#hasCondition(actor, conditionSlug);
  }

  /**
   * Check if observer has precise non-visual sense in range of target
   * @param {Token} observer
   * @param {Token} target
   * @returns {boolean}
   */
  hasPreciseNonVisualInRange(observer, target) {
    const capabilities = this.getSensingCapabilities(observer);
    const distance = this.distanceFeet(observer, target);

    // Check for precise non-visual senses within range
    const nonVisualSenses = Object.entries(capabilities.precise).filter(([senseType]) =>
      senseType !== 'vision' &&
      senseType !== 'sight' &&
      !senseType.includes('vision')
    );

    return nonVisualSenses.some(([_, range]) => distance <= range);
  }

  /**
   * Check if observer can detect elevated target
   * @param {Token} observer
   * @param {Token} target
   * @returns {boolean}
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

    // Get comprehensive capabilities
    const capabilities = this.getVisionCapabilities(observer);
    const sensingCaps = this.getSensingCapabilities(observer);

    // Visual senses can detect elevated targets only if there's line of sight
    if ((capabilities.hasDarkvision || capabilities.hasLowLightVision || capabilities.hasVision) &&
      this.hasLineOfSight(observer, target)) {
      return true;
    }

    // Echolocation can detect flying/elevated targets
    if (sensingCaps.precise.echolocation || sensingCaps.imprecise.echolocation) {
      return true;
    }

    // Scent can potentially detect elevated targets
    if (sensingCaps.precise.scent || sensingCaps.imprecise.scent) {
      return true;
    }

    // If observer only has basic vision but no line of sight, and no special senses, cannot detect
    return false;
  }

  /**
   * Clear cache for specific token or all
   * @param {Token} [token] - Optional token to clear, or clear all if omitted
   */
  clearCache(token = null) {
    if (token) {
      const key = token.id || token.document?.id;
      if (key) {
        this.#capabilitiesCache.delete(key);
        this.#cacheTimestamp.delete(key);
      }
    } else {
      this.#capabilitiesCache.clear();
      this.#cacheTimestamp.clear();
    }
  }

  /**
   * Backward compatibility alias for clearCache
   * @param {string} [tokenId] - Optional token ID to clear, or clear all if omitted
   */
  clearVisionCache(tokenId = null) {
    if (tokenId) {
      this.#capabilitiesCache.delete(tokenId);
      this.#cacheTimestamp.delete(tokenId);
    } else {
      this.clearCache();
    }
  }

  /**
   * Backward compatibility alias for clearCache
   * @param {string} [tokenId] - Optional token ID to clear, or clear all if omitted
   */
  invalidateVisionCache(tokenId = null) {
    this.clearVisionCache(tokenId);
  }

  /**
   * Check if a special sense can detect a target based on creature type
   * @param {Token} target - Target token to check
   * @param {string} senseType - Type of sense (lifesense, scent, echolocation, tremorsense, etc.)
   * @returns {Promise<boolean>} - True if the sense can detect this creature type
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

  // ============================================================================
  // INTERNAL IMPLEMENTATION
  // ============================================================================

  /**
   * Build complete capabilities for a token
   * @private
   */
  #buildCapabilities(token) {
    const actor = token.actor;

    // Extract vision data and conditions
    const visionData = this.#extractVisionData(token, actor);


    // Build sensing capabilities using SensingCapabilitiesBuilder
    const rawSensing = SensingCapabilitiesBuilder.build({
      senses: visionData.senses,
      detectionModes: visionData.detectionModes,
      conditions: {
        blinded: visionData.isBlinded,
        deafened: visionData.isDeafened,
      },
    });


    // Enhance with special sense interpretation and echolocation detection
    const sensing = this.#enhanceSensingCapabilities(rawSensing, actor);


    // Build legacy format for backward compatibility
    const legacy = this.#buildLegacyFormat(visionData, sensing);

    return { sensing, legacy, visionData };
  }

  /**
   * Enhance sensing capabilities with condition filtering and echolocation
   * @private
   */
  #enhanceSensingCapabilities(rawSensing, actor) {
    // Check conditions
    const isBlinded = this.#hasCondition(actor, 'blinded');
    const isDeafened = this.#hasCondition(actor, 'deafened');

    const enhanced = {
      precise: { ...rawSensing.precise },
      imprecise: { ...rawSensing.imprecise },
    };

    // Filter out visual senses if blinded
    if (isBlinded) {
      const visualSenseTypes = ['vision', 'sight', 'darkvision', 'greater-darkvision', 'low-light-vision',
        'see-invisibility', 'see-all'];
      for (const senseType of visualSenseTypes) {
        delete enhanced.precise[senseType];
        delete enhanced.imprecise[senseType];
      }
    }

    // Filter out hearing-based senses if deafened (hearing + echolocation)
    if (isDeafened) {
      delete enhanced.precise.hearing;
      delete enhanced.precise.echolocation;
      delete enhanced.imprecise.hearing;
      delete enhanced.imprecise.echolocation;
    }

    // Detect echolocation and upgrade hearing to precise if not deafened
    if (!isDeafened) {
      const echolocation = this.#detectEcholocation(actor);
      if (echolocation.active) {
        // Remove hearing from imprecise and add to precise with echolocation range
        delete enhanced.imprecise.hearing;
        enhanced.precise.hearing = echolocation.range;
      }
    }

    return enhanced;
  }

  /**
   * Detect if actor has echolocation active
   * @private
   */
  #detectEcholocation(actor) {
    const state = { active: false, range: 0 };

    try {
      // Check for echolocation effect
      const effects = actor.itemTypes?.effect ?? actor.items?.filter?.(i => i?.type === 'effect') ?? [];
      const hasEffect = effects?.some?.(effect =>
        (effect?.slug || effect?.system?.slug || effect?.name)?.toLowerCase?.() === 'effect-echolocation'
      );

      if (hasEffect) {
        state.active = true;
        state.range = 40;
        return state;
      }

      // Check for echolocation flag
      const flag = actor.getFlag?.('pf2e-visioner', 'echolocation');
      if (flag?.active) {
        state.active = true;
        state.range = Number(flag.range) || 40;
      }
    } catch {
      // Ignore errors
    }

    return state;
  }

  /**
   * Extract raw vision data from token/actor
   * @private
   */
  #extractVisionData(token, actor) {
    const result = {
      hasVision: true,
      hasDarkvision: false,
      hasLowLightVision: false,
      hasGreaterDarkvision: false,
      darkvisionRange: 0,
      lowLightRange: 0,
      isBlinded: false,
      isDeafened: false,
      isDazzled: false,
      senses: null,
      detectionModes: {},
    };

    try {
      // Check conditions
      result.isBlinded = this.#hasCondition(actor, 'blinded');
      result.isDeafened = this.#hasCondition(actor, 'deafened');
      result.isDazzled = this.#hasCondition(actor, 'dazzled');

      if (result.isBlinded) {
        result.hasVision = false;
      }

      if (actor.system?.perception?.vision === false) {
        result.hasVision = false;
      }

      // Extract senses
      if (actor.system?.perception?.senses) {
        result.senses = actor.system.perception.senses;
      } else if (actor.perception?.senses) {
        result.senses = actor.perception.senses;
      }

      // Process senses to extract vision types
      if (result.senses) {
        this.#processSensesForVisionTypes(result);
      }

      this.#checkForVisionFeats(actor, result);

      // Build detection modes object
      this.#buildDetectionModes(token, result);

    } catch (error) {
      log.debug('Error extracting vision data', error);
    }

    return result;
  }

  /**
   * Process senses to extract vision types (darkvision, low-light, etc.)
   * @private
   */
  #processSensesForVisionTypes(result) {
    const senses = result.senses;

    if (Array.isArray(senses)) {
      // NPC format
      for (const sense of senses) {
        const type = sense.type || sense.slug;
        if (type === 'greater-darkvision' || type === 'greaterDarkvision') {
          result.hasDarkvision = true;
          result.hasGreaterDarkvision = true;
          result.darkvisionRange = sense.range || Infinity;
        } else if (type === 'darkvision') {
          result.hasDarkvision = true;
          result.darkvisionRange = sense.range || Infinity;
        } else if (type === 'low-light-vision' || type === 'lowLightVision') {
          result.hasLowLightVision = true;
          result.lowLightRange = sense.range || Infinity;
        }
      }
    } else if (typeof senses === 'object') {
      // PC format
      if (senses['greater-darkvision'] || senses.greaterDarkvision) {
        result.hasDarkvision = true;
        result.hasGreaterDarkvision = true;
        const gd = senses['greater-darkvision'] || senses.greaterDarkvision;
        result.darkvisionRange = gd?.range || Infinity;
      } else if (senses.darkvision) {
        result.hasDarkvision = true;
        result.darkvisionRange = senses.darkvision?.range || Infinity;
      }

      if (senses['low-light-vision'] || senses.lowLightVision) {
        result.hasLowLightVision = true;
        const ll = senses['low-light-vision'] || senses.lowLightVision;
        result.lowLightRange = ll?.range || Infinity;
      }
    }
  }

  #checkForVisionFeats(actor, result) {
    if (!actor) return;

    try {
      const feats = actor.itemTypes?.feat ?? actor.items?.filter?.((i) => i?.type === 'feat') ?? [];

      for (const feat of feats) {
        const slug = feat?.system?.slug?.toLowerCase?.() || '';

        if (slug === 'greater-darkvision' && !result.hasGreaterDarkvision) {
          log.debug('Greater Darkvision feat detected (not in senses)', { actor: actor.name });
          result.hasDarkvision = true;
          result.hasGreaterDarkvision = true;
          if (!result.darkvisionRange) {
            result.darkvisionRange = Infinity;
          }
        } else if (slug === 'darkvision' && !result.hasDarkvision) {
          log.debug('Darkvision feat detected (not in senses)', { actor: actor.name });
          result.hasDarkvision = true;
          if (!result.darkvisionRange) {
            result.darkvisionRange = Infinity;
          }
        }
      }
    } catch (error) {
      log.debug('Error checking vision feats', error);
    }
  }

  /**
   * Build detection modes object
   * @private
   */
  #buildDetectionModes(token, result) {
    // Add detection modes from token
    const tokenDetectionModes = token.document?.detectionModes || [];
    for (const mode of tokenDetectionModes) {
      if (mode.id && mode.enabled && mode.range > 0) {
        result.detectionModes[mode.id] = {
          enabled: mode.enabled,
          range: mode.range,
          source: 'token',
        };
      }
    }

    // Add vision capabilities as detection modes
    if (result.hasVision) {
      result.detectionModes.basicSight = {
        enabled: true,
        range: Infinity,
        source: 'vision',
      };
    }

    if (result.hasGreaterDarkvision) {
      result.detectionModes.greaterDarkvision = {
        enabled: true,
        range: result.darkvisionRange || Infinity,
        source: 'vision',
      };
    } else if (result.hasDarkvision) {
      result.detectionModes.darkvision = {
        enabled: true,
        range: result.darkvisionRange || Infinity,
        source: 'vision',
      };
    }

    if (result.hasLowLightVision) {
      result.detectionModes.lowLightVision = {
        enabled: true,
        range: result.lowLightRange || Infinity,
        source: 'vision',
      };
    }
  }

  /**
   * Build legacy format for backward compatibility
   * @private
   */
  #buildLegacyFormat(visionData, sensing) {
    // Build legacy array-based format from object-based sensing
    const preciseArray = Object.entries(sensing.precise).map(([type, range]) => ({ type, range }));
    const impreciseArray = Object.entries(sensing.imprecise).map(([type, range]) => ({ type, range }));

    // Build individual sense properties for legacy access
    const hearingPrecise = sensing.precise.hearing;
    const hearingImprecise = sensing.imprecise.hearing;
    const hearing = hearingPrecise
      ? { acuity: 'precise', range: hearingPrecise }
      : hearingImprecise
        ? { acuity: 'imprecise', range: hearingImprecise }
        : null;

    const lifesensePrecise = sensing.precise.lifesense;
    const lifesenseImprecise = sensing.imprecise.lifesense;
    const lifesense = lifesensePrecise
      ? { acuity: 'precise', range: lifesensePrecise }
      : lifesenseImprecise
        ? { acuity: 'imprecise', range: lifesenseImprecise }
        : null;

    // Check for echolocation
    const echolocationActive = !!(sensing.precise.echolocation || sensing.imprecise.echolocation);
    const echolocationRange = sensing.precise.echolocation || sensing.imprecise.echolocation || 0;

    // Build individual senses object for all sense types
    const individualSenses = {};
    for (const [type, range] of Object.entries(sensing.precise)) {
      individualSenses[type] = { acuity: 'precise', range };
    }
    for (const [type, range] of Object.entries(sensing.imprecise)) {
      if (!individualSenses[type]) {
        individualSenses[type] = { acuity: 'imprecise', range };
      }
    }

    // Build sensingSummary with ARRAY-based format for legacy compatibility
    const sensingSummary = {
      // Legacy array-based API (for seek dialog and other UI)
      precise: preciseArray,
      imprecise: impreciseArray,

      // Legacy special properties
      hearing,
      lifesense,
      echolocationActive,
      echolocationRange,
      individualSenses,
    };

    return {
      // Vision flags
      hasVision: visionData.hasVision,
      hasDarkvision: visionData.hasDarkvision,
      hasLowLightVision: visionData.hasLowLightVision,
      hasGreaterDarkvision: visionData.hasGreaterDarkvision,
      hasRegularDarkvision: visionData.hasDarkvision && !visionData.hasGreaterDarkvision,
      darkvisionRange: visionData.darkvisionRange,
      lowLightRange: visionData.lowLightRange,

      // Conditions
      isBlinded: visionData.isBlinded,
      isDeafened: visionData.isDeafened,
      isDazzled: visionData.isDazzled,

      // Detection modes
      detectionModes: visionData.detectionModes,

      // Top-level: modern object-based structure (for new code)
      precise: sensing.precise,
      imprecise: sensing.imprecise,

      // Top-level: legacy special properties  
      hearing,
      lifesense,
      echolocationActive,
      echolocationRange,
      individualSenses,
      ...individualSenses, // Spread for direct access

      // Nested sensingSummary: array-based for legacy UI (seek dialog, etc.)
      sensingSummary,
    };
  }

  /**
   * Check if actor has a specific condition
   * @private
   */
  #hasCondition(actor, conditionSlug) {
    try {
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

      // Method 4: Iterate through conditions
      if (actor.conditions) {
        try {
          return Array.from(actor.conditions).some(
            condition => condition.slug === conditionSlug || condition.key === conditionSlug
          );
        } catch {
          // Ignore iteration errors
        }
      }

      // Method 5: Check itemTypes
      if (actor.itemTypes?.condition) {
        return actor.itemTypes.condition.some(
          condition => condition.slug === conditionSlug || condition.system?.slug === conditionSlug
        );
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Get cached capabilities
   * @private
   */
  #getFromCache(token) {
    const key = token.id || token.document?.id;
    if (!key) return null;

    const timestamp = this.#cacheTimestamp.get(key);
    if (!timestamp) return null;

    const age = Date.now() - timestamp;
    if (age > this.#cacheTimeout) {
      this.#capabilitiesCache.delete(key);
      this.#cacheTimestamp.delete(key);
      return null;
    }

    return this.#capabilitiesCache.get(key);
  }

  /**
   * Set cache
   * @private
   */
  #setCache(token, result) {
    const key = token.id || token.document?.id;
    if (!key) return;

    this.#capabilitiesCache.set(key, result);
    this.#cacheTimestamp.set(key, Date.now());
  }

  /**
   * Empty capabilities
   * @private
   */
  #emptyCapabilities() {
    return {
      precise: {},
      imprecise: {},
      hearing: null,
      lifesense: null,
      echolocationActive: false,
      echolocationRange: 0,
      individualSenses: {},
    };
  }

  /**
   * Empty legacy capabilities
   * @private
   */
  #emptyLegacyCapabilities() {
    return {
      hasVision: false,
      hasDarkvision: false,
      hasLowLightVision: false,
      hasGreaterDarkvision: false,
      hasRegularDarkvision: false,
      darkvisionRange: 0,
      lowLightRange: 0,
      isBlinded: false,
      isDeafened: false,
      isDazzled: false,
      detectionModes: {},
      precise: [],
      imprecise: [],
      hearing: null,
      lifesense: null,
      echolocationActive: false,
      echolocationRange: 0,
      individualSenses: {},
      sensingSummary: this.#emptyCapabilities(),
    };
  }
}
