import { CoverRegionBehavior } from '../../../scripts/regions/CoverRegionBehavior.js';

describe('CoverRegionBehavior region shape containment', () => {
  test('uses RegionDocument point testing instead of its bounding box', () => {
    const region = {
      bounds: { x: 0, y: 0, width: 300, height: 100 },
      testPoint: jest.fn(() => false),
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

    expect(region.testPoint).toHaveBeenCalledWith({ x: 150, y: 50, elevation: 0 });
    expect(cover).toBeNull();
  });

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

    expect(region.document.testPoint).toHaveBeenCalledWith({ x: 150, y: 50, elevation: 0 });
    expect(cover).toBeNull();
  });

  test('does not apply line-of-sight cover when the ray crosses only a bounding-box gap', () => {
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
      system: { mode: 'lineOfSight', coverLevel: 'standard' },
    };

    const cover = CoverRegionBehavior._checkRegionCover(
      region,
      behavior,
      { x: 150, y: -50 },
      { x: 150, y: 150 },
    );

    expect(cover).toBeNull();
  });

  test('uses canonical RegionDocument polygons for diagonal line-of-sight geometry', () => {
    const region = {
      bounds: { x: 0, y: 0, width: 300, height: 300 },
      document: {
        polygons: [
          {
            points: [0, 100, 100, 0, 300, 200, 200, 300],
          },
        ],
        testPoint: jest.fn(() => false),
      },
    };
    const behavior = {
      system: { mode: 'lineOfSight', coverLevel: 'standard' },
    };

    const emptyCornerCover = CoverRegionBehavior._checkRegionCover(
      region,
      behavior,
      { x: -50, y: 100 },
      { x: 100, y: -50 },
    );
    const crossingCover = CoverRegionBehavior._checkRegionCover(
      region,
      behavior,
      { x: -50, y: 150 },
      { x: 350, y: 150 },
    );

    expect(emptyCornerCover).toBeNull();
    expect(crossingCover).toBe('standard');
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
