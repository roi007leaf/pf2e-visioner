import { getEligibleVisibilityTokenIds } from '../../../scripts/visibility/auto-visibility/core/VisibilityStateManager.js';

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
