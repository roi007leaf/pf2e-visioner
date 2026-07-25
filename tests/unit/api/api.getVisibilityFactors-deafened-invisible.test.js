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
  getVisibilityBetween: jest.fn(() => 'hidden'),
  getVisibilityMap: jest.fn(() => ({})),
}));

const { Pf2eVisionerApi } = require('../../../scripts/api.js');
const { getVisibilityBetween } = require('../../../scripts/utils.js');

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

function makeTarget() {
  const target = makeInvisibleTarget();
  target.actor.itemTypes.condition = [];
  return target;
}

describe('getVisibilityFactors - deafened observer condition is detected', () => {
  beforeEach(() => {
    getVisibilityBetween.mockReturnValue('hidden');
    global.canvas.tokens.placeables = [makeDeafenedObserver(), makeInvisibleTarget()];
  });

  test('reports the deafened+invisible reason when observer is deafened and target is invisible', async () => {
    const factors = await Pf2eVisionerApi.getVisibilityFactors('observer', 'target');

    expect(factors).not.toBeNull();
    expect(factors.reasons).toContain(
      'PF2E_VISIONER.VISIBILITY_FACTORS.REASONS.OBSERVER_DEAFENED_INVISIBLE',
    );
  });

  test('explains blinded and deafened Undetected as loss of vision and hearing', async () => {
    getVisibilityBetween.mockReturnValue('undetected');
    const observer = makeDeafenedObserver();
    observer.actor.itemTypes.condition.push({ slug: 'blinded' });
    global.canvas.tokens.placeables = [observer, makeTarget()];

    const factors = await Pf2eVisionerApi.getVisibilityFactors('observer', 'target');

    expect(factors.state).toBe('undetected');
    expect(factors.reasons).toEqual([
      'PF2E_VISIONER.VISIBILITY_FACTORS.REASONS.OBSERVER_BLINDED_DEAFENED',
    ]);
    expect(factors.slugs).toEqual(['blinded + deafened']);
  });
});
