import { COVER_STATES, MODULE_ID } from '../constants.js';
import {
  getCoverBonusByState,
  getCoverLabel,
  getCoverStealthBonusByState,
} from '../helpers/cover-helpers.js';

let currentCoverQuickDialog = null;

export class CoverQuickOverrideDialog extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: 'pv-cover-quick-override',
    tag: 'div',
    window: {
      title: 'Cover Override',
      icon: 'fas fa-shield-alt',
      resizable: false,
    },
    position: { width: 380, height: 'auto' },
    classes: [MODULE_ID, 'pv-cover-quick-override'],
    actions: {
      roll: CoverQuickOverrideDialog._onRoll,
      cancel: CoverQuickOverrideDialog._onCancel,
    },
  };

  constructor(initialState = 'none', manualCover, options = {}) {
    super(options);
    this.selected = initialState;
    this._resolver = null;
    this.isStealthContext = options.isStealthContext || false;
    this.manualCover = manualCover;
    currentCoverQuickDialog = this;
  }

  setResolver(fn) {
    this._resolver = fn;
  }

  _getStates() {
    return ['none', 'lesser', 'standard', 'greater'];
  }

  async _renderHTML(_context, _options) {
    const states = this._getStates();
    const makeButton = (s) => {
      const cfg = COVER_STATES?.[s] || {};
      const icon = cfg.icon || 'fas fa-shield-alt';
      const color = cfg.color || 'inherit';
      const label = getCoverLabel(s);
      const bonus = this.isStealthContext
        ? getCoverStealthBonusByState(s) || 0
        : getCoverBonusByState(s) || 0;
      const tooltip = `${label}${bonus > 0 ? ` (+${bonus})` : ''}`;
      const active = s === this.selected;
      return `<button type="button" class="pv-qo-btn${active ? ' active' : ''}" data-state="${s}" data-tooltip="${tooltip}" aria-label="${tooltip}">
          <i class="${icon}" style="color:${color}"></i>
      </button>`;
    };
    const rollLabel =
      game.i18n?.localize?.('PF2E_VISIONER.UI.ROLL') ??
      game.i18n?.localize?.('PF2E.Roll') ??
      'Roll';
    const cancelLabel = game.i18n?.localize?.('Cancel') ?? 'Cancel';
    return `
      <style>
        .pv-qo-wrap { display:flex; flex-direction:column; gap:8px; }
        .pv-qo-row { display:flex; justify-content:center; gap:8px; }
        .pv-qo-btn { width:32px; height:32px; border:1px solid rgba(255,255,255,0.2); border-radius:6px; background:transparent; display:inline-flex; align-items:center; justify-content:center; cursor:pointer; }
        .pv-qo-btn.active { background: var(--color-bg-tertiary, rgba(0,0,0,0.2)); }
        .pv-qo-title { font-weight:600; text-align:center; }
        .pv-qo-footer { display:flex; justify-content:center; gap:8px; margin-top:8px; }
        .pv-qo-footer .roll { background: var(--color-primary-2, #2c5aa0); color: #fff; }
      </style>
      <div class="pv-qo-wrap">
        ${this.manualCover === 'none' ? `<div class="pv-qo-row">${states.map(makeButton).join('')}</div>` : '<div class="pv-cover-manual" style="display:flex;">Manual cover detected, override unavailable</div>'}
        <div class="pv-qo-footer">
          <button type="button" class="roll" data-action="roll"><i class="fas fa-dice-d20"></i> ${rollLabel}</button>
          <button type="button" data-action="cancel">${cancelLabel}</button>
        </div>
      </div>
    `;
  }

  _replaceHTML(result, content, _options) {
    content.innerHTML = result;
    return content;
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    // Attach selection handlers
    try {
      const root = this.element;
      root.querySelectorAll('.pv-qo-btn').forEach((btn) => {
        btn.addEventListener('click', (ev) => {
          const el = ev.currentTarget;
          const s = el?.dataset?.state;
          if (!s) return;
          this.selected = s;
          root.querySelectorAll('.pv-qo-btn').forEach((b) => b.classList.remove('active'));
          el.classList.add('active');
        });
      });
    } catch (_) {
      /* ignore */
    }
  }

  static _onRoll(event, button) {
    const app = currentCoverQuickDialog;
    if (!app) return;
    try {
      app._resolver?.(app.selected);
    } catch (_) {}
    app.close();
  }

  static _onCancel(event, button) {
    const app = currentCoverQuickDialog;
    if (!app) return;
    try {
      app._resolver?.(null);
    } catch (_) {}
    app.close();
  }

  close(options) {
    currentCoverQuickDialog = null;
    return super.close(options);
  }
}

/**
 * Opens the ApplicationV2-based dialog and resolves with selection or null.
 */
export function openCoverQuickOverrideDialog(initialState = 'none', isStealthContext = false) {
  return new Promise((resolve) => {
    try {
      const app = new CoverQuickOverrideDialog(initialState, { isStealthContext });
      app.setResolver(resolve);
      app.render(true);
    } catch (e) {
      resolve(null);
    }
  });
}
