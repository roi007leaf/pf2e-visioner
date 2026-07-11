import '../../../setup.js';
import { mergeSweptCone, PeekSocketSender } from '../../../../scripts/services/Peek/peek-socket.js';
import { isPointInCone } from '../../../../scripts/services/Peek/peek-geometry.js';

describe('PeekSocketSender', () => {
  function make(times) {
    let i = 0;
    const emit = jest.fn();
    const sender = new PeekSocketSender({ emit, now: () => times[i++], minIntervalMs: 100 });
    return { emit, sender };
  }

  test('rounds origin coordinates in payload', () => {
    const { emit, sender } = make([0]);
    sender.sendUpdate('t', { origin: { x: 1.6, y: 2.4 }, direction: 0, fov: 90, ignoredWallIds: [] });
    expect(emit).toHaveBeenCalledWith('PeekUpdate', expect.objectContaining({ origin: { x: 2, y: 2 } }));
  });

  test('throttles updates faster than minInterval', () => {
    jest.useFakeTimers();
    try {
      const emit = jest.fn();
      const sender = new PeekSocketSender({ emit, minIntervalMs: 100 });
      const peek = { origin: { x: 0, y: 0 }, direction: 0, fov: 90, ignoredWallIds: [] };
      sender.sendUpdate('t', { ...peek, origin: { x: 0, y: 0 } });
      sender.sendUpdate('t', { ...peek, origin: { x: 10, y: 0 } });
      sender.sendUpdate('t', { ...peek, origin: { x: 20, y: 0 } });
      expect(emit).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(100);
      expect(emit).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  test('does not drop the latest update inside the throttle window (coalesces on the trailing edge)', () => {
    jest.useFakeTimers();
    try {
      const emit = jest.fn();
      const sender = new PeekSocketSender({ emit, minIntervalMs: 100 });
      const peek = (x) => ({ origin: { x, y: 0 }, direction: 0, fov: 90, ignoredWallIds: [] });
      sender.sendUpdate('t', peek(0));
      sender.sendUpdate('t', peek(10));
      sender.sendUpdate('t', peek(20));
      jest.advanceTimersByTime(100);
      expect(emit).toHaveBeenCalledTimes(2);
      expect(emit).toHaveBeenLastCalledWith(
        'PeekUpdate',
        expect.objectContaining({ origin: { x: 20, y: 0 } }),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  test('mergeSweptCone returns the union of two cones', () => {
    const a = { direction: -0.1, fov: 10 };
    const b = { direction: 0.1, fov: 10 };
    const merged = mergeSweptCone(a, b);
    const halfA = (a.fov * Math.PI) / 360;
    const halfB = (b.fov * Math.PI) / 360;
    const expectedStart = Math.min(a.direction - halfA, b.direction - halfB);
    const expectedEnd = Math.max(a.direction + halfA, b.direction + halfB);
    const halfMerged = (merged.fov * Math.PI) / 360;
    expect(merged.direction - halfMerged).toBeCloseTo(expectedStart, 5);
    expect(merged.direction + halfMerged).toBeCloseTo(expectedEnd, 5);
  });

  test('a fast sweep through a target inside one throttle window is not lost: the coalesced send still covers it', () => {
    jest.useFakeTimers();
    try {
      const emit = jest.fn();
      const sender = new PeekSocketSender({ emit, minIntervalMs: 100 });
      const origin = { x: 0, y: 0 };
      const targetCenter = { x: 100, y: 0 }; // direction 0 rad from origin

      // Simulates a fast mouse sweep: 3 samples land inside the same 100ms coalescing
      // window - before the target, exactly on it, then past it. Only the last one
      // (direction 1.0, well past the target) would have been sent under naive "latest wins".
      sender.sendUpdate('t', { origin, direction: -1.0, fov: 10, ignoredWallIds: [] }); // sent immediately (leading edge)
      sender.sendUpdate('t', { origin, direction: 0, fov: 10, ignoredWallIds: [] }); // exactly on target - throttled
      sender.sendUpdate('t', { origin, direction: 1.0, fov: 10, ignoredWallIds: [] }); // past target - throttled, supersedes

      jest.advanceTimersByTime(100);

      expect(emit).toHaveBeenCalledTimes(2);
      const finalPayload = emit.mock.calls[1][1];
      expect(isPointInCone(finalPayload.origin, finalPayload.direction, finalPayload.fov, targetCenter)).toBe(
        true,
      );
    } finally {
      jest.useRealTimers();
    }
  });

  test('sendEnd cancels a pending coalesced send', () => {
    jest.useFakeTimers();
    try {
      const emit = jest.fn();
      const sender = new PeekSocketSender({ emit, minIntervalMs: 100 });
      const peek = { origin: { x: 0, y: 0 }, direction: 0, fov: 90, ignoredWallIds: [] };
      sender.sendUpdate('t', peek);
      sender.sendUpdate('t', peek);
      sender.sendEnd('t');
      jest.advanceTimersByTime(200);
      expect(emit).toHaveBeenCalledTimes(2);
      expect(emit).toHaveBeenLastCalledWith('PeekEnd', expect.objectContaining({ tokenId: 't' }));
    } finally {
      jest.useRealTimers();
    }
  });

  test('rounds points and forwards range in payload', () => {
    const { emit, sender } = make([0]);
    sender.sendUpdate('t', { origin: { x: 0, y: 0 }, direction: 0, fov: 90, ignoredWallIds: [], range: 400, points: [1.6, 2.4, 3.5, 4.5] });
    expect(emit).toHaveBeenCalledWith('PeekUpdate', expect.objectContaining({ points: [2, 2, 4, 5], range: 400 }));
  });

  test('sendEnd always emits immediately', () => {
    const { emit, sender } = make([0]);
    sender.sendEnd('t');
    expect(emit).toHaveBeenCalledWith('PeekEnd', expect.objectContaining({ tokenId: 't' }));
  });
});
