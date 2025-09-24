/**
 * Canvas and app lifecycle hooks handlers
 */

import { injectChatAutomationStyles } from '../chat/chat-automation-styles.js';
import { MODULE_ID } from '../constants.js';
import { initializeHoverTooltips } from '../services/hover-tooltips.js';
import { registerSocket } from '../services/socket.js';
import { updateTokenVisuals, updateWallVisuals } from '../services/visual-effects.js';

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
  }
}

export async function onCanvasReady() {
  await updateTokenVisuals();
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
    const restoreIndicatorsOnControl = Hooks.on('controlToken', async (token, controlled) => {
      if (controlled) {
        const wallFlags = token?.document?.getFlag?.(MODULE_ID, 'walls') || {};
        if (Object.keys(wallFlags).length > 0) {
          await updateWallVisuals(token.document.id);
        }
      }
    });

    // Clean up the hook when canvas is torn down
    Hooks.once('canvasTearDown', async () => {
      Hooks.off('controlToken', restoreIndicatorsOnControl);

      // Clean up any remaining wall indicators when canvas is torn down
      try {
        const { cleanupAllWallIndicators } = await import('../services/visual-effects.js');
        await cleanupAllWallIndicators();
      } catch (_) { }
    });
  } catch (_) { }

  // Always initialize tooltip system for keyboard shortcuts
  initializeHoverTooltips();

  // Always bind keyboard shortcuts (Alt handled via highlightObjects hook, O key handled here)
  // Bind 'O' key on keydown/keyup for observer overlay
  window.addEventListener(
    'keydown',
    async (ev) => {
      if (ev.key?.toLowerCase() !== 'o') return;
      const { HoverTooltips, showControlledTokenVisibilityObserver } = await import(
        '../services/hover-tooltips.js'
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
        const { onHighlightObjects } = await import('../services/hover-tooltips.js');
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
}

async function enableVisionForAllTokensAndPrototypes() {
  try {
    if (game.settings.get(MODULE_ID, 'enableAllTokensVision')) {
      // Update all scene tokens
      const scenes = Array.from(game.scenes?.contents ?? []);
      for (const scene of scenes) {
        try {
          const tokens = Array.from(scene.tokens?.contents ?? []);
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
      const actors = Array.from(game.actors?.contents ?? []);
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
