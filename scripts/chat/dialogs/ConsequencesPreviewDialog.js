/**
 * Consequences Preview Dialog
 * Shows consequences of attack rolls from hidden/undetected tokens with GM override capability
 */

import { MODULE_ID } from '../../constants.js';
import { BaseActionDialog } from './base-action-dialog.js';
import {
  prepareConsequencesDialogContext,
} from './Consequences/consequences-dialog-context.js';
import {
  applyAllConsequencesChanges,
  applyConsequencesChange,
  revertAllConsequencesChanges,
  revertConsequencesChange,
} from './Consequences/consequences-dialog-actions.js';

// Store reference to current consequences dialog
let currentConsequencesDialog = null;

export class ConsequencesPreviewDialog extends BaseActionDialog {
  constructor(attackingToken, outcomes, changes, attackData, options = {}) {
    // Set localized title before calling super
    if (!options.window) options.window = {};
    options.window.title = game?.i18n?.localize('PF2E_VISIONER.DIALOG_TITLES.ATTACK_CONSEQUENCES') || 'Attack Consequences Results';

    super(options);

    this.attackingToken = attackingToken;
    this.outcomes = outcomes;
    this.changes = changes;
    this.attackData = attackData;
    // Ensure actionData exists for apply/revert services
    this.actionData = options.actionData || {
      actor: attackingToken,
      actionType: 'consequences',
      attackData,
    };
    this.encounterOnly = game.settings.get(MODULE_ID, 'defaultEncounterFilter');
    // Per-dialog ignore-allies (defaults to global setting, can be toggled in-dialog)
    this.ignoreAllies = options?.ignoreAllies ?? game.settings.get(MODULE_ID, 'ignoreAllies');
    // Visual filter default from per-user setting
    try {
      this.hideFoundryHidden = game.settings.get(MODULE_ID, 'hideFoundryHiddenTokens');
    } catch {
      this.hideFoundryHidden = true;
    }
    this.bulkActionState = 'initial'; // 'initial', 'applied', 'reverted'

    // Set global reference
    currentConsequencesDialog = this;
  }

  // Token id in Consequences outcomes is under `target`
  getOutcomeTokenId(outcome) {
    return outcome?.target?.id ?? null;
  }

  static DEFAULT_OPTIONS = {
    tag: 'div',
    classes: ['pf2e-visioner', 'consequences-preview-dialog'],
    window: {
      title: game.i18n.localize('PF2E_VISIONER.DIALOG_TITLES.ATTACK_CONSEQUENCES'),
      icon: 'fas fa-crosshairs',
      resizable: true,
    },
    position: {
      width: 800,
      height: 'auto',
    },
    actions: {
      applyChange: ConsequencesPreviewDialog._onApplyChange,
      revertChange: ConsequencesPreviewDialog._onRevertChange,
      applyAll: ConsequencesPreviewDialog._onApplyAll,
      revertAll: ConsequencesPreviewDialog._onRevertAll,
      toggleEncounterFilter: ConsequencesPreviewDialog._onToggleEncounterFilter,
      toggleFilterByDetection: ConsequencesPreviewDialog._onToggleFilterByDetection,
      overrideState: ConsequencesPreviewDialog._onOverrideState,
    },
  };

  static PARTS = {
    content: {
      template: 'modules/pf2e-visioner/templates/consequences-preview.hbs',
    },
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    return prepareConsequencesDialogContext(this, context);
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
   * Override to check the specific attacking token for override flags
   * Note: In Consequences, the override is stored ON the attacker WITH KEY from the target
   * Unlike Sneak/Hide, we only check the specific attacking token, not all tokens of the actor
   */
  isOldStateAvsControlled(outcome) {
    try {
      const avsEnabled = game.settings.get(MODULE_ID, 'autoVisibilityEnabled');
      if (!avsEnabled) return false;

      const observer = outcome.target;
      const attackerToken = this.attackingToken;

      if (!observer || !attackerToken) return false;

      const observerId = observer.document?.id || observer.id;
      const flagKey = `avs-override-from-${observerId}`;

      // Check only the specific attacking token for override flag
      if (attackerToken.document?.getFlag(MODULE_ID, flagKey)) {
        return false; // Override exists, so NOT AVS-controlled
      }

      return true; // No override found, so AVS-controlled
    } catch {
      return false;
    }
  }

  /**
   * Calculate if there's an actionable change (considering overrides)
   */
  calculateHasActionableChange(outcome) {
    const effectiveNewState = outcome.overrideState || outcome.newVisibility;
    const oldState = outcome.currentVisibility;
    const isOldStateAvsControlled = this.isOldStateAvsControlled(outcome);

    // Use the SAME logic as Hide and Sneak
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

    // Initialize filter by detection checkbox state
    const filterByDetectionCheckbox = this.element.querySelector(
      'input[data-action="toggleFilterByDetection"]',
    );
    if (filterByDetectionCheckbox) {
      filterByDetectionCheckbox.checked = !!this.filterByDetection;
    }

    // Initialize bulk action buttons and handlers
    this.updateBulkActionButtons();
    this.addIconClickHandlers();
    this.markInitialSelections();

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
    } catch { }
    // Wire Hide Foundry-hidden visual filter toggle
    try {
      const cbh = this.element.querySelector('input[data-action="toggleHideFoundryHidden"]');
      if (cbh) {
        cbh.onchange = null;
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
   * Add hover listeners to highlight tokens on canvas when hovering over rows
   */
  // Selection highlight handled by BasePreviewDialog

  getChangesCounterClass() {
    return 'consequences-preview-dialog-changes-count';
  }

  /**
   * Handle individual apply change
   */
  static async _onApplyChange(event, button) {
    await applyConsequencesChange(currentConsequencesDialog, button);
  }

  /**
   * Handle individual revert change
   */
  static async _onRevertChange(event, button) {
    await revertConsequencesChange(currentConsequencesDialog, button);
  }

  /**
   * Handle apply all changes
   */
  static async _onApplyAll() {
    await applyAllConsequencesChanges(currentConsequencesDialog);
  }

  /**
   * Handle revert all changes
   */
  static async _onRevertAll() {
    await revertAllConsequencesChanges(currentConsequencesDialog);
  }

  /**
   * Handle encounter filter toggle
   */
  static async _onToggleEncounterFilter(event, target) {
    const app = currentConsequencesDialog;
    if (!app) return;
    app.encounterOnly = target.checked;

    // Re-render with new filter
    await app.render({ force: true });
  }

  /**
   * Handle viewport filter toggle
   */
  static async _onToggleFilterByDetection(event, target) {
    const app = currentConsequencesDialog;
    if (!app) return;
    app.filterByDetection = target.checked;
    app.bulkActionState = 'initial';
    app.render({ force: true });
  }

  /**
   * Handle visibility state override - not used directly, handled by icon click handlers
   */
  static async _onOverrideState() {
    // This is a placeholder for compatibility with the action system
    // The actual implementation is in the icon click handlers
  }

  // Override icon click handlers to use consequences-specific logic
  addIconClickHandlers() {
    if (!this.element || this.element.dataset.consequencesStateIconDelegated === 'true') return;
    this.element.dataset.consequencesStateIconDelegated = 'true';
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

        // Update UI
        overrideIcons
          .querySelectorAll('.state-icon')
          .forEach((i) => i.classList.remove('selected'));
        icon.classList.add('selected');
        const hiddenInput = overrideIcons?.querySelector('input[type="hidden"]');
        if (hiddenInput) hiddenInput.value = newState;

        // Update outcome data
        let outcome = this.outcomes?.find?.(
          (o) => String(this.getOutcomeTokenId(o)) === String(targetId),
        );
        if (outcome) {
          outcome.overrideState = newState;
          // Use consequences-specific logic for actionable changes
          const hasActionableChange = this.calculateHasActionableChange(outcome);
          // Persist actionable state on outcome so templates and bulk ops reflect immediately
          outcome.hasActionableChange = hasActionableChange;
          this.updateActionButtonsForToken(targetId, hasActionableChange);
          this.updateChangesCount();
        }
    });
  }

  // Use base implementations for selection, bulk button state, and icon handlers
  async applyVisibilityChange() { }

  updateActionButtonsForToken(tokenId, hasActionableChange) {
    // Delegate to base which renders Apply/Revert or "No Change"
    super.updateActionButtonsForToken(tokenId, hasActionableChange);
  }
}
