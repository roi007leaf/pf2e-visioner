import { LightingCalculator } from '../../scripts/visibility/auto-visibility/LightingCalculator.js';

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
    const res = calc.getLightLevelAt(posInside);
    expect(res.level).toBe('darkness');
  });
});
