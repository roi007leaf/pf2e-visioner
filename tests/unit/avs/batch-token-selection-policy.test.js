import {
  isMovementVisibilityBatch,
  resolveVisibleBatchTokens,
  shouldUseFullTokenScope,
} from '../../../scripts/visibility/auto-visibility/core/BatchTokenSelectionPolicy.js';

function token(id, extras = {}) {
  return {
    actor: {},
    document: { id },
    ...extras,
  };
}

describe('BatchTokenSelectionPolicy', () => {
  test('treats only active movement sessions as movement batches', () => {
    expect(
      isMovementVisibilityBatch({
        changedTokens: new Set(['A']),
        movementSession: { sessionId: 'movement-1' },
        lastMovedTokenId: null,
      }),
    ).toBe(true);

    expect(
      isMovementVisibilityBatch({
        changedTokens: new Set(['A']),
        movementSession: null,
        lastMovedTokenId: 'A',
      }),
    ).toBe(false);

    expect(
      isMovementVisibilityBatch({
        changedTokens: new Set(['A']),
        movementSession: null,
        lastMovedTokenId: 'stale-token',
      }),
    ).toBe(false);
  });

  test('filters excluded tokens and keeps only changed ids present in selected tokens', () => {
    const excluded = token('B');
    const exclusionManager = {
      isExcludedToken: jest.fn((candidate) => candidate === excluded),
    };

    const result = resolveVisibleBatchTokens({
      changedTokens: new Set(['A', 'B', 'C', 'outside-viewport']),
      candidateTokens: [token('A'), excluded, token('C'), token(null)],
      exclusionManager,
    });

    expect(result.allTokens.map((candidate) => candidate.document.id)).toEqual(['A', 'C', null]);
    expect(Array.from(result.visibleChangedTokens)).toEqual(['A', 'C']);
    expect(result.hasVisibleChangedTokens).toBe(true);
  });

  test('keeps defeated tokens in the universe as targets via isExcludedAsTarget', () => {
    const defeated = token('D');
    const exclusionManager = {
      isExcludedToken: jest.fn((candidate) => candidate === defeated),
      isExcludedAsTarget: jest.fn(() => false),
    };

    const result = resolveVisibleBatchTokens({
      changedTokens: new Set(['A', 'D']),
      candidateTokens: [token('A'), defeated],
      exclusionManager,
    });

    expect(result.allTokens.map((candidate) => candidate.document.id)).toEqual(['A', 'D']);
    expect(exclusionManager.isExcludedAsTarget).toHaveBeenCalled();
    expect(exclusionManager.isExcludedToken).not.toHaveBeenCalled();
  });

  test('falls back to isExcludedToken when isExcludedAsTarget is absent', () => {
    const excluded = token('B');
    const exclusionManager = {
      isExcludedToken: jest.fn((candidate) => candidate === excluded),
    };

    const result = resolveVisibleBatchTokens({
      changedTokens: new Set(['A', 'B']),
      candidateTokens: [token('A'), excluded],
      exclusionManager,
    });

    expect(result.allTokens.map((candidate) => candidate.document.id)).toEqual(['A']);
  });

  test('reports when no changed tokens survive selected token filtering', () => {
    const result = resolveVisibleBatchTokens({
      changedTokens: new Set(['outside-viewport']),
      candidateTokens: [token('A'), token('B')],
      exclusionManager: { isExcludedToken: jest.fn(() => false) },
    });

    expect(result.visibleChangedTokens.size).toBe(0);
    expect(result.hasVisibleChangedTokens).toBe(false);
  });

  test('uses full token scope for movement batches or when a full-scope recalc is forced', () => {
    expect(shouldUseFullTokenScope({ isMovementBatch: true, forceFullScope: false })).toBe(true);
    expect(shouldUseFullTokenScope({ isMovementBatch: false, forceFullScope: true })).toBe(true);
    expect(shouldUseFullTokenScope({ isMovementBatch: true, forceFullScope: true })).toBe(true);
    expect(shouldUseFullTokenScope({ isMovementBatch: false, forceFullScope: false })).toBe(false);
    expect(shouldUseFullTokenScope()).toBe(false);
  });
});
