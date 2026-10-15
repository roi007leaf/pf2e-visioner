import { MODULE_ID } from '../../constants.js';
import { DoorSoundTimelinePlayer, normalizeDoorSoundTimeline } from './door-sound-timeline.js';

const playback = new WeakMap();
const timelines = new Map();

export function stopDoorSoundTimelines() {
  for (const player of timelines.values()) player.stop();
  timelines.clear();
}

// Each client handles the successful wall update locally, just like native
// door sounds. Never broadcast audio globally or play for rejected requests.
export function playSlowDoorSound(doc, changes, options = {}) {
  if (!options.visionerSlowDoor || ![1, -1].includes(options.visionerSlowDoorDirection) ||
    typeof options.visionerSlowDoorGesture !== 'string' ||
    !('c' in changes) || doc.parent?.id !== globalThis.canvas?.scene?.id || !doc.door) return;
  const id = doc.uuid ?? `${doc.parent?.id}:${doc.id}`;
  if (doc.getFlag(MODULE_ID, 'slowDoorSounds') !== true) {
    timelines.get(id)?.stop();
    return;
  }
  const configuredVolume = doc.getFlag(MODULE_ID, 'slowDoorSoundVolume');
  const volume = typeof configuredVolume === 'number' && Number.isFinite(configuredVolume)
    ? Math.max(0, Math.min(1, configuredVolume)) : 0.5;
  if (!volume) { timelines.get(id)?.stop(); return; }
  const configuredTimeline = doc.getFlag(MODULE_ID, 'slowDoorSoundTimeline');
  if (configuredTimeline?.enabled) {
    try {
      const timeline = normalizeDoorSoundTimeline(configuredTimeline);
      const coordinates = doc.getFlag(MODULE_ID, 'slowDoor')?.closed ?? doc.c;
      const position = { x: (coordinates[0] + coordinates[2]) / 2, y: (coordinates[1] + coordinates[3]) / 2 };
      let player = timelines.get(id);
      if (!player) {
        player = new DoorSoundTimelinePlayer(null);
        timelines.set(id, player);
      }
      player.play = (src, playbackOptions) => canvas.sounds.playAtPosition(src, position,
        doc.object?.soundRadius ?? canvas.dimensions.distance * 12, {
          volume: playbackOptions.volume, easing: true, walls: false, gmAlways: true,
          muffledEffect: { type: 'lowpass', intensity: 5 }, playbackOptions,
        });
      player.move(timeline, doc.getFlag(MODULE_ID, 'slowDoor')?.angle ?? 0, options.visionerSlowDoorDirection, volume);
    } catch (error) { timelines.get(id)?.stop(); console.warn('[PF2E-Visioner] Invalid door sound timeline:', error); }
    return;
  }
  timelines.get(id)?.stop();
  const configured = doc.getFlag(MODULE_ID, 'slowDoorSoundPath');
  const src = typeof configured === 'string' ? configured.trim() : '';
  if (!src || !canvas.sounds?.playAtPosition) return;
  const state = playback.get(doc) ?? { gestures: new Set(), pending: false, sound: null };
  playback.set(doc, state);
  const gesture = options.visionerSlowDoorGesture;
  if (state.gestures.has(gesture)) return;
  state.gestures.add(gesture);
  // Bound history while allowing concurrent players' interactions to interleave.
  if (state.gestures.size > 32) state.gestures.delete(state.gestures.values().next().value);
  // Starting a new gesture while a clip plays must not stack another sound or
  // defer it to a later tick in that same gesture.
  if (state.pending || state.sound?.playing) return;
  const coordinates = doc.getFlag(MODULE_ID, 'slowDoor')?.closed ?? doc.c;
  const position = { x: (coordinates[0] + coordinates[2]) / 2, y: (coordinates[1] + coordinates[3]) / 2 };
  state.pending = true;
  state.sound = null;
  try {
    Promise.resolve(canvas.sounds.playAtPosition(src, position,
      doc.object?.soundRadius ?? canvas.dimensions.distance * 12, {
        volume, easing: true, walls: false, gmAlways: true,
        muffledEffect: { type: 'lowpass', intensity: 5 },
      }))
      .then((sound) => { state.sound = sound; })
      .catch((error) => { console.warn('[PF2E-Visioner] Slow door sound failed:', error); })
      .finally(() => { state.pending = false; });
  } catch (error) {
    state.pending = false;
    console.warn('[PF2E-Visioner] Slow door sound failed:', error);
  }
}
