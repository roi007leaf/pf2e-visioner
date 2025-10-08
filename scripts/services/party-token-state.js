/**
 * Party token state preservation service
 * Handles saving and restoring visibility/cover states when tokens are consolidated into party tokens
 */

import { MODULE_ID } from '../constants.js';
import { getCoverMap, setCoverMap } from '../stores/cover-map.js';
import { getVisibilityMap, setVisibilityMap } from '../stores/visibility-map.js';

/**
 * Save a token's current visibility and cover state before it's consolidated into a party token
 * @param {TokenDocument} tokenDoc - The token being consolidated
 */
export async function saveTokenStateForParty(tokenDoc) {
  try {
    if (!game.user.isGM) {
      return;
    }
    if (!tokenDoc?.id || !tokenDoc?.actor?.id) {
      return;
    }

    const scene = tokenDoc.parent || canvas.scene;
    if (!scene) {
      return;
    }

    // Get current state cache
    const cache = scene.getFlag(MODULE_ID, 'partyTokenStateCache') || {};

    // Create state entry for this token
    const tokenState = {
      tokenId: tokenDoc.id,
      actorId: tokenDoc.actor.id,
      actorSignature: tokenDoc.actor.signature,
      name: tokenDoc.name,
      savedAt: Date.now(),
      visibility: {},
      cover: {},
      effects: [],
    };

    // Get the token object - during deletion, the token might not be in canvas anymore
    let token = canvas.tokens?.get?.(tokenDoc.id);
    if (!token) {
      // Try to get from tokenDoc.object or create a minimal token representation
      token = tokenDoc.object || {
        id: tokenDoc.id,
        actor: tokenDoc.actor,
        document: tokenDoc,
        // Mock the getters that our functions expect
        getFlag: (scope, key) => tokenDoc.getFlag(scope, key),
        setFlag: (scope, key, value) => tokenDoc.setFlag(scope, key, value),
      };
    }

    // Save visibility and cover maps FROM this token (as observer)
    tokenState.visibility = getVisibilityMap(token) || {};
    tokenState.cover = getCoverMap(token) || {};

    // Save visibility and cover states TO this token (from other observers)
    const allTokens = canvas.tokens?.placeables || [];
    tokenState.observerStates = {};

    for (const observer of allTokens) {
      if (!observer?.document || observer.id === token.id) continue;

      const observerVisMap = getVisibilityMap(observer);
      const observerCovMap = getCoverMap(observer);

      if (observerVisMap?.[tokenDoc.id] || observerCovMap?.[tokenDoc.id]) {
        tokenState.observerStates[observer.id] = {
          visibility: observerVisMap?.[tokenDoc.id] || 'observed',
          cover: observerCovMap?.[tokenDoc.id] || 'none',
        };
      }
    }

    // Save module effects on this token
    if (token.actor?.itemTypes?.effect) {
      const allEffects = token.actor.itemTypes.effect;

      tokenState.effects = allEffects
        .filter((effect) => {
          const flags = effect.flags?.[MODULE_ID] || {};
          const isModuleEffect =
            flags.isEphemeralOffGuard ||
            flags.isEphemeralCover ||
            flags.aggregateOffGuard === true ||
            flags.aggregateCover === true;
          return isModuleEffect;
        })
        .map((effect) => ({
          id: effect.id,
          sourceId: effect.sourceId,
          name: effect.name,
          flags: effect.flags?.[MODULE_ID] || {},
          system: effect.system,
        }));
    }

    // Store in cache using actor signature as key (more stable than token ID)
    cache[tokenDoc.actor.signature] = tokenState;

    // Save cache to scene
    await scene.setFlag(MODULE_ID, 'partyTokenStateCache', cache);
  } catch (error) {
    console.error('PF2E Visioner: Error saving token state for party:', error);
  }
}

/**
 * Restore a token's visibility and cover state when it's brought back from a party token
 * @param {TokenDocument} tokenDoc - The token being restored
 */
export async function restoreTokenStateFromParty(tokenDoc) {
  try {
    if (!game.user.isGM) {
      return;
    }
    if (!tokenDoc?.id || !tokenDoc?.actor?.id) {
      return;
    }

    const scene = tokenDoc.parent || canvas.scene;
    if (!scene) {
      return;
    }

    // Get state cache
    const cache = scene.getFlag(MODULE_ID, 'partyTokenStateCache') || {};
    const actorSignature = tokenDoc.actor.signature;

    const savedState = cache[actorSignature];

    if (!savedState) {
      return false;
    }

    // Get the token object
    const token = canvas.tokens?.get?.(tokenDoc.id) || tokenDoc.object;
    if (!token) {
      return false;
    }

    // Restore visibility and cover maps FOR this token (as observer)
    if (Object.keys(savedState.visibility).length > 0) {
      await setVisibilityMap(token, savedState.visibility);
    }

    if (Object.keys(savedState.cover).length > 0) {
      await setCoverMap(token, savedState.cover);
    }

    // Restore visibility and cover states FROM other observers TO this token
    const updates = [];
    const allTokens = canvas.tokens?.placeables || [];
    const deferredUpdates = []; // For observers that might be restored later

    for (const [observerId, states] of Object.entries(savedState.observerStates || {})) {
      const observer = allTokens.find((t) => t.id === observerId);
      if (!observer?.document) {
        // Check if this observer might be in the party cache (another ally being restored)
        const observerInCache = Object.values(cache).find(
          (state) =>
            state.tokenId === observerId ||
            allTokens.some(
              (t) =>
                t.actor?.signature ===
                Object.keys(cache).find((sig) => cache[sig].tokenId === observerId),
            ),
        );

        if (observerInCache) {
          deferredUpdates.push({ observerId, states, tokenId: tokenDoc.id });
          continue;
        } else {
          continue;
        }
      }

      const patch = { _id: observerId };
      let hasChanges = false;

      // Restore visibility state
      if (states.visibility && states.visibility !== 'observed') {
        const currentVisMap = getVisibilityMap(observer);
        const newVisMap = { ...currentVisMap, [tokenDoc.id]: states.visibility };
        patch[`flags.${MODULE_ID}.visibility`] = newVisMap;
        hasChanges = true;
      }

      // Restore cover state
      if (states.cover && states.cover !== 'none') {
        const currentCovMap = getCoverMap(observer);
        const newCovMap = { ...currentCovMap, [tokenDoc.id]: states.cover };
        patch[`flags.${MODULE_ID}.cover`] = newCovMap;
        hasChanges = true;
      }

      if (hasChanges) {
        updates.push(patch);
      }
    }

    // Store deferred updates for later processing
    if (deferredUpdates.length > 0) {
      const deferredCache = scene.getFlag(MODULE_ID, 'deferredPartyUpdates') || {};
      deferredCache[tokenDoc.id] = deferredUpdates;
      await scene.setFlag(MODULE_ID, 'deferredPartyUpdates', deferredCache);
    }

    // Apply observer updates
    if (updates.length > 0) {
      await scene.updateEmbeddedDocuments('Token', updates, { diff: false });
    }

    // Skip restoring saved effects - we'll rebuild them based on current visibility maps instead
    // This prevents duplicate effects when visibility relationships are restored
    if (savedState.effects?.length > 0) {
    }

    // Clean up the cache entry
    delete cache[actorSignature];
    await scene.setFlag(MODULE_ID, 'partyTokenStateCache', cache);

    // Rebuild all effects (visibility and cover) for this token based on current maps
    // This ensures effects match the restored relationships
    try {
      await rebuildEffectsForToken(token);
    } catch (error) {
      console.warn('PF2E Visioner: Failed to rebuild effects after party restoration:', error);
    }

    // Process any deferred updates for this token (from other party members)
    try {
      await processDeferredPartyUpdates(tokenDoc, scene);
    } catch (error) {
      console.warn('PF2E Visioner: Failed to process deferred party updates:', error);
    }

    return true;
  } catch (error) {
    console.error('PF2E Visioner: Error restoring token state from party:', error);
    return false;
  }
}

/**
 * Check if a token was likely restored from a party token
 * This is a heuristic based on the token having an actor signature but no existing state
 * @param {TokenDocument} tokenDoc
 * @returns {boolean}
 */
export function isLikelyPartyTokenRestoration(tokenDoc) {
  try {
    if (!tokenDoc?.actor?.signature) {
      return false;
    }

    const scene = tokenDoc.parent || canvas.scene;
    if (!scene) {
      return false;
    }

    // Check if we have saved state for this actor signature
    const cache = scene.getFlag(MODULE_ID, 'partyTokenStateCache') || {};
    const hasCachedState = !!cache[tokenDoc.actor.signature];

    return hasCachedState;
  } catch (error) {
    console.error('PF2E Visioner: Error checking party restoration:', error);
    return false;
  }
}

/**
 * Manual restoration function that can be called to force restoration of all party tokens
 * Useful for debugging or when automatic restoration fails
 */
export async function manuallyRestoreAllPartyTokens() {
  try {
    const scene = canvas.scene;
    if (!scene) {
      return;
    }

    const cache = scene.getFlag(MODULE_ID, 'partyTokenStateCache') || {};
    const cacheKeys = Object.keys(cache);

    if (cacheKeys.length === 0) {
      return;
    }

    let restoredCount = 0;

    // Check all current tokens
    for (const tokenDoc of scene.tokens) {
      if (tokenDoc?.actor?.signature && cacheKeys.includes(tokenDoc.actor.signature)) {
        try {
          await restoreTokenStateFromParty(tokenDoc);
          restoredCount++;
        } catch (error) {
          console.error(`PF2E Visioner: Failed to restore ${tokenDoc.name}:`, error);
        }
      }
    }

    ui.notifications.info(game.i18n.format('PF2E_VISIONER.NOTIFICATIONS.PARTY_RESTORE_SUCCESS', { count: restoredCount }));
  } catch (error) {
    console.error('PF2E Visioner: Error in manual restoration:', error);
    ui.notifications.error(game.i18n.localize('PF2E_VISIONER.NOTIFICATIONS.PARTY_RESTORE_FAILED'));
  }
}

/**
 * Process deferred party updates for tokens that were restored after their observers
 * @param {TokenDocument} tokenDoc - The token that was just restored
 * @param {Scene} scene - The scene
 */
async function processDeferredPartyUpdates(tokenDoc, scene) {
  try {
    const deferredCache = scene.getFlag(MODULE_ID, 'deferredPartyUpdates') || {};
    const updates = [];

    // Look for any deferred updates that reference this token as an observer
    for (const [targetTokenId, deferredUpdates] of Object.entries(deferredCache)) {
      for (const deferredUpdate of deferredUpdates) {
        if (deferredUpdate.observerId === tokenDoc.id) {
          const patch = { _id: tokenDoc.id };
          let hasChanges = false;

          // Apply the deferred visibility state
          if (deferredUpdate.states.visibility && deferredUpdate.states.visibility !== 'observed') {
            const currentVisMap = getVisibilityMap({ document: tokenDoc }) || {};
            const newVisMap = {
              ...currentVisMap,
              [targetTokenId]: deferredUpdate.states.visibility,
            };
            patch[`flags.${MODULE_ID}.visibility`] = newVisMap;
            hasChanges = true;
          }

          // Apply the deferred cover state
          if (deferredUpdate.states.cover && deferredUpdate.states.cover !== 'none') {
            const currentCovMap = getCoverMap({ document: tokenDoc }) || {};
            const newCovMap = { ...currentCovMap, [targetTokenId]: deferredUpdate.states.cover };
            patch[`flags.${MODULE_ID}.cover`] = newCovMap;
            hasChanges = true;
          }

          if (hasChanges) {
            updates.push(patch);
          }
        }
      }
    }

    // Apply any deferred updates
    if (updates.length > 0) {
      await scene.updateEmbeddedDocuments('Token', updates, { diff: false });
    }

    // Clean up processed deferred updates
    const cleanedCache = {};
    for (const [targetTokenId, deferredUpdates] of Object.entries(deferredCache)) {
      const remainingUpdates = deferredUpdates.filter(
        (update) => update.observerId !== tokenDoc.id,
      );
      if (remainingUpdates.length > 0) {
        cleanedCache[targetTokenId] = remainingUpdates;
      }
    }

    if (Object.keys(cleanedCache).length !== Object.keys(deferredCache).length) {
      await scene.setFlag(MODULE_ID, 'deferredPartyUpdates', cleanedCache);
    }
  } catch (error) {
    console.error('PF2E Visioner: Error processing deferred party updates:', error);
  }
}

/**
 * Rebuild all effects (visibility and cover) for a specific token based on current maps
 * This is a unified function that handles both effect types consistently
 * @param {Token} token - The token to rebuild effects for
 */
async function rebuildEffectsForToken(token) {
  try {
    const allTokens = canvas.tokens?.placeables || [];
    const { batchUpdateVisibilityEffects } = await import('../visibility/ephemeral.js');
    const { batchUpdateCoverEffects } = await import('../cover/ephemeral.js');

    // Rebuild effects FROM this token (as observer) to all targets
    const observerVisMap = getVisibilityMap(token) || {};
    const observerCovMap = getCoverMap(token) || {};

    // Only create effects for non-default states
    const observerVisTargets = allTokens
      .filter(
        (t) => t.id !== token.id && observerVisMap[t.id] && observerVisMap[t.id] !== 'observed',
      )
      .map((t) => ({ target: t, state: observerVisMap[t.id] }));

    const observerCovTargets = allTokens
      .filter((t) => t.id !== token.id && observerCovMap[t.id] && observerCovMap[t.id] !== 'none')
      .map((t) => ({ target: t, state: observerCovMap[t.id] }));

    if (observerVisTargets.length > 0) {
      await batchUpdateVisibilityEffects(token, observerVisTargets);
    }

    if (observerCovTargets.length > 0) {
      await batchUpdateCoverEffects(token, observerCovTargets);
    }

    // Rebuild effects TO this token (from other observers)
    for (const observer of allTokens) {
      if (observer.id === token.id) continue;

      const visMap = getVisibilityMap(observer) || {};
      const covMap = getCoverMap(observer) || {};

      // Only create effects for non-default states
      if (visMap[token.id] && visMap[token.id] !== 'observed') {
        await batchUpdateVisibilityEffects(observer, [{ target: token, state: visMap[token.id] }]);
      }

      if (covMap[token.id] && covMap[token.id] !== 'none') {
        await batchUpdateCoverEffects(observer, [{ target: token, state: covMap[token.id] }]);
      }
    }
  } catch (error) {
    console.error('PF2E Visioner: Error rebuilding effects for token:', error);
    throw error;
  }
}

/**
 * Clean up old cached states (older than 24 hours)
 */
export async function cleanupOldPartyTokenStates() {
  try {
    if (!game.user.isGM) return;

    const scene = canvas.scene;
    if (!scene) return;

    const cache = scene.getFlag(MODULE_ID, 'partyTokenStateCache') || {};
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

    let cleaned = false;
    for (const [signature, state] of Object.entries(cache)) {
      if (state.savedAt && now - state.savedAt > maxAge) {
        delete cache[signature];
        cleaned = true;
      }
    }

    if (cleaned) {
      await scene.setFlag(MODULE_ID, 'partyTokenStateCache', cache);
    }
  } catch (error) {
    console.error('PF2E Visioner: Error cleaning up party token states:', error);
  }
}
