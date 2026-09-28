import '../../setup.js';
import { MODULE_ID } from '../../../scripts/constants.js';
import { registerUIHooks } from '../../../scripts/hooks/ui.js';

jest.mock('../../../scripts/chat/services/search-exploration-service.js', () => ({
  runSearchExplorationForTile: jest.fn(),
}));

function makeHud(tile) {
  const root = document.createElement('div');
  const column = document.createElement('div');
  column.className = 'col left';
  root.appendChild(column);
  return { app: { object: tile }, root };
}

describe('hidden tile HUD Search action', () => {
  beforeEach(() => {
    game.user.isGM = true;
    game.settings.set(MODULE_ID, 'useHudButton', true);
    jest.clearAllMocks();
  });

  test('renders Search for a hidden tile and rolls against that tile on click', async () => {
    const tile = { document: { getFlag: jest.fn((_module, key) => key === 'hiddenTile') } };
    const { app, root } = makeHud(tile);
    registerUIHooks();
    const onRenderTileHUD = Hooks.on.mock.calls.find(([name]) => name === 'renderTileHUD')?.[1];
    const { runSearchExplorationForTile } = await import(
      '../../../scripts/chat/services/search-exploration-service.js'
    );

    expect(onRenderTileHUD).toBeInstanceOf(Function);
    onRenderTileHUD(app, root);
    const button = root.querySelector('[data-action="pf2e-visioner-search-exploration-tile"]');
    expect(button).not.toBeNull();
    button.click();
    await Promise.resolve();
    expect(runSearchExplorationForTile).toHaveBeenCalledWith(tile);

    onRenderTileHUD(app, root);
    expect(root.querySelectorAll('[data-action="pf2e-visioner-search-exploration-tile"]')).toHaveLength(1);
  });

  test('omits Search for ordinary tiles and players', async () => {
    const { onRenderTileHUD } = await import('../../../scripts/services/tile-hud.js');
    const ordinary = makeHud({ document: { getFlag: jest.fn(() => false) } });
    onRenderTileHUD(ordinary.app, ordinary.root);
    expect(ordinary.root.querySelector('[data-action="pf2e-visioner-search-exploration-tile"]')).toBeNull();

    game.user.isGM = false;
    const hidden = makeHud({ document: { getFlag: jest.fn(() => true) } });
    onRenderTileHUD(hidden.app, hidden.root);
    expect(hidden.root.querySelector('[data-action="pf2e-visioner-search-exploration-tile"]')).toBeNull();
  });
});
