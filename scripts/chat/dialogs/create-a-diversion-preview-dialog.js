/**
 * Create a Diversion Preview Dialog
 * Shows Create a Diversion results with GM override capability
 */

import { MODULE_ID, MODULE_TITLE } from '../../constants.js';
import { getDesiredOverrideStatesForAction } from '../services/data/action-state-config.js';
import { notify } from '../services/infra/notifications.js';
import { BaseActionDialog } from './base-action-dialog.js';

// Store reference to current create a diversion dialog
let currentDiversionDialog = null;

export class CreateADiversionPreviewDialog extends BaseActionDialog {
  constructor(divertingToken, outcomes, changes, diversionData, options = {}) {
    super(options);

    this.divertingToken = divertingToken;
    this.outcomes = outcomes;
    this.changes = changes;
    this.diversionData = diversionData;
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
      title: `Create a Diversion Results`,
      icon: 'fas fa-theater-masks',
      resizable: true,
    },
    position: {
      width: 600,
      height: 'auto',
    },
    actions: {
      applyChange: CreateADiversionPreviewDialog._onApplyChange,
      revertChange: CreateADiversionPreviewDialog._onRevertChange,
      applyAll: CreateADiversionPreviewDialog._onApplyAll,
      revertAll: CreateADiversionPreviewDialog._onRevertAll,
      toggleEncounterFilter: CreateADiversionPreviewDialog._onToggleEncounterFilter,
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

    // Filter outcomes with base helper
    let processedOutcomes = this.applyEncounterFilter(
      this.outcomes,
      'observer',
      'No encounter observers found, showing all',
    );
    // Ensure the acting/diverting token never appears in the list
    try {
      const actorId = this.divertingToken?.id || this.divertingToken?.document?.id;
      if (actorId) {
        processedOutcomes = processedOutcomes.filter((o) => o?.observer?.id !== actorId);
      }
  } catch {}

    // Apply ignore-allies filtering for display
    try {
      const { filterOutcomesByAllies } = await import('../services/infra/shared-utils.js');
      processedOutcomes = filterOutcomesByAllies(
        processedOutcomes,
        this.divertingToken,
        this.ignoreAllies,
        'observer',
      );
  } catch {}

  // Prepare outcomes with additional UI data
    processedOutcomes = processedOutcomes.map((outcome) => {
      const desired = getDesiredOverrideStatesForAction('create-a-diversion');
      const availableStates = this.buildOverrideStates(desired, outcome).map((s) => ({
        key: s.value,
        icon: s.icon,
        label: s.label,
        selected: s.selected,
        calculatedOutcome: s.calculatedOutcome,
      }));

      const effectiveNewState = outcome.overrideState || outcome.newVisibility;
      const baseOldState = outcome.currentVisibility;
      const hasActionableChange =
        baseOldState != null && effectiveNewState != null && effectiveNewState !== baseOldState;

      return {
        ...outcome,
        availableStates,
        hasActionableChange,
        overrideState: outcome.overrideState || null,
        tokenImage:
          outcome.observer.document?.texture?.src ||
          outcome.observer.img ||
          'icons/svg/mystery-man.svg',
        outcomeClass: this.getOutcomeClass(outcome.outcome),
        outcomeLabel: this.getOutcomeLabel(outcome.outcome),
      };
    });

    // Visual filtering: hide Foundry-hidden tokens from display if enabled
    try {
      if (this.hideFoundryHidden) {
        processedOutcomes = processedOutcomes.filter((o) => o?.observer?.document?.hidden !== true);
      }
    } catch { }

    // Show-only-changes visual filter
    try {
      if (this.showOnlyChanges) {
        processedOutcomes = processedOutcomes.filter((o) => !!o.hasActionableChange);
      }
    } catch { }

    // Prepare diverting token with proper image path
    context.divertingToken = {
      ...this.divertingToken,
      image: this.resolveTokenImage(this.divertingToken),
    };
    context.outcomes = processedOutcomes;
    context.ignoreAllies = !!this.ignoreAllies;
  context.hideFoundryHidden = !!this.hideFoundryHidden;

    // Store processed outcomes in instance for Apply All to use
    this.processedOutcomes = processedOutcomes;

    Object.assign(context, this.buildCommonContext(processedOutcomes));
    context.marginText = this.getMarginText.bind(this);
    context.getOutcomeClass = this.getOutcomeClass.bind(this);
    context.getOutcomeLabel = this.getOutcomeLabel.bind(this);

    return context;
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
    const hasChange = effectiveNewState !== outcome.currentVisibility;

    // Return true if either the original calculation determined a change OR there's an override
    return hasChange || (outcome.changed && effectiveNewState !== 'observed');
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
          try { await game.settings.set(MODULE_ID, 'hideFoundryHiddenTokens', this.hideFoundryHidden); } catch { }
          this.render({ force: true });
        });
      }
    } catch { }

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
    const app = currentDiversionDialog;
    if (!app) return;
    const tokenId = button?.dataset.tokenId;
    const outcome = app.outcomes.find((o) => o.observer.id === tokenId);
    if (!outcome) return;

    const effectiveNewState = outcome.overrideState || outcome.newVisibility;
    try {
      const { applyNowDiversion } = await import('../services/index.js');
      const overrides = { [tokenId]: effectiveNewState };
      await applyNowDiversion({ ...app.actionData, overrides }, { html: () => {}, attr: () => {} });
  } catch {}

    // Update button states
    app.updateRowButtonsToApplied([{ target: { id: tokenId }, hasActionableChange: true }]);
    // Enable Revert All without marking bulk state as fully applied (so Apply All remains available)
    try {
      const revertAllButton = app.element.querySelector(
        '.bulk-action-btn[data-action="revertAll"]',
      );
      if (revertAllButton) {
        revertAllButton.disabled = false;
        revertAllButton.innerHTML = '<i class="fas fa-undo"></i> Revert All';
      }
  } catch {}
    app.updateChangesCount();
  }

  /**
   * Handle individual revert change
   */
  static async _onRevertChange(event, button) {
    const app = currentDiversionDialog;
    if (!app) return;
    const tokenId = button?.dataset.tokenId;
    const outcome = app.outcomes.find((o) => o.observer.id === tokenId);
    if (!outcome) return;

    try {
      // Apply the original visibility state for just this specific token
      const { applyVisibilityChanges } = await import('../../services/infra/shared-utils.js');
      const revertVisibility = outcome.oldVisibility || outcome.currentVisibility;
      const changes = [{ target: outcome.observer, newVisibility: revertVisibility }];

      await applyVisibilityChanges(app.actionData.actor, changes, {
        direction: 'observer_to_target',
      });
  } catch {}

    // Update button states
    app.updateRowButtonsToReverted([{ target: { id: tokenId }, hasActionableChange: true }]);
    // If at least one row was reverted, enable Apply All again
    app.bulkActionState = 'initial';
    app.updateBulkActionButtons();
    app.updateChangesCount();
  }

  /**
   * Handle apply all changes
   */
  static async _onApplyAll() {
    // Get the dialog instance
    const app = currentDiversionDialog;
    if (!app) {
      console.error('Create a Diversion Dialog not found');
      return;
    }

    // If the user already applied all previously, but then reverted some rows manually,
    // we still allow Apply All to re-apply remaining changes. Only block if state is already "applied"
    // AND there are no actionable changes left.
    if (app.bulkActionState === 'applied') {
      const anyActionable = (app.outcomes || []).some((o) => o?.hasActionableChange);
      if (!anyActionable) {
        notify.warn(
          `${MODULE_TITLE}: Apply All has already been used. Use Revert All to undo changes.`,
        );
        return;
      }
    }

    // Count active changes in the rendered dialog context
    // Count is displayed in UI; Apply All uses filtered outcomes below

    // Use the processed outcomes that have already been filtered by encounter and ignore allies settings
    const filteredOutcomes = app.processedOutcomes || app.outcomes || [];

    // Only apply changes to filtered outcomes that have actionable changes
    const changedOutcomes = filteredOutcomes.filter((outcome) => {
      return (
        outcome.hasActionableChange || (outcome.changed && outcome.newVisibility !== 'observed')
      );
    });

    if (changedOutcomes.length === 0) {
      notify.warn(`${MODULE_TITLE}: No visibility changes to apply.`);
      return;
    }

    try {
      const { applyNowDiversion } = await import('../services/index.js');
      const overrides = {};
      for (const o of changedOutcomes) {
        const id = o?.observer?.id;
        const state = o?.overrideState || o?.newVisibility;
        if (id && state) overrides[id] = state;
      }
      await applyNowDiversion(
        { ...app.actionData, ignoreAllies: app.ignoreAllies, overrides },
        { html: () => {}, attr: () => {} },
      );
  } catch {}

    // Update UI for each row
    app.updateRowButtonsToApplied(
      changedOutcomes.map((o) => ({ target: { id: o.observer.id }, hasActionableChange: true })),
    );

    app.bulkActionState = 'applied';
    app.updateBulkActionButtons();
    app.updateChangesCount();

    notify.info(
      `${MODULE_TITLE}: Applied all diversion visibility changes. Dialog remains open for further adjustments.`,
    );
  }

  /**
   * Handle revert all changes
   */
  static async _onRevertAll() {
    // Get the dialog instance
    const app = currentDiversionDialog;
    if (!app) {
      console.error('Create a Diversion Dialog not found');
      return;
    }

    if (app.bulkActionState === 'reverted') {
      notify.warn(
        `${MODULE_TITLE}: Revert All has already been used. Use Apply All to reapply changes.`,
      );
      return;
    }

    // Count active changes in the rendered dialog context
    // Count is displayed in UI; Revert All uses filtered outcomes below

    // Use the processed outcomes that have already been filtered by encounter and ignore allies settings
    const filteredOutcomes = app.processedOutcomes || app.outcomes || [];

    // Only revert changes to filtered outcomes that have actionable changes
    const changedOutcomes = filteredOutcomes.filter((outcome) => {
      return (
        outcome.hasActionableChange || (outcome.changed && outcome.newVisibility !== 'observed')
      );
    });

    if (changedOutcomes.length === 0) {
      notify.warn(`${MODULE_TITLE}: No visibility changes to revert.`);
      return;
    }

    try {
      const { revertNowDiversion } = await import('../services/index.js');
      await revertNowDiversion(
        { ...app.actionData, ignoreAllies: app.ignoreAllies },
        { html: () => {}, attr: () => {} },
      );
  } catch {}
    app.updateRowButtonsToReverted(
      changedOutcomes.map((o) => ({ target: { id: o.observer.id }, hasActionableChange: true })),
    );

    app.bulkActionState = 'reverted';
    app.updateBulkActionButtons();
    app.updateChangesCount();

    notify.info(
      `${MODULE_TITLE}: Reverted all diversion visibility changes. Dialog remains open for further adjustments.`,
    );
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
   * Add click handlers for state icons
   */
  // Use BaseActionDialog.addIconClickHandlers
}
