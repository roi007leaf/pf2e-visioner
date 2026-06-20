import '../../setup.js';

import { getMatchingControlledTokenForRefresh } from '../../../scripts/services/system-hidden-token-highlights.js';

describe('refreshToken controlled-token guard', () => {
  test('matches by document id before importing visual effect helpers', () => {
    const controlled = [
      { document: { id: 'A' } },
      { document: { id: 'B' } },
    ];

    expect(getMatchingControlledTokenForRefresh({ document: { id: 'C' } }, controlled)).toBeNull();
    expect(getMatchingControlledTokenForRefresh({ document: { id: 'B' } }, controlled)).toBe(
      controlled[1],
    );
  });
});
