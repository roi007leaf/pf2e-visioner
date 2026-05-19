import { MODULE_ID } from '../../../../constants.js';

async function restoreSneakSpeed(token, deps) {
  try {
    const service =
      deps.sneakSpeedService ||
      (await import('../../SneakSpeedService.js')).SneakSpeedService;
    await service.restoreSneakWalkSpeed(token);
  } catch (error) {
    console.warn('PF2E Visioner | Failed to restore sneak walk speed:', error);
  }
}

export async function clearSneakFlag(actionData, deps = {}) {
  try {
    const getSetting =
      deps.getSetting || ((key) => game.settings?.get?.(MODULE_ID, key));
    const avsEnabled = getSetting('autoVisibilityEnabled') ?? false;
    const sneakingToken = actionData?.sneakingToken;
    if (!sneakingToken || !avsEnabled) return;

    await sneakingToken.document.unsetFlag(MODULE_ID, 'sneak-active');
    await restoreSneakSpeed(sneakingToken, deps);
  } catch (error) {
    console.error('PF2E Visioner | Error clearing sneak flag:', error);
  }
}
