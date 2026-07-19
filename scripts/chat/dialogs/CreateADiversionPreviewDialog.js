/**
 * Create a Diversion Preview Dialog
 * Shows Create a Diversion results with GM override capability
 */

import { MODULE_ID } from '../../constants.js';
import { BaseActionDialog } from './base-action-dialog.js';
import {
  applyAllDiversionChanges,
  applyDiversionChange,
  revertAllDiversionChanges,
  revertDiversionChange,
} from './CreateADiversion/create-a-diversion-dialog-actions.js';
import { prepareCreateADiversionDialogContext } from './CreateADiversion/create-a-diversion-dialog-context.js';
import { FeatsHandler } from '../services/FeatsHandler.js';

// Store reference to current create a diversion dialog
let currentDiversionDialog = null;

export class CreateADiversionPreviewDialog extends BaseActionDialog {
  constructor(divertingToken, outcomes, changes, diversionData, options = {}) {
    // Set localized title before calling super
    if (!options.window) options.window = {};
    options.window.title =
      game?.i18n?.localize('PF2E_VISIONER.DIALOG_TITLES.CREATE_DIVERSION_RESULTS') ||
      'Create a Diversion Results';

    super(options);

    this.divertingToken = divertingToken;
    this.outcomes = outcomes;
    this.changes = changes;
    this.diversionData = diversionData;
    this.hasDistractingPerformance = FeatsHandler.hasFeat(
      divertingToken,
      'distracting-performance',
    );
    // Ensure services can resolve the correct handler
    this.actionData = {
      ...(diversionData || {}),
      actor: divertingToken,
      actionType: 'create-a-diversion',
    };
    this.encounterOnly = game.settings.get(MODULE_ID, 'defaultEncounterFilter');
    this.ignoreAllies = game.settings.get(MODULE_ID, 'ignoreAllies');
    // Visual filter default from per-user setting
    try {
      this.hideFoundryHidden = game.settings.get(MODULE_ID, 'hideFoundryHiddenTokens');
    } catch {
      this.hideFoundryHidden = true;
    }
    this.bulkActionState = 'initial'; // 'initial', 'applied', 'reverted'

    // Set global reference
    currentDiversionDialog = this;
  }

  static DEFAULT_OPTIONS = {
    tag: 'div',
    classes: ['pf2e-visioner', 'create-a-diversion-preview-dialog'],
    window: {
      title: game.i18n.localize('PF2E_VISIONER.DIALOG_TITLES.CREATE_DIVERSION_RESULTS'),
      icon: 'fas fa-theater-masks',
      resizable: true,
    },
    position: {
      width: 800,
      height: 'auto',
    },
    actions: {
      applyChange: CreateADiversionPreviewDialog._onApplyChange,
      revertChange: CreateADiversionPreviewDialog._onRevertChange,
      applyAll: CreateADiversionPreviewDialog._onApplyAll,
      revertAll: CreateADiversionPreviewDialog._onRevertAll,
      toggleEncounterFilter: CreateADiversionPreviewDialog._onToggleEncounterFilter,
      toggleFilterByDetection: CreateADiversionPreviewDialog._onToggleFilterByDetection,
      overrideState: CreateADiversionPreviewDialog._onOverrideState,
    },
  };

  static PARTS = {
    content: {
      template: 'modules/pf2e-visioner/templates/create-a-diversion-preview.hbs',
    },
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    return prepareCreateADiversionDialogContext(this, context);
  }

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

  /**
   * Get available visibility states for override
   */
  getAvailableStates() {
    return [];
  }

  // Token id in Diversion outcomes is under `observer`
  getOutcomeTokenId(outcome) {
    return outcome?.observer?.id ?? null;
  }

  /**
   * Calculate if there's an actionable change (considering overrides)
   */
  calculateHasActionableChange(outcome) {
    const effectiveNewState = outcome.overrideState || outcome.newVisibility;
    const oldState = outcome.currentVisibility;
    const isOldStateAvsControlled = this.isOldStateAvsControlled(outcome);

    // Use the SAME logic as Hide, Sneak, and Consequences
    if (isOldStateAvsControlled && effectiveNewState === 'avs') {
      // Old is AVS-controlled and new is AVS - no change
      return false;
    } else if (isOldStateAvsControlled) {
      // Old was AVS-controlled, but new is a manual state - always actionable
      return true;
    } else {
      // Old was NOT AVS-controlled - check if states match
      const statesMatch = oldState === effectiveNewState;
      return !statesMatch;
    }
  }

  /**
   * Get margin text for display
   */
  getMarginText(outcome) {
    const sign = outcome.margin >= 0 ? '+' : '';
    return `${sign}${outcome.margin}`;
  }

  /**
   * Get CSS class for outcome
   */
  // Use base outcome helpers

  /**
   * Handle render event
   */
  async _onRender(options) {
    await super._onRender(options);

    // Initialize encounter filter state
    const encounterFilter = this.element.querySelector(
      'input[data-action="toggleEncounterFilter"]',
    );
    if (encounterFilter) {
      encounterFilter.checked = this.encounterOnly;
    }

    try {
      const cbh = this.element.querySelector('input[data-action="toggleHideFoundryHidden"]');
      if (cbh) {
        cbh.onchange = null;
        cbh.addEventListener('change', async () => {
          this.hideFoundryHidden = !!cbh.checked;
          try {
            await game.settings.set(MODULE_ID, 'hideFoundryHiddenTokens', this.hideFoundryHidden);
          } catch {}
          this.render({ force: true });
        });
      }
    } catch {}

    // Wire ignore-allies checkbox if present
    try {
      const cb = this.element.querySelector('input[data-action="toggleIgnoreAllies"]');
      if (cb) {
        cb.checked = !!this.ignoreAllies;
        cb.addEventListener('change', () => {
          this.ignoreAllies = !!cb.checked;
          this.bulkActionState = 'initial';
          this.render({ force: true });
        });
      }
    } catch {}

    // Initialize bulk action buttons and handlers
    this.updateBulkActionButtons();
    this.addIconClickHandlers();
    this.markInitialSelections();

    // Selection-based highlighting parity
    this._applySelectionHighlight();
    if (!this._selectionHookId) {
      this._selectionHookId = Hooks.on('controlToken', () => this._applySelectionHighlight());
    }
  }

  getChangesCounterClass() {
    return 'create-a-diversion-preview-dialog-changes-count';
  }

  /**
   * Add hover listeners to highlight tokens on canvas when hovering over rows
   */
  _applySelectionHighlight() {
    try {
      this.element
        .querySelectorAll('tr.token-row.row-hover')
        ?.forEach((el) => el.classList.remove('row-hover'));
      const selected = Array.from(canvas?.tokens?.controlled ?? []);
      if (!selected.length) return;
      let firstRow = null;
      for (const tok of selected) {
        const row = this.element.querySelector(`tr[data-token-id="${tok.id}"]`);
        if (row) {
          row.classList.add('row-hover');
          if (!firstRow) firstRow = row;
        }
      }
      if (firstRow && typeof firstRow.scrollIntoView === 'function') {
        firstRow.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'nearest',
        });
      }
    } catch {}
  }

  /**
   * Handle individual apply change
   */
  static async _onApplyChange(event, button) {
    await applyDiversionChange(currentDiversionDialog, button);
  }

  /**
   * Handle individual revert change
   */
  static async _onRevertChange(event, button) {
    await revertDiversionChange(currentDiversionDialog, button);
  }

  /**
   * Handle apply all changes
   */
  static async _onApplyAll() {
    await applyAllDiversionChanges(currentDiversionDialog);
  }

  /**
   * Handle revert all changes
   */
  static async _onRevertAll() {
    await revertAllDiversionChanges(currentDiversionDialog);
  }

  /**
   * Handle encounter filter toggle
   */
  static async _onToggleEncounterFilter(event, target) {
    const app = currentDiversionDialog;
    if (!app) return;
    app.encounterOnly = target.checked;

    // Re-render with new filter
    await app.render({ force: true });
  }

  /**
   * Handle detection filter toggle
   */
  static async _onToggleFilterByDetection(event, target) {
    const app = currentDiversionDialog;
    if (!app) return;
    app.filterByDetection = target.checked;
    app.bulkActionState = 'initial';
    app.render({ force: true });
  }

  /**
   * Handle visibility state override
   */
  static async _onOverrideState(event, target) {
    const app = currentDiversionDialog;
    if (!app) return;

    const tokenId = target.dataset.tokenId;
    const newState = target.dataset.state;

    // Find the outcome and update override state
    const outcome = app.outcomes.find((o) => o.observer.id === tokenId);
    if (!outcome) return;

    // Toggle the override state
    if (outcome.overrideState === newState) {
      // Clicking the same state removes the override
      outcome.overrideState = null;
    } else {
      // Set new override state
      outcome.overrideState = newState;
    }

    // Recalculate hasActionableChange
    outcome.hasActionableChange = app.calculateHasActionableChange(outcome);

    // Update icon selection visually
    app.updateIconSelection(tokenId, outcome.overrideState);

    // Update action buttons for this row
    app.updateActionButtonsForToken(tokenId, outcome.hasActionableChange);
  }

  /**
   * Apply visibility change to a token using the shared utility function
   * @param {Token} observerToken - The observer token
   * @param {string} newVisibility - The new visibility state
   */
  async applyVisibilityChange() {}

  /**
   * Update row buttons to applied state
   */
  // removed: updateRowButtonsToApplied duplicated; using BaseActionDialog implementation

  /**
   * Update row buttons to reverted state
   */
  // removed: updateRowButtonsToReverted duplicated; using BaseActionDialog implementation

  /**
   * Update bulk action buttons based on state
   */
  // removed: updateBulkActionButtons duplicated; using BaseActionDialog implementation

  /**
   * Update icon selection visually
   */
  updateIconSelection(tokenId, selectedState) {
    const row = this.element.querySelector(`[data-token-id="${tokenId}"]`).closest('tr');
    const icons = row.querySelectorAll('.state-icon');

    icons.forEach((icon) => {
      const state = icon.dataset.state;
      if (state === selectedState) {
        icon.classList.add('selected');
      } else {
        icon.classList.remove('selected');
      }
    });

    // Update hidden input
    const hiddenInput = row.querySelector('input[type="hidden"]');
    if (hiddenInput) {
      hiddenInput.value = selectedState || '';
    }
  }

  /**
   * Update action buttons for a specific token
   */
  updateActionButtonsForToken(tokenId, hasActionableChange) {
    // Delegate to base which renders Apply/Revert or "No Change"
    super.updateActionButtonsForToken(tokenId, hasActionableChange);
  }

  /**
   * Add click handlers for state icons - Override to use AVS-aware logic
   */
  addIconClickHandlers() {
    if (!this.element || this.element.dataset.diversionStateIconDelegated === 'true') return;
    this.element.dataset.diversionStateIconDelegated = 'true';
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
      overrideIcons.querySelectorAll('.state-icon').forEach((i) => i.classList.remove('selected'));
      icon.classList.add('selected');
      const hiddenInput = overrideIcons?.querySelector('input[type="hidden"]');
      if (hiddenInput) hiddenInput.value = newState;
      let outcome = this.outcomes?.find?.(
        (o) => String(this.getOutcomeTokenId(o)) === String(targetId),
      );
      if (outcome) {
        outcome.overrideState = newState;

        // Use our AVS-aware calculation method
        const hasActionableChange = this.calculateHasActionableChange(outcome);

        // Persist actionable state on outcome so templates and bulk ops reflect immediately
        outcome.hasActionableChange = hasActionableChange;
        try {
          this.updateActionButtonsForToken(targetId || null, hasActionableChange, {
            row: icon.closest('tr'),
          });
        } catch {}
      }
    });
  }

  /**
   * Check if the old state is AVS-controlled
   * @param {Object} outcome - The outcome object containing target and observer information
   * @returns {boolean} True if the old state is AVS-controlled
   */
  isOldStateAvsControlled(outcome) {
    try {
      const avsEnabled = game.settings.get('pf2e-visioner', 'autoVisibilityEnabled');
      if (!avsEnabled) return false;

      const observer = outcome.target || outcome.observer;
      if (!observer) return false;

      const beneficiary = this.actionData?.diversionTarget || this.divertingToken;
      if (!beneficiary) return false;

      const observerId = observer.document?.id || observer.id;
      const flagKey = `avs-override-from-${observerId}`;

      if (beneficiary.document?.getFlag('pf2e-visioner', flagKey)) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }
}
