import { LightingCalculator } from '../../../scripts/visibility/auto-visibility/LightingCalculator.js';
import { VisionAnalyzer } from '../../../scripts/visibility/auto-visibility/VisionAnalyzer.js';
import { calculateVisibilityFromTokens } from '../../../scripts/visibility/VisibilityCalculatorAdapter.js';

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

  it('lets regular darkvision observe targets inside an unranked darkness light', async () => {
    const calc = LightingCalculator.getInstance();
    const shape = {
      points: [0, 0, 10, 0, 10, 10, 0, 10],
      clone() {
        return {
          points: [...this.points],
          toClipperPoints() {
            const clipperPoints = [];
            for (let i = 0; i < this.points.length; i += 2) {
              clipperPoints.push({ X: this.points[i], Y: this.points[i + 1] });
            }
            return clipperPoints;
          },
        };
      },
    };

    const observer = {
      name: 'Darkvision Observer',
      actor: { system: { perception: { senses: { darkvision: { range: Infinity } } } } },
      document: { id: 'observer', x: 0, y: 0, width: 1, height: 1, getFlag: () => undefined },
      center: { x: 50, y: 50 },
      shape,
      x: 0,
      y: 0,
    };
    const target = {
      name: 'Target Inside Darkness',
      actor: { system: { traits: { value: [] } }, conditions: [] },
      document: { id: 'target', x: 455, y: 455, width: 1, height: 1, getFlag: () => undefined },
      center: { x: 505, y: 505 },
      shape,
      x: 455,
      y: 455,
    };

    const result = await calculateVisibilityFromTokens(observer, target, {
      lightingCalculator: calc,
      visionAnalyzer: {
        getVisionCapabilities: () => ({
          hasVision: true,
          hasDarkvision: true,
          hasGreaterDarkvision: false,
          darkvisionRange: Infinity,
          sensingSummary: {
            precise: [
              { type: 'vision', range: Infinity },
              { type: 'darkvision', range: Infinity },
            ],
            imprecise: [],
          },
        }),
        hasLineOfSight: () => true,
        isSoundBlocked: () => false,
      },
      conditionManager: {
        isBlinded: () => false,
        isDeafened: () => false,
        isDazzled: () => false,
      },
      lightingRasterService: null,
    });

    expect(result.state).toBe('observed');
    expect(result.detection?.sense).toBe('darkvision');
  });

  it('uses system perception darkvision even when prepared senses are present', async () => {
    const calc = LightingCalculator.getInstance();
    const visionAnalyzer = VisionAnalyzer.getInstance();
    visionAnalyzer.clearCache();
    const shape = {
      points: [0, 0, 10, 0, 10, 10, 0, 10],
      clone() {
        return {
          points: [...this.points],
          toClipperPoints() {
            const clipperPoints = [];
            for (let i = 0; i < this.points.length; i += 2) {
              clipperPoints.push({ X: this.points[i], Y: this.points[i + 1] });
            }
            return clipperPoints;
          },
        };
      },
    };

    const observer = {
      name: 'Ezren',
      actor: {
        system: {
          perception: {
            senses: {
              darkvision: { acuity: 'precise', range: Infinity },
            },
          },
        },
        perception: {
          senses: new Map([
            ['hearing', { type: 'hearing', acuity: 'imprecise', range: Infinity }],
          ]),
        },
        itemTypes: { feat: [] },
        items: [],
        conditions: [],
      },
      document: { id: 'ezren', x: 0, y: 0, width: 1, height: 1, getFlag: () => undefined },
      center: { x: 50, y: 50 },
      shape,
      x: 0,
      y: 0,
    };
    const target = {
      name: 'Target Inside Darkness',
      actor: { system: { traits: { value: [] } }, conditions: [] },
      document: { id: 'target', x: 455, y: 455, width: 1, height: 1, getFlag: () => undefined },
      center: { x: 505, y: 505 },
      shape,
      x: 455,
      y: 455,
    };

    const result = await calculateVisibilityFromTokens(
      observer,
      target,
      {
        lightingCalculator: calc,
        visionAnalyzer,
        conditionManager: {
          isBlinded: () => false,
          isDeafened: () => false,
          isDazzled: () => false,
        },
        lightingRasterService: null,
      },
      { skipLOS: true },
    );

    expect(result.state).toBe('observed');
    expect(result.detection?.sense).toBe('darkvision');
  });
});
