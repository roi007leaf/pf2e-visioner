/**
 * Optimized Socket Service - Zero-delay perception refresh for event-driven system
 * This replaces the debounced refreshEveryonesPerception function with immediate updates
 */

import { MODULE_ID } from '../constants.js';

// Track if a refresh is already scheduled
let _refreshScheduled = false;

/**
 * Optimized perception refresh - uses requestAnimationFrame instead of setTimeout
 * No artificial delays since event-driven batching prevents spam naturally
 */
export function refreshEveryonesPerceptionOptimized() {
  // If already scheduled, don't duplicate
  if (_refreshScheduled) return;

  _refreshScheduled = true;

  // Use requestAnimationFrame for optimal timing with rendering
  requestAnimationFrame(async () => {
    try {
      // Import the original socket service
      const { _socketService, REFRESH_CHANNEL } = await import('./socket.js');

      if (_socketService.socket) {
        _socketService.executeForEveryone(REFRESH_CHANNEL);
      }

      // Update wall visuals
      const observerId = canvas.tokens.controlled?.[0]?.id || null;
      const { updateWallVisuals } = await import('./optimized-visual-effects.js');
      await updateWallVisuals(observerId);
    } catch (error) {
      console.warn(`${MODULE_ID} | Error in optimized perception refresh:`, error);
    }

    _refreshScheduled = false;
  });
}

/**
 * Force immediate perception refresh (bypasses scheduling)
 */
export async function forceRefreshEveryonesPerception() {
  _refreshScheduled = false;

  try {
    // Import the original socket service
    const { _socketService, REFRESH_CHANNEL } = await import('./socket.js');

    if (_socketService.socket) {
      _socketService.executeForEveryone(REFRESH_CHANNEL);
    }

    // Update wall visuals
    const observerId = canvas.tokens.controlled?.[0]?.id || null;
    const { updateWallVisuals } = await import('./optimized-visual-effects.js');
    await updateWallVisuals(observerId);
  } catch (error) {
    console.warn(`${MODULE_ID} | Error in forced perception refresh:`, error);
  }
}

/**
 * Check if a refresh is currently scheduled
 * @returns {boolean}
 */
export function isRefreshScheduled() {
  return _refreshScheduled;
}

/**
 * Cancel any scheduled refresh
 */
export function cancelScheduledRefresh() {
  _refreshScheduled = false;
}
