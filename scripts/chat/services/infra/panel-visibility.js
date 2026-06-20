import { checkForValidTargets } from '../infra/target-checker.js';

/**
 * Decide whether to inject the automation panel for a given message/action
 * Returns true when the panel should be injected for the current user.
 */
export function shouldInjectPanel(message, actionData) {
  try {
    const isGM = !!game.user?.isGM;
    const hasValidTargets = checkForValidTargets(actionData);

    // Always show Point Out panels for GM (target detection can be flaky)
    if (actionData.actionType === 'point-out' && isGM) {
      return true;
    }

    // Always show for GM even if targets cannot be computed yet (e.g., canvas not ready)
    if (!hasValidTargets) {
      if (isGM) {
        return true;
      }

      // Allow players for Seek when template mode is enabled
      if (
        actionData.actionType === 'seek' &&
        game.settings.get('pf2e-visioner', 'seekUseTemplate')
      ) {
        return true;
      }

      // Allow players for Sneak so they can press "Start Sneak"
      if (actionData.actionType === 'sneak') {
        return true;
      }

      return false;
    }

    // Special pending flags: Seek template and Point Out handoff
    if (actionData.actionType === 'seek' && isGM) {
      const pending = message?.flags?.['pf2e-visioner']?.seekTemplate;
      if (pending && pending.hasTargets === false) {
        return false;
      }
    }
    return true;
  } catch {
    // On any unexpected error, default to showing the panel for GM only
    return !!game.user?.isGM;
  }
}
