import '../../setup.js';
import { registerHiddenTileHooks } from '../../../scripts/services/Tiles/hidden-tile-visibility.js';

test('player tile stays hidden when Foundry creates its mesh after createTile', () => {
  const originalUser = game.user;
  const originalTiles = canvas.tiles;
  const originalTokens = canvas.tokens.placeables;
  const originalSettingsGet = game.settings.get;
  Hooks.on.mockClear();
  const player = { isGM: false };
  const tile = {
    id: 'hidden-tile',
    document: { id: 'hidden-tile', getFlag: (_module, key) => key === 'hiddenTile' },
  };
  const observer = {
    document: {
      testUserPermission: () => true,
      getFlag: (_module, key) => key === 'tiles' ? { 'hidden-tile': 'hidden' } : undefined,
    },
  };
  try {
    game.user = player;
    game.settings.get = (_module, key) => key === 'hiddenTilesEnabled';
    canvas.tiles = { placeables: [tile] };
    canvas.tokens.placeables = [observer];
    registerHiddenTileHooks();
    const callback = name => Hooks.on.mock.calls.find(([event]) => event === name)?.[1];
    callback('createTile')({ id: tile.id, object: tile, getFlag: tile.document.getFlag });
    tile.mesh = { visible: true, renderable: true };
    callback('drawTile')?.(tile);
    expect(tile.mesh).toMatchObject({ visible: false, renderable: false });
  } finally {
    game.user = originalUser;
    game.settings.get = originalSettingsGet;
    canvas.tiles = originalTiles;
    canvas.tokens.placeables = originalTokens;
  }
});

test('player tile stays hidden when a tile update replaces its mesh', () => {
  const originalUser = game.user;
  const originalTiles = canvas.tiles;
  const originalTokens = canvas.tokens.placeables;
  const originalSettingsGet = game.settings.get;
  Hooks.on.mockClear();
  const tile = {
    id: 'hidden-tile',
    document: { id: 'hidden-tile', getFlag: (_module, key) => key === 'hiddenTile' },
    mesh: { visible: true, renderable: true },
  };
  try {
    game.user = { isGM: false };
    game.settings.get = (_module, key) => key === 'hiddenTilesEnabled';
    canvas.tiles = { placeables: [tile] };
    canvas.tokens.placeables = [{
      document: {
        testUserPermission: () => true,
        getFlag: (_module, key) => key === 'tiles' ? { 'hidden-tile': 'hidden' } : undefined,
      },
    }];
    registerHiddenTileHooks();
    const callback = name => Hooks.on.mock.calls.find(([event]) => event === name)?.[1];
    callback('updateTile')({ object: tile }, {});
    expect(tile.mesh.visible).toBe(false);
    tile.mesh = { visible: true, renderable: true };
    callback('drawTile')(tile);
    expect(tile.mesh).toMatchObject({ visible: false, renderable: false });
  } finally {
    game.user = originalUser;
    game.settings.get = originalSettingsGet;
    canvas.tiles = originalTiles;
    canvas.tokens.placeables = originalTokens;
  }
});
