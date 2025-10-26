/**
 * Central registration that composes small hook modules.
 */

import { MODULE_ID } from '../constants.js';
import { AutoCoverHooks } from '../cover/auto-cover/AutoCoverHooks.js';
import { onHighlightObjects } from '../services/HoverTooltips.js';
import { getLogger } from '../utils/logger.js';
import { registerChatHooks } from './chat.js';
import { registerCombatHooks } from './combat.js';
import { onCanvasReady, onReady } from './lifecycle.js';
import { registerTokenHooks } from './token-events.js';
import { registerUIHooks } from './ui.js';

/**
 * Clean up AVS overrides for a defeated actor
 * @param {Actor} actor - The defeated actor
 * @async
 * @throws {Error} If an error occurs during AVS override cleanup
 */
async function cleanupAvsOverridesForDefeatedActor(actor) {
  try {
    // Find all tokens for this actor on the current scene
    const tokens = canvas.tokens?.placeables?.filter((t) => t.actor?.id === actor.id) || [];

    if (tokens.length === 0) {
      return;
    }

    // Import the AVS override manager
    const { default: AvsOverrideManager } = await import(
      '../chat/services/infra/AvsOverrideManager.js'
    );

    // Clean up overrides for each token of this actor
    for (const token of tokens) {
      await AvsOverrideManager.removeAllOverridesInvolving(token.document.id);
    }
  } catch (error) {
    console.error('PF2E Visioner | Failed to clean up AVS overrides for defeated actor:', error);
  }
}

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

  // Register item update hooks for rule element updates
  Hooks.on('updateItem', async (item, changes, options, userId) => {
    try {
      const { getLogger } = await import('../utils/logger.js');
      const log = getLogger('RuleElements/ItemUpdate');

      // Only process on GM client to avoid duplicate processing
      if (!game.user?.isGM) return;

      // Only process effect items
      if (item.type !== 'effect') return;

      // Check if the item has PF2eVisioner rule elements
      const rules = item.system?.rules || [];
      const hasVisionerRules = rules.some(rule =>
        rule.key === 'PF2eVisionerEffect' || rule.key === 'PF2eVisionerVisibility'
      );

      if (!hasVisionerRules) return;

      // Check if the changes affect rule elements
      const systemChanges = changes.system || {};
      const hasRuleChanges = Object.keys(systemChanges).some(key => 
        key === 'rules' || key.startsWith('rules.')
      );

      if (!hasRuleChanges) return;


      // Find tokens for this actor
      const actor = item.parent;
      if (!actor) return;

      const tokens = canvas?.tokens?.placeables?.filter(t => t.actor?.id === actor.id) || [];
      if (tokens.length === 0) return;

      // Wait a bit for PF2e to process the item update
      setTimeout(async () => {
        try {
          const rules = item.system?.rules || [];
          const visionerRule = rules.find(rule => 
            rule.key === 'PF2eVisionerEffect' || rule.key === 'PF2eVisionerVisibility'
          );

          if (!visionerRule) return;

          // Manually apply the operations without needing an instance
          const registryKey = `item-${item.id}`;
          
          for (const token of tokens) {
            // First, remove old flags
            const flagRegistry = token.document.getFlag('pf2e-visioner', 'ruleElementRegistry') || {};
            const flagsToRemove = flagRegistry[registryKey] || [];
            const updates = {};

            if (flagsToRemove.length > 0) {
              for (const flagPath of flagsToRemove) {
                updates[`flags.pf2e-visioner.${flagPath}`] = null;
              }
            }

            if (Object.keys(updates).length > 0) {
              await token.document.update(updates);
            }

            // Now manually apply each operation
            const operations = visionerRule.operations || [];
            const ruleElementId = `${item.id}-${visionerRule.slug || 'effect'}`;

            for (const operation of operations) {
              try {
                // Import the operation class
                let OperationClass = null;
                switch (operation.type) {
                  case 'distanceBasedVisibility':
                    OperationClass = (await import('../rule-elements/operations/DistanceBasedVisibility.js')).DistanceBasedVisibility;
                    await OperationClass.applyDistanceBasedVisibility(operation, token);
                    break;
                  case 'overrideVisibility':
                    OperationClass = (await import('../rule-elements/operations/VisibilityOverride.js')).VisibilityOverride;
                    await OperationClass.applyVisibilityOverride(operation, token);
                    break;
                  case 'modifySenses':
                    OperationClass = (await import('../rule-elements/operations/SenseModifier.js')).SenseModifier;
                    await OperationClass.applySenseModifications(token, operation.senseModifications, ruleElementId, operation.predicate);
                    break;
                  case 'modifyLighting':
                    OperationClass = (await import('../rule-elements/operations/LightingModifier.js')).LightingModifier;
                    await OperationClass.applyLightingModification(operation, token);
                    break;
                  case 'offGuardSuppression':
                    OperationClass = (await import('../rule-elements/operations/OffGuardSuppression.js')).OffGuardSuppression;
                    await OperationClass.applyOffGuardSuppression(operation, token);
                    break;
                }
              } catch (error) {
                console.warn(`PF2E Visioner | Failed to apply operation ${operation.type}:`, error);
              }
            }

            // Register the new flags
            const newRegistry = token.document.getFlag('pf2e-visioner', 'ruleElementRegistry') || {};
            newRegistry[registryKey] = operations.map(op => {
              switch (op.type) {
                case 'distanceBasedVisibility': return 'distanceBasedVisibility';
                case 'overrideVisibility': return 'visibilityReplacement';
                case 'modifySenses': return 'originalSenses';
                case 'modifyLighting': return `lightingModification.${op.source || 'lighting'}`;
                case 'offGuardSuppression': return 'offGuardSuppression';
                default: return null;
              }
            }).filter(Boolean);
            await token.document.setFlag('pf2e-visioner', 'ruleElementRegistry', newRegistry);
          }

          if (window.pf2eVisioner?.services?.autoVisibilitySystem?.recalculateForTokens) {
            const tokenIds = tokens.map(t => t.id);
            await window.pf2eVisioner.services.autoVisibilitySystem.recalculateForTokens(tokenIds);
          } else if (canvas?.perception) {
            canvas.perception.update({ refreshVision: true, refreshOcclusion: true });
          }
        } catch (error) {
          console.warn('PF2E Visioner | Failed to process rule element update:', error);
        }
      }, 500);
    } catch (error) {
      console.warn('PF2E Visioner | Failed to handle item update for rule elements:', error);
    }
  });

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
    const log = getLogger('AVS/Hooks');
    log.debug(() => ({
      msg: 'updateToken (registration.js) fired',
      tokenName: tokenDoc?.name,
      tokenId: tokenDoc?.id,
      changes,
      stack: new Error().stack,
    }));
    try {
      if (!('x' in changes || 'y' in changes)) return;

      const controlledTokens = canvas?.tokens?.controlled || [];
      if (controlledTokens.length === 0) return;

      const movedTokenId = tokenDoc.id;
      const targetPosition = {
        x: changes.x ?? tokenDoc.x,
        y: changes.y ?? tokenDoc.y,
      };

      const { updateSystemHiddenTokenHighlights } = await import('../services/visual-effects.js');

      for (const controlledToken of controlledTokens) {
        const positionOverride =
          controlledToken.document.id === movedTokenId ? targetPosition : null;

        await updateSystemHiddenTokenHighlights(controlledToken.document.id, positionOverride);
      }
    } catch (error) {
      console.warn('PF2E Visioner | updateToken hook failed:', error);
    }
  });

  Hooks.on('refreshToken', async (token) => {
    const log = getLogger('AVS/Hooks');
    log.debug(() => ({
      msg: 'refreshToken fired',
      tokenName: token?.name,
      tokenId: token?.id,
      stack: new Error().stack,
    }));

    // Skip processing if we're in the middle of ephemeral effect sync
    // This prevents feedback loops where effect updates trigger refreshToken → lightingRefresh → new batch
    if (globalThis.game?.pf2eVisioner?.suppressRefreshTokenProcessing) {
      log.debug?.('refreshToken: skipping processing during ephemeral effect sync');
      return;
    }

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

  // Handle actor updates to detect death/defeat and clean up AVS overrides

  // Handle ActiveEffect creation to detect death conditions
  Hooks.on('createActiveEffect', async (effect, options, userId) => {
    try {
      if (!game.user?.isGM) return;

      const avsEnabled = game.settings?.get?.('pf2e-visioner', 'autoVisibilityEnabled') ?? false;
      if (!avsEnabled) {
        return;
      }

      const actor = effect?.parent;
      if (!actor) {
        return;
      }

      // Check if this is a death-related effect
      const effectName = effect?.name?.toLowerCase() || '';
      const effectSlug = effect?.system?.slug || effect?.slug || '';
      const deathConditions = ['unconscious', 'dead', 'dying'];
      const deathNames = ['dead', 'unconscious', 'dying'];

      if (
        deathConditions.includes(effectSlug) ||
        deathNames.some((name) => effectName.includes(name))
      ) {
        // Actor got a death effect - clean up AVS overrides
        await cleanupAvsOverridesForDefeatedActor(actor);
      }
    } catch (error) {
      console.warn('PF2E Visioner | Error handling ActiveEffect creation:', error);
    }
  });

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

      const rules = item.system?.rules || [];
      const hasVisionerRules = rules.some(rule =>
        rule.key === 'PF2eVisionerEffect' || rule.key === 'PF2eVisionerVisibility'
      );

      if (hasVisionerRules && Array.isArray(item.ruleElements)) {
        const { getLogger } = await import('../utils/logger.js');
        const log = getLogger('RuleElements/Cleanup');

        log.debug(() => ({
          msg: 'Cleaning up rule elements for deleted effect',
          itemName: item.name,
          itemId: item.id,
          tokenCount: tokens.length,
          ruleElementCount: item.ruleElements.length
        }));

        for (const token of tokens) {
          const registryKey = `item-${item.id}`;
          const flagRegistry = token.document.getFlag('pf2e-visioner', 'ruleElementRegistry') || {};

          if (!flagRegistry[registryKey]) {
            log.debug(() => ({
              msg: 'No registry entry found for effect',
              tokenName: token.name,
              registryKey
            }));
            continue;
          }

          for (const ruleElement of item.ruleElements) {
            if (ruleElement?.key !== 'PF2eVisionerEffect' && ruleElement?.key !== 'PF2eVisionerVisibility') {
              continue;
            }

            try {
              log.debug(() => ({
                msg: 'Removing rule element flags',
                tokenName: token.name,
                ruleKey: ruleElement.key,
                ruleSlug: ruleElement.slug
              }));

              if (typeof ruleElement.removeAllFlagsForRuleElement === 'function') {
                await ruleElement.removeAllFlagsForRuleElement();
                log.debug(() => ({
                  msg: 'Successfully removed rule element flags',
                  tokenName: token.name,
                  ruleKey: ruleElement.key
                }));
              }
            } catch (error) {
              log.warn(() => ({
                msg: 'Failed to remove flags for rule element on effect deletion',
                tokenName: token.name,
                ruleKey: ruleElement?.key,
                error: error.message
              }));
            }
          }
        }
      }
    } catch (e) {
      console.warn('PF2E Visioner | deleteItem cleanup failed:', e);
    }
  });
}
