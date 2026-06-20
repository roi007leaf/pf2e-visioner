import '../../setup.js';

describe('automation panel visibility', () => {
  beforeEach(() => {
    game.user.isGM = false;
    game.settings.set('pf2e-visioner', 'seekUseTemplate', true);
    game.combat = null;
    global.canvas.tokens = { placeables: [] };
  });

  test('allows player Seek panel in template mode even before targets are known', async () => {
    const { shouldInjectPanel } = await import(
      '../../../scripts/chat/services/infra/panel-visibility.js'
    );

    expect(
      shouldInjectPanel(
        { id: 'message-1', flags: {}, author: { id: game.user.id, isGM: false } },
        { actionType: 'seek', actor: { id: 'seeker' } },
      ),
    ).toBe(true);
  });
});
