import '../../setup.js';

jest.mock('../../../scripts/visibility/auto-visibility/VisibilityCalculator.js', () => ({
  optimizedVisibilityCalculator: {
    calculateVisibility: jest.fn(async () => 'hidden'),
    getComponents: jest.fn(() => ({
      lightingCalculator: {
        getLightLevelAt: jest.fn(() => ({ level: 'bright', darknessRank: 0 })),
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

function makeDeafenedObserver() {
  return {
    id: 'observer',
    document: { x: 0, y: 0, width: 1, height: 1, elevation: 0, getFlag: jest.fn(() => null) },
    actor: {
      itemTypes: { condition: [{ slug: 'deafened' }] },
      system: {},
    },
  };
}

function makeInvisibleTarget() {
  return {
    id: 'target',
    document: { x: 100, y: 0, width: 1, height: 1, elevation: 0, getFlag: jest.fn(() => null) },
    actor: {
      itemTypes: { condition: [{ slug: 'invisible' }] },
      system: { traits: { value: [] } },
    },
  };
}

describe('getVisibilityFactors - deafened observer condition is detected', () => {
  beforeEach(() => {
    global.canvas.tokens.placeables = [makeDeafenedObserver(), makeInvisibleTarget()];
  });

  test('reports the deafened+invisible reason when observer is deafened and target is invisible', async () => {
    const factors = await Pf2eVisionerApi.getVisibilityFactors('observer', 'target');

    expect(factors).not.toBeNull();
    expect(factors.reasons).toContain(
      'PF2E_VISIONER.VISIBILITY_FACTORS.REASONS.OBSERVER_DEAFENED_INVISIBLE',
    );
  });
});
