/**
 * Hover tooltips for token visibility states
 */

import {
  COVER_STATES,
  MODULE_ID,
  SPECIAL_SENSES,
  VISIBILITY_STATES,
  getVisibilityStateLabelKey,
} from '../constants.js';
import { getCoverOverlayState } from '../cover/auto-cover/cover-state-query.js';
import { canShowTooltips } from '../helpers/tooltip-utils.js';
import { SenseSuppressionRegionBehavior } from '../regions/SenseSuppressionRegionBehavior.js';
import { getDetectionBetween } from '../stores/detection-map.js';
import { getVisibilityBetween, getVisibilityMap } from '../utils.js';
import { setPanningState } from '../utils/scheduler.js';
import {
  buildVisibilityFactorTooltipLines,
  buildVisibilityFactorIndicatorRequests,
  formatVisibilityFactors,
  getVisibilityFactorTargets,
} from './HoverTooltip/hover-tooltip-factor-overlay.js';
import {
  VISIBILITY_FACTOR_BADGE_SIZE,
  computeSingleTooltipBadgePosition,
  computeTooltipBadgeCenter,
  computeTooltipBadgeMetrics,
  computeTooltipBadgeStackPositions,
  computeVisibilityFactorBadgePlacement,
  computeVisibilityFactorBadgeWorldPoint,
} from './HoverTooltip/hover-tooltip-badge-layout.js';
import {
  createCoverTooltipBadge,
  createSenseSuppressionOverlay,
  createSenseTooltipBadge,
  createVisibilityFactorBadge,
  createVisibilityFactorTooltip,
  createVisibilityTooltipBadge,
  resolveTooltipCssColor,
} from './HoverTooltip/hover-tooltip-badge-elements.js';
import { getTooltipCoverBadgeColor } from './HoverTooltip/hover-tooltip-cover-badge.js';
import {
  applyDefaultTooltipSizeCssVariables,
  applyTooltipSizeCssVariables,
  readTooltipSizeConfig,
} from './HoverTooltip/hover-tooltip-size-settings.js';
import {
  buildTooltipTokenManagerRequest,
  scheduleTokenManagerRowHighlight,
} from './HoverTooltip/hover-tooltip-token-manager-click.js';
import {
  getTooltipSuppressedSenses,
  resolveTooltipSenseUsed,
} from './HoverTooltip/hover-tooltip-sense-state.js';
import {
  destroyCoverTooltipIndicator,
  destroyVisibilityBadge,
  destroyVisibilityTooltipIndicator,
  removeTooltipDomElement,
} from './HoverTooltip/hover-tooltip-cleanup.js';
import {
  createTooltipPositionPoint,
  setTooltipBadgeTransform,
  toGlobalTooltipPoint,
} from './HoverTooltip/hover-tooltip-positioning.js';
import {
  SENSE_BADGE_BLOCKED_VISIBILITY_STATES,
  buildHoverTooltipVisibilityRequests,
  buildTooltipVisibilityIndicatorDecision,
  buildTooltipVisibilityRequests,
  canRenderTooltipToken,
} from './HoverTooltip/hover-tooltip-visibility-requests.js';

function getExplicitVisibilityStateLabel(state) {
  const labelKey = getVisibilityStateLabelKey(state, { manual: true });
  return game.i18n?.localize?.(labelKey) || labelKey;
}

function getSuppressedSenseLabel(sense) {
  const cfg = SPECIAL_SENSES[sense];
  return cfg ? game.i18n?.localize?.(cfg.label) || sense : sense;
}

function formatSuppressedSensesTooltip(labels) {
  return (
    game.i18n?.format?.('PF2E_VISIONER.TOOLTIPS.SENSES_SUPPRESSED', {
      senses: labels.join(', '),
    }) || `Senses suppressed: ${labels.join(', ')}`
  );
}

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
    this.isShowingCoverOverlay = false;
    this.isShowingFactorsOverlay = false;
    this.keyTooltipTokens = new Set();
    this.factorsOverlayTokens = new Set();
    this.tooltipFontSize = 16;
    this.tooltipIconSize = 14;
    this.badgeTicker = null;
    this.visibilityBadges = new Map();
    this.tooltipBadgePool = new Map();
    this._isTokenMoving = false;
    this._movementDebounceTimer = null;
    this._isDragging = false;
    this._hookHandlers = [];
    this._originalCanvasAnimatePan = null;
    this._canvasAnimatePanWrapper = null;
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
      const { fontPx, iconPx, borderPx } = readTooltipSizeConfig({
        settings: game.settings,
        fallbackFontPx: this.tooltipFontSize,
      });
      this.tooltipFontSize = fontPx;
      this.tooltipIconSize = iconPx;

      // Invalidate HUD cache when sizes change
      delete this._hudActiveCache;

      applyTooltipSizeCssVariables(document.documentElement.style, {
        fontPx,
        iconPx,
        borderPx,
      });
    } catch (_) { }
  }
}
export const HoverTooltips = new HoverTooltipsImpl();

// Backwards-compatible alias
export const HoverTooltipsService = HoverTooltips;

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
 * Add event listener to a specific token (for drag detection only)
 * @param {Token} token - The token to add listeners to
 * @returns {boolean} True if listeners were added, false if skipped
 */
export function addTokenEventListener(token) {
  if (!token || !token.id) return false;

  // If we already have handlers for this token ID, remove them first
  if (HoverTooltips.tokenEventHandlers.has(token.id)) {
    removeTokenEventListener(token.id);
  }

  const pointerDownHandler = () => onTokenPointerDown(token);
  const pointerUpHandler = () => onTokenPointerUp(token);

  // Store handlers for later cleanup
  HoverTooltips.tokenEventHandlers.set(token.id, {
    pointerDownHandler,
    pointerUpHandler,
  });

  // Only listen for pointer down/up to detect drag operations
  // Hover is handled by Foundry's hoverToken hook
  token.on('pointerdown', pointerDownHandler);
  token.on('pointerup', pointerUpHandler);
  token.on('pointerupoutside', pointerUpHandler);

  return true;
}

/**
 * Remove event listener from a specific token by ID
 * @param {string} tokenId - The token ID to remove listeners from
 */
function removeTokenEventListener(tokenId) {
  const handlers = HoverTooltips.tokenEventHandlers.get(tokenId);
  if (!handlers) return;

  const token = canvas?.tokens?.placeables?.find((t) => t.id === tokenId);
  if (token) {
    try {
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

  HoverTooltips.tokenEventHandlers.delete(tokenId);
}

/**
 * Add event listeners to all current tokens (for drag detection)
 */
function addTokenEventListeners() {
  if (!canvas?.tokens?.placeables) return;

  canvas.tokens.placeables.forEach((token) => {
    addTokenEventListener(token);
  });
}

/**
 * Clean up token event listeners
 */
function cleanupTokenEventListeners() {
  if (!canvas?.tokens?.placeables) {
    HoverTooltips.tokenEventHandlers.clear();
    return;
  }

  HoverTooltips.tokenEventHandlers.forEach((handlers, tokenId) => {
    removeTokenEventListener(tokenId);
  });
  HoverTooltips.tokenEventHandlers.clear();
}

function saveViewportTooltipState() {
  HoverTooltips._savedHoveredToken = HoverTooltips.currentHoveredToken;
  HoverTooltips._savedKeyTooltipsActive = HoverTooltips.isShowingKeyTooltips;
}

function clearSavedViewportTooltipState() {
  delete HoverTooltips._savedHoveredToken;
  delete HoverTooltips._savedKeyTooltipsActive;
}

function setTooltipPanningState(isPanning) {
  HoverTooltips._isPanning = isPanning;
  setPanningState(isPanning);
}

function stopBadgeTicker() {
  if (!HoverTooltips.badgeTicker) return;

  try {
    canvas.app?.ticker?.remove?.(HoverTooltips.badgeTicker);
  } catch (_) { }

  HoverTooltips.badgeTicker = null;
  delete HoverTooltips._canvasRectCache;
  HoverTooltips._canvasRectInvalidated = true;
}

function hasPositionedTooltipBadges() {
  return HoverTooltips.visibilityBadges.size > 0 || HoverTooltips.coverIndicators.size > 0;
}

function restartBadgeTickerIfBadgesRemain() {
  if (hasPositionedTooltipBadges()) ensureBadgeTicker();
}

function stopBadgeTickerIfNoBadgesRemain() {
  if (!hasPositionedTooltipBadges()) stopBadgeTicker();
}

function createTooltipWorldAnchor(targetToken) {
  const tokenWidth = targetToken.document.width * canvas.grid.size;
  return {
    x: targetToken.x + tokenWidth / 2,
    y: targetToken.y - 8,
  };
}

function getTooltipTokenId(token) {
  return token?.document?.id ?? token?.id ?? '';
}

function makeTooltipBadgePoolKey(...parts) {
  return parts.map((part) => String(part ?? '')).join('|');
}

function showPooledTooltipElement(key, createElement, left, top) {
  let element = HoverTooltips.tooltipBadgePool.get(key);
  if (!element) {
    element = createElement();
    HoverTooltips.tooltipBadgePool.set(key, element);
  }

  if (!element.isConnected) document.body.appendChild(element);
  element.style.display = '';
  setTooltipBadgeTransform(element, left, top);
  return element;
}

function hidePooledTooltipElement(element) {
  if (!element?.style) return;
  element.style.display = 'none';
  element.onclick = null;
}

function hidePooledTooltipIndicator(indicator, fields) {
  if (!indicator) return;
  removeTooltipDomElement(indicator._suppressionBadgeEl);
  delete indicator._suppressionBadgeEl;
  for (const field of fields) {
    hidePooledTooltipElement(indicator[field]);
    delete indicator[field];
  }
}

function clearTooltipBadgePool() {
  for (const element of HoverTooltips.tooltipBadgePool.values()) {
    removeTooltipDomElement(element);
  }
  HoverTooltips.tooltipBadgePool.clear();
}

function clearPendingHoverDebounce() {
  if (!HoverTooltips._hoverDebounceTimer) return;
  clearTimeout(HoverTooltips._hoverDebounceTimer);
  delete HoverTooltips._hoverDebounceTimer;
}

function clearHoverTooltipLifecycleTimers() {
  const timerKeys = ['_panTimeout', '_zoomTimeout', '_visibilityUpdateDebounce'];
  for (const key of timerKeys) {
    if (!HoverTooltips[key]) continue;
    clearTimeout(HoverTooltips[key]);
    HoverTooltips[key] = null;
  }
}

function registerHoverTooltipHook(hookName, handler) {
  const hookId = Hooks.on(hookName, handler);
  HoverTooltips._hookHandlers.push({ hookName, handler, hookId });
  return hookId;
}

function unregisterHoverTooltipHooks() {
  const registrations = HoverTooltips._hookHandlers || [];
  for (const { hookName, handler, hookId } of registrations) {
    try {
      Hooks.off?.(hookName, handler);
    } catch (_) {
      try {
        if (hookId !== undefined) Hooks.off?.(hookName, hookId);
      } catch (_) { }
    }
  }
  HoverTooltips._hookHandlers = [];
}

function installCanvasZoomGuard() {
  const canvasRef = globalThis.canvas;
  if (typeof canvasRef?.animatePan !== 'function') return false;
  if (
    HoverTooltips._canvasAnimatePanWrapper &&
    canvasRef.animatePan === HoverTooltips._canvasAnimatePanWrapper
  )
    return true;

  HoverTooltips._originalCanvasAnimatePan = canvasRef.animatePan;
  HoverTooltips._canvasAnimatePanWrapper = function (...args) {
    const options = args[0] || {};
    if (options.scale !== undefined && options.scale !== canvasRef.stage.scale.x) {
      if (!HoverTooltips._isZooming) {
        HoverTooltips._isZooming = true;
        if (!HoverTooltips._isPanning) {
          saveViewportTooltipState();
          suspendViewportTooltipRendering();
        }
      }

      if (HoverTooltips._zoomTimeout) clearTimeout(HoverTooltips._zoomTimeout);

      HoverTooltips._zoomTimeout = setTimeout(() => {
        HoverTooltips._isZooming = false;
        restoreSavedViewportTooltipState({ skipIfPanning: true });
        HoverTooltips._zoomTimeout = null;
      }, 150);
    }
    return HoverTooltips._originalCanvasAnimatePan.apply(this, args);
  };

  canvasRef.animatePan = HoverTooltips._canvasAnimatePanWrapper;
  return true;
}

function removeCanvasZoomGuard() {
  const canvasRef = globalThis.canvas;
  if (HoverTooltips._zoomTimeout) {
    clearTimeout(HoverTooltips._zoomTimeout);
    HoverTooltips._zoomTimeout = null;
  }
  if (
    canvasRef &&
    HoverTooltips._canvasAnimatePanWrapper &&
    canvasRef.animatePan === HoverTooltips._canvasAnimatePanWrapper
  ) {
    canvasRef.animatePan = HoverTooltips._originalCanvasAnimatePan;
  }
  HoverTooltips._originalCanvasAnimatePan = null;
  HoverTooltips._canvasAnimatePanWrapper = null;
}

function hoverTooltipsSuppressedByPointerActivity() {
  return !!(
    HoverTooltips._isPanning ||
    HoverTooltips._isZooming ||
    HoverTooltips._isTokenMoving ||
    HoverTooltips._isDragging ||
    HoverTooltips._pointerIsDown
  );
}

function suppressHoverTooltipsForPointerDown() {
  HoverTooltips._pointerIsDown = true;
  HoverTooltips._isDragging = true;
  clearPendingHoverDebounce();
  hideAllVisibilityIndicators();
  hideAllCoverIndicators();
}

function releaseHoverTooltipPointerSuppression() {
  if (HoverTooltips._dragClearTimer) {
    clearTimeout(HoverTooltips._dragClearTimer);
  }
  HoverTooltips._dragClearTimer = setTimeout(() => {
    HoverTooltips._isDragging = false;
    HoverTooltips._pointerIsDown = false;
    HoverTooltips._dragClearTimer = null;
  }, 150);
}

function removeCanvasPointerGuard() {
  const guard = HoverTooltips._canvasPointerGuard;
  if (!guard) return;
  try {
    guard.view?.removeEventListener?.('pointerdown', guard.pointerDown, true);
    guard.view?.removeEventListener?.('mousedown', guard.pointerDown, true);
    globalThis.window?.removeEventListener?.('pointerup', guard.pointerUp, true);
    globalThis.window?.removeEventListener?.('mouseup', guard.pointerUp, true);
  } catch (_) { }
  delete HoverTooltips._canvasPointerGuard;
}

function installCanvasPointerGuard() {
  const view = globalThis.canvas?.app?.view;
  if (!view?.addEventListener) return false;
  if (HoverTooltips._canvasPointerGuard?.view === view) return true;

  removeCanvasPointerGuard();

  const pointerDown = (event) => {
    if (event?.button !== undefined && event.button !== 0) return;
    suppressHoverTooltipsForPointerDown();
  };
  const pointerUp = () => releaseHoverTooltipPointerSuppression();

  view.addEventListener('pointerdown', pointerDown, true);
  view.addEventListener('mousedown', pointerDown, true);
  globalThis.window?.addEventListener?.('pointerup', pointerUp, true);
  globalThis.window?.addEventListener?.('mouseup', pointerUp, true);

  HoverTooltips._canvasPointerGuard = { view, pointerDown, pointerUp };
  return true;
}

function suspendViewportTooltipRendering() {
  if (HoverTooltips.isShowingKeyTooltips) {
    HoverTooltips.isShowingKeyTooltips = false;
    HoverTooltips.keyTooltipTokens.clear();
  }

  hideAllVisibilityIndicators();
  hideAllCoverIndicators();
  clearVisibilityFactorOverlayState();
  stopBadgeTicker();
}

function showActiveKeyboardVisibilityOverlay() {
  if (HoverTooltips.tooltipMode === 'observer') {
    showControlledTokenVisibilityObserver();
  } else {
    showControlledTokenVisibility();
  }
}

function restoreSavedViewportTooltipState({ restartTicker = false, skipIfPanning = false } = {}) {
  if (skipIfPanning && HoverTooltips._isPanning) return false;

  if (restartTicker) restartBadgeTickerIfBadgesRemain();

  if (HoverTooltips._savedKeyTooltipsActive) {
    showActiveKeyboardVisibilityOverlay();
  } else if (HoverTooltips._savedHoveredToken) {
    const token = HoverTooltips._savedHoveredToken;
    HoverTooltips.currentHoveredToken = token;
    showVisibilityIndicators(token);
  }

  clearSavedViewportTooltipState();
  return true;
}

function rebuildActiveKeyboardVisibilityOverlay() {
  HoverTooltips.isShowingKeyTooltips = false;
  HoverTooltips.keyTooltipTokens.clear();
  showActiveKeyboardVisibilityOverlay();
}

function scheduleTooltipOverlayRefresh({ clearExisting = true } = {}) {
  if (HoverTooltips.isShowingKeyTooltips) {
    if (clearExisting) {
      hideAllVisibilityIndicators();
      hideAllCoverIndicators();
    }
    setTimeout(rebuildActiveKeyboardVisibilityOverlay, 0);
    return true;
  }

  if (HoverTooltips.currentHoveredToken) {
    const tok = HoverTooltips.currentHoveredToken;
    if (clearExisting) {
      hideAllVisibilityIndicators();
      hideAllCoverIndicators();
    }
    setTimeout(() => {
      showVisibilityIndicators(tok);
    }, 0);
    return true;
  }

  return false;
}

function tokenIdOfTooltipToken(token) {
  return token?.document?.id ?? token?.id ?? null;
}

function tooltipVisibilityUpdateAffectsActiveOverlay(update = null) {
  const hasActiveOverlay = HoverTooltips.isShowingKeyTooltips || !!HoverTooltips.currentHoveredToken;
  if (!hasActiveOverlay) return false;
  if (!update || typeof update !== 'object') return true;

  const observerId = update.observerId ?? null;
  const targetId = update.targetId ?? null;
  if (!observerId && !targetId) return true;

  if (HoverTooltips.isShowingKeyTooltips) {
    const subjectIds = HoverTooltips.keyTooltipTokens;
    if (!subjectIds?.size) return true;
    return HoverTooltips.tooltipMode === 'observer'
      ? subjectIds.has(observerId)
      : subjectIds.has(targetId);
  }

  const hoveredId = tokenIdOfTooltipToken(HoverTooltips.currentHoveredToken);
  if (!hoveredId) return true;

  return HoverTooltips.tooltipMode === 'observer'
    ? observerId === hoveredId
    : targetId === hoveredId;
}

/**
 * Initialize hover tooltip system
 */
export function initializeHoverTooltips() {
  cleanupTokenEventListeners();

  if (HoverTooltips._initialized || _initialized) {
    addTokenEventListeners();
    installCanvasPointerGuard();
    HoverTooltips.refreshSizes?.();
    HoverTooltips._initialized = true;
    _initialized = true;
    return;
  }

  try {
    const { fontPx, iconPx, borderPx } = readTooltipSizeConfig({
      settings: game.settings,
      fallbackFontPx: HoverTooltips.tooltipFontSize,
    });
    HoverTooltips.tooltipFontSize = fontPx;
    HoverTooltips.tooltipIconSize = iconPx;
    applyTooltipSizeCssVariables(document.documentElement.style, { fontPx, iconPx, borderPx });
  } catch (e) {
    console.warn('PF2E Visioner: Error setting tooltip font size CSS variable', e);
    applyDefaultTooltipSizeCssVariables(document.documentElement.style);
  }

  // Add event listeners to tokens (for drag detection only)
  addTokenEventListeners();
  installCanvasPointerGuard();

  // Register hoverToken hook to handle token hover events
  // This is cleaner than PIXI events and automatically excludes UI hover
  registerHoverTooltipHook('hoverToken', (token, hovered) => {
    if (hovered) {
      onTokenHover(token);
    } else {
      onTokenHoverEnd(token);
    }
  });

  // Handle canvas pan: hide tooltips during pan, show after
  registerHoverTooltipHook('canvasPan', () => {
    // Hide tooltips immediately when pan starts
    if (!HoverTooltips._isPanning) {
      setTooltipPanningState(true);
      saveViewportTooltipState();
    }

    // Always hide tooltips during pan (even if already panning, in case O key was pressed during pan)
    suspendViewportTooltipRendering();

    // Clear any existing timeout
    if (HoverTooltips._panTimeout) clearTimeout(HoverTooltips._panTimeout);

    // Set timeout to restore tooltips after pan stops
    HoverTooltips._panTimeout = setTimeout(() => {
      setTooltipPanningState(false);
      restoreSavedViewportTooltipState({ restartTicker: true });
      HoverTooltips._panTimeout = null;
    }, 150); // 150ms after pan stops
  });

  // Handle canvas zoom: hide tooltips during zoom, show after (similar to pan)
  installCanvasZoomGuard();

  // Refresh badges when visibility map changes (debounced to avoid performance issues during rapid updates)
  try {
    registerHoverTooltipHook('pf2e-visioner.visibilityMapUpdated', (update) => {
      // Skip updates entirely during active token movement to prevent performance issues
      if (HoverTooltips._isTokenMoving) {
        return;
      }
      if (!tooltipVisibilityUpdateAffectsActiveOverlay(update)) {
        return;
      }

      // Clear any pending update
      if (HoverTooltips._visibilityUpdateDebounce) {
        clearTimeout(HoverTooltips._visibilityUpdateDebounce);
      }

      // Debounce tooltip updates during rapid visibility changes (e.g., token movement)
      // This prevents constant re-rendering during AVS batch processing
      HoverTooltips._visibilityUpdateDebounce = setTimeout(() => {
        HoverTooltips._visibilityUpdateDebounce = null;
        scheduleTooltipOverlayRefresh();
      }, 150); // 150ms debounce - batch multiple rapid updates
    });
  } catch (_) { }

  // Detect token movement and pause tooltip updates during movement
  // This prevents tooltips from consuming CPU during drag operations
  registerHoverTooltipHook('preUpdateToken', (tokenDoc, changes, options, userId) => {
    // Check if this is a position or animation change
    if (changes.x !== undefined || changes.y !== undefined || changes.rotation !== undefined) {
      // Mark movement as active
      HoverTooltips._isTokenMoving = true;

      // Hide all tooltips immediately when ANY token starts moving
      hideAllVisibilityIndicators();
      hideAllCoverIndicators();

      // Clear any existing debounce timer
      if (HoverTooltips._movementDebounceTimer) {
        clearTimeout(HoverTooltips._movementDebounceTimer);
      }

      // Set a timer to mark movement as complete after updates stop
      HoverTooltips._movementDebounceTimer = setTimeout(() => {
        HoverTooltips._isTokenMoving = false;
        HoverTooltips._movementDebounceTimer = null;

        // Refresh tooltips after movement completes
        scheduleTooltipOverlayRefresh({ clearExisting: false });
      }, 300); // Wait 300ms after last movement update before refreshing (increased from 200ms)
    }
  });

  // Clean up tooltips when tearing down canvas (leaving a scene)
  registerHoverTooltipHook('canvasTearDown', () => {
    // Aggressively destroy all PIXI containers and DOM elements

    // Destroy all visibility indicators with full cleanup
    HoverTooltips.visibilityIndicators.forEach((indicator) => {
      try {
        destroyVisibilityTooltipIndicator(indicator);
      } catch (e) {
        console.warn('PF2E Visioner: Error destroying visibility indicator', e);
      }
    });
    HoverTooltips.visibilityIndicators.clear();

    // Destroy all cover indicators with full cleanup
    HoverTooltips.coverIndicators.forEach((indicator) => {
      try {
        destroyCoverTooltipIndicator(indicator);
      } catch (e) {
        console.warn('PF2E Visioner: Error destroying cover indicator', e);
      }
    });
    HoverTooltips.coverIndicators.clear();
    clearTooltipBadgePool();

    // Destroy all visibility badges (including factor badges)
    HoverTooltips.visibilityBadges.forEach((badge, key) => {
      try {
        destroyVisibilityBadge(badge);
      } catch (e) {
        console.warn('PF2E Visioner: Error destroying visibility badge', e);
      }
    });
    HoverTooltips.visibilityBadges.clear();

    // Deactivate tooltips
    try {
      game.tooltip.deactivate();
    } catch (e) { }

    // Hide factors overlay
    hideVisibilityFactorsOverlay();

    // Reset all state
    HoverTooltips.currentHoveredToken = null;
    HoverTooltips.isShowingKeyTooltips = false;
    HoverTooltips.isShowingCoverOverlay = false;
    HoverTooltips.isShowingFactorsOverlay = false;
    setTooltipPanningState(false);
    HoverTooltips._isTokenMoving = false;
    HoverTooltips._isDragging = false;
    HoverTooltips._pointerIsDown = false;
    HoverTooltips._isZooming = false;

    // Clear any pending timers
    if (HoverTooltips._dragClearTimer) {
      clearTimeout(HoverTooltips._dragClearTimer);
      HoverTooltips._dragClearTimer = null;
    }
    clearPendingHoverDebounce();
    if (HoverTooltips._movementDebounceTimer) {
      clearTimeout(HoverTooltips._movementDebounceTimer);
      HoverTooltips._movementDebounceTimer = null;
    }

    stopBadgeTicker();

    // Clear saved state
    clearSavedViewportTooltipState();

    // Clear key tooltip tokens
    HoverTooltips.keyTooltipTokens.clear();
  });

  // Clean up tooltips when changing scenes
  registerHoverTooltipHook('canvasReady', () => {
    // Clean up all tooltips and reset state
    hideAllVisibilityIndicators();
    hideAllCoverIndicators();
    HoverTooltips.currentHoveredToken = null;
    HoverTooltips.isShowingKeyTooltips = false;
    HoverTooltips.isShowingCoverOverlay = false;
    setTooltipPanningState(false);
    HoverTooltips._isTokenMoving = false;
    HoverTooltips._isDragging = false;
    HoverTooltips._pointerIsDown = false;

    // Clear any pending timers
    if (HoverTooltips._dragClearTimer) {
      clearTimeout(HoverTooltips._dragClearTimer);
      HoverTooltips._dragClearTimer = null;
    }
    clearPendingHoverDebounce();
    if (HoverTooltips._movementDebounceTimer) {
      clearTimeout(HoverTooltips._movementDebounceTimer);
      HoverTooltips._movementDebounceTimer = null;
    }

    // Re-add event listeners to new tokens
    addTokenEventListeners();
    installCanvasPointerGuard();
  });

  // Note: Alt key handled via highlightObjects hook registered in main hooks
  // O key event listeners added globally in registerHooks

  // Mark as initialized
  _initialized = true;
  HoverTooltips._initialized = true;
}

/**
 * Handle token hover start
 * Called by the hoverToken hook, which only fires for actual token hovers (not UI elements)
 * @param {Token} hoveredToken - The token being hovered
 */
function onTokenHover(hoveredToken) {
  // Skip if currently panning, zooming, during active token movement, or during drag
  if (hoverTooltipsSuppressedByPointerActivity())
    return;

  // Only show hover tooltips if allowed for this user with current mode AND token
  // Suppress hover overlays entirely while any keybind overlay is active
  if (
    HoverTooltips.isShowingKeyTooltips ||
    HoverTooltips.isShowingCoverOverlay ||
    HoverTooltips.isShowingFactorsOverlay
  )
    return;
  if (!canShowTooltips(HoverTooltips.tooltipMode, hoveredToken)) {
    return;
  }

  if (HoverTooltips.currentHoveredToken === hoveredToken) {
    return;
  }

  // Debounce rapid hover changes to prevent PIXI churn
  clearPendingHoverDebounce();

  HoverTooltips._hoverDebounceTimer = setTimeout(() => {
    if (
      hoverTooltipsSuppressedByPointerActivity() ||
      HoverTooltips.isShowingKeyTooltips ||
      HoverTooltips.isShowingCoverOverlay ||
      HoverTooltips.isShowingFactorsOverlay ||
      !canShowTooltips(HoverTooltips.tooltipMode, hoveredToken)
    ) {
      delete HoverTooltips._hoverDebounceTimer;
      return;
    }
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
  clearPendingHoverDebounce();

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
  suppressHoverTooltipsForPointerDown();
}

/**
 * Handle token pointer up (drag end)
 * @param {Token} token - The token that was released
 */
function onTokenPointerUp(token) {
  releaseHoverTooltipPointerSuppression();
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
    delete HoverTooltips._savedKeyTooltipsActive;
    hideAllVisibilityIndicators();
    hideAllCoverIndicators();
    // Restore clean hover indicators if still hovering
    if (HoverTooltips.currentHoveredToken) {
      setTimeout(() => {
        showVisibilityIndicators(HoverTooltips.currentHoveredToken);
      }, 50);
    }
  }
}

function renderVisibilityIndicatorRequest({
  renderToken,
  observerToken,
  visibilityState,
  mode,
  detectionTarget = null,
  senseUsed,
}) {
  addVisibilityIndicator(
    renderToken,
    observerToken,
    visibilityState,
    mode,
    detectionTarget,
    senseUsed,
  );
}

/**
 * Show visibility indicators on other tokens
 * @param {Token} hoveredToken - The token being hovered
 */
function showVisibilityIndicators(hoveredToken) {
  // Check if tooltips are allowed for the current mode and token
  // Suppress hover overlays entirely while any keybind overlay is active, UNLESS this is a keyboard context
  if (
    (HoverTooltips.isShowingKeyTooltips ||
      HoverTooltips.isShowingCoverOverlay ||
      HoverTooltips.isShowingFactorsOverlay) &&
    !HoverTooltips._keyboardContext
  )
    return;

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

  // Clear any existing indicators, unless a keybind overlay is active (handled separately)
  if (
    !HoverTooltips.isShowingKeyTooltips &&
    !HoverTooltips.isShowingCoverOverlay &&
    !HoverTooltips.isShowingFactorsOverlay
  ) {
    hideAllVisibilityIndicators();
    hideAllCoverIndicators();
  }

  const requests = buildHoverTooltipVisibilityRequests({
    hoveredToken,
    allTokens: canvas.tokens.placeables,
    tooltipMode: HoverTooltips.tooltipMode,
    isGM: game.user.isGM,
    getVisibilityMap,
    getVisibilityState: getVisibilityBetween,
    getDetectionBetween,
  });

  requests.forEach(renderVisibilityIndicatorRequest);
}

/**
 * Show visibility indicators for a specific token (without clearing existing ones)
 * @param {Token} observerToken - The token to show visibility indicators for
 * @param {string} forceMode - Optional mode to force ('observer' or 'target'), defaults to current tooltipMode
 */
export function showVisibilityIndicatorsForToken(observerToken, forceMode = null) {
  // Use forced mode if provided, otherwise use current tooltipMode
  const effectiveMode = forceMode || HoverTooltips.tooltipMode;

  // Check if tooltips are allowed for the current mode
  // For keyboard scenarios (when forceMode is provided), this is a keyboard tooltip
  const isKeyboardTooltip = !!forceMode;
  if (!canShowTooltips(effectiveMode, null, isKeyboardTooltip)) {
    return;
  }

  const requests = buildTooltipVisibilityRequests({
    subjectToken: observerToken,
    allTokens: canvas.tokens.placeables,
    mode: effectiveMode,
    isGM: game.user.isGM,
    getVisibilityMap,
    getVisibilityState: getVisibilityBetween,
    getDetectionBetween,
  });

  requests.forEach(renderVisibilityIndicatorRequest);
}

export function showVisibilityIndicatorsForTokenPair(observerToken, targetToken, forceMode = 'target') {
  const effectiveMode = forceMode || HoverTooltips.tooltipMode;
  const isKeyboardTooltip = !!forceMode;
  if (!observerToken || !targetToken) return;
  if (!canShowTooltips(effectiveMode, null, isKeyboardTooltip)) return;

  const visibilityState = getVisibilityBetween(observerToken, targetToken);
  const decision = buildTooltipVisibilityIndicatorDecision({
    observerToken,
    targetToken,
    visibilityState,
    getDetectionBetween,
  });
  if (!decision.shouldShowIndicator) return;

  renderVisibilityIndicatorRequest({
    renderToken: effectiveMode === 'observer' ? targetToken : observerToken,
    observerToken,
    visibilityState: decision.visibilityState,
    mode: effectiveMode,
    detectionTarget: effectiveMode === 'target' ? targetToken : null,
    senseUsed: decision.senseUsed,
  });
}

/**
 * Show both manual cover and auto-computed cover as badges above targets.
 * Manual cover badges have a cog overlay to indicate manual override.
 * Manual cover takes precedence over auto cover when both exist.
 * @param {Token} sourceToken - The token acting as the attacker/source
 */
export function showAutoCoverComputedOverlay(sourceToken) {
  try {
    if (!sourceToken) return;

    // Set flag to suppress hover tooltips
    HoverTooltips.isShowingCoverOverlay = true;

    // Clear any existing hover tooltips
    hideAllVisibilityIndicators();
    hideAllCoverIndicators();

    const others = (canvas.tokens?.placeables || []).filter(
      (t) => t && t !== sourceToken && canRenderTooltipToken(t),
    );

    for (const target of others) {
      const cover = getCoverOverlayState(sourceToken, target);
      if (cover.state && cover.state !== 'none') {
        addCoverIndicator(target, sourceToken, cover.state, cover.isManualCover);
      }
    }
  } catch (_) { }
}

export function hideAutoCoverComputedOverlay() {
  // Clear flag to allow hover tooltips again
  HoverTooltips.isShowingCoverOverlay = false;
  hideAllCoverIndicators();

  // If still hovering over a token, restore hover tooltips
  if (HoverTooltips.currentHoveredToken) {
    setTimeout(() => {
      if (HoverTooltips.currentHoveredToken) {
        showVisibilityIndicators(HoverTooltips.currentHoveredToken);
      }
    }, 50);
  }
}

/**
 * Show visibility indicators for controlled tokens (simulates hovering over controlled tokens)
 * Uses target mode - how others see the controlled tokens
 */
export function showControlledTokenVisibility() {
  showKeyboardVisibilityOverlay({
    mode: 'target',
    tokens: canvas.tokens.controlled,
    markInitialized: true,
  });
}

/**
 * Show visibility indicators for controlled tokens in observer mode
 * Uses observer mode - how controlled tokens see others
 */
export function showControlledTokenVisibilityObserver() {
  showKeyboardVisibilityOverlay({
    mode: 'observer',
    tokens: getObserverKeyboardOverlayTokens(),
  });
}

function getObserverKeyboardOverlayTokens() {
  const controlledTokens = canvas.tokens.controlled;
  if (controlledTokens.length > 0) return controlledTokens;
  return HoverTooltips.currentHoveredToken ? [HoverTooltips.currentHoveredToken] : [];
}

function showKeyboardVisibilityOverlay({ mode, tokens, markInitialized = false }) {
  if (HoverTooltips.isShowingKeyTooltips) return;
  if (HoverTooltips._isPanning) return;

  HoverTooltips.isShowingKeyTooltips = true;
  HoverTooltips.keyTooltipTokens.clear();
  hideAllVisibilityIndicators();
  hideAllCoverIndicators();

  tokens.forEach((controlledToken) => {
    HoverTooltips.keyTooltipTokens.add(controlledToken.id);
    const originalMode = HoverTooltips.tooltipMode;

    try {
      HoverTooltips.tooltipMode = mode;
      HoverTooltips._keyboardContext = true;
      showVisibilityIndicators(controlledToken);
    } finally {
      HoverTooltips.tooltipMode = originalMode;
      delete HoverTooltips._keyboardContext;
    }
  });

  if (markInitialized) HoverTooltips._initialized = true;
}

/**
 * Add click handler to a badge element to open token manager
 * @param {HTMLElement} badgeElement - The badge element to make clickable
 * @param {Token} observerToken - The observer token
 * @param {Token} targetToken - The target token
 * @param {string} mode - The mode ('observer' or 'target')
 * @param {Token} [actualTarget] - In target mode, the actual target being observed (the hovered token)
 */
function addBadgeClickHandler(badgeElement, observerToken, targetToken, mode, actualTarget = null) {
  if (!badgeElement) return;

  badgeElement.onclick = async (event) => {
    event.preventDefault();
    event.stopPropagation();

    try {
      const { openTokenManagerWithMode } = await import('../api.js');
      const manager = await import('../managers/token-manager/TokenManager.js');

      const { tokenToOpen, modeToUse, rowTokenId } = buildTooltipTokenManagerRequest({
        observerToken,
        targetToken,
        mode,
        actualTarget,
      });

      // Open the manager and wait for it to render
      await openTokenManagerWithMode(tokenToOpen, modeToUse);

      // Get the app instance
      const app = manager.VisionerTokenManager.currentInstance;
      if (!app) {
        console.warn('PF2E Visioner | No TokenManager instance found');
        return;
      }

      // Wait for manager to be rendered, then highlight the row if it exists
      scheduleTokenManagerRowHighlight({ app, rowTokenId });
    } catch (error) {
      console.error('PF2E Visioner | Error opening token manager from tooltip:', error);
    }
  };
}

/**
 * Add a visibility indicator to a token
 * @param {Token} targetToken - The token to show the indicator on
 * @param {Token} observerToken - The token that has the visibility perspective
 * @param {string} visibilityState - The visibility state
 * @param {string} mode - 'observer' or 'target' mode
 * @param {Token} detectionTarget - In target mode, this is the token being detected (hoveredToken); in observer mode, it's the same as targetToken
 * @param {string|null|undefined} precomputedSenseUsed - Sense already read while deciding whether to render
 */
function addVisibilityIndicator(
  targetToken,
  observerToken,
  visibilityState,
  mode = 'observer',
  detectionTarget = null,
  precomputedSenseUsed = undefined,
) {
  const config = VISIBILITY_STATES[visibilityState];
  if (!config) return;

  // Check if AVS is enabled - only show sense badges if AVS is on
  const avsEnabled = game.settings?.get?.(MODULE_ID, 'autoVisibilityEnabled') ?? false;
  const senseUsed = resolveTooltipSenseUsed({
    avsEnabled,
    precomputedSenseUsed,
    visibilityState,
    observerToken,
    targetToken,
    detectionTarget,
    getDetectionBetween,
    blockedVisibilityStates: SENSE_BADGE_BLOCKED_VISIBILITY_STATES,
  });

  const indicator = createTooltipWorldAnchor(targetToken);

  const canvasRect = canvas.app.view.getBoundingClientRect();
  const sizeConfig = readTooltipSizeConfig({
    settings: game.settings,
    fallbackFontPx: HoverTooltips.tooltipFontSize,
    fallbackConfig: {
      fontPx: tooltipFontSize,
      iconPx: tooltipIconSize,
      borderPx: 3,
    },
  });
  const { badgeWidth, badgeHeight, spacing, borderRadius } = computeTooltipBadgeMetrics(sizeConfig);

  // Compute aligned positions using world->screen transform
  const globalPoint = canvas.tokens.toGlobal(new PIXI.Point(indicator.x, indicator.y));
  // If pf2e-hud is active, nudge badges downward to sit beneath its tooltip bubble
  const hudActive = !!game.modules?.get?.('pf2e-hud')?.active;
  const { centerX, centerY } = computeTooltipBadgeCenter({
    canvasRect,
    globalPoint,
    badgeHeight,
    hudActive,
  });
  const observerId = getTooltipTokenId(observerToken);
  const targetId = getTooltipTokenId(targetToken);
  const detectionTargetId = getTooltipTokenId(detectionTarget);

  const placeBadge = (leftPx, topPx, stateClass, iconClass, kind, tooltipLabel = '') => {
    const key = makeTooltipBadgePoolKey(
      'visibility',
      kind,
      mode,
      observerId,
      targetId,
      detectionTargetId,
      stateClass,
      badgeWidth,
      badgeHeight,
      borderRadius,
    );
    return showPooledTooltipElement(
      key,
      () =>
        createVisibilityTooltipBadge({
          left: leftPx,
          top: topPx,
          stateClass,
          iconClass,
          kind,
          tooltipLabel,
          badgeWidth,
          badgeHeight,
          borderRadius,
        }),
      leftPx,
      topPx,
    );
  };

  const placeSenseBadge = (leftPx, topPx, sense) => {
    const key = makeTooltipBadgePoolKey(
      'sense',
      mode,
      observerId,
      targetId,
      detectionTargetId,
      sense,
      badgeWidth,
      badgeHeight,
      borderRadius,
      sizeConfig.iconPx,
    );
    return showPooledTooltipElement(
      key,
      () =>
        createSenseTooltipBadge({
          left: leftPx,
          top: topPx,
          sense,
          badgeWidth,
          badgeHeight,
          borderRadius,
          iconPx: sizeConfig.iconPx,
        }),
      leftPx,
      topPx,
    );
  };

  const addSuppressionOverlay = (parentBadgeEl, suppressedSenses) => {
    return createSenseSuppressionOverlay({
      parentBadgeEl,
      suppressedSenses,
      iconPx: sizeConfig.iconPx,
      getSenseLabel: getSuppressedSenseLabel,
      formatTooltip: formatSuppressedSensesTooltip,
    });
  };

  const suppressedSenses = getTooltipSuppressedSenses({
    observerToken,
    targetToken,
    detectionTarget,
    suppressionBehavior: SenseSuppressionRegionBehavior,
  });

  if (visibilityState === 'observed') {
    if (senseUsed) {
      const sensePosition = computeSingleTooltipBadgePosition({
        centerX,
        centerY,
        badgeWidth,
      });
      indicator._senseBadgeEl = placeSenseBadge(sensePosition.left, sensePosition.top, senseUsed);
      addBadgeClickHandler(
        indicator._senseBadgeEl,
        observerToken,
        targetToken,
        mode,
        detectionTarget,
      );
      if (suppressedSenses) {
        indicator._suppressionBadgeEl = addSuppressionOverlay(
          indicator._senseBadgeEl,
          suppressedSenses,
        );
      }
    }
  } else {
    const badgePositions = computeTooltipBadgeStackPositions({
      centerX,
      centerY,
      badgeWidth,
      spacing,
      slots: senseUsed ? ['sense', 'visibility'] : ['visibility'],
    });

    if (senseUsed) {
      const sensePosition = badgePositions.sense;
      indicator._senseBadgeEl = placeSenseBadge(sensePosition.left, sensePosition.top, senseUsed);
      addBadgeClickHandler(
        indicator._senseBadgeEl,
        observerToken,
        targetToken,
        mode,
        detectionTarget,
      );
    }

    const visibilityPosition = badgePositions.visibility;
    indicator._visBadgeEl = placeBadge(
      visibilityPosition.left,
      visibilityPosition.top,
      visibilityState,
      config.icon,
      'visibility',
      getExplicitVisibilityStateLabel(visibilityState),
    );
    addBadgeClickHandler(indicator._visBadgeEl, observerToken, targetToken, mode, detectionTarget);

    if (suppressedSenses) {
      const targetEl = indicator._senseBadgeEl || indicator._visBadgeEl;
      indicator._suppressionBadgeEl = addSuppressionOverlay(targetEl, suppressedSenses);
    }
  }

  HoverTooltips.visibilityIndicators.set(targetToken.id, indicator);
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
    if (HoverTooltips._isPanning) {
      return;
    }

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
          stopBadgeTicker();
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
  if (HoverTooltips._isPanning) {
    return;
  }

  // Cache getBoundingClientRect to avoid layout thrashing (expensive DOM query)
  if (!HoverTooltips._canvasRectCache || HoverTooltips._canvasRectInvalidated) {
    HoverTooltips._canvasRectCache = canvas.app.view.getBoundingClientRect();
    HoverTooltips._canvasRectInvalidated = false;
  }
  const canvasRect = HoverTooltips._canvasRectCache;

  // Use cached sizes instead of reading from settings every frame
  const { badgeWidth, badgeHeight, spacing } = computeTooltipBadgeMetrics({
    iconPx: HoverTooltips.tooltipIconSize,
    borderPx: 3,
  });

  // Cache HUD active check (checking modules is expensive)
  if (HoverTooltips._hudActiveCache === undefined) {
    HoverTooltips._hudActiveCache = !!game.modules?.get?.('pf2e-hud')?.active;
  }

  const positionPoint = createTooltipPositionPoint(PIXI);

  HoverTooltips.visibilityIndicators.forEach((indicator) => {
    if (
      !indicator ||
      (!indicator._visBadgeEl && !indicator._coverBadgeEl && !indicator._senseBadgeEl)
    )
      return;
    const globalPoint = toGlobalTooltipPoint(canvas.tokens, positionPoint, indicator.x, indicator.y);
    const { centerX, centerY } = computeTooltipBadgeCenter({
      canvasRect,
      globalPoint,
      badgeHeight,
      hudActive: HoverTooltips._hudActiveCache,
    });

    const slots = [];
    if (indicator._senseBadgeEl) slots.push('sense');
    if (indicator._visBadgeEl) slots.push('visibility');
    if (indicator._coverBadgeEl) slots.push('cover');

    const badgePositions = computeTooltipBadgeStackPositions({
      centerX,
      centerY,
      badgeWidth,
      spacing,
      slots,
    });

    if (indicator._senseBadgeEl) {
      const { left, top } = badgePositions.sense;
      setTooltipBadgeTransform(indicator._senseBadgeEl, left, top);
    }
    if (indicator._visBadgeEl) {
      const { left, top } = badgePositions.visibility;
      setTooltipBadgeTransform(indicator._visBadgeEl, left, top);
    }
    if (indicator._coverBadgeEl) {
      const { left, top } = badgePositions.cover;
      setTooltipBadgeTransform(indicator._coverBadgeEl, left, top);
    }
  });

  // Also update standalone cover badges
  HoverTooltips.coverIndicators.forEach((indicator) => {
    if (!indicator || !indicator._coverBadgeEl) return;
    const globalPoint = toGlobalTooltipPoint(canvas.tokens, positionPoint, indicator.x, indicator.y);
    const { centerX, centerY } = computeTooltipBadgeCenter({
      canvasRect,
      globalPoint,
      badgeHeight,
      hudActive: HoverTooltips._hudActiveCache,
    });
    const { left, top } = computeSingleTooltipBadgePosition({
      centerX,
      centerY,
      badgeWidth,
    });
    setTooltipBadgeTransform(indicator._coverBadgeEl, left, top);
  });

  // Update factor badge positions (DOM-based)
  HoverTooltips.visibilityBadges.forEach((badge, key) => {
    if (!badge || !badge.badgeEl || !badge.isFactor) return;

    const token = canvas.tokens.get(badge.tokenId);
    if (!token) {
      // Clean up removed tokens
      destroyVisibilityBadge(badge);
      HoverTooltips.visibilityBadges.delete(key);
      return;
    }

    const worldPoint = computeVisibilityFactorBadgeWorldPoint({
      tokenX: token.x,
      tokenY: token.y,
      tokenBounds: token.bounds,
    });

    // Convert world coordinates to screen coordinates
    const globalPoint = toGlobalTooltipPoint(canvas.tokens, positionPoint, worldPoint.x, worldPoint.y);
    const placement = computeVisibilityFactorBadgePlacement({ canvasRect, globalPoint });

    setTooltipBadgeTransform(badge.badgeEl, placement.left, placement.top);
  });
}

/**
 * Add a cover indicator to a token
 * @param {Token} targetToken
 * @param {Token} observerToken
 * @param {string} coverState
 * @param {boolean} isManualCover - If true, adds a cog overlay to indicate manual cover
 */
function addCoverIndicator(targetToken, observerToken, coverState, isManualCover = false) {
  const config = COVER_STATES[coverState];
  if (!config) return;

  const indicator = createTooltipWorldAnchor(targetToken);

  const canvasRect = canvas.app.view.getBoundingClientRect();
  const sizeConfig = readTooltipSizeConfig({
    settings: game.settings,
    fallbackFontPx: HoverTooltips.tooltipFontSize,
    fallbackConfig: {
      fontPx: tooltipFontSize,
      iconPx: tooltipIconSize,
      borderPx: 3,
    },
  });
  const { badgeWidth, badgeHeight, borderRadius } = computeTooltipBadgeMetrics(sizeConfig);
  const globalPoint = canvas.tokens.toGlobal(new PIXI.Point(indicator.x, indicator.y));
  const hudActive = !!game.modules?.get?.('pf2e-hud')?.active;
  const { centerX, centerY } = computeTooltipBadgeCenter({
    canvasRect,
    globalPoint,
    badgeHeight,
    hudActive,
  });
  const { left, top } = computeSingleTooltipBadgePosition({
    centerX,
    centerY,
    badgeWidth,
  });

  const color = getTooltipCoverBadgeColor({
    colorblindMode: game.settings.get(MODULE_ID, 'colorblindMode'),
    coverState,
    fallbackColor: config.color,
  });

  const el = showPooledTooltipElement(
    makeTooltipBadgePoolKey(
      'cover',
      getTooltipTokenId(observerToken),
      getTooltipTokenId(targetToken),
      coverState,
      isManualCover ? 'manual' : 'auto',
      badgeWidth,
      badgeHeight,
      borderRadius,
    ),
    () =>
      createCoverTooltipBadge({
        left,
        top,
        iconClass: config.icon,
        color,
        badgeWidth,
        badgeHeight,
        borderRadius,
        isManualCover,
      }),
    left,
    top,
  );
  indicator._coverBadgeEl = el;

  addBadgeClickHandler(el, observerToken, targetToken, 'target');

  HoverTooltips.coverIndicators.set(targetToken.id + '|cover', indicator);
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
      hidePooledTooltipIndicator(indicator, ['_senseBadgeEl', '_visBadgeEl', '_coverBadgeEl']);
    } catch (e) {
      console.warn('PF2E Visioner: Error cleaning up indicator', e);
    }
  });

  // Clear the map
  HoverTooltips.visibilityIndicators.clear();

  // Clean up non-factor badges while keeping factor badges managed by their overlay lifecycle.
  const factorBadgesToKeep = new Map();
  HoverTooltips.visibilityBadges.forEach((badge, key) => {
    if (badge.isFactor) {
      factorBadgesToKeep.set(key, badge);
      return;
    }

    try {
      destroyVisibilityBadge(badge, { children: true });
    } catch (e) { }
  });

  HoverTooltips.visibilityBadges.clear();
  factorBadgesToKeep.forEach((badge, key) => {
    HoverTooltips.visibilityBadges.set(key, badge);
  });

  // Reset tracking variables to ensure clean state
  HoverTooltips.keyTooltipTokens.clear(); // Stop ticker when no indicators remain
  stopBadgeTickerIfNoBadgesRemain();
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
      hidePooledTooltipIndicator(indicator, ['_coverBadgeEl']);
    } catch (_) { }
  });
  HoverTooltips.coverIndicators.clear();
  stopBadgeTickerIfNoBadgesRemain();
}

/**
 * Cleanup hover tooltips
 */
export function cleanupHoverTooltips() {
  hideAllVisibilityIndicators();
  hideAllCoverIndicators();
  clearPendingHoverDebounce();
  clearHoverTooltipLifecycleTimers();
  unregisterHoverTooltipHooks();
  removeCanvasZoomGuard();
  removeCanvasPointerGuard();
  clearTooltipBadgePool();
  HoverTooltips.currentHoveredToken = null;
  HoverTooltips.isShowingKeyTooltips = false;
  HoverTooltips.keyTooltipTokens.clear();

  setTooltipMode('target');

  cleanupTokenEventListeners();

  _initialized = false;
  HoverTooltips._initialized = false;
}

/**
 * Show visibility factors overlay for controlled tokens
 * Similar to Alt/O keys but shows detailed reasons for visibility states
 */
export function showVisibilityFactorsOverlay() {
  if (HoverTooltips.isShowingFactorsOverlay) return;

  const controlledTokens = canvas.tokens.controlled;
  if (controlledTokens.length === 0) {
    const message = game.i18n.localize('PF2E_VISIONER.VISIBILITY_FACTORS.NO_TOKEN_SELECTED');
    ui.notifications?.info?.(message);
    return;
  }

  HoverTooltips.isShowingFactorsOverlay = true;
  HoverTooltips.factorsOverlayTokens = new Set();
  try {
    Hooks.call('pf2e-visioner:visibilityFactorsOverlay', { active: true });
  } catch (_) { }

  hideAllVisibilityIndicators();
  hideAllCoverIndicators();

  controlledTokens.forEach((observer) => {
    HoverTooltips.factorsOverlayTokens.add(observer.id);
    showFactorIndicatorsForToken(observer);
  });
}

/**
 * Hide visibility factors overlay
 */
export function hideVisibilityFactorsOverlay() {
  if (!clearVisibilityFactorOverlayState()) return;

  hideAllVisibilityIndicators();
  hideAllCoverIndicators();

  if (HoverTooltips.currentHoveredToken) {
    const tooltipsAllowed = canShowTooltips(
      HoverTooltips.tooltipMode,
      HoverTooltips.currentHoveredToken,
    );
    if (tooltipsAllowed) {
      showVisibilityIndicators(HoverTooltips.currentHoveredToken);
    }
  }
}

function hasVisibilityFactorBadges() {
  for (const badge of HoverTooltips.visibilityBadges.values()) {
    if (badge.isFactor) return true;
  }
  return false;
}

function clearVisibilityFactorOverlayState() {
  const wasActive =
    HoverTooltips.isShowingFactorsOverlay ||
    HoverTooltips.factorsOverlayTokens.size > 0 ||
    hasVisibilityFactorBadges();

  if (!wasActive) return false;

  HoverTooltips.isShowingFactorsOverlay = false;
  HoverTooltips.factorsOverlayTokens.clear();
  try {
    Hooks.call('pf2e-visioner:visibilityFactorsOverlay', { active: false });
  } catch (_) { }

  HoverTooltips.visibilityBadges.forEach((badge, key) => {
    if (badge.isFactor) {
      destroyVisibilityBadge(badge);
      HoverTooltips.visibilityBadges.delete(key);
    }
  });

  stopBadgeTickerIfNoBadgesRemain();
  return true;
}

/**
 * Show factor indicators for a specific token
 * @param {Token} observerToken - The observer token
 */
async function showFactorIndicatorsForToken(observerToken) {
  const otherTokens = getVisibilityFactorTargets(canvas.tokens.placeables, observerToken);
  if (otherTokens.length === 0) return;

  const { Pf2eVisionerApi } = await import('../api.js');
  const requests = await buildVisibilityFactorIndicatorRequests({
    observerToken,
    targetTokens: otherTokens,
    getVisibilityFactors: (observerId, targetId) =>
      Pf2eVisionerApi.getVisibilityFactors(observerId, targetId),
    formatFactors: (factors) =>
      formatVisibilityFactors(factors, {
        localize: (key) => game.i18n.localize(key),
        formatStateLabel: getExplicitVisibilityStateLabel,
      }),
    buildLines: (factors) =>
      buildVisibilityFactorTooltipLines(factors, {
        localize: (key) => game.i18n.localize(key),
        formatStateLabel: getExplicitVisibilityStateLabel,
      }),
    onError: (error) => {
      console.error('[Visibility Factors Error]', error);
    },
  });

  requests.forEach(({ targetToken, observerToken, factorText, factorLines, state }) => {
    addFactorIndicator(targetToken, observerToken, factorText, state, factorLines);
  });
}

/**
 * Add a factor indicator badge to a token
 * @param {Token} targetToken - The token to show the indicator on
 * @param {Token} observerToken - The observer token
 * @param {string} factorText - The text to display
 * @param {string} state - The visibility state
 * @param {Array<object|string>|null} factorLines - Structured tooltip lines
 */
function addFactorIndicator(targetToken, observerToken, factorText, state, factorLines = null) {
  if (!targetToken?.mesh) return;

  ensureBadgeTicker();

  const stateConfig = VISIBILITY_STATES[state] || VISIBILITY_STATES.observed;
  const badgeKey = `factor-${targetToken.id}-${observerToken.id}`;

  if (HoverTooltips.visibilityBadges.has(badgeKey)) return;

  const iconSize = tooltipIconSize || 16;
  const iconColor = resolveTooltipCssColor(stateConfig.color);

  // Create DOM-based badge like other tooltips
  const badgeEl = createVisibilityFactorBadge({
    iconClass: stateConfig.icon,
    iconColor,
    iconSize,
    bgSize: VISIBILITY_FACTOR_BADGE_SIZE,
  });

  document.body.appendChild(badgeEl);

  // Create tooltip element (hidden by default)
  const lines = factorLines ?? factorText.split('\n');
  const tooltipEl = createVisibilityFactorTooltip({ lines });

  document.body.appendChild(tooltipEl);

  // Show/hide tooltip on hover
  badgeEl.addEventListener('mouseenter', () => {
    tooltipEl.style.display = 'block';
    updateTooltipPosition();
  });

  badgeEl.addEventListener('mouseleave', () => {
    tooltipEl.style.display = 'none';
  });

  const updateTooltipPosition = () => {
    const badgeRect = badgeEl.getBoundingClientRect();
    const tooltipRect = tooltipEl.getBoundingClientRect();

    // Position tooltip to the right of badge
    const left = badgeRect.right + 5;
    const top = badgeRect.top + badgeRect.height / 2 - tooltipRect.height / 2;

    // No scaling - keep tooltip at normal size
    tooltipEl.style.transform = `translate(${left}px, ${top}px)`;
    tooltipEl.style.transformOrigin = 'left center';
  };

  HoverTooltips.visibilityBadges.set(badgeKey, {
    badgeEl,
    tooltipEl,
    tokenId: targetToken.id,
    observerId: observerToken.id,
    isFactor: true,
  });
}

// Export internal functions for use by lifesense indicators
export { hideAllCoverIndicators, hideAllVisibilityIndicators, showVisibilityIndicators };
