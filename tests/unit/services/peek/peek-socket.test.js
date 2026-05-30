import '../../../setup.js';
import { PeekSocketSender } from '../../../../scripts/services/Peek/peek-socket.js';

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
    const { emit, sender } = make([0, 50, 200]);
    const peek = { origin: { x: 0, y: 0 }, direction: 0, fov: 90, ignoredWallIds: [] };
    sender.sendUpdate('t', { ...peek, origin: { x: 0, y: 0 } });
    sender.sendUpdate('t', { ...peek, origin: { x: 10, y: 0 } });
    sender.sendUpdate('t', { ...peek, origin: { x: 20, y: 0 } });
    expect(emit).toHaveBeenCalledTimes(2);
  });

  test('sendEnd always emits immediately', () => {
    const { emit, sender } = make([0]);
    sender.sendEnd('t');
    expect(emit).toHaveBeenCalledWith('PeekEnd', expect.objectContaining({ tokenId: 't' }));
  });
});
