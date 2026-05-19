import templateManager from '../../../scripts/cover/auto-cover/TemplateManager.js';

describe('TemplateManager', () => {
  beforeEach(() => {
    // Clear singleton state by clearing the internal maps
    templateManager._templatesData?.clear?.();
    templateManager._activeReflexSaves?.clear?.();
    templateManager._templatesOrigins?.clear?.();
    templateManager._templateTargetIndex?.clear?.();
  });

  describe('singleton instance', () => {
    test('should be defined and have expected properties', () => {
      expect(templateManager).toBeDefined();
      expect(templateManager._templatesData).toBeInstanceOf(Map);
      expect(templateManager._activeReflexSaves).toBeInstanceOf(Map);
      expect(templateManager._templatesOrigins).toBeInstanceOf(Map);
      expect(templateManager._templateTargetIndex).toBeInstanceOf(Map);
    });
  });

  describe('getTemplatesData', () => {
    test('should return Map instance', () => {
      const result = templateManager.getTemplatesData();
      expect(result).toBeInstanceOf(Map);
    });

    test('should return empty Map initially', () => {
      const result = templateManager.getTemplatesData();
      expect(result.size).toBe(0);
    });
  });

  describe('getTemplateData', () => {
    test('should return null for non-existent template', () => {
      const result = templateManager.getTemplateData('non-existent');
      expect(result).toBeNull();
    });

    test('should return null for null template ID', () => {
      const result = templateManager.getTemplateData(null);
      expect(result).toBeNull();
    });

    test('should return null for undefined template ID', () => {
      const result = templateManager.getTemplateData(undefined);
      expect(result).toBeNull();
    });
  });

  describe('getLatestTemplateForTarget', () => {
    test('returns newest indexed template for target without scanning callers', () => {
      const oldTemplate = {
        id: 'old-template',
        timestamp: 100,
        targets: { target1: { state: 'standard' } },
      };
      const newTemplate = {
        id: 'new-template',
        timestamp: 200,
        targets: { target1: { state: 'greater' } },
      };

      templateManager._templatesData.set('old-template', oldTemplate);
      templateManager._indexTemplateData('old-template', oldTemplate);
      templateManager._templatesData.set('new-template', newTemplate);
      templateManager._indexTemplateData('new-template', newTemplate);

      expect(templateManager.getLatestTemplateForTarget('target1')).toEqual({
        id: 'new-template',
        data: newTemplate,
      });
    });

    test('removes target-index entries when template data is removed', () => {
      const templateData = {
        id: 'template-1',
        timestamp: 100,
        targets: { target1: { state: 'standard' } },
      };
      templateManager._templatesData.set('template-1', templateData);
      templateManager._indexTemplateData('template-1', templateData);

      templateManager.removeTemplateData('template-1');

      expect(templateManager.getLatestTemplateForTarget('target1')).toBeNull();
      expect(templateManager._templateTargetIndex.has('target1')).toBe(false);
    });
  });

  describe('removeTemplateData', () => {
    test('should handle removing non-existent template', () => {
      expect(() => {
        templateManager.removeTemplateData('non-existent');
      }).not.toThrow();
    });

    test('should handle null template ID', () => {
      expect(() => {
        templateManager.removeTemplateData(null);
      }).not.toThrow();
    });

    test('should handle undefined template ID', () => {
      expect(() => {
        templateManager.removeTemplateData(undefined);
      }).not.toThrow();
    });
  });

  describe('registerTemplate', () => {
    const mockDocument = {
      id: 'test-template',
      x: 100,
      y: 100,
      t: 'circle',
      distance: 20,
      direction: 0,
      angle: 90,
      flags: {},
    };

    beforeEach(() => {
      // Mock game globals
      global.game = {
        userId: 'test-user',
        user: { character: null },
      };
      global.canvas = {
        tokens: {
          controlled: [],
          placeables: [],
        },
        grid: { size: 100 },
        dimensions: { distance: 5 },
      };
    });

    test('should handle valid template registration', async () => {
      await templateManager.registerTemplate(mockDocument, 'test-user');

      const templateData = templateManager.getTemplateData('test-template');
      expect(templateData).toBeTruthy();
      expect(templateData.id).toBe('test-template');
    });

    test('should handle null template document', async () => {
      expect(async () => {
        await templateManager.registerTemplate(null, 'test-user');
      }).not.toThrow();
    });

    test('should handle undefined template document', async () => {
      expect(async () => {
        await templateManager.registerTemplate(undefined, 'test-user');
      }).not.toThrow();
    });
  });

  describe('addActiveReflexSaveTemplate', () => {
    test('should add active reflex save template', () => {
      templateManager.addActiveReflexSaveTemplate('test-template');

      const result = templateManager.getActiveReflexSaveTemplate('test-template');
      expect(result).toBeTruthy();
      expect(result.ts).toBeTruthy();
    });

    test('should handle null template ID', () => {
      expect(() => {
        templateManager.addActiveReflexSaveTemplate(null);
      }).not.toThrow();
    });

    test('should handle undefined template ID', () => {
      expect(() => {
        templateManager.addActiveReflexSaveTemplate(undefined);
      }).not.toThrow();
    });
  });

  describe('getActiveReflexSaveTemplate', () => {
    test('should return undefined for non-existent template', () => {
      const result = templateManager.getActiveReflexSaveTemplate('non-existent');
      expect(result).toBeUndefined();
    });

    test('should return undefined for null template ID', () => {
      const result = templateManager.getActiveReflexSaveTemplate(null);
      expect(result).toBeUndefined();
    });

    test('should return undefined for undefined template ID', () => {
      const result = templateManager.getActiveReflexSaveTemplate(undefined);
      expect(result).toBeUndefined();
    });
  });

  describe('template origin methods', () => {
    test('should handle template origin operations', () => {
      const origin = { x: 100, y: 100 };

      templateManager.setTemplateOrigin('token1', origin);
      const result = templateManager.getTemplateOrigin('token1');

      expect(result).toBeTruthy();
      expect(result.x).toBe(100);
      expect(result.y).toBe(100);
      expect(result.ts).toBeTruthy();
    });

    test('should return null for non-existent token', () => {
      const result = templateManager.getTemplateOrigin('non-existent');
      expect(result).toBeNull();
    });

    test('should handle null parameters gracefully', () => {
      expect(() => {
        templateManager.setTemplateOrigin(null, null);
      }).not.toThrow();

      expect(() => {
        templateManager.getTemplateOrigin(null);
      }).not.toThrow();
    });
  });

  describe('error handling', () => {
    test('should handle template methods gracefully', () => {
      expect(() => {
        templateManager.cleanupOldTemplates();
      }).not.toThrow();

      expect(() => {
        templateManager.removeActiveReflexSaveTemplate('test');
      }).not.toThrow();
    });
  });
});
