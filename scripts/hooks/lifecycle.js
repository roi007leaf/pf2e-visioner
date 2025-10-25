/**
 * Canvas and app lifecycle hooks handlers
 */

import { injectChatAutomationStyles } from '../chat/chat-automation-styles.js';
import { MODULE_ID } from '../constants.js';
import { initializeHoverTooltips } from '../services/HoverTooltips.js';
import { registerSocket } from '../services/socket.js';
import { updateTokenVisuals, updateWallVisuals } from '../services/visual-effects.js';
import { getLogger } from '../utils/logger.js';

async function reapplyRuleElementsOnLoad() {
  const log = getLogger('RuleElements/Lifecycle');

  if (!canvas?.tokens?.placeables) {
    log.debug('No tokens on canvas, skipping rule element reapplication');
    return;
  }

  log.debug(() => ({ msg: 'Reapplying rule elements on canvas ready', tokenCount: canvas.tokens.placeables.length }));

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

      const effects = actor.items?.filter(i => i.type === 'effect') || [];
      log.debug(() => ({ msg: 'Actor effects scanned', actor: actor.name, effects: effects.length }));

      for (const effect of effects) {
        const rules = effect.system?.rules || [];
        const hasVisionerRules = rules.some(rule =>
          rule.key === 'PF2eVisionerEffect' || rule.key === 'PF2eVisionerVisibility'
        );

        if (hasVisionerRules) {
          log.debug(() => ({
            msg: 'Found PF2eVisionerEffect on existing effect, reapplying',
            effectName: effect.name,
            actorName: actor.name,
            tokenId: token.id
          }));

          let hasAppliedRules = false;

          for (const rule of rules) {
            if (rule.key === 'PF2eVisionerEffect' || rule.key === 'PF2eVisionerVisibility') {
              try {
                const instance = Array.isArray(effect.ruleElements)
                  ? effect.ruleElements.find(r => r?.key === rule.key && (r?.slug === rule.slug || !rule.slug))
                  : null;

                log.debug(() => ({ msg: 'Rule instance lookup', effect: effect.name, ruleKey: rule.key, hasInstance: !!instance, hasApply: !!(instance && typeof instance.applyOperations === 'function') }));

                if (instance && typeof instance.applyOperations === 'function') {
                  await instance.applyOperations();
                  hasAppliedRules = true;
                  log.debug(() => ({
                    msg: 'Successfully reapplied rule element operations',
                    ruleKey: rule.key,
                    effectName: effect.name
                  }));
                } else {
                  log.debug(() => ({ msg: 'No applicable instance to apply', effect: effect.name, ruleKey: rule.key }));
                }
              } catch (error) {
                log.warn(() => ({
                  msg: 'Failed to reapply individual rule',
                  ruleKey: rule.key,
                  effectName: effect.name,
                  error: error.message
                }));
              }
            }
          }

          if (hasAppliedRules) {
            tokensWithRuleElements.push(token.id);
          }
        }
      }
    } catch (error) {
      log.warn(() => ({
        msg: 'Failed to process token for rule element reapplication',
        tokenName: token.name,
        error: error.message
      }));
    }
  }

  if (tokensWithRuleElements.length > 0) {
    log.debug(() => ({
      msg: 'Triggering AVS recalculation for tokens with rule elements',
      tokenCount: tokensWithRuleElements.length
    }));

    try {
      if (window.pf2eVisioner?.services?.autoVisibilitySystem?.recalculateForTokens) {
        await window.pf2eVisioner.services.autoVisibilitySystem.recalculateForTokens(tokensWithRuleElements);
      } else if (window.pf2eVisioner?.services?.autoVisibilitySystem?.recalculateAll) {
        await window.pf2eVisioner.services.autoVisibilitySystem.recalculateAll();
      } else if (canvas?.perception) {
        canvas.perception.update({ refreshVision: true, refreshOcclusion: true });
      }
    } catch (error) {
      log.warn(() => ({
        msg: 'Failed to trigger AVS recalculation',
        error: error.message
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
    (actor.items?.filter(i => i.type === 'effect') || []).map(e => e.id)
  );

  const staleKeys = registeredKeys.filter(key => {
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
    staleKeys
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

      const prune = (arr) => Array.isArray(arr) ? arr.filter(s => !(typeof s?.id === 'string' && s.id.startsWith(`${itemId}-`))) : arr;

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
        error: error.message
      }));
    }
  }

  updates['flags.pf2e-visioner.ruleElementRegistry'] = newRegistry;

  if (Object.keys(updates).length > 0) {
    await token.document.update(updates);

    log.debug(() => ({
      msg: 'Cleaned up stale flags',
      tokenName: token.name,
      flagsRemoved: Object.keys(updates).length
    }));
  }
} export function onReady() {
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
  }
}

export async function onCanvasReady() {
  if (canvas.ready && canvas.tokens?.placeables) {
    await updateTokenVisuals();
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
        const wallFlags = token?.document?.getFlag?.(MODULE_ID, 'walls') || {};
        // Only restore if this token has wall flags
        if (Object.keys(wallFlags).length > 0) {
          await updateWallVisuals(token.document.id);
        }
      }
    }

    // Also set up a hook to restore indicators when tokens are controlled after canvas ready
    // OPTIMIZED: Only update wall visuals if the token actually has wall flags to avoid triggering AVS
    const restoreIndicatorsOnControl = Hooks.on('controlToken', async (token, controlled) => {
      // CRITICAL: Set global flag to suppress lighting refreshes during token control operations
      try {
        globalThis.game = globalThis.game || {};
        globalThis.game.pf2eVisioner = globalThis.game.pf2eVisioner || {};
        globalThis.game.pf2eVisioner.suppressLightingRefresh = true;

        // Track this controlToken event to prevent AVS from responding to related lighting refreshes
        const { LightingEventHandler } = await import('../visibility/auto-visibility/core/LightingEventHandler.js');
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
            console.warn('PF2E Visioner | Failed to use optimized wall indicator update, skipping:', error);
          }
        }

        try {
          const { updateSystemHiddenTokenHighlights } = await import('../services/visual-effects.js');
          await updateSystemHiddenTokenHighlights(token.document.id);
        } catch (error) {
          console.warn('PF2E Visioner | Failed to update system-hidden token highlights:', error);
        }
      } else {
        try {
          const { updateSystemHiddenTokenHighlights } = await import('../services/visual-effects.js');
          await updateSystemHiddenTokenHighlights(null);
        } catch (error) {
          console.warn('PF2E Visioner | Failed to clear system-hidden token highlights:', error);
        }
      }

      // Clear the suppression flag after a short delay
      setTimeout(() => {
        try {
          if (globalThis.game?.pf2eVisioner) {
            globalThis.game.pf2eVisioner.suppressLightingRefresh = false;
          }
        } catch {
          // Best effort
        }
      }, 50);
    });
  } catch (_) { }

  initializeHoverTooltips();

  // Listen for condition changes to update lifesense highlights
  // Note: Trait changes are handled by ActorEventHandler for full AVS recalculation

  // Listen for item updates on actors (conditions are items in PF2e)
  Hooks.on('createItem', async (item, options, userId) => {
    try {
      if (item.type !== 'condition') return;

      const actor = item.parent;
      if (!actor) return;

      // Trigger perception refresh to recalculate visibility based on new conditions
      if (canvas?.perception) {
        canvas.perception.update({
          refreshVision: true,
          refreshOcclusion: true
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

  Hooks.on('deleteItem', async (item, options, userId) => {
    try {
      if (item.type !== 'condition') return;

      const actor = item.parent;
      if (!actor) return;

      // Trigger perception refresh to recalculate visibility based on removed conditions
      if (canvas?.perception) {
        canvas.perception.update({
          refreshVision: true,
          refreshOcclusion: true
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
  window.addEventListener(
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
  window.addEventListener(
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
  Hooks.on('canvasTearDown', async () => {
    try {
      const { default: indicator } = await import('../ui/OverrideValidationIndicator.js');
      indicator.hide(true);
    } catch (error) {
      console.warn('PF2E Visioner | Failed to hide indicator on scene change:', error);
    }
  });
}

async function enableVisionForAllTokensAndPrototypes() {
  try {
    if (game.settings.get(MODULE_ID, 'enableAllTokensVision')) {
      // Update all scene tokens
      const scenes = Array.from(game.scenes?.contents ?? []);
      for (const scene of scenes) {
        try {
          const tokens = Array.from(scene.tokens?.contents ?? []).filter(t => t.actor?.type !== "loot");
          const updates = [];
          for (const t of tokens) {
            const hasVision = t?.vision === true || t?.sight?.enabled === true;
            if (!hasVision) {
              updates.push({ _id: t.id, vision: true, sight: { enabled: true } });
            }
          }
          if (updates.length) {
            await scene.updateEmbeddedDocuments('Token', updates, { diff: false, render: false });
          }
        } catch (_) { }
      }

      // Update all actor prototype tokens
      const actors = Array.from(game.actors?.contents ?? []).filter(a => a?.type !== "loot");
      for (const actor of actors) {
        try {
          const pt = actor?.prototypeToken;
          const hasVision = pt?.vision === true || pt?.sight?.enabled === true;
          if (!hasVision) {
            // Only GMs can update actor prototype tokens
            if (game.user.isGM) {
              await actor.update(
                { 'prototypeToken.vision': true, 'prototypeToken.sight.enabled': true },
                { diff: false },
              );
            }
          }
        } catch (_) { }
      }
    }
  } catch (_) { }
}

function setupFallbackHUDButton() {
  // Add CSS for floating button
  const style = document.createElement('style');
  style.textContent = `
    .pf2e-visioner-floating-button { position: fixed; top: 50%; left: 10px; width: 40px; height: 40px; background: rgba(0, 0, 0, 0.8); border: 2px solid #4a90e2; border-radius: 8px; color: white; display: flex; align-items: center; justify-content: center; cursor: move; z-index: 1000; font-size: 16px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3); transition: all 0.2s ease; user-select: none; }
    .pf2e-visioner-floating-button:hover { background: rgba(0, 0, 0, 0.9); border-color: #6bb6ff; transform: scale(1.05); }
    .pf2e-visioner-floating-button.dragging { cursor: grabbing; transform: scale(1.1); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5); transition: none !important; }
  `;
  document.head.appendChild(style);

  Hooks.on('controlToken', (token, controlled) => {
    document.querySelectorAll('.pf2e-visioner-floating-button').forEach((btn) => btn.remove());
    if (controlled && game.user.isGM && !game.settings.get(MODULE_ID, 'useHudButton')) {
      const button = document.createElement('div');
      button.className = 'pf2e-visioner-floating-button';
      button.innerHTML = '<i class="fas fa-face-hand-peeking"></i>';
      button.title = 'Token Manager (Left: Target, Right: Observer) - Drag to move';

      let isDragging = false;
      let hasDragged = false;
      const dragStartPos = { x: 0, y: 0 };
      const dragOffset = { x: 0, y: 0 };

      button.addEventListener('mousedown', (event) => {
        if (event.button === 0) {
          isDragging = true;
          hasDragged = false;
          dragStartPos.x = event.clientX;
          dragStartPos.y = event.clientY;
          const rect = button.getBoundingClientRect();
          dragOffset.x = event.clientX - rect.left;
          dragOffset.y = event.clientY - rect.top;
          event.preventDefault();
        }
      });
      document.addEventListener('mousemove', (event) => {
        if (!isDragging) return;
        const dragDistance = Math.hypot(
          event.clientX - dragStartPos.x,
          event.clientY - dragStartPos.y,
        );
        if (dragDistance > 5 && !hasDragged) {
          hasDragged = true;
          button.classList.add('dragging');
        }
        if (hasDragged) {
          const x = event.clientX - dragOffset.x;
          const y = event.clientY - dragOffset.y;
          const maxX = window.innerWidth - button.offsetWidth;
          const maxY = window.innerHeight - button.offsetHeight;
          button.style.left = Math.max(0, Math.min(x, maxX)) + 'px';
          button.style.top = Math.max(0, Math.min(y, maxY)) + 'px';
        }
        event.preventDefault();
      });
      document.addEventListener('mouseup', (event) => {
        if (!isDragging) return;
        isDragging = false;
        button.classList.remove('dragging');
        if (hasDragged) {
          localStorage.setItem(
            'pf2e-visioner-button-pos',
            JSON.stringify({ left: button.style.left, top: button.style.top }),
          );
        }
        if (hasDragged) setTimeout(() => (hasDragged = false), 100);
        else hasDragged = false;
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
        if (hasDragged) {
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
        if (hasDragged) {
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
