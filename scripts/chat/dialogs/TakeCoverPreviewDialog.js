import { COVER_STATES, MODULE_ID } from '../../constants.js';
import { BaseActionDialog } from './base-action-dialog.js';
import {
  applyAllTakeCoverChanges,
  applyTakeCoverChange,
  revertAllTakeCoverChanges,
  revertTakeCoverChange,
} from './TakeCover/take-cover-dialog-actions.js';
import {
  TAKE_COVER_OVERRIDE_STATES,
  getTakeCoverDialogFilteredOutcomes,
  prepareTakeCoverDialogContext,
} from './TakeCover/take-cover-dialog-context.js';

let currentTakeCoverDialog = null;

export class TakeCoverPreviewDialog extends BaseActionDialog {
  static DEFAULT_OPTIONS = {
    tag: 'div',
    classes: ['pf2e-visioner', 'take-cover-preview-dialog'],
    window: {
      title: game.i18n.localize('PF2E_VISIONER.DIALOG_TITLES.TAKE_COVER_RESULTS'),
      icon: 'fas fa-shield-alt',
      resizable: true,
    },
    position: { width: 600, height: 'auto' },
    actions: {
      close: TakeCoverPreviewDialog._onClose,
      applyAll: TakeCoverPreviewDialog._onApplyAll,
      revertAll: TakeCoverPreviewDialog._onRevertAll,
      applyChange: TakeCoverPreviewDialog._onApplyChange,
      revertChange: TakeCoverPreviewDialog._onRevertChange,
      toggleEncounterFilter: TakeCoverPreviewDialog._onToggleEncounterFilter,
      toggleFilterByDetection: TakeCoverPreviewDialog._onToggleFilterByDetection,
      toggleHideFoundryHidden: TakeCoverPreviewDialog._onToggleHideFoundryHidden,
      toggleIgnoreAllies: TakeCoverPreviewDialog._onToggleIgnoreAllies,
      toggleShowOnlyChanges: TakeCoverPreviewDialog._onToggleShowOnlyChanges,
      overrideState: TakeCoverPreviewDialog._onOverrideState,
    },
  };

  static PARTS = {
    content: { template: 'modules/pf2e-visioner/templates/take-cover-preview.hbs' },
  };

  constructor(actorToken, outcomes, changes, actionData, options = {}) {
    super(options);
    this.actorToken = actorToken;
    this.outcomes = Array.isArray(outcomes) ? outcomes : [];
    this.changes = Array.isArray(changes) ? changes : [];
    this.actionData = { ...(actionData || {}), actionType: 'take-cover' };
    this.encounterOnly = game.settings.get(MODULE_ID, 'defaultEncounterFilter');
    this.ignoreAllies = game.settings.get(MODULE_ID, 'ignoreAllies');
    this.filterByDetection = false;
    this.showOnlyChanges = false;

    try {
      this.hideFoundryHidden = !!game.settings.get(MODULE_ID, 'hideFoundryHiddenTokens');
    } catch {
      this.hideFoundryHidden = false;
    }

    this.bulkActionState = 'initial';
    currentTakeCoverDialog = this;
  }

  getOutcomeTokenId(outcome) {
    return outcome?.target?.id ?? null;
  }

  coverConfig(state) {
    const config = COVER_STATES[state] || null;
    if (!config) {
      return {
        label: String(state ?? ''),
        icon: 'fas fa-shield-alt',
        color: '#795548',
        cssClass: 'cover-none',
      };
    }

    let label = config.label;
    try {
      label = game.i18n.localize(config.label);
    } catch {
      /* Label may already be display text in tests */
    }

    return {
      label,
      icon: config.icon || 'fas fa-shield-alt',
      color: config.color || '#795548',
      cssClass: config.cssClass || 'cover-none',
    };
  }

  _buildBulkOverrideStates() {
    return TAKE_COVER_OVERRIDE_STATES.map((state) => ({
      value: state,
      ...this.coverConfig(state),
    }));
  }

  _deriveBulkStatesFromOutcomes(outcomes) {
    try {
      if (!Array.isArray(outcomes) || outcomes.length === 0) return this._buildBulkOverrideStates();

      const set = new Set();
      for (const outcome of outcomes) {
        if (!Array.isArray(outcome?.availableStates)) continue;
        for (const state of outcome.availableStates) {
          const value = state?.value ?? state?.key;
          if (typeof value === 'string' && COVER_STATES[value]) set.add(value);
        }
      }

      const states = set.size
        ? TAKE_COVER_OVERRIDE_STATES.filter((state) => set.has(state))
        : TAKE_COVER_OVERRIDE_STATES;
      return states.map((state) => ({ value: state, ...this.coverConfig(state) }));
    } catch {
      return this._buildBulkOverrideStates();
    }
  }

  async getFilteredOutcomes() {
    return getTakeCoverDialogFilteredOutcomes(this);
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    return prepareTakeCoverDialogContext(this, context);
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
    this.addIconClickHandlers();
    this.markInitialSelections();
    this.updateBulkActionButtons();
    this.updateChangesCount();
  }

  getChangesCounterClass() {
    return 'take-cover-preview-dialog-changes-count';
  }

  static async _onClose(event, target) {
    currentTakeCoverDialog = null;
    return super._onClose?.(event, target);
  }

  static async _onToggleEncounterFilter(event, target) {
    const app = currentTakeCoverDialog;
    if (!app) return;
    app.encounterOnly = target.checked;
    app.bulkActionState = 'initial';
    await app.render({ force: true });
  }

  static async _onToggleFilterByDetection(event, target) {
    const app = currentTakeCoverDialog;
    if (!app) return;
    app.filterByDetection = target.checked;
    app.bulkActionState = 'initial';
    await app.render({ force: true });
  }

  static async _onToggleHideFoundryHidden(event, target) {
    const app = currentTakeCoverDialog;
    if (!app) return;
    app.hideFoundryHidden = target.checked;
    try {
      await game.settings.set(MODULE_ID, 'hideFoundryHiddenTokens', target.checked);
    } catch {
      /* Setting persistence is optional */
    }
    app.bulkActionState = 'initial';
    await app.render({ force: true });
  }

  static async _onToggleIgnoreAllies(event, target) {
    const app = currentTakeCoverDialog;
    if (!app) return;
    app.ignoreAllies = target.checked;
    try {
      await game.settings.set(MODULE_ID, 'ignoreAllies', target.checked);
    } catch {
      /* Setting persistence is optional */
    }
    app.bulkActionState = 'initial';
    await app.render({ force: true });
  }

  static async _onToggleShowOnlyChanges(event, target) {
    const app = currentTakeCoverDialog;
    if (!app) return;
    app.showOnlyChanges = target.checked;
    app.bulkActionState = 'initial';
    await app.render({ force: true });
  }

  static async _onApplyAll() {
    await applyAllTakeCoverChanges(currentTakeCoverDialog);
  }

  static async _onRevertAll() {
    await revertAllTakeCoverChanges(currentTakeCoverDialog);
  }

  static async _onApplyChange(event, target) {
    await applyTakeCoverChange(currentTakeCoverDialog, target);
  }

  static async _onRevertChange(event, target) {
    await revertTakeCoverChange(currentTakeCoverDialog, target);
  }

  static async _onOverrideState() {
    /* handled by BaseActionDialog.addIconClickHandlers */
  }
}
