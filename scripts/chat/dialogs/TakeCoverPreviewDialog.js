import { COVER_STATES, MODULE_ID, MODULE_TITLE } from '../../constants.js';
import { FeatsHandler } from '../services/FeatsHandler.js';
import { BaseActionDialog } from './base-action-dialog.js';

let currentTakeCoverDialog = null;
const TAKE_COVER_OVERRIDE_STATES = ['none', 'standard', 'greater'];

function normalizeTakeCoverDialogCover(state, { result = false, baseline = false } = {}) {
  if (state === 'greater') return 'greater';
  if (state === 'standard') return 'standard';
  if (state === 'lesser') return result ? 'standard' : baseline ? 'lesser' : 'none';
  return 'none';
}

function getTakeCoverDisplayBaseline(outcome) {
  return normalizeTakeCoverDialogCover(
    outcome?.baselineCover ?? outcome?.currentCover ?? outcome?.oldVisibility ?? outcome?.oldCover,
    { baseline: true },
  );
}

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
    this.filterByDetection = false; // Default to false for take cover
    this.showOnlyChanges = false; // Default to false
    // Per-user default: visually hide Foundry-hidden tokens
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
    const cfg = COVER_STATES[state] || null;
    if (!cfg)
      return {
        label: String(state ?? ''),
        icon: 'fas fa-shield-alt',
        color: '#795548',
        cssClass: 'cover-none',
      };
    let label = cfg.label;
    try {
      label = game.i18n.localize(cfg.label);
    } catch { }
    return {
      label,
      icon: cfg.icon || 'fas fa-shield-alt',
      color: cfg.color || '#795548',
      cssClass: cfg.cssClass || 'cover-none',
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
    try {
      let filtered = this.applyEncounterFilter(
        this.outcomes || [],
        'target',
        'No encounter observers found for this action',
      );

      // Apply ally filtering if ignore allies is enabled
      try {
        const { filterOutcomesByAllies } = await import('../services/infra/shared-utils.js');
        filtered = filterOutcomesByAllies(filtered, this.actorToken, this.ignoreAllies, 'target');
      } catch { }

      // Apply viewport filtering if enabled
      if (this.filterByDetection && this.actorToken) {
        try {
          const { filterOutcomesByDetection } = await import('../services/infra/shared-utils.js');
          filtered = await filterOutcomesByDetection(
            filtered,
            this.actorToken,
            'target',
            false,
            true,
            'target_to_observer',
          );
        } catch {
          /* Viewport filtering is non-critical */
        }
      }

      // Optionally hide Foundry-hidden tokens (document.hidden === true)
      try {
        if (this.hideFoundryHidden) {
          filtered = filtered.filter((o) => o?.target?.document?.hidden !== true);
        }
      } catch { }

      // Apply show-only-changes visual filter
      try {
        if (this.showOnlyChanges) {
          filtered = filtered.filter((o) => !!o.hasActionableChange);
        }
      } catch { }

      return filtered;
    } catch {
      return Array.isArray(this.outcomes) ? this.outcomes : [];
    }
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    // Filter outcomes (use encounter filter + optional Foundry-hidden filter)
    let filteredOutcomes = this.applyEncounterFilter(
      this.outcomes,
      'target',
      'No encounter observers found for this action',
    );
    // Apply ally filtering for display purposes
    try {
      const { filterOutcomesByAllies } = await import('../services/infra/shared-utils.js');
      filteredOutcomes = filterOutcomesByAllies(
        filteredOutcomes,
        this.actorToken,
        this.ignoreAllies,
        'target',
      );
    } catch { }

    // Apply viewport filtering if enabled
    if (this.filterByDetection && this.actorToken) {
      try {
        const { filterOutcomesByDetection } = await import('../services/infra/shared-utils.js');
        filteredOutcomes = await filterOutcomesByDetection(
          filteredOutcomes,
          this.actorToken,
          'target',
          false,
          true,
          'target_to_observer',
        );
      } catch {
        /* LOS filtering is non-critical */
      }
    }

    // Apply defeated token filtering (exclude dead/unconscious tokens)
    try {
      const { filterOutcomesByDefeated } = await import('../services/infra/shared-utils.js');
      filteredOutcomes = filterOutcomesByDefeated(filteredOutcomes, 'target');
    } catch {
      /* Defeated filtering is non-critical */
    }

    try {
      if (this.hideFoundryHidden) {
        filteredOutcomes = filteredOutcomes.filter((o) => o?.target?.document?.hidden !== true);
      }
    } catch { }

    const allStates = TAKE_COVER_OVERRIDE_STATES; // for Take Cover override icons

    const processed = filteredOutcomes.map((o) => {
      const calculatedNew = normalizeTakeCoverDialogCover(o.newVisibility || o.newCover, {
        result: true,
      });
      const effectiveNew = normalizeTakeCoverDialogCover(o.overrideState || calculatedNew, {
        result: true,
      });
      const baseOld = getTakeCoverDisplayBaseline(o);
      let hasActionableChange =
        o.takeCoverProneRangedOnly === true ||
        (baseOld != null && effectiveNew != null && effectiveNew !== baseOld);
      const availableStates = allStates.map((s) => ({
        value: s,
        label: this.coverConfig(s).label,
        icon: this.coverConfig(s).icon,
        color: this.coverConfig(s).color,
        cssClass: this.coverConfig(s).cssClass,
        selected: s === effectiveNew,
        calculatedOutcome: s === calculatedNew,
      }));
      return {
        ...o,
        tokenImage: this.resolveTokenImage(o.target),
        oldCoverCfg: this.coverConfig(baseOld),
        newCoverCfg: this.coverConfig(effectiveNew),
        availableStates,
        overrideState: effectiveNew,
        // Compatibility fields so base handlers work with cover like visibility
        oldVisibility: baseOld,
        currentVisibility: baseOld,
        newVisibility: effectiveNew,
        hasActionableChange,
      };
    });

    // Filter display based on showOnlyChanges
    const displayOutcomes = this.showOnlyChanges
      ? processed.filter((o) => !!o.hasActionableChange)
      : processed;
    const takerName = this.actorToken?.name || '';
    context.actorToken = this.actorToken;
    context.actorTokenImage = this.resolveTokenImage(this.actorToken);
    context.taker = {
      name: takerName,
      image: context.actorTokenImage,
    };
    context.outcomes = displayOutcomes;
    Object.assign(context, this.buildCommonContext(displayOutcomes));
    context.bulkOverrideLabel = game?.i18n?.localize?.('PF2E_VISIONER.UI.BULK_SET_COVER') || 'Bulk Set Cover';
    context.takeCoverBadges = this._buildTakeCoverBadges();
    // Expose UI flags
    context.hideFoundryHidden = !!this.hideFoundryHidden;
    context.ignoreAllies = !!this.ignoreAllies;
    context.filterByDetection = !!this.filterByDetection;
    context.showOnlyChanges = !!this.showOnlyChanges;
    context.encounterOnly = !!this.encounterOnly;
    return context;
  }

  _buildTakeCoverBadges() {
    const badges = [];
    try {
      if (FeatsHandler.hasCeaselessShadows(this.actorToken)) {
        badges.push({
          key: 'ceaseless-shadows',
          icon: 'fas fa-infinity',
          label: game.i18n.localize('PF2E_VISIONER.FEAT.CEASELESS_SHADOWS'),
          tooltip: game.i18n.localize('PF2E_VISIONER.UI.CEASELESS_SHADOWS_TAKE_COVER_TOOLTIP'),
        });
      }
    } catch { }
    return badges;
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
    this.addIconClickHandlers();
    this.markInitialSelections();
    this.updateBulkActionButtons();
    this.updateChangesCount();
  }

  getChangesCounterClass() {
    return 'take-cover-preview-dialog-changes-count';
  }

  // Static handlers
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
    } catch { }
    app.bulkActionState = 'initial';
    await app.render({ force: true });
  }

  static async _onToggleIgnoreAllies(event, target) {
    const app = currentTakeCoverDialog;
    if (!app) return;
    app.ignoreAllies = target.checked;
    try {
      await game.settings.set(MODULE_ID, 'ignoreAllies', target.checked);
    } catch { }
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
    const app = currentTakeCoverDialog;
    if (!app) return;
    if (app.bulkActionState === 'applied') {
      (await import('../services/infra/notifications.js')).notify?.warn?.(
        `${MODULE_TITLE}: Apply All has already been used. Use Revert All to undo changes.`,
      );
      return;
    }
    const filtered = await app.getFilteredOutcomes();
    // Be robust: prefer precomputed actionable flag (from context logic),
    // but fall back to recomputing if not present
    const changed = filtered.filter((o) => {
      if (o?.hasActionableChange === true) return true;
      if (o?.takeCoverProneRangedOnly === true) return true;
      const eff = o.overrideState ?? o.newVisibility ?? o.newCover;
      const base = getTakeCoverDisplayBaseline(o);
      return eff != null && base != null && eff !== base;
    });

    if (changed.length === 0) {
      (await import('../services/infra/notifications.js')).notify?.info?.(
        `${MODULE_TITLE}: No changes to apply`,
      );
      return;
    }
    const overrides = {};
    for (const o of changed) {
      const id = o?.target?.id;
      const s = o?.overrideState ?? o?.newVisibility ?? o?.newCover;
      if (id && s) overrides[id] = s;
    }
    const { applyNowTakeCover } = await import('../services/index.js');
    await applyNowTakeCover({ ...app.actionData, overrides }, { html: () => { }, attr: () => { } });
    app.bulkActionState = 'applied';
    app.updateBulkActionButtons();
    app.updateRowButtonsToApplied(
      changed.map((o) => ({ target: { id: o.target.id }, hasActionableChange: true })),
    );
    app.updateChangesCount();
    app.close();
  }

  static async _onRevertAll() {
    const app = currentTakeCoverDialog;
    if (!app) return;
    if (app.bulkActionState === 'reverted') {
      (await import('../services/infra/notifications.js')).notify?.warn?.(
        `${MODULE_TITLE}: Revert All has already been used. Use Apply All to reapply changes.`,
      );
      return;
    }
    const { revertNowTakeCover } = await import('../services/index.js');
    await revertNowTakeCover(app.actionData, { html: () => { }, attr: () => { } });
    app.bulkActionState = 'reverted';
    app.updateBulkActionButtons();
    // Respect filters for UI row updates
    let filtered = await app.getFilteredOutcomes();
    app.updateRowButtonsToReverted(
      filtered.map((o) => ({ target: { id: o.target.id }, hasActionableChange: true })),
    );
    app.updateChangesCount();
  }

  static async _onApplyChange(event, target) {
    const app = currentTakeCoverDialog;
    if (!app) return;
    const tokenId = target?.dataset?.tokenId;
    const outcome = app.outcomes.find((o) => o.target.id === tokenId);
    if (!outcome) return;
    const eff = outcome.overrideState || outcome.newVisibility || outcome.newCover;
    const base = getTakeCoverDisplayBaseline(outcome);
    if (eff === base && outcome.takeCoverProneRangedOnly !== true) return;
    const overrides = { [tokenId]: eff };
    const { applyNowTakeCover } = await import('../services/index.js');
    await applyNowTakeCover({ ...app.actionData, overrides }, { html: () => { }, attr: () => { } });
    app.updateRowButtonsToApplied([{ target: { id: tokenId }, hasActionableChange: true }]);
    app.updateChangesCount();
  }

  static async _onRevertChange(event, target) {
    const app = currentTakeCoverDialog;
    if (!app) return;
    const tokenId = target?.dataset?.tokenId;
    const { revertNowTakeCover } = await import('../services/index.js');
    // Pass the specific tokenId for per-row revert
    const actionDataWithTarget = { ...app.actionData, targetTokenId: tokenId };
    await revertNowTakeCover(actionDataWithTarget, { html: () => { }, attr: () => { } });
    app.updateRowButtonsToReverted([{ target: { id: tokenId }, hasActionableChange: true }]);
    app.updateChangesCount();
  }

  static async _onOverrideState() {
    /* handled by BaseActionDialog.addIconClickHandlers */
  }
}
