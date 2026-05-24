import '../../setup.js';

import { SpatialAnalysisService } from '../../../scripts/visibility/auto-visibility/core/SpatialAnalysisService.js';

describe('SpatialAnalysisService', () => {
  let originalRay;
  let originalWalls;

  beforeEach(() => {
    originalRay = global.foundry.canvas.geometry.Ray;
    originalWalls = global.canvas.walls;
    global.canvas.grid.size = 100;
  });

  afterEach(() => {
    global.foundry.canvas.geometry.Ray = originalRay;
    global.canvas.walls = originalWalls;
  });

  test('uses v14 wall placeables for optimized position visibility even when wall layer has no length', () => {
    const blockingWall = {
      coords: [50, -50, 50, 50],
      document: { move: 1, sight: 20, door: 0 },
    };
    global.canvas.walls = {
      ...global.canvas.walls,
      placeables: [blockingWall],
      quadtree: { getObjects: jest.fn(() => [blockingWall]) },
    };
    global.foundry.canvas.geometry.Ray = class MockRay {
      constructor(A, B) {
        this.A = A;
        this.B = B;
        this.bounds = {};
      }

      intersectSegment(coords) {
        return coords === blockingWall.coords;
      }
    };
    const service = new SpatialAnalysisService(
      { getTokenPosition: jest.fn(() => ({ x: 0, y: 0 })) },
      { isExcludedToken: jest.fn(() => false) },
      { incrementSpatialOptimizations: jest.fn(), updateMovementMetrics: jest.fn() },
    );
    const metrics = { raysCreated: 0, wallChecks: 0 };

    const result = service.canTokenSeePositionOptimized(
      { actor: {}, document: { elevation: 0 } },
      { x: 100, y: 0 },
      metrics,
    );

    expect(result).toBe(false);
    expect(global.canvas.walls.quadtree.getObjects).toHaveBeenCalledWith({});
    expect(metrics.wallChecks).toBe(1);
  });
});
