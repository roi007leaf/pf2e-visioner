/**
 * Optimized visual effects adapters.
 * Token refresh stays immediate; shared workflow owns wall visual updates.
 */

import { refreshTokenVisuals } from './token-visual-refresh.js';
import {
  resolveStrictWallVisualObserver,
  runWallVisualWorkflow,
  shouldRenderControlledWallIndicator,
} from './Walls/wall-visual-workflow.js';

export { cleanupDeletedWallVisuals, updateSpecificTokenPairs } from './visual-effects.js';

/**
 * Update token visuals - optimized version with no delays
 */
export async function updateTokenVisuals() {
  if (!canvas?.tokens) return;

  // No dice animation check - immediate processing
  refreshTokenVisuals(canvas.tokens.placeables, { requireVisibleTrue: true });
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
