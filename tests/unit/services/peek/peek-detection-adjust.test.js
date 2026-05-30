import '../../../setup.js';
import { peekAdjustedVisibility } from '../../../../scripts/services/Detection/detection-can-detect.js';
import { peekRegistry } from '../../../../scripts/services/Peek/PeekRegistry.js';
import { peekLocalVisibility } from '../../../../scripts/services/Peek/peek-local-visibility.js';

const mkToken = (id) => ({ document: { id } });

describe('peekAdjustedVisibility', () => {
  afterEach(() => {
    peekRegistry.clearAll();
    peekLocalVisibility.clearAll();
  });

  test('no peek for observer returns base unchanged', () => {
    const obs = mkToken('obs1');
    const tgt = mkToken('tgt1');
    expect(peekAdjustedVisibility(obs, tgt, 'undetected')).toBe('undetected');
  });

  test('peek active + cache has observed returns observed', () => {
    peekRegistry.set('obs1', { origin: { x: 0, y: 0 }, direction: 0, fov: 90, ignoredWallIds: [] }, 1000);
    peekLocalVisibility.set('obs1', 'tgt1', 'observed');
    expect(peekAdjustedVisibility(mkToken('obs1'), mkToken('tgt1'), 'undetected')).toBe('observed');
  });

  test('raise-only: a less-visible local value never lowers the synced base', () => {
    peekRegistry.set('obs1', { origin: { x: 0, y: 0 }, direction: 0, fov: 90, ignoredWallIds: [] }, 1000);
    peekLocalVisibility.set('obs1', 'tgt1', 'hidden');
    expect(peekAdjustedVisibility(mkToken('obs1'), mkToken('tgt1'), 'observed')).toBe('observed');
  });

  test('raise-only: a wrong undetected local value cannot hide a GM-revealed token', () => {
    peekRegistry.set('obs1', { origin: { x: 0, y: 0 }, direction: 0, fov: 90, ignoredWallIds: [] }, 1000);
    peekLocalVisibility.set('obs1', 'tgt1', 'undetected');
    expect(peekAdjustedVisibility(mkToken('obs1'), mkToken('tgt1'), 'observed')).toBe('observed');
  });

  test('raises base undetected up to the local hidden state (no over-reveal to observed)', () => {
    peekRegistry.set('obs1', { origin: { x: 0, y: 0 }, direction: 0, fov: 90, ignoredWallIds: [] }, 1000);
    peekLocalVisibility.set('obs1', 'tgt1', 'hidden');
    expect(peekAdjustedVisibility(mkToken('obs1'), mkToken('tgt1'), 'undetected')).toBe('hidden');
  });

  test('peek active + cache empty for target returns base', () => {
    peekRegistry.set('obs1', { origin: { x: 0, y: 0 }, direction: 0, fov: 90, ignoredWallIds: [] }, 1000);
    expect(peekAdjustedVisibility(mkToken('obs1'), mkToken('tgt1'), 'undetected')).toBe('undetected');
  });

  test('missing ids return base', () => {
    expect(peekAdjustedVisibility(null, mkToken('tgt1'), 'observed')).toBe('observed');
    expect(peekAdjustedVisibility(mkToken('obs1'), null, 'observed')).toBe('observed');
  });
});
