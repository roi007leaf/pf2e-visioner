import { LightingCalculator } from '../../../scripts/visibility/auto-visibility/LightingCalculator.js';

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

describe('LightingCalculator darkness source handling', () => {
  let origCanvas;
  beforeEach(() => {
    origCanvas = global.canvas;
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
              getFlag: () => undefined, // No special flags, just regular darkness
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
          // Darkness source: emitsLight false, negative flag true
          {
            document: { hidden: false, config: { negative: true, bright: 10, dim: 20 } },
            emitsLight: false,
            x: 500,
            y: 500,
            shape: null,
          },
        ],
      },
      tokens: { placeables: [] },
      regions: { placeables: [] },
    };
  });
  afterEach(() => {
    global.canvas = origCanvas;
  });

  it('treats darkness light source as darkness even if emitsLight is false', () => {
    const calc = LightingCalculator.getInstance();
    const posInside = { x: 505, y: 505 }; // within radius

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

    const res = calc.getLightLevelAt(posInside, mockToken);
    expect(res.level).toBe('darkness');
  });
});
