import { MODULE_ID } from '../../constants.js';
import { panToAndSelectToken } from '../shared-ui-utils.js';

export class VisionMasterDialog extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: 'pv-vision-master-dialog',
    tag: 'div',
    window: {
      title: game.i18n.localize('PF2E_VISIONER.VISION_MASTER_DIALOG.TITLE'),
      icon: 'fas fa-eye',
      resizable: true,
    },
    position: { width: 400, height: 500 },
    classes: [MODULE_ID, 'pv-vision-master-dialog'],
  };

  constructor(currentTokenId, excludeTokenId, currentMode = 'one-way', options = {}) {
    super(options);
    this.currentTokenId = currentTokenId || '';
    this.excludeTokenId = excludeTokenId;
    this.currentMode = currentMode || 'one-way';
    this._resolver = null;
  }

  setResolver(fn) {
    this._resolver = fn;
  }

  _getSceneTokens() {
    const tokens = canvas?.tokens?.placeables || [];
    const excludeToken = this.excludeTokenId ? canvas?.tokens?.get(this.excludeTokenId) : null;
    const filtered = tokens.filter((t) => {
      const tid = t?.document?.id ?? t?.id;
      if (!tid || tid === this.excludeTokenId) return false;
      const actorType = t?.actor?.type;
      if (actorType === 'hazard' || actorType === 'loot') return false;
      if (!t?.document?.sight?.enabled) return false;
      return true;
    });
    if (excludeToken) {
      const ex = excludeToken.center || { x: excludeToken.x, y: excludeToken.y };
      filtered.sort((a, b) => {
        const ac = a.center || { x: a.x, y: a.y };
        const bc = b.center || { x: b.x, y: b.y };
        const distA = Math.hypot(ac.x - ex.x, ac.y - ex.y);
        const distB = Math.hypot(bc.x - ex.x, bc.y - ex.y);
        return distA - distB;
      });
    }
    return filtered;
  }

  _resolveTokenImage(token) {
    try {
      return (
        token?.document?.texture?.src ||
        token?.texture?.src ||
        token?.actor?.img ||
        token?.actor?.prototypeToken?.texture?.src ||
        'icons/svg/mystery-man.svg'
      );
    } catch {
      return 'icons/svg/mystery-man.svg';
    }
  }

  async _renderHTML(_context, _options) {
    const tokens = this._getSceneTokens();
    const noneLabel = game.i18n.localize('PF2E_VISIONER.VISION_MASTER_DIALOG.NONE');
    const panLabel = game.i18n.localize('PF2E_VISIONER.VISION_MASTER_DIALOG.PAN');
    const cancelLabel = game.i18n.localize('Cancel');
    const noTokensLabel = game.i18n.localize('PF2E_VISIONER.VISION_MASTER_DIALOG.NO_TOKENS');
    const modeLabelText = game.i18n.localize('PF2E_VISIONER.VISION_MASTER_DIALOG.MODE_LABEL');
    const modeOneWay = game.i18n.localize('PF2E_VISIONER.VISION_MASTER_DIALOG.MODE_ONE_WAY');
    const modeTwoWay = game.i18n.localize('PF2E_VISIONER.VISION_MASTER_DIALOG.MODE_TWO_WAY');
    const modeReplace = game.i18n.localize('PF2E_VISIONER.VISION_MASTER_DIALOG.MODE_REPLACE');
    const modeReverse = game.i18n.localize('PF2E_VISIONER.VISION_MASTER_DIALOG.MODE_REVERSE');

    const tokensByActor = new Map();
    for (const t of tokens) {
      const actorId = t?.actor?.id || 'no-actor';
      const name = t?.name || t?.document?.name || 'Unknown';
      const key = `${actorId}-${name}`;
      if (!tokensByActor.has(key)) {
        tokensByActor.set(key, []);
      }
      tokensByActor.get(key).push(t);
    }

    let tokenRows = '';
    if (tokens.length === 0) {
      tokenRows = `<div style="padding: 20px; text-align: center; color: var(--color-text-light-secondary);">${noTokensLabel}</div>`;
    } else {
      for (const t of tokens) {
        const tid = t?.document?.id ?? t?.id;
        const name = t?.name || t?.document?.name || 'Unknown';
        const img = this._resolveTokenImage(t);
        const isSelected = tid === this.currentTokenId;

        const actorId = t?.actor?.id || 'no-actor';
        const key = `${actorId}-${name}`;
        const sameActorTokens = tokensByActor.get(key) || [];
        const showId = sameActorTokens.length > 1;

        tokenRows += `
          <div class="pv-vm-token-row ${isSelected ? 'selected' : ''}" data-token-id="${tid}">
            <img class="pv-vm-token-img" src="${img}" alt="${name}">
            <div class="pv-vm-token-info">
              <span class="pv-vm-token-name">${name}</span>
              ${showId ? `<span class="pv-vm-token-id">(${tid.slice(-6)})</span>` : ''}
            </div>
            <button type="button" class="pv-vm-pan-btn" data-token-id="${tid}" data-tooltip="${panLabel}">
              <i class="fas fa-crosshairs"></i>
            </button>
          </div>
        `;
      }
    }

    return `
      <style>
        .pv-vm-container { display: flex; flex-direction: column; height: 100%; gap: 8px; padding: 8px; }
        
        .pv-vm-mode-section { padding: 10px 12px; border: 1px solid var(--color-border-light-tertiary); border-radius: 6px; background: var(--color-bg-option); }
        .pv-vm-mode-label { font-weight: 600; margin-bottom: 8px; display: block; font-size: 0.9em; color: var(--color-text-light-primary); }
        .pv-vm-mode-options { display: flex; flex-direction: column; gap: 6px; }
        .pv-vm-mode-option { display: flex; align-items: center; gap: 8px; cursor: pointer; padding: 6px; border-radius: 4px; transition: background 0.15s ease; }
        .pv-vm-mode-option:hover { background: var(--color-hover-bg); }
        .pv-vm-mode-option input[type="radio"] { margin: 0; cursor: pointer; }
        .pv-vm-mode-option label { cursor: pointer; flex: 1; font-size: 0.95em; }
        
        .pv-vm-none-row { display: flex; align-items: center; padding: 10px 12px; border: 1px solid var(--color-border-light-tertiary); border-radius: 6px; cursor: pointer; transition: all 0.15s ease; }
        .pv-vm-none-row:hover { background: var(--color-hover-bg); border-color: var(--color-border-light-highlight); }
        .pv-vm-none-row.selected { background: var(--color-primary-1, rgba(0, 100, 200, 0.2)); border-color: var(--color-primary-2, #2c5aa0); }
        .pv-vm-none-icon { width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; font-size: 1.8em; color: var(--color-text-light-secondary); border-radius: 50%; background: var(--color-bg-option); }
        .pv-vm-none-label { flex: 1; margin-left: 12px; font-weight: 500; }
        
        .pv-vm-tokens-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; }
        
        .pv-vm-token-row { display: flex; align-items: center; padding: 8px 12px; border: 1px solid var(--color-border-light-tertiary); border-radius: 6px; gap: 12px; cursor: pointer; transition: all 0.15s ease; }
        .pv-vm-token-row:hover { background: var(--color-hover-bg); border-color: var(--color-border-light-highlight); }
        .pv-vm-token-row.selected { background: var(--color-primary-1, rgba(0, 100, 200, 0.2)); border-color: var(--color-primary-2, #2c5aa0); }
        
        .pv-vm-token-img { width: 48px; height: 48px; min-width: 48px; border-radius: 50%; object-fit: cover; border: 2px solid var(--color-border-light-tertiary); transition: all 0.15s ease; }
        .pv-vm-token-row:hover .pv-vm-token-img { border-color: var(--color-border-light-highlight); }
        .pv-vm-token-row.selected .pv-vm-token-img { border-color: var(--color-primary-2, #2c5aa0); }
        
        .pv-vm-token-info { flex: 1; display: flex; flex-direction: column; min-width: 0; gap: 2px; }
        .pv-vm-token-name { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 1em; }
        .pv-vm-token-id { font-size: 0.75em; color: var(--color-text-light-secondary); font-family: monospace; }
        
        .pv-vm-pan-btn { 
          width: 32px; height: 32px; 
          border: 1px solid var(--color-border-light-tertiary); 
          border-radius: 6px; 
          background: var(--color-bg-option); 
          cursor: pointer; 
          display: flex; align-items: center; justify-content: center; 
          transition: all 0.15s ease;
          color: var(--color-text-light-secondary);
          flex-shrink: 0;
        }
        .pv-vm-pan-btn:hover { 
          background: var(--color-primary-1, rgba(0, 100, 200, 0.2)); 
          border-color: var(--color-primary-2, #2c5aa0); 
          color: var(--color-text-light-primary);
        }
        
        .pv-vm-footer { display: flex; justify-content: flex-end; gap: 8px; padding-top: 12px; border-top: 1px solid var(--color-border-light-tertiary); margin-top: auto; }
        .pv-vm-cancel-btn {
          padding: 8px 16px;
          border: 1px solid var(--color-border-light-tertiary);
          border-radius: 6px;
          background: var(--color-bg-option);
          cursor: pointer;
          font-weight: 500;
          transition: all 0.15s ease;
        }
        .pv-vm-cancel-btn:hover {
          background: var(--color-hover-bg);
          border-color: var(--color-border-light-highlight);
        }
        
        @container (min-width: 500px) {
          .pv-vm-token-img, .pv-vm-none-icon { width: 56px; height: 56px; min-width: 56px; font-size: 2em; }
          .pv-vm-token-name { font-size: 1.1em; }
          .pv-vm-pan-btn { width: 36px; height: 36px; }
        }
        @container (min-width: 600px) {
          .pv-vm-token-img, .pv-vm-none-icon { width: 64px; height: 64px; min-width: 64px; font-size: 2.2em; }
          .pv-vm-token-name { font-size: 1.15em; }
          .pv-vm-token-row { padding: 10px 16px; gap: 16px; }
        }
      </style>
      <div class="pv-vm-container" style="container-type: inline-size;">
        <div class="pv-vm-mode-section">
          <span class="pv-vm-mode-label">${modeLabelText}</span>
          <div class="pv-vm-mode-options">
            <div class="pv-vm-mode-option">
              <input type="radio" id="mode-one-way" name="vision-mode" value="one-way" ${this.currentMode === 'one-way' ? 'checked' : ''}>
              <label for="mode-one-way">${modeOneWay}</label>
            </div>
            <div class="pv-vm-mode-option">
              <input type="radio" id="mode-two-way" name="vision-mode" value="two-way" ${this.currentMode === 'two-way' ? 'checked' : ''}>
              <label for="mode-two-way">${modeTwoWay}</label>
            </div>
            <div class="pv-vm-mode-option">
              <input type="radio" id="mode-replace" name="vision-mode" value="replace" ${this.currentMode === 'replace' ? 'checked' : ''}>
              <label for="mode-replace">${modeReplace}</label>
            </div>
            <div class="pv-vm-mode-option">
              <input type="radio" id="mode-reverse" name="vision-mode" value="reverse" ${this.currentMode === 'reverse' ? 'checked' : ''}>
              <label for="mode-reverse">${modeReverse}</label>
            </div>
          </div>
        </div>
        <div class="pv-vm-none-row ${!this.currentTokenId ? 'selected' : ''}" data-token-id="">
          <div class="pv-vm-none-icon"><i class="fas fa-ban"></i></div>
          <div class="pv-vm-none-label">${noneLabel}</div>
        </div>
        <div class="pv-vm-tokens-list">
          ${tokenRows}
        </div>
        <div class="pv-vm-footer">
          <button type="button" class="pv-vm-cancel-btn">${cancelLabel}</button>
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
    const root = this.element;

    root.querySelector('.pv-vm-none-row')?.addEventListener('click', () => {
      this._selectToken('');
    });

    root.querySelectorAll('.pv-vm-pan-btn').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const tokenId = btn.dataset.tokenId;
        const token = canvas?.tokens?.get(tokenId);
        if (token) {
          panToAndSelectToken(token);
        }
      });
    });

    root.querySelectorAll('.pv-vm-token-row').forEach((row) => {
      row.addEventListener('click', () => {
        const tokenId = row.dataset.tokenId;
        this._selectToken(tokenId);
      });
    });

    root.querySelector('.pv-vm-cancel-btn')?.addEventListener('click', () => {
      this.close();
    });
  }

  _selectToken(tokenId) {
    if (this._resolver) {
      const mode =
        this.element.querySelector('input[name="vision-mode"]:checked')?.value || 'one-way';
      this._resolver({ tokenId, mode });
    }
    this.close();
  }

  static async selectMaster(currentTokenId, excludeTokenId, currentMode = 'one-way') {
    return new Promise((resolve) => {
      const dlg = new this(currentTokenId, excludeTokenId, currentMode);
      dlg.setResolver(resolve);
      dlg.render(true);
    });
  }
}
