/**
 * Consequences Preview Dialog
 * Shows consequences of attack rolls from hidden/undetected tokens with GM override capability
 */

import { MODULE_ID, MODULE_TITLE } from '../../constants.js';
import { getDesiredOverrideStatesForAction } from '../services/data/action-state-config.js';
import { getVisibilityStateConfig } from '../services/data/visibility-states.js';
import { notify } from '../services/infra/notifications.js';
import { filterOutcomesByEncounter } from '../services/infra/shared-utils.js';
import { BaseActionDialog } from './base-action-dialog.js';

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
      width: 520,
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

    // Filter outcomes with base helper
    let processedOutcomes = this.applyEncounterFilter(
      this.outcomes,
      'target',
      'No encounter targets found, showing all',
    );

    // Apply ignore-allies filtering for display (walls are not part of consequences)
    try {
      const { filterOutcomesByAllies } = await import('../services/infra/shared-utils.js');
      processedOutcomes = filterOutcomesByAllies(
        processedOutcomes,
        this.attackingToken,
        this.ignoreAllies,
        'target',
      );
    } catch { }

    // Apply viewport filtering if enabled
    if (this.filterByDetection && this.attackingToken) {
      try {
        const { filterOutcomesByDetection } = await import('../services/infra/shared-utils.js');
        // Await the async filter to avoid turning processedOutcomes into a Promise
        processedOutcomes = await filterOutcomesByDetection(
          processedOutcomes,
          this.attackingToken,
          'target',
          false,
          true,
          'observer_to_target',
        );
      } catch {
        /* LOS filtering is non-critical */
      }
    }

    // Apply defeated token filtering (exclude dead/unconscious tokens)
    try {
      const { filterOutcomesByDefeated } = await import('../services/infra/shared-utils.js');
      processedOutcomes = filterOutcomesByDefeated(processedOutcomes, 'target');
    } catch {
      /* Defeated filtering is non-critical */
    }

    // Prepare outcomes with additional UI data (and normalize shape)
    processedOutcomes = processedOutcomes.map((outcome) => {
      const effectiveNewState = outcome.overrideState || 'avs'; // Default to AVS
      const baseOldState = outcome.currentVisibility;
      // Use the centralized logic that handles AVS cases
      const hasActionableChange = this.calculateHasActionableChange({
        ...outcome,
        newVisibility: effectiveNewState,
        currentVisibility: baseOldState,
        overrideState: outcome.overrideState,
      });

      // Build override icon states for the row
      const desired = getDesiredOverrideStatesForAction('consequences');
      const availableStates = this.buildOverrideStates(
        desired,
        { ...outcome, newVisibility: effectiveNewState },
        { selectFrom: 'overrideState', calcFrom: 'newVisibility' },
      );
      // Check if the old visibility state is AVS-controlled
      const isOldStateAvsControlled = this.isOldStateAvsControlled(outcome);

      return {
        ...outcome,
        // Normalize to match BaseActionDialog helpers
        newVisibility: effectiveNewState,
        hasActionableChange,
        overrideState: outcome.overrideState || null,
        tokenImage: this.resolveTokenImage(outcome.target),
        oldVisibilityState: getVisibilityStateConfig(baseOldState),
        newVisibilityState: getVisibilityStateConfig(effectiveNewState),
        availableStates,
        isOldStateAvsControlled,
      };
    });

    // Visual filtering: hide Foundry-hidden tokens from display if enabled
    try {
      if (this.hideFoundryHidden) {
        processedOutcomes = processedOutcomes.filter((o) => o?.target?.document?.hidden !== true);
      }
    } catch { }

    // Prepare attacking token with proper image path
    context.attackingToken = {
      ...this.attackingToken,
      image: this.resolveTokenImage(this.attackingToken),
    };
    context.outcomes = processedOutcomes;
    context.ignoreAllies = !!this.ignoreAllies;
    context.hideFoundryHidden = !!this.hideFoundryHidden; // Added context for hideFoundryHidden

    // Keep internal outcomes annotated where relevant (e.g., hasActionableChange)
    try {
      // Map by token id for safe synchronization
      const byId = new Map(processedOutcomes.map((o) => [o?.target?.id, o]));
      for (const o of this.outcomes) {
        const pid = o?.target?.id;
        if (!pid) continue;
        const po = byId.get(pid);
        if (po) {
          o.hasActionableChange = po.hasActionableChange;
          // Provide a default newVisibility so Base markInitialSelections works
          o.newVisibility = po.newVisibility;
        }
      }
    } catch { }

    // Log the number of changes for debugging
    Object.assign(context, this.buildCommonContext(processedOutcomes));

    // Check if Auto-Visibility System is enabled for conditional UI elements
    context.avsEnabled = game.settings.get(MODULE_ID, 'autoVisibilityEnabled');

    // Check if there are existing overrides between attacker and observers for Remove Overrides button
    context.hasExistingOverrides = false;
    if (context.avsEnabled && this.attackingToken) {
      try {
        for (const outcome of processedOutcomes) {
          const observer = outcome?.target;
          if (!observer?.document?.id) continue;

          // Check for overrides in both directions: observer->attacker and attacker->observer
          const attackerId = this.attackingToken.document.id;
          const observerId = observer.document.id;

          // Check observer->attacker override (flag on attacker)
          const forwardOverride = this.attackingToken.document.getFlag(
            MODULE_ID,
            `avs-override-from-${observerId}`,
          );
          // Check attacker->observer override (flag on observer)
          const reverseOverride = observer.document.getFlag(
            MODULE_ID,
            `avs-override-from-${attackerId}`,
          );

          if (forwardOverride || reverseOverride) {
            context.hasExistingOverrides = true;
            break;
          }
        }
      } catch (err) {
        console.warn('PF2E Visioner | Error checking for existing overrides:', err);
      }
    }

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
    const app = currentConsequencesDialog;
    if (!app) return;
    const tokenId = button?.dataset.tokenId;
    const outcome = app.outcomes.find((o) => o.target.id === tokenId);
    if (!outcome) return;

    const effectiveNewState = outcome.overrideState || 'avs';

    // If AVS is selected, remove any existing override
    if (effectiveNewState === 'avs') {
      try {
        const { default: AvsOverrideManager } = await import(
          '../services/infra/AvsOverrideManager.js'
        );
        const attackerId = app.actionData?.actor?.document?.id || app.actionData?.actor?.id;
        const observerId = outcome.target.id;
        if (attackerId && observerId) {
          await AvsOverrideManager.removeOverride(observerId, attackerId);
          // Refresh UI to update override indicators
          const { updateTokenVisuals } = await import('../../services/visual-effects.js');
          await updateTokenVisuals();
          notify.info(
            `${MODULE_TITLE}: Accepted AVS changes for ${outcome.target.name}`,
          );
        }
      } catch (e) {
        console.warn('Failed to remove AVS override:', e);
        notify.info(`${MODULE_TITLE}: AVS will control visibility for ${outcome.target.name}`);
      }
      app.updateRowButtonsToApplied([
        { target: { id: outcome.target.id }, hasActionableChange: false },
      ]);
      app.updateChangesCount();
      return;
    }

    try {
      const { applyNowConsequences } = await import('../services/index.js');

      // Check for row timer configuration
      const rowTimerConfig = app.rowTimers?.get(tokenId);
      let overrideValue = effectiveNewState;

      if (rowTimerConfig) {
        try {
          const { TimedOverrideManager } = await import('../../services/TimedOverrideManager.js');
          const timedOverride = TimedOverrideManager._buildTimedOverrideData(rowTimerConfig);
          overrideValue = { state: effectiveNewState, timedOverride };
        } catch (e) {
          console.error('PF2E Visioner | Consequences row apply: Failed to build timer:', e);
        }
      }

      const overrides = { [outcome.target.id]: overrideValue };
      await applyNowConsequences(
        {
          ...app.actionData,
          overrides,
          ignoreAllies: app.ignoreAllies,
          encounterOnly: app.encounterOnly,
        },
        { html: () => { }, attr: () => { } },
      );

      // Clear row timer after applying
      if (rowTimerConfig) {
        app.rowTimers.delete(tokenId);
        app._updateRowTimerButton?.(tokenId);
      }
    } catch { }

    // Update button states
    app.updateRowButtonsToApplied([{ target: { id: tokenId }, hasActionableChange: true }]);
    app.updateChangesCount();
  }

  /**
   * Handle individual revert change
   */
  static async _onRevertChange(event, button) {
    const app = currentConsequencesDialog;
    if (!app) return;
    const tokenId = button?.dataset.tokenId;
    const outcome = app.outcomes.find((o) => o.target.id === tokenId);
    if (!outcome) return;

    try {
      const { revertNowConsequences } = await import('../services/index.js');
      // Pass the specific tokenId for per-row revert
      const actionDataWithTarget = { ...app.actionData, targetTokenId: tokenId };
      await revertNowConsequences(actionDataWithTarget, { html: () => { }, attr: () => { } });
    } catch { }

    // Update button states
    app.updateRowButtonsToReverted([{ target: { id: tokenId }, hasActionableChange: true }]);
    app.updateChangesCount();
  }

  /**
   * Handle apply all changes
   */
  static async _onApplyAll() {
    // Get the dialog instance
    const app = currentConsequencesDialog;
    if (!app) {
      console.error('Consequences Dialog not found');
      return;
    }

    if (app.bulkActionState === 'applied') {
      notify.warn(
        `${MODULE_TITLE}: Apply All has already been used. Use Revert All to undo changes.`,
      );
      return;
    }

    // Filter outcomes based on encounter filter
    let filteredOutcomes = filterOutcomesByEncounter(app.outcomes, app.encounterOnly, 'target');

    // Apply ally filtering if ignore allies is enabled
    try {
      const { filterOutcomesByAllies } = await import('../services/infra/shared-utils.js');
      filteredOutcomes = filterOutcomesByAllies(
        filteredOutcomes,
        app.attackingToken,
        app.ignoreAllies,
        'target',
      );
    } catch { }

    // Respect Hide Foundry-hidden toggle for Revert All
    try {
      if (app.hideFoundryHidden) {
        filteredOutcomes = filteredOutcomes.filter((o) => o?.target?.document?.hidden !== true);
      }
    } catch { }

    // Only apply changes to filtered outcomes that have actionable changes
    const changedOutcomes = filteredOutcomes.filter((outcome) => {
      return outcome.hasActionableChange;
    });

    if (changedOutcomes.length === 0) {
      notify.warn(`${MODULE_TITLE}: No visibility changes to apply.`);
      return;
    }

    const overrides = {};
    const avsRemovals = [];
    for (const o of changedOutcomes) {
      const id = o?.target?.id;
      const state = o?.overrideState || 'avs';
      if (id && state) {
        if (state === 'avs') {
          // AVS selections - remove any existing overrides
          avsRemovals.push({ id, name: o.target.name });
        } else {
          overrides[id] = state;
        }
      }
    }

    // Remove AVS overrides if any
    if (avsRemovals.length > 0) {
      try {
        const { default: AvsOverrideManager } = await import(
          '../services/infra/AvsOverrideManager.js'
        );
        const attackerId = app.actionData?.actor?.document?.id || app.actionData?.actor?.id;
        if (attackerId) {
          for (const removal of avsRemovals) {
            const observerId = removal.id;
            await AvsOverrideManager.removeOverride(observerId, attackerId);
          }
          // Refresh UI to update override indicators
          const { updateTokenVisuals } = await import('../../services/visual-effects.js');
          await updateTokenVisuals();
          const names = avsRemovals.map((r) => r.name).join(', ');
          notify.info(`${MODULE_TITLE}: Accepted AVS changes for ${avsRemovals.length} token(s)`);
        }
      } catch (e) {
        console.warn('Failed to remove AVS overrides:', e);
        const names = avsRemovals.map((r) => r.name).join(', ');
        notify.info(`${MODULE_TITLE}: AVS will control visibility for ${avsRemovals.length}`);
      }
    }

    // Apply overrides only if there are any
    if (Object.keys(overrides).length > 0) {
      const { applyNowConsequences } = await import('../services/index.js');
      await applyNowConsequences(
        {
          ...app.actionData,
          overrides,
          ignoreAllies: app.ignoreAllies,
          encounterOnly: app.encounterOnly,
        },
        { html: () => { }, attr: () => { } },
      );
    }

    // Update UI for each row
    for (const outcome of changedOutcomes) {
      app.updateRowButtonsToApplied([
        { target: { id: outcome.target.id }, hasActionableChange: true },
      ]);
    }

    app.bulkActionState = 'applied';
    app.updateBulkActionButtons();
    app.updateChangesCount();

    notify.info(
      `${MODULE_TITLE}: Applied all visibility changes. Dialog remains open for further adjustments.`,
    );
  }

  /**
   * Handle revert all changes
   */
  static async _onRevertAll() {
    // Get the dialog instance
    const app = currentConsequencesDialog;
    if (!app) {
      console.error('Consequences Dialog not found');
      return;
    }

    if (app.bulkActionState === 'reverted') {
      notify.warn(
        `${MODULE_TITLE}: Revert All has already been used. Use Apply All to reapply changes.`,
      );
      return;
    }

    // Filter outcomes based on encounter filter
    let filteredOutcomes = filterOutcomesByEncounter(app.outcomes, app.encounterOnly, 'target');

    // Apply ally filtering if ignore allies is enabled
    try {
      const { filterOutcomesByAllies } = await import('../services/infra/shared-utils.js');
      filteredOutcomes = filterOutcomesByAllies(
        filteredOutcomes,
        app.attackingToken,
        app.ignoreAllies,
        'target',
      );
    } catch { }

    // Respect Hide Foundry-hidden toggle for Revert All (UI only)
    try {
      if (app.hideFoundryHidden) {
        filteredOutcomes = filteredOutcomes.filter((o) => o?.target?.document?.hidden !== true);
      }
    } catch { }

    // Only revert changes to filtered outcomes that have actionable changes
    const changedOutcomes = filteredOutcomes.filter((outcome) => {
      return outcome.hasActionableChange;
    });

    if (changedOutcomes.length === 0) {
      notify.warn(`${MODULE_TITLE}: No visibility changes to revert.`);
      return;
    }

    const { revertNowConsequences } = await import('../services/index.js');
    await revertNowConsequences(app.actionData, { html: () => { }, attr: () => { } });
    for (const outcome of changedOutcomes) {
      app.updateRowButtonsToReverted([
        { target: { id: outcome.target.id }, hasActionableChange: true },
      ]);
    }

    app.bulkActionState = 'reverted';
    app.updateBulkActionButtons();
    app.updateChangesCount();
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
    const stateIcons = this.element.querySelectorAll('.state-icon');
    stateIcons.forEach((icon) => {
      icon.addEventListener('click', (event) => {
        // Only handle clicks within override selection container
        const overrideIcons = event.currentTarget.closest('.override-icons');
        if (!overrideIcons) return;

        // Robustly resolve target id from data attributes or row
        let targetId = event.currentTarget.dataset.target || event.currentTarget.dataset.tokenId;
        if (!targetId) {
          const row = event.currentTarget.closest('tr[data-token-id]');
          targetId = row?.dataset?.tokenId;
        }
        const newState = event.currentTarget.dataset.state;

        // Update UI
        overrideIcons
          .querySelectorAll('.state-icon')
          .forEach((i) => i.classList.remove('selected'));
        event.currentTarget.classList.add('selected');
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
    });
  }

  // Use base implementations for selection, bulk button state, and icon handlers
  async applyVisibilityChange() { }

  updateActionButtonsForToken(tokenId, hasActionableChange) {
    // Delegate to base which renders Apply/Revert or "No Change"
    super.updateActionButtonsForToken(tokenId, hasActionableChange);
  }
}
