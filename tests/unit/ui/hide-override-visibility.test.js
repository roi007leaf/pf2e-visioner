jest.mock('../../../scripts/visibility/perception-profile.js', () => ({
  overrideToDisplayVisibility: jest.fn((flag) => flag?.visibility ?? null),
}));

import {
  getHideOverrideVisibility,
  getHideOverrideVisibilityForActor,
  getTokensForActor,
} from '../../../scripts/chat/dialogs/Hide/hide-override-visibility.js';

describe('hide override visibility lookup', () => {
  test('collects tokens for the hiding actor', () => {
    const tokens = [
      { id: 'a', actor: { id: 'actor-1' } },
      { id: 'b', actor: { id: 'actor-2' } },
      { id: 'c', actor: { id: 'actor-1' } },
    ];

    expect(getTokensForActor('actor-1', tokens).map((token) => token.id)).toEqual(['a', 'c']);
  });

  test('returns first display visibility for observer override', () => {
    const hidingTokens = [
      { document: { flags: { 'pf2e-visioner': {} } } },
      {
        document: {
          flags: { 'pf2e-visioner': { 'avs-override-from-observer': { visibility: 'hidden' } } },
        },
      },
    ];

    expect(getHideOverrideVisibility(hidingTokens, 'observer')).toBe('hidden');
  });

  test('resolves actor tokens before reading observer override', () => {
    const tokens = [
      {
        actor: { id: 'hider' },
        document: {
          flags: { 'pf2e-visioner': { 'avs-override-from-observer': { visibility: 'undetected' } } },
        },
      },
    ];

    expect(getHideOverrideVisibilityForActor('hider', 'observer', tokens)).toBe('undetected');
  });
});
