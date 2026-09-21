import { loadDialogCSS, loadSharedUICSS } from '../../css-loader.js';
import {
  applyWallSimplification,
  getWallSimplifyBackup,
  planSceneWallSimplification,
  undoWallSimplification,
} from '../../services/Walls/wall-simplify-apply.js';

const DEFAULT_TOLERANCE_PX = 10;

export class WallSimplifyDialog extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2,
) {
  constructor({ scene = globalThis.canvas?.scene, tolerance = DEFAULT_TOLERANCE_PX } = {}) {
    loadDialogCSS();
    loadSharedUICSS();
    super({
      window: {
        title: game.i18n.localize('PF2E_VISIONER.WALL_SIMPLIFY.TITLE'),
        icon: 'fas fa-compress-alt',
        contentClasses: ['pf2e-visioner', 'visioner-confirm-dialog'],
      },
    });
    this._scene = scene;
    this._tolerance = tolerance;
    this._busy = false;
  }

  static PARTS = {
    content: { template: 'modules/pf2e-visioner/templates/dialogs/wall-simplify.hbs' },
  };

  _currentPlan() {
    return planSceneWallSimplification(this._scene, this._tolerance);
  }

  async _prepareContext(context) {
    const base = await super._prepareContext(context);
    const plan = this._currentPlan();
    const backup = getWallSimplifyBackup(this._scene);
    return {
      ...base,
      tolerance: this._tolerance,
      before: plan.before,
      after: plan.after,
      removed: plan.before - plan.after,
      canApply: plan.deleteIds.length > 0 && !this._busy,
      hasBackup: !!backup,
      backupCount: backup?.deleted?.length ?? 0,
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const root = this.element;
    const input = root?.querySelector?.('input[name="tolerance"]');
    input?.addEventListener('input', () => this._onToleranceInput(input));
    root?.querySelector?.('[data-action="apply"]')?.addEventListener('click', () => this._apply());
    root?.querySelector?.('[data-action="undo"]')?.addEventListener('click', () => this._undo());
    root?.querySelector?.('[data-action="no"]')?.addEventListener('click', () => this.close());
  }

  _onToleranceInput(input) {
    const value = Number(input.value);
    this._tolerance = Number.isFinite(value) && value >= 0 ? value : 0;
    this._refreshPreview();
  }

  _refreshPreview() {
    const plan = this._currentPlan();
    const preview = this.element?.querySelector?.('[data-role="preview"]');
    if (preview) {
      preview.textContent = game.i18n.format('PF2E_VISIONER.WALL_SIMPLIFY.PREVIEW', {
        before: plan.before,
        after: plan.after,
        removed: plan.before - plan.after,
      });
    }
    const apply = this.element?.querySelector?.('[data-action="apply"]');
    if (apply) apply.disabled = plan.deleteIds.length === 0 || this._busy;
  }

  async _apply() {
    if (this._busy) return;
    this._busy = true;
    try {
      const { plan, applied } = await applyWallSimplification(this._scene, this._tolerance);
      if (applied) {
        ui.notifications.info(
          game.i18n.format('PF2E_VISIONER.WALL_SIMPLIFY.APPLIED', {
            before: plan.before,
            after: plan.after,
          }),
        );
      }
    } catch (error) {
      console.error('[pf2e-visioner] wall simplify failed', error);
      ui.notifications.error(game.i18n.localize('PF2E_VISIONER.WALL_SIMPLIFY.FAILED'));
    } finally {
      this._busy = false;
    }
    this.render(true);
  }

  async _undo() {
    if (this._busy) return;
    this._busy = true;
    try {
      if (await undoWallSimplification(this._scene)) {
        ui.notifications.info(game.i18n.localize('PF2E_VISIONER.WALL_SIMPLIFY.UNDONE'));
      }
    } catch (error) {
      console.error('[pf2e-visioner] wall simplify undo failed', error);
      ui.notifications.error(game.i18n.localize('PF2E_VISIONER.WALL_SIMPLIFY.FAILED'));
    } finally {
      this._busy = false;
    }
    this.render(true);
  }
}
