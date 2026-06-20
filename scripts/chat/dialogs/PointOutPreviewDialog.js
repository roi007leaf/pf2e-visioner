/**
 * Point Out Preview Dialog for Point Out action automation
 * Uses ApplicationV2 for modern FoundryVTT compatibility
 */

import { MODULE_ID } from '../../constants.js';
import { BaseActionDialog } from './base-action-dialog.js';
import {
  applyAllPointOutChanges,
  applyPointOutChange,
  revertAllPointOutChanges,
  revertPointOutChange,
} from './PointOut/point-out-dialog-actions.js';
import {
  getPointOutDialogFilteredOutcomes,
  preparePointOutDialogContext,
} from './PointOut/point-out-dialog-context.js';

let currentPointOutDialog = null;

export class PointOutPreviewDialog extends BaseActionDialog {
  static DEFAULT_OPTIONS = {
    tag: 'div',
    classes: ['pf2e-visioner', 'point-out-preview-dialog'],
    window: {
      title: game.i18n.localize('PF2E_VISIONER.DIALOG_TITLES.POINT_OUT_RESULTS'),
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
      toggleFilterByDetection: PointOutPreviewDialog._onToggleFilterByDetection,
      toggleHideFoundryHidden: PointOutPreviewDialog._onToggleHideFoundryHidden,
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

    try {
      this.hideFoundryHidden = game.settings.get(MODULE_ID, 'hideFoundryHiddenTokens');
    } catch {
      this.hideFoundryHidden = true;
    }

    currentPointOutDialog = this;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    return preparePointOutDialogContext(this, context);
  }

  async _renderHTML(context) {
    return foundry.applications.handlebars.renderTemplate(
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
    this.#pingPointOutTargetForGm();
  }

  #pingPointOutTargetForGm() {
    try {
      if (!game.user.isGM) return;

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
      if (!token) return;

      import('../services/gm-ping.js').then(({ pingTokenCenter }) => {
        try {
          pingTokenCenter(token, 'Point Out Target');
        } catch {
          /* Ping is optional */
        }
      });
    } catch {
      /* Best-effort GM ping */
    }
  }

  getOutcomeTokenId(outcome) {
    return outcome?.target?.id ?? null;
  }

  async getFilteredOutcomes() {
    return getPointOutDialogFilteredOutcomes(this);
  }

  static async _onClose() {
    const app = currentPointOutDialog;
    if (app) app.close();
  }

  static async _onApplyAll() {
    await applyAllPointOutChanges(currentPointOutDialog);
  }

  static async _onRevertAll() {
    await revertAllPointOutChanges(currentPointOutDialog);
  }

  static async _onToggleEncounterFilter(event, target) {
    const app = currentPointOutDialog;
    if (!app) return;

    app.encounterOnly = target.checked;
    app.bulkActionState = 'initial';
    await app.render({ force: true });
  }

  static async _onToggleFilterByDetection(event, target) {
    const app = currentPointOutDialog;
    if (!app) return;

    app.filterByDetection = target.checked;
    app.bulkActionState = 'initial';
    await app.render({ force: true });
  }

  static async _onToggleHideFoundryHidden(event, target) {
    const app = currentPointOutDialog;
    if (!app) return;

    app.hideFoundryHidden = target.checked;
    try {
      await game.settings.set(MODULE_ID, 'hideFoundryHiddenTokens', target.checked);
    } catch {
      /* Setting persistence is optional */
    }
    await app.render({ force: true });
  }

  static async _onApplyChange(event, button) {
    await applyPointOutChange(currentPointOutDialog, button);
  }

  static async _onRevertChange(event, button) {
    await revertPointOutChange(currentPointOutDialog, button);
  }

  close(options) {
    if (this._selectionHookId) {
      try {
        Hooks.off('controlToken', this._selectionHookId);
      } catch {
        /* Selection hook may already be gone */
      }
      this._selectionHookId = null;
    }
    currentPointOutDialog = null;
    return super.close(options);
  }

  getChangesCounterClass() {
    return 'point-out-preview-dialog-changes-count';
  }

  updateActionButtonsForToken(tokenId, hasActionableChange) {
    super.updateActionButtonsForToken(tokenId, hasActionableChange);
  }
}
