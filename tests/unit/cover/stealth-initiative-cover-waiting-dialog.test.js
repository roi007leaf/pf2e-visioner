import '../../setup.js';

describe('StealthInitiativeCoverWaitingDialog', () => {
  test('renders the waiting message with no interactive controls', async () => {
    const { StealthInitiativeCoverWaitingDialog } = await import(
      '../../../scripts/cover/StealthInitiativeCoverWaitingDialog.js'
    );

    const dialog = new StealthInitiativeCoverWaitingDialog();
    const html = await dialog._renderHTML({}, {});

    expect(html).toContain('PF2E_VISIONER.UI.STEALTH_INITIATIVE_COVER_WAITING');
    expect(html).not.toContain('data-action');
    expect(html).not.toContain('<button');
  });

  test('uses the localized waiting title in the window options', async () => {
    const { StealthInitiativeCoverWaitingDialog } = await import(
      '../../../scripts/cover/StealthInitiativeCoverWaitingDialog.js'
    );

    expect(StealthInitiativeCoverWaitingDialog.DEFAULT_OPTIONS.window.title).toBe(
      'PF2E_VISIONER.DIALOG_TITLES.STEALTH_INITIATIVE_COVER_WAITING',
    );
  });
});
