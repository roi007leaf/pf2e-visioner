import '../../../setup.js';
import { PeekManager } from '../../../../scripts/services/Peek/PeekManager.js';
import { PeekRegistry } from '../../../../scripts/services/Peek/PeekRegistry.js';
import { pullBackOrigin } from '../../../../scripts/services/Peek/peek-geometry.js';

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

describe('PeekManager door re-aim and toggle', () => {
  test('updatePeek on a door peek keeps origin fixed but re-sends', () => {
    const d = deps();
    const mgr = new PeekManager(d);
    const token = createMockToken({ id: 'peeker', x: -100, y: 0, width: 1, height: 1 });
    token.center = { x: -50, y: 50 };
    const door = { id: 'door1', c: [0, 0, 0, 100] };
    mgr.startDoorPeek(token, door, { x: 100, y: 50 });
    const originBefore = { ...d.registry.get('peeker').origin };
    d.socket.sendUpdate.mockClear();
    mgr.updatePeek('peeker', { x: 100, y: 200 });
    expect(d.registry.get('peeker').origin).toEqual(originBefore);
    expect(d.socket.sendUpdate).toHaveBeenCalledTimes(1);
  });

  test('tryStartDoorPeek twice on same token+door toggles the peek off', async () => {
    const d = deps();
    const mgr = new PeekManager(d);
    const token = createMockToken({ id: 'peeker', x: -100, y: 0, width: 1, height: 1 });
    token.center = { x: -50, y: 50 };
    const door = { id: 'door1', c: [0, 0, 0, 100], getFlag: () => undefined };
    const first = await mgr.tryStartDoorPeek(token, door, { x: 100, y: 50 });
    expect(first).toBe(true);
    expect(d.registry.has('peeker')).toBe(true);
    const second = await mgr.tryStartDoorPeek(token, door, { x: 100, y: 50 });
    expect(second).toBe(false);
    expect(d.registry.has('peeker')).toBe(false);
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

describe('PeekManager hook reactions', () => {
  function mgrWith() {
    const d = {
      registry: new PeekRegistry(),
      renderer: { apply: jest.fn(), clear: jest.fn() },
      socket: { sendUpdate: jest.fn(), sendEnd: jest.fn() },
      recompute: jest.fn(),
      now: () => 1,
    };
    return { d, mgr: new PeekManager(d) };
  }

  test('onTokenUpdate ends peek when position changes', () => {
    const { d, mgr } = mgrWith();
    const token = createMockToken({ id: 'p', x: 0, y: 0, width: 1, height: 1 });
    mgr.startCornerPeek(token, { x: 500, y: 0 });
    mgr.onTokenUpdate({ id: 'p' }, { x: 200 });
    expect(d.registry.has('p')).toBe(false);
  });

  test('onTokenUpdate ignores non-position changes', () => {
    const { d, mgr } = mgrWith();
    const token = createMockToken({ id: 'p', x: 0, y: 0, width: 1, height: 1 });
    mgr.startCornerPeek(token, { x: 500, y: 0 });
    mgr.onTokenUpdate({ id: 'p' }, { rotation: 90 });
    expect(d.registry.has('p')).toBe(true);
  });

  test('onWallUpdate ends a door peek that ignored that wall', () => {
    const { d, mgr } = mgrWith();
    const token = createMockToken({ id: 'p', x: -50, y: 50, width: 1, height: 1 });
    mgr.startDoorPeek(token, { id: 'door9', c: [0, 0, 0, 100] });
    mgr.onWallUpdate({ id: 'door9' }, { ds: 1 });
    expect(d.registry.has('p')).toBe(false);
  });
});

describe('PeekManager heartbeat', () => {
  function deps() {
    return {
      registry: new PeekRegistry(),
      renderer: { apply: jest.fn(), clear: jest.fn() },
      socket: { sendUpdate: jest.fn(), sendEnd: jest.fn() },
      recompute: jest.fn(),
      now: () => 1000,
    };
  }

  test('heartbeat re-sends all active peeks owned by this manager', () => {
    const d = deps();
    const mgr = new PeekManager(d);
    const token = createMockToken({ id: 'p', x: 0, y: 0, width: 1, height: 1 });
    mgr.startCornerPeek(token, { x: 500, y: 0 });
    d.socket.sendUpdate.mockClear();
    mgr.heartbeat();
    expect(d.socket.sendUpdate).toHaveBeenCalledTimes(1);
    expect(d.socket.sendUpdate).toHaveBeenCalledWith('p', expect.objectContaining({ origin: expect.anything() }));
  });

  test('heartbeat sends nothing when no active peek', () => {
    const d = deps();
    const mgr = new PeekManager(d);
    mgr.heartbeat();
    expect(d.socket.sendUpdate).not.toHaveBeenCalled();
  });

  test('heartbeat stops re-sending a token after its peek ended', () => {
    const d = deps();
    const mgr = new PeekManager(d);
    const token = createMockToken({ id: 'p', x: 0, y: 0, width: 1, height: 1 });
    mgr.startCornerPeek(token, { x: 500, y: 0 });
    mgr.endPeek('p', 'keyup');
    d.socket.sendUpdate.mockClear();
    mgr.heartbeat();
    expect(d.socket.sendUpdate).not.toHaveBeenCalled();
  });
});

describe('PeekManager door DC gate', () => {
  function mgrWith(extra = {}) {
    const d = {
      registry: new PeekRegistry(),
      renderer: { apply: jest.fn(), clear: jest.fn() },
      socket: { sendUpdate: jest.fn(), sendEnd: jest.fn() },
      recompute: jest.fn(),
      now: () => 1,
      ...extra,
    };
    return { d, mgr: new PeekManager(d) };
  }

  test('no DC -> opens immediately without rolling', async () => {
    const rollPeek = jest.fn();
    const { d, mgr } = mgrWith({ rollPeek });
    const token = createMockToken({ id: 'p', x: -50, y: 50, width: 1, height: 1 });
    const door = { id: 'd', c: [0, 0, 0, 100], getFlag: () => undefined };
    await mgr.tryStartDoorPeek(token, door);
    expect(d.registry.has('p')).toBe(true);
    expect(rollPeek).not.toHaveBeenCalled();
  });

  test('DC + success -> opens', async () => {
    const rollPeek = jest.fn(async () => ({ success: true }));
    const { d, mgr } = mgrWith({ rollPeek });
    const token = createMockToken({ id: 'p', x: -50, y: 50, width: 1, height: 1 });
    const door = { id: 'd', c: [0, 0, 0, 100], getFlag: (m, k) => (k === 'peekDC' ? 12 : undefined) };
    await mgr.tryStartDoorPeek(token, door);
    expect(rollPeek).toHaveBeenCalled();
    expect(d.registry.has('p')).toBe(true);
  });

  test('DC + failure -> does not open', async () => {
    const rollPeek = jest.fn(async () => ({ success: false }));
    const { d, mgr } = mgrWith({ rollPeek });
    const token = createMockToken({ id: 'p', x: -50, y: 50, width: 1, height: 1 });
    const door = { id: 'd', c: [0, 0, 0, 100], getFlag: (m, k) => (k === 'peekDC' ? 12 : undefined) };
    await mgr.tryStartDoorPeek(token, door);
    expect(d.registry.has('p')).toBe(false);
  });
});

describe('PeekManager corner peek wall clamp', () => {
  let prevCanvas;
  beforeEach(() => {
    prevCanvas = global.canvas;
  });
  afterEach(() => {
    global.canvas = prevCanvas;
  });

  test('startCornerPeek pulls origin back to the token side of a hit wall', () => {
    const hit = { x: 25, y: 0 };
    global.canvas = {
      ...global.canvas,
      walls: { testCollision: jest.fn(() => hit) },
      grid: { size: 100 },
    };
    const d = deps();
    const mgr = new PeekManager(d);
    const token = createMockToken({ id: 'peeker', x: 0, y: 0, width: 1, height: 1 });
    token.center = { x: 0, y: 0 };
    mgr.startCornerPeek(token, { x: 500, y: 0 });
    const stored = d.registry.get('peeker');
    const expected = pullBackOrigin(token.center, { x: stored.origin.x, y: stored.origin.y }, hit, 2);
    expect(stored.origin.x).toBeCloseTo(23, 5);
    expect(stored.origin.y).toBeCloseTo(0, 5);
    expect(global.canvas.walls.testCollision).toHaveBeenCalled();
    expect(expected.x).toBeCloseTo(23, 5);
  });

  test('startCornerPeek leaves origin unchanged when no wall is hit', () => {
    global.canvas = {
      ...global.canvas,
      walls: { testCollision: jest.fn(() => null) },
      grid: { size: 100 },
    };
    const d = deps();
    const mgr = new PeekManager(d);
    const token = createMockToken({ id: 'peeker', x: 0, y: 0, width: 1, height: 1 });
    token.center = { x: 0, y: 0 };
    mgr.startCornerPeek(token, { x: 500, y: 0 });
    const stored = d.registry.get('peeker');
    expect(stored.origin.x).toBeGreaterThan(100);
  });
});

describe('PeekManager reaimFromPointer', () => {
  function deps() {
    return {
      registry: new PeekRegistry(),
      renderer: { apply: jest.fn(), clear: jest.fn() },
      socket: { sendUpdate: jest.fn(), sendEnd: jest.fn() },
      recompute: jest.fn(),
      now: () => 1,
    };
  }

  test('re-aims an active door peek for a controlled token', () => {
    const d = deps();
    const mgr = new PeekManager(d);
    const token = createMockToken({ id: 'p', x: -50, y: 50, width: 1, height: 1 });
    token.controlled = true;
    mgr.startDoorPeek(token, { id: 'door1', c: [0, 0, 0, 100] });
    d.socket.sendUpdate.mockClear();
    mgr.reaimFromPointer({ x: 10, y: 80 });
    expect(d.socket.sendUpdate).toHaveBeenCalledWith('p', expect.objectContaining({ origin: expect.anything() }));
  });

  test('does not re-aim a door peek when token is not controlled', () => {
    const d = deps();
    const mgr = new PeekManager(d);
    const token = createMockToken({ id: 'p', x: -50, y: 50, width: 1, height: 1 });
    token.controlled = false;
    mgr.startDoorPeek(token, { id: 'door1', c: [0, 0, 0, 100] });
    d.socket.sendUpdate.mockClear();
    mgr.reaimFromPointer({ x: 10, y: 80 });
    expect(d.socket.sendUpdate).not.toHaveBeenCalled();
  });

  test('re-aims the held corner peek', () => {
    const d = deps();
    const mgr = new PeekManager(d);
    const token = createMockToken({ id: 'p', x: 0, y: 0, width: 1, height: 1 });
    mgr.startCornerPeek(token, { x: 500, y: 0 });
    const prevGet = global.game.modules.get;
    global.game.modules.get = jest.fn(() => ({ _peekKeyHeld: 'p' }));
    d.socket.sendUpdate.mockClear();
    mgr.reaimFromPointer({ x: 0, y: 500 });
    expect(d.socket.sendUpdate).toHaveBeenCalledWith('p', expect.anything());
    global.game.modules.get = prevGet;
  });

  test('no-op when mouse is null', () => {
    const d = deps();
    const mgr = new PeekManager(d);
    expect(() => mgr.reaimFromPointer(null)).not.toThrow();
    expect(d.socket.sendUpdate).not.toHaveBeenCalled();
  });
});
