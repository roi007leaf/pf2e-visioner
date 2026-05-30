import '../../../setup.js';
import { PeekManager } from '../../../../scripts/services/Peek/PeekManager.js';
import { PeekRegistry } from '../../../../scripts/services/Peek/PeekRegistry.js';

function deps() {
  return {
    registry: new PeekRegistry(),
    renderer: { apply: jest.fn(), clear: jest.fn() },
    socket: { sendUpdate: jest.fn(), sendEnd: jest.fn() },
    recompute: jest.fn(),
    now: () => 1000,
  };
}

describe('PeekManager door peek', () => {
  test('startDoorPeek registers a door peek with the door wall ignored', () => {
    const d = deps();
    const mgr = new PeekManager(d);
    const token = createMockToken({ id: 'peeker', x: 0, y: 0, width: 1, height: 1 });
    const door = { id: 'door1', c: [0, 0, 0, 100] };
    mgr.startDoorPeek(token, door);
    expect(d.registry.get('peeker').ignoredWallIds).toEqual(['door1']);
    expect(d.renderer.apply).toHaveBeenCalledTimes(1);
    expect(d.socket.sendUpdate).toHaveBeenCalledTimes(1);
    expect(d.recompute).toHaveBeenCalledWith('peeker');
  });
});

describe('PeekManager updatePeek', () => {
  test('updatePeek re-applies render, socket, and recompute', () => {
    const d = deps();
    const mgr = new PeekManager(d);
    const token = createMockToken({ id: 'peeker', x: 0, y: 0, width: 1, height: 1 });
    mgr.startCornerPeek(token, { x: 500, y: 50 });
    mgr.updatePeek('peeker', { x: 10, y: 600 });
    expect(d.renderer.apply).toHaveBeenCalledTimes(2);
    expect(d.socket.sendUpdate).toHaveBeenCalledTimes(2);
    expect(d.recompute).toHaveBeenCalledTimes(2);
    expect(d.registry.has('peeker')).toBe(true);
  });

  test('updatePeek is a no-op for an unknown token', () => {
    const d = deps();
    const mgr = new PeekManager(d);
    expect(() => mgr.updatePeek('ghost', { x: 0, y: 0 })).not.toThrow();
    expect(d.recompute).not.toHaveBeenCalled();
  });
});

describe('PeekManager getActivePeek', () => {
  test('getActivePeek returns the active peek', () => {
    const d = deps();
    const mgr = new PeekManager(d);
    const token = createMockToken({ id: 'peeker', x: 0, y: 0, width: 1, height: 1 });
    mgr.startCornerPeek(token, { x: 500, y: 50 });
    const peek = mgr.getActivePeek('peeker');
    expect(peek).toMatchObject({ origin: expect.any(Object) });
  });
});

describe('PeekManager lifecycle', () => {
  test('startCornerPeek registers, renders, sends, recomputes', () => {
    const d = deps();
    const mgr = new PeekManager(d);
    const token = createMockToken({ id: 'peeker', x: 0, y: 0, width: 1, height: 1 });
    mgr.startCornerPeek(token, { x: 500, y: 50 });
    expect(d.registry.has('peeker')).toBe(true);
    expect(d.renderer.apply).toHaveBeenCalledTimes(1);
    expect(d.socket.sendUpdate).toHaveBeenCalledTimes(1);
    expect(d.recompute).toHaveBeenCalledWith('peeker');
  });

  test('endPeek clears registry, renderer, sends end, recomputes; idempotent', () => {
    const d = deps();
    const mgr = new PeekManager(d);
    const token = createMockToken({ id: 'peeker', x: 0, y: 0, width: 1, height: 1 });
    mgr.startCornerPeek(token, { x: 500, y: 50 });
    mgr.endPeek('peeker', 'keyup');
    expect(d.registry.has('peeker')).toBe(false);
    expect(d.renderer.clear).toHaveBeenCalledWith(token);
    expect(d.socket.sendEnd).toHaveBeenCalledWith('peeker');
    mgr.endPeek('peeker', 'keyup');
    expect(d.renderer.clear).toHaveBeenCalledTimes(1);
  });

  test('only one active peek per token', () => {
    const d = deps();
    const mgr = new PeekManager(d);
    const token = createMockToken({ id: 'peeker', x: 0, y: 0, width: 1, height: 1 });
    mgr.startCornerPeek(token, { x: 500, y: 50 });
    mgr.startCornerPeek(token, { x: 50, y: 500 });
    expect(d.registry.ids().filter((id) => id === 'peeker')).toHaveLength(1);
  });
});
