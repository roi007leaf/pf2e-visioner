/**
 * Token HUD integration for PF2E Visioner
 * Based on the approach from pf2e-flatcheck-helper
 */

import { openVisibilityManagerWithMode } from '../api.js';
import {
  isSearchExplorationHudTarget,
  runSearchExplorationForTarget,
} from '../chat/services/search-exploration-service.js';
import { MODULE_ID } from '../constants.js';

/**
 * Handle rendering of token HUD to add visibility button
 * @param {TokenHUD} app - The token HUD application
 * @param {HTMLElement} html - The HTML element of the HUD
 */
export function onRenderTokenHUD(app, html) {
  // Only add button if HUD button setting is enabled
  if (!game.settings.get(MODULE_ID, 'useHudButton')) {
    return;
  }

  renderSearchExplorationButton(app, html);

  // Respect loot-actors setting for the visibility manager only.
  try {
    const token = app?.object;
    if (token?.actor?.type === 'loot' && !game.settings.get(MODULE_ID, 'includeLootActors')) {
      return;
    }
  } catch (_) {}

  renderVisibilityButton(app, html);
}

function getHudLeftColumn(html) {
  const root = html?.jquery ? html[0] : html;
  if (!root) return null;
  let column = root.querySelector('div.col.left');
  if (!column && html?.find) {
    column = html.find('div.col.left')[0];
  }
  return column || null;
}

function renderSearchExplorationButton(app, html) {
  const token = app.object;
  if (!token || !game.user.isGM || !isSearchExplorationHudTarget(token)) return;

  const column = getHudLeftColumn(html);
  if (!column) {
    console.warn('PF2E Visioner: Could not find left column in token HUD');
    return;
  }

  const existing = column.querySelector('[data-action="pf2e-visioner-search-exploration"]');
  if (existing) existing.remove();

  const buttonElement = document.createElement('div');
  buttonElement.className = 'control-icon';
  buttonElement.style.display = 'flex';
  buttonElement.setAttribute('data-action', 'pf2e-visioner-search-exploration');
  buttonElement.setAttribute(
    'data-tooltip',
    'Roll Search exploration for PCs searching this area',
  );
  buttonElement.innerHTML = '<i class="fas fa-search"></i>';

  buttonElement.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();

    try {
      await runSearchExplorationForTarget(token);
    } catch (error) {
      console.error('PF2E Visioner: Error rolling Search exploration:', error);
    }
  });

  column.appendChild(buttonElement);
}

/**
 * Render the visibility button in the token HUD
 * @param {TokenHUD} app - The token HUD application
 * @param {HTMLElement} html - The HTML element of the HUD
 */
function renderVisibilityButton(app, html) {
  const token = app.object;
  if (!token) return;

  // Only show for GMs
  if (!game.user.isGM) {
    return;
  }

  const column = getHudLeftColumn(html);
  if (!column) {
    console.warn('PF2E Visioner: Could not find left column in token HUD');
    return;
  }

  // Remove any existing instance first
  const existing = column.querySelector('[data-action="pf2e-visioner-visibility"]');
  if (existing) existing.remove();

  // Create the button element
  const buttonElement = document.createElement('div');
  buttonElement.className = 'control-icon';
  buttonElement.style.display = 'flex';
  buttonElement.setAttribute('data-action', 'pf2e-visioner-visibility');
  buttonElement.setAttribute(
    'data-tooltip',
    'Visibility Manager (Left: Target Mode | Right: Observer Mode)',
  );
  buttonElement.innerHTML = '<i class="fas fa-face-hand-peeking"></i>';

  // Add click handlers for both left and right click
  buttonElement.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();

    try {
      await openVisibilityManagerWithMode(token, 'target');
    } catch (error) {
      console.error('PF2E Visioner: Error opening visibility manager in target mode:', error);
    }
  });

  buttonElement.addEventListener('contextmenu', async (event) => {
    event.preventDefault();
    event.stopPropagation();

    try {
      await openVisibilityManagerWithMode(token, 'observer');
    } catch (error) {
      console.error('PF2E Visioner: Error opening visibility manager in observer mode:', error);
    }
  });

  // Add the button to the column
  column.appendChild(buttonElement);
}

