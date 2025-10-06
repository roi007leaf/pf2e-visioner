/**
 * Token-related hooks: create/delete, highlight, HUD buttons
 */

import { MODULE_ID } from '../constants.js';
import {
  addTokenEventListener,
  cleanupHoverTooltips,
  initializeHoverTooltips,
} from '../services/HoverTooltips.js';
import { updateTokenVisuals } from '../services/visual-effects.js';

export async function onTokenCreated(scene, tokenDoc) {
  try {
    // Schedule party restoration check for later when token is fully ready
    if (!tokenDoc?.id) {
      // Use a longer delay to ensure token is fully initialized
      setTimeout(async () => {
        await checkAndRestorePartyTokenState(tokenDoc);
      }, 1000); // Wait 1 second
      return;
    }

    // Token has ID, check immediately
    await checkAndRestorePartyTokenState(tokenDoc);

    // Removed bulk rebuild; visuals will refresh and ephemerals are updated by batch routines
  } catch (error) {
    console.error('PF2E Visioner: Error in onTokenCreated:', error);
  }
  // Ensure Vision is enabled on newly created token documents
  try {
    if (game.settings.get(MODULE_ID, 'enableAllTokensVision')) {
      const currentEnabled = tokenDoc?.vision ?? tokenDoc?.sight?.enabled ?? undefined;
      if (currentEnabled !== true && tokenDoc?.actor?.type !== 'loot') {
        await tokenDoc.update?.(
          { vision: true, sight: { enabled: true } },
          { diff: false, render: false, animate: false },
        );
      }
    }
  } catch (_) { }
  setTimeout(async () => {
    await updateTokenVisuals();
    // Add hover tooltip listeners to the new token
    if (game.settings.get('pf2e-visioner', 'enableHoverTooltips')) {
      const token = canvas.tokens.get(tokenDoc.id);
      if (token) {
        addTokenEventListener(token);
      }
    }
  }, 100);
}

/**
 * Check and restore party token state if applicable
 * @param {TokenDocument} tokenDoc - The token to check
 */
async function checkAndRestorePartyTokenState(tokenDoc) {
  try {
    // First try to restore from deleted token cache (for undo operations)
    const { restoreDeletedTokenMaps } = await import('../services/scene-cleanup.js');
    const wasRestored = await restoreDeletedTokenMaps(tokenDoc);

    // If not restored from deleted cache, check if this might be a party token restoration
    if (!wasRestored) {
      const { isLikelyPartyTokenRestoration, restoreTokenStateFromParty } = await import(
        '../services/party-token-state.js'
      );
      if (isLikelyPartyTokenRestoration(tokenDoc)) {
        await restoreTokenStateFromParty(tokenDoc);
      }
    }
  } catch (error) {
    console.error('PF2E Visioner: Error in checkAndRestorePartyTokenState:', error);
  }
}

export async function onTokenDeleted(...args) {
  try {
    let tokenDoc = null;
    for (const a of args) {
      if (a && typeof a === 'object') {
        if (a?.actor && (a?.parent || a?.scene || a?.documentName === 'Token')) {
          tokenDoc = a;
          break;
        }
      }
    }
    if (!tokenDoc) {
      if (args[0]?.tokens && args[1]?.actor) tokenDoc = args[1];
    }
    if (!tokenDoc?.id) return;

    // Check if this might be a party token consolidation (actor still exists but token is being removed)
    // Look for actors that are likely player characters being consolidated into a party
    const isPartyConsolidation =
      tokenDoc.actor &&
      tokenDoc.actor.type === 'character' &&
      tokenDoc.actor.items &&
      tokenDoc.actor.items.size > 0 &&
      // Check if this looks like a player character (has class levels, etc.)
      (tokenDoc.actor.system?.details?.level?.value > 0 ||
        (tokenDoc.actor.system?.classes && Object.keys(tokenDoc.actor.system.classes).length > 0));

    if (isPartyConsolidation) {
      // Save state before consolidation
      const { saveTokenStateForParty } = await import('../services/party-token-state.js');
      await saveTokenStateForParty(tokenDoc);
    }

    const { cleanupDeletedToken } = await import('../services/scene-cleanup.js');
    const { cleanupDeletedTokenEffects } = await import('../visibility/ephemeral.js');
    const { cleanupDeletedTokenCoverEffects } = await import('../cover/ephemeral.js');
    if (tokenDoc) {
      try {
        await cleanupDeletedToken(tokenDoc);
      } catch (e) {
        console.warn('PF2E Visioner: map cleanup failed', e);
      }
      await Promise.all([
        cleanupDeletedTokenEffects(tokenDoc),
        cleanupDeletedTokenCoverEffects(tokenDoc),
      ]);

      try {
        const { default: AvsOverrideManager } = await import('../chat/services/infra/AvsOverrideManager.js');
        await AvsOverrideManager.removeAllOverridesInvolving(tokenDoc.id);
      } catch (error) {
        console.error('PF2E Visioner: AVS override cleanup failed', error);
      }
    }
    setTimeout(async () => {
      try {
        await updateTokenVisuals();
      } catch (e) {
        console.warn('PF2E Visioner: post-delete rebuild failed', e);
      }
      if (game.settings.get('pf2e-visioner', 'enableHoverTooltips')) {
        cleanupHoverTooltips();
        initializeHoverTooltips();
      }
    }, 100);
  } catch (error) {
    console.error('PF2E Visioner: Error cleaning up deleted token:', error);
  }
}

/**
 * Hook into token rendering to catch tokens when they're fully ready
 */
export function registerTokenHooks() {
  // Hook into token creation (use preCreateToken for better timing)
  Hooks.on('preCreateToken', onTokenCreated);

  // Hook into token deletion
  Hooks.on('deleteToken', onTokenDeleted);

  // Hook into token creation after it's fully created with proper ID and actor
  Hooks.on('createToken', async (tokenDoc, options, userId) => {
    if (game.user.id !== userId) return; // Only handle for the user who created the token

    // Small delay to ensure actor data is fully loaded
    setTimeout(async () => {
      await checkAndRestorePartyTokenState(tokenDoc);
    }, 100);
  });

  // Additional hook: when tokens are rendered on canvas (more reliable timing)
  Hooks.on('renderToken', (token, html, data) => {
    // Add hover tooltip listeners when token is rendered (most reliable timing)
    if (game.settings.get('pf2e-visioner', 'enableHoverTooltips')) {
      if (token?.id) {
        addTokenEventListener(token);
      }
    }

    // Check if this might be a party token restoration
    if (token?.document?.actor?.signature) {
      // Use a small delay to ensure token is fully rendered
      setTimeout(async () => {
        await checkAndRestorePartyTokenState(token.document);
      }, 100);
    }
  });

  // Fallback: Hook into ready event to catch any tokens that were missed
  Hooks.on('canvasReady', async () => {
    // Wait a bit for everything to settle
    setTimeout(async () => {
      const scene = canvas.scene;
      if (!scene) return;

      const cache = scene.getFlag(MODULE_ID, 'partyTokenStateCache') || {};
      const cacheKeys = Object.keys(cache);

      if (cacheKeys.length === 0) return;

      // Check all current tokens to see if any need restoration
      for (const tokenDoc of scene.tokens) {
        if (tokenDoc?.actor?.signature && cacheKeys.includes(tokenDoc.actor.signature)) {
          const { isLikelyPartyTokenRestoration, restoreTokenStateFromParty } = await import(
            '../services/party-token-state.js'
          );
          if (isLikelyPartyTokenRestoration(tokenDoc)) {
            await restoreTokenStateFromParty(tokenDoc);
          }
        }
      }
    }, 1000);
  });
}
