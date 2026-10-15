import '../../../setup.js';
import { DoorSoundTimelinePlayer, doorSoundRange, normalizeDoorSoundTimeline } from '../../../../scripts/services/Peek/door-sound-timeline.js';

const row = (from, to, src = 'creak.ogg', extra = {}) => ({ from, to, src, start: 1, end: 4, volume: 0.5, loop: true, ...extra });
const timeline = () => normalizeDoorSoundTimeline({ enabled: true, opening: [row(0, 10), row(10, 65, 'strain.ogg'), row(70, 90, 'squeak.ogg')], separateClosing: true, closing: [row(0, 90, 'close.ogg')] });
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

test('ranges map boundaries, gaps, full opening, and optional closing independently', () => {
  const t = timeline();
  expect(doorSoundRange(t, 9, 1).src).toBe('creak.ogg');
  expect(doorSoundRange(t, 10, 1).src).toBe('strain.ogg');
  expect(doorSoundRange(t, 68, 1)).toBeNull();
  expect(doorSoundRange(t, 90, 1).src).toBe('squeak.ogg');
  expect(doorSoundRange(t, 20, -1).src).toBe('close.ogg');
  t.separateClosing = false;
  expect(doorSoundRange(t, 20, -1).src).toBe('strain.ogg');
});

test.each([
  [row(0, 20), row(10, 30)], [row(-1, 20)], [row(0, 100)],
  [row(10, 10)], [row(0, 10, 'x', { start: 4, end: 3 })],
  [row(0, 10, 'x', { volume: 2 })],
])('rejects invalid range or trim values: %j', (...rows) => {
  expect(() => normalizeDoorSoundTimeline({ opening: rows })).toThrow();
});

describe('movement audio lifecycle', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());
  test('same range does not restart; boundary crossfades and idle stops loop', async () => {
    const sounds = [];
    const play = jest.fn(async () => { const sound = { stop: jest.fn() }; sounds.push(sound); return sound; });
    const player = new DoorSoundTimelinePlayer(play);
    player.move(timeline(), 5, 1, 0.4);
    await flush();
    expect(play).toHaveBeenCalledWith('creak.ogg', expect.objectContaining({ volume: 0.2, loop: true, offset: 1, loopStart: 1, loopEnd: 4, fade: 120 }));
    jest.advanceTimersByTime(200);
    player.move(timeline(), 8, 1, 0.4);
    await flush();
    expect(play).toHaveBeenCalledTimes(1);
    player.move(timeline(), 20, 1, 0.4);
    await flush();
    expect(sounds[0].stop).toHaveBeenCalledWith({ fade: 120 });
    expect(play).toHaveBeenCalledTimes(2);
    jest.advanceTimersByTime(400);
    expect(sounds[1].stop).toHaveBeenCalledWith({ fade: 120 });
    player.move(timeline(), 21, 1, 0.4);
    await flush();
    expect(play).toHaveBeenCalledTimes(3);
    player.stop();
  });
  test('one-shot trim duration, silent gaps, closing switch, and late load cleanup', async () => {
    let finish;
    const late = { stop: jest.fn() };
    const play = jest.fn().mockReturnValueOnce(new Promise((resolve) => { finish = resolve; })).mockResolvedValue({ stop: jest.fn() });
    const player = new DoorSoundTimelinePlayer(play);
    const t = timeline();
    t.opening[0].loop = false;
    player.move(t, 5, 1);
    await flush();
    expect(play).toHaveBeenCalledWith('creak.ogg', expect.objectContaining({ loop: false, offset: 1, duration: 3 }));
    player.move(t, 68, 1);
    finish(late);
    await flush();
    expect(late.stop).toHaveBeenCalledWith({ fade: 120 });
    player.move(t, 20, -1);
    await flush();
    expect(play).toHaveBeenLastCalledWith('close.ogg', expect.any(Object));
    player.stop();
  });
});
