// Shared by the editor preview and live, localized door playback.
export function normalizeDoorSoundTimeline(value = {}) {
  const read = (rows) => {
    if (!Array.isArray(rows) || rows.length > 24) throw new Error('Use at most 24 ranges per direction.');
    const result = rows.map((row) => {
      const from = Number(row.from), to = Number(row.to), start = Number(row.start ?? 0);
      const end = row.end === '' || row.end == null ? null : Number(row.end);
      const volume = Number(row.volume ?? 1);
      if (![from, to, start, volume].every(Number.isFinite) || from < 0 || to > 90 || from >= to ||
        start < 0 || volume < 0 || volume > 1 || (end !== null && (!Number.isFinite(end) || end <= start))) {
        throw new Error('Ranges need 0–90° bounds, start below end, valid trim times, and volume from 0 to 1.');
      }
      return { from, to, src: String(row.src ?? '').trim(), start, end, volume, loop: row.loop === true };
    }).sort((a, b) => a.from - b.from);
    if (result.some((row, i) => i > 0 && row.from < result[i - 1].to)) throw new Error('Angle ranges cannot overlap.');
    return result;
  };
  return { enabled: value.enabled === true, separateClosing: value.separateClosing === true,
    opening: read(value.opening ?? []), closing: read(value.closing ?? []) };
}

export function doorSoundRange(timeline, angle, direction) {
  const closing = direction < 0 && timeline.separateClosing;
  const rows = closing ? timeline.closing : timeline.opening;
  const index = rows.findIndex((row) => angle >= row.from && (angle < row.to || (angle === 90 && row.to === 90)));
  return index < 0 ? null : { ...rows[index], key: `${closing ? 'close' : 'open'}:${index}` };
}

export class DoorSoundTimelinePlayer {
  constructor(play) {
    this.play = play;
    this.key = null;
    this.sound = null;
    this.generation = 0;
    this.idleTimer = null;
  }

  move(timeline, angle, direction, volume = 1) {
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.stop(), 400);
    const range = doorSoundRange(timeline, angle, direction);
    const key = range?.src ? `${range.key}:${range.src}:${range.start}:${range.end}:${range.loop}:${volume * range.volume}` : null;
    if (key === this.key) return;
    this.stop(false);
    this.key = key;
    if (!key) return;
    const generation = this.generation;
    const options = { volume: volume * range.volume, loop: range.loop, offset: range.start, fade: 120 };
    if (range.loop) {
      options.loopStart = range.start;
      if (range.end !== null) options.loopEnd = range.end;
    } else if (range.end !== null) options.duration = range.end - range.start;
    Promise.resolve().then(() => generation === this.generation ? this.play(range.src, options) : null).then((sound) => {
      if (generation !== this.generation) this._stopSound(sound);
      else this.sound = sound;
    }).catch((error) => console.warn('[PF2E-Visioner] Door timeline audio failed:', error));
  }

  _stopSound(sound) {
    try { Promise.resolve(sound?.stop?.({ fade: 120 })).catch(() => {}); } catch (_) { /* Already stopped. */ }
  }

  stop(clearIdle = true) {
    if (clearIdle) clearTimeout(this.idleTimer);
    this.generation++;
    this._stopSound(this.sound);
    this.sound = null;
    this.key = null;
  }
}
