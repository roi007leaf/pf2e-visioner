/**
 * Point Out Preview Dialog for Point Out action automation
 * Uses ApplicationV2 for modern FoundryVTT compatibility
 */

import { MODULE_ID, MODULE_TITLE } from '../../constants.js';
import { getDesiredOverrideStatesForAction } from '../services/data/action-state-config.js';
import { notify } from '../services/infra/notifications.js';
import { filterOutcomesByEncounter } from '../services/infra/shared-utils.js';
import { BaseActionDialog } from './base-action-dialog.js';
// Logic now handled via services action handler; no direct logic imports

// Store reference to current dialog (shared with SeekPreviewDialog)
let currentPointOutDialog = null;

export class PointOutPreviewDialog extends BaseActionDialog {
  static DEFAULT_OPTIONS = {
    tag: 'div',
    classes: ['pf2e-visioner', 'point-out-preview-dialog'],
    window: {
      title: 'Point Out Results',
      icon: 'fas fa-hand-point-right',
      resizable: true,
    },
    position: {
      width: 600,
      height: 'auto',
    },
    actions: {
      close: PointOutPreviewDialog._onClose,
      applyAll: PointOutPreviewDialog._onApplyAll,
      revertAll: PointOutPreviewDialog._onRevertAll,
      applyChange: PointOutPreviewDialog._onApplyChange,
      revertChange: PointOutPreviewDialog._onRevertChange,
      toggleEncounterFilter: PointOutPreviewDialog._onToggleEncounterFilter,
    },
  };

  static PARTS = {
    content: {
      template: 'modules/pf2e-visioner/templates/point-out-preview.hbs',
    },
  };

  constructor(actorToken, outcomes, changes, actionData, options = {}) {
    super(options);
    this.actorToken = actorToken;
    this.outcomes = outcomes;
    this.changes = changes;
    this.actionData = actionData;
    this.bulkActionState = 'initial';
    this.encounterOnly = game.settings.get(MODULE_ID, 'defaultEncounterFilter');
    // Visual filter default from per-user setting
    try {
      this.hideFoundryHidden = game.settings.get(MODULE_ID, 'hideFoundryHiddenTokens');
    } catch {
      this.hideFoundryHidden = true;
    }

    // Set global reference
    currentPointOutDialog = this;
  }

  /**
   * Add hover functionality after rendering
   */
  // Hover/selection behavior is provided by BasePreviewDialog

  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    // Filter outcomes with base helper
    let filteredOutcomes = this.applyEncounterFilter(
      this.outcomes,
      'target',
      'No encounter allies found, showing all',
    );

    const cfg = (s) => this.visibilityConfig(s);

  let processedOutcomes = filteredOutcomes.map((outcome) => {
      const desired = getDesiredOverrideStatesForAction('point-out');
      const availableStates = { hidden: this.buildOverrideStates(desired, outcome)[0] };

      const effectiveNewState = outcome.overrideState || outcome.newVisibility;
      const baseOldState = outcome.oldVisibility || outcome.currentVisibility;
      const hasActionableChange =
        baseOldState != null && effectiveNewState != null && effectiveNewState !== baseOldState;

      return {
        ...outcome,
        oldVisibilityState: cfg(baseOldState),
        newVisibilityState: cfg(effectiveNewState),
        tokenImage: this.resolveTokenImage(outcome.target),
        availableStates,
        overrideState: outcome.overrideState || outcome.newVisibility,
        hasActionableChange,
      };
    });

    // Visual filtering: hide Foundry-hidden tokens from display if enabled
    try {
      if (this.hideFoundryHidden) {
        processedOutcomes = processedOutcomes.filter((o) => o?.target?.document?.hidden !== true);
      }
    } catch { }

    // Show-only-changes visual filter
    try {
      if (this.showOnlyChanges) {
        processedOutcomes = processedOutcomes.filter((o) => !!o.hasActionableChange);
      }
    } catch { }

    // Update original outcomes with hasActionableChange for Apply All button logic
    processedOutcomes.forEach((processedOutcome, index) => {
      if (this.outcomes[index]) {
        this.outcomes[index].hasActionableChange = processedOutcome.hasActionableChange;
      }
    });

    context.actorName = this.actorToken.name;
    context.actorImage = this.resolveTokenImage(this.actorToken);
    context.outcomes = processedOutcomes;
    context.changes = this.changes;
  context.hideFoundryHidden = !!this.hideFoundryHidden;
    Object.assign(context, this.buildCommonContext(this.outcomes));

    // Add target name and DC if all outcomes point to the same target
    if (processedOutcomes.length > 0) {
      const firstTargetToken = processedOutcomes[0].targetToken;
      const allSameTarget = processedOutcomes.every(
        (outcome) => outcome.targetToken?.id === firstTargetToken?.id,
      );
      if (allSameTarget && firstTargetToken) {
        context.targetName = firstTargetToken.name;
        context.targetDC = processedOutcomes[0].dc;
      }
    }

    return context;
  }

  async _renderHTML(context) {
    return await foundry.applications.handlebars.renderTemplate(
      this.constructor.PARTS.content.template,
      context,
    );
  }

  _replaceHTML(result, content) {
    content.innerHTML = result;
    return content;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this.updateBulkActionButtons();
    this.addIconClickHandlers();
    this.markInitialSelections();

    // Wire Hide Foundry-hidden visual filter toggle
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

    // Ping the exact token pointed at in the chat message (speaker's target), if available
    try {
      if (game.user.isGM) {
        // Best effort: use first outcome's targetToken if present; otherwise fall back to flags
        let token = this.outcomes?.[0]?.targetToken || null;
        if (!token) {
          const msg = game.messages.get(this?.actionData?.messageId);
          const pointOutFlags = msg?.flags?.['pf2e-visioner']?.pointOut;
          const targetTokenId =
            pointOutFlags?.targetTokenId ||
            this?.actionData?.context?.target?.token ||
            msg?.flags?.pf2e?.target?.token;
          if (targetTokenId) token = canvas.tokens.get(targetTokenId) || null;
        }
        if (token) {
          import('../services/gm-ping.js').then(({ pingTokenCenter }) => {
            try {
              pingTokenCenter(token, 'Point Out Target');
            } catch { }
          });
        }
      }
  } catch { }
  }

  // Token id in Point Out outcomes is under `target`
  getOutcomeTokenId(outcome) {
    return outcome?.target?.id ?? null;
  }

  /**
   * Return outcomes filtered according to current visual and encounter filters,
   * including: encounterOnly, ignoreAllies, hideFoundryHidden, and showOnlyChanges.
   */
  async getFilteredOutcomes() {
    // Start from full outcomes list for Point Out
    let filtered = filterOutcomesByEncounter(this.outcomes, this.encounterOnly, 'target');

    // Allies filter
    try {
      const { filterOutcomesByAllies } = await import('../services/infra/shared-utils.js');
      filtered = filterOutcomesByAllies(filtered, this.actorToken, this.ignoreAllies, 'target');
    } catch {}

    // Hide Foundry hidden tokens
    try {
      if (this.hideFoundryHidden) {
        filtered = filtered.filter((o) => o?.target?.document?.hidden !== true);
      }
    } catch {}

    // Show only actionable visibility changes
    try {
      if (this.showOnlyChanges) {
        filtered = filtered.filter((o) => {
          const effectiveNew = o?.overrideState ?? o?.newVisibility;
          const baseOld = o?.oldVisibility ?? o?.currentVisibility;
          return baseOld != null && effectiveNew != null && effectiveNew !== baseOld;
        });
      }
    } catch {}

    return filtered;
  }

  // Point Out specific action methods
  static async _onClose() {
    const app = currentPointOutDialog;
    if (app) {
      app.close();
    }
  }

  static async _onApplyAll() {
    const app = currentPointOutDialog;
    if (!app || app.bulkActionState === 'applied') {
      if (app.bulkActionState === 'applied') {
        notify.warn(
          `${MODULE_TITLE}: Apply All has already been used. Use Revert All to undo changes.`,
        );
      }
      return;
    }

    try {
      // Use dialog's filtered outcomes which respects encounter, allies, hidden and showOnlyChanges
      let filteredOutcomes = [];
      if (typeof app.getFilteredOutcomes === 'function') {
        filteredOutcomes = await app.getFilteredOutcomes();
      } else {
        // Fallback to original pathway (should rarely happen)
        filteredOutcomes = filterOutcomesByEncounter(app.outcomes, app.encounterOnly, 'target');
      }

      // Restrict to actionable changes to be safe even when showOnlyChanges is off
      const changedOutcomes = filteredOutcomes.filter((o) => {
        const effectiveNew = o?.overrideState ?? o?.newVisibility;
        const baseOld = o?.oldVisibility ?? o?.currentVisibility;
        return baseOld != null && effectiveNew != null && effectiveNew !== baseOld;
      });

      // Make sure each outcome has the targetToken property
      const processedOutcomes = changedOutcomes.map((outcome) => {
        // If outcome doesn't have targetToken, try to get it from the original outcome
        if (!outcome.targetToken) {
          const originalOutcome = app.outcomes.find((o) => o.target.id === outcome.target.id);
          if (originalOutcome && originalOutcome.targetToken) {
            return { ...outcome, targetToken: originalOutcome.targetToken };
          }
        }
        return outcome;
      });

      // Provide overrides map to services path (ally id → newVisibility). Point Out uses special mapping in handler.
      const overrides = {};
      for (const o of processedOutcomes) {
        const id = o?.target?.id;
        const state = o?.overrideState || o?.newVisibility;
        if (id && state) overrides[id] = state;
      }
      const { applyNowPointOut } = await import('../services/index.js');
      await applyNowPointOut({ ...app.actionData, overrides }, { html: () => {}, attr: () => {} });

      app.bulkActionState = 'applied';
      app.updateBulkActionButtons();
      // Update only the rows we actually applied
      app.updateRowButtonsToApplied(
        processedOutcomes.map((o) => ({ target: { id: o.target.id }, hasActionableChange: true })),
      );
      app.updateChangesCount();

      notify.info(
        `${MODULE_TITLE}: Applied Point Out changes for ${processedOutcomes.length} allies. Dialog remains open for further adjustments.`,
      );
    } catch (error) {
      console.error(`${MODULE_TITLE}: Error applying Point Out changes:`, error);
      notify.error(`${MODULE_TITLE}: Failed to apply Point Out changes`);
    }
  }

  static async _onRevertAll() {
  const app = currentPointOutDialog;
    if (!app || app.bulkActionState === 'reverted') {
      if (app.bulkActionState === 'reverted') {
        notify.warn(
          `${MODULE_TITLE}: Revert All has already been used. Use Apply All to reapply changes.`,
        );
      }
      return;
    }

    try {
      // Build revert data internally in the service; no need to pre-filter payload here
      const { revertNowPointOut } = await import('../services/index.js');
      await revertNowPointOut(app.actionData, { html: () => {}, attr: () => {} });

      // Respect Hide Foundry-hidden and other filters when updating UI
      let filteredOutcomes = filterOutcomesByEncounter(app.outcomes, app.encounterOnly, 'target');
      try {
        const { filterOutcomesByAllies } = await import('../services/infra/shared-utils.js');
        filteredOutcomes = filterOutcomesByAllies(
          filteredOutcomes,
          app.actorToken,
          app.ignoreAllies,
          'target',
        );
      } catch {}
      try {
        if (app.hideFoundryHidden) {
          filteredOutcomes = filteredOutcomes.filter((o) => o?.target?.document?.hidden !== true);
        }
      } catch {}

      app.bulkActionState = 'reverted';
      app.updateBulkActionButtons();
      app.updateRowButtonsToReverted(
        filteredOutcomes.map((o) => ({ target: { id: o.target.id }, hasActionableChange: true })),
      );
      app.updateChangesCount();
    } catch (error) {
      console.error(`${MODULE_TITLE}: Error reverting Point Out changes:`, error);
      notify.error(`${MODULE_TITLE}: Failed to revert Point Out changes`);
    }
  }

  static async _onToggleEncounterFilter() {
    const app = currentPointOutDialog;
    if (!app) return;

    app.encounterOnly = !app.encounterOnly;

    // Toggle filter and re-render; action handler context prep will apply filter
    app.encounterOnly = !app.encounterOnly;
    app.bulkActionState = 'initial';
    app.bulkActionState = 'initial';
    app.render({ force: true });
  }

  /**
   * Apply individual visibility change
   */
  static async _onApplyChange(event, button) {
    const app = currentPointOutDialog;
    if (!app) return;

    const tokenId = button.dataset.tokenId;
    const outcome = app.outcomes.find((o) => o.target.id === tokenId);

    if (!outcome || !outcome.hasActionableChange) {
      notify.warn(`${MODULE_TITLE}: No change to apply for this token`);
      return;
    }

    try {
      const overrides = { [outcome.target.id]: outcome.overrideState || outcome.newVisibility };
      const { applyNowPointOut } = await import('../services/index.js');
      await applyNowPointOut({ ...app.actionData, overrides }, { html: () => {}, attr: () => {} });

      // Update row using base helper
      app.updateRowButtonsToApplied([
        { target: { id: outcome.target.id }, hasActionableChange: true },
      ]);
      app.updateChangesCount();
    } catch (error) {
      console.error(`${MODULE_TITLE}: Error applying change.`, error);
      notify.error(`${MODULE_TITLE}: Error applying change.`);
    }
  }

  /**
   * Revert individual token to original state
   */
  static async _onRevertChange(event, button) {
    const app = currentPointOutDialog;
    if (!app) return;

    const tokenId = button.dataset.tokenId;
    const outcome = app.outcomes.find((o) => o.target.id === tokenId);

    if (!outcome) {
      notify.warn(`${MODULE_TITLE}: Token not found`);
      return;
    }

    // Service will infer the original state; no local revert payload needed here

    try {
      const { revertNowPointOut } = await import('../services/index.js');
      // Pass the specific tokenId for per-row revert
      const actionDataWithTarget = { ...app.actionData, targetTokenId: tokenId };
      await revertNowPointOut(actionDataWithTarget, { html: () => {}, attr: () => {} });

      // Update row using base helper
      app.updateRowButtonsToReverted([
        { target: { id: outcome.target.id }, hasActionableChange: true },
      ]);
      app.updateChangesCount();
    } catch (error) {
      console.error(`${MODULE_TITLE}: Error reverting change.`, error);
      notify.error(`${MODULE_TITLE}: Error reverting change.`);
    }
  }

  // Use BaseActionDialog.updateChangesCount
  close(options) {
    if (this._selectionHookId) {
      try {
        Hooks.off('controlToken', this._selectionHookId);
  } catch { }
      this._selectionHookId = null;
    }
    currentPointOutDialog = null;
    return super.close(options);
  }

  getChangesCounterClass() {
    return 'point-out-preview-dialog-changes-count';
  }

  // Use services path for apply/revert; no custom applyVisibilityChanges override needed

  // removed: bulk row-button helpers; using BaseActionDialog batch helpers

  // removed: updateRowButtonsToApplied duplicated; using BaseActionDialog implementation

  // removed: updateRowButtonsToReverted duplicated; using BaseActionDialog implementation

  // Use BaseActionDialog.updateBulkActionButtons

  // Use BaseActionDialog.addIconClickHandlers

  updateActionButtonsForToken(tokenId, hasActionableChange) {
    // Delegate to base which renders Apply/Revert or "No Change"
    super.updateActionButtonsForToken(tokenId, hasActionableChange);
  }
}
