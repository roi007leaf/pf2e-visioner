import '../../setup.js';
import { persistObserverTileStates } from '../../../scripts/managers/token-manager/actions/core.js';

test('Visioner Manager changes hidden tile state for selected observer only', async () => {
  const originalTiles = global.canvas.tiles;
  const tile = {
    id: 'tile-a',
    document: { getFlag: jest.fn((_module, key) => key === 'hiddenTile') },
  };
  global.canvas.tiles = { placeables: [tile], get: jest.fn(id => id === tile.id ? tile : null) };
  const selected = {
    document: {
      getFlag: jest.fn(() => ({ 'tile-a': 'hidden' })),
      setFlag: jest.fn().mockResolvedValue(undefined),
    },
  };
  const other = { document: { setFlag: jest.fn() } };
  try {
    expect(await persistObserverTileStates(selected, {
      'tile-a': 'observed', 'missing': 'observed',
    })).toBe(true);
    expect(selected.document.setFlag).toHaveBeenCalledWith('pf2e-visioner', 'tiles', {
      'tile-a': 'observed',
    });
    expect(other.document.setFlag).not.toHaveBeenCalled();
    expect(await persistObserverTileStates(selected, { 'tile-a': 'hidden' })).toBe(false);
  } finally {
    global.canvas.tiles = originalTiles;
  }
});
