import { MODULE_ID } from '../../../../../scripts/constants.js';
import { TemplateEventHandler } from '../../../../../scripts/visibility/auto-visibility/core/TemplateEventHandler.js';

describe('TemplateEventHandler', () => {
  let handler;
  let mockSystemState;
  let mockVisibilityState;
  let mockTemplate;
  let mockScene;
  let mockRegion;

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

    global.canvas = {
      scene: mockScene,
      dimensions: { distance: 5 },
      grid: { size: 100 }
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
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
                difficulties: expect.objectContaining({ land: 2, stride: 2 })
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
