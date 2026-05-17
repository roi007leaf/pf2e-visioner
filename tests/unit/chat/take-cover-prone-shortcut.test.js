describe('Take Cover prone shortcut preview flow', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    game.user.isGM = true;
  });

  it('applies prone-ranged-only Take Cover outcomes without opening the preview dialog', async () => {
    const actorToken = { id: 'actor-token', actor: { id: 'actor' } };
    const observer = { id: 'observer-token', actor: { id: 'observer' } };
    const outcome = {
      target: observer,
      oldCover: 'none',
      newCover: 'none',
      changed: true,
      takeCoverProneRangedOnly: true,
    };
    const applyOutcomesDirectly = jest.fn().mockResolvedValue(1);
    const render = jest.fn();
    const TakeCoverPreviewDialog = jest.fn(() => ({ render }));

    jest.doMock('../../../scripts/chat/services/actions/TakeCoverAction.js', () => ({
      TakeCoverActionHandler: jest.fn(() => ({
        discoverSubjects: jest.fn().mockResolvedValue([observer]),
        analyzeOutcome: jest.fn().mockResolvedValue(outcome),
        shouldApplyWithoutDialog: jest.fn(() => true),
        applyOutcomesDirectly,
      })),
    }));
    jest.doMock('../../../scripts/chat/dialogs/TakeCoverPreviewDialog.js', () => ({
      TakeCoverPreviewDialog,
    }));
    jest.doMock('../../../scripts/chat/services/infra/notifications.js', () => ({
      log: { error: jest.fn(), warn: jest.fn() },
    }));

    const { previewActionResults } = await import(
      '../../../scripts/chat/services/preview/preview-service.js'
    );

    await previewActionResults({ actionType: 'take-cover', actor: actorToken, actorToken });

    expect(applyOutcomesDirectly).toHaveBeenCalledWith(
      expect.objectContaining({ actionType: 'take-cover', actorToken }),
      [outcome],
    );
    expect(TakeCoverPreviewDialog).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
  });

  it('opens the preview dialog when Take Cover includes regular cover changes', async () => {
    const actorToken = { id: 'actor-token', actor: { id: 'actor' } };
    const observer = { id: 'observer-token', actor: { id: 'observer' } };
    const outcome = {
      target: observer,
      oldCover: 'standard',
      newCover: 'greater',
      changed: true,
      takeCoverProneRangedOnly: false,
    };
    const applyOutcomesDirectly = jest.fn();
    const render = jest.fn();
    const TakeCoverPreviewDialog = jest.fn(() => ({ render }));

    jest.doMock('../../../scripts/chat/services/actions/TakeCoverAction.js', () => ({
      TakeCoverActionHandler: jest.fn(() => ({
        discoverSubjects: jest.fn().mockResolvedValue([observer]),
        analyzeOutcome: jest.fn().mockResolvedValue(outcome),
        shouldApplyWithoutDialog: jest.fn(() => false),
        applyOutcomesDirectly,
      })),
    }));
    jest.doMock('../../../scripts/chat/dialogs/TakeCoverPreviewDialog.js', () => ({
      TakeCoverPreviewDialog,
    }));
    jest.doMock('../../../scripts/chat/services/infra/notifications.js', () => ({
      log: { error: jest.fn(), warn: jest.fn() },
    }));

    const { previewActionResults } = await import(
      '../../../scripts/chat/services/preview/preview-service.js'
    );

    await previewActionResults({ actionType: 'take-cover', actor: actorToken, actorToken });

    expect(applyOutcomesDirectly).not.toHaveBeenCalled();
    expect(TakeCoverPreviewDialog).toHaveBeenCalledWith(
      actorToken,
      [outcome],
      [outcome],
      expect.objectContaining({ actionType: 'take-cover', actorToken }),
    );
    expect(render).toHaveBeenCalledWith(true);
  });

  it('routes player Take Cover preview to the GM without opening or applying locally', async () => {
    game.user.isGM = false;

    const actorToken = { id: 'actor-token', actor: { id: 'actor' } };
    const requestGMOpenTakeCover = jest.fn(() => true);
    const applyOutcomesDirectly = jest.fn();
    const render = jest.fn();
    const TakeCoverPreviewDialog = jest.fn(() => ({ render }));

    jest.doMock('../../../scripts/services/socket.js', () => ({
      requestGMOpenTakeCover,
    }));
    jest.doMock('../../../scripts/chat/services/actions/TakeCoverAction.js', () => ({
      TakeCoverActionHandler: jest.fn(() => ({
        discoverSubjects: jest.fn(),
        analyzeOutcome: jest.fn(),
        shouldApplyWithoutDialog: jest.fn(),
        applyOutcomesDirectly,
      })),
    }));
    jest.doMock('../../../scripts/chat/dialogs/TakeCoverPreviewDialog.js', () => ({
      TakeCoverPreviewDialog,
    }));

    const { previewActionResults } = await import(
      '../../../scripts/chat/services/preview/preview-service.js'
    );

    await previewActionResults({
      actionType: 'take-cover',
      actor: actorToken,
      actorToken,
      message: { id: 'message-1' },
    });

    expect(requestGMOpenTakeCover).toHaveBeenCalledWith('actor-token', 'message-1');
    expect(applyOutcomesDirectly).not.toHaveBeenCalled();
    expect(TakeCoverPreviewDialog).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();

  });

  it('applies directly when the actor is prone even if regular cover outcomes are present', async () => {
    const actorToken = { id: 'actor-token', isProne: true, actor: { id: 'actor' } };
    const observer = { id: 'observer-token', actor: { id: 'observer' } };
    const outcome = {
      target: observer,
      oldCover: 'standard',
      newCover: 'greater',
      changed: true,
      takeCoverProneRangedOnly: false,
    };
    const applyOutcomesDirectly = jest.fn().mockResolvedValue(1);
    const render = jest.fn();
    const TakeCoverPreviewDialog = jest.fn(() => ({ render }));

    jest.doMock('../../../scripts/chat/services/actions/TakeCoverAction.js', () => {
      const Actual = jest.requireActual(
        '../../../scripts/chat/services/actions/TakeCoverAction.js',
      );
      return {
        TakeCoverActionHandler: jest.fn(() => {
          const handler = new Actual.TakeCoverActionHandler();
          handler.discoverSubjects = jest.fn().mockResolvedValue([observer]);
          handler.analyzeOutcome = jest.fn().mockResolvedValue(outcome);
          handler.applyOutcomesDirectly = applyOutcomesDirectly;
          return handler;
        }),
      };
    });
    jest.doMock('../../../scripts/chat/dialogs/TakeCoverPreviewDialog.js', () => ({
      TakeCoverPreviewDialog,
    }));
    jest.doMock('../../../scripts/chat/services/infra/notifications.js', () => ({
      log: { error: jest.fn(), warn: jest.fn() },
    }));

    const { previewActionResults } = await import(
      '../../../scripts/chat/services/preview/preview-service.js'
    );

    await previewActionResults({ actionType: 'take-cover', actor: actorToken, actorToken });

    expect(applyOutcomesDirectly).toHaveBeenCalledWith(
      expect.objectContaining({ actionType: 'take-cover', actorToken }),
      [outcome],
    );
    expect(TakeCoverPreviewDialog).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
  });

  it('does not open the preview dialog when a prone actor already has the prone ranged Take Cover effect', async () => {
    const actorToken = {
      id: 'actor-token',
      isProne: true,
      actor: {
        id: 'actor',
        itemTypes: {
          effect: [
            {
              id: 'effect-1',
              flags: { 'pf2e-visioner': { takeCoverProneRangedOnly: true } },
            },
          ],
        },
      },
    };
    const observer = { id: 'observer-token', actor: { id: 'observer' } };
    const outcome = {
      target: observer,
      oldCover: 'standard',
      newCover: 'greater',
      changed: true,
      takeCoverProneRangedOnly: false,
    };
    const applyOutcomesDirectly = jest.fn();
    const render = jest.fn();
    const TakeCoverPreviewDialog = jest.fn(() => ({ render }));
    const notifyWarn = jest.fn();

    jest.doMock('../../../scripts/chat/services/actions/TakeCoverAction.js', () => {
      const Actual = jest.requireActual(
        '../../../scripts/chat/services/actions/TakeCoverAction.js',
      );
      return {
        TakeCoverActionHandler: jest.fn(() => {
          const handler = new Actual.TakeCoverActionHandler();
          handler.discoverSubjects = jest.fn().mockResolvedValue([observer]);
          handler.analyzeOutcome = jest.fn().mockResolvedValue(outcome);
          handler.applyOutcomesDirectly = applyOutcomesDirectly;
          return handler;
        }),
      };
    });
    jest.doMock('../../../scripts/chat/dialogs/TakeCoverPreviewDialog.js', () => ({
      TakeCoverPreviewDialog,
    }));
    jest.doMock('../../../scripts/chat/services/infra/notifications.js', () => ({
      notify: { warn: notifyWarn },
      log: { error: jest.fn(), warn: jest.fn() },
    }));

    const { previewActionResults } = await import(
      '../../../scripts/chat/services/preview/preview-service.js'
    );

    await previewActionResults({ actionType: 'take-cover', actor: actorToken, actorToken });

    expect(applyOutcomesDirectly).not.toHaveBeenCalled();
    expect(TakeCoverPreviewDialog).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
    expect(notifyWarn).toHaveBeenCalledWith(expect.stringContaining('already has Take Cover'));
  });
});
