import '../../../setup.js';
import { peekRegistry } from '../../../../scripts/services/Peek/PeekRegistry.js';
import { PositionManager } from '../../../../scripts/visibility/auto-visibility/core/PositionManager.js';

describe('PositionManager peek origin override', () => {
  afterEach(() => peekRegistry.clearAll());

  test('returns peek origin when token has an active peek', () => {
    const pm = new PositionManager();
    const token = createMockToken({ id: 'peeker', x: 0, y: 0 });
    peekRegistry.set('peeker', { origin: { x: 777, y: 888, elevation: 5 }, direction: 0, fov: 90, ignoredWallIds: [] }, 1000);
    const pos = pm.getTokenPosition(token);
    expect(pos.x).toBe(777);
    expect(pos.y).toBe(888);
    expect(pos.elevation).toBe(5);
  });

  test('falls through to normal logic when no peek', () => {
    const pm = new PositionManager();
    const token = createMockToken({ id: 'normal', x: 100, y: 100, width: 1, height: 1 });
    const pos = pm.getTokenPosition(token);
    expect(pos.x).not.toBe(777);
  });
});
