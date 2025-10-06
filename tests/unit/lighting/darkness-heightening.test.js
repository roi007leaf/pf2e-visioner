import { LightingCalculator } from '../../../scripts/visibility/auto-visibility/LightingCalculator.js';
import { VisionAnalyzer } from '../../../scripts/visibility/auto-visibility/VisionAnalyzer.js';
import { calculateVisibility } from '../../../scripts/visibility/StatelessVisibilityCalculator.js';

// Mock PIXI for tests
global.PIXI = {
  Polygon: {
    fromClipperPoints: function (points, options) {
      return {
        points: points.map((p) => [p.X, p.Y]).flat(),
      };
    },
  },
};

function makeActorWithDarkvision() {
  return {
    type: 'character',
    system: { perception: { senses: { darkvision: { range: Infinity } } } },
    itemTypes: { feat: [] },
    items: [],
    flags: {},
  };
}

function makeActorWithGreaterDarkvisionFeat() {
  return {
    type: 'character',
    system: {
      perception: {
        senses: {
          'greater-darkvision': { range: Infinity, acuity: 'precise' }
        }
      }
    },
    itemTypes: {
      feat: [{ type: 'feat', system: { slug: 'greater-darkvision' } }],
    },
    items: [{ type: 'feat', system: { slug: 'greater-darkvision' } }],
    flags: {},
  };
}

function makeActorWithoutDarkvision() {
  return {
    type: 'character',
    system: { perception: { senses: {} } },
    itemTypes: { feat: [] },
    items: [],
    flags: {},
  };
}

function makeToken(actor, id = 'tok') {
  return {
    actor,
    document: { id, getFlag: () => undefined },
    center: { x: 0, y: 0 },
  };
}

function setupSceneWithDarkness({ rank = 0, magical = false } = {}) {
  const flags = { 'pf2e-visioner': { darknessRank: rank, heightenedDarkness: magical } };
  const origCanvas = global.canvas;
  global.canvas = {
    scene: {
      environment: { darknessLevel: 0.1, globalLight: { enabled: false } },
      darkness: 0.1,
      grid: { distance: 5 },
    },
    grid: { size: 100 },
    effects: {
      // Mock darkness sources for the LightingCalculator
      darknessSources: [
        {
          active: true,
          data: { bright: 10, dim: 20 },
          x: 500,
          y: 500,
          document: {
            hidden: false,
            config: { negative: true, bright: 10, dim: 20 },
            flags,
            getFlag: (mod, key) => flags?.[mod]?.[key],
          },
          shape: {
            intersectClipper: function (clipperPoints) {
              // Mock intersection - always return a simple intersection for testing
              return [clipperPoints];
            },
          },
        },
      ],
      lightSources: [],
      getDarknessLevel: () => 0.1,
    },
    lighting: {
      placeables: [
        {
          document: {
            hidden: false,
            config: { negative: true, bright: 10, dim: 20 },
            flags,
            getFlag: (mod, key) => flags?.[mod]?.[key],
          },
          emitsLight: false,
          x: 500,
          y: 500,
          shape: null,
        },
      ],
    },
    tokens: { placeables: [] },
    regions: { placeables: [] },
    visibility: { testVisibility: () => true },
    walls: { checkCollision: () => false },
  };
  return () => {
    global.canvas = origCanvas;
  };
}

describe('Darkness heightening and magical behavior', () => {
  it('non-heightened (rank 3): acts as darkness; darkvision sees observed; no DV hidden', () => {
    const teardown = setupSceneWithDarkness({ rank: 3, magical: false });
    try {
      const calc = LightingCalculator.getInstance();
      const va = VisionAnalyzer.getInstance();

      const pos = { x: 505, y: 505 };
      // Create a mock token with proper shape to avoid fallback case
      const mockToken = {
        shape: {
          points: [0, 0, 10, 0, 10, 10, 0, 10],
          clone: function () {
            return {
              points: [...this.points],
              toClipperPoints: function (options) {
                const clipperPoints = [];
                for (let i = 0; i < this.points.length; i += 2) {
                  clipperPoints.push({ X: this.points[i], Y: this.points[i + 1] });
                }
                return clipperPoints;
              },
            };
          },
        },
      };
      const light = calc.getLightLevelAt(pos, mockToken);
      expect(light.level).toBe('darkness');
      expect(light.isDarknessSource).toBe(true);
      expect(light.isHeightenedDarkness).toBe(false);

      // Test with darkvision - should see observed in rank 3 darkness
      const tokDV = makeToken(makeActorWithDarkvision(), 'dv1');
      const inputDV = {
        observer: {
          precise: {
            vision: { range: Infinity },
            darkvision: { range: Infinity },
            greaterDarkvision: null
          },
          imprecise: {},
          conditions: { blinded: false, deafened: false, dazzled: false }
        },
        target: {
          lightingLevel: 'darkness',
          coverLevel: 'none',
          concealment: false,
          auxiliary: []
        }
      };
      const resultDV = calculateVisibility(inputDV);
      expect(resultDV.state).toBe('observed');

      // Test without darkvision - should be hidden in darkness
      const tokNo = makeToken(makeActorWithoutDarkvision(), 'no1');
      const inputNo = {
        observer: {
          precise: { vision: { range: Infinity } },
          imprecise: {},
          conditions: { blinded: false, deafened: false, dazzled: false }
        },
        target: {
          lightingLevel: 'darkness',
          coverLevel: 'none',
          concealment: false,
          auxiliary: []
        }
      };
      const resultNo = calculateVisibility(inputNo);
      expect(resultNo.state).toBe('undetected');

      // Test with greater darkvision - should see observed in rank 3 darkness
      const tokG = makeToken(makeActorWithGreaterDarkvisionFeat(), 'gdv1');
      const inputG = {
        observer: {
          precise: {
            vision: { range: Infinity },
            darkvision: { range: Infinity },
            greaterDarkvision: { range: Infinity }
          },
          imprecise: {},
          conditions: { blinded: false, deafened: false, dazzled: false }
        },
        target: {
          lightingLevel: 'darkness',
          coverLevel: 'none',
          concealment: false,
          auxiliary: []
        }
      };
      const resultG = calculateVisibility(inputG);
      expect(resultG.state).toBe('observed');
    } finally {
      teardown();
    }
  });

  it('heightened (rank 4): magical darkness; darkvision sees concealed; greater DV observed; no DV hidden', () => {
    const teardown = setupSceneWithDarkness({ rank: 4, magical: false });
    try {
      const calc = LightingCalculator.getInstance();
      const va = VisionAnalyzer.getInstance();

      const pos = { x: 505, y: 505 };
      // Create a mock token with proper shape to avoid fallback case
      const mockToken = {
        shape: {
          points: [0, 0, 10, 0, 10, 10, 0, 10],
          clone: function () {
            return {
              points: [...this.points],
              toClipperPoints: function (options) {
                const clipperPoints = [];
                for (let i = 0; i < this.points.length; i += 2) {
                  clipperPoints.push({ X: this.points[i], Y: this.points[i + 1] });
                }
                return clipperPoints;
              },
            };
          },
        },
      };
      const light = calc.getLightLevelAt(pos, mockToken);
      expect(light.level).toBe('darkness');
      expect(light.isDarknessSource).toBe(true);
      expect(light.isHeightenedDarkness).toBe(true);

      // Test with darkvision - should see concealed in rank 4+ darkness
      const tokDV = makeToken(makeActorWithDarkvision(), 'dv2');
      const inputDV = {
        observer: {
          precise: {
            vision: { range: Infinity },
            darkvision: { range: Infinity },
            greaterDarkvision: null
          },
          imprecise: {},
          conditions: { blinded: false, deafened: false, dazzled: false }
        },
        target: {
          lightingLevel: 'greaterMagicalDarkness',
          coverLevel: 'none',
          concealment: false,
          auxiliary: []
        }
      };
      const resultDV = calculateVisibility(inputDV);
      expect(resultDV.state).toBe('concealed');

      // Test without darkvision - should be undetected in rank 4+ darkness
      const tokNo = makeToken(makeActorWithoutDarkvision(), 'no2');
      const inputNo = {
        observer: {
          precise: { vision: { range: Infinity } },
          imprecise: {},
          conditions: { blinded: false, deafened: false, dazzled: false }
        },
        target: {
          lightingLevel: 'greaterMagicalDarkness',
          coverLevel: 'none',
          concealment: false,
          auxiliary: []
        }
      };
      const resultNo = calculateVisibility(inputNo);
      expect(resultNo.state).toBe('undetected');

      // Test with greater darkvision - should see observed in rank 4+ darkness
      const tokG = makeToken(makeActorWithGreaterDarkvisionFeat(), 'gdv2');
      const inputG = {
        observer: {
          precise: {
            vision: { range: Infinity },
            darkvision: { range: Infinity },
            greaterDarkvision: { range: Infinity }
          },
          imprecise: {},
          conditions: { blinded: false, deafened: false, dazzled: false }
        },
        target: {
          lightingLevel: 'greaterMagicalDarkness',
          coverLevel: 'none',
          concealment: false,
          auxiliary: []
        }
      };
      const resultG = calculateVisibility(inputG);
      expect(resultG.state).toBe('observed');
    } finally {
      teardown();
    }
  });
});
