/**
 * Off-Guard Condition Handler using EphemeralEffect Rule Elements
 * This is a cleaner approach that uses PF2e's native EphemeralEffect system
 */

// removed duplicate helpers; use visibility/cleanup exports

/**
 * Clean up ephemeral effects for a specific target when visibility changes
 * @param {Token} observerToken - The observing token (who has the effect)
 * @param {Token} hiddenToken - The hidden token (who is targeted by the effect)
 */
export { cleanupDeletedTokenEffects, cleanupEphemeralEffectsForTarget } from './cleanup.js';

/**
 * Clean up all effects related to a deleted token
 * @param {TokenDocument} tokenDoc - The token document being deleted
 */
// removed duplicate exported implementation; use visibility/cleanup.js re-export above

/**
 * Update ephemeral effects when visibility changes
 * @param {Token} observerToken - The observing token
 * @param {Token} targetToken - The target token
 * @param {string} newVisibilityState - The new visibility state
 * @param {Object} options - Optional configuration
 * @param {boolean} options.initiative - Boolean (default: null)
 * @param {number} options.durationRounds - Duration in rounds (default: unlimited)
 * @param {string} options.effectTarget - Which token gets the effect ('observer' or 'subject')
 */
export async function updateEphemeralEffectsForVisibility(
  observerToken,
  targetToken,
  newVisibilityState,
  options = {},
) {
  const { updateSingleVisibilityEffect } = await import('./update.js');
  return updateSingleVisibilityEffect(observerToken, targetToken, newVisibilityState, options);
}

/**
 * Batch update visibility effects for multiple targets
 * @param {Token} observerToken - The observer token
 * @param {Array<Object>} targetUpdates - Array of {target: Token, state: string} objects
 * @param {Object} options - Optional configuration
 */
export async function batchUpdateVisibilityEffects(observerToken, targetUpdates, options = {}) {
  const { batchUpdateVisibilityEffects } = await import('./batch.js');
  return batchUpdateVisibilityEffects(observerToken, targetUpdates, options);
}

export async function batchUpdateVisibilityEffectsForObservers(observerUpdates, options = {}) {
  const { batchUpdateVisibilityEffectsForObservers } = await import('./batch.js');
  return batchUpdateVisibilityEffectsForObservers(observerUpdates, options);
}

/**
 * Create an ephemeral effect rule for a specific observer signature
 * @param {string} signature - The observer's signature
 * @returns {Object} The rule object
 */
// moved to helpers/visibility-helpers.js

/**
 * Create data for a new aggregate effect
 * @param {string} visibilityState - The visibility state ('hidden' or 'undetected')
 * @param {string} signature - The observer's signature or 'batch' for batch operations
 * @param {Object} options - Options for the effect
 * @returns {Object} The effect data object
 */
// moved to helpers/visibility-helpers.js
