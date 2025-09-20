import { COVER_STATES, MODULE_ID, MODULE_TITLE } from '../../constants.js';
import { BaseActionDialog } from './base-action-dialog.js';

let currentTakeCoverDialog = null;

export class TakeCoverPreviewDialog extends BaseActionDialog {
  static DEFAULT_OPTIONS = {
    tag: 'div',
    classes: ['pf2e-visioner', 'take-cover-preview-dialog'],
    window: {
      title: 'Take Cover Results',
      icon: 'fas fa-shield-alt',
      resizable: true,
    },
    position: { width: 560, height: 'auto' },
    actions: {
      close: TakeCoverPreviewDialog._onClose,
      applyAll: TakeCoverPreviewDialog._onApplyAll,
      revertAll: TakeCoverPreviewDialog._onRevertAll,
      applyChange: TakeCoverPreviewDialog._onApplyChange,
      revertChange: TakeCoverPreviewDialog._onRevertChange,
      toggleEncounterFilter: TakeCoverPreviewDialog._onToggleEncounterFilter,
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
  } catch {}

      // Optionally hide Foundry-hidden tokens (document.hidden === true)
      try {
        if (this.hideFoundryHidden) {
          filtered = filtered.filter((o) => o?.target?.document?.hidden !== true);
        }
      } catch {}

      // Apply show-only-changes visual filter
      try {
        if (this.showOnlyChanges) {
          filtered = filtered.filter((o) => !!o.hasActionableChange);
        }
      } catch {}

      return filtered;
    } catch {
      return Array.isArray(this.outcomes) ? this.outcomes : [];
    }
  }

  async _prepareContext(options) {
    await super._prepareContext(options);

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
    try {
      if (this.hideFoundryHidden) {
        filteredOutcomes = filteredOutcomes.filter((o) => o?.target?.document?.hidden !== true);
      }
    } catch {}

    // Map cover constants to templating-friendly config
    const coverCfg = (s) => {
      const cfg = COVER_STATES[s] || null;
      if (!cfg)
        return {
          label: String(s ?? ''),
          icon: 'fas fa-shield-alt',
          color: '#795548',
          cssClass: 'cover-none',
        };
      let label = cfg.label;
      try {
        label = game.i18n.localize(cfg.label);
      } catch {}
      return {
        label,
        icon: cfg.icon || 'fas fa-shield-alt',
        color: cfg.color || '#795548',
        cssClass: cfg.cssClass || 'cover-none',
      };
    };

    const allStates = ['none', 'lesser', 'standard', 'greater']; // for override icons

  const processed = filteredOutcomes.map((o) => {
      const effectiveNew = o.overrideState || o.newVisibility || o.newCover;
      const baseOld = o.oldVisibility || o.oldCover || o.currentCover;
      let hasActionableChange = baseOld != null && effectiveNew != null && effectiveNew !== baseOld;
      const availableStates = allStates.map((s) => ({
        value: s,
        label: coverCfg(s).label,
        icon: coverCfg(s).icon,
        color: coverCfg(s).color,
        cssClass: coverCfg(s).cssClass,
        selected: s === effectiveNew,
        calculatedOutcome: s === (o.newVisibility || o.newCover),
      }));
      return {
        ...o,
        tokenImage: this.resolveTokenImage(o.target),
        oldCoverCfg: coverCfg(baseOld),
        newCoverCfg: coverCfg(effectiveNew),
        availableStates,
        overrideState: effectiveNew,
        // Compatibility fields so base handlers work with cover like visibility
        oldVisibility: baseOld,
        currentVisibility: baseOld,
        newVisibility: effectiveNew,
        hasActionableChange,
      };
    });

    // Process system condition replacement for GM users
    if (game.user?.isGM) {
      const actor = this.actorToken?.actor;
      if (actor) {
        // Check for PF2e cover effect system
        const coverEffect = actor?.itemTypes?.effect?.find?.((e) => e.slug === 'effect-cover');

        if (coverEffect) {
          // Extract cover level from PF2e flags, with robust fallbacks
          let coverLevel = coverEffect.flags?.pf2e?.rulesSelections?.cover?.level;
          if (!coverLevel) {
            try {
              // Fallback: infer from FlatModifier to AC in rules
              const rules = Array.isArray(coverEffect.system?.rules)
                ? coverEffect.system.rules
                : [];
              const acMods = rules.filter(
                (r) => String(r?.key) === 'FlatModifier' && String(r?.selector) === 'ac',
              );
              const val = acMods.map((r) => Number(r?.value)).find((n) => !Number.isNaN(n));
              if (val === 4) coverLevel = 'greater';
              else if (val === 2) coverLevel = 'standard';
              else if (val === 1) coverLevel = 'lesser';
            } catch {}
          }

          if (coverLevel) {
            // Convert PF2e system cover to Visioner cover (no upgrade rules).
            // Keep the original Visioner state as "old/current" and set the PF2e level as the desired new state.
            for (const outcome of processed) {
              const currentVisioner =
                outcome.currentCover ??
                outcome.oldCover ??
                outcome.currentVisibility ??
                outcome.oldVisibility ??
                'none';
              const desired = coverLevel;
              outcome.newCover = desired;
              outcome.newVisibility = desired; // compatibility
              outcome.overrideState = desired;
              outcome.hasActionableChange = desired !== currentVisioner;
              // Persist PF2e level to use during Apply All
              outcome.pf2eEffectLevel = coverLevel;
            }
          }
        }
      }
    }

    // Keep full processed list for logic, but filter display based on showOnlyChanges
    this.outcomes = processed;
    const displayOutcomes = this.showOnlyChanges
      ? processed.filter((o) => !!o.hasActionableChange)
      : processed;
    context.actorToken = this.actorToken;
    context.outcomes = displayOutcomes;
    Object.assign(context, this.buildCommonContext(displayOutcomes));
    // Expose UI flags
    context.hideFoundryHidden = !!this.hideFoundryHidden;
    context.ignoreAllies = !!this.ignoreAllies;
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
    this.addIconClickHandlers();
    this.markInitialSelections();
    this.updateBulkActionButtons();
    this.updateChangesCount();

    // Wire up "Hide Foundry-hidden tokens" checkbox each render
    try {
      const cbh = this.element.querySelector('input[data-action="toggleHideFoundryHidden"]');
      if (cbh) {
        // Avoid stacking listeners on re-render
        cbh.onchange = null;
        cbh.addEventListener('change', async () => {
          const checked = !!cbh.checked;
          this.hideFoundryHidden = checked;
          try {
            await game.settings.set(MODULE_ID, 'hideFoundryHiddenTokens', checked);
          } catch {}
          this.bulkActionState = 'initial';
          this.render({ force: true });
        });
      }
  } catch {}

    // Wire up Ignore Allies checkbox
    try {
      const cba = this.element.querySelector('input[data-action="toggleIgnoreAllies"]');
      if (cba) {
        cba.onchange = null;
        cba.addEventListener('change', () => {
          this.ignoreAllies = !!cba.checked;
          this.bulkActionState = 'initial';
          this.render({ force: true });
        });
      }
    } catch {}
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
    app.render({ force: true });
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
      const eff = o.overrideState ?? o.newVisibility ?? o.newCover;
      const base = o.oldVisibility ?? o.oldCover ?? o.currentCover;
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
      // If PF2e system cover effect exists and indicates a level, prefer that as final (bypass upgrade rules)
      const systemOverride = o?.pf2eEffectLevel || null;
      const s = systemOverride ?? o?.overrideState ?? o?.newVisibility ?? o?.newCover;
      if (id && s) overrides[id] = s;
    }
    const { applyNowTakeCover } = await import('../services/index.js');
    await applyNowTakeCover({ ...app.actionData, overrides }, { html: () => {}, attr: () => {} });
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
    await revertNowTakeCover(app.actionData, { html: () => {}, attr: () => {} });
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
    const base = outcome.oldVisibility || outcome.oldCover || outcome.currentCover;
    if (eff === base) return;
    const overrides = { [tokenId]: eff };
    const { applyNowTakeCover } = await import('../services/index.js');
    await applyNowTakeCover({ ...app.actionData, overrides }, { html: () => {}, attr: () => {} });
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
    await revertNowTakeCover(actionDataWithTarget, { html: () => {}, attr: () => {} });
    app.updateRowButtonsToReverted([{ target: { id: tokenId }, hasActionableChange: true }]);
    app.updateChangesCount();
  }

  static async _onOverrideState() {
    /* handled by BaseActionDialog.addIconClickHandlers */
  }
}
