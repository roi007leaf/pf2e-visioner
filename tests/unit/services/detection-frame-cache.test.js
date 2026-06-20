import { DetectionFrameCache } from '../../../scripts/services/Detection/detection-frame-cache.js';

function token(id, flags = {}) {
  const document = {
    id,
    getFlag: jest.fn((moduleId, key) => flags[key]),
  };
  return { id, document };
}

describe('DetectionFrameCache', () => {
  test('caches visibility maps during one detection frame', () => {
    const observer = token('observer');
    const target = token('target');
    const getVisibilityMap = jest.fn(() => ({ target: 'hidden' }));
    const cache = new DetectionFrameCache({
      moduleId: 'pf2e-visioner',
      getVisibilityMap,
      getSetting: () => false,
      scheduleClear: () => {},
    });

    expect(cache.getVisibility(observer, target)).toBe('hidden');
    expect(cache.getVisibility(observer, target)).toBe('hidden');
    expect(getVisibilityMap).toHaveBeenCalledTimes(1);

    cache.clear();
    expect(cache.getVisibility(observer, target)).toBe('hidden');
    expect(getVisibilityMap).toHaveBeenCalledTimes(2);
  });

  test('recomputes visibility when the same token id has a new document object', () => {
    const firstObserver = token('observer');
    const secondObserver = token('observer');
    const target = token('target');
    const getVisibilityMap = jest
      .fn()
      .mockReturnValueOnce({ target: 'hidden' })
      .mockReturnValueOnce({ target: 'undetected' });
    const cache = new DetectionFrameCache({
      moduleId: 'pf2e-visioner',
      getVisibilityMap,
      getSetting: () => false,
      scheduleClear: () => {},
    });

    expect(cache.getVisibility(firstObserver, target)).toBe('hidden');
    expect(cache.getVisibility(secondObserver, target)).toBe('undetected');
    expect(getVisibilityMap).toHaveBeenCalledTimes(2);
  });

  test('recomputes cached visibility after global invalidation revision changes', () => {
    let revision = 0;
    const observer = token('observer');
    const target = token('target');
    const getVisibilityMap = jest
      .fn()
      .mockReturnValueOnce({ target: 'hidden' })
      .mockReturnValueOnce({ target: 'observed' });
    const cache = new DetectionFrameCache({
      moduleId: 'pf2e-visioner',
      getVisibilityMap,
      getSetting: () => false,
      getInvalidationRevision: () => revision,
      scheduleClear: () => {},
    });

    expect(cache.getVisibility(observer, target)).toBe('hidden');
    expect(cache.getVisibility(observer, target)).toBe('hidden');

    revision += 1;

    expect(cache.getVisibility(observer, target)).toBe('observed');
    expect(getVisibilityMap).toHaveBeenCalledTimes(2);
  });

  test('refreshes controlled observer list for aggregation during token control changes', () => {
    const observerA = token('observer-a');
    const observerB = token('observer-b');
    const target = token('target');
    let controlledObservers = [observerA, observerB];
    const getControlledObserverTokens = jest.fn(() => controlledObservers);
    const getVisibilityMap = jest.fn((observer) =>
      observer.id === 'observer-a' ? { target: 'hidden' } : { target: 'observed' },
    );
    const cache = new DetectionFrameCache({
      moduleId: 'pf2e-visioner',
      getVisibilityMap,
      getControlledObserverTokens,
      getBestVisibilityState: (states) => states.includes('observed') ? 'observed' : states[0],
      getSetting: () => true,
      scheduleClear: () => {},
    });

    expect(cache.getVisibility(observerA, target)).toBe('observed');
    controlledObservers = [observerA];
    expect(cache.getVisibility(observerA, target)).toBe('hidden');
    expect(getControlledObserverTokens).toHaveBeenCalledTimes(2);
    expect(getVisibilityMap).toHaveBeenCalledTimes(2);
  });

  test('uses explicit observer when aggregation has no controlled observers', () => {
    const observerA = token('observer-a');
    const observerB = token('observer-b');
    const target = token('target');
    const getControlledObserverTokens = jest.fn(() => []);
    const getVisibilityMap = jest.fn((observer) =>
      observer.id === 'observer-a' ? { target: 'undetected' } : { target: 'concealed' },
    );
    const cache = new DetectionFrameCache({
      moduleId: 'pf2e-visioner',
      getVisibilityMap,
      getControlledObserverTokens,
      getBestVisibilityState: (states) => states.includes('concealed') ? 'concealed' : states[0],
      getSetting: () => true,
      scheduleClear: () => {},
    });

    expect(cache.getVisibility(observerA, target)).toBe('undetected');
    expect(cache.getVisibility(observerB, target)).toBe('concealed');
  });

  test('indexes vision-sharing minions by master and mode', () => {
    const master = token('master');
    const reverseMinion = token('reverse', {
      visionMasterTokenId: 'master',
      visionSharingMode: 'reverse',
    });
    const twoWayMinion = token('two-way', {
      visionMasterTokenId: 'master',
      visionSharingMode: 'two-way',
    });
    const cache = new DetectionFrameCache({
      moduleId: 'pf2e-visioner',
      getTokens: () => [master, reverseMinion, twoWayMinion],
      scheduleClear: () => {},
    });

    expect(cache.hasMinionWithMode('master', 'reverse')).toBe(true);
    expect(cache.getMinionsForMaster('master', 'two-way')).toEqual([
      expect.objectContaining({ token: twoWayMinion }),
    ]);
    expect(cache.getVisionSharingMode(reverseMinion.document)).toBe('reverse');
  });
});
