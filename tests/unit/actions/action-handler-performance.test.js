import '../../setup.js';

describe('action handler hot path performance', () => {
  beforeEach(() => {
    jest.resetModules();
    global.canvas.tokens.placeables = [];
    global.canvas.tokens.controlled = [];
    global.game.messages = { get: jest.fn() };
  });

  afterEach(() => {
    jest.dontMock('../../../scripts/utils.js');
    jest.resetModules();
  });

  test('Point Out reuses discovery visibility during outcome analysis', async () => {
    const getVisibilityBetween = jest.fn(() => 'hidden');
    jest.doMock('../../../scripts/utils.js', () => ({
      __esModule: true,
      getVisibilityBetween,
    }));

    const { PointOutActionHandler } = await import(
      '../../../scripts/chat/services/actions/PointOutAction.js'
    );

    const pointer = createMockToken({ id: 'pointer' });
    const ally1 = createMockToken({ id: 'ally-1' });
    const ally2 = createMockToken({ id: 'ally-2' });
    const target = createMockToken({ id: 'target' });
    pointer.document.disposition = 1;
    ally1.document.disposition = 1;
    ally2.document.disposition = 1;
    target.document.disposition = -1;
    global.canvas.tokens.placeables = [pointer, ally1, ally2, target];
    global.game.messages.get = jest.fn(() => ({
      speaker: { token: 'pointer' },
      flags: { pf2e: { target: { token: 'target' } } },
    }));

    const handler = new PointOutActionHandler();
    const subjects = await handler.discoverSubjects({ messageId: 'message-1', actor: pointer });
    for (const subject of subjects) {
      await handler.analyzeOutcome({}, subject);
    }

    expect(subjects).toHaveLength(2);
    expect(getVisibilityBetween).toHaveBeenCalledTimes(2);
  });

  test('Consequences reuses discovery visibility during outcome analysis', async () => {
    const getVisibilityBetween = jest.fn(() => 'hidden');
    jest.doMock('../../../scripts/utils.js', () => ({
      __esModule: true,
      getVisibilityBetween,
    }));

    const { ConsequencesActionHandler } = await import(
      '../../../scripts/chat/services/actions/ConsequencesAction.js'
    );

    const attacker = createMockToken({ id: 'attacker' });
    const observer1 = createMockToken({ id: 'observer-1' });
    const observer2 = createMockToken({ id: 'observer-2' });
    global.canvas.tokens.placeables = [attacker, observer1, observer2];

    const handler = new ConsequencesActionHandler();
    const actionData = { messageId: 'message-1', actor: attacker };
    const subjects = await handler.discoverSubjects(actionData);
    for (const subject of subjects) {
      await handler.analyzeOutcome(actionData, subject);
    }

    expect(subjects).toHaveLength(2);
    expect(getVisibilityBetween).toHaveBeenCalledTimes(2);
  });
});
