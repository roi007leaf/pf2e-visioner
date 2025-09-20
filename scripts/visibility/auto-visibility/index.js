/**
 * Auto-Visibility System Index
 * Exports the zero-delay, event-driven visibility system for immediate updates
 *
 * Features:
 * - Event-driven architecture (no polling)
 * - Zero artificial delays (no setTimeout/setInterval throttling)
 * - Immediate processing using requestAnimationFrame
 * - Batch processing to handle multiple changes efficiently
 * - Fresh coordinate tracking for accurate distance calculations
 */

// Export the event-driven system
export { eventDrivenVisibilitySystem as autoVisibilitySystem } from './EventDrivenVisibilitySystem.js';

// Export components for manual use if needed
export { optimizedPerceptionManager } from './PerceptionManager.js';
export { optimizedTokenUpdateManager } from './TokenUpdateManager.js';
export { optimizedVisibilityCalculator, visibilityCalculator } from './VisibilityCalculator.js';

// Export optimized socket service
export {
  forceRefreshEveryonesPerception,
  refreshEveryonesPerceptionOptimized,
} from '../../services/optimized-socket.js';
