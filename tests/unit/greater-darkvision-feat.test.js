import { LightingCalculator } from '../../scripts/visibility/auto-visibility/LightingCalculator.js';
import { VisionAnalyzer } from '../../scripts/visibility/auto-visibility/VisionAnalyzer.js';

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

// Mock the shape object to have the required methods
function createMockShape() {
  return {
    points: [0, 0, 10, 0, 10, 10, 0, 10], // Default square shape
    clone: function () {
      // Return a copy of this shape
      return createMockShape();
    },
    toClipperPoints: function (options) {
      // Convert points array to clipper format
      const clipperPoints = [];
      for (let i = 0; i < this.points.length; i += 2) {
        clipperPoints.push({ X: this.points[i], Y: this.points[i + 1] });
      }
      return clipperPoints;
    },
    intersectClipper: function (clipperPoints) {
      // Mock intersection - always return a simple intersection for testing
      return [clipperPoints];
    },
  };
}

// Minimal fake token/actor helpers
function makeActorWithFeat(slug) {
  return {
    type: 'character',
    system: { perception: { senses: {} } },
    itemTypes: {
      feat: [{ type: 'feat', system: { slug } }],
    },
    items: [{ type: 'feat', system: { slug } }],
    flags: {},
  };
}

function makeToken(actor) {
  return {
    actor,
    document: { id: 't1', getFlag: () => undefined },
    center: { x: 0, y: 0 },
  };
}

function setupDarknessScene() {
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
            getFlag: () => undefined, // No special flags, just regular darkness
          },
          shape: createMockShape(),
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
          shape: createMockShape(),
        },
      ],
    },
    tokens: { placeables: [] },
    regions: { placeables: [] },
    visibility: {
      // Fallback visibility used only by #hasDirectLineOfSight fallback in tests
      testVisibility: () => true,
    },
    walls: { checkCollision: () => false },
  };
  return () => {
    global.canvas = origCanvas;
  };
}

describe('Greater Darkvision from feat', () => {
  it('sets hasGreaterDarkvision when actor has the feat', () => {
    const actor = makeActorWithFeat('greater-darkvision');
    const token = makeToken(actor);
    const va = VisionAnalyzer.getInstance();
    const caps = va.getVisionCapabilities(token);
    expect(caps.hasDarkvision).toBe(true);
    expect(caps.hasGreaterDarkvision).toBe(true);
    expect(caps.darkvisionRange).toBe(Infinity);
  });

  it('observes targets in magical darkness if hasGreaterDarkvision', () => {
    const teardown = setupDarknessScene();
    try {
      const actor = makeActorWithFeat('greater-darkvision');
      const token = makeToken(actor);
      // Add a proper shape to the token to avoid the fallback case
      token.shape = createMockShape();
      const va = VisionAnalyzer.getInstance();

      const light = LightingCalculator.getInstance().getLightLevelAt({ x: 505, y: 505 }, token);
      const caps = va.getVisionCapabilities(token);
      const vis = va.determineVisibilityFromLighting(light, caps);
      expect(light.level).toBe('darkness');
      expect(vis).toBe('observed');
    } finally {
      teardown();
    }
  });
});
