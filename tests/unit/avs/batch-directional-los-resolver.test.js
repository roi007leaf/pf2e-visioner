import { BatchDirectionalLosResolver } from '../../../scripts/visibility/auto-visibility/core/BatchDirectionalLosResolver.js';
import { peekRegistry } from '../../../scripts/services/Peek/PeekRegistry.js';

const token = (id) => ({ document: { id } });

function makeBreakdown() {
  return {
    losCacheHits: 0,
    losCacheMisses: 0,
    burstMemoHits: 0,
    losGlobalHits: 0,
    losGlobalMisses: 0,
    losGlobalExpired: 0,
  };
}

describe('BatchDirectionalLosResolver', () => {
  test('returns a batch cached LOS value without consulting wider caches', () => {
    const observer = token('A');
    const target = token('B');
    const breakdown = makeBreakdown();
    const batchLosCache = new Map([['A>>B', false]]);
    const globalLosCache = {
      getWithMeta: jest.fn(),
      set: jest.fn(),
    };
    const visionAnalyzer = { hasLineOfSight: jest.fn() };
    const precomputedLOS = new Map();

    const resolver = new BatchDirectionalLosResolver({
      visionAnalyzer,
      globalLosCache,
      batchLosCache,
      precomputedLOS,
      breakdown,
    });

    expect(resolver.get(observer, target, 'A>>B')).toBe(false);
    expect(breakdown).toEqual({
      ...makeBreakdown(),
      losCacheHits: 1,
    });
    expect(globalLosCache.getWithMeta).not.toHaveBeenCalled();
    expect(globalLosCache.set).not.toHaveBeenCalled();
    expect(visionAnalyzer.hasLineOfSight).not.toHaveBeenCalled();
    expect(precomputedLOS.size).toBe(0);
  });

  test('hydrates batch and precomputed LOS from burst memo before global cache', () => {
    const observer = token('A');
    const target = token('B');
    const breakdown = makeBreakdown();
    const batchLosCache = new Map();
    const burstLosMemo = new Map([['A>>B', true]]);
    const globalLosCache = {
      getWithMeta: jest.fn(),
      set: jest.fn(),
    };
    const visionAnalyzer = { hasLineOfSight: jest.fn() };
    const precomputedLOS = new Map();

    const resolver = new BatchDirectionalLosResolver({
      visionAnalyzer,
      globalLosCache,
      batchLosCache,
      burstLosMemo,
      precomputedLOS,
      breakdown,
    });

    expect(resolver.get(observer, target, 'A>>B')).toBe(true);
    expect(breakdown).toEqual({
      ...makeBreakdown(),
      losCacheHits: 1,
      losCacheMisses: 1,
      burstMemoHits: 1,
    });
    expect(globalLosCache.getWithMeta).not.toHaveBeenCalled();
    expect(visionAnalyzer.hasLineOfSight).not.toHaveBeenCalled();
    expect(batchLosCache.get('A>>B')).toBe(true);
    expect(precomputedLOS.get('A-B')).toBe(true);
  });

  test('hydrates batch and precomputed LOS from global cache metadata hits', () => {
    const observer = token('A');
    const target = token('B');
    const breakdown = makeBreakdown();
    const batchLosCache = new Map();
    const globalLosCache = {
      getWithMeta: jest.fn(() => ({ state: 'hit', value: false })),
      set: jest.fn(),
    };
    const visionAnalyzer = { hasLineOfSight: jest.fn() };
    const precomputedLOS = new Map();

    const resolver = new BatchDirectionalLosResolver({
      visionAnalyzer,
      globalLosCache,
      batchLosCache,
      precomputedLOS,
      breakdown,
    });

    expect(resolver.get(observer, target, 'A>>B')).toBe(false);
    expect(breakdown).toEqual({
      ...makeBreakdown(),
      losCacheMisses: 1,
      losGlobalHits: 1,
    });
    expect(globalLosCache.getWithMeta).toHaveBeenCalledWith('A>>B');
    expect(globalLosCache.set).not.toHaveBeenCalled();
    expect(visionAnalyzer.hasLineOfSight).not.toHaveBeenCalled();
    expect(batchLosCache.get('A>>B')).toBe(false);
    expect(precomputedLOS.get('A-B')).toBe(false);
  });

  test('computes LOS on global misses and writes through reusable caches', () => {
    const observer = token('A');
    const target = token('B');
    const breakdown = makeBreakdown();
    const batchLosCache = new Map();
    const burstLosMemo = new Map();
    const globalLosCache = {
      getWithMeta: jest.fn(() => ({ state: 'expired', value: undefined })),
      set: jest.fn(),
    };
    const visionAnalyzer = { hasLineOfSight: jest.fn(() => true) };
    const precomputedLOS = new Map();

    const resolver = new BatchDirectionalLosResolver({
      visionAnalyzer,
      globalLosCache,
      batchLosCache,
      burstLosMemo,
      precomputedLOS,
      breakdown,
    });

    expect(resolver.get(observer, target, 'A>>B')).toBe(true);
    expect(breakdown).toEqual({
      ...makeBreakdown(),
      losCacheMisses: 1,
      losGlobalMisses: 1,
      losGlobalExpired: 1,
    });
    expect(visionAnalyzer.hasLineOfSight).toHaveBeenCalledWith(observer, target, 'sight');
    expect(globalLosCache.set).toHaveBeenCalledWith('A>>B', true);
    expect(burstLosMemo.get('A>>B')).toBe(true);
    expect(batchLosCache.get('A>>B')).toBe(true);
    expect(precomputedLOS.get('A-B')).toBe(true);
  });

  test('skips burst and global caches when LOS cache use is disabled', () => {
    const observer = token('A');
    const target = token('B');
    const breakdown = makeBreakdown();
    const batchLosCache = new Map();
    const burstLosMemo = new Map([['A>>B', false]]);
    const globalLosCache = {
      getWithMeta: jest.fn(),
      set: jest.fn(),
    };
    const visionAnalyzer = { hasLineOfSight: jest.fn(() => true) };
    const precomputedLOS = new Map();

    const resolver = new BatchDirectionalLosResolver({
      visionAnalyzer,
      globalLosCache,
      batchLosCache,
      burstLosMemo,
      precomputedLOS,
      breakdown,
      skipLosCache: true,
    });

    expect(resolver.get(observer, target, 'A>>B')).toBe(true);
    expect(breakdown).toEqual({
      ...makeBreakdown(),
      losCacheMisses: 1,
      losGlobalMisses: 1,
    });
    expect(globalLosCache.getWithMeta).not.toHaveBeenCalled();
    expect(globalLosCache.set).not.toHaveBeenCalled();
    expect(burstLosMemo.get('A>>B')).toBe(false);
    expect(batchLosCache.get('A>>B')).toBe(true);
    expect(precomputedLOS.get('A-B')).toBe(true);
  });

  test('bypasses burst and global caches for a peeking observer without disabling the cache for that call site generally', () => {
    const observer = token('A');
    const target = token('B');
    const breakdown = makeBreakdown();
    const batchLosCache = new Map();
    const burstLosMemo = new Map([['A>>B', false]]);
    const globalLosCache = {
      getWithMeta: jest.fn(),
      set: jest.fn(),
    };
    const visionAnalyzer = { hasLineOfSight: jest.fn(() => true) };
    const precomputedLOS = new Map();

    peekRegistry.set('A', { origin: { x: 0, y: 0 }, direction: 0, fov: 20, ignoredWallIds: [] }, Date.now());
    try {
      const resolver = new BatchDirectionalLosResolver({
        visionAnalyzer,
        globalLosCache,
        batchLosCache,
        burstLosMemo,
        precomputedLOS,
        breakdown,
      });

      // Observer A is peeking: the stale cached "false" for A>>B must not be served.
      expect(resolver.get(observer, target, 'A>>B')).toBe(true);
      expect(visionAnalyzer.hasLineOfSight).toHaveBeenCalledWith(observer, target, 'sight');
      expect(globalLosCache.getWithMeta).not.toHaveBeenCalled();
      expect(globalLosCache.set).not.toHaveBeenCalled();
      expect(burstLosMemo.get('A>>B')).toBe(false);
      expect(batchLosCache.get('A>>B')).toBe(true);

      // Observer B is not peeking: a separately-primed cached value for B>>A is still honored.
      burstLosMemo.set('B>>A', false);
      visionAnalyzer.hasLineOfSight.mockClear();
      expect(resolver.get(target, observer, 'B>>A')).toBe(false);
      expect(visionAnalyzer.hasLineOfSight).not.toHaveBeenCalled();
    } finally {
      peekRegistry.clearAll();
    }
  });

  test('uses movement sight-line resolver when base LOS rejects a pending polygon hit', () => {
    const observer = token('A');
    const target = token('B');
    const breakdown = makeBreakdown();
    const batchLosCache = new Map();
    const burstLosMemo = new Map();
    const globalLosCache = {
      getWithMeta: jest.fn(),
      set: jest.fn(),
    };
    const visionAnalyzer = { hasLineOfSight: jest.fn(() => false) };
    const movementSightLineResolver = jest.fn(() => true);
    const precomputedLOS = new Map();

    const resolver = new BatchDirectionalLosResolver({
      visionAnalyzer,
      globalLosCache,
      batchLosCache,
      burstLosMemo,
      precomputedLOS,
      breakdown,
      skipLosCache: true,
      movementSightLineResolver,
    });

    expect(resolver.get(observer, target, 'A>>B')).toBe(true);
    expect(visionAnalyzer.hasLineOfSight).toHaveBeenCalledWith(observer, target, 'sight');
    expect(movementSightLineResolver).toHaveBeenCalledWith(observer, target);
    expect(globalLosCache.set).not.toHaveBeenCalled();
    expect(burstLosMemo.get('A>>B')).toBeUndefined();
    expect(batchLosCache.get('A>>B')).toBe(true);
    expect(precomputedLOS.get('A-B')).toBe(true);
  });

  test('uses source-polygon resolver when base LOS rejects a controlled source hit', () => {
    const observer = token('A');
    const target = token('B');
    const breakdown = makeBreakdown();
    const batchLosCache = new Map();
    const globalLosCache = {
      getWithMeta: jest.fn(),
      set: jest.fn(),
    };
    const visionAnalyzer = { hasLineOfSight: jest.fn(() => false) };
    const sourcePolygonLosResolver = jest.fn(() => true);
    const precomputedLOS = new Map();

    const resolver = new BatchDirectionalLosResolver({
      visionAnalyzer,
      globalLosCache,
      batchLosCache,
      precomputedLOS,
      breakdown,
      skipLosCache: true,
      sourcePolygonLosResolver,
    });

    expect(resolver.get(observer, target, 'A>>B')).toBe(true);
    expect(visionAnalyzer.hasLineOfSight).toHaveBeenCalledWith(observer, target, 'sight');
    expect(sourcePolygonLosResolver).toHaveBeenCalledWith(observer, target);
    expect(globalLosCache.set).not.toHaveBeenCalled();
    expect(batchLosCache.get('A>>B')).toBe(true);
    expect(precomputedLOS.get('A-B')).toBe(true);
  });

  test('source-polygon resolver can override a cached false LOS value', () => {
    const observer = token('A');
    const target = token('B');
    const breakdown = makeBreakdown();
    const batchLosCache = new Map([['A>>B', false]]);
    const globalLosCache = {
      getWithMeta: jest.fn(),
      set: jest.fn(),
    };
    const visionAnalyzer = { hasLineOfSight: jest.fn() };
    const sourcePolygonLosResolver = jest.fn(() => true);
    const precomputedLOS = new Map();

    const resolver = new BatchDirectionalLosResolver({
      visionAnalyzer,
      globalLosCache,
      batchLosCache,
      precomputedLOS,
      breakdown,
      sourcePolygonLosResolver,
    });

    expect(resolver.get(observer, target, 'A>>B')).toBe(true);
    expect(sourcePolygonLosResolver).toHaveBeenCalledWith(observer, target);
    expect(globalLosCache.getWithMeta).not.toHaveBeenCalled();
    expect(globalLosCache.set).not.toHaveBeenCalled();
    expect(visionAnalyzer.hasLineOfSight).not.toHaveBeenCalled();
    expect(batchLosCache.get('A>>B')).toBe(true);
    expect(precomputedLOS.get('A-B')).toBe(true);
  });
});
