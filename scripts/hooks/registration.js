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
import {
  captureActorPreparedSenseSnapshot,
  handleActorSenseChangeItemEvent,
  handleVisionerRuleElementItemUpdate,
  scheduleActorPreparedSensesAvsRefresh,
  watchActorPreparedSenses,
  watchCurrentScenePreparedSenses,
} from '../rule-elements/item-update-refresh.js';
import { cleanupDeletedEffectItem } from '../services/deleted-effect-cleanup.js';
import { createVisionMasterTokenRefresh } from '../services/vision-master-token-refresh.js';
import { handleSceneDisableAvsRefresh } from '../services/scene-disable-avs-refresh.js';
import { handlePreCreateChatMessage } from '../chat/services/pre-create-message.js';
import { clearActorFeatureCache } from '../utils/actor-features.js';
import { clearActiveSceneHearingRangeCache } from '../services/scene-hearing-range.js';
import { clearActorConditionSlugCache } from '../services/sense-distance.js';
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
import { releaseCurrentViewHardHideIfMarked } from '../services/Detection/current-view-hard-hide.js';

function clearActorFeatureCacheForItem(item) {
  const actor = item?.actor ?? item?.parent ?? null;
  clearActorFeatureCache(actor);
  clearActorConditionSlugCache(actor);
}

export async function registerHooks() {
  registerPf2eHudTakeCoverIntegration();

  Hooks.on('ready', onReady);
  Hooks.on('canvasReady', onCanvasReady);
  Hooks.on('canvasReady', () => {
    watchCurrentScenePreparedSenses();
  });

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

  Hooks.on('preUpdateActor', (actor, changes, options, userId) => {
    void changes;
    void options;
    void userId;
    captureActorPreparedSenseSnapshot(actor);
  });

  Hooks.on('updateActor', (actor, changes, options, userId) => {
    void options;
    void userId;
    clearActorFeatureCache(actor);
    clearActorConditionSlugCache(actor);
    scheduleActorPreparedSensesAvsRefresh(actor, changes);
    watchActorPreparedSenses(actor);
  });

  Hooks.on('createToken', (tokenDoc) => {
    watchActorPreparedSenses(tokenDoc?.actor ?? tokenDoc?.object?.actor);
  });

  // Register item update hooks for rule element updates
  Hooks.on('updateItem', async (item, changes, options, userId) => {
    clearActorFeatureCacheForItem(item);
    handleVisionerRuleElementItemUpdate(item, changes, options, userId);
    handleActorSenseChangeItemEvent(item, changes, options, userId);
  });

  Hooks.on('createItem', async (item, options, userId) => {
    clearActorFeatureCacheForItem(item);
    handleActorSenseChangeItemEvent(item, null, options, userId);
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

  Hooks.on('pf2e-visioner.visibilityMapUpdated', ({ targetId, state }) => {
    try {
      const target = canvas?.tokens?.get?.(targetId);
      if (!target) return;
      if (state === 'undetected' || state === 'unnoticed') {
        const mesh = target.detectionFilterMesh;
        if (!mesh) return;
        if ('visible' in mesh) mesh.visible = false;
        if ('renderable' in mesh) mesh.renderable = false;
        if ('alpha' in mesh) mesh.alpha = 0;
        return;
      }
      // Target left a render-hidden state (e.g. removing deafened reveals it via hearing):
      // release the one-way current-view hard-hide so its mesh and soundwave repaint without
      // needing a reselect.
      if (releaseCurrentViewHardHideIfMarked(target)) {
        target.refresh?.();
      }
    } catch {
      /* best-effort current-view render sync */
    }
  });

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
    clearActorFeatureCacheForItem(item);
    await cleanupDeletedEffectItem(item);
    handleActorSenseChangeItemEvent(item, null);
  });

  // Handle scene updates to trigger AVS recalculation when disableAVS flag changes
  Hooks.on('updateScene', async (scene, changes) => {
    clearActiveSceneHearingRangeCache(scene);
    await handleSceneDisableAvsRefresh(scene, changes);
  });
}
