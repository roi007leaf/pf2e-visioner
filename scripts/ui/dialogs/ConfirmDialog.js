/**
 * ApplicationV2 confirm dialog with appealing visuals and variants.
 */
import { loadDialogCSS, loadSharedUICSS } from '../../css-loader.js';

export class VisionerConfirmDialog extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {
    constructor({
        title = 'Confirm',
        content = '',
        yes = 'Yes',
        yesValue = true,
        no = 'Cancel',
        noValue = false,
        extra = null,
        variant,
        icon,
    } = {}) {
        // Infer variant if not provided (danger when destructive verbs are used)
        const inferredVariant = variant || (/\b(clear|delete|purge|remove|wipe)\b/i.test(String(yes)) ? 'danger' : 'warning');
        const variantIcon = icon || (inferredVariant === 'danger' ? 'fas fa-trash' : inferredVariant === 'warning' ? 'fas fa-exclamation-triangle' : 'fas fa-question-circle');
        loadDialogCSS();
        loadSharedUICSS();
        super({
            window: {
                title,
                icon: variantIcon,
                contentClasses: ['pf2e-visioner', 'visioner-confirm-dialog']
            }
        });
        this._content = content;
        this._yesLabel = yes;
        this._yesValue = yesValue;
        this._noLabel = no;
        this._noValue = noValue;
        this._extraAction = extra
            ? {
                label: extra.label || 'More',
                value: extra.value ?? 'extra',
                icon: extra.icon || 'fas fa-ellipsis-h',
                variant: extra.variant || 'secondary',
                className: extra.className || (extra.variant === 'primary' ? 'pvv-btn-primary' : 'pvv-btn-secondary'),
            }
            : null;
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
            yesValue: this._yesValue,
            no: this._noLabel,
            noValue: this._noValue,
            extra: this._extraAction,
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
        root?.querySelector?.('[data-action="yes"]')?.addEventListener('click', () => this._resolve(this._yesValue));
        root?.querySelector?.('[data-action="no"]')?.addEventListener('click', () => this._resolve(this._noValue));
        root?.querySelector?.('[data-action="extra"]')?.addEventListener('click', () => this._resolve(this._extraAction?.value ?? 'extra'));
        // Keyboard affordances: Enter -> Yes, Escape -> No
        root?.addEventListener?.('keydown', (ev) => {
            if (ev.key === 'Enter') { ev.preventDefault(); this._resolve(this._yesValue); }
            else if (ev.key === 'Escape') { ev.preventDefault(); this._resolve(this._noValue); }
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
