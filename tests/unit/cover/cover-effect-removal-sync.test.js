import '../../setup.js';

const MODULE_ID = 'pf2e-visioner';

function setTokenLookup(tokens) {
  global.canvas.tokens.placeables = tokens;
  global.canvas.tokens.get = jest.fn((id) => tokens.find((token) => token.id === id) || null);
}

describe('cover effect removal sync', () => {
  beforeEach(() => {
    jest.resetModules();
    global.game.user.isGM = true;
    global.canvas.tokens.placeables = [];
    global.canvas.tokens.get = jest.fn();
  });

  test('clears manual cover map entries when an aggregate cover effect is deleted', async () => {
    const observer = global.createMockToken({
      id: 'observer-token',
      actor: global.createMockActor({ id: 'observer-actor', signature: 'observer-signature' }),
      flags: {
        [MODULE_ID]: {
          cover: {
            'target-token': 'standard',
            'other-token': 'greater',
          },
        },
      },
    });
    const target = global.createMockToken({
      id: 'target-token',
      actor: global.createMockActor({ id: 'target-actor' }),
    });
    setTokenLookup([observer, target]);

    const deletedEffect = {
      id: 'standard-cover-effect',
      type: 'effect',
      parent: target.actor,
      flags: { [MODULE_ID]: { aggregateCover: true, coverState: 'standard' } },
      system: {
        rules: [
          { key: 'RollOption', domain: 'all', option: 'cover-against:observer-token' },
          {
            key: 'FlatModifier',
            selector: 'ac',
            predicate: ['origin:signature:observer-signature'],
          },
        ],
      },
    };

    const cleanup = await import('../../../scripts/cover/cleanup.js');

    expect(typeof cleanup.syncCoverMapsForDeletedCoverEffect).toBe('function');
    const result = await cleanup.syncCoverMapsForDeletedCoverEffect(deletedEffect);

    expect(result.changed).toBe(true);
    expect(result.tokenIds).toEqual(expect.arrayContaining(['observer-token', 'target-token']));
    expect(observer.document.update).toHaveBeenCalledWith(
      { [`flags.${MODULE_ID}.cover`]: { 'other-token': 'greater' } },
      { diff: false, render: false, animate: false },
    );
  });

  test('clears auto-cover map entries when a legacy ephemeral cover effect is deleted', async () => {
    const observer = global.createMockToken({
      id: 'observer-token',
      flags: {
        [MODULE_ID]: {
          autoCoverMap: {
            'target-token': 'greater',
          },
        },
      },
    });
    const target = global.createMockToken({
      id: 'target-token',
      actor: global.createMockActor({ id: 'target-actor' }),
    });
    setTokenLookup([observer, target]);

    const deletedEffect = {
      id: 'legacy-cover-effect',
      type: 'effect',
      parent: target.actor,
      flags: {
        [MODULE_ID]: {
          isEphemeralCover: true,
          observerTokenId: 'observer-token',
          coverState: 'greater',
        },
      },
      system: { rules: [] },
    };

    const cleanup = await import('../../../scripts/cover/cleanup.js');

    expect(typeof cleanup.syncCoverMapsForDeletedCoverEffect).toBe('function');
    const result = await cleanup.syncCoverMapsForDeletedCoverEffect(deletedEffect);

    expect(result.changed).toBe(true);
    expect(result.tokenIds).toEqual(expect.arrayContaining(['observer-token', 'target-token']));
    expect(observer.document.unsetFlag).toHaveBeenCalledWith(MODULE_ID, 'autoCoverMap');
  });
});
