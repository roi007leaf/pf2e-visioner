import '../../setup.js';

describe('Seek template Foundry v13 compatibility', () => {
  beforeEach(() => {
    game.settings.set('pf2e-visioner', 'seekUseTemplate', true);
    game.user.isGM = true;
    game.userId = 'player-1';
    game.messages = {
      get: jest.fn(),
    };
    game.combat = {
      started: true,
      combatants: new Map([['combatant-1', { id: 'combatant-1' }]]),
    };

    global.canvas.scene = {
      grid: { size: 100, distance: 5 },
      regions: [],
      templates: [],
    };
    global.canvas.grid = { size: 100, distance: 5 };
    global.canvas.templates = { placeables: [] };
  });

  function makeMeasuredTemplate({
    id = 'template-1',
    x = 250,
    y = 300,
    distance = 15,
    type = 'circle',
    flagsOnDocument = false,
  } = {}) {
    const flags = {
      'pf2e-visioner': {
        seekPreviewManual: true,
        messageId: 'message-1',
        actorTokenId: 'actor-token-1',
        userId: 'player-1',
      },
    };
    const document = {
      id,
      x,
      y,
      distance,
      t: type,
      flags,
      getFlag: jest.fn((scope, key) => flags?.[scope]?.[key]),
    };

    if (flagsOnDocument) {
      return {
        id,
        document,
        x,
        y,
        shape: { contains: jest.fn(() => true) },
      };
    }

    return document;
  }

  test('finds v13 measured templates from scene templates and reads their placement', async () => {
    const template = makeMeasuredTemplate();
    canvas.scene.templates = [template];

    const { findSeekTemplateDocument, getTemplateStateFromDocument } = await import(
      '../../../scripts/chat/services/preview/seek-template.js'
    );

    const found = findSeekTemplateDocument({
      messageId: 'message-1',
      actorId: 'actor-token-1',
      userId: 'player-1',
    });

    expect(found).toBe(template);
    expect(getTemplateStateFromDocument(found)).toEqual({
      center: { x: 250, y: 300 },
      radiusFeet: 15,
      templateType: 'circle',
      levels: [],
    });
  });

  test('finds v13 measured template placeables when flags live on the document', async () => {
    const placeable = makeMeasuredTemplate({ id: 'placeable-1', flagsOnDocument: true });
    canvas.templates.placeables = [placeable];

    const { findSeekTemplateDocument } = await import(
      '../../../scripts/chat/services/preview/seek-template.js'
    );

    expect(
      findSeekTemplateDocument({
        messageId: 'message-1',
        actorId: 'actor-token-1',
        userId: 'player-1',
      }),
    ).toBe(placeable);
  });

  test('buildSeekPanel treats v13 measured templates as existing seek templates', async () => {
    canvas.scene.templates = [makeMeasuredTemplate()];

    const { buildSeekPanel } = await import('../../../scripts/chat/ui/panel/seek.js');
    const panel = buildSeekPanel(
      { messageId: 'message-1', actor: { id: 'actor-token-1' } },
      { flags: {}, author: { isGM: true } },
    );

    expect(panel.actionButtonsHtml).toContain('data-action="remove-seek-template"');
  });

  test('setupSeekTemplate listens for v13 createMeasuredTemplate placement', async () => {
    game.user.isGM = false;
    game.userId = 'player-1';
    game.user.color = '#ff9800';
    game.settings.set('pf2e-visioner', 'seekTemplateSkipDialog', true);

    const message = {
      update: jest.fn(async () => {}),
      render: jest.fn(async () => {}),
      rolls: [],
    };
    game.messages = {
      get: jest.fn(() => message),
      has: jest.fn(() => true),
    };
    canvas.templates = {
      createPreview: jest.fn(),
      placeables: [],
    };
    canvas.tokens.placeables = [];

    const hookHandlers = {};
    Hooks.on.mockImplementation((name, handler) => {
      hookHandlers[name] = handler;
      return `${name}-hook`;
    });

    const actionData = {
      messageId: 'message-1',
      actor: { id: 'actor-token-1', center: { x: 0, y: 0 } },
      roll: { total: 23, dice: [{ total: 15 }] },
    };
    const measuredTemplate = makeMeasuredTemplate();

    const { setupSeekTemplate } = await import(
      '../../../scripts/chat/services/preview/seek-template.js'
    );
    const placementPromise = setupSeekTemplate(actionData, true);
    for (let i = 0; i < 5 && !hookHandlers.createRegion; i += 1) {
      await Promise.resolve();
    }

    const listensForMeasuredTemplates = typeof hookHandlers.createMeasuredTemplate === 'function';
    if (!listensForMeasuredTemplates && typeof hookHandlers.createRegion === 'function') {
      await hookHandlers.createRegion({
        id: 'region-1',
        shapes: [{ type: 'circle', x: 250, y: 300, radius: 300 }],
        levels: [],
        flags: measuredTemplate.flags,
        getFlag: jest.fn((scope, key) => {
          if (scope === 'core' && key === 'MeasuredTemplate') return true;
          return measuredTemplate.flags?.[scope]?.[key];
        }),
      });
      await placementPromise;
    }

    expect(listensForMeasuredTemplates).toBe(true);
    await hookHandlers.createMeasuredTemplate(measuredTemplate);
    await placementPromise;

    expect(message.update).toHaveBeenCalledWith({
      ['flags.pf2e-visioner.seekTemplate']: expect.objectContaining({
        center: { x: 250, y: 300 },
        radiusFeet: 15,
        templateType: 'circle',
        actorTokenId: 'actor-token-1',
      }),
    });
  });
});
