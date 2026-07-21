import { CoverRegionBehavior } from '../../../scripts/regions/CoverRegionBehavior.js';

describe('CoverRegionBehavior region shape containment', () => {
  test('does not apply override cover in the bounding-box gap between region shapes', () => {
    const region = {
      bounds: { x: 0, y: 0, width: 300, height: 100 },
      document: {
        testPoint: jest.fn(({ x, y }) => {
          const insideLeftShape = x >= 0 && x <= 100 && y >= 0 && y <= 100;
          const insideRightShape = x >= 200 && x <= 300 && y >= 0 && y <= 100;
          return insideLeftShape || insideRightShape;
        }),
      },
    };
    const behavior = {
      system: { mode: 'override', coverLevel: 'standard' },
    };

    const cover = CoverRegionBehavior._checkRegionCover(
      region,
      behavior,
      { x: -50, y: 50 },
      { x: 150, y: 50 },
    );

    expect(region.document.testPoint).toHaveBeenCalledWith({ x: 150, y: 50, z: 0 });
    expect(cover).toBeNull();
  });

  test('falls back to bounds when Foundry point testing is unavailable at runtime', () => {
    const region = {
      bounds: { x: 0, y: 0, width: 100, height: 100 },
      document: {
        testPoint: jest.fn(() => {
          throw new Error('testPoint unavailable');
        }),
      },
    };
    const behavior = {
      system: { mode: 'override', coverLevel: 'lesser' },
    };

    const cover = CoverRegionBehavior._checkRegionCover(
      region,
      behavior,
      { x: -50, y: 50 },
      { x: 50, y: 50 },
    );

    expect(cover).toBe('lesser');
  });
});
