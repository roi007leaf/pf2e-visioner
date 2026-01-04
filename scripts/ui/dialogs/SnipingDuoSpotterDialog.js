import { MODULE_ID } from '../../constants.js';
import { panToAndSelectToken } from '../shared-ui-utils.js';

export class SnipingDuoSpotterDialog extends foundry.applications.api.ApplicationV2 {
    static DEFAULT_OPTIONS = {
        id: 'pv-sniping-duo-spotter-dialog',
        tag: 'div',
        window: {
            title: game.i18n.localize('PF2E_VISIONER.UI.SNIPING_DUO_DIALOG_TITLE'),
            icon: 'fas fa-user-friends',
            resizable: true,
        },
        position: { width: 400, height: 500 },
        classes: [MODULE_ID, 'pv-sniping-duo-spotter-dialog'],
    };

    constructor(currentSpotterActorKey, excludeTokenId, options = {}) {
        super(options);
        this.currentSpotterActorKey = String(currentSpotterActorKey || '');
        this.excludeTokenId = excludeTokenId;
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

    static _getActorKeyFromToken(token) {
        try {
            const actor = token?.actor;
            return actor?.uuid || actor?.id || '';
        } catch {
            return '';
        }
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
        const noneLabel = game.i18n.localize('PF2E_VISIONER.UI.SNIPING_DUO_NONE');
        const panLabel = game.i18n.localize('PF2E_VISIONER.UI.SNIPING_DUO_PAN');
        const cancelLabel = game.i18n.localize('Cancel');

        const tokensByActor = new Map();
        for (const t of tokens) {
            const actorId = t?.actor?.id || 'no-actor';
            const name = t?.name || t?.document?.name || 'Unknown';
            const key = `${actorId}-${name}`;
            if (!tokensByActor.has(key)) tokensByActor.set(key, []);
            tokensByActor.get(key).push(t);
        }

        let tokenRows = '';
        for (const t of tokens) {
            const tid = t?.document?.id ?? t?.id;
            const name = t?.name || t?.document?.name || 'Unknown';
            const img = this._resolveTokenImage(t);
            const actorKey = SnipingDuoSpotterDialog._getActorKeyFromToken(t);
            const isSelected = !!(actorKey && this.currentSpotterActorKey && String(actorKey) === String(this.currentSpotterActorKey));

            const actorId = t?.actor?.id || 'no-actor';
            const key = `${actorId}-${name}`;
            const sameActorTokens = tokensByActor.get(key) || [];
            const showId = sameActorTokens.length > 1;

            tokenRows += `
        <div class="pv-sd-token-row ${isSelected ? 'selected' : ''}" data-token-id="${tid}" data-actor-key="${actorKey}">
          <img class="pv-sd-token-img" src="${img}" alt="${name}">
          <div class="pv-sd-token-info">
            <span class="pv-sd-token-name">${name}</span>
            ${showId ? `<span class="pv-sd-token-id">(${tid.slice(-6)})</span>` : ''}
          </div>
          <button type="button" class="pv-sd-pan-btn" data-token-id="${tid}" data-tooltip="${panLabel}">
            <i class="fas fa-crosshairs"></i>
          </button>
        </div>
      `;
        }

        return `
      <style>
        .pv-sd-container { display: flex; flex-direction: column; height: 100%; gap: 8px; padding: 8px; }

        .pv-sd-none-row { display: flex; align-items: center; padding: 10px 12px; border: 1px solid var(--color-border-light-tertiary); border-radius: 6px; cursor: pointer; transition: all 0.15s ease; }
        .pv-sd-none-row:hover { background: var(--color-hover-bg); border-color: var(--color-border-light-highlight); }
        .pv-sd-none-row.selected { background: var(--color-primary-1, rgba(0, 100, 200, 0.2)); border-color: var(--color-primary-2, #2c5aa0); }
        .pv-sd-none-icon { width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; font-size: 1.8em; color: var(--color-text-light-secondary); border-radius: 50%; background: var(--color-bg-option); }
        .pv-sd-none-label { flex: 1; margin-left: 12px; font-weight: 500; }

        .pv-sd-tokens-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; }

        .pv-sd-token-row { display: flex; align-items: center; padding: 8px 12px; border: 1px solid var(--color-border-light-tertiary); border-radius: 6px; gap: 12px; cursor: pointer; transition: all 0.15s ease; }
        .pv-sd-token-row:hover { background: var(--color-hover-bg); border-color: var(--color-border-light-highlight); }
        .pv-sd-token-row.selected { background: var(--color-primary-1, rgba(0, 100, 200, 0.2)); border-color: var(--color-primary-2, #2c5aa0); }

        .pv-sd-token-img { width: 48px; height: 48px; min-width: 48px; border-radius: 50%; object-fit: cover; border: 2px solid var(--color-border-light-tertiary); transition: all 0.15s ease; }
        .pv-sd-token-row:hover .pv-sd-token-img { border-color: var(--color-border-light-highlight); }
        .pv-sd-token-row.selected .pv-sd-token-img { border-color: var(--color-primary-2, #2c5aa0); }

        .pv-sd-token-info { flex: 1; display: flex; flex-direction: column; min-width: 0; gap: 2px; }
        .pv-sd-token-name { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 1em; }
        .pv-sd-token-id { font-size: 0.75em; color: var(--color-text-light-secondary); font-family: monospace; }

        .pv-sd-pan-btn {
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
        .pv-sd-pan-btn:hover {
          background: var(--color-primary-1, rgba(0, 100, 200, 0.2));
          border-color: var(--color-primary-2, #2c5aa0);
          color: var(--color-text-light-primary);
        }

        .pv-sd-footer { display: flex; justify-content: flex-end; gap: 8px; padding-top: 12px; border-top: 1px solid var(--color-border-light-tertiary); margin-top: auto; }
        .pv-sd-cancel-btn {
          padding: 8px 16px;
          border: 1px solid var(--color-border-light-tertiary);
          border-radius: 6px;
          background: var(--color-bg-option);
          cursor: pointer;
          font-weight: 500;
          transition: all 0.15s ease;
        }
        .pv-sd-cancel-btn:hover { background: var(--color-hover-bg); border-color: var(--color-border-light-highlight); }

        @container (min-width: 500px) {
          .pv-sd-token-img, .pv-sd-none-icon { width: 56px; height: 56px; min-width: 56px; font-size: 2em; }
          .pv-sd-token-name { font-size: 1.1em; }
          .pv-sd-pan-btn { width: 36px; height: 36px; }
        }
        @container (min-width: 600px) {
          .pv-sd-token-img, .pv-sd-none-icon { width: 64px; height: 64px; min-width: 64px; font-size: 2.2em; }
          .pv-sd-token-name { font-size: 1.15em; }
          .pv-sd-token-row { padding: 10px 16px; gap: 16px; }
        }
      </style>
      <div class="pv-sd-container" style="container-type: inline-size;">
        <div class="pv-sd-none-row ${!this.currentSpotterActorKey ? 'selected' : ''}" data-actor-key="">
          <div class="pv-sd-none-icon"><i class="fas fa-ban"></i></div>
          <div class="pv-sd-none-label">${noneLabel}</div>
        </div>
        <div class="pv-sd-tokens-list">
          ${tokenRows}
        </div>
        <div class="pv-sd-footer">
          <button type="button" class="pv-sd-cancel-btn">${cancelLabel}</button>
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

        root.querySelector('.pv-sd-none-row')?.addEventListener('click', () => {
            this._selectActorKey('');
        });

        root.querySelectorAll('.pv-sd-pan-btn').forEach((btn) => {
            btn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                const tokenId = btn.dataset.tokenId;
                const token = canvas?.tokens?.get(tokenId);
                if (token) {
                    panToAndSelectToken(token);
                }
            });
        });

        root.querySelectorAll('.pv-sd-token-row').forEach((row) => {
            row.addEventListener('click', () => {
                const actorKey = row.dataset.actorKey;
                this._selectActorKey(actorKey);
            });
        });

        root.querySelector('.pv-sd-cancel-btn')?.addEventListener('click', () => {
            this.close();
        });
    }

    _selectActorKey(actorKey) {
        if (this._resolver) {
            this._resolver(actorKey);
        }
        this.close();
    }

    static async selectSpotter(currentSpotterActorKey, excludeTokenId) {
        return new Promise((resolve) => {
            const dlg = new this(currentSpotterActorKey, excludeTokenId);
            dlg.setResolver(resolve);
            dlg.render(true);
        });
    }
}
