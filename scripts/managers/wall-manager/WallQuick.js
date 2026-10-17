/**
 * Visioner Wall Quick Settings - per-wall dialog (ApplicationV2)
 */

import { MODULE_ID } from '../../constants.js';
import { loadDialogCSS, loadSharedUICSS } from '../../css-loader.js';
import { readDoorPeekGeometry } from '../../services/Peek/peek-door-dc.js';
import { DoorSoundEditor } from './DoorSoundEditor.js';
import {
  buildLedgeFlagPatch,
  getInheritedLedgeElevation,
  getLedgeElevation,
  isLedgeWall,
} from '../../cover/ledge/ledge-walls.js';

function ledgeElevationPlaceholder(wallDocument) {
  const inherited = getInheritedLedgeElevation(wallDocument);
  if (inherited === null) return game.i18n.localize('PF2E_VISIONER.UI.WALL_LEDGE_ELEVATION_AUTO');
  return game.i18n.format('PF2E_VISIONER.UI.WALL_LEDGE_ELEVATION_INHERITED', { elevation: inherited });
}

export class VisionerWallQuickSettings extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: 'pf2e-visioner-wall-quick',
    tag: 'div',
    window: {
      title: game.i18n.localize('PF2E_VISIONER.DIALOG_TITLES.WALL_QUICK'),
      icon: 'fas fa-grip-lines-vertical',
      resizable: true,
    },
    classes: ['pf2e-visioner-wall-quick'],
    position: { width: 520, height: 720 },
    actions: {
      editDoorSound() { if (this._isDoor() && game.user.isGM) new DoorSoundEditor(this.wall).render(true); },
      apply: VisionerWallQuickSettings._onApply,
      close: VisionerWallQuickSettings._onClose,
    },
  };

  static PARTS = {
    content: { template: 'modules/pf2e-visioner/templates/wall-quick.hbs' },
  };

  constructor(wallDocument, { doorType, ...options } = {}) {
    loadDialogCSS();
    loadSharedUICSS();
    // ApplicationV2 identifies open windows by id. Keep each wall's dialog distinct
    // so switching from a door to an ordinary wall cannot reuse the door's content.
    const height = Math.min(720, Math.max(320, (globalThis.window?.innerHeight ?? 800) - 80));
    super({
      id: `pf2e-visioner-wall-quick-${wallDocument?.id ?? 'new'}`,
      ...options,
      position: { width: 520, height, ...options.position },
    });
    this.wall = wallDocument; // WallDocument
    this._doorType = doorType;
  }

  _isDoor() {
    return Number(this._doorType ?? this.wall?.document?.door ?? this.wall?.door) > 0;
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
      blocksScent: d?.getFlag?.(MODULE_ID, 'blocksScent') === true,
      ledge: isLedgeWall(d),
      ledgeElevation: getLedgeElevation(d) ?? '',
      ledgeElevationPlaceholder: ledgeElevationPlaceholder(d),
      isDoor: this._isDoor(),
      slowDoorSounds: d?.getFlag?.(MODULE_ID, 'slowDoorSounds') === true,
      slowDoorSoundPath: d?.getFlag?.(MODULE_ID, 'slowDoorSoundPath') ?? '',
      slowDoorSoundVolume: d?.getFlag?.(MODULE_ID, 'slowDoorSoundVolume') ?? 0.5,
      peekAllowed: d?.getFlag?.(MODULE_ID, 'peekAllowed') === true,
      peekDC: d?.getFlag?.(MODULE_ID, 'peekDC') ?? '',
      peekSlitAngle: readDoorPeekGeometry(d, 'peekSlitAngle', 10),
      peekSweepAngle: readDoorPeekGeometry(d, 'peekSweepAngle', 20),
      peekRange: readDoorPeekGeometry(d, 'peekRange', 0),
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

    this._bindHiddenWallSectionToggle(content);
    this._bindPeekOptionsToggle(content);
    this._bindLedgeOptionsToggle(content);

    // Add event listeners for cover override functionality
    this._bindCoverOverrideListeners(content);

    return content;
  }

  _onRender(context, options) {
    super._onRender?.(context, options);

    // Also bind after render in case _replaceHTML wasn't called
    try {
      const root = this.element;
      this._bindHiddenWallSectionToggle(root);
      this._bindPeekOptionsToggle(root);
      this._bindLedgeOptionsToggle(root);

      // Bind cover override listeners
      this._bindCoverOverrideListeners(root);
    } catch (_) {
      /* ignore */
    }
  }

  _bindHiddenWallSectionToggle(root) {
    try {
      const hiddenWallCheckbox = root?.querySelector?.('input[name="hiddenWall"]');
      const hiddenWallSections = Array.from(root?.querySelectorAll?.('.hidden-wall-section') || []);
      if (!hiddenWallCheckbox || hiddenWallSections.length === 0) return;

      const syncHiddenWallSections = () => {
        const show = !!hiddenWallCheckbox.checked;
        hiddenWallSections.forEach((section) => {
          section.classList.toggle('is-hidden', !show);
          section.hidden = !show;
          section.style.display = show ? '' : 'none';
        });
      };

      syncHiddenWallSections();
      if (hiddenWallCheckbox.dataset.pf2eVisionerHiddenWallToggleBound === 'true') return;
      hiddenWallCheckbox.dataset.pf2eVisionerHiddenWallToggleBound = 'true';
      hiddenWallCheckbox.addEventListener('change', syncHiddenWallSections);
    } catch (_) {
      /* ignore */
    }
  }

  _bindPeekOptionsToggle(root) {
    const checkbox = root?.querySelector?.('input[name="peekAllowed"]');
    const options = root?.querySelector?.('.pv-peek-options');
    if (!checkbox || !options) return;
    const sync = () => {
      options.hidden = !checkbox.checked;
      options.querySelectorAll('input').forEach((input) => {
        input.disabled = !checkbox.checked;
      });
    };
    sync();
    if (checkbox.dataset.pf2eVisionerPeekToggleBound === 'true') return;
    checkbox.dataset.pf2eVisionerPeekToggleBound = 'true';
    checkbox.addEventListener('change', sync);
  }

  _bindLedgeOptionsToggle(root) {
    const checkbox = root?.querySelector?.('input[name="ledge"]');
    const options = root?.querySelector?.('.pv-ledge-options');
    if (!checkbox || !options) return;
    const sync = () => {
      options.hidden = !checkbox.checked;
    };
    sync();
    if (checkbox.dataset.pf2eVisionerLedgeToggleBound === 'true') return;
    checkbox.dataset.pf2eVisionerLedgeToggleBound = 'true';
    checkbox.addEventListener('change', sync);
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
    if (!form.reportValidity()) return;
    const fd = new FormData(form);
    const entries = Object.fromEntries(fd.entries());
    const patch = { _id: app.wall.id };
    patch[`flags.${MODULE_ID}.blocksScent`] = fd.has('blocksScent');
    Object.assign(patch, buildLedgeFlagPatch(fd.has('ledge'), entries.ledgeElevation));
    if (app._isDoor()) {
      patch[`flags.${MODULE_ID}.slowDoorSounds`] = fd.has('slowDoorSounds');
      // Native file-picker is a custom form control; plain FormData does not
      // include its value on every supported Foundry/browser combination.
      const soundPath = form.querySelector('file-picker[name="slowDoorSoundPath"]')?.value ?? entries.slowDoorSoundPath;
      patch[`flags.${MODULE_ID}.slowDoorSoundPath`] = String(soundPath ?? '').trim();
      const soundVolume = entries.slowDoorSoundVolume === undefined ? 0.5 : Number(entries.slowDoorSoundVolume);
      patch[`flags.${MODULE_ID}.slowDoorSoundVolume`] = Number.isFinite(soundVolume)
        ? Math.max(0, Math.min(1, soundVolume)) : 0.5;
      const peekAllowed = fd.has('peekAllowed');
      patch[`flags.${MODULE_ID}.peekAllowed`] = peekAllowed;
      if (peekAllowed) {
        const peekDC = String(entries.peekDC ?? '').trim();
        patch[`flags.${MODULE_ID}.peekDC`] = peekDC === '' ? null : Number(peekDC);
        for (const key of ['peekSlitAngle', 'peekSweepAngle', 'peekRange']) {
          patch[`flags.${MODULE_ID}.${key}`] = Number(entries[key]);
        }
      }
    }

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
    const applied = await app._applyPatchToTargetWalls(patch);
    if (!applied) return;
    try {
      await app.close();
    } catch (_) {}
  }

  _targetWallIds() {
    if (this.wall?.id) return [this.wall.id];
    return (canvas?.walls?.controlled ?? []).map((w) => w?.document?.id).filter(Boolean);
  }

  async _applyPatchToTargetWalls(patch) {
    const ids = this._targetWallIds();
    if (!ids.length) {
      ui.notifications?.warn?.(game.i18n.localize('PF2E_VISIONER.UI.WALL_QUICK_NO_WALLS_SELECTED'));
      return false;
    }
    const scene = this.wall?.id ? this.wall.parent : canvas?.scene;
    const updates = ids.map((id) => ({ ...patch, _id: id }));
    await scene?.updateEmbeddedDocuments?.('Wall', updates, { diff: false });
    return true;
  }

  static async _onClose(_event, _button) {
    try {
      await this.close();
    } catch (_) {}
  }
}
