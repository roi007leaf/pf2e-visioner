import {
  getEligibleVisibilityTokenIds,
  VisibilityStateManager,
} from '../../../scripts/visibility/auto-visibility/core/VisibilityStateManager.js';

describe('getEligibleVisibilityTokenIds', () => {
  test('returns actor token ids in input order', () => {
    const tokens = [
      { actor: { id: 'actor-a' }, document: { id: 'A' } },
      { actor: { id: 'actor-b' }, document: { id: 'B' } },
    ];

    expect(getEligibleVisibilityTokenIds(tokens)).toEqual(['A', 'B']);
  });

  test('skips tokens without actors', () => {
    const tokens = [
      { actor: null, document: { id: 'no-actor' } },
      { actor: { id: 'actor-a' }, document: { id: 'A' } },
    ];

    expect(getEligibleVisibilityTokenIds(tokens)).toEqual(['A']);
  });

  test('uses the exclusion manager when present', () => {
    const excludedToken = { actor: { id: 'actor-b' }, document: { id: 'B' } };
    const exclusionManager = {
      isExcludedToken: jest.fn((token) => token === excludedToken),
    };
    const tokens = [
      { actor: { id: 'actor-a' }, document: { id: 'A' } },
      excludedToken,
    ];

    expect(getEligibleVisibilityTokenIds(tokens, exclusionManager)).toEqual(['A']);
    expect(exclusionManager.isExcludedToken).toHaveBeenCalledTimes(2);
  });
});

describe('VisibilityStateManager movement selection', () => {
  test('queues only the mover even when spatial analysis finds every nearby token', () => {
    const batchProcessor = jest.fn(async () => {});
    const spatialAnalyzer = jest.fn(() => [
      { document: { id: 'B' } },
      { document: { id: 'C' } },
    ]);
    const manager = new VisibilityStateManager({
      batchProcessor,
      spatialAnalyzer,
      systemStateProvider: {
        debug: jest.fn(),
        isDebugMode: jest.fn(() => false),
        isEnabled: jest.fn(() => true),
        shouldProcessEvents: jest.fn(() => true),
      },
    });

    manager.markTokenChangedWithSpatialOptimization(
      { id: 'A', name: 'Mover', x: 0, y: 0, width: 1, height: 1 },
      { x: 100, y: 100 },
    );

    expect(batchProcessor).toHaveBeenCalledWith(new Set(['A']));
    expect(spatialAnalyzer).not.toHaveBeenCalled();
  });
});
