/**
 * ApplicationV2-based Visioner Token Manager
 * Handles both visibility and cover management for tokens
 */

import { getCoverMap, getVisibilityMap } from '../../utils.js';

import { MODULE_ID } from '../../constants.js';
import { bindTokenManagerActions } from './actions/index.js';
import {
  bulkSetWallState,
  toggleHideFoundryHidden,
  toggleIgnoreAllies,
  toggleIgnoreWalls,
} from './actions/ui.js';
import { attachApplyButtonAnimation } from './apply-button-animation.js';
import {
  addTokenBorder as addBorderUtil,
  removeTokenBorder as removeBorderUtil,
} from './borders.js';
import { TOKEN_MANAGER_DEFAULT_OPTIONS, TOKEN_MANAGER_PARTS } from './config.js';
import {
  applySelectionHighlight,
  attachCanvasHoverHandlers,
  attachSelectionHandlers,
  detachCanvasHoverHandlers,
  detachSelectionHandlers,
} from './highlighting.js';

export class VisionerTokenManager extends foundry.applications.api.ApplicationV2 {
  // Track the current instance to prevent multiple dialogs
  static currentInstance = null;
  static _canvasHoverHandlers = new Map();
  static _selectionHookId = null;

  static DEFAULT_OPTIONS = (() => {
    const cfg = JSON.parse(JSON.stringify(TOKEN_MANAGER_DEFAULT_OPTIONS));
    cfg.form.handler = VisionerTokenManager.formHandler;
    cfg.actions = {
      applyCurrent: VisionerTokenManager.applyCurrent,
      applyBoth: VisionerTokenManager.applyBoth,
      reset: VisionerTokenManager.resetAll,
      toggleMode: VisionerTokenManager.toggleMode,
      toggleEncounterFilter: VisionerTokenManager.toggleEncounterFilter,
      toggleIgnoreAllies: toggleIgnoreAllies,
      toggleIgnoreWalls: toggleIgnoreWalls,
      toggleHideFoundryHidden: toggleHideFoundryHidden,
      toggleTab: VisionerTokenManager.toggleTab,
      bulkPCAvs: VisionerTokenManager.bulkSetVisibilityState,
      bulkPCHidden: VisionerTokenManager.bulkSetVisibilityState,
      bulkPCUndetected: VisionerTokenManager.bulkSetVisibilityState,
      bulkPCConcealed: VisionerTokenManager.bulkSetVisibilityState,
      bulkPCObserved: VisionerTokenManager.bulkSetVisibilityState,
      bulkNPCAvs: VisionerTokenManager.bulkSetVisibilityState,
      bulkNPCHidden: VisionerTokenManager.bulkSetVisibilityState,
      bulkNPCUndetected: VisionerTokenManager.bulkSetVisibilityState,
      bulkNPCConcealed: VisionerTokenManager.bulkSetVisibilityState,
      bulkNPCObserved: VisionerTokenManager.bulkSetVisibilityState,
      bulkHazardsObserved: VisionerTokenManager.bulkSetVisibilityState,
      bulkHazardsHidden: VisionerTokenManager.bulkSetVisibilityState,
      bulkLootObserved: VisionerTokenManager.bulkSetVisibilityState,
      bulkLootHidden: VisionerTokenManager.bulkSetVisibilityState,
      bulkPCNoCover: VisionerTokenManager.bulkSetCoverState,
      bulkPCLesserCover: VisionerTokenManager.bulkSetCoverState,
      bulkPCStandardCover: VisionerTokenManager.bulkSetCoverState,
      bulkPCGreaterCover: VisionerTokenManager.bulkSetCoverState,
      bulkNPCNoCover: VisionerTokenManager.bulkSetCoverState,
      bulkNPCLesserCover: VisionerTokenManager.bulkSetCoverState,
      bulkNPCStandardCover: VisionerTokenManager.bulkSetCoverState,
      bulkNPCGreaterCover: VisionerTokenManager.bulkSetCoverState,
      bulkHazardsNoCover: VisionerTokenManager.bulkSetCoverState,
      bulkHazardsLesserCover: VisionerTokenManager.bulkSetCoverState,
      bulkHazardsStandardCover: VisionerTokenManager.bulkSetCoverState,
      bulkHazardsGreaterCover: VisionerTokenManager.bulkSetCoverState,
      bulkWallsObserved: bulkSetWallState,
      bulkWallsHidden: bulkSetWallState,
      cancelTimer: VisionerTokenManager.cancelTimer,
      toggleTimersSection: VisionerTokenManager.toggleTimersSection,
      toggleRowTimer: VisionerTokenManager.toggleRowTimer,
    };
    return cfg;
  })();

  static PARTS = TOKEN_MANAGER_PARTS;

  constructor(observer, options = {}) {
    super(options);
    this.observer = observer;
    this.visibilityData = getVisibilityMap(observer);
    this.coverData = getCoverMap(observer);

    // Smart default mode selection
    // If the token is controlled by current user, default to Target Mode ("how others see me")
    // Otherwise, default to Observer Mode ("how I see others")
    const isControlledByUser = observer.actor?.hasPlayerOwner && observer.isOwner;
    const isLootObserver = observer.actor?.type === 'loot';
    this.mode = isLootObserver
      ? 'target'
      : options.mode || (isControlledByUser ? 'target' : 'observer');

    // Initialize active tab (visibility or cover)
    this.activeTab = options.activeTab || 'visibility';

    // Initialize filters based on settings (defaults only)
    this.encounterOnly = game.settings.get(MODULE_ID, 'defaultEncounterFilter');
    this.ignoreAllies = game.settings.get(MODULE_ID, 'ignoreAllies');
    // Per-manager ignore walls toggle (UI convenience only)
    this.ignoreWalls = false;
    // Visual filter for Foundry-hidden tokens (per-user setting)
    this.hideFoundryHidden = game.settings.get(MODULE_ID, 'hideFoundryHiddenTokens');

    // Per-row timer durations: Map<tokenId, timerConfig>
    this.rowTimers = new Map();

    // Initialize storage for saved mode data
    this._savedModeData = {
      observer: { visibility: {}, cover: {} },
      target: { visibility: {}, cover: {} },
    };

    // Set this as the current instance
    VisionerTokenManager.currentInstance = this;

    // Set up auto-refresh when tokens move
    this._setupAutoRefresh();
  }

  // Bind extracted action handlers to this class once (static initialization)
  static {
    try {
      bindTokenManagerActions(VisionerTokenManager);
    } catch (_) {}
  }

  /**
   * Update the observer and refresh the dialog content
   * @param {Token} newObserver - The new observer token
   */
  updateObserver(newObserver) {
    this.observer = newObserver;
    this.visibilityData = getVisibilityMap(newObserver);
    this.coverData = getCoverMap(newObserver);

    // Update mode based on new observer
    const isControlledByUser = newObserver.actor?.hasPlayerOwner && newObserver.isOwner;
    const isLootObserver = newObserver.actor?.type === 'loot';
    this.mode = isLootObserver ? 'target' : isControlledByUser ? 'target' : 'observer';

    // Reset encounter filter to default for new observer
    this.encounterOnly = game.settings.get(MODULE_ID, 'defaultEncounterFilter');

    // Re-render the dialog with new data
    this.render({ force: true });
  }

  /**
   * Set up auto-refresh when tokens move or visibility changes
   * @private
   */
  _setupAutoRefresh() {
    // Refresh when any token moves
    this._updateTokenHook = Hooks.on('updateToken', (tokenDoc, changes) => {
      if (this.rendered && this.observer) {
        // Check if the observer token moved or if any relevant token moved
        if (
          tokenDoc.id === this.observer.id ||
          changes.x !== undefined ||
          changes.y !== undefined
        ) {
          // Small delay to allow AVS to process the movement
          setTimeout(() => {
            if (this.rendered) {
              this.render({ force: true });
            }
          }, 100);
        }
      }
    });

    // Refresh when visibility map changes (for sneaking tokens)
    this._visibilityChangeHook = Hooks.on('pf2e-visioner.visibilityChanged', (observerId) => {
      if (this.rendered && this.observer && observerId === this.observer.id) {
        // Small delay to ensure the change is fully processed
        setTimeout(() => {
          if (this.rendered) {
            this.render({ force: true });
          }
        }, 50);
      }
    });
  }

  /**
   * Clean up auto-refresh hooks
   * @private
   */
  _cleanupAutoRefresh() {
    if (this._updateTokenHook) {
      Hooks.off('updateToken', this._updateTokenHook);
      this._updateTokenHook = null;
    }
    if (this._visibilityChangeHook) {
      Hooks.off('pf2e-visioner.visibilityChanged', this._visibilityChangeHook);
      this._visibilityChangeHook = null;
    }
    if (this._timerRefreshInterval) {
      clearInterval(this._timerRefreshInterval);
      this._timerRefreshInterval = null;
    }
  }

  /**
   * Update the observer with a specific mode and refresh the dialog content
   * @param {Token} newObserver - The new observer token
   * @param {string} mode - The mode to use ('observer' or 'target')
   */
  updateObserverWithMode(newObserver, mode) {
    this.observer = newObserver;
    this.visibilityData = getVisibilityMap(newObserver);
    this.coverData = getCoverMap(newObserver);
    this.mode = newObserver.actor?.type === 'loot' ? 'target' : mode;

    // Reset encounter filter to default for new observer
    this.encounterOnly = game.settings.get(MODULE_ID, 'defaultEncounterFilter');

    // Re-render the dialog with new data
    this.render({ force: true });
  }

  /**
   * Prepare context data for the template
   */
  async _prepareContext(options) {
    const { buildContext } = await import('./context.js');
    return buildContext(this, options);
  }

  /**
   * Render the HTML for the application
   */
  async _renderHTML(context, options) {
    const html = await foundry.applications.handlebars.renderTemplate(
      this.constructor.PARTS.form.template,
      context,
    );
    return html;
  }

  /**
   * Replace the HTML content of the application
   */
  _replaceHTML(result, content, options) {
    content.innerHTML = result;
  }

  /**
   * Handle form submission
   */
  static async formHandler(event, form, formData) {
    const { formHandler } = await import('./actions/index.js');
    return formHandler.call(this, event, form, formData);
  }

  /**
   * Apply changes and close
   */
  static async applyCurrent(event, button) {
    const { applyCurrent } = await import('./actions/index.js');
    return applyCurrent.call(this, event, button);
  }

  /**
   * Apply both Visibility and Cover changes for the current mode
   */
  static async applyBoth(event, button) {
    const { applyBoth } = await import('./actions/index.js');
    return applyBoth.call(this, event, button);
  }

  /**
   * Reset all visibility and cover states
   */
  static async resetAll(event, button) {
    const { resetAll } = await import('./actions/index.js');
    return resetAll.call(this, event, button);
  }

  /**
   * Toggle between Observer and Target modes
   */
  static async toggleMode(event, button) {
    const { toggleMode } = await import('./actions/index.js');
    return toggleMode.call(this, event, button);
  }

  /**
   * Toggle between Visibility and Cover tabs
   */
  static async toggleTab(event, button) {
    const { toggleTab } = await import('./actions/index.js');
    return toggleTab.call(this, event, button);
  }

  /**
   * Toggle ignore allies filter
   */
  static async toggleIgnoreAllies(event, button) {
    return toggleIgnoreAllies.call(this, event, button);
  }

  /**
   * Toggle ignore walls filter
   */
  static async toggleIgnoreWalls(event, button) {
    return toggleIgnoreWalls.call(this, event, button);
  }

  /**
   * Toggle encounter filtering and refresh results
   */
  static async toggleEncounterFilter(event, button) {
    const { toggleEncounterFilter } = await import('./actions/index.js');
    return toggleEncounterFilter.call(this, event, button);
  }

  /**
   * Bulk set visibility state for tokens
   */
  static async bulkSetVisibilityState(event, button) {
    const { bulkSetVisibilityState } = await import('./actions/index.js');
    return bulkSetVisibilityState.call(this, event, button);
  }

  /**
   * Bulk set cover state for tokens
   */
  static async bulkSetCoverState(event, button) {
    const { bulkSetCoverState } = await import('./actions/index.js');
    return bulkSetCoverState.call(this, event, button);
  }

  /**
   * Override _onRender to add custom event listeners
   */
  _onRender(context, options) {
    super._onRender(context, options);
    try {
      const showOutcome = game.settings.get(MODULE_ID, 'integrateRollOutcome');
      if (showOutcome) {
        // Ensure sufficient width to display Outcome column fully
        const minWidth = 750;
        const current = this.position?.width ?? 0;
        if (!current || current < minWidth) {
          this.setPosition({ width: minWidth });
        }
      }
    } catch (_) {}
    // No row→token hover anymore (to avoid conflict with canvas→row). Keep icon handlers.
    // Provided by managers/token-manager/actions.js via bindTokenManagerActions
    // Setup canvas selection → row highlighting and canvas hover → row
    try {
      // Bind per-row icon click handlers (visibility/cover selection)
      this.addIconClickHandlers?.();
    } catch (_) {}
    try {
      // Add token image click handlers for panning and selection
      this.addTokenImageClickHandlers?.();
    } catch (_) {}
    try {
    } catch (_) {}
    attachSelectionHandlers(this.constructor);
    attachCanvasHoverHandlers(this.constructor);
    applySelectionHighlight(this.constructor);

    // Setup apply button animation for form changes
    try {
      attachApplyButtonAnimation(this);
    } catch (_) {}

    // Apply visual filter for Foundry-hidden tokens based on toggle
    try {
      const hide =
        this.hideFoundryHidden ?? game.settings.get(MODULE_ID, 'hideFoundryHiddenTokens');
      const rows =
        this.element?.querySelectorAll?.('tr.token-row[data-foundry-hidden="true"]') || [];
      rows.forEach((r) => {
        r.style.display = hide ? 'none' : '';
      });
    } catch (_) {}

    // Setup timer countdown refresh for realtime timers
    this._setupTimerRefresh();
  }

  _setupTimerRefresh() {
    if (this._timerRefreshInterval) {
      clearInterval(this._timerRefreshInterval);
    }
    this._timerRefreshInterval = setInterval(() => {
      this._updateTimerDisplays();
    }, 1000);
    this._updateTimerDisplays();
  }

  _getTimerRefreshRoot() {
    const el = this.element?.querySelectorAll ? this.element : this.element?.[0];
    const winEl = this.window?.element?.querySelectorAll
      ? this.window.element
      : this.window?.element?.[0];
    const winContent = this.window?.content?.querySelectorAll
      ? this.window.content
      : this.window?.content?.[0];
    return el || winEl || winContent || null;
  }

  _buildActiveTimerMap(activeTimers) {
    const timerMap = new Map();
    for (const timer of activeTimers) {
      const key = `${timer.observerId}-${timer.targetId}`;
      timerMap.set(key, timer);
    }
    return timerMap;
  }

  _getTimerFromMap(timerMap, observerId, targetId) {
    if (!observerId || !targetId) return null;
    return timerMap.get(`${observerId}-${targetId}`) || timerMap.get(`${targetId}-${observerId}`);
  }

  _updateActiveTimerRows(timerRows, timerMap, TimedOverrideManager) {
    for (const row of timerRows) {
      const obsId = row.dataset.observerId;
      const tgtId = row.dataset.targetId;
      const timer = this._getTimerFromMap(timerMap, obsId, tgtId);
      const displayEl = row.querySelector('.timer-display');
      if (displayEl && timer) {
        displayEl.textContent = TimedOverrideManager.getRemainingTimeDisplay(timer.timedOverride);
      }
    }
  }

  _updateTimerBadges(timerBadges, timerMap, TimedOverrideManager) {
    for (const badge of timerBadges) {
      const obsId = badge.dataset.observerId;
      const tgtId = badge.dataset.targetId;
      const timer = this._getTimerFromMap(timerMap, obsId, tgtId);
      if (!timer) continue;
      const display = TimedOverrideManager.getRemainingTimeDisplay(timer.timedOverride);
      const label = game.i18n.localize('PF2E_VISIONER.TIMED_OVERRIDE.ACTIVE_TIMER');
      badge.dataset.tooltip = `${label}: ${display}`;
    }
  }

  async _updateTimerDisplays() {
    if (!this.rendered) return;
    const root = this._getTimerRefreshRoot();
    if (!root) return;
    if (game.paused) return;
    const timerRows = root.querySelectorAll('.timer-row');
    const timerBadges = root.querySelectorAll('.timer-badge');
    if (timerRows.length === 0 && timerBadges.length === 0) return;

    try {
      if (game.settings.get(MODULE_ID, 'debug')) {
        const now = Date.now();
        this._lastTimerRefreshDebugTs = this._lastTimerRefreshDebugTs || 0;
        if (now - this._lastTimerRefreshDebugTs > 5000) {
          this._lastTimerRefreshDebugTs = now;
          console.debug('PF2E Visioner | TokenManager: timer refresh tick', {
            timerRows: timerRows.length,
            timerBadges: timerBadges.length,
            hasRoot: !!root,
            hasElement: !!this.element,
            hasWindowElement: !!this.window?.element,
            hasWindowContent: !!this.window?.content,
          });
        }
      }
    } catch (_) {}

    try {
      const { default: TimedOverrideManager } = await import(
        '../../services/TimedOverrideManager.js'
      );
      const observerId = this.observer?.document?.id;
      if (!observerId) return;

      const activeTimers = TimedOverrideManager.getActiveTimersForToken(observerId);
      const timerMap = this._buildActiveTimerMap(activeTimers);

      if (timerRows.length) this._updateActiveTimerRows(timerRows, timerMap, TimedOverrideManager);
      if (timerBadges.length) this._updateTimerBadges(timerBadges, timerMap, TimedOverrideManager);
    } catch (_) {}
  }

  /**
   * Clean up when closing
   */
  async close(options = {}) {
    // Clean up auto-refresh hooks
    this._cleanupAutoRefresh();

    // Clean up any remaining token borders
    this.cleanupAllTokenBorders();
    // Remove selection/hover handlers and clear row highlights
    detachSelectionHandlers(this.constructor);
    detachCanvasHoverHandlers(this.constructor);
    try {
      if (this.element) {
        this.element
          .querySelectorAll('tr.token-row.row-hover')
          ?.forEach((el) => el.classList.remove('row-hover'));
      }
    } catch (_) {}

    // Clear the current instance reference
    if (VisionerTokenManager.currentInstance === this) {
      VisionerTokenManager.currentInstance = null;
    }

    return super.close(options);
  }

  // Canvas hover handlers moved to managers/token-manager/highlighting.js

  /**
   * Selection-based row highlight handlers
   */

  /**
   * Clean up all token borders when closing the application
   */
  cleanupAllTokenBorders() {
    canvas.tokens.placeables.forEach((token) => {
      this.removeTokenBorder(token);
    });
  }

  /**
   * Add hover highlighting to help identify tokens on canvas
   */
  // Removed row→token hover to avoid conflicts with canvas→row highlight/scroll

  /**
   * Add click handlers for icon-based state selection
   */
  // Provided by managers/token-manager/actions.js via bindTokenManagerActions

  /**
   * Highlight or unhighlight a token on the canvas
   */
  highlightToken(token, highlight, strong = false) {
    if (!token || !token.mesh) return;

    if (highlight) {
      // Create a subtle border highlight instead of scaling/tinting
      this.addTokenBorder(token, strong);
    } else {
      // Remove the border highlight
      this.removeTokenBorder(token);
    }
  }

  /**
   * Add a subtle border around the token
   */
  addTokenBorder(token, strong = false) {
    addBorderUtil(token, strong);
  }

  /**
   * Remove the border highlight from a token
   */
  removeTokenBorder(token) {
    removeBorderUtil(token);
  }

  static async cancelTimer(event, target) {
    const observerId = target.dataset.observerId;
    const targetId = target.dataset.targetId;
    if (!observerId || !targetId) return;

    const { TimedOverrideManager } = await import('../../services/TimedOverrideManager.js');
    await TimedOverrideManager.cancelTimer(observerId, targetId);

    this.render({ force: true });
  }

  static toggleTimersSection(event, target) {
    const section = target.closest('.active-timers-section');
    if (!section) return;

    const isCollapsed = section.dataset.collapsed === 'true';
    section.dataset.collapsed = isCollapsed ? 'false' : 'true';
  }

  static async toggleRowTimer(event, target) {
    const tokenId = target.dataset.targetId;
    if (!tokenId) return;

    if (this.rowTimers.has(tokenId)) {
      this.rowTimers.delete(tokenId);
      this.render({ force: true });
      return;
    }

    try {
      const { TimerDurationDialog } = await import('../../ui/TimerDurationDialog.js');
      const app = this;
      const defaultActorId = app.observer?.actor?.id || null;
      await TimerDurationDialog.show({
        defaultActorId,
        onApply: (timerConfig) => {
          if (timerConfig) {
            app.rowTimers.set(tokenId, timerConfig);
            app.render({ force: true });
          }
        },
      });
    } catch (error) {
      console.error('PF2E Visioner | Error opening timer duration dialog:', error);
    }
  }

  getRowTimer(tokenId) {
    return this.rowTimers.get(tokenId) || null;
  }
}
