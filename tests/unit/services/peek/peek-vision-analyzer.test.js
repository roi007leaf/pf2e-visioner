import '../../../setup.js';
import { peekRegistry } from '../../../../scripts/services/Peek/PeekRegistry.js';
import { VisionAnalyzer } from '../../../../scripts/visibility/auto-visibility/VisionAnalyzer.js';

describe('VisionAnalyzer peek constraints', () => {
  afterEach(() => peekRegistry.clearAll());

  function makePair() {
    const observer = createMockToken({ id: 'obs', x: 0, y: 0, width: 1, height: 1 });
    const target = createMockToken({ id: 'tgt', x: 1000, y: 0, width: 1, height: 1 });
    return { observer, target };
  }

  test('returns false when target is outside the peek cone', () => {
    const va = new VisionAnalyzer();
    const { observer, target } = makePair();
    peekRegistry.set('obs', { origin: { x: 0, y: 0 }, direction: Math.PI, fov: 60, ignoredWallIds: [] }, 1000);
    expect(va.hasLineOfSight(observer, target)).toBe(false);
  });

  test('excluded wall id is not in the wall set used for the ray', () => {
    const va = new VisionAnalyzer();
    const wall = createMockWall({ id: 'door1' });
    const all = [wall];
    const filtered = va._applyPeekWallExclusion('obs', all);
    peekRegistry.set('obs', { origin: { x: 0, y: 0 }, direction: 0, fov: 90, ignoredWallIds: ['door1'] }, 1000);
    const filtered2 = va._applyPeekWallExclusion('obs', all);
    expect(filtered).toEqual(all);
    expect(filtered2.find((w) => w.document.id === 'door1')).toBeUndefined();
  });
});
