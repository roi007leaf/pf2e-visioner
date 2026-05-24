/**
 * Central registration that composes small hook modules.
 */

import { AutoCoverHooks } from '../cover/auto-cover/AutoCoverHooks.js';
import { registerSnipingDuoDamageBonusHooks } from '../feats/sniping-duo-damage-bonus.js';
import { onHighlightObjects } from '../services/HoverTooltips.js';
import { registerChatHooks } from './chat.js';
import { registerCombatHooks } from './combat.js';
import { onCanvasReady, onReady } from './lifecycle.js';
import { registerMovementCostHooks } from './movement-cost.js';
import { registerTokenHooks } from './token-events.js';
import { registerUIHooks } from './ui.js';
import { registerPf2eHudTakeCoverIntegration } from '../integrations/pf2e-hud-take-cover.js';
import { handleDefeatEffectCreated } from '../services/defeated-actor-cleanup.js';
import { handleVisionerRuleElementItemUpdate } from '../rule-elements/item-update-refresh.js';
import { cleanupDeletedEffectItem } from '../services/deleted-effect-cleanup.js';
import { createVisionMasterTokenRefresh } from '../services/vision-master-token-refresh.js';
import { handleSceneDisableAvsRefresh } from '../services/scene-disable-avs-refresh.js';
import { handlePreCreateChatMessage } from '../chat/services/pre-create-message.js';
import {
  initializeDeferredSeekManager,
  initializeTurnSneakTracker,
  registerEffectPerceptionHooks,
  registerTimedOverrideHooks,
} from './startup-managers.js';
import { handleWallCreated, handleWallDeleted, handleWallUpdated } from '../services/Walls/wall-lifecycle.js';
import {
  handleAvsBatchCompleteRefresh,
  handleTokenPreUpdate,
  handleTokenRefreshed,
  handleTokenUpdated,
} from '../services/token-render-lifecycle.js';

export async function registerHooks() {
  registerPf2eHudTakeCoverIntegration();

  Hooks.on('ready', onReady);
  Hooks.on('canvasReady', onCanvasReady);

  const visionMasterTokenRefresh = createVisionMasterTokenRefresh();

  Hooks.on('preUpdateToken', (tokenDoc, changes) => {
    visionMasterTokenRefresh.capturePreUpdate(tokenDoc, changes);
  });

  Hooks.on('updateToken', async (tokenDoc, changes) => {
    await visionMasterTokenRefresh.refreshAfterUpdate(tokenDoc, changes);
  });

  const { registerHooks: registerOptimized } = await import('../hooks/optimized-registration.js');
  registerOptimized();
  registerChatHooks();
  registerMovementCostHooks();

  await initializeTurnSneakTracker();

  // Hook to capture token positions at the moment stealth rolls are made
  Hooks.on('preCreateChatMessage', async (message) => {
    await handlePreCreateChatMessage(message);
  });

  Hooks.on('highlightObjects', onHighlightObjects);

  // Token lifecycle
  registerTokenHooks();

  // UI hues
  registerUIHooks();
  registerCombatHooks();
  await initializeDeferredSeekManager();
  AutoCoverHooks.registerHooks();
  registerSnipingDuoDamageBonusHooks();

  await registerTimedOverrideHooks();

  // Register effect perception hooks for automatic perception refresh
  // These work independently of the Auto-Visibility System
  await registerEffectPerceptionHooks();

  // Register item update hooks for rule element updates
  Hooks.on('updateItem', async (item, changes, options, userId) => {
    handleVisionerRuleElementItemUpdate(item, changes, options, userId);
  });

  // Wall lifecycle: refresh indicators and see-through state when walls change
  Hooks.on('createWall', async () => {
    await handleWallCreated();
  });
  Hooks.on('updateWall', async (doc, changes) => {
    await handleWallUpdated(doc, changes);
  });
  Hooks.on('deleteWall', async (wallDocument) => {
    await handleWallDeleted(wallDocument);
  });

  // Removed controlToken hook - was causing excessive updateWallVisuals calls on token selection.
  // Wall visual updates should only occur when wall flags actually change, which is properly
  // handled by TokenEventHandler._handleWallFlagChanges method.

  // NOTE: Removed global 'updateToken' hook that was calling updateWallVisuals on every token update
  // This was causing hundreds of calls during movement animation. Wall visual updates are now
  // properly handled by TokenEventHandler._handleWallFlagChanges only when wall flags actually change.

  // Handle token movement events
  Hooks.on('preUpdateToken', (tokenDoc, changes, options, userId) => {
    return handleTokenPreUpdate(tokenDoc, changes, options, userId);
  });

  Hooks.on('updateToken', async (tokenDoc, changes) => {
    await handleTokenUpdated(tokenDoc, changes);
  });

  Hooks.on('refreshToken', (token) => handleTokenRefreshed(token));

  Hooks.on('pf2eVisionerAvsBatchComplete', async () => {
    await handleAvsBatchCompleteRefresh();
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

  // Handle ActiveEffect creation to detect death conditions
  Hooks.on('createActiveEffect', async (effect) => {
    await handleDefeatEffectCreated(effect);
  });

  // If effects are manually removed, clear corresponding token flags
  Hooks.on('deleteItem', async (item) => {
    await cleanupDeletedEffectItem(item);
  });

  // Handle scene updates to trigger AVS recalculation when disableAVS flag changes
  Hooks.on('updateScene', async (scene, changes) => {
    await handleSceneDisableAvsRefresh(scene, changes);
  });
}
