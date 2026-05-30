import '../../../setup.js';
import { PeekLocalVisibility } from '../../../../scripts/services/Peek/peek-local-visibility.js';

describe('PeekLocalVisibility', () => {
  let cache;
  beforeEach(() => {
    cache = new PeekLocalVisibility();
  });

  test('set/get round-trip', () => {
    cache.set('obs1', 'tgt1', 'observed');
    expect(cache.get('obs1', 'tgt1')).toBe('observed');
  });

  test('get returns null when missing', () => {
    expect(cache.get('obs1', 'tgt1')).toBeNull();
    cache.set('obs1', 'tgt1', 'observed');
    expect(cache.get('obs1', 'tgtX')).toBeNull();
    expect(cache.get('obsX', 'tgt1')).toBeNull();
  });

  test('hasObserver reflects presence', () => {
    expect(cache.hasObserver('obs1')).toBe(false);
    cache.set('obs1', 'tgt1', 'hidden');
    expect(cache.hasObserver('obs1')).toBe(true);
  });

  test('clearObserver removes only that observer', () => {
    cache.set('obs1', 'tgt1', 'observed');
    cache.set('obs2', 'tgt1', 'hidden');
    cache.clearObserver('obs1');
    expect(cache.hasObserver('obs1')).toBe(false);
    expect(cache.get('obs1', 'tgt1')).toBeNull();
    expect(cache.get('obs2', 'tgt1')).toBe('hidden');
  });

  test('clearAll wipes everything', () => {
    cache.set('obs1', 'tgt1', 'observed');
    cache.set('obs2', 'tgt2', 'hidden');
    cache.clearAll();
    expect(cache.hasObserver('obs1')).toBe(false);
    expect(cache.hasObserver('obs2')).toBe(false);
    expect(cache.get('obs1', 'tgt1')).toBeNull();
  });
});
