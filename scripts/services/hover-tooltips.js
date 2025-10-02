/**
 * Hover tooltips for token visibility states
 */

import { COVER_STATES, MODULE_ID, VISIBILITY_STATES } from '../constants.js';
import autoCoverSystem from '../cover/auto-cover/AutoCoverSystem.js';
import { canShowTooltips, computeSizesFromSetting } from '../helpers/tooltip-utils.js';
import { getCoverMap, getVisibilityMap } from '../utils.js';

/**
 * Lightweight service wrapper for lifecycle control.
 * Keeps existing functional API intact for compatibility.
 */
class HoverTooltipsImpl {
  constructor() {
    this._initialized = false;
    this.currentHoveredToken = null;
    this.visibilityIndicators = new Map();
    this.coverIndicators = new Map();
    this.tokenEventHandlers = new Map();
    this.tooltipMode = 'target';
    this.isShowingKeyTooltips = false;
    this.keyTooltipTokens = new Set();
    this.tooltipFontSize = 16;
    this.tooltipIconSize = 14;
    this.badgeTicker = null;
    this._isTokenMoving = false;
    this._movementDebounceTimer = null;
    this._isDragging = false;
  }
  init() {
    if (this._initialized) return this.refreshSizes();
    initializeHoverTooltips();
    this._initialized = true;
  }
  dispose() {
    cleanupHoverTooltips();
    this._initialized = false;
  }
  setMode(mode) {
    setTooltipMode(mode);
  }
  refreshSizes() {
    try {
      const raw = game.settings?.get?.(MODULE_ID, 'tooltipFontSize');
      const { fontPx, iconPx, borderPx } = computeSizesFromSetting(raw ?? this.tooltipFontSize);
      this.tooltipFontSize = fontPx;
      this.tooltipIconSize = iconPx;

      // Invalidate HUD cache when sizes change
      delete this._hudActiveCache;

      document.documentElement.style.setProperty(
        '--pf2e-visioner-tooltip-font-size',
        `${fontPx}px`,
      );
      document.documentElement.style.setProperty(
        '--pf2e-visioner-tooltip-icon-size',
        `${iconPx}px`,
      );
      document.documentElement.style.setProperty(
        '--pf2e-visioner-tooltip-badge-border',
        `${borderPx}px`,
      );
      // Compute and expose badge box dimensions as CSS variables (used by CSS-only badge styling)
      const badgeWidth = Math.round(iconPx + borderPx * 2 + 8);
      const badgeHeight = Math.round(iconPx + borderPx * 2 + 6);
      const borderRadius = Math.round(badgeHeight / 3);
      document.documentElement.style.setProperty(
        '--pf2e-visioner-tooltip-badge-width',
        `${badgeWidth}px`,
      );
      document.documentElement.style.setProperty(
        '--pf2e-visioner-tooltip-badge-height',
        `${badgeHeight}px`,
      );
      document.documentElement.style.setProperty(
        '--pf2e-visioner-tooltip-badge-radius',
        `${borderRadius}px`,
      );
    } catch (_) { }
  }
}
export const HoverTooltips = new HoverTooltipsImpl();

// Backwards-compatible alias
export const HoverTooltipsService = HoverTooltips;

let keyTooltipTokens = new Set(); // Track tokens showing key-based tooltips
// Initialize with default, will try to get from settings when available
let tooltipFontSize = 16;
let tooltipIconSize = 14; // Default icon size
let _initialized = false; // Prevent double-binding

// size computation moved to helpers/tooltip-utils.js

/**
 * Check if tooltips are allowed for the current user and token
 * @param {string} [mode='target'] - The tooltip mode to check ('target' or 'observer')
 * @param {Token} [hoveredToken=null] - The token being hovered (optional)
 * @returns {boolean} True if tooltips should be shown
 */
// permissions moved to helpers/tooltip-utils.js

/**
 * Set the tooltip mode
 * @param {string} mode - 'target' (default - how others see hovered token) or 'observer' (O key - how hovered token sees others)
 */
export function setTooltipMode(mode) {
  if (mode !== 'observer' && mode !== 'target') {
    console.warn('PF2E Visioner: Invalid tooltip mode:', mode);
    return;
  }

  const previousMode = HoverTooltips.tooltipMode;
  HoverTooltips.tooltipMode = mode;

  // When switching from observer to target mode (key up), clean up all indicators first
  if (previousMode === 'observer' && mode === 'target') {
    // Full cleanup to prevent lingering Alt badges
    hideAllVisibilityIndicators();
    hideAllCoverIndicators();
    // Reset Alt state
    HoverTooltips.isShowingKeyTooltips = false;
    HoverTooltips.keyTooltipTokens.clear();
    // Small defer then re-render clean target-mode indicators if still hovering
    if (HoverTooltips.currentHoveredToken) {
      setTimeout(() => {
        showVisibilityIndicators(HoverTooltips.currentHoveredToken);
      }, 50);
    }
    return;
  }

  // If we have a currently hovered token, refresh the indicators
  if (HoverTooltips.currentHoveredToken)
    showVisibilityIndicators(HoverTooltips.currentHoveredToken);

  // For observer mode, also check if we need to show indicators for controlled tokens
  if (
    mode === 'observer' &&
    !HoverTooltips.currentHoveredToken &&
    canvas.tokens.controlled.length > 0
  ) {
    // If we're in observer mode with no hovered token but have controlled tokens,
    // show indicators for the first controlled token
    showVisibilityIndicatorsForToken(canvas.tokens.controlled[0], 'observer');
  }
}

/**
 * Add event listeners to all current tokens
 */
function addTokenEventListeners() {
  if (!canvas?.tokens?.placeables) {
    return;
  }
  canvas.tokens.placeables.forEach((token) => {
    addTokenEventListener(token);
  });
}

/**
 * Add event listener to a specific token
 * @param {Token} token - The token to add listeners to
 */
export function addTokenEventListener(token) {
  // Skip if already has listeners
  if (HoverTooltips.tokenEventHandlers.has(token.id)) {
    return;
  }

  const overHandler = () => onTokenHover(token);
  const outHandler = () => onTokenHoverEnd(token);
  const pointerDownHandler = () => onTokenPointerDown(token);
  const pointerUpHandler = () => onTokenPointerUp(token);

  // Store handlers for later cleanup
  HoverTooltips.tokenEventHandlers.set(token.id, {
    overHandler,
    outHandler,
    pointerDownHandler,
    pointerUpHandler
  });

  token.on('pointerover', overHandler);
  token.on('pointerout', outHandler);

  // Listen for pointer down/up to detect drag operations
  token.on('pointerdown', pointerDownHandler);
  token.on('pointerup', pointerUpHandler);
  token.on('pointerupoutside', pointerUpHandler); // In case pointer is released outside token
}

/**
 * Clean up token event listeners
 */
function cleanupTokenEventListeners() {
  HoverTooltips.tokenEventHandlers.forEach((handlers, tokenId) => {
    const token = canvas.tokens?.get?.(tokenId);
    if (token) {
      try {
        token.off('pointerover', handlers.overHandler);
        token.off('pointerout', handlers.outHandler);
        if (handlers.pointerDownHandler) {
          token.off('pointerdown', handlers.pointerDownHandler);
        }
        if (handlers.pointerUpHandler) {
          token.off('pointerup', handlers.pointerUpHandler);
          token.off('pointerupoutside', handlers.pointerUpHandler);
        }
      } catch (e) {
        console.warn('PF2E Visioner: Error removing token event listeners', e);
      }
    }
  });
  HoverTooltips.tokenEventHandlers.clear();
}

/**
 * Initialize hover tooltip system
 */
export function initializeHoverTooltips() {
  if (HoverTooltips._initialized || _initialized) {
    // Scene change: clean up old listeners and reinitialize for new tokens
    cleanupTokenEventListeners();
    addTokenEventListeners();
    HoverTooltips.refreshSizes?.();
    // Ensure both flags are set for consistency
    HoverTooltips._initialized = true;
    _initialized = true;
    return;
  }
  // Always initialize the tooltip system for keyboard shortcuts (Alt/O)
  // Hover behavior will be conditionally enabled based on settings

  // Set the CSS variable for tooltip font size
  try {
    const raw = game.settings?.get?.(MODULE_ID, 'tooltipFontSize');
    const { fontPx, iconPx, borderPx } = computeSizesFromSetting(
      raw ?? HoverTooltips.tooltipFontSize,
    );
    HoverTooltips.tooltipFontSize = fontPx;
    HoverTooltips.tooltipIconSize = iconPx;
    document.documentElement.style.setProperty('--pf2e-visioner-tooltip-font-size', `${fontPx}px`);
    document.documentElement.style.setProperty('--pf2e-visioner-tooltip-icon-size', `${iconPx}px`);
    document.documentElement.style.setProperty(
      '--pf2e-visioner-tooltip-badge-border',
      `${borderPx}px`,
    );
  } catch (e) {
    console.warn('PF2E Visioner: Error setting tooltip font size CSS variable', e);
    document.documentElement.style.setProperty('--pf2e-visioner-tooltip-font-size', '16px');
    document.documentElement.style.setProperty('--pf2e-visioner-tooltip-icon-size', '14px');
    document.documentElement.style.setProperty('--pf2e-visioner-tooltip-badge-border', '2px');
  }

  // Add event listeners to canvas for token hover
  addTokenEventListeners();

  // Handle canvas pan: hide tooltips during pan, show after
  let panTimeout = null;
  Hooks.on('canvasPan', () => {
    // Hide tooltips immediately when pan starts
    if (!HoverTooltips._isPanning) {
      HoverTooltips._isPanning = true;
      HoverTooltips._savedHoveredToken = HoverTooltips.currentHoveredToken;
      HoverTooltips._savedKeyTooltipsActive = HoverTooltips.isShowingKeyTooltips;
      hideAllVisibilityIndicators();
      hideAllCoverIndicators();
    }

    // Clear any existing timeout
    if (panTimeout) clearTimeout(panTimeout);

    // Set timeout to restore tooltips after pan stops
    panTimeout = setTimeout(() => {
      HoverTooltips._isPanning = false;

      // Restore tooltips based on what was showing before
      if (HoverTooltips._savedKeyTooltipsActive) {
        // Restore Alt/O overlay
        if (HoverTooltips.tooltipMode === 'observer') {
          showControlledTokenVisibilityObserver();
        } else {
          showControlledTokenVisibility();
        }
      } else if (HoverTooltips._savedHoveredToken) {
        // Restore hover tooltips
        const token = HoverTooltips._savedHoveredToken;
        HoverTooltips.currentHoveredToken = token;
        showVisibilityIndicators(token);
      }

      // Clean up saved state
      delete HoverTooltips._savedHoveredToken;
      delete HoverTooltips._savedKeyTooltipsActive;
      panTimeout = null;
    }, 150); // 150ms after pan stops
  });

  // Refresh badges when visibility map changes (debounced to avoid performance issues during rapid updates)
  try {
    let visibilityUpdateDebounce = null;
    Hooks.on('pf2e-visioner.visibilityMapUpdated', () => {
      // Skip updates entirely during active token movement to prevent performance issues
      if (HoverTooltips._isTokenMoving) {
        return;
      }

      // Clear any pending update
      if (visibilityUpdateDebounce) {
        clearTimeout(visibilityUpdateDebounce);
      }

      // Debounce tooltip updates during rapid visibility changes (e.g., token movement)
      // This prevents constant re-rendering during AVS batch processing
      visibilityUpdateDebounce = setTimeout(() => {
        visibilityUpdateDebounce = null;

        // If Alt overlay is active, re-render it; otherwise refresh current hover
        if (HoverTooltips.isShowingKeyTooltips) {
          // Rebuild Alt overlay for controlled tokens
          hideAllVisibilityIndicators();
          hideAllCoverIndicators();
          setTimeout(() => {
            showControlledTokenVisibility();
          }, 0);
        } else if (HoverTooltips.currentHoveredToken) {
          // Re-render indicators for the currently hovered token
          const tok = HoverTooltips.currentHoveredToken;
          hideAllVisibilityIndicators();
          hideAllCoverIndicators();
          setTimeout(() => {
            showVisibilityIndicators(tok);
            try {
              showCoverIndicators(tok);
            } catch (_) { }
          }, 0);
        }
      }, 150); // 150ms debounce - batch multiple rapid updates
    });
  } catch (_) { }

  // Detect token movement and pause tooltip updates during movement
  // This prevents tooltips from consuming CPU during drag operations
  Hooks.on('preUpdateToken', (tokenDoc, changes, options, userId) => {
    // Check if this is a position or animation change
    if (changes.x !== undefined || changes.y !== undefined || changes.rotation !== undefined) {
      // Mark movement as active
      HoverTooltips._isTokenMoving = true;

      // Clear any existing debounce timer
      if (HoverTooltips._movementDebounceTimer) {
        clearTimeout(HoverTooltips._movementDebounceTimer);
      }

      // Set a timer to mark movement as complete after updates stop
      HoverTooltips._movementDebounceTimer = setTimeout(() => {
        HoverTooltips._isTokenMoving = false;
        HoverTooltips._movementDebounceTimer = null;

        // Refresh tooltips after movement completes
        if (HoverTooltips.currentHoveredToken) {
          const tok = HoverTooltips.currentHoveredToken;
          hideAllVisibilityIndicators();
          hideAllCoverIndicators();
          setTimeout(() => {
            showVisibilityIndicators(tok);
            try {
              showCoverIndicators(tok);
            } catch (_) { }
          }, 0);
        } else if (HoverTooltips.isShowingKeyTooltips) {
          hideAllVisibilityIndicators();
          hideAllCoverIndicators();
          setTimeout(() => {
            showControlledTokenVisibility();
          }, 0);
        }
      }, 200); // Wait 200ms after last movement update before refreshing
    }
  });

  // Note: Alt key handled via highlightObjects hook registered in main hooks
  // O key event listeners added globally in registerHooks

  // Mark as initialized
  _initialized = true;
  HoverTooltips._initialized = true;
}

/**
 * Handle token hover start
 * @param {Token} hoveredToken - The token being hovered
 */
function onTokenHover(hoveredToken) {
  // Skip if currently panning, during active token movement, or during drag
  if (HoverTooltips._isPanning || HoverTooltips._isTokenMoving || HoverTooltips._isDragging) return;

  // Only show hover tooltips if allowed for this user with current mode AND token
  // Suppress hover overlays entirely while Alt overlay is active
  if (HoverTooltips.isShowingKeyTooltips) return;
  if (!canShowTooltips(HoverTooltips.tooltipMode, hoveredToken)) {
    return;
  }

  if (HoverTooltips.currentHoveredToken === hoveredToken) {
    return;
  }

  // Debounce rapid hover changes to prevent PIXI churn
  if (HoverTooltips._hoverDebounceTimer) {
    clearTimeout(HoverTooltips._hoverDebounceTimer);
  }

  HoverTooltips._hoverDebounceTimer = setTimeout(() => {
    HoverTooltips.currentHoveredToken = hoveredToken;
    showVisibilityIndicators(hoveredToken);
    delete HoverTooltips._hoverDebounceTimer;
  }, 50); // 50ms debounce - fast enough to feel instant, slow enough to skip intermediate hovers
}

/**
 * Handle token hover end
 * @param {Token} token - The token that was hovered
 */
function onTokenHoverEnd(token) {
  // Clear any pending hover debounce
  if (HoverTooltips._hoverDebounceTimer) {
    clearTimeout(HoverTooltips._hoverDebounceTimer);
    delete HoverTooltips._hoverDebounceTimer;
  }

  if (HoverTooltips.currentHoveredToken === token) {
    HoverTooltips.currentHoveredToken = null;
    hideAllVisibilityIndicators();
    hideAllCoverIndicators();
  }
}

/**
 * Handle token pointer down (potential drag start)
 * @param {Token} token - The token being clicked
 */
function onTokenPointerDown(token) {
  // Mark as potentially dragging to prevent tooltips
  HoverTooltips._isDragging = true;

  // Hide any visible tooltips immediately
  hideAllVisibilityIndicators();
  hideAllCoverIndicators();
  HoverTooltips.currentHoveredToken = null;
}

/**
 * Handle token pointer up (drag end)
 * @param {Token} token - The token that was released
 */
function onTokenPointerUp(token) {
  // Small delay before clearing drag flag to prevent tooltips appearing immediately
  setTimeout(() => {
    HoverTooltips._isDragging = false;
  }, 150);
}

/**
 * Handle highlightObjects hook (triggered by Alt key)
 * @param {boolean} highlight - Whether objects should be highlighted
 */
export function onHighlightObjects(highlight) {
  // Alt-key tooltips should work regardless of hover tooltip settings
  const canShow = canShowTooltips('target', null, true); // isKeyboardTooltip=true

  if (!canShow) {
    console.warn(`[${MODULE_ID}] Alt-key tooltips blocked by permissions`);
    return;
  }

  if (highlight) {
    // Guard: if already in Alt overlay, don't layer another
    if (HoverTooltips.isShowingKeyTooltips) {
      return;
    }
    // Alt always shows target-mode overlay from controlled token(s)
    showControlledTokenVisibility();
  } else {
    // Alt released: fully reset Alt state and clean badges
    HoverTooltips.isShowingKeyTooltips = false;
    HoverTooltips.keyTooltipTokens.clear();
    hideAllVisibilityIndicators();
    hideAllCoverIndicators();
    // Restore clean hover indicators if still hovering
    if (HoverTooltips.currentHoveredToken) {
      setTimeout(() => {
        showVisibilityIndicators(HoverTooltips.currentHoveredToken);
        try {
          showCoverIndicators(HoverTooltips.currentHoveredToken);
        } catch (_) { }
      }, 50);
    }
  }
}

/**
 * Show visibility indicators on other tokens
 * @param {Token} hoveredToken - The token being hovered
 */
function showVisibilityIndicators(hoveredToken) {
  // Check if tooltips are allowed for the current mode and token
  // Suppress hover overlays entirely while Alt overlay is active, UNLESS this is a keyboard context
  if (HoverTooltips.isShowingKeyTooltips && !HoverTooltips._keyboardContext) return;

  // Check if this is a keyboard-triggered call
  const isKeyboardTooltip = !!HoverTooltips._keyboardContext;
  const tooltipsAllowed = canShowTooltips(
    HoverTooltips.tooltipMode,
    hoveredToken,
    isKeyboardTooltip,
  );

  if (!tooltipsAllowed) {
    return;
  }

  // Clear any existing indicators, unless Alt overlay is active (handled separately)
  if (!HoverTooltips.isShowingKeyTooltips) {
    hideAllVisibilityIndicators();
    hideAllCoverIndicators();
  }

  // Get all other tokens in the scene
  const otherTokens = canvas.tokens.placeables.filter((t) => t !== hoveredToken && t.isVisible);

  if (otherTokens.length === 0) {
    return;
  }

  if (HoverTooltips.tooltipMode === 'observer') {
    // Observer mode (O key): Show how the hovered token sees others
    // For players, only allow if they control the hovered token
    if (!game.user.isGM && !hoveredToken.isOwner) {
      return;
    }

    otherTokens.forEach((targetToken) => {
      const visibilityMap = getVisibilityMap(hoveredToken);
      let visibilityState = visibilityMap[targetToken.document.id] || 'observed';
      // Never show 'avs' in tooltips - it's a control mechanism, not a visibility state
      if (visibilityState === 'avs') visibilityState = 'observed';

      if (visibilityState !== 'observed') {
        // Pass relation token (targetToken) to compute cover vs hoveredToken
        addVisibilityIndicator(targetToken, hoveredToken, visibilityState, 'observer', targetToken);
      }
    });
  } else {
    // Target mode (default): Show how others see the hovered token
    // For players, only show visibility from other tokens' perspective
    if (!game.user.isGM) {
      // For players hovering over their own token, we need to show how OTHER tokens see it
      if (hoveredToken.isOwner) {
        // Get all other tokens in the scene (not just controlled ones)
        const nonPlayerTokens = canvas.tokens.placeables.filter(
          (t) => t !== hoveredToken && t.isVisible,
        );

        // Show how each other token sees the player's token
        nonPlayerTokens.forEach((otherToken) => {
          const visibilityMap = getVisibilityMap(otherToken);
          let visibilityState = visibilityMap[hoveredToken.document.id] || 'observed';
          // Never show 'avs' in tooltips - it's a control mechanism, not a visibility state
          if (visibilityState === 'avs') visibilityState = 'observed';

          if (visibilityState !== 'observed') {
            // Show indicator on the OTHER token to show how it sees the player's token
            addVisibilityIndicator(otherToken, otherToken, visibilityState, 'target', hoveredToken);
          }
        });
      }
    } else {
      // GM sees all perspectives

      otherTokens.forEach((observerToken) => {
        const visibilityMap = getVisibilityMap(observerToken);
        let visibilityState = visibilityMap[hoveredToken?.document?.id] || 'observed';
        // Never show 'avs' in tooltips - it's a control mechanism, not a visibility state
        if (visibilityState === 'avs') visibilityState = 'observed';

        if (visibilityState !== 'observed') {
          // Show indicator on the observer token
          addVisibilityIndicator(
            observerToken,
            observerToken,
            visibilityState,
            'target',
            hoveredToken,
          );
        }
      });
    }
  }

  // Additionally render cover-only indicators when there is cover but no visibility change
  // Already suppressed above if Alt overlay is active
  try {
    showCoverIndicators(hoveredToken);
  } catch (_) { }
}

/**
 * Show cover indicators on other tokens
 * @param {Token} hoveredToken - The token being hovered
 */
function showCoverIndicators(hoveredToken) {
  // Suppress hover overlays entirely while Alt overlay is active, UNLESS this is a keyboard context
  if (HoverTooltips.isShowingKeyTooltips && !HoverTooltips._keyboardContext) return;

  // Check if this is a keyboard-triggered call
  const isKeyboardTooltip = !!HoverTooltips._keyboardContext;
  const tooltipsAllowed = canShowTooltips(
    HoverTooltips.tooltipMode,
    hoveredToken,
    isKeyboardTooltip,
  );
  if (!tooltipsAllowed) return;

  hideAllCoverIndicators();

  const otherTokens = canvas.tokens.placeables.filter((t) => t !== hoveredToken && t.isVisible);
  if (otherTokens.length === 0) return;

  if (HoverTooltips.tooltipMode === 'observer') {
    // How hoveredToken sees others (cover from hoveredToken's perspective)
    if (!game.user.isGM && !hoveredToken.isOwner) return;
    otherTokens.forEach((targetToken) => {
      // Skip duplicate if visibility badge already carries cover
      const visInd = HoverTooltips.visibilityIndicators.get(targetToken.id);
      if (visInd && visInd._coverBadgeEl) return;
      const coverMap = getCoverMap(hoveredToken);
      const coverState = coverMap[targetToken.document.id] || 'none';
      if (coverState !== 'none') {
        addCoverIndicator(targetToken, hoveredToken, coverState, 'observer');
      }
    });
  } else {
    // Target mode: How others see the hovered token (cover others have against hovered)
    if (!game.user.isGM) {
      if (hoveredToken.isOwner) {
        const nonPlayerTokens = canvas.tokens.placeables.filter(
          (t) => t !== hoveredToken && t.isVisible,
        );
        nonPlayerTokens.forEach((otherToken) => {
          const visInd = HoverTooltips.visibilityIndicators.get(otherToken.id);
          if (visInd && visInd._coverBadgeEl) return;
          const coverMap = getCoverMap(otherToken);
          const coverState = coverMap[hoveredToken.document.id] || 'none';
          if (coverState !== 'none') {
            addCoverIndicator(otherToken, otherToken, coverState, 'target');
          }
        });
      }
    } else {
      otherTokens.forEach((observerToken) => {
        const visInd = HoverTooltips.visibilityIndicators.get(observerToken.id);
        if (visInd && visInd._coverBadgeEl) return;
        const coverMap = getCoverMap(observerToken);
        const coverState = coverMap[hoveredToken.document.id] || 'none';
        if (coverState !== 'none') {
          addCoverIndicator(observerToken, observerToken, coverState, 'target');
        }
      });
    }
  }
}

/**
 * Show visibility indicators for a specific token (without clearing existing ones)
 * @param {Token} observerToken - The token to show visibility indicators for
 * @param {string} forceMode - Optional mode to force ('observer' or 'target'), defaults to current tooltipMode
 */
function showVisibilityIndicatorsForToken(observerToken, forceMode = null) {
  // Use forced mode if provided, otherwise use current tooltipMode
  const effectiveMode = forceMode || HoverTooltips.tooltipMode;

  // Check if tooltips are allowed for the current mode
  // For keyboard scenarios (when forceMode is provided), this is a keyboard tooltip
  const isKeyboardTooltip = !!forceMode;
  if (!canShowTooltips(effectiveMode, null, isKeyboardTooltip)) {
    return;
  }

  // For players, only allow if they control the observer token
  if (!game.user.isGM && !observerToken.isOwner) {
    return;
  }

  // Get all other tokens in the scene
  const otherTokens = canvas.tokens.placeables.filter((t) => t !== observerToken && t.isVisible);
  if (otherTokens.length === 0) return;

  if (effectiveMode === 'observer') {
    // Default mode: Show how the observer token sees others
    otherTokens.forEach((targetToken) => {
      const visibilityMap = getVisibilityMap(observerToken);
      let visibilityState = visibilityMap[targetToken.document.id] || 'observed';
      // Never show 'avs' in tooltips - it's a control mechanism, not a visibility state
      if (visibilityState === 'avs') visibilityState = 'observed';

      if (visibilityState !== 'observed') {
        addVisibilityIndicator(
          targetToken,
          observerToken,
          visibilityState,
          'observer',
          targetToken,
        );
      }
    });
  } else {
    // Target mode: Show how others see the observer token
    // For players, only show visibility from other tokens' perspective
    if (!game.user.isGM) {
      // Get all other tokens in the scene
      const otherTokensForPlayer = canvas.tokens.placeables.filter(
        (t) => t !== observerToken && t.isVisible,
      );

      otherTokensForPlayer.forEach((otherToken) => {
        const visibilityMap = getVisibilityMap(otherToken);
        let visibilityState = visibilityMap[observerToken.document.id] || 'observed';
        // Never show 'avs' in tooltips - it's a control mechanism, not a visibility state
        if (visibilityState === 'avs') visibilityState = 'observed';

        if (visibilityState !== 'observed') {
          // Show indicator on the OTHER token
          addVisibilityIndicator(otherToken, otherToken, visibilityState, 'target', observerToken);
        }
      });
    } else {
      // GM sees all perspectives
      otherTokens.forEach((otherToken) => {
        const visibilityMap = getVisibilityMap(otherToken);
        let visibilityState = visibilityMap[observerToken.document.id] || 'observed';
        // Never show 'avs' in tooltips - it's a control mechanism, not a visibility state
        if (visibilityState === 'avs') visibilityState = 'observed';

        if (visibilityState !== 'observed') {
          // Show indicator on the OTHER token
          addVisibilityIndicator(otherToken, otherToken, visibilityState, 'target', observerToken);
        }
      });
    }
  }
}

/**
 * Compute auto-cover fresh (ignoring stored maps) and render cover-only badges above targets.
 * Does not affect any visibility states.
 * @param {Token} sourceToken - The token acting as the attacker/source
 */
export function showAutoCoverComputedOverlay(sourceToken) {
  try {
    if (!sourceToken) return;
    hideAllCoverIndicators();
    const others = (canvas.tokens?.placeables || []).filter(
      (t) => t && t !== sourceToken && t.isVisible,
    );
    for (const target of others) {
      let state = 'none';
      try {
        state = autoCoverSystem.detectCoverBetweenTokens(sourceToken, target) || 'none';
      } catch (_) {
        state = 'none';
      }
      if (state && state !== 'none') {
        addCoverIndicator(target, sourceToken, state, 'target');
      }
    }
  } catch (_) { }
}

export function hideAutoCoverComputedOverlay() {
  hideAllCoverIndicators();
}

/**
 * Show visibility indicators for controlled tokens (simulates hovering over controlled tokens)
 * Uses target mode - how others see the controlled tokens
 */
export function showControlledTokenVisibility() {
  if (HoverTooltips.isShowingKeyTooltips) {
    return;
  }
  const controlledTokens = canvas.tokens.controlled;
  HoverTooltips.isShowingKeyTooltips = true;
  HoverTooltips.keyTooltipTokens.clear();
  // Ensure any hover overlays are cleared before rendering Alt overlay
  hideAllVisibilityIndicators();
  hideAllCoverIndicators();

  // Clear any existing indicators first
  hideAllVisibilityIndicators();
  hideAllCoverIndicators();

  // For each controlled token, show indicators as if hovering over it
  controlledTokens.forEach((controlledToken) => {
    HoverTooltips.keyTooltipTokens.add(controlledToken.id);

    // Temporarily set tooltip mode and add keyboard context flag
    const originalMode = HoverTooltips.tooltipMode;

    HoverTooltips.tooltipMode = 'target';
    HoverTooltips._keyboardContext = true; // Flag to indicate this is keyboard-triggered

    // Use normal hover functions (which auto-combine visibility and cover)
    showVisibilityIndicators(controlledToken);

    // Restore original state
    HoverTooltips.tooltipMode = originalMode;
    delete HoverTooltips._keyboardContext;
  });

  HoverTooltips._initialized = true;
}

/**
 * Show visibility indicators for controlled tokens in observer mode
 * Uses observer mode - how controlled tokens see others
 */
export function showControlledTokenVisibilityObserver() {
  if (HoverTooltips.isShowingKeyTooltips) return;

  const controlledTokens = canvas.tokens.controlled;
  // Fallback: if no controlled token, use the currently hovered token as the observer
  const tokensToUse =
    controlledTokens.length > 0
      ? controlledTokens
      : HoverTooltips.currentHoveredToken
        ? [HoverTooltips.currentHoveredToken]
        : [];

  HoverTooltips.isShowingKeyTooltips = true;
  HoverTooltips.keyTooltipTokens.clear();
  // Ensure any hover overlays are cleared before rendering Alt overlay
  hideAllVisibilityIndicators();
  hideAllCoverIndicators();

  // Clear any existing indicators first
  hideAllVisibilityIndicators();
  hideAllCoverIndicators();

  // For each chosen token, show indicators as if hovering over it
  tokensToUse.forEach((controlledToken) => {
    HoverTooltips.keyTooltipTokens.add(controlledToken.id);

    // Temporarily set tooltip mode and add keyboard context flag
    const originalMode = HoverTooltips.tooltipMode;

    HoverTooltips.tooltipMode = 'observer';
    HoverTooltips._keyboardContext = true; // Flag to indicate this is keyboard-triggered

    // Use normal hover functions (which auto-combine visibility and cover)
    showVisibilityIndicators(controlledToken);

    // Restore original state
    HoverTooltips.tooltipMode = originalMode;
    delete HoverTooltips._keyboardContext;
  });
}

/**
 * Add a visibility indicator to a token
 * @param {Token} targetToken - The token to show the indicator on
 * @param {Token} observerToken - The token that has the visibility perspective
 * @param {string} visibilityState - The visibility state
 * @param {string} mode - 'observer' or 'target' mode
 */
function addVisibilityIndicator(
  targetToken,
  observerToken,
  visibilityState,
  mode = 'observer',
  relationToken = null,
) {
  const config = VISIBILITY_STATES[visibilityState];
  if (!config) return;

  // Create an anchor container at the token center-top to compute transformed bounds
  const indicator = new PIXI.Container();
  const tokenWidth = targetToken.document.width * canvas.grid.size;
  indicator.x = targetToken.x + tokenWidth / 2;
  indicator.y = targetToken.y - 8; // slight padding above the token
  canvas.tokens.addChild(indicator);

  const canvasRect = canvas.app.view.getBoundingClientRect();
  // Compute dynamic badge dimensions based on configured sizes
  let sizeConfig;
  try {
    const raw = game.settings?.get?.(MODULE_ID, 'tooltipFontSize');
    sizeConfig = computeSizesFromSetting(raw ?? HoverTooltips.tooltipFontSize);
  } catch (_) {
    sizeConfig = {
      fontPx: tooltipFontSize,
      iconPx: tooltipIconSize,
      borderPx: 3,
    };
  }
  const badgeWidth = Math.round(sizeConfig.iconPx + sizeConfig.borderPx * 2 + 8);
  const badgeHeight = Math.round(sizeConfig.iconPx + sizeConfig.borderPx * 2 + 6);
  const spacing = Math.max(6, Math.round(sizeConfig.iconPx / 2));
  const borderRadius = Math.round(badgeHeight / 3);

  // Determine if cover applies
  let coverConfig = null;
  try {
    if (relationToken) {
      const coverMapSource = mode === 'observer' ? observerToken : targetToken;
      const coverMap = getCoverMap(coverMapSource);
      const coverState = coverMap[relationToken.document.id] || 'none';
      if (coverState !== 'none') coverConfig = COVER_STATES[coverState];
    }
  } catch (_) { }

  // Compute aligned positions using world->screen transform
  const globalPoint = canvas.tokens.toGlobal(new PIXI.Point(indicator.x, indicator.y));
  const centerX = canvasRect.left + globalPoint.x;
  // If pf2e-hud is active, nudge badges downward to sit beneath its tooltip bubble
  const hudActive = !!game.modules?.get?.('pf2e-hud')?.active;
  const verticalOffset = hudActive ? 26 : -6; // nudge up slightly when HUD is not active
  const centerY = canvasRect.top + globalPoint.y - badgeHeight / 2 + verticalOffset;

  const placeBadge = (leftPx, topPx, stateClass, iconClass, kind) => {
    const el = document.createElement('div');
    el.style.position = 'fixed';
    el.style.pointerEvents = 'none';
    el.style.zIndex = '60';
    // Use transform for GPU acceleration - set left/top to 0 and use translate
    el.style.left = '0';
    el.style.top = '0';
    el.style.transform = `translate(${Math.round(leftPx)}px, ${Math.round(topPx)}px)`;
    el.style.willChange = 'transform'; // Hint to browser for GPU layer
    el.innerHTML = `<span class="pf2e-visioner-tooltip-badge ${kind === 'cover' ? `cover-${stateClass}` : `visibility-${stateClass}`}" style="--pf2e-visioner-tooltip-badge-width: ${badgeWidth}px; --pf2e-visioner-tooltip-badge-height: ${badgeHeight}px; --pf2e-visioner-tooltip-badge-radius: ${borderRadius}px;">
      <i class="${iconClass}"></i>
    </span>`;
    document.body.appendChild(el);
    return el;
  };

  if (coverConfig) {
    // Two badges: visibility on left, cover on right
    const visLeft = centerX - spacing / 2 - badgeWidth;
    const coverLeft = centerX + spacing / 2;
    indicator._visBadgeEl = placeBadge(
      visLeft,
      centerY,
      visibilityState,
      config.icon,
      'visibility',
    );
    // Recompute cover state name for class
    let coverStateName = 'none';
    try {
      if (relationToken) {
        const coverMapSource = mode === 'observer' ? observerToken : targetToken;
        const coverMap = getCoverMap(coverMapSource);
        coverStateName = coverMap[relationToken.document.id] || 'none';
      }
    } catch (_) { }
    indicator._coverBadgeEl = placeBadge(
      coverLeft,
      centerY,
      coverStateName,
      coverConfig.icon,
      'cover',
    );
  } else {
    // Only visibility badge, centered
    const visLeft = centerX - badgeWidth / 2;
    indicator._visBadgeEl = placeBadge(
      visLeft,
      centerY,
      visibilityState,
      config.icon,
      'visibility',
    );
  }

  HoverTooltips.visibilityIndicators.set(targetToken.id, indicator);

  // Ensure ticker updates DOM badge positions during pan/zoom
  ensureBadgeTicker();
}

function ensureBadgeTicker() {
  if (HoverTooltips.badgeTicker) return;

  // Invalidate canvas rect cache when ticker starts (viewport may have changed)
  HoverTooltips._canvasRectInvalidated = true;

  // Track canvas transform to detect when movement stops
  let lastTransform = null;
  let framesStatic = 0;
  const STATIC_THRESHOLD = 3; // Stop ticker after 3 frames of no movement

  // Time-based throttle to reduce updates during rapid movement
  let lastUpdateTime = 0;
  const UPDATE_THROTTLE_MS = 16; // ~60fps max (one frame at 60fps = 16.67ms)

  HoverTooltips.badgeTicker = () => {
    try {
      const now = performance.now();

      // Throttle updates based on time, not just frame count
      // This prevents excessive updates during rapid canvas changes
      if (now - lastUpdateTime < UPDATE_THROTTLE_MS) {
        return;
      }

      // Check if canvas transform has changed
      const currentTransform = `${canvas.stage.pivot.x},${canvas.stage.pivot.y},${canvas.stage.scale.x}`;

      if (currentTransform === lastTransform) {
        framesStatic++;

        // If canvas hasn't moved for several frames, stop ticker to save CPU
        if (framesStatic > STATIC_THRESHOLD) {
          // Do one final update then pause
          updateBadgePositions();
          lastUpdateTime = now;

          // Remove ticker - will be re-added on next pan/zoom
          canvas.app?.ticker?.remove?.(HoverTooltips.badgeTicker);
          HoverTooltips.badgeTicker = null;
          return;
        }
      } else {
        framesStatic = 0;
        lastTransform = currentTransform;
        HoverTooltips._canvasRectInvalidated = true; // Viewport changed
      }

      updateBadgePositions();
      lastUpdateTime = now;
    } catch (_) { }
  };

  try {
    canvas.app.ticker.add(HoverTooltips.badgeTicker);
  } catch (_) { }
}

function updateBadgePositions() {
  // Cache getBoundingClientRect to avoid layout thrashing (expensive DOM query)
  if (!HoverTooltips._canvasRectCache || HoverTooltips._canvasRectInvalidated) {
    HoverTooltips._canvasRectCache = canvas.app.view.getBoundingClientRect();
    HoverTooltips._canvasRectInvalidated = false;
  }
  const canvasRect = HoverTooltips._canvasRectCache;

  // Use cached sizes instead of reading from settings every frame
  const iconPx = HoverTooltips.tooltipIconSize;
  const borderPx = 3; // Fixed border width
  const badgeWidth = Math.round(iconPx + borderPx * 2 + 8);
  const badgeHeight = Math.round(iconPx + borderPx * 2 + 6);
  const spacing = Math.max(6, Math.round(iconPx / 2));

  // Cache HUD active check (checking modules is expensive)
  if (HoverTooltips._hudActiveCache === undefined) {
    HoverTooltips._hudActiveCache = !!game.modules?.get?.('pf2e-hud')?.active;
  }
  const verticalOffset = HoverTooltips._hudActiveCache ? 26 : -6;

  HoverTooltips.visibilityIndicators.forEach((indicator) => {
    if (!indicator || (!indicator._visBadgeEl && !indicator._coverBadgeEl)) return;
    const globalPoint = canvas.tokens.toGlobal(new PIXI.Point(indicator.x, indicator.y));
    const centerX = canvasRect.left + globalPoint.x;
    const centerY = canvasRect.top + globalPoint.y - badgeHeight / 2 + verticalOffset;

    if (indicator._visBadgeEl && indicator._coverBadgeEl) {
      const visLeft = centerX - spacing / 2 - badgeWidth;
      const coverLeft = centerX + spacing / 2;
      // Use transform for GPU acceleration instead of left/top
      indicator._visBadgeEl.style.transform = `translate(${Math.round(visLeft)}px, ${Math.round(centerY)}px)`;
      indicator._coverBadgeEl.style.transform = `translate(${Math.round(coverLeft)}px, ${Math.round(centerY)}px)`;
    } else if (indicator._visBadgeEl) {
      const visLeft = centerX - badgeWidth / 2;
      indicator._visBadgeEl.style.transform = `translate(${Math.round(visLeft)}px, ${Math.round(centerY)}px)`;
    }
  });

  // Also update standalone cover badges
  HoverTooltips.coverIndicators.forEach((indicator) => {
    if (!indicator || !indicator._coverBadgeEl) return;
    const globalPoint = canvas.tokens.toGlobal(new PIXI.Point(indicator.x, indicator.y));
    const centerX = canvasRect.left + globalPoint.x;
    const centerY = canvasRect.top + globalPoint.y - badgeHeight / 2 + verticalOffset;
    const left = centerX - badgeWidth / 2;
    indicator._coverBadgeEl.style.transform = `translate(${Math.round(left)}px, ${Math.round(centerY)}px)`;
  });
}

/**
 * Add a cover indicator to a token
 * @param {Token} targetToken
 * @param {Token} observerToken
 * @param {string} coverState
 */
function addCoverIndicator(targetToken, observerToken, coverState) {
  const config = COVER_STATES[coverState];
  if (!config) return;

  // Use DOM badge with icon only (no large text), consistent with visibility badges
  const indicator = new PIXI.Container();
  const tokenWidth = targetToken.document.width * canvas.grid.size;
  indicator.x = targetToken.x + tokenWidth / 2;
  indicator.y = targetToken.y - 8; // align above token
  canvas.tokens.addChild(indicator);

  const canvasRect = canvas.app.view.getBoundingClientRect();
  let sizeConfig;
  try {
    const raw = game.settings?.get?.(MODULE_ID, 'tooltipFontSize');
    sizeConfig = computeSizesFromSetting(raw ?? HoverTooltips.tooltipFontSize);
  } catch (_) {
    sizeConfig = {
      fontPx: tooltipFontSize,
      iconPx: tooltipIconSize,
      borderPx: 3,
    };
  }
  const badgeWidth = Math.round(sizeConfig.iconPx + sizeConfig.borderPx * 2 + 8);
  const badgeHeight = Math.round(sizeConfig.iconPx + sizeConfig.borderPx * 2 + 6);
  const borderRadius = Math.round(badgeHeight / 3);
  const globalPoint = canvas.tokens.toGlobal(new PIXI.Point(indicator.x, indicator.y));
  const hudActive = !!game.modules?.get?.('pf2e-hud')?.active;
  const verticalOffset = hudActive ? 26 : -6;
  const centerX = canvasRect.left + globalPoint.x;
  const centerY = canvasRect.top + globalPoint.y - badgeHeight / 2 + verticalOffset;

  const el = document.createElement('div');
  el.style.position = 'fixed';
  el.style.pointerEvents = 'none';
  el.style.zIndex = '60';
  el.style.left = '0';
  el.style.top = '0';
  el.style.transform = `translate(${Math.round(centerX - badgeWidth / 2)}px, ${Math.round(centerY)}px)`;
  el.style.willChange = 'transform';
  const colorblindMode = game.settings.get(MODULE_ID, 'colorblindMode');
  const colorblindmodeMap = {
    protanopia: {
      none: '#0072b2',
      lesser: '#f0e442',
      standard: '#cc79a7',
      greater: '#9467bd',
    },
    deuteranopia: {
      none: '#0072b2' /* Blue instead of green */,
      lesser: '#f0e442' /* Yellow */,
      standard: '#ff8c00' /* Orange (safe for green-blind) */,
      greater: '#d946ef' /* Magenta instead of red */,
    },
    tritanopia: {
      none: '#00b050',
      lesser: '#ffd700',
      standard: '#ff6600',
      greater: '#dc143c',
    },
    achromatopsia: {
      none: '#ffffff' /* White - highest contrast */,
      lesser: '#cccccc' /* Light gray */,
      standard: '#888888' /* Medium gray */,
      greater: '#333333' /* Dark gray */,
    },
  };
  const color =
    colorblindMode !== 'none' ? colorblindmodeMap[colorblindMode][coverState] : config.color;
  el.innerHTML = `<span style="display:inline-flex; align-items:center; justify-content:center; background: rgba(0,0,0,0.9); border: var(--pf2e-visioner-tooltip-badge-border, 2px) solid ${color}; border-radius: ${borderRadius}px; width: ${badgeWidth}px; height: ${badgeHeight}px; color: ${color};">
    <i class="${config.icon}" style="font-size: var(--pf2e-visioner-tooltip-icon-size, 14px); line-height: 1;"></i>
  </span>`;
  document.body.appendChild(el);
  indicator._coverBadgeEl = el;

  // Do not attach a Foundry tooltip on hover; the badge itself is the tooltip.

  HoverTooltips.coverIndicators.set(targetToken.id + '|cover', indicator);
  ensureBadgeTicker();
}

/**
 * Hide all visibility indicators
 */
function hideAllVisibilityIndicators() {
  // Deactivate any active tooltips
  try {
    game.tooltip.deactivate();
  } catch (e) {
    console.warn('PF2E Visioner: Error deactivating tooltips', e);
  }

  // Clean up all indicators
  HoverTooltips.visibilityIndicators.forEach((indicator) => {
    try {
      // Remove DOM badges if present
      if (indicator._visBadgeEl && indicator._visBadgeEl.parentNode) {
        indicator._visBadgeEl.parentNode.removeChild(indicator._visBadgeEl);
      }
      if (indicator._coverBadgeEl && indicator._coverBadgeEl.parentNode) {
        indicator._coverBadgeEl.parentNode.removeChild(indicator._coverBadgeEl);
      }
      delete indicator._visBadgeEl;
      delete indicator._coverBadgeEl;

      // Clean up tooltip anchor if it exists
      if (indicator._tooltipAnchor) {
        if (indicator._tooltipAnchor.parentNode) {
          indicator._tooltipAnchor.parentNode.removeChild(indicator._tooltipAnchor);
        }
        delete indicator._tooltipAnchor;
      }

      // Remove from parent before destroying
      if (indicator.parent) {
        indicator.parent.removeChild(indicator);
      }

      // Destroy the indicator - simplified flags to reduce overhead
      // Don't need to destroy textures/baseTextures for containers without graphics
      indicator.destroy({ children: false });
    } catch (e) {
      console.warn('PF2E Visioner: Error cleaning up indicator', e);
    }
  });

  // Clear the map
  HoverTooltips.visibilityIndicators.clear();

  // Reset tracking variables to ensure clean state
  keyTooltipTokens.clear();

  // Stop ticker when no indicators remain
  try {
    if (HoverTooltips.badgeTicker) {
      canvas.app?.ticker?.remove?.(HoverTooltips.badgeTicker);
      HoverTooltips.badgeTicker = null;
      // Invalidate canvas rect cache when ticker stops
      delete HoverTooltips._canvasRectCache;
      HoverTooltips._canvasRectInvalidated = true;
    }
  } catch (_) { }
}

/**
 * Hide all cover indicators
 */
function hideAllCoverIndicators() {
  try {
    game.tooltip.deactivate();
  } catch (_) { }
  HoverTooltips.coverIndicators.forEach((indicator) => {
    try {
      if (indicator._coverBadgeEl && indicator._coverBadgeEl.parentNode) {
        indicator._coverBadgeEl.parentNode.removeChild(indicator._coverBadgeEl);
      }
      delete indicator._coverBadgeEl;
      if (indicator._tooltipAnchor) {
        if (indicator._tooltipAnchor.parentNode) {
          indicator._tooltipAnchor.parentNode.removeChild(indicator._tooltipAnchor);
        }
        delete indicator._tooltipAnchor;
      }
      if (indicator.parent) indicator.parent.removeChild(indicator);
      // Simplified destroy - no textures to clean up
      indicator.destroy({ children: false });
    } catch (_) { }
  });
  HoverTooltips.coverIndicators.clear();
  // Stop ticker if nothing remains
  try {
    if (
      HoverTooltips.badgeTicker &&
      HoverTooltips.visibilityIndicators.size === 0 &&
      HoverTooltips.coverIndicators.size === 0
    ) {
      canvas.app?.ticker?.remove?.(HoverTooltips.badgeTicker);
      HoverTooltips.badgeTicker = null;
      // Invalidate canvas rect cache when ticker stops
      delete HoverTooltips._canvasRectCache;
      HoverTooltips._canvasRectInvalidated = true;
    }
  } catch (_) { }
}

/**
 * Cleanup hover tooltips
 */
export function cleanupHoverTooltips() {
  hideAllVisibilityIndicators();
  hideAllCoverIndicators();
  HoverTooltips.currentHoveredToken = null;
  HoverTooltips.isShowingKeyTooltips = false;
  HoverTooltips.keyTooltipTokens.clear();

  // Reset tooltip mode to default
  setTooltipMode('target');

  // Remove only our specific event listeners from tokens
  cleanupTokenEventListeners();

  _initialized = false;

  // Note: O key event listeners are managed globally in hooks.js
}
