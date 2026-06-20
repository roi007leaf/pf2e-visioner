describe('hide dialog actions', () => {
  test('per-row apply uses dialog AVS helper for matching manual overrides', async () => {
    const { isHideDialogChangeActionable } = await import(
      '../../../scripts/chat/dialogs/Hide/hide-dialog-actions.js'
    );

    const app = { isOldStateAvsControlled: jest.fn(() => true) };
    const outcome = { oldVisibility: 'hidden' };

    expect(isHideDialogChangeActionable(app, outcome, 'hidden')).toBe(true);
    expect(app.isOldStateAvsControlled).toHaveBeenCalledWith(outcome);
  });

  test('per-row apply ignores matching states when AVS is not controlling old state', async () => {
    const { isHideDialogChangeActionable } = await import(
      '../../../scripts/chat/dialogs/Hide/hide-dialog-actions.js'
    );

    const app = { isOldStateAvsControlled: jest.fn(() => false) };

    expect(isHideDialogChangeActionable(app, { oldVisibility: 'hidden' }, 'hidden')).toBe(false);
    expect(isHideDialogChangeActionable(app, { oldVisibility: 'observed' }, 'hidden')).toBe(true);
  });
});
