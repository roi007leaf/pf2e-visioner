import { MODULE_ID } from '../../constants.js';
import { getVisibilityStateConfig } from '../services/data/visibility-states.js';
import '../services/hbs-helpers.js';
import { filterOutcomesByEncounter, hasActiveEncounter } from '../services/infra/shared-utils.js';
import {
  updateBulkActionButtons as updateBulkActionButtonsInDom,
  updateChangesCount as updateChangesCountInDom,
  updateRowButtonsToApplied as updateRowButtonsToAppliedInDom,
  updateRowButtonsToReverted as updateRowButtonsToRevertedInDom,
} from '../services/ui/dialog-utils.js';
import {
  attachBulkOverrideHandlers,
  buildBulkOverrideStates,
  clearBulkOverrideState,
  deriveBulkStatesFromOutcomes,
  setBulkOverrideState,
} from './BaseAction/base-action-bulk-overrides.js';
import {
  applyAllBaseActionChanges,
  applyBaseActionChange,
  applyBaseActionTimedChange,
  revertAllBaseActionChanges,
  revertBaseActionChange,
} from './BaseAction/base-action-apply-revert.js';
import {
  attachDropdownHandlers,
  closeAllDropdowns,
  detachDropdownDocumentHandler,
  onDropdownToggle,
} from './BaseAction/base-action-dropdowns.js';
import {
  attachDelegatedRowTimerHandler,
  attachRowTimerHandlers,
  getRowTimer,
  injectTimerButtonsIfMissing,
  refreshRowTimerButtons,
  toggleRowTimer,
  updateRowTimerButton,
} from './BaseAction/base-action-row-timers.js';
import {
  addIconClickHandlers as addIconClickHandlersToRows,
  onStateIconClick,
  refreshRowActionButtons as refreshRowActionButtonsInDom,
  updateActionButtonsForToken as updateActionButtonsForTokenInDom,
} from './BaseAction/base-action-row-actions.js';
import { BasePreviewDialog } from './BasePreviewDialog.js';

export class BaseActionDialog extends BasePreviewDialog {
  constructor(options = {}) {
    super(options);
    this.bulkActionState = this.bulkActionState ?? 'initial';
    this.rowTimers = new Map();
    this._dropdownDocumentClickHandler = null;
    // Per-dialog visual filter: show only rows with actionable changes
    if (typeof this.showOnlyChanges === 'undefined') this.showOnlyChanges = false;
    // LOS filter: enabled out of combat by default, disabled in combat (UI disabled while in combat)
    try {
      // Default to enabled when out of combat, unless explicitly overridden
      if (typeof options.filterByDetection === 'boolean') {
        this.filterByDetection = options.filterByDetection;
      } else {
        const inCombat = hasActiveEncounter();
        this.filterByDetection = !inCombat;
      }
    } catch (err) {
      this.filterByDetection = false;
    }
  }

  getApplyDirection() {
    return 'observer_to_target';
  }

  getChangesCounterClass() {
    return null; // override in subclass if you want auto counting via dialog-utils
  }

  // Shared UI helpers
  visibilityConfig(state, options = {}) {
    return (
      getVisibilityStateConfig(state, options) || { icon: '', color: '', label: String(state ?? '') }
    );
  }

  resolveTokenImage(token) {
    try {
      return (
        token?.actor?.img ||
        token?.actor?.prototypeToken?.texture?.src ||
        token?.texture?.src ||
        token?.document?.texture?.src ||
        token?.img ||
        'icons/svg/mystery-man.svg'
      );
    } catch {
      return 'icons/svg/mystery-man.svg';
    }
  }

  formatMargin(margin) {
    const n = Number(margin);
    if (Number.isNaN(n)) return String(margin ?? '');
    return n >= 0 ? `+${n}` : `${n}`;
  }

  buildOverrideStates(desiredStates, outcome, options = {}) {
    const selectFrom = options.selectFrom || 'overrideState';
    const calcFrom = options.calcFrom || 'newVisibility';
    const selectedValue = outcome?.[selectFrom] || outcome?.[calcFrom] || null;
    const avsEnabled = game.settings.get(MODULE_ID, 'autoVisibilityEnabled');
    return desiredStates
      .filter((s) => typeof s === 'string' && s.length > 0)
      .filter((s) => s !== 'avs' || avsEnabled)
      .map((state) => ({
        value: state,
        ...this.visibilityConfig(state),
        selected: selectedValue === state,
        calculatedOutcome: outcome?.[calcFrom] === state,
      }));
  }

  /**
   * Check if a token's current visibility state is controlled by AVS (no manual override)
   * @param {Object} outcome - The outcome object containing token and visibility info
   * @returns {boolean} True if AVS is controlling the visibility, false if there's a manual override
   */
  isCurrentStateAvsControlled(outcome) {
    try {
      // Check if AVS is enabled
      const avsEnabled = game.settings.get(MODULE_ID, 'autoVisibilityEnabled');
      if (!avsEnabled) return false;

      // Get the token and observer from the outcome
      const token = outcome.target || outcome.token;
      const observer = outcome.observer || this.actionData?.actor;

      if (!token || !observer) return false;

      // Check for manual override flag
      // In most action dialogs, the override is stored on the target token with key from observer
      const hasOverride = !!token.document?.getFlag(
        MODULE_ID,
        `avs-override-from-${observer.document?.id || observer.id}`,
      );

      return !hasOverride; // If no override exists, AVS is controlling
    } catch {
      return false;
    }
  }

  /**
   * Check if a token's old visibility state is controlled by AVS (no manual override)
   * @param {Object} outcome - The outcome object containing token and visibility info
   * @returns {boolean} True if AVS is controlling the old visibility, false if there's a manual override
   */
  isOldStateAvsControlled(outcome) {
    try {
      // Walls, loot, and hazards never use AVS
      if (outcome._isWall) return false;

      const token = outcome.target || outcome.token;
      const isLoot = token?.actor?.type === 'loot';
      const isHazard = token?.actor?.type === 'hazard';
      if (isLoot || isHazard) return false;

      // Check if AVS is enabled
      const avsEnabled = game.settings.get(MODULE_ID, 'autoVisibilityEnabled');
      if (!avsEnabled) return false;

      // Get the observer from the outcome
      const observer = outcome.observer || this.actionData?.actor;

      if (!token || !observer) return false;

      // Check for manual override flag
      // In most action dialogs, the override is stored on the target token with key from observer
      const hasOverride = !!token.document?.getFlag(
        MODULE_ID,
        `avs-override-from-${observer.document?.id || observer.id}`,
      );

      return !hasOverride; // If no override exists, AVS is controlling
    } catch {
      return false;
    }
  }

  computeChangesCount(outcomes) {
    if (!Array.isArray(outcomes)) return 0;
    return outcomes.filter((o) => o?.hasActionableChange).length;
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    this._applySelectionHighlight();

    // Ensure bulk override buttons get listeners
    try {
      this._attachBulkOverrideHandlers();
    } catch { }

    // Attach dropdown toggle handlers
    try {
      this._attachDropdownHandlers();
    } catch { }

    // Attach row timer button handlers
    try {
      this._attachRowTimerHandlers();
    } catch { }
  }

  _attachRowTimerHandlers() {
    attachRowTimerHandlers(this);
  }

  _attachDelegatedRowTimerHandler() {
    attachDelegatedRowTimerHandler(this);
  }

  _refreshRowTimerButtons() {
    refreshRowTimerButtons(this);
  }

  _injectTimerButtonsIfMissing() {
    injectTimerButtonsIfMissing(this);
  }

  async _onToggleRowTimer(event, button = null) {
    await toggleRowTimer(this, event, button);
  }

  _updateRowTimerButton(tokenId) {
    updateRowTimerButton(this, tokenId);
  }

  getRowTimer(tokenId) {
    return getRowTimer(this, tokenId);
  }

  _attachDropdownHandlers() {
    attachDropdownHandlers(this);
  }

  _onDropdownToggle(event, toggle) {
    onDropdownToggle(this, event, toggle);
  }

  _detachDropdownDocumentHandler() {
    detachDropdownDocumentHandler(this);
  }

  _closeAllDropdowns() {
    closeAllDropdowns(this);
  }

  async close(options) {
    this._detachDropdownDocumentHandler();
    return super.close(options);
  }

  buildCommonContext(outcomes) {
    const changesCount = this.computeChangesCount(outcomes);

    return {
      changesCount,
      totalCount: Array.isArray(outcomes) ? outcomes.length : 0,
      showEncounterFilter: hasActiveEncounter(),
      encounterOnly: !!this.encounterOnly,
      // Per-dialog ignore-allies checkbox state (defaults from global setting)
      ignoreAllies: this.ignoreAllies,
      // LOS filter state; UI disables when in combat
      filterByDetection: !!this.filterByDetection,
      // Visual filter checkbox state
      showOnlyChanges: !!this.showOnlyChanges,
      bulkActionState: this.bulkActionState ?? 'initial',
      bulkOverrideStates:
        this._deriveBulkStatesFromOutcomes?.(outcomes) || this._buildBulkOverrideStates?.() || [],
    };
  }

  // ===== Bulk Override Helpers =====
  _buildBulkOverrideStates() {
    return buildBulkOverrideStates(this);
  }

  _deriveBulkStatesFromOutcomes(outcomes) {
    return deriveBulkStatesFromOutcomes(this, outcomes);
  }

  _attachBulkOverrideHandlers() {
    attachBulkOverrideHandlers(this);
  }

  _onBulkOverrideSet(event, button = null) {
    setBulkOverrideState(this, event, button);
  }

  _onBulkOverrideClear() {
    clearBulkOverrideState(this);
  }

  applyEncounterFilter(outcomes, tokenProperty, emptyNotice) {
    let filtered = filterOutcomesByEncounter(outcomes, this.encounterOnly, tokenProperty);
    if (filtered.length === 0 && this.encounterOnly && hasActiveEncounter()) {
      this.encounterOnly = false;
      filtered = outcomes;
    }
    return filtered;
  }

  async applyVisibilityChanges(seeker, changes, options = {}) {
    const { applyVisibilityChanges } = await import('../services/infra/shared-utils.js');
    const direction = options.direction || this.getApplyDirection();
    return applyVisibilityChanges(seeker, changes, { ...options, direction });
  }

  updateRowButtonsToApplied(outcomes) {
    // Normalize outcomes so helpers can locate rows regardless of shape
    // Some dialogs (e.g., Sneak) use `token` instead of `target`
    const normalized = Array.isArray(outcomes)
      ? outcomes.map((o) =>
        o?.rowId || o?.searchExplorationRowId
          ? { target: { id: o.rowId || o.searchExplorationRowId } }
          : o?.target?.id
            ? o
            : o?.token?.id
              ? { target: { id: o.token.id } }
              : o,
      )
      : outcomes;
    try {
      updateRowButtonsToAppliedInDom(this.element, normalized);
    } catch { }
  }

  updateRowButtonsToReverted(outcomes) {
    // Normalize outcomes so helpers can locate rows regardless of shape
    const normalized = Array.isArray(outcomes)
      ? outcomes.map((o) =>
        o?.rowId || o?.searchExplorationRowId
          ? { target: { id: o.rowId || o.searchExplorationRowId } }
          : o?.target?.id
            ? o
            : o?.token?.id
              ? { target: { id: o.token.id } }
              : o,
      )
      : outcomes;
    try {
      updateRowButtonsToRevertedInDom(this.element, normalized);
    } catch { }
    try {
      // After reverting, reset each row's selection to its initial calculated outcome
      if (!Array.isArray(outcomes)) return;
      for (const o of outcomes) {
        const tokenId = o?.target?.id;
        if (!tokenId) continue;
        const row = this.element?.querySelector?.(`tr[data-token-id="${tokenId}"]`);
        if (!row) continue;
        const container = row.querySelector('.override-icons');
        if (!container) continue;
        // Clear current selection
        container.querySelectorAll('.state-icon').forEach((i) => i.classList.remove('selected'));
        // Prefer icon marked as calculated outcome; fallback to the hidden input's value
        let selectedIcon = container.querySelector('.state-icon.calculated-outcome');
        if (!selectedIcon) {
          const hidden = container.querySelector('input[type="hidden"]');
          if (hidden)
            selectedIcon = container.querySelector(`.state-icon[data-state="${hidden.value}"]`);
        }
        if (selectedIcon) {
          selectedIcon.classList.add('selected');
          const state = selectedIcon.dataset.state;
          const hidden = container.querySelector('input[type="hidden"]');
          if (hidden) hidden.value = state;
        }
        // Clear any explicit override so selection reflects initial calculated state
        try {
          const outcome = this.outcomes?.find?.(
            (x) => String(this.getOutcomeTokenId(x)) === String(tokenId),
          );
          if (outcome) outcome.overrideState = null;
        } catch { }
      }
    } catch { }
  }

  updateBulkActionButtons() {
    try {
      updateBulkActionButtonsInDom(this.element, this.bulkActionState);
    } catch { }
  }

  updateChangesCount() {
    try {
      return updateChangesCountInDom(this.element, this.getChangesCounterClass());
    } catch {
      return 0;
    }
  }

  // Default token id resolver for outcomes; subclasses can override
  getOutcomeTokenId(outcome) {
    return outcome?.target?.id ?? null;
  }

  // Mark calculated selection (override if present, otherwise calculated)
  markInitialSelections() {
    try {
      if (!Array.isArray(this.outcomes)) return;
      for (const outcome of this.outcomes) {
        const tokenId = this.getOutcomeTokenId(outcome);
        if (!tokenId) continue;
        const row = this.element.querySelector(`tr[data-token-id="${tokenId}"]`);
        if (!row) continue;
        const container = row.querySelector('.override-icons');
        if (!container) continue;
        const desiredState = outcome.overrideState || outcome.newVisibility;
        container.querySelectorAll('.state-icon').forEach((i) => i.classList.remove('selected'));
        const icon = container.querySelector(`.state-icon[data-state="${desiredState}"]`);
        if (icon) icon.classList.add('selected');
      }
    } catch { }
  }

  // Outcome display helpers (string-based). Subclasses can override if needed
  getOutcomeClass(value) {
    return value && typeof value === 'string'
      ? value === 'criticalSuccess'
        ? 'critical-success'
        : value === 'criticalFailure'
          ? 'critical-failure'
          : value
      : '';
  }

  getOutcomeLabel(value) {
    if (!value || typeof value !== 'string') return '';
    const norm =
      value === 'criticalSuccess'
        ? 'critical-success'
        : value === 'criticalFailure'
          ? 'critical-failure'
          : value;

    switch (norm) {
      case 'critical-success':
        return 'Critical Success';
      case 'success':
        return 'Success';
      case 'failure':
        return 'Failure';
      case 'critical-failure':
        return 'Critical Failure';
      case 'out-of-range':
        return game.i18n.localize('PF2E_VISIONER.SEEK_AUTOMATION.OUT_OF_RANGE');
      case 'unmet-conditions':
        return game.i18n.localize('PF2E_VISIONER.SEEK_AUTOMATION.UNMET_CONDITIONS');
      default:
        return norm.charAt(0).toUpperCase() + norm.slice(1);
    }
  }

  // Default per-row buttons rendering. Subclasses may override for custom layouts.
  updateActionButtonsForToken(tokenId, hasActionableChange, opts = {}) {
    updateActionButtonsForTokenInDom(this, tokenId, hasActionableChange, opts);
  }

  addIconClickHandlers() {
    addIconClickHandlersToRows(this);
  }

  _onStateIconClick(event) {
    onStateIconClick(this, event);
  }

  // Refresh per-row Actions column to show Apply/Revert buttons only when the state changes from old
  refreshRowActionButtons() {
    refreshRowActionButtonsInDom(this);
  }
  /**
   * Generic apply change handler that can be used by all action dialogs
   * @param {Event} event - Click event
   * @param {HTMLElement} target - Button element
   * @param {Object} context - Dialog context with app instance and apply function
   */
  static async onApplyChange(event, target, context) {
    return applyBaseActionChange(event, target, context);
  }

  static async onApplyChangeTimed(event, target, context) {
    return applyBaseActionTimedChange(event, target, context);
  }

  /**
   * Generic revert change handler that can be used by all action dialogs
   * @param {Event} event - Click event
   * @param {HTMLElement} target - Button element
   * @param {Object} context - Dialog context with app instance
   */
  static async onRevertChange(event, target, context) {
    return revertBaseActionChange(event, target, context);
  }

  /**
   * Generic apply all handler that can be used by all action dialogs
   * @param {Event} event - Click event
   * @param {HTMLElement} target - Button element
   * @param {Object} context - Dialog context with app instance and apply function
   */
  static async onApplyAll(event, target, context) {
    return applyAllBaseActionChanges(event, target, context);
  }

  /**
   * Generic revert all handler that can be used by all action dialogs
   * @param {Event} event - Click event
   * @param {HTMLElement} target - Button element
   * @param {Object} context - Dialog context with app instance
   */
  static async onRevertAll(event, target, context) {
    return revertAllBaseActionChanges(event, target, context);
  }
}
