/**
 * Central registration that composes small hook modules.
 */

import { MODULE_ID } from '../constants.js';
import { AutoCoverHooks } from '../cover/auto-cover/AutoCoverHooks.js';
import { onHighlightObjects } from '../services/hover-tooltips.js';
import { registerChatHooks } from './chat.js';
import { registerCombatHooks } from './combat.js';
import { onCanvasReady, onReady } from './lifecycle.js';
import { registerTokenHooks } from './token-events.js';
import { registerUIHooks } from './ui.js';

export async function registerHooks() {
  Hooks.on('ready', onReady);
  Hooks.on('canvasReady', onCanvasReady);
  const { registerHooks: registerOptimized } = await import('../hooks/optimized-registration.js');
  registerOptimized();
  registerChatHooks();

  // Hook to capture token positions at the moment stealth rolls are made
  Hooks.on('preCreateChatMessage', async (message) => {
    try {
      // Import the position capture service
      const { captureRollTimePosition } = await import(
        '../chat/services/position-capture-service.js'
      );
      await captureRollTimePosition(message);
    } catch (error) {
      console.warn('PF2E Visioner | Failed to capture roll-time position:', error);
    }
  });

  Hooks.on('highlightObjects', onHighlightObjects);

  // Token lifecycle
  registerTokenHooks();

  // UI hues
  registerUIHooks();
  registerCombatHooks();
  AutoCoverHooks.registerHooks();

  // Wall lifecycle: refresh indicators and see-through state when walls change
  Hooks.on('createWall', async () => {
    try {
      const { updateWallVisuals } = await import('../services/visual-effects.js');
      const id = canvas.tokens.controlled?.[0]?.id || null;
      await updateWallVisuals(id);
    } catch {}
  });
  Hooks.on('updateWall', async (doc, changes) => {
    try {
      // If Hidden Wall flag toggled on, default all observers to Hidden for that wall
      const hiddenChanged = changes?.flags?.[MODULE_ID]?.hiddenWall;
      if (hiddenChanged !== undefined) {
        if (hiddenChanged) {
          try {
            const tokens = canvas.tokens?.placeables || [];
            const updates = [];
            const { getConnectedWallDocsBySourceId } = await import(
              '../services/connected-walls.js'
            );
            const connected = getConnectedWallDocsBySourceId(doc.id) || [];
            const wallIds = [doc.id, ...connected.map((d) => d.id)];
            for (const t of tokens) {
              const current = t.document.getFlag?.(MODULE_ID, 'walls') || {};
              const next = { ...current };
              let changedAny = false;
              for (const wid of wallIds) {
                if (next[wid] !== 'hidden') {
                  next[wid] = 'hidden';
                  changedAny = true;
                }
              }
              if (changedAny) {
                const patch = { _id: t.document.id };
                patch[`flags.${MODULE_ID}.walls`] = next;
                updates.push(patch);
              }
            }
            if (updates.length) {
              // Only GMs can update token documents
              if (game.user.isGM) {
                await canvas.scene?.updateEmbeddedDocuments?.('Token', updates, { diff: false });
              }
            }
          } catch (_) {}
          // Mirror hidden flag to connected walls
          try {
            const { mirrorHiddenFlagToConnected } = await import('../services/connected-walls.js');
            await mirrorHiddenFlagToConnected(doc, true);
          } catch (_) {}
        } else {
          // If unhidden, remove entries for that wall from tokens
          try {
            const tokens = canvas.tokens?.placeables || [];
            const updates = [];
            const { getConnectedWallDocsBySourceId } = await import(
              '../services/connected-walls.js'
            );
            const connected = getConnectedWallDocsBySourceId(doc.id) || [];
            const wallIds = [doc.id, ...connected.map((d) => d.id)];
            for (const t of tokens) {
              const current = t.document.getFlag?.(MODULE_ID, 'walls') || {};
              let changedAny = false;
              const next = { ...current };
              for (const wid of wallIds) {
                if (next[wid]) {
                  delete next[wid];
                  changedAny = true;
                }
              }
              if (changedAny) {
                const patch = { _id: t.document.id };
                patch[`flags.${MODULE_ID}.walls`] = next;
                updates.push(patch);
              }
            }
            if (updates.length) {
              // Only GMs can update token documents
              if (game.user.isGM) {
                await canvas.scene?.updateEmbeddedDocuments?.('Token', updates, { diff: false });
              }
            }
          } catch (_) {}
          // Mirror hidden flag to connected walls (set hidden=false)
          try {
            const { mirrorHiddenFlagToConnected } = await import('../services/connected-walls.js');
            await mirrorHiddenFlagToConnected(doc, false);
          } catch (_) {}
        }
      }
    } catch (_) {}
    try {
      const { updateWallVisuals } = await import('../services/visual-effects.js');
      const id = canvas.tokens.controlled?.[0]?.id || null;
      await updateWallVisuals(id);
    } catch {}
  });
  Hooks.on('deleteWall', async (wallDocument) => {
    try {
      // Clean up any lingering visual indicators for the deleted wall
      const { cleanupDeletedWallVisuals } = await import('../services/visual-effects.js');
      await cleanupDeletedWallVisuals(wallDocument);

      // Update wall visuals for remaining walls
      const { updateWallVisuals } = await import('../services/visual-effects.js');
      const id = canvas.tokens.controlled?.[0]?.id || null;
      await updateWallVisuals(id);
    } catch {}
  });

  // Debounced token selection handler to prevent jittering
  let controlTokenTimeout = null;
  Hooks.on('controlToken', async (_token, _controlled) => {
    try {
      // Clear any pending update to prevent rapid-fire calls
      if (controlTokenTimeout) {
        clearTimeout(controlTokenTimeout);
      }

      // Debounce the visual update to prevent jittering
      controlTokenTimeout = setTimeout(async () => {
        try {
          const { updateWallVisuals } = await import('../services/visual-effects.js');
          const id = canvas.tokens.controlled?.[0]?.id || null;
          await updateWallVisuals(id);
        } catch (_) {}
        controlTokenTimeout = null;
      }, 50); // 50ms debounce
    } catch (_) {}
    const { updateWallVisuals } = await import('../services/visual-effects.js');
    const id = canvas.tokens.controlled?.[0]?.id || null;
    await updateWallVisuals(id);
  });

  Hooks.on('updateToken', async () => {
    try {
      const { updateWallVisuals } = await import('../services/visual-effects.js');
      const id = canvas.tokens.controlled?.[0]?.id || null;
      await updateWallVisuals(id);
    } catch (_) {}
  });

  // Prevent movement while awaiting Start Sneak confirmation
  Hooks.on('preUpdateToken', (tokenDoc, changes, options, userId) => {
    try {
      // Only care about positional movement
      if (!('x' in changes || 'y' in changes)) return;
      // Allow GMs to always move
      if (game.users?.get(userId)?.isGM) return;
      const actor = tokenDoc?.actor;
      if (!actor) return;
      // Determine waiting state either via our custom token flag or effect slug.
      const hasWaitingFlag = tokenDoc.getFlag?.(MODULE_ID, 'waitingSneak');
      let waitingEffect = null;
      // Only search effects if we don't already have the flag (cheap boolean first)
      if (!hasWaitingFlag) {
        waitingEffect = actor.itemTypes?.effect?.find?.(e => e?.system?.slug === 'waiting-for-sneak-start');
      }
      if (!hasWaitingFlag && !waitingEffect) return;
      // Block movement for non-GM users
      ui.notifications?.warn?.('You cannot move until Sneak has started.');
      return false; // Cancel update
    } catch (e) {
      console.warn('PF2E Visioner | preUpdateToken movement block failed:', e);
    }
  });
  Hooks.on('createToken', async () => {
    try {
      const { updateWallVisuals } = await import('../services/visual-effects.js');
      const id = canvas.tokens.controlled?.[0]?.id || null;
      await updateWallVisuals(id);
    } catch {}
  });
  Hooks.on('deleteToken', async () => {
    try {
      const { updateWallVisuals } = await import('../services/visual-effects.js');
      const id = canvas.tokens.controlled?.[0]?.id || null;
      await updateWallVisuals(id);
    } catch {}
  });
  Hooks.on('refreshToken', async () => {
    try {
      const { updateWallVisuals } = await import('../services/visual-effects.js');
      const id = canvas.tokens.controlled?.[0]?.id || null;
      await updateWallVisuals(id);
    } catch {}
  });

  // If the waiting-for-sneak-start effect is manually removed, clear the token flag so movement becomes allowed.
  Hooks.on('deleteItem', async (item) => {
    try {
      if (item?.type !== 'effect') return;
      if (item?.system?.slug !== 'waiting-for-sneak-start') return;
      const actor = item?.parent;
      if (!actor) return;
      // Find any active tokens for this actor on the current scene
  const tokens = canvas.tokens?.placeables?.filter(t => t.actor?.id === actor.id) || [];
      for (const t of tokens) {
        if (t.document.getFlag('pf2e-visioner', 'waitingSneak')) {
          try { await t.document.unsetFlag('pf2e-visioner', 'waitingSneak'); } catch {}
          try { if (t.locked) t.locked = false; } catch {}
        }
      }
    } catch (e) {
      console.warn('PF2E Visioner | deleteItem cleanup failed:', e);
    }
  });
}
