/**
 * Scheduler utility for executing tasks that need to run regardless of window focus.
 * 
 * requestAnimationFrame only fires when the window is focused, which causes calculations
 * to pause when the Foundry window is in the background. This utility provides alternatives:
 * 
 * - scheduleTask: Uses setTimeout(0) for immediate execution (bypasses rAF focus requirement)
 * - scheduleAnimationFrame: Uses rAF when available and window is focused, falls back to setTimeout
 * 
 * @module utils/scheduler
 */

/**
 * Schedule a task to run immediately, bypassing the need for window focus.
 * Uses setTimeout(0) which runs as soon as the call stack is clear.
 * 
 * This is ideal for:
 * - Batch processing calculations
 * - State updates
 * - Non-visual operations
 * 
 * @param {Function} callback - Function to execute
 * @returns {number} Timeout ID that can be used with clearTimeout
 */
export function scheduleTask(callback) {
  return setTimeout(callback, 0);
}

/**
 * Cancel a scheduled task.
 * 
 * @param {number} taskId - ID returned from scheduleTask
 */
export function cancelTask(taskId) {
  clearTimeout(taskId);
}

/**
 * Schedule a task for the next frame, with fallback for unfocused windows.
 * 
 * When the window is focused, uses requestAnimationFrame for optimal timing.
 * When unfocused or rAF unavailable, falls back to setTimeout(16) (~60fps).
 * 
 * This is ideal for:
 * - UI updates that should align with rendering
 * - Visual feedback updates
 * - Operations that benefit from render timing but must still work unfocused
 * 
 * @param {Function} callback - Function to execute
 * @returns {number|object} Frame ID or timeout ID
 */
export function scheduleAnimationFrame(callback) {
  // Check if window is focused and rAF is available
  if (typeof requestAnimationFrame !== 'undefined' && document.hasFocus()) {
    return { type: 'raf', id: requestAnimationFrame(callback) };
  } else {
    // Fallback to setTimeout with ~60fps timing
    return { type: 'timeout', id: setTimeout(callback, 16) };
  }
}

/**
 * Cancel an animation frame scheduled with scheduleAnimationFrame.
 * 
 * @param {number|object} frameId - ID returned from scheduleAnimationFrame
 */
export function cancelAnimationFrame(frameId) {
  if (typeof frameId === 'object') {
    if (frameId.type === 'raf' && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(frameId.id);
    } else if (frameId.type === 'timeout') {
      clearTimeout(frameId.id);
    }
  } else if (typeof frameId === 'number') {
    // Legacy support - try both
    try {
      clearTimeout(frameId);
    } catch {}
    try {
      if (typeof cancelAnimationFrame !== 'undefined') {
        cancelAnimationFrame(frameId);
      }
    } catch {}
  }
}

/**
 * Schedule a repeating task that runs regardless of window focus.
 * Returns a stop function to cancel the task.
 * 
 * Note: For animation loops that need canvas/PIXI access, continue using
 * requestAnimationFrame directly as those require the rendering context.
 * 
 * @param {Function} callback - Function to execute each interval
 * @param {number} intervalMs - Milliseconds between executions
 * @returns {Function} Function to call to stop the interval
 */
export function scheduleInterval(callback, intervalMs = 16) {
  let stopped = false;
  let timeoutId = null;
  
  const tick = () => {
    if (stopped) return;
    
    try {
      callback();
    } catch (error) {
      console.error('Scheduler interval callback error:', error);
    }
    
    if (!stopped) {
      timeoutId = setTimeout(tick, intervalMs);
    }
  };
  
  timeoutId = setTimeout(tick, intervalMs);
  
  // Return stop function
  return () => {
    stopped = true;
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };
}

/**
 * Debounce a function call using setTimeout.
 * 
 * @param {Function} callback - Function to execute
 * @param {number} delayMs - Milliseconds to wait before executing
 * @returns {Function} Debounced function
 */
export function debounce(callback, delayMs = 100) {
  let timeoutId = null;
  
  return function debounced(...args) {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    
    timeoutId = setTimeout(() => {
      timeoutId = null;
      callback.apply(this, args);
    }, delayMs);
  };
}

/**
 * Check if the window is currently focused.
 * Useful for deciding whether to use rAF or setTimeout.
 * 
 * @returns {boolean} True if window has focus
 */
export function isWindowFocused() {
  return typeof document !== 'undefined' && document.hasFocus();
}

/**
 * Keep-alive system to ensure tasks run even when window is minimized.
 * When minimized, browsers throttle setTimeout/setInterval heavily (to 1000ms+).
 * This uses a combination of timers and visibility change events.
 */
class KeepAliveSystem {
  constructor() {
    this.pendingCallbacks = new Set();
    this.isRunning = false;
    this.pollInterval = null;
    this.minPollRate = 100; // Poll every 100ms when minimized
  }

  /**
   * Register a callback to run ASAP, even if window is minimized
   */
  schedule(callback) {
    this.pendingCallbacks.add(callback);
    this.ensurePolling();
    
    // Try immediate execution
    this.tryExecutePending();
  }

  /**
   * Start polling if not already running
   */
  ensurePolling() {
    if (this.pollInterval !== null) return;
    
    // Use setInterval which is slightly more reliable when minimized
    this.pollInterval = setInterval(() => {
      this.tryExecutePending();
    }, this.minPollRate);
  }

  /**
   * Execute all pending callbacks
   */
  tryExecutePending() {
    if (this.pendingCallbacks.size === 0) {
      // No pending work - stop polling to save resources
      if (this.pollInterval !== null) {
        clearInterval(this.pollInterval);
        this.pollInterval = null;
      }
      return;
    }

    // Execute all pending callbacks
    const callbacks = Array.from(this.pendingCallbacks);
    this.pendingCallbacks.clear();
    
    for (const callback of callbacks) {
      try {
        callback();
      } catch (error) {
        console.error('KeepAlive callback error:', error);
      }
    }
  }

  /**
   * Check if there are pending tasks
   */
  hasPending() {
    return this.pendingCallbacks.size > 0;
  }
}

// Global keep-alive instance
const keepAlive = new KeepAliveSystem();

// Listen for visibility changes to trigger immediate execution
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && keepAlive.hasPending()) {
      // Window just became visible - execute pending work immediately
      keepAlive.tryExecutePending();
    }
  });
}

/**
 * Schedule a task with keep-alive guarantee.
 * This ensures the task runs even if the window is minimized.
 * Use this for critical operations like state updates that must happen.
 * 
 * @param {Function} callback - Function to execute
 */
export function scheduleTaskWithKeepAlive(callback) {
  keepAlive.schedule(callback);
}
