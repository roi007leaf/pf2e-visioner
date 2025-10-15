/**
 * Central registration that composes small hook modules.
 */

import { MODULE_ID } from '../constants.js';
import { AutoCoverHooks } from '../cover/auto-cover/AutoCoverHooks.js';
import { onHighlightObjects } from '../services/HoverTooltips.js';
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

  // Initialize turn-based sneak tracker for Sneaky/Very Sneaky feats
  try {
    await import('../chat/services/TurnSneakTracker.js');
    // The tracker auto-registers its hooks in the constructor
  } catch (error) {
    console.error('PF2E Visioner | Failed to initialize turn sneak tracker:', error);
  }

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

  // Register effect perception hooks for automatic perception refresh
  // These work independently of the Auto-Visibility System
  const { onCreateActiveEffect, onUpdateActiveEffect, onDeleteActiveEffect } = await import(
    './effect-perception.js'
  );
  Hooks.on('createActiveEffect', onCreateActiveEffect);
  Hooks.on('updateActiveEffect', onUpdateActiveEffect);
  Hooks.on('deleteActiveEffect', onDeleteActiveEffect);

  // Wall lifecycle: refresh indicators and see-through state when walls change
  Hooks.on('createWall', async () => {
    try {
      const { updateWallVisuals } = await import('../services/visual-effects.js');
      const id = canvas.tokens.controlled?.[0]?.id || null;
      await updateWallVisuals(id);
    } catch { }
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
          } catch (_) { }
          // Mirror hidden flag to connected walls
          try {
            const { mirrorHiddenFlagToConnected } = await import('../services/connected-walls.js');
            await mirrorHiddenFlagToConnected(doc, true);
          } catch (_) { }
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
          } catch (_) { }
          // Mirror hidden flag to connected walls (set hidden=false)
          try {
            const { mirrorHiddenFlagToConnected } = await import('../services/connected-walls.js');
            await mirrorHiddenFlagToConnected(doc, false);
          } catch (_) { }
        }
      }
    } catch (_) { }
    try {
      const { updateWallVisuals } = await import('../services/visual-effects.js');
      const id = canvas.tokens.controlled?.[0]?.id || null;
      await updateWallVisuals(id);
    } catch { }
  });
  Hooks.on('deleteWall', async (wallDocument) => {
    try {
      // Clean up any lingering visual indicators for the deleted wall
      const { cleanupDeletedWallVisuals } = await import('../services/visual-effects.js');
      await cleanupDeletedWallVisuals(wallDocument);

      // Check if we have very few walls left - might indicate mass deletion
      const remainingWalls = canvas?.walls?.placeables?.length || 0;
      if (remainingWalls <= 2) {
        // Likely a mass deletion scenario - do global cleanup to catch any orphaned indicators
        const { cleanupAllWallIndicators } = await import('../services/visual-effects.js');
        await cleanupAllWallIndicators();
      }

      // Update wall visuals for remaining walls
      const { updateWallVisuals } = await import('../services/visual-effects.js');
      const id = canvas.tokens.controlled?.[0]?.id || null;
      await updateWallVisuals(id);
    } catch { }
  });

  // Removed controlToken hook - was causing excessive updateWallVisuals calls on token selection.
  // Wall visual updates should only occur when wall flags actually change, which is properly
  // handled by TokenEventHandler._handleWallFlagChanges method.

  // NOTE: Removed global 'updateToken' hook that was calling updateWallVisuals on every token update
  // This was causing hundreds of calls during movement animation. Wall visual updates are now
  // properly handled by TokenEventHandler._handleWallFlagChanges only when wall flags actually change.

  // Handle token movement events
  Hooks.on('preUpdateToken', (tokenDoc, changes, options, userId) => {
    try {
      // Only care about positional movement
      if (!('x' in changes || 'y' in changes)) return;

      // Prevent movement while awaiting Start Sneak confirmation (MUST BE SYNCHRONOUS)
      // Allow GMs to always move
      // Only block movement if AVS is enabled
      const avsEnabled = game.settings?.get?.('pf2e-visioner', 'autoVisibilityEnabled') ?? false;
      if (!game.users?.get(userId)?.isGM && avsEnabled) {
        const actor = tokenDoc?.actor;
        if (actor) {
          // Determine waiting state either via our custom token flag or effect slug.
          const hasWaitingFlag = tokenDoc.getFlag?.(MODULE_ID, 'waitingSneak');
          let waitingEffect = null;
          // Only search effects if we don't already have the flag (cheap boolean first)
          if (!hasWaitingFlag) {
            waitingEffect = actor.itemTypes?.effect?.find?.(
              (e) => e?.system?.slug === 'waiting-for-sneak-start',
            );
          }
          if (hasWaitingFlag || waitingEffect) {
            // Block movement for non-GM users
            ui.notifications?.warn?.('You cannot move until Sneak has started.');
            return false; // Cancel update
          }
        }
      }

      // Clear established invisible states when invisible creatures move (async, fire and forget)
      // This allows them to be re-detected through sound/movement
      const token = tokenDoc.object;
      if (token?.actor) {
        const isInvisible =
          token.actor.hasCondition?.('invisible') ||
          token.actor.system?.conditions?.invisible?.active ||
          token.actor.conditions?.has?.('invisible');

        if (isInvisible) {
          // Get the condition manager and clear established states
          const conditionManager = game.modules.get('pf2e-visioner')?.api?.getConditionManager?.();
          if (conditionManager?.clearEstablishedInvisibleStates) {
            conditionManager.clearEstablishedInvisibleStates(token).catch(() => { });
          }
        }
      }
    } catch (e) {
      console.warn('PF2E Visioner | preUpdateToken hook failed:', e);
    }
  });

  Hooks.on('updateToken', async (tokenDoc, changes, options, userId) => {
    try {
      if (!('x' in changes || 'y' in changes)) return;

      const controlledTokens = canvas?.tokens?.controlled || [];
      if (controlledTokens.length === 0) return;

      const movedTokenId = tokenDoc.id;
      const targetPosition = {
        x: changes.x ?? tokenDoc.x,
        y: changes.y ?? tokenDoc.y
      };

      const { updateSystemHiddenTokenHighlights } = await import('../services/visual-effects.js');

      for (const controlledToken of controlledTokens) {
        const positionOverride = controlledToken.document.id === movedTokenId
          ? targetPosition
          : null;

        await updateSystemHiddenTokenHighlights(controlledToken.document.id, positionOverride);
      }
    } catch (error) {
      console.warn('PF2E Visioner | updateToken hook failed:', error);
    }
  });

  Hooks.on('refreshToken', async (token) => {
    try {
      const controlledTokens = canvas?.tokens?.controlled || [];
      if (controlledTokens.length === 0) return;

      const { updateSystemHiddenTokenHighlights } = await import('../services/visual-effects.js');

      for (const controlledToken of controlledTokens) {
        if (controlledToken.document.id === token.document.id) {
          await updateSystemHiddenTokenHighlights(controlledToken.document.id);
        }
      }
    } catch (error) {
      console.warn('PF2E Visioner | refreshToken hook for lifesense indicators failed:', error);
    }
  });

  // Removed createToken hook - was causing excessive updateWallVisuals calls on token creation.
  // Wall visual updates should only occur when wall flags actually change, which is properly
  // handled by TokenEventHandler._handleWallFlagChanges method.

  // Removed deleteToken hook - was causing excessive updateWallVisuals calls on token deletion.
  // Wall visual updates should only occur when wall flags actually change, which is properly
  // handled by TokenEventHandler._handleWallFlagChanges method.

  // NOTE: Removed problematic 'refreshToken' hook that was calling updateWallVisuals on every token refresh
  // This was triggered by animation frames during movement, causing hundreds of calls. Wall visual updates are now
  // properly handled by TokenEventHandler._handleWallFlagChanges only when wall flags actually change.

  // If effects are manually removed, clear corresponding token flags
  Hooks.on('deleteItem', async (item) => {
    try {
      if (item?.type !== 'effect') return;

      const actor = item?.parent;
      if (!actor) return;

      // Find any active tokens for this actor on the current scene
      const tokens = canvas.tokens?.placeables?.filter((t) => t.actor?.id === actor.id) || [];

      // Only handle sneak-related cleanup if AVS is enabled
      const avsEnabled = game.settings?.get?.('pf2e-visioner', 'autoVisibilityEnabled') ?? false;

      // Handle waiting-for-sneak-start effect removal
      if (item?.system?.slug === 'waiting-for-sneak-start' && avsEnabled) {
        for (const t of tokens) {
          if (t.document.getFlag('pf2e-visioner', 'waitingSneak')) {
            try {
              await t.document.unsetFlag('pf2e-visioner', 'waitingSneak');
            } catch { }
            try {
              if (t.locked) t.locked = false;
            } catch { }
          }
        }
      }

      // Handle Sneaking effect removal - clear sneak-active flag as failsafe
      const isSneakingEffect = item?.flags?.['pf2e-visioner']?.sneakingEffect;
      if (isSneakingEffect && avsEnabled) {
        for (const t of tokens) {
          const hasSneakActive = t.document.getFlag('pf2e-visioner', 'sneak-active');
          if (hasSneakActive) {
            try {
              await t.document.unsetFlag('pf2e-visioner', 'sneak-active');
            } catch {
              console.error(`PF2E Visioner | Failed to clear sneak-active flag for ${t.name}`);
            }
          }
        }
      }
    } catch (e) {
      console.warn('PF2E Visioner | deleteItem cleanup failed:', e);
    }
  });
}
