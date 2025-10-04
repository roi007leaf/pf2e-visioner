/**
 * Tooltip helpers split from HoverTooltips.js to reduce file size and improve cohesion.
 */

import { MODULE_ID } from '../constants.js';

/**
 * Compute font/icon/border sizes based on a setting value (preset string or number).
 */
export function computeSizesFromSetting(rawValue) {
  try {
    if (typeof rawValue === 'string') {
      switch (rawValue) {
        case 'tiny':
          return { fontPx: 12, iconPx: 10, borderPx: 2 };
        case 'small':
          return { fontPx: 14, iconPx: 12, borderPx: 2 };
        case 'large':
          return { fontPx: 18, iconPx: 20, borderPx: 4 };
        case 'xlarge':
          return { fontPx: 20, iconPx: 24, borderPx: 5 };
        case 'medium':
        default:
          return { fontPx: 16, iconPx: 16, borderPx: 3 };
      }
    }
    const numeric = Number(rawValue);
    if (!Number.isNaN(numeric) && numeric > 0) {
      const fontPx = Math.round(numeric);
      const iconPx = Math.max(Math.round(numeric), 12);
      const borderPx = Math.max(2, Math.round(numeric / 8));
      return { fontPx, iconPx, borderPx };
    }
  } catch (_) {}
  return { fontPx: 16, iconPx: 16, borderPx: 3 };
}

/**
 * Check whether tooltips should be shown for the current user and token in a given mode.
 * @param {string} [mode='target'] - The tooltip mode to check ('target' or 'observer')
 * @param {Token} [hoveredToken=null] - The token being hovered (optional)
 * @param {boolean} [isKeyboardTooltip=false] - Whether this is for keyboard tooltips (Alt/O key) which ignore hover settings
 */
export function canShowTooltips(mode = 'target', hoveredToken = null, isKeyboardTooltip = false) {
  // Keyboard tooltips (Alt/O key) work regardless of hover tooltip settings
  if (isKeyboardTooltip) {
    if (game.user.isGM) {
      return true; // GMs can always use keyboard tooltips
    }
    // For players, still need basic tooltip permissions enabled
    const result =
      game.settings.get(MODULE_ID, 'enableHoverTooltips') &&
      game.settings.get(MODULE_ID, 'allowPlayerTooltips');
    return result;
  }

  // For regular hover tooltips, check all the settings
  if (game.user.isGM) {
    // GMs need hover tooltips enabled for hover behavior
    return game.settings.get(MODULE_ID, 'enableHoverTooltips');
  }

  // For players, first check if hover tooltips are enabled at all
  if (!game.settings.get(MODULE_ID, 'enableHoverTooltips')) {
    return false;
  }

  // For players, check if player tooltips are allowed
  if (!game.settings.get(MODULE_ID, 'allowPlayerTooltips')) {
    return false;
  }

  // Special case: Observer mode (O key) is ALWAYS allowed for players
  if (mode === 'observer') {
    return true;
  }

  // For target mode (normal hover), players should only see tooltips for tokens they own
  if (mode === 'target' && hoveredToken) {
    if (game.settings.get(MODULE_ID, 'blockPlayerTargetTooltips')) {
      return false;
    }
    return hoveredToken.isOwner;
  }

  // If we got here and it's target mode but no token provided, allow (for Alt key)
  if (mode === 'target' && !hoveredToken) {
    return !game.settings.get(MODULE_ID, 'blockPlayerTargetTooltips');
  }

  return true;
}
