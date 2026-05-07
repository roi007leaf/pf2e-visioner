describe('Take Cover prone shortcut preview flow', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
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
});
