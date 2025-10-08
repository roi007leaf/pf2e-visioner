/**
 * Darkness Mode chooser - ApplicationV2 dialog returning 'plain' | 'heightened' | 'clear' | null
 */
export class DarknessModeDialog extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {
    constructor() {
        super({
            window: {
                title: game.i18n.localize('PF2E_VISIONER.DIALOG_TITLES.DARKNESS_MODE'),
                icon: 'fas fa-moon',
                contentClasses: ['pf2e-visioner', 'pvv-darkness-dialog']
            },
            // Keep the dialog reasonably compact
            position: { width: 400, height: 'auto' },
        });
        this._resolver = null;
    }

    static PARTS = {
        content: { template: 'modules/pf2e-visioner/templates/dialogs/darkness-mode.hbs' }
    };

    _onRender(context, options) {
        super._onRender(context, options);
        const root = this.element;
        const bind = (sel, value) => {
            const el = root?.querySelector?.(sel);
            if (!el) return;
            const handler = (ev) => { ev?.preventDefault?.(); ev?.stopPropagation?.(); this._resolve(value); };
            el.addEventListener('click', handler);
            el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') handler(e); });
            try { el.setAttribute('tabindex', '0'); el.setAttribute('role', 'button'); } catch { }
        };
        bind('[data-action="plain"]', 'plain');
        bind('[data-action="heightened"]', 'heightened');
        bind('[data-action="clear"]', 'clear');
    }

    _resolve(value) {
        try { this.close(); } catch { }
        if (this._resolver) this._resolver(value);
    }

    static async choose() {
        return new Promise((resolve) => {
            const dlg = new this();
            dlg._resolver = resolve;
            dlg.render(true);
        });
    }
}
