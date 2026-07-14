import { MODULE_ID } from '../constants.js';

export class StealthInitiativeCoverWaitingDialog extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    tag: 'div',
    window: {
      title: game.i18n.localize('PF2E_VISIONER.DIALOG_TITLES.STEALTH_INITIATIVE_COVER_WAITING'),
      icon: 'fas fa-spinner fa-spin',
      resizable: false,
    },
    position: { width: 320, height: 'auto' },
    classes: [MODULE_ID, 'pv-stealth-initiative-cover-waiting'],
  };

  async _renderHTML(_context, _options) {
    const message = game.i18n.localize('PF2E_VISIONER.UI.STEALTH_INITIATIVE_COVER_WAITING');
    return `
      <div style="display:flex; align-items:center; gap:10px; padding:12px;">
        <i class="fas fa-spinner fa-spin" style="font-size:20px;"></i>
        <span>${message}</span>
      </div>
    `;
  }

  _replaceHTML(result, content, _options) {
    content.innerHTML = result;
    return content;
  }
}
