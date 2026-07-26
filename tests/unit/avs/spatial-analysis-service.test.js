import '../../setup.js';

import { SpatialAnalysisService } from '../../../scripts/visibility/auto-visibility/core/SpatialAnalysisService.js';
import { ViewportFilterService } from '../../../scripts/visibility/auto-visibility/core/ViewportFilterService.js';

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

  test('does not position or index Foundry-hidden tokens for movement analysis', () => {
    const hidden = { actor: {}, document: { id: 'hidden', hidden: true } };
    global.canvas.tokens.placeables = [hidden];
    const positionManager = {
      getTokenPosition: jest.fn(() => ({ x: 0, y: 0 })),
    };
    const service = new SpatialAnalysisService(
      positionManager,
      { isExcludedToken: jest.fn((token) => token.document.hidden) },
      { incrementSpatialOptimizations: jest.fn(), updateMovementMetrics: jest.fn() },
    );

    expect(service.getAffectedTokensByMovement({ x: 0, y: 0 }, { x: 100, y: 0 }, 'moving')).toEqual(
      new Set(),
    );
    expect(positionManager.getTokenPosition).not.toHaveBeenCalled();
  });

  test('does not resolve viewport positions for Foundry-hidden tokens', () => {
    const hidden = { document: { id: 'hidden', hidden: true } };
    global.canvas.tokens.placeables = [hidden];
    global.canvas.app = { renderer: { screen: { width: 1920, height: 1080 } } };
    global.canvas.stage = { worldTransform: {
      applyInverse: jest.fn((point) => point),
    } };
    const positionProvider = jest.fn(() => ({ x: 0, y: 0 }));

    expect(new ViewportFilterService().getViewportTokenIdSet(64, null, positionProvider)).toEqual(
      new Set(),
    );
    expect(positionProvider).not.toHaveBeenCalled();
  });
});
