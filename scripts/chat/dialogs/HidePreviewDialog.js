/**
 * Hide Preview Dialog for Hide action automation
 * Uses ApplicationV2 for modern FoundryVTT compatibility
 */

import { MODULE_ID, MODULE_TITLE } from '../../constants.js';
import { getDesiredOverrideStatesForAction } from '../services/data/action-state-config.js';
import { notify } from '../services/infra/notifications.js';
import { getHideOverrideVisibilityForActor } from './Hide/hide-override-visibility.js';
import {
  getHideDialogFilteredOutcomes,
  prepareHideDialogContext,
} from './Hide/hide-dialog-context.js';
import {
  applyAllHideDialogChanges,
  applyHideDialogChange,
  revertAllHideDialogChanges,
  revertHideDialogChange,
} from './Hide/hide-dialog-actions.js';
import {
  hideEndPositionQualifies,
  recalculateHideOutcomeVisibility,
  toggleHidePositionPrerequisite,
} from './Hide/hide-position-qualification.js';
import { BaseActionDialog } from './base-action-dialog.js';

// Store reference to current hide dialog
let currentHideDialog = null;

export class HidePreviewDialog extends BaseActionDialog {
  static get currentHideDialog() {
    return currentHideDialog;
  }

  static DEFAULT_OPTIONS = {
    tag: 'div',
    classes: ['pf2e-visioner', 'hide-preview-dialog'],
    window: {
      title: game.i18n.localize('PF2E_VISIONER.DIALOG_TITLES.HIDE_RESULTS'),
      icon: 'fas fa-mask',
      resizable: true,
    },
    position: {
      width: 950,
      height: 'auto',
    },
    actions: {
      close: HidePreviewDialog._onClose,
      applyAll: HidePreviewDialog._onApplyAll,
      revertAll: HidePreviewDialog._onRevertAll,
      applyChange: HidePreviewDialog._onApplyChange,
      revertChange: HidePreviewDialog._onRevertChange,
      toggleEncounterFilter: HidePreviewDialog._onToggleEncounterFilter,
      toggleFilterByDetection: HidePreviewDialog._onToggleFilterByDetection,
      overrideState: HidePreviewDialog._onOverrideState,
      togglePrequisite: HidePreviewDialog._onTogglePrequisite,
      bulkOverrideSet: HidePreviewDialog._onBulkOverrideSet,
      bulkOverrideClear: HidePreviewDialog._onBulkOverrideClear,
    },
  };

  static PARTS = {
    content: {
      template: 'modules/pf2e-visioner/templates/hide-preview.hbs',
    },
  };

  constructor(actorToken, outcomes, changes, actionData, options = {}) {
    // Set window title and icon for hide dialog
    options.window = {
      ...options.window,
      title: game.i18n.localize('PF2E_VISIONER.DIALOG_TITLES.HIDE_RESULTS'),
      icon: 'fas fa-eye-slash',
    };

    super(options);

    this.actorToken = actorToken;
    this.outcomes = outcomes || [];
    // Preserve an immutable base list for live filtering toggles
    try {
      this._originalOutcomes = Array.isArray(outcomes) ? [...outcomes] : [];
    } catch {
      this._originalOutcomes = outcomes || [];
    }
    this.changes = changes || [];
    this.actionData = { ...(actionData || {}), actionType: 'hide' };
    this.encounterOnly = game.settings.get(MODULE_ID, 'defaultEncounterFilter');
    this.ignoreAllies = game.settings.get(MODULE_ID, 'ignoreAllies');
    this.bulkActionState = 'initial'; // Track bulk action state
    // Visual filter default from per-user setting
    try {
      this.hideFoundryHidden = game.settings.get(MODULE_ID, 'hideFoundryHiddenTokens');
    } catch {
      this.hideFoundryHidden = true;
    }

    // Store reference for singleton behavior
    currentHideDialog = this;
  }

  /**
   * Called after the dialog is first rendered to set up event handlers
   */
  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    this.addIconClickHandlers();
    this.markInitialSelections();
    this.updateChangesCount();
    try {
      const cb = this.element.querySelector('input[data-action="toggleIgnoreAllies"]');
      if (cb)
        cb.addEventListener('change', () => {
          this.ignoreAllies = !!cb.checked;
          this.bulkActionState = 'initial';
          // Recompute filtered list and preserve overrides before re-rendering
          this.getFilteredOutcomes()
            .then((list) => {
              this.outcomes = list;
              this.render({ force: true });
            })
            .catch(() => this.render({ force: true }));
        });
    } catch { }
  }

  /**
   * Add hover listeners to highlight tokens on canvas
   */
  // Selection highlight handled by BasePreviewDialog

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    return prepareHideDialogContext(this, context);
  }

  /**
   * Get filtered outcomes based on current filter settings
   * @returns {Array} Filtered outcomes
   */
  async getFilteredOutcomes() {
    return getHideDialogFilteredOutcomes(this);
  }

  // Token id in Hide outcomes is under `target`
  getOutcomeTokenId(outcome) {
    return outcome?.target?.id ?? null;
  }

  /**
   * Get available visibility states for an outcome based on Hide rules
   * Hide can only make you hidden from observers who can currently see you
   */
  getAvailableStatesForOutcome(outcome) {
    const desired = getDesiredOverrideStatesForAction('hide');
    const built = this.buildOverrideStates(desired, outcome);
    // Inject labels expected by template
    return built.map((s) => ({ ...s, label: this.getStateLabel(s.value) }));
  }

  getStateLabel(state) {
    return this.visibilityConfig(state)?.label || state;
  }

  // Use base outcome helpers

  /**
   * Render the HTML for the application
   */
  async _renderHTML(context) {
    const html = await foundry.applications.handlebars.renderTemplate(
      this.constructor.PARTS.content.template,
      context,
    );

    return html;
  }

  /**
   * Replace the HTML content of the application
   */
  _replaceHTML(result, content) {
    content.innerHTML = result;

    return content;
  }

  async _onRender(context, options) {
    super._onRender(context, options);
    this.addIconClickHandlers();
    this.markInitialSelections();
    this.updateBulkActionButtons();
    this.updateChangesCount();

    // Wire Hide Foundry-hidden visual filter toggle on every render so it persists after re-render
    try {
      const cbh = this.element.querySelector('input[data-action="toggleHideFoundryHidden"]');
      if (cbh) {
        cbh.onchange = null; // prevent duplicate handlers on subsequent renders
        cbh.addEventListener('change', async () => {
          this.hideFoundryHidden = !!cbh.checked;
          try {
            await game.settings.set(MODULE_ID, 'hideFoundryHiddenTokens', this.hideFoundryHidden);
          } catch { }
          this.render({ force: true });
        });
      }
    } catch { }
  }

  /**
   * Mark the initial calculated outcomes as selected
   */
  markInitialSelections() {
    this.outcomes.forEach((outcome) => {
      // Mark the effective state (override if present, otherwise calculated) as selected in the UI
      let effectiveState = outcome.overrideState ?? outcome.newVisibility;

      const isOldStateAvsControlled = this.isOldStateAvsControlled(outcome);
      if (effectiveState === 'avs' && isOldStateAvsControlled && outcome._calculatedNewVisibility) {
        effectiveState = outcome._calculatedNewVisibility;
      }

      // Recompute actionable flag for UI buttons using the SAME logic as _prepareContext
      try {
        const oldState = outcome.oldVisibility ?? outcome.currentVisibility ?? null;

        // Use the SAME logic as _prepareContext and addIconClickHandlers
        let hasActionableChange = false;
        if (isOldStateAvsControlled && effectiveState === 'avs') {
          // Old is AVS-controlled and new is AVS - no change
          hasActionableChange = false;
        } else if (isOldStateAvsControlled) {
          // Old was AVS-controlled, but new is a manual state - always actionable
          hasActionableChange = true;
        } else {
          // Old was NOT AVS-controlled - check if states match
          const statesMatch = oldState === effectiveState;
          hasActionableChange = !statesMatch;
        }

        outcome.hasActionableChange = hasActionableChange;

        const tokenId = outcome?.target?.id ?? null;
        if (tokenId) this.updateActionButtonsForToken(tokenId, outcome.hasActionableChange);
      } catch { }
      const row = this.element.querySelector(`tr[data-token-id="${outcome.target.id}"]`);
      if (row) {
        const container = row.querySelector('.override-icons');
        if (container) {
          container.querySelectorAll('.state-icon').forEach((i) => i.classList.remove('selected'));
          let iconEl = container.querySelector(`.state-icon[data-state="${effectiveState}"]`);
          if (!iconEl && effectiveState === 'undetected') {
            iconEl = container.querySelector('.state-icon[data-state="hidden"]');
          }
          if (!iconEl) {
            iconEl = container.querySelector('.state-icon[data-state="observed"]');
          }
          if (iconEl) iconEl.classList.add('selected');
        }
      }
    });
  }

  // Override addIconClickHandlers to use our AVS-aware logic
  addIconClickHandlers() {
    if (!this.element || this.element.dataset.hideStateIconDelegated === 'true') return;
    this.element.dataset.hideStateIconDelegated = 'true';
    this.element.addEventListener('click', (event) => {
      const icon = event.target?.closest?.('.state-icon');
      if (!icon || !this.element?.contains?.(icon)) return;

        // Only handle clicks within override selection container
        const overrideIcons = icon.closest('.override-icons');
        if (!overrideIcons) return;

        // Robustly resolve target id from data attributes or row
        let targetId = icon.dataset.target || icon.dataset.tokenId;
        if (!targetId) {
          const row = icon.closest('tr[data-token-id]');
          targetId = row?.dataset?.tokenId;
        }
        const newState = icon.dataset.state;
        overrideIcons
          .querySelectorAll('.state-icon')
          .forEach((i) => i.classList.remove('selected'));
        icon.classList.add('selected');
        const hiddenInput = overrideIcons?.querySelector('input[type="hidden"]');
        if (hiddenInput) hiddenInput.value = newState;
        let outcome = this.outcomes?.find?.(
          (o) => String(this.getOutcomeTokenId(o)) === String(targetId),
        );
        if (outcome) {
          outcome.overrideState = newState;

          // Check ALL tokens for the hiding actor to find override flags (multi-token actor support)
          // In Hide, outcome.target is the observer (opposite of Sneak)
          const observerId = outcome.target?.document?.id || outcome.target?.id;

          let currentVisibility = outcome.oldVisibility ?? outcome.currentVisibility ?? null;
          currentVisibility =
            getHideOverrideVisibilityForActor(this.actorToken?.actor?.id, observerId) ||
            currentVisibility;

          const oldState = currentVisibility;


          // Use our AVS-aware logic instead of the base logic
          const isOldStateAvsControlled = this.isOldStateAvsControlled(outcome);

          const statesMatch = oldState != null && newState != null && newState === oldState;

          // Special case: if old state is AVS-controlled and user selects AVS bolt, no change
          let hasActionableChange = false;
          if (isOldStateAvsControlled && newState === 'avs') {
            hasActionableChange = false;
          } else if (isOldStateAvsControlled) {
            // Old was AVS-controlled, but user is selecting a manual state - always actionable
            hasActionableChange = true;
          } else {
            // Old was NOT AVS-controlled - check if states match
            hasActionableChange = !statesMatch;
          }


          // Persist actionable state on outcome so templates and bulk ops reflect immediately
          outcome.hasActionableChange = hasActionableChange;
          try {
            this.updateActionButtonsForToken(targetId || null, hasActionableChange, {
              row: icon.closest('tr'),
            });
          } catch { }
        }
    });
  }

  updateActionButtonsForToken(tokenId, hasActionableChange) {
    // Delegate to base which renders Apply/Revert or "No Change"
    super.updateActionButtonsForToken(tokenId, hasActionableChange);
  }

  /**
   * Updates the changes count in the dialog footer
   */
  // removed: updateChangesCount duplicated; using BaseActionDialog implementation

  // removed: updateBulkActionButtons duplicated; using BaseActionDialog implementation

  // consolidated handlers defined later in file

  /**
   * Handle applying a visibility change for a single token
   */
  // consolidated handlers defined later in file

  /**
   * Handle reverting a visibility change for a single token
   */
  // consolidated handlers defined later in file

  /**
   * Handle applying a visibility change for a single token
   * @param {string} tokenId - The ID of the token to apply changes for
   */
  // consolidated handlers defined later in file

  /**
   * Handle reverting a visibility change for a single token
   * @param {string} tokenId - The ID of the token to revert changes for
   */
  // consolidated handlers defined later in file

  // consolidated handlers defined later in file

  // consolidated handlers defined later in file

  // consolidated handlers defined later in file

  static async _onToggleEncounterFilter(event, target) {
    const app = currentHideDialog;
    if (!app) {
      return;
    }

    // Toggle the filter state
    app.encounterOnly = target.checked;

    // Reset bulk action state
    app.bulkActionState = 'initial';

    // Re-render the dialog - _prepareContext will handle the filtering
    app.render({ force: true });
  }

  static async _onToggleFilterByDetection(event, target) {
    const app = currentHideDialog;
    if (!app) return;
    app.filterByDetection = target.checked;
    app.bulkActionState = 'initial';
    // Recompute filtered outcomes and preserve overrides before re-rendering
    try {
      const list = await app.getFilteredOutcomes();
      if (Array.isArray(list)) app.outcomes = list;
    } catch { }
    app.render({ force: true });
  }

  static async _onOverrideState() {
    // This is handled by the icon click handlers
    // Placeholder for future functionality if needed
  }

  // Use services path for apply/revert; no custom applyVisibilityChanges override needed

  // removed: updateRowButtonsToApplied duplicated; using BaseActionDialog implementation

  // removed: updateRowButtonsToReverted duplicated; using BaseActionDialog implementation

  getChangesCounterClass() {
    return 'hide-preview-dialog-changes-count';
  }

  // Static button handler methods
  static async _onClose(event, target) {
    currentHideDialog = null;
    return super._onClose?.(event, target);
  }

  static async _onApplyAll() {
    return applyAllHideDialogChanges(currentHideDialog);
  }

  static async _onRevertAll() {
    return revertAllHideDialogChanges(currentHideDialog);
  }

  static async _onApplyChange(event, target) {
    return applyHideDialogChange(currentHideDialog, target);
  }

  static async _onRevertChange(event, target) {
    return revertHideDialogChange(currentHideDialog, target);
  }

  /**
   * Hide end-position prerequisite: concealed OR standard/greater cover
   */
  _endPositionQualifiesForHide(endPos) {
    return hideEndPositionQualifies(this, endPos);
  }

  /**
   * Recalculates newVisibility for an outcome based on current position qualifications
   * @param {Object} outcome - The outcome object to recalculate
   */
  async _recalculateNewVisibilityForOutcome(outcome) {
    return recalculateHideOutcomeVisibility(this, outcome);
  }

  static async _onTogglePrequisite(event, target) {
    return toggleHidePositionPrerequisite(currentHideDialog, target);
  }

  // Bulk override action handlers

  static _onBulkOverrideSet(event, target) {
    const app = currentHideDialog;
    if (!app) return;
    app._onBulkOverrideSet(event);
  }

  static _onBulkOverrideClear(event, target) {
    const app = currentHideDialog;
    if (!app) return;
    app._onBulkOverrideClear();
  }

  /**
   * Check if the old visibility state is AVS-controlled (no manual override exists)
   * @param {Object} outcome - The outcome object containing target and observer information
   * @returns {boolean} True if the old state is AVS-controlled
   */
  isOldStateAvsControlled(outcome) {
    try {
      const avsEnabled = game.settings.get('pf2e-visioner', 'autoVisibilityEnabled');
      if (!avsEnabled) return false;

      const observer = outcome.target;
      if (!observer) return false;

      const hidingToken = this.actorToken;
      if (!hidingToken) return false;

      const observerId = observer.document?.id || observer.id;
      const flagKey = `avs-override-from-${observerId}`;

      if (hidingToken.document?.getFlag('pf2e-visioner', flagKey)) {
        return false;
      }

      return true;
    } catch (error) {
      console.warn('Error checking if old state is AVS-controlled:', error);
      return false;
    }
  }

  /**
   * Check if the current visibility state is AVS-controlled (no manual override exists)
   * @param {Object} outcome - The outcome object containing target and observer information
   * @returns {boolean} True if the current state is AVS-controlled
   */
  isCurrentStateAvsControlled(outcome) {
    try {
      const avsEnabled = game.settings.get('pf2e-visioner', 'autoVisibilityEnabled');
      if (!avsEnabled) return false;

      const observer = outcome.target;
      if (!observer) return false;

      const hidingToken = this.actorToken;
      if (!hidingToken) return false;

      const observerId = observer.document?.id || observer.id;
      const flagKey = `avs-override-from-${observerId}`;

      if (hidingToken.document?.getFlag('pf2e-visioner', flagKey)) {
        return false;
      }

      return true;
    } catch (error) {
      console.warn('Error checking if current state is AVS-controlled:', error);
      return false;
    }
  }
}
