const PERCEPTIVE_MODULE_ID = 'perceptive';
const PERCEPTIVE_CONFLICT_BANNER_ID = 'pf2e-visioner-perceptive-conflict';

async function promptWorldReload() {
  const settingsConfig = foundry?.applications?.settings?.SettingsConfig;
  if (typeof settingsConfig?.reloadConfirm === 'function') {
    await settingsConfig.reloadConfirm({ world: true });
    return;
  }

  globalThis.location?.reload?.();
}

export async function disablePerceptive(options = {}) {
  if (!game?.user?.isGM || !game?.modules?.get?.(PERCEPTIVE_MODULE_ID)?.active) return false;

  const current = game.settings.get('core', 'moduleConfiguration') || {};
  await game.settings.set('core', 'moduleConfiguration', {
    ...current,
    [PERCEPTIVE_MODULE_ID]: false,
  });

  await (options.reload || promptWorldReload)();
  return true;
}

export function showPerceptiveConflictBanner(root = document.body) {
  const existing = document.getElementById(PERCEPTIVE_CONFLICT_BANNER_ID);
  const hasConflict = game?.user?.isGM && game?.modules?.get?.(PERCEPTIVE_MODULE_ID)?.active;

  if (!hasConflict) {
    existing?.remove();
    return false;
  }
  if (existing) return true;
  if (!root?.append) return false;

  const banner = document.createElement('aside');
  banner.id = PERCEPTIVE_CONFLICT_BANNER_ID;
  banner.className = 'pf2e-visioner-module-conflict-banner';
  banner.setAttribute('role', 'alert');
  banner.setAttribute('aria-live', 'assertive');

  const icon = document.createElement('i');
  icon.className = 'fa-solid fa-triangle-exclamation';
  icon.setAttribute('aria-hidden', 'true');

  const message = document.createElement('span');
  message.textContent = game.i18n.localize('PF2E_VISIONER.NOTIFICATIONS.PERCEPTIVE_CONFLICT');

  const disableButton = document.createElement('button');
  disableButton.type = 'button';
  disableButton.dataset.action = 'disable-perceptive';
  disableButton.textContent = game.i18n.localize('PF2E_VISIONER.NOTIFICATIONS.DISABLE_PERCEPTIVE');
  disableButton.addEventListener('click', async () => {
    disableButton.disabled = true;
    try {
      await disablePerceptive();
      disableButton.disabled = false;
    } catch (error) {
      disableButton.disabled = false;
      console.error('PF2E Visioner | Failed to disable Perceptive:', error);
      ui.notifications.error(
        game.i18n.localize('PF2E_VISIONER.NOTIFICATIONS.DISABLE_PERCEPTIVE_FAILED'),
      );
    }
  });

  banner.append(icon, message, disableButton);
  root.append(banner);
  return true;
}
