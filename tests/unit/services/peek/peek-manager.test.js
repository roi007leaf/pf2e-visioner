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
