/**
 * FeatsHandler
 *
 * Purpose:
 * - Inspect an actor for specific PF2e feats that can influence outcome levels
 *   of supported actions (initial focus: Sneak/Hide).
 * - Provide adjustment hooks returning a delta to apply to the computed outcome.
 *
 * Conventions:
 * - Outcome levels ordered: critical-failure < failure < success < critical-success
 * - Adjustment returns an integer shift in this order: e.g., +1 means one step up.
 * - Unknown feats or actions result in a 0 shift.
 */


const OUTCOME_ORDER = ['critical-failure', 'failure', 'success', 'critical-success'];

/**
 * Resolve an Actor from a token or actor reference.
 * @param {Token|Actor} tokenOrActor
 * @returns {Actor|null}
 */
class FeatsHandlerInternal {
  static resolveActor(tokenOrActor) {
    if (!tokenOrActor) return null;
    if (tokenOrActor.actor) return tokenOrActor.actor;
    if (tokenOrActor.document?.actor) return tokenOrActor.document.actor;
    if (tokenOrActor.system?.attributes) return tokenOrActor;
    return null;
  }

  /**
   * Resolve a Token object from various shapes.
   * @param {Token|Actor} tokenOrActor
   * @returns {Token|null}
   */
  static resolveToken(tokenOrActor) {
    try {
      if (!tokenOrActor) return null;
      // If passed a token-like object
      if (tokenOrActor?.isToken || tokenOrActor?.center) return tokenOrActor;
      if (tokenOrActor?.object?.isToken || tokenOrActor?.object?.center) return tokenOrActor.object;
      if (tokenOrActor?.document?.object?.isToken) return tokenOrActor.document.object;

      // If passed an actor, prefer active token on canvas
      const actor = this.resolveActor(tokenOrActor);
      if (actor?.getActiveTokens) {
        const tokens = actor.getActiveTokens(true);
        if (tokens?.length) return tokens[0];
      }
    } catch { }
    return null;
  }
}

/**
 * Extract feat slugs present on the actor.
 * Supports PF2e system item structure: item.type === 'feat' and item.system.slug
 * @param {Actor} actor
 * @returns {Set<string>}
 */
function getActorFeatSlugs(actor) {
  try {
    const items = actor?.items ?? [];
    const slugs = new Set();
    for (const item of items) {
      if (item?.type !== 'feat') continue;
      const raw = item.system?.slug ?? item.slug ?? item.name?.toLowerCase()?.replace(/\s+/g, '-');
      const slug = normalizeSlug(raw);
      if (slug) slugs.add(slug);
    }
    return slugs;
  } catch (e) {
    console.warn('PF2E Visioner | Failed to read actor feats:', e);
    return new Set();
  }
}

/**
 * Mapping of supported feats to adjustment logic.
 * Keys are feat slugs. Values are functions returning integer outcome shift for given context.
 */
// Simple outcome shift adjusters per action
const SNEAK_FEAT_ADJUSTERS = {
  // Examples: These are conservative interpretations meant to be refined.
  'terrain-stalker': (ctx) => (ctx.terrainMatches ? +1 : 0),
  'vanish-into-the-land': (ctx) => (ctx.inNaturalTerrain ? +1 : 0),
};

const HIDE_FEAT_ADJUSTERS = {
  'terrain-stalker': (ctx) => (ctx.terrainMatches ? +1 : 0),
  'vanish-into-the-land': (ctx) => (ctx.inNaturalTerrain ? +1 : 0),
  'legendary-sneak': () => +1,
};

const SEEK_FEAT_ADJUSTERS = {
  // These mostly post-process visibility, but small shift can represent stronger detection
  'thats-odd': (ctx) => (ctx.isHiddenWall || ctx.subjectType === 'hazard' || ctx.subjectType === 'loot' ? +1 : 0),
  'keen-eyes': () => 0, // handled in visibility post-processing
};

const DIVERSION_FEAT_ADJUSTERS = {};

function normalizeSlug(nameOrSlug = '') {
  try {
    const lower = String(nameOrSlug).toLowerCase();
    // unify curly apostrophes to straight and then remove all apostrophes
    const noApos = lower.replace(/\u2019/g, "'").replace(/'+/g, '');
    // replace any remaining non-alphanumeric with single hyphens
    const dashed = noApos.replace(/[^a-z0-9]+/g, '-');
    // trim leading/trailing hyphens
    return dashed.replace(/^-+|-+$/g, '');
  } catch {
    return nameOrSlug;
  }
}


function getAdjusterMapForAction(action) {
  switch (action) {
    case 'sneak':
      return SNEAK_FEAT_ADJUSTERS;
    case 'hide':
      return HIDE_FEAT_ADJUSTERS;
    case 'seek':
      return SEEK_FEAT_ADJUSTERS;
    case 'create-a-diversion':
      return DIVERSION_FEAT_ADJUSTERS;
    default:
      return null;
  }
}

/**
 * Compute the total outcome adjustment for the given action.
 * @param {Token|Actor} tokenOrActor - Acting creature
 * @param {string} action - e.g., 'sneak', 'hide'
 * @param {object} context - environment context (lighting, terrain, observer senses)
 * @returns {{ shift: number, notes: string[] }} - Net shift and contributing notes
 */
import coverDetector from '../../cover/auto-cover/CoverDetector.js';
import EnvironmentHelper from '../../utils/environment.js';

export class FeatsHandler {
  /**
   * Compute the total outcome adjustment for the given action.
   * @param {Token|Actor} tokenOrActor - Acting creature
   * @param {string} action - e.g., 'sneak', 'hide'
   * @param {object} context - environment context (lighting, terrain, observer senses)
   * @returns {{ shift: number, notes: string[] }} - Net shift and contributing notes
   */
  static getOutcomeAdjustment(tokenOrActor, action, context = {}) {
    const actor = FeatsHandlerInternal.resolveActor(tokenOrActor);
    if (!actor) return { shift: 0, notes: [] };

    const featSlugs = getActorFeatSlugs(actor);
    let shift = 0;
    const notes = [];

    const map = getAdjusterMapForAction(action);
    if (!map || featSlugs.size === 0) return { shift, notes };

    for (const [slug, adjust] of Object.entries(map)) {
      if (!featSlugs.has(slug)) continue;
      try {
        const delta = Number(adjust(context) || 0);
        if (!Number.isFinite(delta) || delta === 0) continue;
        shift += delta;
        notes.push(`Feat '${slug}' adjusted outcome by ${delta > 0 ? '+' : ''}${delta}`);
      } catch (e) {
        console.warn(`PF2E Visioner | Error evaluating feat '${slug}':`, e);
      }
    }

    // Clamp shift between -2 and +2 (avoid extreme leaps); tuning knob
    shift = Math.max(-2, Math.min(2, shift));
    return { shift, notes };
  }

  /**
   * Apply an outcome shift to a base outcome string.
   * @param {('critical-failure'|'failure'|'success'|'critical-success')} base
   * @param {number} shift
   */
  static applyOutcomeShift(base, shift) {
    const idx = OUTCOME_ORDER.indexOf(base);
    if (idx < 0 || !Number.isFinite(shift) || shift === 0) return base;
    const newIdx = Math.max(0, Math.min(OUTCOME_ORDER.length - 1, idx + shift));
    return OUTCOME_ORDER[newIdx];
  }

  /**
   * Check if the actor has a feat by slug (or any of slugs)
   */
  static hasFeat(tokenOrActor, slugOrSlugs) {
    const actor = FeatsHandlerInternal.resolveActor(tokenOrActor);
    if (!actor) return false;
    const featSlugs = getActorFeatSlugs(actor);
    if (Array.isArray(slugOrSlugs)) {
      return slugOrSlugs.some((s) => featSlugs.has(normalizeSlug(s)));
    }
    return featSlugs.has(normalizeSlug(slugOrSlugs));
  }

  /**
   * Stealth helpers: centralize repeated checks
   */
  static hasCeaselessShadows(tokenOrActor) {
    return FeatsHandler.hasFeat(tokenOrActor, 'ceaseless-shadows');
  }

  /**
   * Given a cover state detected from a creature, upgrade it per Ceaseless Shadows.
   * Returns { state, canTakeCover }.
   */
  static upgradeCoverForCreature(tokenOrActor, coverState) {
    let state = coverState;
    try {
      if (FeatsHandler.hasCeaselessShadows(tokenOrActor)) {
        if (state === 'lesser') state = 'standard';
        else if (state === 'standard') state = 'greater';
      }
    } catch { /* best-effort */ }
    const canTakeCover = state === 'standard' || state === 'greater';
    return { state, canTakeCover };
  }

  /**
   * Whether to skip enforcing end cover/concealment requirement in Sneak/Hide (Ceaseless Shadows removes it).
   */
  static shouldSkipEndCoverRequirement(tokenOrActor, action) {
    try {
      if ((action === 'sneak' || action === 'hide') && FeatsHandler.hasCeaselessShadows(tokenOrActor)) return true;
    } catch { }
    return false;
  }

  /**
   * Post-process visibility result for feat effects that target visibility directly.
   * Returns possibly adjusted visibility string.
   */
  static adjustVisibility(action, tokenOrActor, current, newVisibility, context = {}) {
    const actor = FeatsHandlerInternal.resolveActor(tokenOrActor);
    if (!actor) return newVisibility;
    const feats = getActorFeatSlugs(actor);

    // Helper ladders
    const towardsObserved = ['undetected', 'hidden', 'observed'];
    const towardsConcealment = ['observed', 'concealed', 'hidden', 'undetected'];
    const step = (value, ladder, dir = +1) => {
      const i = ladder.indexOf(value);
      if (i < 0) return value;
      const ni = Math.max(0, Math.min(ladder.length - 1, i + dir));
      return ladder[ni];
    };

    // Seek-specific post adjustments
    if (action === 'seek') {
      // Keen Eyes: treat Undetected as Hidden; Hidden as Observed on Seek
      if (feats.has('keen-eyes')) {
        newVisibility = step(newVisibility, towardsObserved, +1);
      }
      // That's Odd: anomalies (hazards/loot/hidden walls) are easier to notice
      if (feats.has("thats-odd") || feats.has("that's-odd")) {
        const isAnomaly = !!(context?.isHiddenWall || context?.subjectType === 'hazard' || context?.subjectType === 'loot');
        if (isAnomaly) newVisibility = step(newVisibility, towardsObserved, +1);
      }
      return newVisibility;
    }

    // Hide/Sneak: Vanish into the Land improves concealment on success in natural terrain
    if ((action === 'hide' || action === 'sneak') && feats.has('vanish-into-the-land')) {
      let inNatural = !!context?.inNaturalTerrain;
      if (!inNatural) {
        try { inNatural = EnvironmentHelper.isEnvironmentActive(tokenOrActor, 'natural'); } catch { }
      }
      if (inNatural && (context?.outcome === 'success' || context?.outcome === 'critical-success')) {
        newVisibility = step(newVisibility, towardsConcealment, +1);
      }
      return newVisibility;
    }

    return newVisibility;
  }

  /**
   * Determine if the given token/actor represents a player character (PC).
   * Accepts either a Token or Actor; resolves to Actor and checks common PF2e indicators.
   * Criteria: actor.type === 'character' OR actor.hasPlayerOwner === true
   */
  static isPC(tokenOrActor) {
    try {
      const actor = FeatsHandlerInternal.resolveActor(tokenOrActor);
      if (!actor) return false;
      const type = actor.type ?? actor.system?.details?.type?.value;
      if (String(type).toLowerCase() === 'character') return true;
      if (actor.hasPlayerOwner === true) return true;
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Sneak speed multiplier helper.
   * Returns the multiplier to apply to walk speed while Sneaking.
   * Defaults to 0.5 (half speed). Certain feats allow full speed.
   * @param {Token|Actor} tokenOrActor
   * @param {object} context
   * @returns {number} e.g., 1.0 means full speed, 0.5 means half
   */
  static getSneakSpeedMultiplier(tokenOrActor) {
    const actor = FeatsHandlerInternal.resolveActor(tokenOrActor);
    if (!actor) return 0.5;
    const feats = getActorFeatSlugs(actor);
    // Full-speed Sneak feats
    if (feats.has('swift-sneak') || feats.has('legendary-sneak') || feats.has('very-very-sneaky')) return 1.0;
    // Future: partial reductions could be handled here (e.g., 0.75)
    return 0.5;
  }

  /**
   * Returns a flat distance bonus (in feet) to add to a single Sneak action's distance.
   * Example: very-sneaky -> +5 ft.
   */
  static getSneakDistanceBonusFeet(tokenOrActor) {
    const actor = FeatsHandlerInternal.resolveActor(tokenOrActor);
    if (!actor) return 0;
    const feats = getActorFeatSlugs(actor);
    let bonus = 0;
    if (feats.has('very-sneaky') || feats.has('sneaky')) bonus += 5;
    // Room for other feats that extend Sneak distance (stack carefully)
    return bonus;
  }

  /**
   * Override Sneak prerequisites based on feats.
   * Accepts base qualification booleans and optionally extra context info.
   * Returns a new object with possibly adjusted booleans and reason.
   * @param {Token|Actor} tokenOrActor
   * @param {{ startQualifies: boolean, endQualifies: boolean, bothQualify: boolean, reason?: string }} base
   * @param {{ startVisibility?: string, endVisibility?: string, endCoverState?: string }} [extra]
   */
  static overridePrerequisites(tokenOrActor, base, extra = {}) {
    const actor = FeatsHandlerInternal.resolveActor(tokenOrActor);
    if (!actor) return base;
    const feats = getActorFeatSlugs(actor);

    let { startQualifies, endQualifies } = base;
    let reason = base.reason || '';

    // Ceaseless Shadows: You no longer need cover or concealment to Hide or Sneak
    if (feats.has('ceaseless-shadows')) {
      endQualifies = true;
      reason = reason || 'Ceaseless Shadows removes cover/concealment requirement';
    }

    // Camouflage: In natural terrain, you can Hide and Sneak even without cover or being concealed.
    // Natural terrain includes: aquatic, arctic, desert, forest, mountain, plains, sky, swamp, underground
    // (but NOT urban environments)
    if (feats.has('camouflage')) {
      try {
        const naturalTerrains = ['aquatic', 'arctic', 'desert', 'forest', 'mountain', 'plains', 'sky', 'swamp', 'underground'];
        const inNaturalTerrain = naturalTerrains.some(terrain =>
          EnvironmentHelper.isEnvironmentActive(tokenOrActor, terrain)
        );
        if (inNaturalTerrain) {
          endQualifies = true;
          if (!reason) reason = 'Camouflage removes cover/concealment requirement in natural terrain';
        }
      } catch { /* best-effort only */ }
    }

    // Legendary Sneak: You can Hide and Sneak even without cover or being concealed.
    // RAW: bypass end prerequisites entirely.
    if (feats.has('legendary-sneak')) {
      endQualifies = true;
      if (!reason) reason = 'Legendary Sneak removes cover/concealment requirement';
    }

    // Very, Very Sneaky: End position does not require cover or concealment either
    if (!endQualifies && feats.has('very-very-sneaky')) {
      endQualifies = true;
      if (!reason) reason = 'Very, Very Sneaky removes end cover/concealment requirement';
    }

    // Vanish into the Land:
    // When in the difficult terrain you've selected for the Terrain Stalker feat,
    // you can Hide and Sneak even without cover or being Concealed.
    if (feats.has('vanish-into-the-land')) {
      try {
        const selections = FeatsHandler._getTerrainStalkerSelections(actor);
        for (const selection of selections) {
          const regions = EnvironmentHelper.getMatchingEnvironmentRegions(tokenOrActor, selection) || [];
          if (regions.length > 0) {
            // In matching difficult terrain for ANY TS selection: relax end requirement
            if (!endQualifies) endQualifies = true;
            if (!reason) reason = `Vanish into the Land (${selection} difficult terrain)`;
            break;
          }
        }
      } catch { /* best-effort only */ }
    }

    // Terrain Stalker: Can Hide or Sneak while observed in chosen terrain
    if (!endQualifies && feats.has('terrain-stalker')) {
      try {
        const selections = FeatsHandler._getTerrainStalkerSelections(actor);
        for (const selection of selections) {
          if (selection && EnvironmentHelper.isEnvironmentActive(tokenOrActor, selection)) {
            endQualifies = true;
            if (!reason) reason = `Terrain Stalker (${selection})`;
            break;
          }
        }
      } catch {
        // Fall back to legacy tag hints if any provided
        if (extra?.endTerrainTag) {
          endQualifies = true;
          if (!reason) reason = 'Terrain Stalker (chosen terrain)';
        }
      }
    }

    // Distracting Shadows: You can use creatures that are at least one size larger than you
    // as cover for the Hide and Sneak actions (but not for other uses).
    // Scope: only applies to Hide/Sneak prerequisite checks; does not modify actual cover state,
    // bonuses, or Take Cover eligibility.
    if (feats.has('distracting-shadows') && (extra?.action === 'hide' || extra?.action === 'sneak')) {
      try {
        const observer = extra?.observer || null;
        const actorToken = FeatsHandlerInternal.resolveToken(tokenOrActor) || tokenOrActor;

        // Compute start/end large-creature cover signals
        const endHint = extra?.endPoint || extra?.endCenter || null;

        // For end: prefer explicit boolean, else compute using endHint if provided.
        // If no hint is available (e.g., end position is virtual during preview), allow a conservative
        // fallback: if system detected only 'lesser' cover at end, consider it sufficient for prerequisites.
        let endHasLargeCover = typeof extra?.endHasLargeCreatureCover === 'boolean'
          ? extra.endHasLargeCreatureCover
          : (endHint ? coverDetector.hasLargeCreatureCover(observer, actorToken, endHint) : false);
        if (!endHasLargeCover && extra?.endCoverState === 'lesser') {
          endHasLargeCover = true; // Treat creature-provided lesser cover as sufficient for DS prerequisites
        }

        if (!endQualifies && endHasLargeCover) {
          endQualifies = true;
          if (!reason) reason = 'Distracting Shadows: using larger creature as cover (end)';
        }
      } catch (e) {
        console.warn('PF2E Visioner | Distracting Shadows prerequisite override failed:', e);
      }
    }

    const bothQualify = !!(startQualifies && endQualifies);
    return { ...base, startQualifies, endQualifies, bothQualify, reason };
  }

  /**
   * Public helper: is the given environment currently active for this token/actor?
   * @param {Token|Actor} tokenOrActor
   * @param {string} environmentKey
   * @returns {boolean}
   */
  static isEnvironmentActive(tokenOrActor, environmentKey) {
    return EnvironmentHelper.isEnvironmentActive(tokenOrActor, environmentKey);
  }

  /**
   * Public helper: get the selected Terrain Stalker environment, if any.
   * @param {Token|Actor} tokenOrActor
   * @returns {string|null}
   */
  static getTerrainStalkerSelection(tokenOrActor) {
    const actor = FeatsHandlerInternal.resolveActor(tokenOrActor);
    // Back-compat: return the first selection if multiple are present
    const list = FeatsHandler._getTerrainStalkerSelections(actor);
    return Array.isArray(list) && list.length ? list[0] : null;
  }

  /**
   * Read the selected environment from the actor's Terrain Stalker feat rules.
   * Tries to find an item with slug 'terrain-stalker' and a rule with a 'selection' field.
   * @param {Actor} actor
   * @returns {string|null}
   * @private
   */
  static _getTerrainStalkerSelections(actor) {
    const selections = new Set();
    try {
      const items = actor?.items ?? [];
      for (const it of items) {
        try {
          if (it?.type !== 'feat') continue;
          const slug = normalizeSlug(it.system?.slug ?? it.slug ?? it.name);
          if (slug !== 'terrain-stalker') continue;
          const rules = Array.isArray(it.system?.rules) ? it.system.rules : [];
          for (const r of rules) {
            const sel = r?.selection ?? r?.value?.selection ?? null;
            if (typeof sel === 'string' && sel) selections.add(normalizeSlug(sel));
          }
          // Some builds place selection only in the first rule
          if (!rules?.length) {
            const maybe = it.system?.selection ?? it.system?.value?.selection ?? null;
            if (typeof maybe === 'string' && maybe) selections.add(normalizeSlug(maybe));
          }
        } catch { /* skip malformed item */ }
      }
    } catch { }
    return Array.from(selections);
  }

  /**
   * Public helper: return all Terrain Stalker selections for this actor (supports multiple feats)
   * @param {Token|Actor} tokenOrActor
   * @returns {string[]} normalized selection keys (may be empty)
   */
  static getTerrainStalkerSelections(tokenOrActor) {
    const actor = FeatsHandlerInternal.resolveActor(tokenOrActor);
    return FeatsHandler._getTerrainStalkerSelections(actor);
  }
}

export default FeatsHandler;
