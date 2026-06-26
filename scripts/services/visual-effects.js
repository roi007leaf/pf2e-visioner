/**
 * Visual Effects Handler
 * Handles token/wall visual updates and refresh operations for both visibility and cover
 *
 * NOTE: The visual effect modules use scheduler-backed animation loops for PIXI.js effects.
 * These CANNOT be converted to web workers or setTimeout because:
 *
 * 1. Web workers cannot access DOM, Canvas, or PIXI graphics objects
 * 2. Animation loops need to update PIXI graphics (sparkles, pulses, shimmer effects)
 * 3. These are purely visual effects that only need to run when the window is focused
 * 4. When the window is unfocused, animations pausing is actually desired behavior
 *    (saves CPU/GPU resources since no one is watching)
 *
 * The scheduler-backed animation usage is INTENTIONAL and CORRECT for visual animations.
 * Do NOT move these visual loops to web workers.
 *
 * For non-visual calculations that need to run when unfocused, see:
 * - scripts/utils/scheduler.js (scheduleTask utility)
 * - scripts/visibility/auto-visibility/core/BatchOrchestrator.js (uses setTimeout)
 * - scripts/visibility/auto-visibility/core/VisibilityStateManager.js (uses setTimeout)
 */

import { MODULE_ID } from '../constants.js';
import { getDetectionBetween } from '../stores/detection-map.js';
import { getVisibilityBetween } from '../utils.js';
import { _internal as visibilityCalculatorInternal } from '../visibility/StatelessVisibilityCalculator.js';
import { VisionAnalyzer } from '../visibility/auto-visibility/VisionAnalyzer.js';
import {
  buildSystemHiddenIndicatorDecision,
  getSystemHiddenIndicatorCandidates,
  getSystemHiddenSenseContext,
  resolveSystemHiddenObserver,
  shouldEvaluateSystemHiddenIndicators,
} from './system-hidden-token-highlights.js';
import {
  createSystemHiddenIndicator,
  ensureSystemHiddenKeyHandlerInstalled,
  removeSystemHiddenIndicator,
} from './system-hidden-indicator-rendering.js';
import { isPresenceOnlyIndicatorMode } from './system-hidden-presence-only-suppression.js';
import { HoverTooltips } from './HoverTooltips.js';
import {
  refreshTokenVisual,
  refreshTokenVisuals,
  resolveTokenVisualRefreshTargets,
} from './token-visual-refresh.js';
import {
  buildTokenWallFlagCleanupUpdates,
  cleanupAllWallReferences,
  cleanupDeletedWallReferences,
  refreshCanvasEffects,
  removeAllWallIndicatorDisplayObjects,
  removeWallIndicatorsForWall,
} from './Walls/wall-indicator-cleanup.js';
import { runWallVisualWorkflow } from './Walls/wall-visual-workflow.js';

export { removeSystemHiddenIndicator } from './system-hidden-indicator-rendering.js';

/**
 * Update token visuals - now mostly handled by detection wrapper
 * This function mainly refreshes rendered token sprites after visibility state changes.
 */
let updateTokenVisualsPending = false;
let pendingTokenVisualRefreshTargets = undefined;

function queueTokenVisualRefresh(targets) {
  if (targets === null) {
    pendingTokenVisualRefreshTargets = null;
    return;
  }
  if (pendingTokenVisualRefreshTargets === null) return;
  if (!pendingTokenVisualRefreshTargets) pendingTokenVisualRefreshTargets = new Set();
  for (const target of targets || []) pendingTokenVisualRefreshTargets.add(target);
}

function consumePendingTokenVisualRefreshTargets() {
  const targets = pendingTokenVisualRefreshTargets;
  pendingTokenVisualRefreshTargets = undefined;
  if (targets instanceof Set) return Array.from(targets);
  return targets;
}

function refreshTokenVisualTargets(targets) {
  const tokens = targets === null ? canvas.tokens.placeables : targets;
  refreshTokenVisuals(tokens);
}

function hasSystemHiddenIndicators(tokens) {
  return tokens.some((token) => !!token?._pvSystemHiddenIndicator);
}

function removeSystemHiddenIndicators(tokens) {
  for (const token of tokens) {
    removeSystemHiddenIndicator(token);
  }
}

export async function updateTokenVisuals(tokens = undefined) {
  if (!canvas?.tokens) return;
  const targets =
    tokens === undefined || tokens === null ? null : resolveTokenVisualRefreshTargets(tokens);

  if (isDiceSoNiceAnimating()) {
    queueTokenVisualRefresh(targets);
    if (!updateTokenVisualsPending) {
      updateTokenVisualsPending = true;
      await new Promise((resolve) => setTimeout(resolve, 100));
      updateTokenVisualsPending = false;
      const pendingTargets = consumePendingTokenVisualRefreshTargets();
      updateTokenVisuals(pendingTargets === null ? undefined : pendingTargets);
    }
    return;
  }

  refreshTokenVisualTargets(targets);
}

/**
 * Targeted updates for performance and correctness. Only applies effects to the provided pairs.
 * @param {Array<{observerId:string,targetId:string,visibility?:string,cover?:string}>} pairs
 */
export async function updateSpecificTokenPairs(pairs) {
  if (!Array.isArray(pairs) || pairs.length === 0) return;
  // Apply only changed visibility/cover per pair
  for (const p of pairs) {
    const observer = canvas.tokens.get(p.observerId);
    const target = canvas.tokens.get(p.targetId);
    if (!observer || !target) continue;
    // We do not draw custom visibility rings; detection/engine visuals will handle it
    // Effects are already applied by batch/single upsert paths; do not re-apply here
    // This function should only refresh visuals to avoid double-application of rules
    // Light refresh of the two tokens
    refreshTokenVisual(observer);
    refreshTokenVisual(target);
  }
}

/**
 * Check if Dice So Nice is currently animating
 * @returns {boolean} True if dice are currently animating
 */
function isDiceSoNiceAnimating() {
  // Check if Dice So Nice module is active
  if (!game.modules.get('dice-so-nice')?.active) {
    return false;
  }

  // Primary check: dice box rolling status
  if (game.dice3d?.box?.rolling) {
    return true;
  }

  // Secondary check: dice canvas visibility and animation state
  const diceCanvas = document.getElementById('dice-box-canvas');
  if (diceCanvas) {
    const isVisible = diceCanvas.style.display !== 'none' && diceCanvas.offsetParent !== null;
    const hasOpacity = parseFloat(getComputedStyle(diceCanvas).opacity) > 0;

    if (isVisible && hasOpacity) {
      return true;
    }
  }

  // Tertiary check: look for active dice animations in the scene
  if (game.dice3d?.box?.scene?.children?.length > 0) {
    return true;
  }

  return false;
}

/**
 * Clean up visual indicators for a deleted wall
 * This function handles cleanup when a wall is deleted, ensuring that
 * any visual indicators are properly removed from all clients
 */
export async function cleanupDeletedWallVisuals(wallDocument) {
  try {
    if (!wallDocument?.id) return;

    const wallId = wallDocument.id;
    removeWallIndicatorsForWall(canvas, wallId);
    cleanupDeletedWallReferences(canvas?.walls?.placeables || [], wallId);

    // Clean up any token wall flags that reference the deleted wall
    try {
      const tokens = canvas.tokens?.placeables || [];
      const tokenUpdates = buildTokenWallFlagCleanupUpdates(tokens, wallId, MODULE_ID);

      if (tokenUpdates.length > 0 && game.user?.isGM) {
        await canvas.scene?.updateEmbeddedDocuments?.('Token', tokenUpdates, { diff: false });
      }
    } catch (error) {
      console.warn(`[${MODULE_ID}] Error cleaning up token wall flags:`, error);
    }

    // Force a canvas refresh to ensure visual updates are applied
    refreshCanvasEffects(canvas);
  } catch (error) {
    console.warn(`[${MODULE_ID}] Error cleaning up deleted wall visuals:`, error);
  }
}

/**
 * Clean up all wall indicators globally - useful for mass deletions
 * This function removes all wall indicators from the canvas layers without
 * needing to iterate over specific wall documents
 */
export async function cleanupAllWallIndicators() {
  try {
    // Clean up hover tooltips cover indicators first (these are created by Alt key for tokens)
    // NOTE: We only cleanup indicators, not the entire hover tooltip system
    // because we don't want to remove event listeners from tokens
    try {
      const { hideAllVisibilityIndicators, hideAllCoverIndicators } = await import(
        './HoverTooltips.js'
      );
      hideAllVisibilityIndicators();
      hideAllCoverIndicators();
    } catch (_) { }

    removeAllWallIndicatorDisplayObjects(canvas, PIXI);
    cleanupAllWallReferences(canvas?.walls?.placeables || []);

    // Force a canvas refresh to ensure visual updates are applied
    refreshCanvasEffects(canvas);
  } catch (error) {
    console.warn(`[${MODULE_ID}] Error cleaning up all wall indicators:`, error);
  }
}

/**
 * Visual-only walls toggle per observer
 * Hides walls for this client if the active observer has them set as hidden
 */
export async function updateWallVisuals(observerId = null) {
  await runWallVisualWorkflow({
    observerId,
    skipDuringPan: true,
    isPanning: () => !!HoverTooltips?._isPanning,
    renderOptions: {
      sparkleCount: 50,
      includeInnerHighlight: true,
    },
  });
}

/**
 * Optimized wall indicator update that ONLY handles visual indicators
 * Does not trigger lighting refresh or AVS processing
 * Used specifically for controlToken hooks to avoid unnecessary AVS runs
 * @param {string} observerId - The observer token ID
 */
export async function updateWallIndicatorsOnly(observerId = null) {
  await runWallVisualWorkflow({
    observerId,
    skipDuringPan: true,
    isPanning: () => !!HoverTooltips?._isPanning,
    renderOptions: ({ canvasLayer }) => ({
      parent: canvasLayer.interface,
      animated: false,
    }),
    applySightUpdates: false,
    updateEchoes: false,
  });
}

export async function updateSystemHiddenTokenHighlights(
  observerId = null,
  positionOverride = null,
  options = {},
) {
  try {
    if (!game.settings?.get?.(MODULE_ID, 'autoVisibilityEnabled')) {
      return;
    }

    const tokens = canvas?.tokens?.placeables || [];
    if (!tokens.length) {
      return;
    }

    const observer = resolveSystemHiddenObserver({
      observerId,
      allowControlledFallback: options?.allowControlledFallback !== false,
      tokensLayer: canvas.tokens,
    });

    if (!observer) {
      if (hasSystemHiddenIndicators(tokens)) removeSystemHiddenIndicators(tokens);
      return;
    }

    const senseContext = getSystemHiddenSenseContext(observer);
    const { observerIsBlindAndDeaf } = senseContext;

    // Lifesense indicator should show when the observer has lifesense
    // The indicator will then be shown on targets that:
    // 1. Are within lifesense range
    // 2. Can be detected by lifesense (living/undead creatures)
    // 3. Are system-hidden (not visible to the client)
    //
    // This allows lifesense to work through walls, in darkness, and with invisible creatures
    // without requiring specific conditions like blinded/deafened
    //
    // OR when the observer is both blinded AND deafened:
    // All other tokens should show an indicator because they are effectively undetectable
    // (no precise or imprecise senses can work)
    if (!shouldEvaluateSystemHiddenIndicators(senseContext)) {
      if (hasSystemHiddenIndicators(tokens)) removeSystemHiddenIndicators(tokens);
      return;
    }

    for (const token of getSystemHiddenIndicatorCandidates(tokens, observer)) {
      const {
        shouldShowIndicator,
        indicatorMode,
        shouldShowThoughtsenseIndicator,
        shouldShowEcholocationIndicator,
      } =
        buildSystemHiddenIndicatorDecision({
          observer,
          token,
          positionOverride,
          senseContext,
          grid: canvas.grid,
          getVisibilityState: getVisibilityBetween,
          getDetectionBetween,
          isSoundBlocked: (observerToken, targetToken) =>
            VisionAnalyzer.getInstance().isSoundBlocked(observerToken, targetToken),
          canLifesenseDetect: visibilityCalculatorInternal.canLifesenseDetect,
          canThoughtsenseDetect: visibilityCalculatorInternal.canThoughtsenseDetect,
        });
      const existingIndicator = token._pvSystemHiddenIndicator;

      // If indicator exists but shouldn't, remove it
      if (existingIndicator && !shouldShowIndicator) {
        removeSystemHiddenIndicator(token, {
          forceTokenVisible: isPresenceOnlyIndicatorMode(existingIndicator._pvIndicatorMode),
        });
        continue;
      }

      // If indicator exists and should exist, skip recreation (just position updates are handled by token animation)
      if (
        existingIndicator &&
        shouldShowIndicator &&
        existingIndicator._pvObserverId === observer.document.id &&
        existingIndicator._pvIndicatorMode === indicatorMode
      ) {
        continue;
      }

      if (existingIndicator) {
        removeSystemHiddenIndicator(token);
      }

      if (shouldShowIndicator) {
        try {
          ensureSystemHiddenKeyHandlerInstalled();
          await createSystemHiddenIndicator({
            observer,
            token,
            indicatorMode,
            observerIsBlindAndDeaf,
            shouldShowThoughtsenseIndicator,
            shouldShowEcholocationIndicator,
          });
        } catch (error) {
          console.warn(
            `PF2E Visioner | Error creating system-hidden indicator for token ${token.document.id}:`,
            error,
          );
        }
      }
    }
  } catch (error) {
    console.warn(`PF2E Visioner | Error in updateSystemHiddenTokenHighlights:`, error);
  }
}
