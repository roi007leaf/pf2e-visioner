/**
 * GPU Keep-Alive Service
 * Prevents GPU throttling by maintaining GPU activity
 * This fixes lag when panning the canvas after periods of inactivity
 */

import { MODULE_ID } from '../constants.js';

let _animationFrameId = null;
let _isActive = false;
let _warmupSprite = null;

/**
 * Create a minimal invisible sprite to keep GPU active
 * This forces actual GPU rendering work, not just RAF loops
 */
function createWarmupSprite() {
  if (!canvas?.ready || !canvas?.app?.stage) return null;

  try {
    // Check if PIXI is available
    const PIXI = globalThis.PIXI || canvas.app.stage?.constructor?.namespace;
    if (!PIXI) return null;

    // Create a tiny 1x1 transparent sprite that we'll render off-screen
    // This forces actual GPU work without being visible
    const graphics = new PIXI.Graphics();
    graphics.beginFill(0x000000, 0.0001); // Nearly transparent but not 0 (ensures rendering)
    graphics.drawRect(0, 0, 1, 1);
    graphics.endFill();

    // Position it way off-screen so it's never visible
    graphics.x = -10000;
    graphics.y = -10000;
    graphics.alpha = 0.0001; // Nearly 0 but not 0 to ensure it's processed
    graphics.visible = true; // Must be visible for PIXI to process it
    graphics.renderable = true; // Ensure it's renderable

    // Add to a layer that's always rendered (the main stage)
    canvas.app.stage.addChild(graphics);

    return graphics;
  } catch (error) {
    console.warn(`[${MODULE_ID}] Failed to create GPU warmup sprite:`, error);
    return null;
  }
}

/**
 * Start the GPU keep-alive loop
 * Uses requestAnimationFrame with actual rendering work to keep GPU active
 */
function startKeepAlive() {
  if (_isActive || _animationFrameId !== null) return;

  _isActive = true;

  // Create warmup sprite if canvas is ready
  if (canvas?.ready) {
    _warmupSprite = createWarmupSprite();
  }

  function keepAliveLoop() {
    if (!_isActive) {
      _animationFrameId = null;
      return;
    }

    try {
      if (canvas?.ready && canvas?.app?.renderer) {
        // Keep warmup sprite active to trigger GPU work
        if (_warmupSprite) {
          // Micro-rotation that triggers GPU work without visual change
          // The sprite is invisible and off-screen, but rotation forces GPU updates
          _warmupSprite.rotation = (_warmupSprite.rotation || 0) + 0.0001;
          if (_warmupSprite.rotation > Math.PI * 2) {
            _warmupSprite.rotation = 0;
          }
        } else {
          // Fallback: create sprite if it doesn't exist
          _warmupSprite = createWarmupSprite();
        }
      }
    } catch (_) {
      // Canvas not ready or destroyed, continue loop anyway
    }

    _animationFrameId = requestAnimationFrame(keepAliveLoop);
  }

  _animationFrameId = requestAnimationFrame(keepAliveLoop);
}

/**
 * Stop the GPU keep-alive loop
 */
function stopKeepAlive() {
  _isActive = false;
  if (_animationFrameId !== null) {
    cancelAnimationFrame(_animationFrameId);
    _animationFrameId = null;
  }

  // Clean up warmup sprite
  if (_warmupSprite && canvas?.app?.stage) {
    try {
      canvas.app.stage.removeChild(_warmupSprite);
      _warmupSprite.destroy();
    } catch (_) {
      // Best effort cleanup
    }
    _warmupSprite = null;
  }
}

/**
 * Warm up GPU before panning starts
 * This ensures the warmup sprite is active and GPU is ready
 */
function warmupGpuForPanning() {
  if (!canvas?.ready || !canvas?.app?.renderer) return;

  try {
    // Ensure warmup sprite exists and is active
    // The continuous RAF loop with sprite animation should keep GPU active
    if (!_warmupSprite) {
      _warmupSprite = createWarmupSprite();
    }
  } catch (_) {
    // Best effort
  }
}

/**
 * Initialize GPU keep-alive when canvas is ready
 */
export function initializeGpuKeepAlive() {
  // Start when canvas is ready
  if (canvas?.ready) {
    startKeepAlive();
  }

  // Hook into canvas lifecycle
  Hooks.on('canvasReady', () => {
    startKeepAlive();
  });

  Hooks.on('canvasTearDown', () => {
    stopKeepAlive();
  });

  // Hook into canvas panning to ensure GPU is active
  Hooks.on('canvasPan', () => {
    warmupGpuForPanning();
  });

  // Hook into mouse events on canvas to warm up GPU before panning starts
  // This is critical - we warm up GPU right before panning begins
  let mouseDownHandler = null;

  const setupMouseHandlers = () => {
    const canvasElement = canvas?.app?.canvas;
    if (!canvasElement || mouseDownHandler) return;

    mouseDownHandler = () => {
      // Warm up GPU when user starts interacting with canvas
      // This happens before panning starts, giving GPU time to wake up
      warmupGpuForPanning();
    };

    canvasElement.addEventListener('mousedown', mouseDownHandler, { passive: true });
    canvasElement.addEventListener('touchstart', mouseDownHandler, { passive: true });
  };

  // Setup handlers when canvas is ready
  if (canvas?.ready && canvas?.app?.canvas) {
    setupMouseHandlers();
  }

  // Re-setup handlers when canvas becomes ready
  Hooks.on('canvasReady', () => {
    setupMouseHandlers();
  });

  // Cleanup on teardown
  Hooks.on('canvasTearDown', () => {
    const canvasElement = canvas?.app?.canvas;
    if (mouseDownHandler && canvasElement) {
      canvasElement.removeEventListener('mousedown', mouseDownHandler);
      canvasElement.removeEventListener('touchstart', mouseDownHandler);
      mouseDownHandler = null;
    }
  });

  // Also handle visibility change (tab switching)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      // Pause when tab is hidden to save resources
      stopKeepAlive();
    } else if (canvas?.ready) {
      // Resume when tab becomes visible
      startKeepAlive();
    }
  });
}

/**
 * Manually start keep-alive (for testing/debugging)
 */
export function start() {
  startKeepAlive();
}

/**
 * Manually stop keep-alive (for testing/debugging)
 */
export function stop() {
  stopKeepAlive();
}
