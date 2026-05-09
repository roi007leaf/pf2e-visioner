import '../../setup.js';

describe('Seek panel exploration mode', () => {
  beforeEach(() => {
    game.user.isGM = true;
    game.settings.set('pf2e-visioner', 'seekUseTemplate', true);
    game.messages = {
      get: jest.fn(),
    };
    game.combat = null;
    global.canvas.scene = {
      grid: { size: 100, distance: 5 },
      regions: [],
      templates: [],
    };
    global.canvas.templates = { placeables: [] };
  });

  test('does not show setup template outside encounter', async () => {
    const { buildSeekPanel } = await import('../../../scripts/chat/ui/panel/seek.js');

    const panel = buildSeekPanel(
      { messageId: 'message-1', actor: { id: 'actor-token-1' } },
      { id: 'message-1', flags: {}, author: { isGM: true } },
    );

    expect(panel.actionButtonsHtml).not.toContain('setup-seek-template');
    expect(panel.actionButtonsHtml).toContain('open-seek-results');
  });

  test('Search exploration rolls only show open results', async () => {
    const { buildSeekPanel } = await import('../../../scripts/chat/ui/panel/seek.js');

    const panel = buildSeekPanel(
      { messageId: 'message-1', actor: { id: 'actor-token-1' }, searchExploration: true },
      { id: 'message-1', flags: {}, author: { isGM: true } },
    );

    expect(panel.actionButtonsHtml).toContain('open-seek-results');
    expect(panel.actionButtonsHtml).not.toContain('setup-seek-template');
    expect(panel.actionButtonsHtml).not.toContain('apply-now-seek');
  });
});
