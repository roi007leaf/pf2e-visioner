export class SeekTemplateConfigDialog extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  constructor() {
    super({
      window: {
        title: game.i18n.localize('PF2E_VISIONER.SEEK_TEMPLATE_CONFIG.TITLE'),
        icon: 'fas fa-bullseye',
        contentClasses: ['pf2e-visioner', 'seek-template-config-dialog'],
      },
      position: { width: 350, height: 'auto' },
    });
    this._resolver = null;
  }

  static PARTS = {
    content: { template: 'modules/pf2e-visioner/templates/dialogs/seek-template-config.hbs' },
  };

  _onRender(context, options) {
    super._onRender(context, options);
    const root = this.element;
    if (!root) return;

    const updateLabel = (templateType) => {
      const labelText = root.querySelector('#template-size-label-text');
      if (labelText) {
        let labelKey = 'PF2E_VISIONER.SEEK_TEMPLATE_CONFIG.RADIUS';
        if (templateType === 'ray') {
          labelKey = 'PF2E_VISIONER.SEEK_TEMPLATE_CONFIG.LENGTH';
        }
        labelText.textContent = game.i18n.localize(labelKey);
      }
    };

    const templateOptions = root.querySelectorAll('.template-option');
    templateOptions.forEach((option) => {
      option.addEventListener('click', () => {
        const type = option.dataset.templateType;
        templateOptions.forEach((opt) => opt.classList.remove('selected'));
        option.classList.add('selected');
        const radio = option.querySelector('input[type="radio"]');
        if (radio) radio.checked = true;
        updateLabel(type);
      });
    });

    const submitBtn = root.querySelector('.seek-template-submit');
    if (submitBtn) {
      submitBtn.addEventListener('click', async (ev) => {
        ev.preventDefault();
        const selectedRadio = root.querySelector('input[name="templateType"]:checked');
        const templateType = selectedRadio?.value || 'circle';
        const radiusInput = root.querySelector('#template-radius');
        const radius = Number(radiusInput?.value) || 15;

        if (radius < 1 || radius > 1000) {
          const { notify } = await import('../services/infra/notifications.js');
          notify.warn(game.i18n.localize('PF2E_VISIONER.SEEK_TEMPLATE_CONFIG.INVALID_RADIUS'));
          return;
        }

        this._resolve({ templateType, radius });
      });
    }

    const cancelBtn = root.querySelector('[data-action="cancel"]');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        this._resolve(null);
      });
    }

    const defaultOption = root.querySelector('.template-option[data-template-type="circle"]');
    if (defaultOption) {
      defaultOption.classList.add('selected');
    }
    updateLabel('circle');
  }

  _resolve(value) {
    if (this._resolver) {
      const resolver = this._resolver;
      this._resolver = null;
      resolver(value);
      try {
        super.close();
      } catch {}
    }
  }

  async close(options) {
    if (this._resolver) {
      this._resolve(null);
      return;
    }
    return super.close(options);
  }

  static async choose() {
    return new Promise((resolve) => {
      const dlg = new this();
      dlg._resolver = resolve;
      dlg.render(true);
    });
  }
}

