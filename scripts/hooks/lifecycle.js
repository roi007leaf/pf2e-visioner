/**
 * Canvas and app lifecycle hooks handlers
 */

import { injectChatAutomationStyles } from '../chat/chat-automation-styles.js';
import { MODULE_ID } from '../constants.js';
import { scheduleCanvasPerceptionUpdate } from '../helpers/perception-refresh.js';
import { initializeHoverTooltips } from '../services/HoverTooltips.js';
import { runVisibilityV2MigrationIfNeeded } from '../migrations/visibility-v2-migration.js';
import { registerSocket } from '../services/socket.js';
import {
  clearSuppressLightingRefresh,
  setSuppressLightingRefresh,
} from '../services/runtime-state.js';
import { updateWallVisuals } from '../services/visual-effects.js';
import { clearAllDetectionFilterVisuals } from '../stores/visibility-map.js';
import { releaseAllCurrentViewHardHide } from '../services/Detection/current-view-hard-hide.js';
import {
  isSelectAllTokenVisibilityBypassActive,
  primeSelectAllTokenVisibilityBypassFromKeyboard,
} from '../services/Detection/select-all-token-visibility-bypass.js';
import { getLogger } from '../utils/logger.js';
import { logControlTokenVisibilitySnapshot } from '../helpers/visibility-debug.js';
import { getCacheInvalidationRevision } from '../utils/cache-invalidation.js';
import { buildTokenSensesCacheKey } from '../visibility/auto-visibility/core/TokenSenseSignatureCache.js';

const lifecycleBindingState = (globalThis.__pf2eVisionerLifecycleBindings ??= {
  hookKeys: new Set(),
  windowKeys: new Set(),
});
const controlTokenSessionState = (globalThis.__pf2eVisionerControlTokenSessions ??= {
  sequence: 0,
  tokenId: null,
  timers: new Set(),
  hiddenRenderObserverId: null,
  hiddenRenderStateCaptured: false,
  hiddenRenderStates: [],
});
controlTokenSessionState.hiddenRenderObserverId ??= null;
controlTokenSessionState.hiddenRenderStateCaptured ??= false;
controlTokenSessionState.hiddenRenderStates ??= [];
const controlTokenSelectionRecalcState = {
  signatures: new Map(),
};
const CONTROL_TOKEN_RECALC_DELAY_MS = 0;
const CONTROL_TOKEN_OCCLUSION_SUPPRESSION_MS = 700;
const CONTROL_TOKEN_SELECTED_VISIBILITY_REFRESH_DELAY_MS = 180;
const CONTROL_TOKEN_SELECTION_PERCEPTION_FLUSH_MS = 180;
const CONTROL_TOKEN_POST_RECALC_VISIBILITY_REFRESH_DELAYS_MS = Object.freeze([75, 250]);
const NO_OBSERVER_VISIBILITY_REFRESH_DELAYS_MS = Object.freeze([0, 75, 250]);
const CONTROLLED_DRAG_POINTER_MOVE_REFRESH_MS = 50;
const controlledDragPointerMoveRefreshState = (globalThis.__pf2eVisionerDragPointerMoveRefresh ??= {
  lastRefreshAt: 0,
  refreshFrameId: null,
  timeoutId: null,
});
const fallbackHudButtonState = (globalThis.__pf2eVisionerFallbackHudButton ??= {
  styleInstalled: false,
  documentListenersBound: false,
  button: null,
  token: null,
  isDragging: false,
  hasDragged: false,
  dragStartPos: { x: 0, y: 0 },
  dragOffset: { x: 0, y: 0 },
});

function bindHookOnce(key, hookName, callback) {
  if (lifecycleBindingState.hookKeys.has(key)) {
    return;
  }
  Hooks.on(hookName, callback);
  lifecycleBindingState.hookKeys.add(key);
}

function bindWindowListenerOnce(key, eventName, callback, options = undefined) {
  if (lifecycleBindingState.windowKeys.has(key)) {
    return;
  }
  window.addEventListener(eventName, callback, options);
  lifecycleBindingState.windowKeys.add(key);
}

function clearControlTokenSessionTimers() {
  for (const timer of controlTokenSessionState.timers) {
    clearTimeout(timer);
  }
  controlTokenSessionState.timers.clear();
}

function clearControlTokenHiddenRenderStates() {
  controlTokenSessionState.hiddenRenderObserverId = null;
  controlTokenSessionState.hiddenRenderStateCaptured = false;
  controlTokenSessionState.hiddenRenderStates = [];
}

function captureFoundryHiddenRenderState(token) {
  if (!token?.document?.hidden || token.controlled) return null;
  const state = {
    visible: token.visible,
    renderable: token.renderable,
    meshVisible: token.mesh?.visible,
    meshRenderable: token.mesh?.renderable,
    meshAlpha: token.mesh?.alpha,
    hardHidden: token._pvCurrentViewHardHidden,
  };
  const isHidden =
    state.visible === false ||
    state.renderable === false ||
    state.meshVisible === false ||
    state.meshRenderable === false ||
    state.meshAlpha === 0;
  return isHidden ? state : null;
}

function captureControlTokenHiddenRenderStates(observer) {
  const observerId = observer?.document?.id;
  if (!observerId) return false;
  const hiddenRenderStates = [];
  for (const token of canvas?.tokens?.placeables ?? []) {
    const state = captureFoundryHiddenRenderState(token);
    if (state) hiddenRenderStates.push({ token, state });
  }
  controlTokenSessionState.hiddenRenderObserverId = observerId;
  controlTokenSessionState.hiddenRenderStateCaptured = true;
  controlTokenSessionState.hiddenRenderStates = hiddenRenderStates;
  if (globalThis.game?.ready) {
    console.warn(
      '[DEBUG-hiddentoken-a91f]',
      JSON.stringify({
        phase: 'control-hidden-state-captured',
        observerId,
        observerName: observer.name,
        targetCount: hiddenRenderStates.length,
        targetIds: hiddenRenderStates.map(({ token }) => token.document.id),
      }),
    );
  }
  return true;
}

function restoreControlTokenHiddenRenderStates(observer) {
  const observerId = observer?.document?.id;
  if (
    !observerId ||
    controlTokenSessionState.hiddenRenderObserverId !== observerId ||
    !controlTokenSessionState.hiddenRenderStateCaptured
  ) {
    return false;
  }

  const restoredTargetIds = [];
  for (const { token, state } of controlTokenSessionState.hiddenRenderStates) {
    if (!token?.document?.hidden || token.controlled) continue;
    if ('visible' in token) token.visible = state.visible;
    if ('renderable' in token) token.renderable = state.renderable;
    if (token.mesh) {
      if ('visible' in token.mesh) token.mesh.visible = state.meshVisible;
      if ('renderable' in token.mesh) token.mesh.renderable = state.meshRenderable;
      if ('alpha' in token.mesh) token.mesh.alpha = state.meshAlpha;
    }
    token._pvCurrentViewHardHidden = state.hardHidden;
    restoredTargetIds.push(token.document.id);
  }
  if (globalThis.game?.ready && restoredTargetIds.length > 0) {
    console.warn(
      '[DEBUG-hiddentoken-a91f]',
      JSON.stringify({
        phase: 'control-hidden-state-restored',
        observerId,
        observerName: observer.name,
        targetIds: restoredTargetIds,
      }),
    );
  }
  return true;
}

function resetControlTokenSession() {
  clearControlTokenSessionTimers();
  controlTokenSessionState.sequence += 1;
  controlTokenSessionState.tokenId = null;
  return controlTokenSessionState.sequence;
}

function trackControlTokenSession(token, controlled) {
  if (controlled && token?.document?.id) {
    if (controlTokenSessionState.hiddenRenderObserverId !== token.document.id) {
      clearControlTokenHiddenRenderStates();
    }
    clearControlTokenSessionTimers();
    controlTokenSessionState.sequence += 1;
    controlTokenSessionState.tokenId = token.document.id;
    return controlTokenSessionState.sequence;
  }

  if ((canvas?.tokens?.controlled?.length ?? 0) === 0) {
    captureControlTokenHiddenRenderStates(token);
    return resetControlTokenSession();
  }

  return controlTokenSessionState.sequence;
}

function getControlTokenSession(token) {
  const tokenId = token?.document?.id;
  if (!tokenId) {
    return null;
  }

  return {
    sequence: controlTokenSessionState.sequence,
    tokenId,
  };
}

function isActiveControlTokenSession(sequence, tokenId) {
  if (!tokenId) {
    return false;
  }

  if (controlTokenSessionState.sequence !== sequence) {
    return false;
  }

  if (controlTokenSessionState.tokenId !== tokenId) {
    return false;
  }

  const current = canvas?.tokens?.controlled?.[0] ?? null;
  return current?.document?.id === tokenId;
}

function scheduleControlTokenSessionTimer(sequence, tokenId, delayMs, callback) {
  const timer = setTimeout(() => {
    controlTokenSessionState.timers.delete(timer);
    if (!isActiveControlTokenSession(sequence, tokenId)) {
      return;
    }
    callback();
  }, delayMs);
  controlTokenSessionState.timers.add(timer);
  return timer;
}

function refreshPendingVisibilityForActiveControlTokenSession(sequence, tokenId, fallbackToken) {
  if (!isActiveControlTokenSession(sequence, tokenId)) {
    return;
  }

  const currentToken =
    canvas?.tokens?.controlled?.find?.((token) => token?.document?.id === tokenId) || fallbackToken;
  refreshPendingVisibilityAfterControlToken(currentToken);
}

function settleControlTokenSelectionRefreshes(session, token, { schedulePostRecalc = false } = {}) {
  refreshPendingVisibilityForActiveControlTokenSession(session.sequence, session.tokenId, token);
  const currentToken =
    canvas?.tokens?.controlled?.find?.(
      (controlledToken) => controlledToken?.document?.id === session.tokenId,
    ) || token;
  void refreshSystemHiddenHighlightsForControlToken(currentToken);
  if (!schedulePostRecalc) return;

  for (const delayMs of CONTROL_TOKEN_POST_RECALC_VISIBILITY_REFRESH_DELAYS_MS) {
    scheduleControlTokenSessionTimer(session.sequence, session.tokenId, delayMs, () =>
      refreshPendingVisibilityForActiveControlTokenSession(session.sequence, session.tokenId, token),
    );
  }
}

function tokenDataSignature(value) {
  try {
    return JSON.stringify(value?.toObject?.() ?? value ?? null);
  } catch {
    return String(value);
  }
}

function controlTokenSelectionSignature(token) {
  const tokenDoc = token?.document;
  const tokenId = tokenDoc?.id;
  if (!tokenId) return null;
  return [
    getCacheInvalidationRevision(),
    canvas?.scene?.id ?? canvas?.scene?._id ?? tokenDoc?.parent?.id ?? '',
    tokenId,
    tokenDoc.x ?? '',
    tokenDoc.y ?? '',
    tokenDoc.elevation ?? '',
    tokenDoc.width ?? '',
    tokenDoc.height ?? '',
    tokenDoc.hidden === true ? 1 : 0,
    tokenDataSignature(tokenDoc.vision ?? tokenDoc.sight),
    tokenDataSignature(tokenDoc.light),
    buildTokenSensesCacheKey([token]),
  ].join('|');
}

function shouldRunControlTokenSelectionAvsRecalc(token) {
  const tokenId = token?.document?.id;
  if (!tokenId) return true;

  const signature = controlTokenSelectionSignature(token);
  if (!signature) return true;

  if (controlTokenSelectionRecalcState.signatures.get(tokenId) === signature) {
    return false;
  }

  controlTokenSelectionRecalcState.signatures.set(tokenId, signature);
  return true;
}

function clearControlTokenSelectionRecalcCache() {
  controlTokenSelectionRecalcState.signatures.clear();
}

function scheduleRefreshPendingVisibilityAfterControlToken(token) {
  const session = getControlTokenSession(token);
  if (!session) {
    refreshPendingVisibilityAfterControlToken(token);
    return;
  }

  scheduleControlTokenSessionTimer(
    session.sequence,
    session.tokenId,
    CONTROL_TOKEN_SELECTED_VISIBILITY_REFRESH_DELAY_MS,
    () => refreshPendingVisibilityForActiveControlTokenSession(session.sequence, session.tokenId, token),
  );
}

function scheduleNoObserverVisibilityRefresh() {
  let completed = false;
  const run = () => {
    try {
      if (completed) return;
      if ((canvas?.tokens?.controlled?.length ?? 0) > 0) return;
      // Freeze+settle: core drives rendering; just nudge a vision refresh.
      releaseAllCurrentViewHardHide();
      clearAllDetectionFilterVisuals();
      scheduleCanvasPerceptionUpdate({ initializeVision: true, refreshVision: true });
      completed = true;
    } catch {
      /* best effort */
    }
  };

  for (const delayMs of NO_OBSERVER_VISIBILITY_REFRESH_DELAYS_MS) {
    setTimeout(run, delayMs);
  }
}

function refreshPendingVisibilityAfterControlToken(token = canvas?.tokens?.controlled?.[0]) {
  try {
    if (isSelectAllTokenVisibilityBypassActive()) {
      restoreVisionerHiddenTokensForSelectAll();
    }
    if (!restoreControlTokenHiddenRenderStates(token)) {
      captureControlTokenHiddenRenderStates(token);
    }
    // Core's own testVisibility/detectionFilter pass isn't guaranteed to have
    // seen this token's vision source as active yet when it ran inside
    // _onControl; nudge another pass so soundwave rings repaint on reselect
    // instead of waiting for the next move.
    scheduleCanvasPerceptionUpdate({ refreshVision: true });
  } catch {
    /* best effort */
  }
}

async function refreshSystemHiddenHighlightsForControlToken(token) {
  if (!token?.document?.id) return;

  try {
    const { updateSystemHiddenTokenHighlights } = await import('../services/visual-effects.js');
    await updateSystemHiddenTokenHighlights(token.document.id);
  } catch (error) {
    console.warn('PF2E Visioner | Failed to update system-hidden token highlights:', error);
  }
}

function eventTargetsCanvasView(event) {
  const canvasView = canvas?.app?.view || canvas?.app?.renderer?.view || null;
  return !!canvasView && event?.target === canvasView;
}

function primeControlledTokenDragIntentFromCanvasPointer(event) {
  if (event?.button !== 0) return;
  if (!eventTargetsCanvasView(event)) return;
  // Freeze+settle: live drag soundwaves are driven by the _onDragLeftMove
  // wrapper (during-move-soundwave.js), not a pointer-intent prime here.
}

function releaseControlledTokenDragIntentFromCanvasPointer() {
  controlledDragPointerMoveRefreshState.lastRefreshAt = 0;
  if (controlledDragPointerMoveRefreshState.timeoutId) {
    clearTimeout(controlledDragPointerMoveRefreshState.timeoutId);
    controlledDragPointerMoveRefreshState.timeoutId = null;
  }
  controlledDragPointerMoveRefreshState.refreshFrameId = null;
}

function refreshControlledTokenDragIntentFromCanvasPointer() {
  const controlledTokens = canvas?.tokens?.controlled || [];
  if (!controlledTokens.length) return;

  const refreshNow = () => {
    controlledDragPointerMoveRefreshState.timeoutId = null;
    controlledDragPointerMoveRefreshState.lastRefreshAt = Date.now();
    if (controlledDragPointerMoveRefreshState.refreshFrameId) return;
    const scheduleFrame =
      typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame
        : (callback) => setTimeout(callback, 0);
    controlledDragPointerMoveRefreshState.refreshFrameId = scheduleFrame(() => {
      controlledDragPointerMoveRefreshState.refreshFrameId = null;
      const currentControlledTokens = canvas?.tokens?.controlled || controlledTokens;
      if (!currentControlledTokens.length) return;
      // Freeze+settle: drag soundwaves handled by the _onDragLeftMove wrapper.
    });
  };

  const elapsedMs = Date.now() - controlledDragPointerMoveRefreshState.lastRefreshAt;
  if (elapsedMs >= CONTROLLED_DRAG_POINTER_MOVE_REFRESH_MS) {
    refreshNow();
    return;
  }

  if (controlledDragPointerMoveRefreshState.timeoutId) return;
  controlledDragPointerMoveRefreshState.timeoutId = setTimeout(
    refreshNow,
    CONTROLLED_DRAG_POINTER_MOVE_REFRESH_MS - elapsedMs,
  );
}

function registerPendingMovementPointerIntentListeners() {
  bindWindowListenerOnce(
    'pendingMovementControlledDragIntentPointerDown',
    'pointerdown',
    primeControlledTokenDragIntentFromCanvasPointer,
    { capture: true },
  );
  bindWindowListenerOnce(
    'pendingMovementControlledDragIntentPointerUp',
    'pointerup',
    releaseControlledTokenDragIntentFromCanvasPointer,
    { capture: true },
  );
  bindWindowListenerOnce(
    'pendingMovementControlledDragIntentPointerMove',
    'pointermove',
    refreshControlledTokenDragIntentFromCanvasPointer,
    { capture: true },
  );
  bindWindowListenerOnce(
    'pendingMovementControlledDragIntentPointerCancel',
    'pointercancel',
    releaseControlledTokenDragIntentFromCanvasPointer,
    { capture: true },
  );
}

function registerSelectAllTokenVisibilityBypassListener() {
  bindWindowListenerOnce(
    'selectAllTokenVisibilityBypass',
    'keydown',
    handleSelectAllTokenVisibilityBypassKeydown,
    { capture: true },
  );
}

function restoreVisionerHiddenTokensForSelectAll() {
  // Freeze+settle: the select-all visibility bypass is applied by the detection
  // wrappers (isSelectAllTokenVisibilityBypassActive) returning core's result,
  // so core re-renders every token natively — no render-lock restore needed.
  releaseAllCurrentViewHardHide();
  clearAllDetectionFilterVisuals();
}

function handleSelectAllTokenVisibilityBypassKeydown(event) {
  if (!primeSelectAllTokenVisibilityBypassFromKeyboard(event)) return;
  restoreVisionerHiddenTokensForSelectAll();
}

async function refreshVisionSharingTokenIds() {
  const log = getLogger('VisionSharing/SceneChange');

  if (!game.user?.isGM) {
    return;
  }

  if (!canvas?.tokens?.placeables) {
    return;
  }

  log.debug(() => ({
    msg: 'Refreshing vision sharing token IDs for new scene',
    scene: canvas.scene?.name,
  }));

  let hasVisionSharingTokenIdChanges = false;

  for (const token of canvas.tokens.placeables) {
    try {
      const masterActorUuid = token.document.getFlag(MODULE_ID, 'visionMasterActorUuid');

      if (!masterActorUuid) {
        continue;
      }

      log.debug(() => ({
        msg: 'Token has vision master, resolving to current scene',
        tokenName: token.name,
        masterActorUuid,
      }));

      const { ShareVision } = await import('../rule-elements/operations/ShareVision.js');
      const newSceneTokenId = ShareVision.getSceneTokenIdFromActorUuid(masterActorUuid);

      if (newSceneTokenId) {
        const oldTokenId = token.document.getFlag(MODULE_ID, 'visionMasterTokenId');
        if (oldTokenId !== newSceneTokenId) {
          log.debug(() => ({
            msg: 'Updating vision master token ID for new scene',
            tokenName: token.name,
            oldTokenId,
            newSceneTokenId,
          }));

          await token.document.setFlag(MODULE_ID, 'visionMasterTokenId', newSceneTokenId);
          hasVisionSharingTokenIdChanges = true;
        }
      } else {
        log.warn(() => ({
          msg: 'Could not find master actor token in current scene',
          tokenName: token.name,
          masterActorUuid,
          scene: canvas.scene?.name,
        }));
      }
    } catch (error) {
      log.warn(() => ({
        msg: 'Failed to refresh vision sharing for token',
        tokenName: token.name,
        error: error.message,
      }));
    }
  }

  if (hasVisionSharingTokenIdChanges) {
    scheduleCanvasPerceptionUpdate({ initializeVision: true, refreshLighting: true });
  }
}

async function reapplyRuleElementsOnLoad() {
  const log = getLogger('RuleElements/Lifecycle');

  if (!game.user?.isGM) {
    log.debug('Non-GM client, skipping rule element reapplication');
    return;
  }

  if (!canvas?.tokens?.placeables) {
    log.debug('No tokens on canvas, skipping rule element reapplication');
    return;
  }

  log.debug(() => ({
    msg: 'Reapplying rule elements on canvas ready',
    tokenCount: canvas.tokens.placeables.length,
  }));

  const tokensProcessed = new Set();
  const tokensWithRuleElements = [];

  for (const token of canvas.tokens.placeables) {
    try {
      const actor = token.actor;
      if (!actor || tokensProcessed.has(actor.id)) {
        continue;
      }

      tokensProcessed.add(actor.id);

      await cleanupStaleRuleElementFlags(token, actor, log);

      const itemsWithRules =
        actor.items?.filter((i) => {
          const rules = i.system?.rules || [];
          return rules.some((rule) => rule.key === 'PF2eVisionerEffect');
        }) || [];
      log.debug(() => ({
        msg: 'Actor items with Visioner rules scanned',
        actor: actor.name,
        items: itemsWithRules.length,
      }));

      for (const item of itemsWithRules) {
        const rules = item.system?.rules || [];

        log.debug(() => ({
          msg: 'Found PF2eVisionerEffect on existing item, reapplying',
          itemName: item.name,
          itemType: item.type,
          actorName: actor.name,
          tokenId: token.id,
        }));

        let hasAppliedRules = false;

        // Wait for rule elements to be initialized
        await new Promise((resolve) => setTimeout(resolve, 100));

        for (const rule of rules) {
          if (rule.key === 'PF2eVisionerEffect') {
            try {
              // Try to get the rule element instance from the effect
              let instance = null;

              // First try to get from item.ruleElements
              if (Array.isArray(item.ruleElements)) {
                instance = item.ruleElements.find(
                  (r) => r?.key === rule.key && (r?.slug === rule.slug || !rule.slug),
                );
              }

              // If not found, try to create a temporary instance for reapplication
              if (!instance && game.pf2e?.RuleElements?.custom?.[rule.key]) {
                try {
                  // Deep clone the rule data to make it extensible
                  const clonedRule = JSON.parse(JSON.stringify(rule));
                  const RuleElementClass = game.pf2e.RuleElements.custom[rule.key];
                  instance = new RuleElementClass(clonedRule, item);
                  log.debug(() => ({
                    msg: 'Created temporary rule element instance',
                    ruleKey: rule.key,
                  }));
                } catch (error) {
                  log.debug(() => ({
                    msg: 'Failed to create temporary instance',
                    ruleKey: rule.key,
                    error: error.message,
                  }));
                }
              }

              log.debug(() => ({
                msg: 'Rule instance lookup',
                itemName: item.name,
                ruleKey: rule.key,
                hasInstance: !!instance,
                hasApply: !!(instance && typeof instance.applyOperations === 'function'),
              }));

              if (instance && typeof instance.applyOperations === 'function') {
                await instance.applyOperations();
                hasAppliedRules = true;
                log.debug(() => ({
                  msg: 'Successfully reapplied rule element operations',
                  ruleKey: rule.key,
                  itemName: item.name,
                }));
              } else {
                log.debug(() => ({
                  msg: 'No applicable instance to apply',
                  itemName: item.name,
                  ruleKey: rule.key,
                }));
              }
            } catch (error) {
              log.warn(() => ({
                msg: 'Failed to reapply individual rule',
                ruleKey: rule.key,
                itemName: item.name,
                error: error.message,
              }));
            }
          }
        }

        if (hasAppliedRules) {
          tokensWithRuleElements.push(token.id);
        }
      }
    } catch (error) {
      log.warn(() => ({
        msg: 'Failed to process token for rule element reapplication',
        tokenName: token.name,
        error: error.message,
      }));
    }
  }

  if (tokensWithRuleElements.length > 0) {
    log.debug(() => ({
      msg: 'Triggering AVS recalculation for tokens with rule elements',
      tokenCount: tokensWithRuleElements.length,
    }));

    try {
      if (window.pf2eVisioner?.services?.autoVisibilitySystem?.recalculateForTokens) {
        await window.pf2eVisioner.services.autoVisibilitySystem.recalculateForTokens(
          tokensWithRuleElements,
        );
      } else if (window.pf2eVisioner?.services?.autoVisibilitySystem?.recalculateAll) {
        await window.pf2eVisioner.services.autoVisibilitySystem.recalculateAll();
      } else if (canvas?.perception) {
        scheduleCanvasPerceptionUpdate({ refreshVision: true, refreshOcclusion: true });
      }
    } catch (error) {
      log.warn(() => ({
        msg: 'Failed to trigger AVS recalculation',
        error: error.message,
      }));
    }
  }

  log.debug('Finished reapplying rule elements');
}

async function cleanupStaleRuleElementFlags(token, actor, log) {
  const flagRegistry = token.document.getFlag('pf2e-visioner', 'ruleElementRegistry') || {};
  const registeredKeys = Object.keys(flagRegistry);

  if (registeredKeys.length === 0) {
    return;
  }

  const activeEffectIds = new Set(
    (actor.items?.filter((i) => i.type === 'effect') || []).map((e) => e.id),
  );

  const staleKeys = registeredKeys.filter((key) => {
    if (key.startsWith('item-')) {
      const itemId = key.substring(5);
      return !activeEffectIds.has(itemId);
    }
    return false;
  });

  if (staleKeys.length === 0) {
    return;
  }

  log.debug(() => ({
    msg: 'Found stale rule element flags, cleaning up',
    tokenName: token.name,
    staleKeys,
  }));

  const updates = {};
  const newRegistry = { ...flagRegistry };

  for (const staleKey of staleKeys) {
    const flagsToRemove = flagRegistry[staleKey] || [];

    for (const flagPath of flagsToRemove) {
      updates[`flags.pf2e-visioner.${flagPath}`] = null;
    }

    delete newRegistry[staleKey];

    try {
      const currentStateSource = token.document.getFlag('pf2e-visioner', 'stateSource') || {};
      const itemId = staleKey.startsWith('item-') ? staleKey.substring(5) : staleKey;
      let modified = false;

      const prune = (arr) =>
        Array.isArray(arr)
          ? arr.filter((s) => !(typeof s?.id === 'string' && s.id.startsWith(`${itemId}-`)))
          : arr;

      if (currentStateSource.visibility?.sources) {
        const next = prune(currentStateSource.visibility.sources);
        if (next.length !== currentStateSource.visibility.sources.length) {
          currentStateSource.visibility.sources = next;
          modified = true;
        }
      }
      if (currentStateSource.cover?.sources) {
        const next = prune(currentStateSource.cover.sources);
        if (next.length !== currentStateSource.cover.sources.length) {
          currentStateSource.cover.sources = next;
          modified = true;
        }
      }
      for (const key of ['visibilityByObserver', 'coverByObserver']) {
        const byObserver = currentStateSource[key];
        if (!byObserver) continue;
        for (const [obsId, data] of Object.entries(byObserver)) {
          const srcs = Array.isArray(data?.sources) ? data.sources : [];
          const filtered = prune(srcs);
          if (filtered.length !== srcs.length) {
            byObserver[obsId].sources = filtered;
            modified = true;
          }
          if (Array.isArray(byObserver[obsId].sources) && byObserver[obsId].sources.length === 0) {
            delete byObserver[obsId];
            modified = true;
          }
        }
        if (Object.keys(byObserver).length === 0) {
          delete currentStateSource[key];
          modified = true;
        }
      }

      if (modified) {
        updates['flags.pf2e-visioner.stateSource'] = currentStateSource;
      }
    } catch (error) {
      log.warn(() => ({
        msg: 'Failed to prune stale sources for item',
        staleKey,
        error: error.message,
      }));
    }
  }

  updates['flags.pf2e-visioner.ruleElementRegistry'] = newRegistry;

  if (Object.keys(updates).length > 0) {
    await token.document.update(updates);

    log.debug(() => ({
      msg: 'Cleaned up stale flags',
      tokenName: token.name,
      flagsRemoved: Object.keys(updates).length,
    }));
  }
}
export function onReady() {
  // Add CSS styles for chat automation
  injectChatAutomationStyles();

  // Add a fallback approach - add a floating button when tokens are selected (only if HUD button is disabled)
  if (!game.settings.get(MODULE_ID, 'useHudButton')) {
    setupFallbackHUDButton();
  }

  registerSocket();

  // Ensure all existing tokens and prototype tokens have vision enabled (GM only)
  if (game.user?.isGM) {
    // Run shortly after ready to avoid competing with other modules' migrations
    setTimeout(() => {
      enableVisionForAllTokensAndPrototypes().catch(() => { });
    }, 25);
    setTimeout(() => {
      runVisibilityV2MigrationIfNeeded().catch((error) => {
        console.warn('PF2E Visioner | Failed to migrate visibility profiles:', error);
      });
    }, 50);
  }
}

function enforceHiddenTokensPerFrame() {
  // Freeze+settle: foundry-hidden / blocking-state hard-hide is enforced by the
  // always-on detection wrappers (_canDetect / testVisibility), not a per-frame
  // render sweep. Retained as a no-op (its ticker registration is disabled).
}

let _hiddenTokenTickerRegistered = false;
function registerHiddenTokenTicker() {
  if (_hiddenTokenTickerRegistered) return;
  void enforceHiddenTokensPerFrame;
  _hiddenTokenTickerRegistered = true;
}

export async function onCanvasReady() {
  registerPendingMovementPointerIntentListeners();
  registerSelectAllTokenVisibilityBypassListener();
  registerHiddenTokenTicker();

  {
    const tokens = (canvas?.tokens?.placeables ?? []).map((token) => {
      const screen = canvas?.stage?.worldTransform?.apply?.(token.center) ?? token.center;
      return {
        id: token.document?.id,
        name: token.name,
        hidden: token.document?.hidden,
        screenX: Math.round(screen?.x ?? 0),
        screenY: Math.round(screen?.y ?? 0),
      };
    });
    console.warn(
      '[DEBUG-hiddentoken-a91f]',
      JSON.stringify({ phase: 'scene-token-positions', tokens }),
    );
  }

  try {
    await refreshVisionSharingTokenIds();
  } catch (error) {
    console.warn('PF2E Visioner | Failed to refresh vision sharing on scene change:', error);
  }

  try {
    await reapplyRuleElementsOnLoad();
  } catch (error) {
    console.warn('PF2E Visioner | Failed to reapply rule elements on load:', error);
  }

  try {
    // After canvas refresh, restore indicators for currently controlled tokens that have wall flags
    const controlledTokens = canvas.tokens.controlled || [];

    if (controlledTokens.length > 0) {
      // Process each controlled token to restore their indicators
      for (const token of controlledTokens) {
        refreshPendingVisibilityAfterControlToken(token);
        const wallFlags = token?.document?.getFlag?.(MODULE_ID, 'walls') || {};
        // Only restore if this token has wall flags
        if (Object.keys(wallFlags).length > 0) {
          await updateWallVisuals(token.document.id);
        }
      }
    }

    bindHookOnce('controlTokenSessionTracker', 'controlToken', (token, controlled) => {
      trackControlTokenSession(token, controlled);
    });

    // Also set up a hook to restore indicators when tokens are controlled after canvas ready
    // OPTIMIZED: Only update wall visuals if the token actually has wall flags to avoid triggering AVS
    bindHookOnce('restoreIndicatorsOnControl', 'controlToken', async (token, controlled) => {
      if (controlled) {
        scheduleRefreshPendingVisibilityAfterControlToken(token);
      }

      // CRITICAL: Set global flag to suppress lighting refreshes during token control operations
      try {
        setSuppressLightingRefresh(true);

        // Track this controlToken event to prevent AVS from responding to related lighting refreshes
        const { LightingEventHandler } = await import(
          '../visibility/auto-visibility/core/LightingEventHandler.js'
        );
        LightingEventHandler.trackControlTokenEvent();
      } catch {
        // Best effort - if the import fails, continue without tracking
      }

      if (controlled) {
        const wallFlags = token?.document?.getFlag?.(MODULE_ID, 'walls') || {};
        if (Object.keys(wallFlags).length > 0) {
          // CRITICAL: Always use the optimized version that doesn't trigger lightingRefresh
          // NEVER call the original updateWallVisuals on token selection
          try {
            const { updateWallIndicatorsOnly } = await import('../services/visual-effects.js');
            await updateWallIndicatorsOnly(token.document.id);
          } catch (error) {
            // If the optimized method fails, do nothing rather than triggering AVS
            console.warn(
              'PF2E Visioner | Failed to use optimized wall indicator update, skipping:',
              error,
            );
          }
        }

        // System-hidden highlights depend on freshly recalculated AVS state.
        // They are refreshed after recalculation settles.
      } else if (game.user?.isGM) {
        // Only the GM is omniscient: deselecting reveals every token. Players keep their
        // last view frozen so undetected tokens and soundwaves remain instead of revealing all.
        try {
          const { updateSystemHiddenTokenHighlights } = await import(
            '../services/visual-effects.js'
          );
          await updateSystemHiddenTokenHighlights(null, null, { allowControlledFallback: false });
        } catch (error) {
          console.warn('PF2E Visioner | Failed to clear system-hidden token highlights:', error);
        }
        scheduleNoObserverVisibilityRefresh();
      }

      // Clear the suppression flag after a short delay
      setTimeout(() => {
        try {
          clearSuppressLightingRefresh();
        } catch {
          // Best effort
        }
      }, 50);
    });
  } catch (_) { }

  initializeHoverTooltips();

  try {
    const { registerAvsGmVisionWarning } = await import('../ui/AvsGmVisionWarning.js');
    registerAvsGmVisionWarning();
  } catch (_) { }

  // Listen for condition changes to update lifesense highlights
  // Note: Trait changes are handled by ActorEventHandler for full AVS recalculation

  // Listen for item updates on actors (conditions are items in PF2e)
  bindHookOnce('lifecycleCreateItem', 'createItem', async (item, options, userId) => {
    try {
      if (item.type !== 'condition') return;

      const actor = item.parent;
      if (!actor) return;

      const conditionSlug = item.slug || item.system?.slug || item.name?.toLowerCase?.();
      if (['unconscious', 'dead', 'dying'].includes(conditionSlug) && game.user?.isGM) {
        const { requestTakeCoverExpirationForToken } = await import(
          '../chat/services/take-cover-expiration-service.js'
        );
        const tokens = canvas?.tokens?.placeables?.filter((token) => token.actor?.id === actor.id) || [];
        for (const token of tokens) {
          await requestTakeCoverExpirationForToken(token, 'unconscious');
        }
      }

      // Trigger perception refresh to recalculate visibility based on new conditions
      if (canvas?.perception) {
        scheduleCanvasPerceptionUpdate({
          refreshVision: true,
          refreshOcclusion: true,
        });
      }

      // Update indicators for any controlled tokens after a brief delay
      // to allow perception refresh to complete
      setTimeout(async () => {
        const controlledTokens = canvas?.tokens?.controlled || [];
        if (controlledTokens.length === 0) return;

        const { updateSystemHiddenTokenHighlights } = await import('../services/visual-effects.js');
        for (const controlledToken of controlledTokens) {
          await updateSystemHiddenTokenHighlights(controlledToken.document.id);
        }
      }, 100);
    } catch (error) {
      console.warn('PF2E Visioner | Failed to update highlights on condition add:', error);
    }
  });

  bindHookOnce('lifecycleDeleteItem', 'deleteItem', async (item, options, userId) => {
    try {
      if (item.type !== 'condition') return;

      const actor = item.parent;
      if (!actor) return;

      const conditionSlug = item.slug || item.system?.slug || item.name?.toLowerCase?.();
      if (conditionSlug === 'prone' && game.user?.isGM) {
        const { removeTakeCoverProneRangedEffects } = await import('../cover/batch.js');
        const tokens = canvas?.tokens?.placeables?.filter((token) => token.actor?.id === actor.id) || [];
        for (const token of tokens) {
          await removeTakeCoverProneRangedEffects(token);
        }
      }

      // Trigger perception refresh to recalculate visibility based on removed conditions
      if (canvas?.perception) {
        scheduleCanvasPerceptionUpdate({
          refreshVision: true,
          refreshOcclusion: true,
        });
      }

      // Update indicators for any controlled tokens after a brief delay
      // to allow perception refresh to complete
      setTimeout(async () => {
        const controlledTokens = canvas?.tokens?.controlled || [];
        if (controlledTokens.length === 0) return;

        const { updateSystemHiddenTokenHighlights } = await import('../services/visual-effects.js');
        for (const controlledToken of controlledTokens) {
          await updateSystemHiddenTokenHighlights(controlledToken.document.id);
        }
      }, 100);
    } catch (error) {
      console.warn('PF2E Visioner | Failed to update highlights on condition remove:', error);
    }
  });

  // Always bind keyboard shortcuts (Alt handled via highlightObjects hook, O key handled here)
  // Bind 'O' key on keydown/keyup for observer overlay
  bindWindowListenerOnce(
    'lifecycleObserverKeydown',
    'keydown',
    async (ev) => {
      if (ev.key?.toLowerCase() !== 'o') return;
      const { HoverTooltips, showControlledTokenVisibilityObserver } = await import(
        '../services/HoverTooltips.js'
      );
      if (
        !HoverTooltips.isShowingKeyTooltips &&
        typeof showControlledTokenVisibilityObserver === 'function'
      ) {
        showControlledTokenVisibilityObserver();
      } else {
      }
    },
    { passive: true },
  );
  bindWindowListenerOnce(
    'lifecycleObserverKeyup',
    'keyup',
    async (ev) => {
      if (ev.key?.toLowerCase() !== 'o') return;
      try {
        // Reuse the existing release path via onHighlightObjects(false)
        const { onHighlightObjects } = await import('../services/HoverTooltips.js');
        onHighlightObjects(false);
        // Note: Don't call cleanupHoverTooltips() here as it would reset currentHoveredToken
        // and prevent hover tooltips from being restored
      } catch (err) {
        console.error(`[${MODULE_ID}] O key release error:`, err);
      }
    },
    { passive: true },
  );

  // After canvas is ready, previously rendered chat messages may have been processed
  // before tokens were available, preventing action panels (e.g., Consequences) from
  // being injected. Reprocess existing messages once so GM sees buttons on login.
  try {
    if (game.user?.isGM) {
      setTimeout(async () => {
        try {
          const { handleRenderChatMessage } = await import('../chat/services/entry-service.js');
          const messages = Array.from(game.messages?.contents || []);
          for (const msg of messages) {
            const el =
              msg?.element || document.querySelector(`li.message[data-message-id="${msg.id}"]`);
            if (!el) continue;
            const wrapper = typeof window.$ === 'function' ? window.$(el) : el;
            await handleRenderChatMessage(msg, wrapper);
          }
        } catch (_) { }
      }, 50);
    }
  } catch (_) { }

  // Hide override validation indicator when scene changes
  bindHookOnce('hideOverrideIndicatorOnCanvasTearDown', 'canvasTearDown', async () => {
    try {
      const { default: indicator } = await import('../ui/OverrideValidationIndicator.js');
      indicator.hide(true);
    } catch (error) {
      console.warn('PF2E Visioner | Failed to hide indicator on scene change:', error);
    }
  });

  // Hide shared vision indicator when scene changes
  bindHookOnce('hideSharedVisionIndicatorOnCanvasTearDown', 'canvasTearDown', async () => {
    try {
      const { default: SharedVisionIndicator } = await import('../ui/SharedVisionIndicator.js');
      const indicator = SharedVisionIndicator.getInstance();
      indicator.hide();
    } catch (error) {
      console.warn(
        'PF2E Visioner | Failed to hide shared vision indicator on scene change:',
        error,
      );
    }
  });

  // Update override validation indicator when controlled token changes to show accumulated stack
  bindHookOnce('overrideIndicatorOnControlToken', 'controlToken', async (token, controlled) => {
    try {
      if (!game.user?.isGM) return;
      const { default: indicator } = await import('../ui/OverrideValidationIndicator.js');
      if (!controlled || !indicator?.hasQueuedTokens?.()) return;
      indicator.show([], '', null);
    } catch (error) { }
  });

  // Update shared vision indicator when controlled token changes
  bindHookOnce('sharedVisionIndicatorOnControlToken', 'controlToken', async (token, controlled) => {
    try {
      if (!game.user?.isGM) return;
      const { default: SharedVisionIndicator } = await import('../ui/SharedVisionIndicator.js');
      const indicator = SharedVisionIndicator.getInstance();
      if (controlled) {
        indicator.update(token);
      } else {
        indicator.hide();
      }
    } catch (error) {
      console.warn('PF2E Visioner | Failed to update shared vision indicator:', error);
    }
  });

  bindHookOnce('resetControlTokenSessionOnCanvasTearDown', 'canvasTearDown', () => {
    resetControlTokenSession();
    clearControlTokenHiddenRenderStates();
    clearControlTokenSelectionRecalcCache();
  });

  bindHookOnce('avsRecalculateOnControlToken', 'controlToken', (token, controlled) => {
    try {
      if (!controlled || !game.user?.isGM || !token?.document?.id) return;
      if (isSelectAllTokenVisibilityBypassActive()) return;
      const session = getControlTokenSession(token);
      if (!session) return;

      scheduleControlTokenSessionTimer(
        session.sequence,
        session.tokenId,
        CONTROL_TOKEN_RECALC_DELAY_MS,
        () => {
          try {
            const shouldRecalculate = shouldRunControlTokenSelectionAvsRecalc(token);
            const result = shouldRecalculate
              ? window.pf2eVisioner?.services?.autoVisibilitySystem?.recalculateForTokens?.([
                session.tokenId,
              ])
              : undefined;
            void Promise.resolve(result).finally(() => {
              settleControlTokenSelectionRefreshes(session, token, {
                schedulePostRecalc: shouldRecalculate,
              });
            });
          } catch {
            /* best effort */
          }
        },
      );
    } catch {
      /* best effort */
    }
  });

  bindHookOnce('controlVisibilitySnapshotDebug', 'controlToken', (token, controlled) => {
    try {
      if (controlled && token?.document?.id) {
        const session = getControlTokenSession(token);
        if (!session) return;
        logControlTokenVisibilitySnapshot(token, 'immediate');

        scheduleControlTokenSessionTimer(session.sequence, session.tokenId, 150, () => {
          try {
            const current = canvas?.tokens?.controlled?.[0] ?? token;
            logControlTokenVisibilitySnapshot(current, 'delayed');
          } catch {
            /* best effort */
          }
        });

        scheduleControlTokenSessionTimer(session.sequence, session.tokenId, 400, () => {
          try {
            const current = canvas?.tokens?.controlled?.[0] ?? token;
            logControlTokenVisibilitySnapshot(current, 'settled');
          } catch {
            /* best effort */
          }
        });
        return;
      }

      if ((canvas?.tokens?.controlled?.length ?? 0) === 0) {
        logControlTokenVisibilitySnapshot(null, 'cleared');
      }
    } catch {
      /* best effort */
    }
  });
}

async function enableVisionForAllTokensAndPrototypes() {
  try {
    const enabled = !!game.settings.get(MODULE_ID, 'enableAllTokensVision');
    await applyEnableAllTokensVisionSetting(enabled);
  } catch (_) { }
}

function getTokenVisionEnabled(doc) {
  const sightEnabled = doc?.sight?.enabled;
  if (typeof sightEnabled === 'boolean') return sightEnabled;
  const legacy = doc?.vision;
  if (typeof legacy === 'boolean') return legacy;
  return false;
}

function getActorById(actorId) {
  if (!actorId) return null;
  return game.actors?.get?.(actorId) ?? game.actors?.contents?.find?.((actor) => actor?.id === actorId) ?? null;
}

function getTokenActorTypeForVisionSync(tokenDoc) {
  const actorId = tokenDoc?.actorId;
  if (actorId) {
    return getActorById(actorId)?.type ?? null;
  }
  return tokenDoc?.actor?.type ?? null;
}

async function syncNpcVisionInScenes(enabled) {
  const scenes = Array.from(game.scenes?.contents ?? []);
  for (const scene of scenes) {
    try {
      const tokens = Array.from(scene.tokens?.contents ?? []).filter(
        (t) => getTokenActorTypeForVisionSync(t) === 'npc',
      );
      const updates = [];
      for (const t of tokens) {
        const current = getTokenVisionEnabled(t);
        if (current !== enabled) {
          updates.push({ _id: t.id, vision: enabled, sight: { enabled } });
        }
      }
      if (updates.length) {
        await scene.updateEmbeddedDocuments('Token', updates, { diff: false, render: false });
      }
    } catch (_) { }
  }
}

async function syncNpcPrototypeVision(enabled) {
  const actors = Array.from(game.actors?.contents ?? []).filter((a) => a?.type === 'npc');
  for (const actor of actors) {
    try {
      const pt = actor?.prototypeToken;
      const current = getTokenVisionEnabled(pt);
      if (current !== enabled) {
        await actor.update(
          { 'prototypeToken.vision': enabled, 'prototypeToken.sight.enabled': enabled },
          { diff: false },
        );
      }
    } catch (_) { }
  }
}

export async function applyEnableAllTokensVisionSetting(enabled) {
  try {
    if (!game.user?.isGM) return;
    const desired = !!enabled;
    await syncNpcVisionInScenes(desired);
    await syncNpcPrototypeVision(desired);
  } catch (_) { }
}

export function setupFallbackHUDButton() {
  // Add CSS for floating button
  if (!fallbackHudButtonState.styleInstalled) {
    const style = document.createElement('style');
    style.textContent = `
      .pf2e-visioner-floating-button { position: fixed; top: 50%; left: 10px; width: 40px; height: 40px; background: rgba(0, 0, 0, 0.8); border: 2px solid #4a90e2; border-radius: 8px; color: white; display: flex; align-items: center; justify-content: center; cursor: move; z-index: 1000; font-size: 16px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3); transition: all 0.2s ease; user-select: none; }
      .pf2e-visioner-floating-button:hover { background: rgba(0, 0, 0, 0.9); border-color: #6bb6ff; transform: scale(1.05); }
      .pf2e-visioner-floating-button.dragging { cursor: grabbing; transform: scale(1.1); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5); transition: none !important; }
    `;
    document.head.appendChild(style);
    fallbackHudButtonState.styleInstalled = true;
  }

  if (!fallbackHudButtonState.documentListenersBound) {
    document.addEventListener('mousemove', (event) => {
      if (!fallbackHudButtonState.isDragging || !fallbackHudButtonState.button) return;
      const button = fallbackHudButtonState.button;
      const dragDistance = Math.hypot(
        event.clientX - fallbackHudButtonState.dragStartPos.x,
        event.clientY - fallbackHudButtonState.dragStartPos.y,
      );
      if (dragDistance > 5 && !fallbackHudButtonState.hasDragged) {
        fallbackHudButtonState.hasDragged = true;
        button.classList.add('dragging');
      }
      if (fallbackHudButtonState.hasDragged) {
        const x = event.clientX - fallbackHudButtonState.dragOffset.x;
        const y = event.clientY - fallbackHudButtonState.dragOffset.y;
        const maxX = window.innerWidth - button.offsetWidth;
        const maxY = window.innerHeight - button.offsetHeight;
        button.style.left = Math.max(0, Math.min(x, maxX)) + 'px';
        button.style.top = Math.max(0, Math.min(y, maxY)) + 'px';
      }
      event.preventDefault();
    });
    document.addEventListener('mouseup', () => {
      if (!fallbackHudButtonState.isDragging || !fallbackHudButtonState.button) return;
      const button = fallbackHudButtonState.button;
      fallbackHudButtonState.isDragging = false;
      button.classList.remove('dragging');
      if (fallbackHudButtonState.hasDragged) {
        localStorage.setItem(
          'pf2e-visioner-button-pos',
          JSON.stringify({ left: button.style.left, top: button.style.top }),
        );
        setTimeout(() => (fallbackHudButtonState.hasDragged = false), 100);
      } else {
        fallbackHudButtonState.hasDragged = false;
      }
    });
    fallbackHudButtonState.documentListenersBound = true;
  }

  bindHookOnce('fallbackHudButtonControlToken', 'controlToken', (token, controlled) => {
    document.querySelectorAll('.pf2e-visioner-floating-button').forEach((btn) => btn.remove());
    fallbackHudButtonState.button = null;
    fallbackHudButtonState.token = null;
    fallbackHudButtonState.isDragging = false;
    if (controlled && game.user.isGM && !game.settings.get(MODULE_ID, 'useHudButton')) {
      const button = document.createElement('div');
      button.className = 'pf2e-visioner-floating-button';
      button.innerHTML = '<i class="fas fa-face-hand-peeking"></i>';
      button.title = 'Token Manager (Left: Target, Right: Observer) - Drag to move';
      fallbackHudButtonState.button = button;
      fallbackHudButtonState.token = token;

      button.addEventListener('mousedown', (event) => {
        if (event.button === 0) {
          fallbackHudButtonState.isDragging = true;
          fallbackHudButtonState.hasDragged = false;
          fallbackHudButtonState.dragStartPos.x = event.clientX;
          fallbackHudButtonState.dragStartPos.y = event.clientY;
          const rect = button.getBoundingClientRect();
          fallbackHudButtonState.dragOffset.x = event.clientX - rect.left;
          fallbackHudButtonState.dragOffset.y = event.clientY - rect.top;
          event.preventDefault();
        }
      });

      const savedPos = localStorage.getItem('pf2e-visioner-button-pos');
      if (savedPos) {
        try {
          const pos = JSON.parse(savedPos);
          if (pos.left) button.style.left = pos.left;
          if (pos.top) button.style.top = pos.top;
        } catch (_) { }
      }

      button.addEventListener('click', async (event) => {
        if (fallbackHudButtonState.hasDragged) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        try {
          const { openTokenManagerWithMode } = await import('../api.js');
          await openTokenManagerWithMode(token, 'target');
        } catch (error) {
          console.error('PF2E Visioner: Error opening token manager:', error);
        }
      });
      button.addEventListener('contextmenu', async (event) => {
        if (fallbackHudButtonState.hasDragged) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        try {
          const { openTokenManagerWithMode } = await import('../api.js');
          await openTokenManagerWithMode(token, 'observer');
        } catch (error) {
          console.error('PF2E Visioner: Error opening token manager:', error);
        }
      });

      document.body.appendChild(button);
    }
  });
}
