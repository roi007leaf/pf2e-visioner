import { MODULE_ID } from '../../constants.js';

export class PointOutWarningDialog extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: 'pv-point-out-warning',
    tag: 'div',
    window: {
      title: 'PF2E Visioner - Point Out Action',
      icon: 'fas fa-hand-point-right',
      resizable: false,
    },
    position: { width: 450, height: 'auto' },
    classes: [MODULE_ID, 'pv-point-out-warning'],
  };

  constructor(options = {}) {
    super(options);
    this._resolver = null;
    this.isGM = options.isGM || false;
  }

  setResolver(fn) {
    this._resolver = fn;
  }

  async _renderHTML() {
    const okLabel = game.i18n?.localize?.('OK') ?? 'OK';

    const headerText = this.isGM
      ? 'Player used Point Out without target!'
      : 'No target selected for Point Out action!';

    const mainText = this.isGM
      ? "A player attempted to use the <em>Point Out</em> action but didn't select a target token. No automation buttons will appear until they select a proper target."
      : 'The <em>Point Out</em> action requires you to select a target token that your allies cannot currently see.';

    const instructionTitle = this.isGM ? 'How Point Out should work:' : 'To use Point Out:';

    const instructions = this.isGM
      ? `<ol>
          <li>Player should target a token that is "undetected" from their allies</li>
          <li>Player uses the Point Out action from their character sheet</li>
          <li>You will see "Open Point Out Results" button to review and apply changes</li>
          <li>Allies will be able to see the target as "hidden" instead of "undetected"</li>
        </ol>`
      : `<ol>
          <li>Target a token that is "undetected" from your allies</li>
          <li>Use the Point Out action from your character sheet or toolbar</li>
          <li>Your allies will be able to see the target as "hidden" instead of "undetected"</li>
        </ol>`;

    const footerText = this.isGM
      ? 'You can dismiss this notification.'
      : 'Please select a target token and try again.';

    return `
      <style>
        .pv-pow-wrap { 
          display: flex; 
          flex-direction: column; 
          gap: 15px; 
          padding: 10px;
          font-family: var(--font-primary);
          line-height: 1.4;
        }
        .pv-pow-header {
          font-weight: 600;
          color: var(--color-text-primary);
          font-size: 1.1em;
        }
        .pv-pow-content p {
          margin: 8px 0;
          color: var(--color-text-primary);
        }
        .pv-pow-content hr {
          margin: 10px 0;
          border: none;
          border-top: 1px solid var(--color-border-light);
        }
        .pv-pow-content ol {
          margin: 8px 0 8px 20px;
          padding-left: 0;
        }
        .pv-pow-content li {
          margin: 4px 0;
        }
        .pv-pow-instruction {
          font-style: italic;
          color: var(--color-text-secondary, #666);
          margin-top: 10px;
        }
        .pv-pow-footer {
          display: flex;
          justify-content: center;
          margin-top: 15px;
        }
        .pv-pow-ok-btn {
          background: var(--color-primary-2, #2c5aa0);
          color: #fff;
          border: none;
          padding: 8px 20px;
          border-radius: 4px;
          cursor: pointer;
          font-weight: 500;
        }
        .pv-pow-ok-btn:hover {
          background: var(--color-primary-1, #1a4080);
        }
      </style>
      <div class="pv-pow-wrap">
        <div class="pv-pow-header">
          <i class="fas fa-exclamation-triangle" style="color: #ff6b35; margin-right: 8px;"></i>
          ${headerText}
        </div>
        <div class="pv-pow-content">
          <p>${mainText}</p>
          <hr>
          <p><strong>${instructionTitle}</strong></p>
          ${instructions}
          <p class="pv-pow-instruction">
            ${footerText}
          </p>
        </div>
        <div class="pv-pow-footer">
          <button type="button" class="pv-pow-ok-btn">
            <i class="fas fa-check"></i> ${okLabel}
          </button>
        </div>
      </div>
    `;
  }

  _replaceHTML(result, content) {
    content.innerHTML = result;
    return content;
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    // Attach event listeners manually since actions aren't working
    try {
      const okButton = this.element.querySelector('.pv-pow-ok-btn');
      if (okButton) {
        okButton.addEventListener('click', () => {
          if (this._resolver) {
            this._resolver(true);
          }
          this.close();
        });
      }
    } catch (e) {
      console.warn('Failed to attach Point Out warning dialog listeners:', e);
    }
  }

  async close(options = {}) {
    if (this._resolver && !options.skipResolver) {
      this._resolver(false);
    }
    return super.close(options);
  }
}

/**
 * Opens the ApplicationV2-based Point Out warning dialog.
 * @param {boolean} isGM - Whether this is being shown to a GM
 * @returns {Promise<boolean>} Resolves with true if user clicked OK, false if closed
 */
export function showPointOutWarningDialog(isGM = false) {
  return new Promise((resolve) => {
    try {
      const app = new PointOutWarningDialog({ isGM });
      app.setResolver(resolve);
      app.render(true);
    } catch (e) {
      console.warn('PF2E Visioner | Failed to open Point Out warning dialog:', e);
      resolve(false);
    }
  });
}
