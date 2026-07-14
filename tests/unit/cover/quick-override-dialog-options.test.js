import '../../setup.js';

describe('CoverQuickOverrideDialog title/confirmLabel options', () => {
  test('defaults to the localized Roll label and no window title override when no options given', async () => {
    const { CoverQuickOverrideDialog } = await import('../../../scripts/cover/QuickOverrideDialog.js');

    const dialog = new CoverQuickOverrideDialog('none', 'none');
    const html = await dialog._renderHTML({}, {});

    expect(dialog.options.window?.title).toBeUndefined();
    expect(html).toContain('PF2E_VISIONER.UI.ROLL');
  });

  test('uses the provided title and confirmLabel when given', async () => {
    const { CoverQuickOverrideDialog } = await import('../../../scripts/cover/QuickOverrideDialog.js');

    const dialog = new CoverQuickOverrideDialog('standard', 'none', {
      title: "Set Cover — Aria's Stealth Roll",
      confirmLabel: 'Confirm',
    });
    const html = await dialog._renderHTML({}, {});

    expect(dialog.options.window.title).toBe("Set Cover — Aria's Stealth Roll");
    expect(html).toContain('Confirm');
    expect(html).not.toContain('>PF2E_VISIONER.UI.ROLL<');
  });

  test('resolves the pending promise to null when closed without clicking Roll or Cancel', async () => {
    const { CoverQuickOverrideDialog } = await import('../../../scripts/cover/QuickOverrideDialog.js');

    const dialog = new CoverQuickOverrideDialog('standard', 'none');
    const resolved = new Promise((resolve) => dialog.setResolver(resolve));

    await dialog.close();

    expect(await resolved).toBeNull();
  });

  test('_onRoll and _onCancel resolve only the instance bound via this, not a shared dialog', async () => {
    const { CoverQuickOverrideDialog } = await import('../../../scripts/cover/QuickOverrideDialog.js');

    const dialogA = new CoverQuickOverrideDialog('standard', 'none');
    const dialogB = new CoverQuickOverrideDialog('greater', 'none');

    const resolvedA = new Promise((resolve) => dialogA.setResolver(resolve));
    const resolvedB = new Promise((resolve) => dialogB.setResolver(resolve));

    CoverQuickOverrideDialog._onRoll.call(dialogB, {}, {});
    expect(await resolvedB).toBe('greater');

    CoverQuickOverrideDialog._onCancel.call(dialogA, {}, {});
    expect(await resolvedA).toBeNull();
  });

  test('gives each concurrently-open instance a distinct window id', async () => {
    const { CoverQuickOverrideDialog } = await import('../../../scripts/cover/QuickOverrideDialog.js');

    const dialogA = new CoverQuickOverrideDialog('standard', 'none');
    const dialogB = new CoverQuickOverrideDialog('greater', 'none');

    expect(dialogA.options.id).toBeTruthy();
    expect(dialogB.options.id).toBeTruthy();
    expect(dialogA.options.id).not.toBe(dialogB.options.id);
  });
});
