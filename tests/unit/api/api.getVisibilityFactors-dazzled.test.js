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
  getVisibilityBetween: jest.fn(() => 'concealed'),
  getVisibilityMap: jest.fn(() => ({})),
}));

const { Pf2eVisionerApi } = require('../../../scripts/api.js');
const {
  optimizedVisibilityCalculator,
} = require('../../../scripts/visibility/auto-visibility/VisibilityCalculator.js');
const { getVisibilityBetween, getVisibilityMap } = require('../../../scripts/utils.js');

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
    optimizedVisibilityCalculator.calculateVisibility.mockResolvedValue('concealed');
    optimizedVisibilityCalculator.getComponents.mockReturnValue({
      lightingCalculator: {
        getLightLevelAt: jest.fn(() => ({ level: 'dim', darknessRank: 0 })),
      },
      lightingRasterService: null,
    });
    getVisibilityBetween.mockReturnValue('concealed');
    getVisibilityMap.mockReturnValue({});
    global.canvas.tokens.placeables = [makeDazzledObserver(), makeTarget()];
  });

  test('reports dazzled reason/slug when lighting is dim (not bright)', async () => {
    const factors = await Pf2eVisionerApi.getVisibilityFactors('observer', 'target');

    expect(factors).not.toBeNull();
    expect(factors.slugs).toContain('dazzled');
    expect(factors.reasons.length).toBeGreaterThan(0);
  });

  test('does not report dazzled as a factor when hidden takes precedence', async () => {
    optimizedVisibilityCalculator.calculateVisibility.mockResolvedValue('hidden');
    getVisibilityBetween.mockReturnValue('hidden');
    const target = makeTarget();
    target.actor.itemTypes.condition.push({ slug: 'hidden' });
    global.canvas.tokens.placeables = [makeDazzledObserver(), target];

    const factors = await Pf2eVisionerApi.getVisibilityFactors('observer', 'target');

    expect(factors.state).toBe('hidden');
    expect(factors.slugs).toContain('hidden');
    expect(factors.slugs).not.toContain('dazzled');
    expect(factors.reasons).not.toContain(
      'PF2E_VISIONER.VISIBILITY_FACTORS.REASONS.OBSERVER_DAZZLED',
    );
  });

  test('does not explain an undetected stored state with bright light', async () => {
    optimizedVisibilityCalculator.calculateVisibility.mockResolvedValue('observed');
    optimizedVisibilityCalculator.getComponents.mockReturnValue({
      lightingCalculator: {
        getLightLevelAt: jest.fn(() => ({ level: 'bright', darknessRank: 0 })),
      },
      lightingRasterService: null,
    });
    getVisibilityBetween.mockReturnValue('undetected');
    getVisibilityMap.mockReturnValue({ target: 'undetected' });

    const factors = await Pf2eVisionerApi.getVisibilityFactors('observer', 'target');

    expect(factors.state).toBe('undetected');
    expect(factors.slugs).toContain('undetected');
    expect(factors.slugs).not.toContain('bright-light');
  });

  test('reports a manual override instead of an environmental reason', async () => {
    optimizedVisibilityCalculator.calculateVisibility.mockResolvedValue('observed');
    optimizedVisibilityCalculator.getComponents.mockReturnValue({
      lightingCalculator: {
        getLightLevelAt: jest.fn(() => ({ level: 'darkness', darknessRank: 0 })),
      },
      lightingRasterService: null,
    });
    getVisibilityBetween.mockReturnValue('undetected');
    getVisibilityMap.mockReturnValue({ target: 'undetected' });
    const observer = makeDazzledObserver();
    observer.actor.itemTypes.condition = [];
    const target = makeTarget();
    target.document.getFlag.mockImplementation((moduleId, flagKey) => {
      if (
        moduleId === 'pf2e-visioner' &&
        flagKey === 'avs-override-from-observer'
      ) {
        return {
          state: 'undetected',
          source: 'manual_action',
          observerId: 'observer',
          targetId: 'target',
        };
      }
      return null;
    });
    global.canvas.tokens.placeables = [observer, target];

    const factors = await Pf2eVisionerApi.getVisibilityFactors('observer', 'target');

    expect(factors.state).toBe('undetected');
    expect(factors.reasons).toEqual([
      'PF2E_VISIONER.VISIBILITY_FACTORS.REASONS.MANUAL_OVERRIDE',
    ]);
    expect(factors.slugs).toEqual(['manual-override']);
  });

  test('reports provenance for a converted PF2e system condition', async () => {
    optimizedVisibilityCalculator.getComponents.mockReturnValue({
      lightingCalculator: {
        getLightLevelAt: jest.fn(() => ({ level: 'bright', darknessRank: 0 })),
      },
      lightingRasterService: null,
    });
    getVisibilityBetween.mockReturnValue('hidden');
    const observer = makeDazzledObserver();
    observer.actor.itemTypes.condition = [];
    const target = makeTarget();
    target.document.getFlag.mockImplementation((moduleId, flagKey) => {
      if (
        moduleId === 'pf2e-visioner' &&
        flagKey === 'avs-override-from-observer'
      ) {
        return {
          state: 'hidden',
          source: 'converted-system-condition',
          observerId: 'observer',
          targetId: 'target',
        };
      }
      return null;
    });
    global.canvas.tokens.placeables = [observer, target];

    const factors = await Pf2eVisionerApi.getVisibilityFactors('observer', 'target');

    expect(factors.state).toBe('hidden');
    expect(factors.reasons).toEqual([
      'PF2E_VISIONER.VISIBILITY_FACTORS.REASONS.CONVERTED_SYSTEM_CONDITION',
    ]);
    expect(factors.slugs).toEqual(['system conversion']);
  });

  test('reports canonical Observed when its sparse map has no target entry', async () => {
    optimizedVisibilityCalculator.calculateVisibility.mockResolvedValue('hidden');
    optimizedVisibilityCalculator.getComponents.mockReturnValue({
      lightingCalculator: {
        getLightLevelAt: jest.fn(() => ({ level: 'bright', darknessRank: 0 })),
      },
      lightingRasterService: null,
    });
    getVisibilityBetween.mockReturnValue('observed');
    getVisibilityMap.mockReturnValue({});
    const observer = makeDazzledObserver();
    observer.actor.itemTypes.condition = [];
    global.canvas.tokens.placeables = [observer, makeTarget()];

    const factors = await Pf2eVisionerApi.getVisibilityFactors('observer', 'target');

    expect(factors.state).toBe('observed');
    expect(factors.slugs).toContain('bright-light');
    expect(factors.slugs).not.toContain('hidden');
  });
});
