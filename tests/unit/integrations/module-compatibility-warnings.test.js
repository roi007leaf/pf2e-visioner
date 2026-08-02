import {
  disablePerceptive,
  showPerceptiveConflictBanner,
} from '../../../scripts/integrations/module-compatibility-warnings.js';

describe('module compatibility warnings', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    game.user.isGM = true;
    game.modules.get = jest.fn((id) => ({ active: id === 'perceptive' }));
    game.settings.get = jest.fn(() => ({
      'pf2e-visioner': true,
      perceptive: true,
      socketlib: true,
    }));
    game.settings.set = jest.fn().mockResolvedValue(undefined);
  });

  it('shows a non-dismissible warning banner to GMs when Perceptive is active', () => {
    expect(showPerceptiveConflictBanner()).toBe(true);
    expect(game.i18n.localize).toHaveBeenCalledWith(
      'PF2E_VISIONER.NOTIFICATIONS.PERCEPTIVE_CONFLICT',
    );
    expect(document.getElementById('pf2e-visioner-perceptive-conflict').textContent).toContain(
      'PF2E_VISIONER.NOTIFICATIONS.PERCEPTIVE_CONFLICT',
    );
    expect(document.querySelector('[data-action="disable-perceptive"]')).not.toBeNull();
    expect(ui.notifications.warn).not.toHaveBeenCalled();
  });

  it('disables only Perceptive and requests a world reload', async () => {
    const reload = jest.fn().mockResolvedValue(undefined);

    await expect(disablePerceptive({ reload })).resolves.toBe(true);

    expect(game.settings.set).toHaveBeenCalledWith('core', 'moduleConfiguration', {
      'pf2e-visioner': true,
      perceptive: false,
      socketlib: true,
    });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('wires the disable button to Foundry world reload confirmation', async () => {
    const reloadConfirm = jest.fn().mockResolvedValue(undefined);
    foundry.applications.settings = { SettingsConfig: { reloadConfirm } };
    showPerceptiveConflictBanner();

    const button = document.querySelector('[data-action="disable-perceptive"]');
    button.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(game.settings.set).toHaveBeenCalledWith(
      'core',
      'moduleConfiguration',
      expect.objectContaining({ perceptive: false }),
    );
    expect(reloadConfirm).toHaveBeenCalledWith({ world: true });
  });

  it('does not create duplicate banners', () => {
    showPerceptiveConflictBanner();
    showPerceptiveConflictBanner();

    expect(document.querySelectorAll('#pf2e-visioner-perceptive-conflict')).toHaveLength(1);
  });

  it('does not warn when Perceptive is inactive', () => {
    game.modules.get = jest.fn(() => ({ active: false }));

    expect(showPerceptiveConflictBanner()).toBe(false);
    expect(document.getElementById('pf2e-visioner-perceptive-conflict')).toBeNull();
  });

  it('does not warn players', () => {
    game.user.isGM = false;

    expect(showPerceptiveConflictBanner()).toBe(false);
    expect(document.getElementById('pf2e-visioner-perceptive-conflict')).toBeNull();
  });
});
