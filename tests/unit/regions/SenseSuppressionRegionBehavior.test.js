global.foundry = global.foundry || {};
global.foundry.data = global.foundry.data || {};
global.foundry.data.regionBehaviors = global.foundry.data.regionBehaviors || {};
global.foundry.data.regionBehaviors.RegionBehaviorType = class RegionBehaviorType {
  static defineSchema() {
    return {};
  }

  static _createEventsField(events) {
    return { events: new Set(events.events || events) };
  }

  static LOCALIZATION_PREFIXES = [];
};

global.foundry.data.fields = global.foundry.data.fields || {};
global.foundry.data.fields.StringField = global.foundry.data.fields.StringField || class StringField {
  constructor(options = {}) { this.options = options; }
};
global.foundry.data.fields.BooleanField = global.foundry.data.fields.BooleanField || class BooleanField {
  constructor(options = {}) { this.options = options; }
};
global.foundry.data.fields.SetField = global.foundry.data.fields.SetField || class SetField {
  constructor(inner, options = {}) { this.inner = inner; this.options = options; }
};

import { SenseSuppressionRegionBehavior } from '../../../scripts/regions/SenseSuppressionRegionBehavior.js';

const MODULE_ID = 'pf2e-visioner';
const BEHAVIOR_TYPE = `${MODULE_ID}.Pf2eVisionerSenseSuppression`;

function createMockRegion(behaviors = []) {
  const region = {
    behaviors: behaviors,
    testPoint: jest.fn().mockReturnValue(false),
  };
  return region;
}

function createMockBehavior({ senses = [], affectsObserver = true, affectsTarget = false, enabled = true } = {}) {
  return {
    type: BEHAVIOR_TYPE,
    enabled,
    disabled: !enabled,
    system: {
      senses: new Set(senses),
      affectsObserver,
      affectsTarget,
    },
    senses: new Set(senses),
    affectsObserver,
    affectsTarget,
  };
}

describe('SenseSuppressionRegionBehavior', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.canvas.scene = global.canvas.scene || {};
    global.canvas.scene.regions = [];
  });

  describe('defineSchema', () => {
    test('should have defineSchema as a static method', () => {
      expect(typeof SenseSuppressionRegionBehavior.defineSchema).toBe('function');
    });

    test('should have correct localization prefixes', () => {
      expect(SenseSuppressionRegionBehavior.LOCALIZATION_PREFIXES).toContain(
        'PF2E_VISIONER.REGION_BEHAVIOR',
      );
    });
  });

  describe('getAllSenseSuppressionRegions', () => {
    test('should return empty array when no regions exist', () => {
      global.canvas.scene.regions = [];
      const result = SenseSuppressionRegionBehavior.getAllSenseSuppressionRegions();
      expect(result).toEqual([]);
    });

    test('should return empty array when canvas has no scene regions', () => {
      const savedScene = global.canvas.scene;
      global.canvas.scene = null;
      const result = SenseSuppressionRegionBehavior.getAllSenseSuppressionRegions();
      expect(result).toEqual([]);
      global.canvas.scene = savedScene;
    });

    test('should find enabled suppression regions', () => {
      const behavior = createMockBehavior({ senses: ['scent'] });
      const region = createMockRegion([behavior]);
      global.canvas.scene.regions = [region];

      const result = SenseSuppressionRegionBehavior.getAllSenseSuppressionRegions();
      expect(result).toHaveLength(1);
      expect(result[0].region).toBe(region);
      expect(result[0].behavior).toBe(behavior);
    });

    test('should skip disabled regions', () => {
      const behavior = createMockBehavior({ senses: ['scent'], enabled: false });
      const region = createMockRegion([behavior]);
      global.canvas.scene.regions = [region];

      const result = SenseSuppressionRegionBehavior.getAllSenseSuppressionRegions();
      expect(result).toEqual([]);
    });

    test('should skip regions with empty senses', () => {
      const behavior = createMockBehavior({ senses: [] });
      const region = createMockRegion([behavior]);
      global.canvas.scene.regions = [region];

      const result = SenseSuppressionRegionBehavior.getAllSenseSuppressionRegions();
      expect(result).toEqual([]);
    });

    test('should skip non-suppression behavior types', () => {
      const behavior = createMockBehavior({ senses: ['scent'] });
      behavior.type = `${MODULE_ID}.Pf2eVisionerConcealment`;
      const region = createMockRegion([behavior]);
      global.canvas.scene.regions = [region];

      const result = SenseSuppressionRegionBehavior.getAllSenseSuppressionRegions();
      expect(result).toEqual([]);
    });
  });

  describe('getSuppressedSensesForObserver', () => {
    test('should return empty set when no regions exist', () => {
      global.canvas.scene.regions = [];
      const result = SenseSuppressionRegionBehavior.getSuppressedSensesForObserver({ x: 100, y: 100 });
      expect(result.size).toBe(0);
    });

    test('should return empty set when position is null', () => {
      const result = SenseSuppressionRegionBehavior.getSuppressedSensesForObserver(null);
      expect(result.size).toBe(0);
    });

    test('should return suppressed senses when observer is inside region', () => {
      const behavior = createMockBehavior({ senses: ['scent'], affectsObserver: true });
      const region = createMockRegion([behavior]);
      region.testPoint.mockReturnValue(true);
      global.canvas.scene.regions = [region];

      const result = SenseSuppressionRegionBehavior.getSuppressedSensesForObserver({ x: 100, y: 100 });
      expect(result.has('scent')).toBe(true);
    });

    test('should return empty set when observer is outside region', () => {
      const behavior = createMockBehavior({ senses: ['scent'], affectsObserver: true });
      const region = createMockRegion([behavior]);
      region.testPoint.mockReturnValue(false);
      global.canvas.scene.regions = [region];

      const result = SenseSuppressionRegionBehavior.getSuppressedSensesForObserver({ x: 500, y: 500 });
      expect(result.size).toBe(0);
    });

    test('should return empty set when affectsObserver is false', () => {
      const behavior = createMockBehavior({ senses: ['scent'], affectsObserver: false });
      const region = createMockRegion([behavior]);
      region.testPoint.mockReturnValue(true);
      global.canvas.scene.regions = [region];

      const result = SenseSuppressionRegionBehavior.getSuppressedSensesForObserver({ x: 100, y: 100 });
      expect(result.size).toBe(0);
    });

    test('should aggregate senses from multiple regions', () => {
      const behavior1 = createMockBehavior({ senses: ['scent'], affectsObserver: true });
      const region1 = createMockRegion([behavior1]);
      region1.testPoint.mockReturnValue(true);

      const behavior2 = createMockBehavior({ senses: ['hearing'], affectsObserver: true });
      const region2 = createMockRegion([behavior2]);
      region2.testPoint.mockReturnValue(true);

      global.canvas.scene.regions = [region1, region2];

      const result = SenseSuppressionRegionBehavior.getSuppressedSensesForObserver({ x: 100, y: 100 });
      expect(result.has('scent')).toBe(true);
      expect(result.has('hearing')).toBe(true);
    });

    test('should return multiple senses from one region behavior', () => {
      const behavior = createMockBehavior({ senses: ['scent', 'tremorsense'], affectsObserver: true });
      const region = createMockRegion([behavior]);
      region.testPoint.mockReturnValue(true);
      global.canvas.scene.regions = [region];

      const result = SenseSuppressionRegionBehavior.getSuppressedSensesForObserver({ x: 100, y: 100 });
      expect(result.has('scent')).toBe(true);
      expect(result.has('tremorsense')).toBe(true);
      expect(result.size).toBe(2);
    });
  });

  describe('getSuppressedSensesForTarget', () => {
    test('should return empty set when no regions exist', () => {
      global.canvas.scene.regions = [];
      const result = SenseSuppressionRegionBehavior.getSuppressedSensesForTarget({ x: 100, y: 100 });
      expect(result.size).toBe(0);
    });

    test('should return suppressed senses when target is inside region with affectsTarget', () => {
      const behavior = createMockBehavior({ senses: ['scent'], affectsTarget: true });
      const region = createMockRegion([behavior]);
      region.testPoint.mockReturnValue(true);
      global.canvas.scene.regions = [region];

      const result = SenseSuppressionRegionBehavior.getSuppressedSensesForTarget({ x: 100, y: 100 });
      expect(result.has('scent')).toBe(true);
    });

    test('should return empty set when affectsTarget is false', () => {
      const behavior = createMockBehavior({ senses: ['scent'], affectsTarget: false });
      const region = createMockRegion([behavior]);
      region.testPoint.mockReturnValue(true);
      global.canvas.scene.regions = [region];

      const result = SenseSuppressionRegionBehavior.getSuppressedSensesForTarget({ x: 100, y: 100 });
      expect(result.size).toBe(0);
    });
  });

  describe('deleteSenseFromCapabilities', () => {
    test('should delete sense from precise', () => {
      const precise = { scent: { range: 30 } };
      const imprecise = {};
      SenseSuppressionRegionBehavior.deleteSenseFromCapabilities(precise, imprecise, 'scent');
      expect(precise).not.toHaveProperty('scent');
    });

    test('should delete sense from imprecise', () => {
      const precise = {};
      const imprecise = { hearing: { range: Infinity } };
      SenseSuppressionRegionBehavior.deleteSenseFromCapabilities(precise, imprecise, 'hearing');
      expect(imprecise).not.toHaveProperty('hearing');
    });

    test('should delete both key variants for hyphenated senses', () => {
      const precise = { greaterDarkvision: { range: Infinity }, 'greater-darkvision': { range: Infinity } };
      const imprecise = {};
      SenseSuppressionRegionBehavior.deleteSenseFromCapabilities(precise, imprecise, 'greater-darkvision');
      expect(precise).not.toHaveProperty('greaterDarkvision');
      expect(precise).not.toHaveProperty('greater-darkvision');
    });

    test('should delete low-light-vision variants', () => {
      const precise = { lowLightVision: { range: Infinity } };
      const imprecise = {};
      SenseSuppressionRegionBehavior.deleteSenseFromCapabilities(precise, imprecise, 'low-light-vision');
      expect(precise).not.toHaveProperty('lowLightVision');
    });

    test('should delete see-invisibility variants', () => {
      const precise = { seeInvisibility: { range: Infinity }, 'see-invisibility': { range: 60 } };
      const imprecise = {};
      SenseSuppressionRegionBehavior.deleteSenseFromCapabilities(precise, imprecise, 'see-invisibility');
      expect(precise).not.toHaveProperty('seeInvisibility');
      expect(precise).not.toHaveProperty('see-invisibility');
    });
  });

  describe('applySenseSuppression', () => {
    test('should suppress observer senses when inside region', () => {
      const behavior = createMockBehavior({ senses: ['scent'], affectsObserver: true });
      const region = createMockRegion([behavior]);
      region.testPoint.mockReturnValue(true);
      global.canvas.scene.regions = [region];

      const precise = { vision: { range: Infinity } };
      const imprecise = { scent: { range: 30 }, hearing: { range: Infinity } };

      SenseSuppressionRegionBehavior.applySenseSuppression(
        precise, imprecise,
        { x: 100, y: 100 },
        { x: 500, y: 500 },
      );

      expect(imprecise).not.toHaveProperty('scent');
      expect(imprecise).toHaveProperty('hearing');
      expect(precise).toHaveProperty('vision');
    });

    test('should suppress target senses when target inside region', () => {
      const behavior = createMockBehavior({ senses: ['hearing'], affectsTarget: true, affectsObserver: false });
      const region = createMockRegion([behavior]);
      region.testPoint.mockImplementation((pos) => pos.x === 500);
      global.canvas.scene.regions = [region];

      const precise = { vision: { range: Infinity } };
      const imprecise = { hearing: { range: Infinity }, scent: { range: 30 } };

      SenseSuppressionRegionBehavior.applySenseSuppression(
        precise, imprecise,
        { x: 100, y: 100 },
        { x: 500, y: 500 },
      );

      expect(imprecise).not.toHaveProperty('hearing');
      expect(imprecise).toHaveProperty('scent');
    });

    test('should handle no regions gracefully', () => {
      global.canvas.scene.regions = [];

      const precise = { vision: { range: Infinity } };
      const imprecise = { hearing: { range: Infinity } };

      SenseSuppressionRegionBehavior.applySenseSuppression(
        precise, imprecise,
        { x: 100, y: 100 },
        { x: 500, y: 500 },
      );

      expect(precise).toHaveProperty('vision');
      expect(imprecise).toHaveProperty('hearing');
    });

    test('should suppress both observer and target senses from different regions', () => {
      const observerBehavior = createMockBehavior({ senses: ['scent'], affectsObserver: true, affectsTarget: false });
      const observerRegion = createMockRegion([observerBehavior]);
      observerRegion.testPoint.mockImplementation((pos) => pos.x === 100);

      const targetBehavior = createMockBehavior({ senses: ['hearing'], affectsTarget: true, affectsObserver: false });
      const targetRegion = createMockRegion([targetBehavior]);
      targetRegion.testPoint.mockImplementation((pos) => pos.x === 500);

      global.canvas.scene.regions = [observerRegion, targetRegion];

      const precise = { vision: { range: Infinity } };
      const imprecise = { scent: { range: 30 }, hearing: { range: Infinity }, tremorsense: { range: 30 } };

      SenseSuppressionRegionBehavior.applySenseSuppression(
        precise, imprecise,
        { x: 100, y: 100 },
        { x: 500, y: 500 },
      );

      expect(imprecise).not.toHaveProperty('scent');
      expect(imprecise).not.toHaveProperty('hearing');
      expect(imprecise).toHaveProperty('tremorsense');
    });
  });
});
