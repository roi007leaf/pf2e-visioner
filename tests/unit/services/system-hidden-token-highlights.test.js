import '../../setup.js';

import {
  buildMovedTokenHighlightRequests,
  getMatchingControlledTokenForRefresh,
  refreshSystemHiddenHighlightsForMovedToken,
  refreshSystemHiddenHighlightsForRenderedToken,
} from '../../../scripts/services/system-hidden-token-highlights.js';

function makeToken(id) {
  return {
    document: {
      id,
    },
  };
}

describe('system-hidden token highlight service', () => {
  test('builds position override requests for controlled tokens when a token moves', () => {
    const movedTokenDoc = { id: 'moved', x: 100, y: 200 };
    const controlledTokens = [makeToken('moved'), makeToken('other')];

    expect(
      buildMovedTokenHighlightRequests(movedTokenDoc, { x: 150 }, controlledTokens),
    ).toEqual([
      {
        tokenId: 'moved',
        positionOverride: { x: 150, y: 200 },
      },
      {
        tokenId: 'other',
        positionOverride: null,
      },
    ]);
  });

  test('does not build requests for non-position token updates', () => {
    expect(
      buildMovedTokenHighlightRequests({ id: 'moved', x: 100, y: 200 }, { name: 'New' }, [
        makeToken('moved'),
      ]),
    ).toEqual([]);
  });

  test('refreshes controlled token highlights for movement with one visual-effects import', async () => {
    const updateSystemHiddenTokenHighlights = jest.fn().mockResolvedValue(undefined);

    const result = await refreshSystemHiddenHighlightsForMovedToken(
      { id: 'moved', x: 100, y: 200 },
      { y: 250 },
      {
        getControlledTokens: () => [makeToken('moved'), makeToken('other')],
        loadVisualEffects: jest.fn(async () => ({ updateSystemHiddenTokenHighlights })),
      },
    );

    expect(updateSystemHiddenTokenHighlights).toHaveBeenCalledWith('moved', { x: 100, y: 250 });
    expect(updateSystemHiddenTokenHighlights).toHaveBeenCalledWith('other', null);
    expect(result.refreshed).toBe(2);
  });

  test('matches refreshToken events by document id before importing visual effects', () => {
    const controlled = [makeToken('A'), makeToken('B')];

    expect(getMatchingControlledTokenForRefresh({ document: { id: 'C' } }, controlled)).toBeNull();
    expect(getMatchingControlledTokenForRefresh({ document: { id: 'B' } }, controlled)).toBe(
      controlled[1],
    );
  });

  test('refreshes only the matching controlled token for refreshToken', async () => {
    const updateSystemHiddenTokenHighlights = jest.fn().mockResolvedValue(undefined);
    const loadVisualEffects = jest.fn(async () => ({ updateSystemHiddenTokenHighlights }));

    const result = await refreshSystemHiddenHighlightsForRenderedToken(
      { document: { id: 'B' } },
      {
        getControlledTokens: () => [makeToken('A'), makeToken('B')],
        loadVisualEffects,
      },
    );

    expect(loadVisualEffects).toHaveBeenCalledTimes(1);
    expect(updateSystemHiddenTokenHighlights).toHaveBeenCalledWith('B');
    expect(result.refreshed).toBe(true);
  });

  test('does not import visual effects when refreshToken has no matching controlled token', async () => {
    const loadVisualEffects = jest.fn();

    const result = await refreshSystemHiddenHighlightsForRenderedToken(
      { document: { id: 'C' } },
      {
        getControlledTokens: () => [makeToken('A')],
        loadVisualEffects,
      },
    );

    expect(loadVisualEffects).not.toHaveBeenCalled();
    expect(result.refreshed).toBe(false);
  });
});
