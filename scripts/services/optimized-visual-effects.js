/**
 * Optimized visual effects adapters.
 * Token refresh stays immediate; shared workflow owns wall visual updates.
 */

import {
  refreshTokenVisuals,
  resolveTokenVisualRefreshTargets,
} from './token-visual-refresh.js';
import {
  resolveStrictWallVisualObserver,
  runWallVisualWorkflow,
  shouldRenderControlledWallIndicator,
} from './Walls/wall-visual-workflow.js';

export { cleanupDeletedWallVisuals, updateSpecificTokenPairs } from './visual-effects.js';

export async function updateTokenVisuals(tokens = undefined) {
  if (!canvas?.tokens) return;

  refreshTokenVisuals(resolveTokenVisualRefreshTargets(tokens), { requireVisibleTrue: true });
}

/**
 * Optimized wall visual update with strict controlled-token observer policy.
 */
export async function updateWallVisuals(observerId = null) {
  await runWallVisualWorkflow({
    observerId,
    resolveObserver: resolveStrictWallVisualObserver,
    shouldRenderIndicator: shouldRenderControlledWallIndicator,
    renderOptions: {
      sparkleCount: 25,
      includeInnerHighlight: false,
    },
  });
}
