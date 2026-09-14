import '../../setup.js';

const mockIsPrimaryGM = jest.fn();
jest.mock('../../../scripts/services/gm-election.js', () => ({
  isPrimaryGM: () => mockIsPrimaryGM(),
}));

describe('Deleted token effect authority', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    game.user.isGM = true;
    mockIsPrimaryGM.mockReturnValue(false);
  });

  test.each(['visibility', 'cover'])('secondary GM cannot delete %s effects', async kind => {
    const actor = {
      id: 'survivor',
      itemTypes: { effect: [{ id: 'effect', flags: { 'pf2e-visioner': {
        [kind === 'cover' ? 'cover' : 'offGuard']: true, observerToken: 'deleted',
      } } }] },
      items: { has: () => true },
      deleteEmbeddedDocuments: jest.fn(), updateEmbeddedDocuments: jest.fn(),
    };
    canvas.tokens.placeables = [{ id: 'survivor', actor }];
    const fn = kind === 'cover'
      ? (await import('../../../scripts/cover/cleanup.js')).cleanupDeletedTokenCoverEffects
      : (await import('../../../scripts/visibility/cleanup.js')).cleanupDeletedTokenEffects;
    await fn({ id: 'deleted', actor: { id: 'deleted-actor' } });
    expect(actor.deleteEmbeddedDocuments).not.toHaveBeenCalled();
    expect(actor.updateEmbeddedDocuments).not.toHaveBeenCalled();
  });
});
