import '../../setup.js';

jest.mock('../../../scripts/visibility/auto-visibility/VisibilityCalculator.js', () => ({
  optimizedVisibilityCalculator: {
    calculateVisibility: jest.fn(async () => 'concealed'),
    getComponents: jest.fn(() => ({
      lightingCalculator: {
        getLightLevelAt: jest.fn(() => ({ level: 'dim', darknessRank: 0 })),
      },
      lightingRasterService: null,
    })),
  },
}));

jest.mock('../../../scripts/visibility/auto-visibility/VisionAnalyzer.js', () => ({
  VisionAnalyzer: {
    getInstance: jest.fn(() => ({
      getVisionCapabilities: jest.fn(() => ({
        hasDarkvision: false,
        hasLowLightVision: false,
        sensingSummary: {},
      })),
      distanceFeet: jest.fn(() => 10),
    })),
  },
}));

jest.mock('../../../scripts/helpers/geometry-utils.js', () => ({
  calculateRealDistanceInFeet: jest.fn(() => 10),
}));

jest.mock('../../../scripts/services/scene-hearing-range.js', () => ({
  applyActiveSceneHearingRangeLimit: jest.fn(() => null),
}));

jest.mock('../../../scripts/utils.js', () => ({
  getVisibilityMap: jest.fn(() => ({})),
}));

const { Pf2eVisionerApi } = require('../../../scripts/api.js');

function makeDazzledObserver() {
  return {
    id: 'observer',
    document: { x: 0, y: 0, width: 1, height: 1, elevation: 0, getFlag: jest.fn(() => null) },
    actor: {
      itemTypes: { condition: [{ slug: 'dazzled' }] },
      system: {},
    },
  };
}

function makeTarget() {
  return {
    id: 'target',
    document: { x: 100, y: 0, width: 1, height: 1, elevation: 0, getFlag: jest.fn(() => null) },
    actor: {
      itemTypes: { condition: [] },
      system: { traits: { value: [] } },
    },
  };
}

describe('getVisibilityFactors - dazzled reason not gated on bright light', () => {
  beforeEach(() => {
    global.canvas.tokens.placeables = [makeDazzledObserver(), makeTarget()];
  });

  test('reports dazzled reason/slug when lighting is dim (not bright)', async () => {
    const factors = await Pf2eVisionerApi.getVisibilityFactors('observer', 'target');

    expect(factors).not.toBeNull();
    expect(factors.slugs).toContain('dazzled');
    expect(factors.reasons.length).toBeGreaterThan(0);
  });
});
