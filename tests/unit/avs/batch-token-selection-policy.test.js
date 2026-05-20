import {
  isMovementVisibilityBatch,
  resolveVisibleBatchTokens,
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

  test('reports when no changed tokens survive selected token filtering', () => {
    const result = resolveVisibleBatchTokens({
      changedTokens: new Set(['outside-viewport']),
      candidateTokens: [token('A'), token('B')],
      exclusionManager: { isExcludedToken: jest.fn(() => false) },
    });

    expect(result.visibleChangedTokens.size).toBe(0);
    expect(result.hasVisibleChangedTokens).toBe(false);
  });
});
