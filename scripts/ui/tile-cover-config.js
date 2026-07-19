import { MODULE_ID } from '../constants.js';

const COVER_OPTIONS = [
  { value: 'auto', icon: 'fas fa-bolt-auto', color: 'icon-color-gray' },
  { value: 'none', icon: 'fas fa-shield-slash', color: 'icon-color-cover-none' },
  { value: 'lesser', icon: 'fa-regular fa-shield', color: 'icon-color-cover-lesser' },
  { value: 'standard', icon: 'fas fa-shield-alt', color: 'icon-color-cover-standard' },
  { value: 'greater', icon: 'fas fa-shield', color: 'icon-color-cover-greater' },
];

function tooltipKey(value) {
  return `PF2E_VISIONER.UI.TILE_COVER_${value.toUpperCase()}_TOOLTIP`;
}

export function onRenderTileConfig(app, html) {
  try {
    const root = html?.jquery ? html[0] : html;
    const form =
      root?.querySelector?.('form') || root?.querySelector?.('.window-content') || root;
    if (!form || form.querySelector('.pf2e-visioner-tile-cover-settings')) return;

    const current = app?.document?.getFlag?.(MODULE_ID, 'coverOverride') || 'auto';
    const fieldset = document.createElement('fieldset');
    fieldset.className = 'pf2e-visioner-tile-cover-settings';
    fieldset.innerHTML = `
      <legend>PF2E Visioner</legend>
      <div class="form-group">
        <label>${game.i18n.localize('PF2E_VISIONER.UI.COVER_LABEL')}</label>
        <div class="cover-override-buttons pv-u-flex pv-u-gap-4" style="margin-top:4px;">
          ${COVER_OPTIONS.map(
            ({ value, icon, color }) => `
              <button type="button"
                      class="visioner-icon-btn ${current === value ? 'active' : ''}"
                      data-cover-override="${value}"
                      data-tooltip="${game.i18n.localize(tooltipKey(value))}">
                <i class="${icon} ${color}"></i>
              </button>`,
          ).join('')}
        </div>
        <input type="hidden" name="flags.${MODULE_ID}.coverOverride" value="${current === 'auto' ? '' : current}">
        <p class="notes">Configured cover applies when an attack line crosses this tile.</p>
      </div>
    `;

    const basicTab = form.querySelector(
      '.tab[data-tab="position"], .tab[data-tab="basic"], .tab[data-tab="basics"], .tab[data-tab="configuration"]',
    );
    const host = basicTab || form;
    const footer = host.querySelector(':scope > footer, :scope > .form-footer');
    if (footer) host.insertBefore(fieldset, footer);
    else host.appendChild(fieldset);

    const input = fieldset.querySelector(`input[name="flags.${MODULE_ID}.coverOverride"]`);
    const buttons = Array.from(fieldset.querySelectorAll('[data-cover-override]'));
    for (const button of buttons) {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const value = button.dataset.coverOverride;
        for (const candidate of buttons) candidate.classList.toggle('active', candidate === button);
        if (input) input.value = value === 'auto' ? '' : value;
      });
    }
  } catch (error) {
    console.warn('PF2E Visioner | Failed to inject Tile cover configuration:', error);
  }
}
