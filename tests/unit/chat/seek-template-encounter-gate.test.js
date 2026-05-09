import '../../setup.js';

describe('Seek template encounter gate', () => {
  beforeEach(() => {
    game.user.isGM = true;
    game.settings.set('pf2e-visioner', 'seekUseTemplate', true);
    game.combat = null;
  });

  test('does not wait for player Seek template outside encounter', async () => {
    const { shouldWaitForPlayerSeekTemplate } = await import(
      '../../../scripts/chat/ui/event-binder.js'
    );

    const shouldWait = shouldWaitForPlayerSeekTemplate({
      message: { author: { isGM: false } },
      pending: null,
      fallbackTemplate: null,
    });

    expect(shouldWait).toBe(false);
  });

  test('waits for player Seek template only during encounter template mode', async () => {
    game.combat = { started: true, combatants: new Map([['c1', {}]]) };
    const { shouldWaitForPlayerSeekTemplate } = await import(
      '../../../scripts/chat/ui/event-binder.js'
    );

    const shouldWait = shouldWaitForPlayerSeekTemplate({
      message: { author: { isGM: false } },
      pending: null,
      fallbackTemplate: null,
    });

    expect(shouldWait).toBe(true);
  });
});
