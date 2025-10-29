/**
 * Cover map store and helpers
 */

import { MODULE_ID } from '../constants.js';

/**
 * Get the cover map for a token
 * @param {Token} token
 * @returns {Record<string,string>}
 */
export function getCoverMap(token) {
  const map = token?.document.getFlag(MODULE_ID, 'cover') ?? {};
  return map;
}

/**
 * Persist cover map
 * @param {Token} token
 * @param {Record<string,string>} coverMap
 */
export async function setCoverMap(token, coverMap) {
  if (!token?.document) return;
  // Only GMs can update token documents
  if (!game.user.isGM) return;

  const path = `flags.${MODULE_ID}.cover`;
  const result = await token.document.update(
    { [path]: coverMap },
    { diff: false, render: false, animate: false },
  );

  // Track sources for each cover entry
  try {
    const { SourceTracker } = await import('../rule-elements/SourceTracker.js');
    for (const [targetId, state] of Object.entries(coverMap)) {
      if (state && state !== 'none') {
        const targetToken = canvas.tokens.get(targetId);
        if (targetToken) {
          await SourceTracker.addSourceToState(targetToken, 'cover', {
            id: token.id,
            type: 'manual-cover'
          }, token.id);
        }
      }
    }
  } catch (error) {
    console.warn('Error tracking cover sources in setCoverMap:', error);
  }

  return result;
}

/**
 * Read cover state between two tokens
 * @param {Token} observer
 * @param {Token} target
 */
export function getCoverBetween(observer, target) {
  const coverMap = getCoverMap(observer);
  return coverMap[target?.document?.id] || 'none';
}

/**
 * Write cover state between two tokens and apply PF2E condition
 * @param {Token} observer
 * @param {Token} target
 * @param {string} state
 */
export async function setCoverBetween(observer, target, state, options = {}) {
  const coverMap = getCoverMap(observer);
  const targetId = target?.document?.id;
  if (!targetId) return;

  // Skip if no change
  if (coverMap[targetId] === state) {
    if (!options.skipEphemeralUpdate) {
      try {
        const { batchUpdateCoverEffects } = await import('../cover/ephemeral.js');
        await batchUpdateCoverEffects(observer, [{ target, state }]);
      } catch (error) {
        console.error('Error updating cover effects:', error);
      }
    }
    return;
  }

  coverMap[targetId] = state;
  await setCoverMap(observer, coverMap);

  // Track the source for sneak/action qualification checks
  if (state && state !== 'none' && !options.skipSourceTracking) {
    try {
      const { SourceTracker } = await import('../rule-elements/SourceTracker.js');
      await SourceTracker.addSourceToState(target, 'cover', {
        id: observer.id,
        type: 'manual-cover'
      }, observer.id);
    } catch (error) {
      console.warn('Error tracking cover source:', error);
    }
  }

  if (options.skipEphemeralUpdate) return;
  try {
    const { batchUpdateCoverEffects } = await import('../cover/ephemeral.js');
    await batchUpdateCoverEffects(observer, [{ target, state }]);
  } catch (error) {
    console.error('Error updating cover effects:', error);
  }
}
