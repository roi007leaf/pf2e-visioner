import '../../setup.js';

describe('CoverQuickOverrideDialog title/confirmLabel options', () => {
  test('defaults to the localized Roll label and unset window title override when no options given', async () => {
    const { CoverQuickOverrideDialog } = await import('../../../scripts/cover/QuickOverrideDialog.js');

    const dialog = new CoverQuickOverrideDialog('none', 'none');
    const html = await dialog._renderHTML({}, {});

    expect(dialog.title).toBeNull();
    expect(html).toContain('PF2E_VISIONER.UI.ROLL');
  });

  test('uses the provided title and confirmLabel when given', async () => {
    const { CoverQuickOverrideDialog } = await import('../../../scripts/cover/QuickOverrideDialog.js');

    const dialog = new CoverQuickOverrideDialog('standard', 'none', {
      title: "Set Cover — Aria's Stealth Roll",
      confirmLabel: 'Confirm',
    });
    const html = await dialog._renderHTML({}, {});

    expect(dialog.title).toBe("Set Cover — Aria's Stealth Roll");
    expect(dialog.options.window.title).toBe("Set Cover — Aria's Stealth Roll");
    expect(html).toContain('Confirm');
    expect(html).not.toContain('>PF2E_VISIONER.UI.ROLL<');
  });
});
