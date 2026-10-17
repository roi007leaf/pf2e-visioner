import '../../setup.js';
import { VisionerWallQuickSettings } from '../../../scripts/managers/wall-manager/WallQuick.js';

function wall({ wallHeightTop, levelIds = [] } = {}) {
  const flags = {
    'pf2e-visioner': { ledge: true },
    ...(wallHeightTop !== undefined ? { 'wall-height': { bottom: 0, top: wallHeightTop } } : {}),
  };
  return {
    id: 'wall-1',
    door: 0,
    flags,
    levels: new Set(levelIds),
    parent: { levels: new Map([['up', { elevation: { bottom: 10, top: 20 } }]]) },
    getFlag: (_module, key) => flags['pf2e-visioner'][key],
  };
}

describe('wall quick ledge elevation placeholder', () => {
  beforeEach(() => {
    game.modules = new Map([['wall-height', { active: true }]]);
    game.i18n.format = jest.fn((key, data) => `${key}|${data.elevation}`);
    game.i18n.localize = jest.fn((key) => key);
  });

  test('shows the inherited wall height top', async () => {
    const context = await new VisionerWallQuickSettings(wall({ wallHeightTop: 15 }))._prepareContext();
    expect(context.ledgeElevationPlaceholder).toBe('PF2E_VISIONER.UI.WALL_LEDGE_ELEVATION_INHERITED|15');
  });

  test('shows the inherited scene level floor', async () => {
    const context = await new VisionerWallQuickSettings(wall({ levelIds: ['up'] }))._prepareContext();
    expect(context.ledgeElevationPlaceholder).toBe('PF2E_VISIONER.UI.WALL_LEDGE_ELEVATION_INHERITED|10');
  });

  test('falls back to the higher creature', async () => {
    const context = await new VisionerWallQuickSettings(wall())._prepareContext();
    expect(context.ledgeElevationPlaceholder).toBe('PF2E_VISIONER.UI.WALL_LEDGE_ELEVATION_AUTO');
  });
});
