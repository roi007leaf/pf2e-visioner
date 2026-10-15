import '../../../setup.js';
import { DEFAULT_SETTINGS } from '../../../../scripts/constants.js';
import { playSlowDoorSound, stopDoorSoundTimelines } from '../../../../scripts/services/Peek/slow-door-sound.js';

describe('slow door sounds', () => {
  let previousCanvas, previousConfig, previousGet, doc, play, enabled, volume, path, now;
  const options = { visionerSlowDoor: true, visionerSlowDoorDirection: 1, visionerSlowDoorGesture: 'player:gesture-a' };
  const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
  beforeEach(() => {
    previousCanvas = global.canvas;
    previousConfig = global.CONFIG;
    previousGet = game.settings.get;
    enabled = true;
    volume = 0.5;
    path = 'worlds/test/sounds/slow-creak.ogg';
    now = jest.spyOn(Date, 'now').mockReturnValue(10000);
    play = jest.fn().mockResolvedValue({ playing: false });
    global.canvas = { scene: { id: 'scene' }, sounds: { playAtPosition: play }, dimensions: { distance: 5 } };
    global.CONFIG = { Wall: { doorSounds: { wood: { open: ['creak.ogg'], close: 'close.ogg' } } } };
    game.settings.get = jest.fn(() => { throw new Error('Sound must not read world settings'); });
    doc = { door: 1, doorSound: 'wood', parent: { id: 'scene' }, c: [0, 0, 90, 20],
      getFlag: (_module, key) => ({ slowDoorSounds: enabled, slowDoorSoundPath: path,
        slowDoorSoundVolume: volume, slowDoor: { closed: [0, 0, 100, 0] } })[key] };
  });
  afterEach(() => {
    stopDoorSoundTimelines();
    now.mockRestore();
    global.canvas = previousCanvas;
    global.CONFIG = previousConfig;
    game.settings.get = previousGet;
  });
  test('successful wall updates route angles to localized timeline clips instead of single clip', async () => {
    const originalFlags = doc.getFlag;
    let angle = 5;
    doc.uuid = 'Scene.scene.Wall.timeline-test';
    doc.getFlag = (module, key) => key === 'slowDoorSoundTimeline' ? {
      enabled: true, opening: [{ from: 0, to: 10, src: 'initial.ogg', loop: true }, { from: 10, to: 90, src: 'strain.ogg', loop: true }],
    } : key === 'slowDoor' ? { angle, closed: [0, 0, 100, 0] } : originalFlags(module, key);
    playSlowDoorSound(doc, { c: doc.c }, options);
    await flush();
    expect(play).toHaveBeenCalledWith('initial.ogg', { x: 50, y: 0 }, 60, expect.objectContaining({ playbackOptions: expect.objectContaining({ loop: true }) }));
    angle = 20;
    playSlowDoorSound(doc, { c: doc.c }, options);
    await flush();
    expect(play).toHaveBeenLastCalledWith('strain.ogg', expect.any(Object), 60, expect.any(Object));
  });
  test('sound settings are absent from global settings', () => {
    for (const key of ['slowDoorSounds', 'slowDoorSoundPath', 'slowDoorSoundVolume']) {
      expect(DEFAULT_SETTINGS[key]).toBeUndefined();
    }
  });
  test('one sound for entire gesture even after clip ends and time passes', async () => {
    playSlowDoorSound(doc, { c: doc.c }, options);
    await flush();
    now.mockReturnValue(60000);
    playSlowDoorSound(doc, { c: doc.c }, options);
    playSlowDoorSound(doc, { c: doc.c }, { ...options, visionerSlowDoorDirection: -1 });
    expect(play).toHaveBeenCalledTimes(1);
    playSlowDoorSound(doc, { c: doc.c }, { ...options, visionerSlowDoorGesture: 'player:gesture-b' });
    expect(play).toHaveBeenCalledTimes(2);
  });
  test('each door uses its own sound, volume, toggle, and playback throttle', () => {
    const other = { ...doc, getFlag: (_module, key) => ({ slowDoorSounds: true,
      slowDoorSoundPath: 'stone-scrape.ogg', slowDoorSoundVolume: 0.2 })[key] };
    playSlowDoorSound(doc, { c: doc.c }, options);
    playSlowDoorSound(other, { c: other.c }, options);
    expect(play).toHaveBeenCalledTimes(2);
    expect(play).toHaveBeenLastCalledWith('stone-scrape.ogg', expect.any(Object), 60, expect.objectContaining({ volume: 0.2 }));
    const silent = { ...doc, getFlag: () => undefined };
    playSlowDoorSound(silent, { c: silent.c }, options);
    expect(play).toHaveBeenCalledTimes(2);
  });
  test('uses dedicated creak for both directions, independent of full opening/closing clips', async () => {
    playSlowDoorSound(doc, { c: doc.c }, options);
    expect(play).toHaveBeenCalledWith(path, { x: 50, y: 0 }, 60,
      { volume: 0.5, easing: true, walls: false, gmAlways: true, muffledEffect: { type: 'lowpass', intensity: 5 } });
    await flush();
    now.mockReturnValue(13000);
    volume = 0.25;
    playSlowDoorSound(doc, { c: doc.c }, { ...options, visionerSlowDoorDirection: -1, visionerSlowDoorGesture: 'player:gesture-b' });
    expect(play).toHaveBeenLastCalledWith(path, expect.any(Object), 60, expect.objectContaining({ volume: 0.25 }));
  });
  test('throttles ticks, loading audio, direction changes, and clips still playing', async () => {
    let resolve;
    const sound = { playing: true };
    play.mockReturnValue(new Promise((done) => { resolve = done; }));
    playSlowDoorSound(doc, { c: doc.c }, options);
    playSlowDoorSound(doc, { c: doc.c }, { ...options, visionerSlowDoorDirection: -1 });
    now.mockReturnValue(20000);
    playSlowDoorSound(doc, { c: doc.c }, options);
    expect(play).toHaveBeenCalledTimes(1);
    resolve(sound);
    await flush();
    playSlowDoorSound(doc, { c: doc.c }, options);
    expect(play).toHaveBeenCalledTimes(1);
    sound.playing = false;
    now.mockReturnValue(11000);
    playSlowDoorSound(doc, { c: doc.c }, options);
    expect(play).toHaveBeenCalledTimes(1);
    now.mockReturnValue(13000);
    playSlowDoorSound(doc, { c: doc.c }, options);
    expect(play).toHaveBeenCalledTimes(1);
    playSlowDoorSound(doc, { c: doc.c }, { ...options, visionerSlowDoorGesture: 'player:gesture-b' });
    expect(play).toHaveBeenCalledTimes(2);
  });
  test('disabled, muted, unconfigured, off-scene, and normal/reset updates stay silent', () => {
    enabled = false;
    playSlowDoorSound(doc, { c: doc.c }, options);
    enabled = true;
    volume = 0;
    playSlowDoorSound(doc, { c: doc.c }, options);
    volume = 0.5;
    playSlowDoorSound(doc, { c: doc.c }, {});
    playSlowDoorSound(doc, { c: doc.c }, { visionerSlowDoor: true });
    playSlowDoorSound(doc, {}, options);
    doc.parent.id = 'other';
    playSlowDoorSound(doc, { c: doc.c }, options);
    doc.parent.id = 'scene';
    path = '';
    playSlowDoorSound(doc, { c: doc.c }, options);
    expect(play).not.toHaveBeenCalled();
  });
  test('failed playback allows later retry without throwing', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      play.mockRejectedValueOnce(new Error('audio unavailable'));
      playSlowDoorSound(doc, { c: doc.c }, options);
      await flush();
      now.mockReturnValue(13000);
      playSlowDoorSound(doc, { c: doc.c }, { ...options, visionerSlowDoorGesture: 'player:gesture-b' });
      expect(play).toHaveBeenCalledTimes(2);
    } finally { warn.mockRestore(); }
  });
});
