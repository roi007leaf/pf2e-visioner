import { MODULE_ID } from '../../constants.js';
import { loadDialogCSS } from '../../css-loader.js';
import { DoorSoundTimelinePlayer, normalizeDoorSoundTimeline } from '../../services/Peek/door-sound-timeline.js';

const emptyRange = (from = 0, to = 30) => ({ from, to, src: '', start: 0, end: '', volume: 1, loop: true });

export class DoorSoundEditor extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: 'pf2e-visioner-door-sound-editor', tag: 'div', classes: ['pv-door-sound-editor'],
    window: { title: 'Door Sound Timeline', icon: 'fas fa-wave-square', resizable: true },
    position: { width: 660, height: 680 },
    actions: {
      addOpening() { this._add('opening'); },
      addClosing() { this._add('closing'); },
      removeRange(_event, button) { this._remove(button); },
      stopPreview() { this._preview.stop(); },
      seekAngle(_event, button) {
        const slider = this.element.querySelector('[data-angle]');
        slider.value = button.dataset.angleValue;
        slider.dispatchEvent(new Event('input', { bubbles: true }));
      },
      save: DoorSoundEditor._save,
    },
  };

  constructor(wall, options = {}) {
    loadDialogCSS();
    super({ ...options, id: `pv-door-sound-editor-${wall.id}` });
    this.wall = wall;
    this._draft = wall.getFlag(MODULE_ID, 'slowDoorSoundTimeline') ?? {
      enabled: false, separateClosing: false,
      opening: [emptyRange(0, 10), emptyRange(10, 65), emptyRange(65, 90)], closing: [],
    };
    this._angle = 0;
    this._preview = new DoorSoundTimelinePlayer(async (src, playbackOptions) => {
      const sound = new foundry.audio.Sound(src);
      await sound.load();
      await sound.play(playbackOptions);
      return sound;
    });
  }

  async _prepareContext() {
    const colors = ['#dba45b', '#70b8b0', '#a391cc', '#7ea9d8', '#d08c9b', '#96b77c'];
    const decorate = (rows) => rows.map((row, index) => ({ ...row, number: String(index + 1).padStart(2, '0'),
      color: colors[index % colors.length], left: Math.max(0, Math.min(100, Number(row.from) / 90 * 100)),
      width: Math.max(0, Math.min(100, (Number(row.to) - Number(row.from)) / 90 * 100)),
      clipLabel: row.src ? String(row.src).split('/').at(-1) : 'Choose audio' }));
    return { ...this._draft, opening: decorate(this._draft.opening), closing: decorate(this._draft.closing) };
  }
  async _renderHTML(context) {
    await foundry.applications.handlebars.loadTemplates(['modules/pf2e-visioner/templates/door-sound-range.hbs']);
    return foundry.applications.handlebars.renderTemplate('modules/pf2e-visioner/templates/door-sound-editor.hbs', context);
  }
  _replaceHTML(html, content) {
    this._preview.stop();
    this._angle = 0;
    content.innerHTML = html;
    const separate = content.querySelector('[name="separateClosing"]');
    const sync = () => { content.querySelector('[data-closing]').hidden = !separate.checked; };
    separate.addEventListener('change', sync);
    sync();
    content.querySelector('[data-angle]').addEventListener('input', (event) => {
      const angle = Number(event.target.value);
      const direction = angle < this._angle ? -1 : 1;
      this._angle = angle;
      const status = content.querySelector('[data-preview-status]');
      content.querySelector('[data-preview-angle]').textContent = `${angle}°`;
      content.querySelector('[data-playhead]').style.left = `${angle / 90 * 100}%`;
      try {
        const timeline = normalizeDoorSoundTimeline(this._read());
        status.textContent = direction > 0 ? 'Opening' : 'Closing';
        this._preview.move(timeline, angle, direction, this.wall.getFlag(MODULE_ID, 'slowDoorSoundVolume') ?? 0.5);
      } catch (error) { this._preview.stop(); status.textContent = error.message; }
    });
    content.querySelectorAll('[data-range] input[data-field="from"], [data-range] input[data-field="to"]').forEach((input) => {
      input.addEventListener('input', () => {
        const row = input.closest('[data-range]');
        if (row.dataset.direction !== 'opening') return;
        const segment = content.querySelector(`[data-angle-track] button:nth-of-type(${Number(row.dataset.index) + 1})`);
        const from = Number(row.querySelector('[data-field="from"]').value);
        const to = Number(row.querySelector('[data-field="to"]').value);
        segment.style.setProperty('--segment-left', `${Math.max(0, Math.min(100, from / 90 * 100))}%`);
        segment.style.setProperty('--segment-width', `${Math.max(0, Math.min(100, (to - from) / 90 * 100))}%`);
        segment.dataset.angleValue = String(from);
      });
    });
    return content;
  }

  _read() {
    const root = this.element;
    const rows = (direction) => [...root.querySelectorAll(`[data-range][data-direction="${direction}"]`)].map((row) => {
      const get = (key) => row.querySelector(`[data-field="${key}"]`);
      return Object.fromEntries(['from', 'to', 'src', 'start', 'end', 'volume', 'loop'].map((key) =>
        [key, key === 'loop' ? get(key).checked : get(key).value]));
    });
    return { enabled: root.querySelector('[name="enabled"]').checked,
      separateClosing: root.querySelector('[name="separateClosing"]').checked,
      opening: rows('opening'), closing: rows('closing') };
  }

  async _add(direction) {
    this._preview.stop();
    this._draft = this._read();
    if (this._draft[direction].length >= 24) return ui.notifications.warn('Use at most 24 ranges per direction.');
    const from = Math.min(80, Number(this._draft[direction].at(-1)?.to ?? 0));
    this._draft[direction].push(emptyRange(from, Math.min(90, from + 30)));
    await this.render(true);
  }
  async _remove(button) {
    this._preview.stop();
    const row = button.closest('[data-range]');
    this._draft = this._read();
    this._draft[row.dataset.direction].splice(Number(row.dataset.index), 1);
    await this.render(true);
  }
  static async _save() {
    if (!game.user.isGM) return;
    try {
      const timeline = normalizeDoorSoundTimeline(this._read());
      await this.wall.update({ [`flags.${MODULE_ID}.slowDoorSoundTimeline`]: timeline });
      await this.close();
    } catch (error) { ui.notifications.warn(error.message); }
  }
  async close(options) { this._preview.stop(); return super.close(options); }
}
