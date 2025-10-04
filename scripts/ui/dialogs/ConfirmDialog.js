/**
 * ApplicationV2 confirm dialog with appealing visuals and variants.
 */
export class VisionerConfirmDialog extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {
    constructor({ title = 'Confirm', content = '', yes = 'Yes', no = 'Cancel', variant, icon } = {}) {
        // Infer variant if not provided (danger when destructive verbs are used)
        const inferredVariant = variant || (/\b(clear|delete|purge|remove|wipe)\b/i.test(String(yes)) ? 'danger' : 'warning');
        const variantIcon = icon || (inferredVariant === 'danger' ? 'fas fa-trash' : inferredVariant === 'warning' ? 'fas fa-exclamation-triangle' : 'fas fa-question-circle');
        super({
            window: {
                title,
                icon: variantIcon,
                contentClasses: ['pf2e-visioner', 'visioner-confirm-dialog']
            }
        });
        this._content = content;
        this._yesLabel = yes;
        this._noLabel = no;
        this._variant = inferredVariant;
        this._icon = variantIcon;
        this._resolver = null;
    }

    static PARTS = {
        content: { template: 'modules/pf2e-visioner/templates/dialogs/confirm.hbs' }
    };

    async _prepareContext(context) {
        const base = await super._prepareContext(context);
        const isDanger = this._variant === 'danger';
        const isWarning = this._variant === 'warning';
        const isInfo = this._variant === 'info';
        return {
            ...base,
            content: this._content,
            yes: this._yesLabel,
            no: this._noLabel,
            variant: this._variant,
            icon: this._icon,
            isDanger,
            isWarning,
            isInfo,
        };
    }

    _onRender(context, options) {
        super._onRender(context, options);
        const root = this.element;
        root?.querySelector?.('[data-action="yes"]')?.addEventListener('click', () => this._resolve(true));
        root?.querySelector?.('[data-action="no"]')?.addEventListener('click', () => this._resolve(false));
        // Keyboard affordances: Enter -> Yes, Escape -> No
        root?.addEventListener?.('keydown', (ev) => {
            if (ev.key === 'Enter') { ev.preventDefault(); this._resolve(true); }
            else if (ev.key === 'Escape') { ev.preventDefault(); this._resolve(false); }
        });
    }

    _resolve(value) {
        try { this.close(); } catch { }
        if (this._resolver) this._resolver(value);
    }

    static async confirm(opts = {}) {
        return new Promise((resolve) => {
            const dlg = new this(opts);
            dlg._resolver = resolve;
            dlg.render(true);
        });
    }
}
