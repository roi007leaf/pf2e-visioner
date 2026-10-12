import { LightingCalculator } from '../../../scripts/visibility/auto-visibility/LightingCalculator.js';

function makeToken(elevation) {
  return {
    document: { elevation, width: 1, height: 1, getFlag: () => undefined },
    shape: {
      points: [0, 0, 100, 0, 100, 100, 0, 100],
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
    },
  };
}

function makeDarknessRegion(elevation) {
  return {
    elevation,
    polygonTree: { testCircle: () => 1 },
    behaviors: [{ active: true, type: 'adjustDarknessLevel', system: { mode: 0, modifier: 1 } }],
  };
}

describe('LightingCalculator darkness region elevation bounds', () => {
  let origCanvas;
  let origPIXI;

  function setupCanvas(region) {
    global.canvas = {
      scene: {
        environment: {
          darknessLevel: 0,
          globalLight: { enabled: true, darkness: { min: 0, max: 0.75 } },
        },
        regions: [region],
        flags: {},
      },
      grid: { size: 100 },
      effects: { darknessSources: [], lightSources: [] },
    };
  }

  beforeEach(() => {
    origCanvas = global.canvas;
    origPIXI = global.PIXI;
    global.PIXI = { Polygon: function Polygon(points) { this.points = points; } };
  });

  afterEach(() => {
    global.canvas = origCanvas;
    global.PIXI = origPIXI;
  });

  it('ignores a lower-level darkness region whose exclusive top equals the token elevation', () => {
    setupCanvas(makeDarknessRegion({ bottom: -20, top: 0, topInclusive: false }));
    const result = LightingCalculator.getInstance().getLightLevelAt(
      { x: 50, y: 50, elevation: 0 },
      makeToken(0),
    );
    expect(result.level).toBe('bright');
  });

  it('applies a darkness region whose inclusive top equals the token elevation', () => {
    setupCanvas(makeDarknessRegion({ bottom: -20, top: 0, topInclusive: true }));
    const result = LightingCalculator.getInstance().getLightLevelAt(
      { x: 50, y: 50, elevation: 0 },
      makeToken(0),
    );
    expect(result.level).toBe('darkness');
  });

  it('applies a darkness region without topInclusive when the token is at its top', () => {
    setupCanvas(makeDarknessRegion({ bottom: -20, top: 0 }));
    const result = LightingCalculator.getInstance().getLightLevelAt(
      { x: 50, y: 50, elevation: 0 },
      makeToken(0),
    );
    expect(result.level).toBe('darkness');
  });

  it('applies a darkness region to a token inside its elevation range', () => {
    setupCanvas(makeDarknessRegion({ bottom: -20, top: 0, topInclusive: false }));
    const result = LightingCalculator.getInstance().getLightLevelAt(
      { x: 50, y: 50, elevation: -10 },
      makeToken(-10),
    );
    expect(result.level).toBe('darkness');
  });
});
