import { MODULE_ID } from '../../constants.js';
import { panToAndSelectToken } from '../shared-ui-utils.js';

export class EncounterMasterDialog extends foundry.applications.api.ApplicationV2 {
    static DEFAULT_OPTIONS = {
        id: 'pv-encounter-master-dialog',
        tag: 'div',
        window: {
            title: game.i18n.localize('PF2E_VISIONER.UI.ENCOUNTER_MASTER_DIALOG_TITLE'),
            icon: 'fas fa-users',
            resizable: true,
        },
        position: { width: 400, height: 500 },
        classes: [MODULE_ID, 'pv-encounter-master-dialog'],
    };

    constructor(currentTokenId, excludeTokenId, options = {}) {
        super(options);
        this.currentTokenId = currentTokenId || '';
        this.excludeTokenId = excludeTokenId;
        this._resolver = null;
    }

    setResolver(fn) {
        this._resolver = fn;
    }

    _getSceneTokens() {
        const tokens = canvas?.tokens?.placeables || [];
        return tokens.filter((t) => {
            const tid = t?.document?.id ?? t?.id;
            return tid && tid !== this.excludeTokenId;
        });
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
        const noneLabel = game.i18n.localize('PF2E_VISIONER.UI.ENCOUNTER_MASTER_NONE');
        const panLabel = game.i18n.localize('PF2E_VISIONER.UI.ENCOUNTER_MASTER_PAN');
        const cancelLabel = game.i18n.localize('Cancel');

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
        <div class="pv-em-token-row ${isSelected ? 'selected' : ''}" data-token-id="${tid}">
          <img class="pv-em-token-img" src="${img}" alt="${name}">
          <div class="pv-em-token-info">
            <span class="pv-em-token-name">${name}</span>
            ${showId ? `<span class="pv-em-token-id">(${tid.slice(-6)})</span>` : ''}
          </div>
          <button type="button" class="pv-em-pan-btn" data-token-id="${tid}" data-tooltip="${panLabel}">
            <i class="fas fa-crosshairs"></i>
          </button>
        </div>
      `;
        }

        return `
      <style>
        .pv-em-container { display: flex; flex-direction: column; height: 100%; gap: 8px; padding: 8px; }
        
        /* None row */
        .pv-em-none-row { display: flex; align-items: center; padding: 10px 12px; border: 1px solid var(--color-border-light-tertiary); border-radius: 6px; cursor: pointer; transition: all 0.15s ease; }
        .pv-em-none-row:hover { background: var(--color-hover-bg); border-color: var(--color-border-light-highlight); }
        .pv-em-none-row.selected { background: var(--color-primary-1, rgba(0, 100, 200, 0.2)); border-color: var(--color-primary-2, #2c5aa0); }
        .pv-em-none-icon { width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; font-size: 1.8em; color: var(--color-text-light-secondary); border-radius: 50%; background: var(--color-bg-option); }
        .pv-em-none-label { flex: 1; margin-left: 12px; font-weight: 500; }
        
        /* Token list */
        .pv-em-tokens-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; }
        
        /* Token row */
        .pv-em-token-row { display: flex; align-items: center; padding: 8px 12px; border: 1px solid var(--color-border-light-tertiary); border-radius: 6px; gap: 12px; cursor: pointer; transition: all 0.15s ease; }
        .pv-em-token-row:hover { background: var(--color-hover-bg); border-color: var(--color-border-light-highlight); }
        .pv-em-token-row.selected { background: var(--color-primary-1, rgba(0, 100, 200, 0.2)); border-color: var(--color-primary-2, #2c5aa0); }
        
        /* Token image - responsive sizing */
        .pv-em-token-img { width: 48px; height: 48px; min-width: 48px; border-radius: 50%; object-fit: cover; border: 2px solid var(--color-border-light-tertiary); transition: all 0.15s ease; }
        .pv-em-token-row:hover .pv-em-token-img { border-color: var(--color-border-light-highlight); }
        .pv-em-token-row.selected .pv-em-token-img { border-color: var(--color-primary-2, #2c5aa0); }
        
        /* Token info */
        .pv-em-token-info { flex: 1; display: flex; flex-direction: column; min-width: 0; gap: 2px; }
        .pv-em-token-name { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 1em; }
        .pv-em-token-id { font-size: 0.75em; color: var(--color-text-light-secondary); font-family: monospace; }
        
        /* Pan button */
        .pv-em-pan-btn { 
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
        .pv-em-pan-btn:hover { 
          background: var(--color-primary-1, rgba(0, 100, 200, 0.2)); 
          border-color: var(--color-primary-2, #2c5aa0); 
          color: var(--color-text-light-primary);
        }
        
        /* Footer */
        .pv-em-footer { display: flex; justify-content: flex-end; gap: 8px; padding-top: 12px; border-top: 1px solid var(--color-border-light-tertiary); margin-top: auto; }
        .pv-em-cancel-btn {
          padding: 8px 16px;
          border: 1px solid var(--color-border-light-tertiary);
          border-radius: 6px;
          background: var(--color-bg-option);
          cursor: pointer;
          font-weight: 500;
          transition: all 0.15s ease;
        }
        .pv-em-cancel-btn:hover {
          background: var(--color-hover-bg);
          border-color: var(--color-border-light-highlight);
        }
        
        /* Responsive scaling based on container width */
        @container (min-width: 500px) {
          .pv-em-token-img, .pv-em-none-icon { width: 56px; height: 56px; min-width: 56px; font-size: 2em; }
          .pv-em-token-name { font-size: 1.1em; }
          .pv-em-pan-btn { width: 36px; height: 36px; }
        }
        @container (min-width: 600px) {
          .pv-em-token-img, .pv-em-none-icon { width: 64px; height: 64px; min-width: 64px; font-size: 2.2em; }
          .pv-em-token-name { font-size: 1.15em; }
          .pv-em-token-row { padding: 10px 16px; gap: 16px; }
        }
      </style>
      <div class="pv-em-container" style="container-type: inline-size;">
        <div class="pv-em-none-row ${!this.currentTokenId ? 'selected' : ''}" data-token-id="">
          <div class="pv-em-none-icon"><i class="fas fa-ban"></i></div>
          <div class="pv-em-none-label">${noneLabel}</div>
        </div>
        <div class="pv-em-tokens-list">
          ${tokenRows}
        </div>
        <div class="pv-em-footer">
          <button type="button" class="pv-em-cancel-btn">${cancelLabel}</button>
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

        root.querySelector('.pv-em-none-row')?.addEventListener('click', () => {
            this._selectToken('');
        });

        root.querySelectorAll('.pv-em-pan-btn').forEach((btn) => {
            btn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                const tokenId = btn.dataset.tokenId;
                const token = canvas?.tokens?.get(tokenId);
                if (token) {
                    panToAndSelectToken(token);
                }
            });
        });

        root.querySelectorAll('.pv-em-token-row').forEach((row) => {
            row.addEventListener('click', () => {
                const tokenId = row.dataset.tokenId;
                this._selectToken(tokenId);
            });
        });

        root.querySelector('.pv-em-cancel-btn')?.addEventListener('click', () => {
            this.close();
        });
    }

    _selectToken(tokenId) {
        if (this._resolver) {
            this._resolver(tokenId);
        }
        this.close();
    }

    static async selectMaster(currentTokenId, excludeTokenId) {
        return new Promise((resolve) => {
            const dlg = new this(currentTokenId, excludeTokenId);
            dlg.setResolver(resolve);
            dlg.render(true);
        });
    }
}
