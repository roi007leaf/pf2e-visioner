import { MODULE_ID } from '../../../../../scripts/constants.js';
import { TemplateEventHandler } from '../../../../../scripts/visibility/auto-visibility/core/TemplateEventHandler.js';

describe('TemplateEventHandler', () => {
  let handler;
  let mockSystemState;
  let mockVisibilityState;
  let mockTemplate;
  let mockScene;
  let mockRegion;
  let mockEffectAreaRegion;

  beforeEach(() => {
    mockSystemState = {
      shouldProcessEvents: jest.fn().mockReturnValue(true)
    };

    mockVisibilityState = {
      markAllTokensChangedImmediate: jest.fn()
    };

    handler = new TemplateEventHandler(mockSystemState, mockVisibilityState);

    mockRegion = {
      id: 'region-1',
      update: jest.fn(),
      delete: jest.fn()
    };

    mockScene = {
      createEmbeddedDocuments: jest.fn().mockResolvedValue([{ id: 'region-1' }]),
      updateEmbeddedDocuments: jest.fn(),
      deleteEmbeddedDocuments: jest.fn(),
      regions: {
        get: jest.fn().mockReturnValue(mockRegion)
      },
      lights: {
        get: jest.fn()
      }
    };

    mockTemplate = {
      id: 'template-1',
      parent: mockScene,
      x: 100,
      y: 100,
      distance: 20,
      flags: {
        pf2e: {
          origin: { slug: 'darkness' }
        }
      },
      getFlag: jest.fn(),
      setFlag: jest.fn(),
      unsetFlag: jest.fn()
    };

    mockEffectAreaRegion = {
      id: 'effect-area-1',
      name: 'Darkness',
      shapes: [{ type: 'circle', x: 200, y: 250, radius: 300 }],
      flags: {
        pf2e: {
          origin: { slug: 'darkness', castRank: 4 },
          areaShape: 'burst'
        }
      },
      getFlag: jest.fn(),
      setFlag: jest.fn(),
      unsetFlag: jest.fn()
    };

    global.canvas = {
      scene: mockScene,
      dimensions: { distance: 5 },
      grid: { size: 100 }
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Darkness Light Management', () => {
    test('creates ambient darkness light for PF2e v13 measured template', async () => {
      mockScene.createEmbeddedDocuments.mockImplementation((type) =>
        Promise.resolve([{ id: type === 'AmbientLight' ? 'light-1' : 'region-1' }])
      );

      await handler.handleTemplateCreate(mockTemplate);

      expect(mockScene.createEmbeddedDocuments).toHaveBeenCalledWith('AmbientLight', [
        expect.objectContaining({
          x: 100,
          y: 100,
          config: expect.objectContaining({
            bright: 20,
            dim: 20,
            negative: true
          }),
          flags: expect.objectContaining({
            [MODULE_ID]: expect.objectContaining({
              linkedTemplateId: 'template-1',
              source: 'pf2e-darkness'
            })
          })
        })
      ]);
    });

    test('creates ambient darkness light for PF2e v14 effect-area region', async () => {
      mockScene.createEmbeddedDocuments.mockResolvedValue([{ id: 'light-1' }]);

      await handler.handleRegionCreate(mockEffectAreaRegion);

      expect(mockScene.createEmbeddedDocuments).toHaveBeenCalledWith('AmbientLight', [
        expect.objectContaining({
          x: 200,
          y: 250,
          config: expect.objectContaining({
            bright: 15,
            dim: 15,
            negative: true
          }),
          flags: expect.objectContaining({
            [MODULE_ID]: expect.objectContaining({
              linkedRegionId: 'effect-area-1',
              source: 'pf2e-darkness',
              darknessRank: 4,
              heightenedDarkness: true
            })
          })
        })
      ]);
      expect(mockEffectAreaRegion.setFlag).toHaveBeenCalledWith(MODULE_ID, 'darknessLightId', 'light-1');
    });

    test('syncs linked ambient darkness light when PF2e v14 effect-area region changes', async () => {
      mockEffectAreaRegion.getFlag.mockImplementation((scope, key) => {
        if (key === 'darknessLightId') return 'light-1';
        return null;
      });
      mockEffectAreaRegion.shapes = [{ type: 'circle', x: 220, y: 260, radius: 400 }];

      await handler.handleRegionUpdate(mockEffectAreaRegion, { shapes: [{ type: 'circle' }] });

      expect(mockScene.updateEmbeddedDocuments).toHaveBeenCalledWith('AmbientLight', [
        expect.objectContaining({
          _id: 'light-1',
          x: 220,
          y: 260,
          'config.bright': 20,
          'config.dim': 20,
          'config.negative': true,
          [`flags.${MODULE_ID}.darknessRank`]: 4,
          [`flags.${MODULE_ID}.heightenedDarkness`]: true
        })
      ]);
    });

    test('removes linked ambient darkness light when PF2e v14 effect-area region is deleted', async () => {
      mockEffectAreaRegion.getFlag.mockImplementation((scope, key) => {
        if (key === 'darknessLightId') return 'light-1';
        return null;
      });

      await handler.handleRegionDelete(mockEffectAreaRegion);

      expect(mockScene.deleteEmbeddedDocuments).toHaveBeenCalledWith('AmbientLight', ['light-1']);
      expect(mockEffectAreaRegion.unsetFlag).toHaveBeenCalledWith(MODULE_ID, 'darknessLightId');
    });
  });

  describe('Darkness Region Management', () => {
    test('creates region when darkness template is created', async () => {
      await handler.handleTemplateCreate(mockTemplate);

      expect(mockScene.createEmbeddedDocuments).toHaveBeenCalledWith('Region', [
        expect.objectContaining({
          name: expect.stringContaining('Darkness Terrain'),
          shapes: expect.arrayContaining([
            expect.objectContaining({ radiusX: 400, radiusY: 400 })
          ]),
          behaviors: expect.arrayContaining([
            expect.objectContaining({
              type: 'modifyMovementCost',
              system: expect.objectContaining({
                difficulties: expect.objectContaining({ walk: 2 })
              })
            })
          ]),
          flags: { [MODULE_ID]: { darknessTemplateId: 'template-1' } }
        })
      ]);

      expect(mockTemplate.setFlag).toHaveBeenCalledWith(MODULE_ID, 'darknessRegionId', 'region-1');
    });

    test('updates region when darkness template is updated', async () => {
      mockTemplate.getFlag.mockImplementation((scope, key) => {
        if (key === 'darknessRegionId') return 'region-1';
        return null;
      });

      await handler.handleTemplateUpdate(mockTemplate, { x: 150 });

      expect(mockRegion.update).toHaveBeenCalledWith(
        expect.objectContaining({
          shapes: expect.arrayContaining([
            expect.objectContaining({ x: 100, radiusX: 400 })
          ])
        })
      );
    });

    test('deletes region when darkness template is deleted', async () => {
      mockTemplate.getFlag.mockImplementation((scope, key) => {
        if (key === 'darknessRegionId') return 'region-1';
        return null;
      });

      await handler.handleTemplateDelete(mockTemplate);

      expect(mockScene.deleteEmbeddedDocuments).toHaveBeenCalledWith('Region', ['region-1']);
      expect(mockTemplate.unsetFlag).toHaveBeenCalledWith(MODULE_ID, 'darknessRegionId');
    });

    test('does not create region for non-darkness template', async () => {
      mockTemplate.flags.pf2e.origin.slug = 'fireball';

      await handler.handleTemplateCreate(mockTemplate);

      expect(mockScene.createEmbeddedDocuments).not.toHaveBeenCalledWith('Region', expect.anything());
    });
  });
});
