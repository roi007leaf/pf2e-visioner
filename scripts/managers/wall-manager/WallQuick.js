/**
 * Visioner Wall Quick Settings - per-wall dialog (ApplicationV2)
 */

import { MODULE_ID } from '../../constants.js';

export class VisionerWallQuickSettings extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: 'pf2e-visioner-wall-quick',
    tag: 'div',
    window: {
      title: 'PF2E Visioner: Wall Settings',
      icon: 'fas fa-grip-lines-vertical',
      resizable: true,
    },
    position: { width: 520, height: 'auto' },
    actions: {
      apply: VisionerWallQuickSettings._onApply,
      close: VisionerWallQuickSettings._onClose,
    },
  };

  static PARTS = {
    content: { template: 'modules/pf2e-visioner/templates/wall-quick.hbs' },
  };

  constructor(wallDocument, options = {}) {
    super(options);
    this.wall = wallDocument; // WallDocument
  }

  async _prepareContext() {
    const d = this.wall;
    const hiddenWall = d?.getFlag?.(MODULE_ID, 'hiddenWall');
    const identifier = d?.getFlag?.(MODULE_ID, 'wallIdentifier');
    const dc = d?.getFlag?.(MODULE_ID, 'stealthDC');
    const connected = d?.getFlag?.(MODULE_ID, 'connectedWalls') || [];
    const coverOverride = d?.getFlag?.(MODULE_ID, 'coverOverride') || null;
    const hiddenWallsEnabled = !!game.settings.get(MODULE_ID, 'hiddenWallsEnabled');
    return {
      id: d?.id,
      hiddenWallsEnabled,
      hiddenWall: !!hiddenWall,
      identifier: identifier || '',
      dc: Number(dc) || '',
      connectedCsv: Array.isArray(connected) ? connected.join(', ') : '',
      coverOverride: coverOverride,
    };
  }

  async _renderHTML(context, _options) {
    return await foundry.applications.handlebars.renderTemplate(
      this.constructor.PARTS.content.template,
      context,
    );
  }

  _replaceHTML(result, content, _options) {
    content.innerHTML = result;

    // Add event listener for the hidden wall checkbox
    const hiddenWallCheckbox = content.querySelector('input[name="hiddenWall"]');
    const hiddenWallSections = content.querySelectorAll('.hidden-wall-section');

    if (hiddenWallCheckbox && hiddenWallSections.length > 0) {
      // Set initial state
      hiddenWallSections.forEach((section) => {
        section.style.display = hiddenWallCheckbox.checked ? '' : 'none';
      });

      // Add change listener
      hiddenWallCheckbox.addEventListener('change', (event) => {
        hiddenWallSections.forEach((section) => {
          section.style.display = event.target.checked ? '' : 'none';
        });
      });
    }

    // Add event listeners for cover override functionality
    this._bindCoverOverrideListeners(content);

    return content;
  }

  _onRender(context, options) {
    super._onRender?.(context, options);

    // Also bind after render in case _replaceHTML wasn't called
    try {
      const root = this.element;
      const hiddenWallCheckbox = root.querySelector('input[name="hiddenWall"]');
      const hiddenWallSections = root.querySelectorAll('.hidden-wall-section');

      if (hiddenWallCheckbox && hiddenWallSections.length > 0) {
        // Set initial state
        hiddenWallSections.forEach((section) => {
          section.style.display = hiddenWallCheckbox.checked ? '' : 'none';
        });

        // Add change listener
        hiddenWallCheckbox.addEventListener('change', (event) => {
          hiddenWallSections.forEach((section) => {
            section.style.display = event.target.checked ? '' : 'none';
          });
        });
      }

      // Bind cover override listeners
      this._bindCoverOverrideListeners(root);
    } catch (_) {
      /* ignore */
    }
  }

  _bindCoverOverrideListeners(root) {
    try {
      // Bind cover override buttons
      const coverButtons = root.querySelectorAll('.cover-override-buttons .visioner-icon-btn');
      const hiddenInput = root.querySelector('input[name="coverOverride"]');

      coverButtons.forEach((button) => {
        button.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();

          const coverType = button.getAttribute('data-cover-override');

          // Remove active class from all cover override buttons
          coverButtons.forEach((btn) => btn.classList.remove('active'));

          // Always make the clicked button active (no toggle behavior - one must always be selected)
          button.classList.add('active');

          // Update the hidden input for the cover override
          if (hiddenInput) {
            // Set the value (empty string for auto, coverType for specific override)
            hiddenInput.value = coverType === 'auto' ? '' : coverType;
          }
        });
      });
    } catch (_) {
      /* ignore */
    }
  }

  static async _onApply(event, _button) {
    const app = this;
    const form = app.element?.querySelector?.('form.pv-wall-quick');
    if (!form) return app.close();
    const fd = new FormData(form);
    const entries = Object.fromEntries(fd.entries());
    const patch = { _id: app.wall.id };

    // Handle cover override - this now determines if wall provides cover
    const coverOverride = entries['coverOverride'];
    patch[`flags.${MODULE_ID}.coverOverride`] = coverOverride || null;

    // Set provideCover based on cover override (false only if explicitly set to 'none')
    patch[`flags.${MODULE_ID}.provideCover`] = coverOverride !== 'none';
    if (game.settings.get(MODULE_ID, 'hiddenWallsEnabled')) {
      const hiddenWall = entries['hiddenWall'];
      patch[`flags.${MODULE_ID}.hiddenWall`] =
        hiddenWall === 'on' || hiddenWall === 'true' || hiddenWall === true;
      patch[`flags.${MODULE_ID}.wallIdentifier`] = String(entries['identifier'] || '');
      const n = Number(entries['dc']);
      patch[`flags.${MODULE_ID}.stealthDC`] = Number.isFinite(n) && n > 0 ? n : null;
      // Connected walls parsing
      const raw = String(entries['connected'] || '');
      const arr = raw
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter((s) => !!s);
      patch[`flags.${MODULE_ID}.connectedWalls`] = arr;
    }
    await app.wall.parent?.updateEmbeddedDocuments?.('Wall', [patch], { diff: false });
    try {
      await app.close();
    } catch (_) {}
  }

  static async _onClose(_event, _button) {
    try {
      await this.close();
    } catch (_) {}
  }
}
