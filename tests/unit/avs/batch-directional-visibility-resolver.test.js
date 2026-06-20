import { BatchDirectionalVisibilityResolver } from '../../../scripts/visibility/auto-visibility/core/BatchDirectionalVisibilityResolver.js';

const token = (id) => ({ document: { id } });
const position = (x, y) => ({ x, y, elevation: 0 });

function makeBreakdown() {
  return {
    pairsComputed: 0,
    pairsCached: 0,
    visGlobalHits: 0,
    visGlobalMisses: 0,
    visGlobalExpired: 0,
  };
}

describe('BatchDirectionalVisibilityResolver', () => {
  test('returns a batch cached visibility without consulting global cache or calculator', async () => {
    const observer = token('A');
    const target = token('B');
    const breakdown = makeBreakdown();
    const batchVisibilityCache = new Map([['A>>B', 'hidden']]);
    const globalVisibilityCache = {
      getWithMeta: jest.fn(),
      set: jest.fn(),
    };
    const optimizedVisibilityCalculator = {
      calculateVisibilityBetweenTokens: jest.fn(),
    };

    const resolver = new BatchDirectionalVisibilityResolver({
      optimizedVisibilityCalculator,
      globalVisibilityCache,
      batchVisibilityCache,
      breakdown,
    });

    await expect(
      resolver.get({
        observerToken: observer,
        targetToken: target,
        observerPosition: position(0, 0),
        targetPosition: position(100, 0),
        cacheKey: 'A>>B',
      }),
    ).resolves.toBe('hidden');

    expect(breakdown).toEqual({
      ...makeBreakdown(),
      pairsCached: 1,
    });
    expect(globalVisibilityCache.getWithMeta).not.toHaveBeenCalled();
    expect(optimizedVisibilityCalculator.calculateVisibilityBetweenTokens).not.toHaveBeenCalled();
  });

  test('hydrates batch cache from global visibility hits', async () => {
    const observer = token('A');
    const target = token('B');
    const breakdown = makeBreakdown();
    const batchVisibilityCache = new Map();
    const globalVisibilityCache = {
      getWithMeta: jest.fn(() => ({ state: 'hit', value: 'concealed' })),
      set: jest.fn(),
    };
    const optimizedVisibilityCalculator = {
      calculateVisibilityBetweenTokens: jest.fn(),
    };

    const resolver = new BatchDirectionalVisibilityResolver({
      optimizedVisibilityCalculator,
      globalVisibilityCache,
      batchVisibilityCache,
      breakdown,
    });

    await expect(
      resolver.get({
        observerToken: observer,
        targetToken: target,
        observerPosition: position(0, 0),
        targetPosition: position(100, 0),
        cacheKey: 'A>>B',
      }),
    ).resolves.toBe('concealed');

    expect(breakdown).toEqual({
      ...makeBreakdown(),
      visGlobalHits: 1,
    });
    expect(globalVisibilityCache.getWithMeta).toHaveBeenCalledWith('A>>B');
    expect(globalVisibilityCache.set).not.toHaveBeenCalled();
    expect(batchVisibilityCache.get('A>>B')).toBe('concealed');
    expect(optimizedVisibilityCalculator.calculateVisibilityBetweenTokens).not.toHaveBeenCalled();
  });

  test('computes visibility on global misses and writes through global and batch caches', async () => {
    const observer = token('A');
    const target = token('B');
    const observerPosition = position(0, 0);
    const targetPosition = position(100, 0);
    const commonCalcOptions = { precomputedLOS: new Map() };
    const breakdown = makeBreakdown();
    const batchVisibilityCache = new Map();
    const globalVisibilityCache = {
      getWithMeta: jest.fn(() => ({ state: 'expired', value: undefined })),
      set: jest.fn(),
    };
    const optimizedVisibilityCalculator = {
      calculateVisibilityBetweenTokens: jest.fn(async () => 'hidden'),
    };

    const resolver = new BatchDirectionalVisibilityResolver({
      optimizedVisibilityCalculator,
      globalVisibilityCache,
      batchVisibilityCache,
      commonCalcOptions,
      breakdown,
    });

    await expect(
      resolver.get({
        observerToken: observer,
        targetToken: target,
        observerPosition,
        targetPosition,
        cacheKey: 'A>>B',
      }),
    ).resolves.toBe('hidden');

    expect(breakdown).toEqual({
      ...makeBreakdown(),
      pairsComputed: 1,
      visGlobalMisses: 1,
      visGlobalExpired: 1,
    });
    expect(optimizedVisibilityCalculator.calculateVisibilityBetweenTokens).toHaveBeenCalledWith(
      observer,
      target,
      observerPosition,
      targetPosition,
      commonCalcOptions,
    );
    expect(globalVisibilityCache.set).toHaveBeenCalledWith('A>>B', 'hidden');
    expect(batchVisibilityCache.get('A>>B')).toBe('hidden');
  });

  test('skips global visibility cache when forced fresh computation is requested', async () => {
    const observer = token('A');
    const target = token('B');
    const breakdown = makeBreakdown();
    const batchVisibilityCache = new Map();
    const globalVisibilityCache = {
      getWithMeta: jest.fn(),
      set: jest.fn(),
    };
    const optimizedVisibilityCalculator = {
      calculateVisibilityBetweenTokens: jest.fn(async () => 'observed'),
    };

    const resolver = new BatchDirectionalVisibilityResolver({
      optimizedVisibilityCalculator,
      globalVisibilityCache,
      batchVisibilityCache,
      breakdown,
      skipGlobalVisCache: true,
    });

    await expect(
      resolver.get({
        observerToken: observer,
        targetToken: target,
        observerPosition: position(0, 0),
        targetPosition: position(100, 0),
        cacheKey: 'A>>B',
      }),
    ).resolves.toBe('observed');

    expect(breakdown).toEqual({
      ...makeBreakdown(),
      pairsComputed: 1,
      visGlobalMisses: 1,
    });
    expect(globalVisibilityCache.getWithMeta).not.toHaveBeenCalled();
    expect(globalVisibilityCache.set).not.toHaveBeenCalled();
    expect(batchVisibilityCache.get('A>>B')).toBe('observed');
  });
});
