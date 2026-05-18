import { BatchDirectionalLosResolver } from '../../../scripts/visibility/auto-visibility/core/BatchDirectionalLosResolver.js';

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
});
