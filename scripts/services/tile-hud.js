import { runSearchExplorationForTile } from '../chat/services/search-exploration-service.js';
import { MODULE_ID } from '../constants.js';

export function onRenderTileHUD(app, html) {
  const root = html?.jquery ? html[0] : html;
  const column = root?.querySelector?.('div.col.left');
  if (!column) return;

  const action = 'pf2e-visioner-search-exploration-tile';
  column.querySelector(`[data-action="${action}"]`)?.remove();

  const tile = app?.object;
  if (!game.user?.isGM || !game.settings.get(MODULE_ID, 'useHudButton')) return;
  if (!tile?.document?.getFlag?.(MODULE_ID, 'hiddenTile')) return;

  const button = document.createElement('div');
  button.className = 'control-icon';
  button.style.display = 'flex';
  button.setAttribute('data-action', action);
  button.setAttribute('data-tooltip', 'Roll Search exploration for PCs searching this hidden tile');
  button.innerHTML = '<i class="fas fa-search"></i>';
  button.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    try {
      await runSearchExplorationForTile(tile);
    } catch (error) {
      console.error('PF2E Visioner: Error rolling hidden tile Search exploration:', error);
    }
  });
  column.appendChild(button);
}
