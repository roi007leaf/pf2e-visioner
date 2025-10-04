/**
 * Utility functions for PF2E Visioner Token Manager
 */

import { shouldFilterAlly } from './chat/services/infra/shared-utils.js';
import { COVER_STATES, MODULE_ID, VISIBILITY_STATES } from './constants.js';
// Re-export core state stores to enforce single source of truth
export { cleanupDeletedToken, restoreDeletedTokenMaps } from './services/scene-cleanup.js';
export { getCoverBetween, getCoverMap, setCoverBetween, setCoverMap } from './stores/cover-map.js';
export {
  getVisibility,
  getVisibilityBetween,
  getVisibilityMap,
  setVisibilityBetween,
  setVisibilityMap
} from './stores/visibility-map.js';

/**
 * Convert an SVG string into a data URI for use as an <img src>
 */
function svgDataUri(svg) {
  try {
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  } catch (_) {
    return '';
  }
}

/**
 * Get a representative image for a wall segment based on Foundry door type
 * doorType: 0 wall, 1 standard door, 2 secret door
 */
export function getWallImage(doorType = 0) {
  const dt = Number(doorType) || 0;
  if (dt === 1) {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 28 28'>
      <rect x='6' y='4' width='16' height='20' rx='2' ry='2' fill='#1e1e1e' stroke='#cccccc' stroke-width='2'/>
      <circle cx='19' cy='14' r='1.5' fill='#e6e6e6'/>
    </svg>`;
    return svgDataUri(svg);
  }
  if (dt === 2) {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 28 28'>
      <rect x='6' y='4' width='16' height='20' rx='2' ry='2' fill='#1e1e1e' stroke='#d4af37' stroke-width='2'/>
      <circle cx='19' cy='14' r='1.5' fill='#d4af37'/>
      <path d='M7 7l14 14' stroke='#d4af37' stroke-width='1.5' opacity='0.7'/>
    </svg>`;
    return svgDataUri(svg);
  }
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 28 28'>
    <rect x='4' y='4' width='20' height='20' fill='#1e1e1e' stroke='#cccccc' stroke-width='2'/>
    <path d='M8 6v16M14 6v16M20 6v16' stroke='#888888' stroke-width='2'/>
  </svg>`;
  return svgDataUri(svg);
}

/**
 * Get the visibility map for a token
 * @param {Token} token - The token to get visibility data for
 * @returns {Object} Visibility map object
 */
// getVisibilityMap → re-exported from stores/visibility-map

/**
 * Set the visibility map for a token
 * @param {Token} token - The token to set visibility data for
 * @param {Object} visibilityMap - The visibility map to save
 * @returns {Promise} Promise that resolves when flag is set
 */
// setVisibilityMap → re-exported from stores/visibility-map

/**
 * Get visibility state between two tokens
 * @param {Token} observer - The observing token
 * @param {Token} target - The target token being observed
 * @returns {string} Visibility state
 */
// getVisibilityBetween → re-exported from stores/visibility-map

/**
 * Set visibility state between two tokens
 * @param {Token} observer - The observing token
 * @param {Token} target - The target token being observed
 * @param {string} state - The visibility state to set
 * @param {Object} options - Additional options
 * @param {number} options.durationRounds - Duration of visibility change in rounds
 * @param {boolean} options.initiative - Boolean (default: null)
 * @param {boolean} options.skipEphemeralUpdate - Skip updating ephemeral effects (default: false)
 * @param {string} options.direction - Direction of visibility check ('observer_to_target' or 'target_to_observer')
 * @returns {Promise} Promise that resolves when visibility is set
 */
// setVisibilityBetween → re-exported from stores/visibility-map

/**
 * Clean up visibility and cover data when a token is deleted
 * @param {TokenDocument} tokenDoc - The token document being deleted
 */
// cleanupDeletedToken → re-exported from services/scene-cleanup

/**
 * Restore previously removed visibility/cover entries for a token that was undone/recreated
 * Performs bulk updates for performance
 * @param {TokenDocument} tokenDoc - The recreated token document
 * @returns {Promise<boolean>} true if restoration performed
 */
// restoreDeletedTokenMaps → re-exported from services/scene-cleanup

/**
 * Create visibility indicator element
 * @param {string} state - The visibility state
 * @returns {HTMLElement} The indicator element
 */
export function createVisibilityIndicator(state) {
  if (state === 'observed') return null;

  const config = VISIBILITY_STATES[state];
  if (!config) return null;

  const indicator = document.createElement('div');
  indicator.className = 'visibility-indicator';
  indicator.innerHTML = `<i class="${config.icon}" style="color: ${config.color}"></i>`;
  indicator.style.cssText = `
    position: absolute;
    top: 2px;
    right: 2px;
    background: rgba(0,0,0,0.8);
    border: 1px solid rgba(255,255,255,0.3);
    border-radius: 50%;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    z-index: 100;
    pointer-events: none;
    box-shadow: 0 2px 4px rgba(0,0,0,0.5);
    animation: visibilityPulse 2s ease-in-out infinite;
  `;

  return indicator;
}

/**
 * Show a notification to the user
 * @param {string} key - The localization key
 * @param {string} type - The notification type (info, warn, error)
 */
export function showNotification(key, type = 'info') {
  const message = game.i18n.localize(key);
  ui.notifications[type](message);
}

/**
 * Validate that a token is valid for visibility operations
 * @param {Token} token - The token to validate
 * @returns {boolean} Whether the token is valid
 */
export function isValidToken(token) {
  // Don't use token.isVisible as it excludes undetected tokens
  // Instead, check if the token exists and has a valid document
  if (!token || !token.document || !token.actor) {
    return false;
  }

  // Filter out irrelevant actor types that don't need visibility management
  const actorType = token.actor.type;

  // Loot: include when explicitly enabled, regardless of HP or name patterns
  if (actorType === 'loot') {
    try {
      return !!game.settings.get(MODULE_ID, 'includeLootActors');
    } catch (_) {
      return false;
    }
  }

  // Exclude vehicles unless they have crew (vehicles are usually just objects)
  if (actorType === 'vehicle') {
    return false;
  }

  // Exclude party actors - they're organizational, not individual creatures
  if (actorType === 'party') {
    return false;
  }

  // Additional filtering based on actor properties
  const actor = token.actor;

  // Filter out tokens that are clearly non-creatures based on name patterns
  const name = token.document.name?.toLowerCase() || '';
  const excludePatterns = [
    /\b(loot|treasure|chest|container|barrel|crate|sack)\b/,
    /\b(door|gate|portal|entrance|exit)\b/,
    /\b(light|torch|lantern|candle|fire)\b/,
    /\b(trap|pressure.plate|trigger)\b/,
    /\b(furniture|table|chair|bed|altar)\b/,
    /\b(decoration|statue|pillar|column)\b/,
    /\b(marker|waypoint|location|area)\b/,
  ];

  // If loot is included, don't auto-exclude via name patterns
  if (excludePatterns.some((pattern) => pattern.test(name))) {
    try {
      // Non-loot: respect exclusions; loot was already handled above
      if (token.actor?.type !== 'loot') return false;
    } catch (_) {
      return false;
    }
  }

  // Include character and npc types (the main creature types)
  if (actorType === 'character' || actorType === 'npc' || actorType === 'hazard') {
    return true;
  }

  // For unknown actor types, be conservative and include them
  // but exclude if they have no HP (likely not a creature)
  if (actor.system?.attributes?.hp?.max === 0) {
    return false;
  }

  return true;
}

/**
 * Check if a token is a loot token
 * Loot tokens should only use Foundry's native hidden state (two states: hidden or observed)
 * @param {Token|Object} token - The token to check (can be Token or token document)
 * @returns {boolean} True if the token is a loot type
 */
export function isLootToken(token) {
  try {
    const actorType = token?.actor?.type ?? token?.document?.actor?.type;
    return actorType === 'loot';
  } catch {
    return false;
  }
}

/**
 * Get all valid scene targets for the observer token
 * @param {Token} observer - The observer token
 * @param {boolean} encounterOnly - Whether to filter to encounter tokens only
 * @returns {Array} Array of target tokens
 */
export function getSceneTargets(observer, encounterOnly = false, ignoreAllies = null) {
  if (!observer) return [];

  // Get all tokens except the observer
  let allTokens = canvas.tokens.placeables.filter((token) => {
    return token !== observer && token.actor && isValidToken(token);
  });

  // Apply ally filtering: prefer per-call override, else global setting
  allTokens = allTokens.filter((token) => {
    return !shouldFilterAlly(observer, token, 'enemies', ignoreAllies);
  });

  // Apply encounter filtering if requested
  if (!encounterOnly) {
    return allTokens;
  }

  // Filter to only tokens that are in the current encounter, including
  // familiars/companions/eidolons tied to a combatant even if not listed
  return allTokens.filter((token) => {
    if (!game.combat || !game.combat.combatants.size) return true;

    const actor = token?.actor;
    // Always include familiars regardless of encounter filter
    if (actor?.type === 'familiar') return true;

    // Check if this specific token (by ID) is directly in the encounter
    const tokenId = token?.id ?? token?.document?.id;
    if (!tokenId) return false;

    // Direct token match (primary check)
    const directMatch = game.combat.combatants.some((c) => c.tokenId === tokenId);
    if (directMatch) return true;

    // Eidolon master linkage - include eidolons whose masters are in combat
    const master =
      actor?.type === 'eidolon' || actor?.isOfType?.('eidolon')
        ? actor?.system?.eidolon?.master
        : null;
    if (master) {
      const masterTokenId = master?.getActiveTokens?.(true, true)?.[0]?.id;
      if (masterTokenId && game.combat.combatants.some((c) => c.tokenId === masterTokenId)) {
        return true;
      }
    }

    // No other fallbacks - prevents including random token copies
    return false;
  });
}

/**
 * Check if there's an active encounter
 * @returns {boolean} True if there's an active encounter with combatants
 */
export function hasActiveEncounter() {
  return !!(game.combat && game.combat.combatants.size > 0);
}

/**
 * Check if a token is in the current encounter
 * @param {Token} token - The token to check
 * @returns {boolean} True if the token is in the encounter
 */
export function isTokenInEncounter(token) {
  if (!hasActiveEncounter()) return false;

  return game.combat.combatants.some((combatant) => combatant.token?.id === token.document.id);
}

/**
 * Capitalize the first letter of a string
 * @param {string} str - The string to capitalize
 * @returns {string} The capitalized string
 */
export function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Get the cover map for a token
 * @param {Token} token - The token to get cover data for
 * @returns {Object} Cover map object
 */
// getCoverMap → re-exported from stores/cover-map

/**
 * Set the cover map for a token
 * @param {Token} token - The token to set cover data for
 * @param {Object} coverMap - The cover map to save
 * @returns {Promise} Promise that resolves when flag is set
 */
// setCoverMap → re-exported from stores/cover-map

/**
 * Get cover state between two tokens
 * @param {Token} observer - The observing token
 * @param {Token} target - The target token being observed
 * @returns {string} Cover state
 */
// getCoverBetween → re-exported from stores/cover-map

/**
 * Set cover state between two tokens
 * @param {Token} observer - The observing token
 * @param {Token} target - The target token being observed
 * @param {string} state - The cover state to set
 * @returns {Promise} Promise that resolves when cover is set
 */
// setCoverBetween → re-exported from stores/cover-map

/**
 * Create cover indicator element
 * @param {string} state - The cover state
 * @returns {HTMLElement} The indicator element
 */
export function createCoverIndicator(state) {
  if (state === 'none') return null;

  const config = COVER_STATES[state];
  if (!config) return null;

  const indicator = document.createElement('div');
  indicator.className = 'cover-indicator';
  indicator.innerHTML = `<i class="${config.icon}" style="color: ${config.color}"></i>`;
  indicator.style.cssText = `
    position: absolute;
    top: 2px;
    left: 2px;
    background: rgba(0,0,0,0.8);
    border: 1px solid rgba(255,255,255,0.3);
    border-radius: 50%;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    z-index: 100;
    pointer-events: none;
    box-shadow: 0 2px 4px rgba(0,0,0,0.5);
  `;

  return indicator;
}

/**
 * Compute Perception DC for an actor with robust fallbacks
 * @param {Actor} actor
 * @returns {number|null}
 */
/**
 * Find the most recent chat roll total for an actor, optionally filtered by slug
 * @param {Actor} actor
 * @param {string|null} requiredSlug e.g., 'perception' | 'stealth'
 * @returns {number|null}
 */
export function getLastRollTotalForActor(actor, requiredSlug = null) {
  try {
    if (!actor || !game?.messages?.contents?.length) return null;
    const messages = game.messages.contents;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const msg = messages[i];
      try {
        const speakerActorId = msg.speaker?.actor || msg.actor?._id;
        if (speakerActorId !== actor.id) continue;
        // Check roll
        const total = msg.rolls?.[0]?.total;
        if (typeof total !== 'number') continue;
        if (requiredSlug) {
          const slug = msg.flags?.pf2e?.context?.slug || null;
          if (slug !== requiredSlug) continue;
        }
        return total;
      } catch (_) {
        /* ignore and continue */
      }
    }
  } catch (_) { }
  return null;
}
