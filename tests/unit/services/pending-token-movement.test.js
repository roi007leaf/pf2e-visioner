import '../../setup.js';

import { flushScheduledCanvasPerceptionUpdate } from '../../../scripts/helpers/perception-refresh.js';
import { legacyVisibilityToProfile } from '../../../scripts/visibility/perception-profile.js';
import {
  clearPendingTokenMovementPosition,
  completePendingTokenMovement,
  getPendingMovementBlockContext,
  getPendingMovementPerformanceSnapshot,
  getPendingMovementRefreshTargetIds,
  getPendingTokenMovementPosition,
  primePendingControlledTokenDragIntent,
  releasePendingControlledTokenDragIntent,
  resetPendingMovementPerformanceCounters,
  schedulePendingTokenMovementCompletion,
  setPendingTokenMovementPosition,
} from '../../../scripts/services/PendingMovement/pending-token-movement.js';
import {
  getPendingMovementBlockedDetectionSources,
  shouldUseCoreDetectionDuringPendingMovement,
  shouldTemporarilyBlockHiddenDetection,
} from '../../../scripts/services/PendingMovement/pending-movement-detection-gate.js';
import { currentPendingMovementSightLineSeesTarget } from '../../../scripts/services/PendingMovement/pending-movement-sight-line.js';
import { withPendingMovementEvaluationCache } from '../../../scripts/services/PendingMovement/pending-movement-evaluation-cache.js';
import { lineIntersectsLimitedWall } from '../../../scripts/services/PendingMovement/pending-movement-wall-blocking.js';
import {
  scheduleAnimationRenderRefreshes,
  schedulePostCompletionRenderRefreshes,
} from '../../../scripts/services/PendingMovement/pending-movement-refresh-scheduler.js';
import {
  clearMovementPerformanceDiagnosticsEnabled,
  setMovementPerformanceDiagnosticsEnabled,
} from '../../../scripts/services/runtime-state.js';
import {
  clearNoObserverDetectionFilterVisuals,
  capturePendingMovementDetectionFilterState,
  forcePendingMovementTokenInvisible,
  forceTokenInvisibleForObserverVisibility,
  refreshPendingMovementTokenVisibility,
  restorePendingMovementDetectionFilterState,
  restorePendingMovementTokenRendering,
  shouldSuppressPendingMovementDetectionFilterVisuals,
  shouldTemporarilyForceTokenInvisible,
  suppressPendingMovementDetectionFilterVisualsForObservedTransition,
} from '../../../scripts/services/PendingMovement/pending-movement-render-lock.js';

function visibilityV2Map(map) {
  return Object.fromEntries(
    Object.entries(map).map(([targetId, state]) => [targetId, legacyVisibilityToProfile(state)]),
  );
}

function visibilityV2Flags(map) {
  return {
    'pf2e-visioner': {
      visibilityV2: visibilityV2Map(map),
    },
  };
}

const WALL_SENSE_TYPES = {
  NONE: 0,
  LIMITED: 10,
  NORMAL: 20,
  PROXIMITY: 30,
  DISTANCE: 40,
};

describe('pending token movement hidden detection guard', () => {
  let originalCanvas;
  let originalConst;

  beforeEach(() => {
    originalCanvas = global.canvas;
    originalConst = global.CONST;
    global.canvas = {
      ...global.canvas,
      grid: { size: 50 },
      walls: {
        placeables: [
          {
            document: {
              id: 'wall',
              c: [100, 0, 100, 200],
              sight: 1,
              door: 0,
              ds: 0,
            },
          },
        ],
      },
    };
  });

  afterEach(() => {
    jest.useRealTimers();
    clearPendingTokenMovementPosition('observer');
    clearMovementPerformanceDiagnosticsEnabled();
    releasePendingControlledTokenDragIntent(null, { delayMs: 0 });
    global.game.user.id = undefined;
    global.game.user.isGM = true;
    global.canvas = originalCanvas;
    if (originalConst === undefined) delete global.CONST;
    else global.CONST = originalConst;
  });

  test('does not guard hidden detection without a pending controlled-token movement', () => {
    const observer = createMockToken({ id: 'observer', x: 0, y: 0 });
    const target = createMockToken({ id: 'target', x: 3, y: 0 });

    expect(shouldTemporarilyBlockHiddenDetection(observer, target, 'hidden')).toBe(false);
  });

  test('guards hidden detection when pending movement crosses a sight-blocking wall', () => {
    const observer = createMockToken({ id: 'observer', x: 0, y: 0 });
    const target = createMockToken({ id: 'target', x: 3, y: 0 });
    const tokenDoc = {
      id: 'observer',
      x: 0,
      y: 0,
    };

    setPendingTokenMovementPosition(tokenDoc, { x: 0, y: 0 }, [observer]);

    expect(shouldTemporarilyBlockHiddenDetection(observer, target, 'hidden')).toBe(true);
  });

  test('guards hidden detection when document already reached destination but token visual is still at start', () => {
    const observer = createMockToken({ id: 'observer', x: 0, y: 0 });
    observer.document.object = observer;
    observer.document.x = 150;
    observer.document.y = 0;
    observer.x = 0;
    observer.y = 0;
    const target = createMockToken({ id: 'target', x: 3, y: 0 });

    setPendingTokenMovementPosition(observer.document, { x: 150, y: 0 }, [observer]);

    expect(shouldTemporarilyBlockHiddenDetection(observer, target, 'hidden')).toBe(true);
  });

  test('guards hidden detection when a waypoint crosses a wall even if the final point is clear', () => {
    const observer = createMockToken({ id: 'observer', x: 3, y: 3 });
    const target = createMockToken({ id: 'target', x: 3, y: 0 });

    setPendingTokenMovementPosition(
      observer.document,
      { x: 150, y: 50 },
      [observer],
      {
        waypoints: [{ x: 0, y: 0 }],
      },
    );

    expect(shouldTemporarilyBlockHiddenDetection(observer, target, 'hidden')).toBe(true);
  });

  test('caps route point checks for long waypoint movement', () => {
    let sightReads = 0;
    global.canvas.walls.placeables = [
      {
        document: {
          id: 'far-wall',
          c: [10000, 0, 10000, 100],
          get sight() {
            sightReads += 1;
            return 1;
          },
          door: 0,
          ds: 0,
        },
      },
    ];
    const observer = createMockToken({ id: 'observer', x: 0, y: 5 });
    const target = createMockToken({ id: 'target', x: 0, y: 0 });
    const waypoints = Array.from({ length: 120 }, (_, index) => ({
      x: (index + 1) * 50,
      y: 250,
    }));

    setPendingTokenMovementPosition(
      observer.document,
      { x: 6100, y: 250 },
      [observer],
      { waypoints },
    );

    expect(shouldTemporarilyBlockHiddenDetection(observer, target, 'hidden')).toBe(false);
    expect(sightReads).toBeLessThanOrEqual(96);
  });

  test('reuses route wall-block result across repeated checks for unchanged movement', () => {
    let sightReads = 0;
    global.canvas.walls.placeables = [
      {
        document: {
          id: 'open-sight-wall',
          c: [100, -10000, 100, 10000],
          get sight() {
            sightReads += 1;
            return 0;
          },
          door: 0,
          ds: 0,
        },
      },
    ];
    const observer = createMockToken({ id: 'observer', x: 0, y: 5 });
    const target = createMockToken({ id: 'target', x: 0, y: 0 });
    const waypoints = Array.from({ length: 120 }, (_, index) => ({
      x: (index + 1) * 50,
      y: 250,
    }));

    setPendingTokenMovementPosition(
      observer.document,
      { x: 6100, y: 250 },
      [observer],
      { waypoints },
    );

    expect(shouldTemporarilyBlockHiddenDetection(observer, target, 'hidden')).toBe(false);
    const firstReadCount = sightReads;
    expect(firstReadCount).toBeGreaterThan(0);

    expect(shouldTemporarilyBlockHiddenDetection(observer, target, 'hidden')).toBe(false);
    expect(sightReads).toBe(firstReadCount);
  });

  test('does not rescan wall geometry after cached route wall-block result', () => {
    let geometryReads = 0;
    global.canvas.walls.placeables = Array.from({ length: 1000 }, (_, index) => ({
      document: {
        id: `wall-${index}`,
        get c() {
          geometryReads += 1;
          return [10000 + index, 0, 10000 + index, 100];
        },
        sight: 1,
        sound: 1,
        door: 0,
        ds: 0,
      },
    }));
    const observer = createMockToken({ id: 'observer', x: 0, y: 5 });
    const target = createMockToken({ id: 'target', x: 0, y: 0 });
    const waypoints = Array.from({ length: 120 }, (_, index) => ({
      x: (index + 1) * 50,
      y: 250,
    }));

    setPendingTokenMovementPosition(
      observer.document,
      { x: 6100, y: 250 },
      [observer],
      { waypoints },
    );

    expect(shouldTemporarilyBlockHiddenDetection(observer, target, 'hidden')).toBe(false);
    const firstGeometryReadCount = geometryReads;
    expect(firstGeometryReadCount).toBeGreaterThan(0);

    expect(shouldTemporarilyBlockHiddenDetection(observer, target, 'hidden')).toBe(false);
    expect(geometryReads).toBe(firstGeometryReadCount);
  });

  test('does not rescan sound wall geometry after cached wall-blocked context', () => {
    let geometryReads = 0;
    global.canvas.walls.placeables = Array.from({ length: 1000 }, (_, index) => ({
      document: {
        id: `wall-${index}`,
        get c() {
          geometryReads += 1;
          return index === 0 ? [100, 0, 100, 200] : [10000 + index, 0, 10000 + index, 100];
        },
        sight: 1,
        sound: 0,
        door: 0,
        ds: 0,
      },
    }));
    const observer = createMockToken({ id: 'observer', x: 0, y: 0 });
    const target = createMockToken({ id: 'target', x: 3, y: 0 });

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);

    const context = getPendingMovementBlockContext(observer, target);
    expect(context.wallBlocked).toBe(true);
    expect(context.wallDetectionBlocked).toBe(false);
    const firstGeometryReadCount = geometryReads;
    expect(firstGeometryReadCount).toBeGreaterThan(0);

    const cachedContext = getPendingMovementBlockContext(observer, target);
    expect(cachedContext.wallBlocked).toBe(true);
    expect(cachedContext.wallDetectionBlocked).toBe(false);
    expect(geometryReads).toBe(firstGeometryReadCount);
  });

  test('caps total route point checks across simultaneous movement', () => {
    let sightReads = 0;
    global.canvas.walls.placeables = [
      {
        document: {
          id: 'far-wall',
          c: [10000, 0, 10000, 100],
          get sight() {
            sightReads += 1;
            return 1;
          },
          door: 0,
          ds: 0,
        },
      },
    ];
    const target = createMockToken({ id: 'target', x: 0, y: 0 });
    const observers = Array.from({ length: 4 }, (_, index) =>
      createMockToken({ id: `observer-${index}`, x: 0, y: index + 5 }),
    );
    const waypoints = Array.from({ length: 120 }, (_, index) => ({
      x: (index + 1) * 50,
      y: 250,
    }));

    try {
      for (const observer of observers) {
        setPendingTokenMovementPosition(
          observer.document,
          { x: 6100, y: observer.document.y * 50 },
          [observer],
          { waypoints },
        );
      }

      expect(
        getPendingMovementBlockedDetectionSources(target, {
          visionSources: observers.map((observer) => ({ active: true, object: observer })),
          lightSources: [],
        }),
      ).toEqual([]);
      expect(sightReads).toBeLessThanOrEqual(256);
    } finally {
      for (const observer of observers) {
        clearPendingTokenMovementPosition(observer.id);
      }
    }
  });

  test('treats active LOS polygon as observed through the first limited sight wall', () => {
    global.CONST = {
      ...(global.CONST || {}),
      WALL_SENSE_TYPES,
      EDGE_SENSE_TYPES: WALL_SENSE_TYPES,
    };
    global.canvas.walls.placeables = [
      createMockWall({
        id: 'terrain-wall',
        c: [100, 0, 100, 200],
        sight: WALL_SENSE_TYPES.LIMITED,
        sound: WALL_SENSE_TYPES.NONE,
      }),
    ];
    const observer = createMockToken({ id: 'observer', x: 0, y: 0 });
    const target = createMockToken({ id: 'target', x: 3, y: 0 });
    target.document.getVisibilityTestPoints = jest.fn(() => [{ x: 175, y: 25 }]);
    global.canvas.effects = {
      visionSources: [
        {
          active: true,
          object: observer,
          los: { contains: jest.fn(() => true) },
        },
      ],
      lightSources: [],
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);

    expect(currentPendingMovementSightLineSeesTarget(observer, target)).toBe(true);
  });

  test('reuses current sight-line evaluation inside one pending movement cache scope', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({ id: 'observer', x: 0, y: 0 });
    const target = createMockToken({ id: 'target', x: 3, y: 0 });
    const los = { contains: jest.fn(() => true) };
    target.document.getVisibilityTestPoints = jest.fn(() => [target.center]);
    global.canvas.effects = {
      visionSources: [
        {
          active: true,
          object: observer,
          los,
        },
      ],
      lightSources: [],
    };

    withPendingMovementEvaluationCache(() => {
      expect(currentPendingMovementSightLineSeesTarget(observer, target)).toBe(true);
      expect(currentPendingMovementSightLineSeesTarget(observer, target)).toBe(true);
    });

    expect(target.document.getVisibilityTestPoints).toHaveBeenCalledTimes(1);

    los.contains.mockReturnValue(false);
    target.document.getVisibilityTestPoints = jest.fn(() => [target.center]);

    expect(currentPendingMovementSightLineSeesTarget(observer, target)).toBe(false);
    expect(target.document.getVisibilityTestPoints).toHaveBeenCalledTimes(1);
  });

  test('reuses active sight source lookup for one observer across targets in one cache scope', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({ id: 'observer', x: 0, y: 0 });
    const firstTarget = createMockToken({ id: 'first-target', x: 3, y: 0 });
    const secondTarget = createMockToken({ id: 'second-target', x: 4, y: 0 });
    let sourceIterations = 0;
    global.canvas.effects = {
      visionSources: {
        *[Symbol.iterator]() {
          sourceIterations += 1;
          yield {
            active: true,
            object: observer,
            los: { contains: jest.fn(() => true) },
          };
        },
      },
      lightSources: [],
    };

    withPendingMovementEvaluationCache(() => {
      expect(currentPendingMovementSightLineSeesTarget(observer, firstTarget)).toBe(true);
      expect(currentPendingMovementSightLineSeesTarget(observer, secondTarget)).toBe(true);
    });

    expect(sourceIterations).toBe(1);

    expect(currentPendingMovementSightLineSeesTarget(observer, firstTarget)).toBe(true);
    expect(sourceIterations).toBe(2);
  });

  test('reuses source-list conversion inside one pending movement cache scope', () => {
    const observer = createMockToken({ id: 'observer', x: 0, y: 0 });
    const target = createMockToken({ id: 'target', x: 3, y: 0 });
    let sourceIterations = 0;
    const visionSources = {
      *[Symbol.iterator]() {
        sourceIterations += 1;
        yield { active: true, object: observer };
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);

    withPendingMovementEvaluationCache(() => {
      expect(
        getPendingMovementBlockedDetectionSources(target, {
          visionSources,
          lightSources: [],
        }),
      ).toHaveLength(1);
      expect(
        getPendingMovementBlockedDetectionSources(target, {
          visionSources,
          lightSources: [],
        }),
      ).toHaveLength(1);
    });

    expect(sourceIterations).toBe(1);
  });

  test('does not treat active LOS polygon as observed through a second limited sight wall', () => {
    global.CONST = {
      ...(global.CONST || {}),
      WALL_SENSE_TYPES,
      EDGE_SENSE_TYPES: WALL_SENSE_TYPES,
    };
    global.canvas.walls.placeables = [
      createMockWall({
        id: 'near-terrain-wall',
        c: [100, 0, 100, 200],
        sight: WALL_SENSE_TYPES.LIMITED,
        sound: WALL_SENSE_TYPES.NONE,
      }),
      createMockWall({
        id: 'far-terrain-wall',
        c: [200, 0, 200, 200],
        sight: WALL_SENSE_TYPES.LIMITED,
        sound: WALL_SENSE_TYPES.NONE,
      }),
    ];
    const observer = createMockToken({ id: 'observer', x: 0, y: 0 });
    const target = createMockToken({ id: 'target', x: 5, y: 0 });
    target.document.getVisibilityTestPoints = jest.fn(() => [{ x: 275, y: 25 }]);
    global.canvas.effects = {
      visionSources: [
        {
          active: true,
          object: observer,
          los: { contains: jest.fn(() => true) },
        },
      ],
      lightSources: [],
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);

    expect(currentPendingMovementSightLineSeesTarget(observer, target)).toBe(false);
  });

  test('allows active LOS polygon through proximity sight walls inside threshold', () => {
    global.CONST = {
      ...(global.CONST || {}),
      WALL_SENSE_TYPES,
      EDGE_SENSE_TYPES: WALL_SENSE_TYPES,
    };
    global.canvas.scene.grid.distance = 5;
    global.canvas.walls.placeables = [
      {
        document: {
          id: 'proximity-wall',
          c: [50, 0, 50, 200],
          sight: WALL_SENSE_TYPES.PROXIMITY,
          sound: WALL_SENSE_TYPES.NONE,
          threshold: { sight: 3 },
          door: 0,
          ds: 0,
        },
      },
    ];
    const observer = createMockToken({ id: 'observer', x: 0, y: 0 });
    const target = createMockToken({ id: 'target', x: 2, y: 0 });
    target.document.getVisibilityTestPoints = jest.fn(() => [{ x: 125, y: 25 }]);
    global.canvas.effects = {
      visionSources: [
        {
          active: true,
          object: observer,
          los: { contains: jest.fn(() => true) },
        },
      ],
      lightSources: [],
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);

    expect(currentPendingMovementSightLineSeesTarget(observer, target)).toBe(true);
  });

  test('blocks active LOS polygon through proximity sight walls outside threshold', () => {
    global.CONST = {
      ...(global.CONST || {}),
      WALL_SENSE_TYPES,
      EDGE_SENSE_TYPES: WALL_SENSE_TYPES,
    };
    global.canvas.scene.grid.distance = 5;
    global.canvas.walls.placeables = [
      {
        document: {
          id: 'proximity-wall',
          c: [100, 0, 100, 200],
          sight: WALL_SENSE_TYPES.PROXIMITY,
          sound: WALL_SENSE_TYPES.NONE,
          threshold: { sight: 1 },
          door: 0,
          ds: 0,
        },
      },
    ];
    const observer = createMockToken({ id: 'observer', x: 0, y: 0 });
    const target = createMockToken({ id: 'target', x: 3, y: 0 });
    target.document.getVisibilityTestPoints = jest.fn(() => [{ x: 175, y: 25 }]);
    global.canvas.effects = {
      visionSources: [
        {
          active: true,
          object: observer,
          los: { contains: jest.fn(() => true) },
        },
      ],
      lightSources: [],
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);

    expect(currentPendingMovementSightLineSeesTarget(observer, target)).toBe(false);
  });

  test('does not block hearing through limited sound walls during final movement prediction', () => {
    global.CONST = {
      ...(global.CONST || {}),
      WALL_SENSE_TYPES,
      EDGE_SENSE_TYPES: WALL_SENSE_TYPES,
    };
    global.canvas.walls.placeables = [
      createMockWall({
        id: 'limited-sound-wall',
        c: [100, 0, 100, 200],
        sight: WALL_SENSE_TYPES.NORMAL,
        sound: WALL_SENSE_TYPES.LIMITED,
      }),
    ];
    const observer = createMockToken({
      id: 'observer',
      x: 0,
      y: 0,
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    observer._animation = { state: 'running', promise: Promise.resolve() };
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer], {
      predictFinalVisibility: () => new Promise(() => {}),
    });

    expect(shouldUseCoreDetectionDuringPendingMovement(observer, target)).toBe(true);
    expect(shouldTemporarilyForceTokenInvisible(target)).toBe(false);
  });

  test('limits pending movement hearing from the pending observer position', () => {
    global.CONST = {
      ...(global.CONST || {}),
      WALL_SENSE_TYPES,
      EDGE_SENSE_TYPES: WALL_SENSE_TYPES,
    };
    global.canvas.scene = {
      ...(global.canvas.scene || {}),
      id: 'active-scene',
      grid: { distance: 5 },
      flags: { pf2e: { hearingRange: 10 } },
    };
    global.canvas.walls.placeables = [
      createMockWall({
        id: 'sight-wall-open-sound',
        c: [0, -100, 0, 200],
        sight: WALL_SENSE_TYPES.NORMAL,
        sound: WALL_SENSE_TYPES.NONE,
      }),
    ];
    const observer = createMockToken({
      id: 'observer',
      x: 0,
      y: 0,
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', x: 2, y: 0, visible: true });
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: -150, y: 0 }, [observer], {
      predictFinalVisibility: () => new Promise(() => {}),
    });

    const context = getPendingMovementBlockContext(observer, target);

    expect(context.wallBlocked).toBe(true);
    expect(context.soundBlocked).toBe(true);
    expect(context.wallDetectionBlocked).toBe(true);
  });

  test('keeps hidden soundwave visible while dragging past limited sound but blocked sight', () => {
    global.CONST = {
      ...(global.CONST || {}),
      WALL_SENSE_TYPES,
      EDGE_SENSE_TYPES: WALL_SENSE_TYPES,
    };
    global.canvas.walls.placeables = [
      createMockWall({
        id: 'limited-sight-sound-wall',
        c: [100, 0, 100, 200],
        sight: WALL_SENSE_TYPES.LIMITED,
        sound: WALL_SENSE_TYPES.LIMITED,
      }),
      createMockWall({
        id: 'normal-sight-open-sound-wall',
        c: [200, 0, 200, 200],
        sight: WALL_SENSE_TYPES.NORMAL,
        sound: WALL_SENSE_TYPES.NONE,
      }),
    ];
    const observer = createMockToken({
      id: 'observer',
      x: 0,
      y: 0,
      controlled: true,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', x: 5, y: 0, visible: true });
    target.detectionFilter = { id: 'limited-wall-soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: [
        {
          active: true,
          object: observer,
          los: { contains: jest.fn(() => false) },
        },
      ],
        lightSources: [],
      },
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    primePendingControlledTokenDragIntent(observer, { refreshDelayMs: 0 });

    expect(currentPendingMovementSightLineSeesTarget(observer, target)).toBe(false);
    expect(shouldTemporarilyForceTokenInvisible(target)).toBe(false);
  });

  test('keeps Visioner-hidden soundwave visible during drag even when wall blocks sound', () => {
    global.CONST = {
      ...(global.CONST || {}),
      WALL_SENSE_TYPES,
      EDGE_SENSE_TYPES: WALL_SENSE_TYPES,
    };
    global.canvas.walls.placeables = [
      createMockWall({
        id: 'near-limited-sight-sound-wall',
        c: [100, 0, 100, 200],
        sight: WALL_SENSE_TYPES.LIMITED,
        sound: WALL_SENSE_TYPES.LIMITED,
      }),
      createMockWall({
        id: 'far-limited-sight-sound-wall',
        c: [200, 0, 200, 200],
        sight: WALL_SENSE_TYPES.LIMITED,
        sound: WALL_SENSE_TYPES.LIMITED,
      }),
    ];
    const observer = createMockToken({
      id: 'observer',
      x: 0,
      y: 0,
      controlled: true,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', x: 5, y: 0, visible: true });
    target.detectionFilter = { id: 'blocked-sound-hidden-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: [
          {
            active: true,
            object: observer,
            los: { contains: jest.fn(() => false) },
          },
        ],
        lightSources: [],
      },
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    primePendingControlledTokenDragIntent(observer, { refreshDelayMs: 0 });

    expect(currentPendingMovementSightLineSeesTarget(observer, target)).toBe(false);
    expect(shouldTemporarilyForceTokenInvisible(target)).toBe(false);
  });

  test('keeps hidden soundwave when limited wall LOS polygon contains target during drag', () => {
    global.CONST = {
      ...(global.CONST || {}),
      WALL_SENSE_TYPES,
      EDGE_SENSE_TYPES: WALL_SENSE_TYPES,
    };
    global.canvas.walls.placeables = [
      createMockWall({
        id: 'limited-sight-sound-wall',
        c: [100, 0, 100, 200],
        sight: WALL_SENSE_TYPES.LIMITED,
        sound: WALL_SENSE_TYPES.LIMITED,
      }),
    ];
    const observer = createMockToken({
      id: 'observer',
      x: 0,
      y: 0,
      controlled: true,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.detectionFilter = { id: 'limited-wall-soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: [
          {
            active: true,
            object: observer,
            los: { contains: jest.fn(() => true) },
          },
        ],
        lightSources: [],
      },
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    primePendingControlledTokenDragIntent(observer, { refreshDelayMs: 0 });

    expect(lineIntersectsLimitedWall(observer.center, target.center, 'sight')).toBe(true);
    expect(currentPendingMovementSightLineSeesTarget(observer, target)).toBe(true);
    expect(shouldSuppressPendingMovementDetectionFilterVisuals(target)).toBe(false);
    expect(shouldTemporarilyForceTokenInvisible(target)).toBe(false);
  });

  test('guards hidden detection for a controlled token drag preview source', () => {
    const original = createMockToken({ id: 'observer', x: 3, y: 3 });
    const preview = {
      ...createMockToken({ id: 'observer-preview', x: 0, y: 0 }),
      isPreview: true,
      _previewType: 'drag',
      _original: original,
    };
    const target = createMockToken({ id: 'target', x: 3, y: 0 });
    global.canvas = {
      ...global.canvas,
      tokens: {
        controlled: [original],
      },
    };

    expect(shouldTemporarilyBlockHiddenDetection(preview, target, 'hidden')).toBe(true);
  });

  test('uses core LOS for controlled drag preview before final movement prediction exists', () => {
    global.canvas.walls.placeables = [];
    const original = createMockToken({
      id: 'observer',
      x: 0,
      y: 0,
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const preview = {
      ...createMockToken({ id: 'observer-preview', x: 1, y: 0 }),
      isPreview: true,
      _previewType: 'drag',
      _original: original,
    };
    const target = createMockToken({ id: 'target', x: 3, y: 0 });
    global.canvas = {
      ...global.canvas,
      tokens: {
        controlled: [original],
        get: jest.fn((id) => (id === 'observer' ? original : null)),
        placeables: [original, target],
      },
    };

    expect(shouldUseCoreDetectionDuringPendingMovement(preview, target)).toBe(true);
    expect(shouldTemporarilyBlockHiddenDetection(preview, target, 'hidden')).toBe(false);
  });

  test('refreshes target visibility during committed movement animation', () => {
    jest.useFakeTimers();

    global.canvas.walls.placeables = [];
    const original = createMockToken({
      id: 'observer',
      x: 0,
      y: 0,
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    original.controlled = true;
    const target = createMockToken({ id: 'target', x: 3, y: 0 });
    target.refresh = jest.fn();
    global.canvas = {
      ...global.canvas,
      tokens: {
        controlled: [original],
        get: jest.fn((id) => (id === 'observer' ? original : id === 'target' ? target : null)),
        placeables: [original, target],
        _draggedToken: original,
      },
      effects: {
        visionSources: new Map([['observer', { active: true, object: original }]]),
        lightSources: new Map(),
      },
    };

    setPendingTokenMovementPosition(original.document, { x: 100, y: 0 }, [original], {
      predictFinalVisibility: () => new Promise(() => { }),
    });
    schedulePendingTokenMovementCompletion(original.document);
    jest.advanceTimersByTime(250);

    expect(target.refresh).toHaveBeenCalled();
  });

  test('publishes prioritized final visibility predictions before the full scene finishes', async () => {
    jest.useFakeTimers();
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      x: 0,
      y: 0,
      flags: visibilityV2Flags({ target: 'undetected', other: 'observed' }),
    });
    const other = createMockToken({ id: 'other', x: 5, y: 0 });
    const target = createMockToken({ id: 'target', x: 3, y: 0 });
    target.refresh = jest.fn();

    let releaseOther;
    const slowOtherPrediction = new Promise((resolve) => {
      releaseOther = () => resolve('observed');
    });
    const calculateFinalVisibility = jest.fn((observerArg, targetArg) => {
      if (targetArg?.document?.id === 'target') return Promise.resolve('hidden');
      if (targetArg?.document?.id === 'other') return slowOtherPrediction;
      return Promise.resolve('observed');
    });

    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) =>
          id === 'observer' ? observer : id === 'target' ? target : id === 'other' ? other : null,
        ),
        placeables: [observer, other, target],
      },
      effects: {
        visionSources: new Map([['observer', { active: true, object: observer }]]),
        lightSources: new Map(),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer], {
      predictFinalVisibility: true,
      calculateFinalVisibility,
    });

    await Promise.resolve();

    expect(calculateFinalVisibility).not.toHaveBeenCalled();

    jest.advanceTimersByTime(250);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(calculateFinalVisibility.mock.calls[0][1].document.id).toBe('target');
    expect(target.refresh).toHaveBeenCalled();

    releaseOther();
    await slowOtherPrediction;
  });

  test('does not guard observed targets or non-controlled movement', () => {
    const observer = createMockToken({ id: 'observer', x: 0, y: 0 });
    const target = createMockToken({ id: 'target', x: 3, y: 0 });
    const tokenDoc = {
      id: 'observer',
      x: 0,
      y: 0,
    };

    expect(setPendingTokenMovementPosition(tokenDoc, { x: 0, y: 0 }, [])).toBe(false);
    expect(shouldTemporarilyBlockHiddenDetection(observer, target, 'hidden')).toBe(false);

    setPendingTokenMovementPosition(tokenDoc, { x: 0, y: 0 }, [observer]);

    expect(shouldTemporarilyBlockHiddenDetection(observer, target, 'observed')).toBe(false);
    expect(shouldTemporarilyBlockHiddenDetection(observer, target, 'concealed')).toBe(false);
  });

  test('keeps guarding through a normal movement animation window', () => {
    jest.useFakeTimers();

    const observer = createMockToken({ id: 'observer', x: 0, y: 0 });
    const target = createMockToken({ id: 'target', x: 3, y: 0 });
    const tokenDoc = {
      id: 'observer',
      x: 0,
      y: 0,
    };

    setPendingTokenMovementPosition(tokenDoc, { x: 0, y: 0 }, [observer]);
    jest.advanceTimersByTime(1000);

    expect(shouldTemporarilyBlockHiddenDetection(observer, target, 'hidden')).toBe(true);
  });

  test('does not suppress pending moving source for Visioner-hidden targets without wall blockage', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      x: 0,
      y: 0,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0 });
    const source = { active: true, object: observer, suppression: {} };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);

    expect(
      getPendingMovementBlockedDetectionSources(target, {
        visionSources: [source],
        lightSources: [],
      }),
    ).toEqual([]);
  });

  test('does not suppress pending moving source for observed targets without wall blockage', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({ id: 'observer', x: 0, y: 0 });
    const target = createMockToken({ id: 'target', x: 3, y: 0 });
    const source = { active: true, object: observer, suppression: {} };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);

    expect(
      getPendingMovementBlockedDetectionSources(target, {
        visionSources: [source],
        lightSources: [],
      }),
    ).toEqual([]);
  });

  test('stores pending movement for current player-owned token even when not locally controlled', () => {
    global.game.user.id = 'player';
    global.game.user.isGM = false;

    const observer = createMockToken({ id: 'observer', x: 0, y: 0 });
    observer.document.testUserPermission = jest.fn((user, permission) => {
      return user?.id === 'player' && permission === 'OWNER';
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0 });

    expect(
      setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [], {
        userId: 'player',
      }),
    ).toBe(true);

    expect(shouldTemporarilyBlockHiddenDetection(observer, target, 'hidden')).toBe(true);
  });

  test('stores pending movement for current GM token move even when not locally controlled', () => {
    global.game.user.id = 'gm';
    global.game.user.isGM = true;

    const observer = createMockToken({ id: 'observer', x: 0, y: 0 });
    const target = createMockToken({ id: 'target', x: 3, y: 0 });

    expect(
      setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [], {
        userId: 'gm',
      }),
    ).toBe(true);

    expect(shouldTemporarilyBlockHiddenDetection(observer, target, 'hidden')).toBe(true);
  });

  test('does not store pending movement for another user movement echoed to GM client', () => {
    global.game.user.id = 'gm';
    global.game.user.isGM = true;

    const observer = createMockToken({ id: 'observer', x: 0, y: 0 });
    const target = createMockToken({ id: 'target', x: 3, y: 0 });

    expect(
      setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [], {
        userId: 'player',
      }),
    ).toBe(false);

    expect(shouldTemporarilyBlockHiddenDetection(observer, target, 'hidden')).toBe(false);
  });

  test('suppresses pending moving source for Foundry-hidden targets', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({ id: 'observer', x: 0, y: 0 });
    const target = createMockToken({ id: 'target', x: 3, y: 0, hidden: true });
    const source = { active: true, object: observer, suppression: {} };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);

    expect(
      getPendingMovementBlockedDetectionSources(target, {
        visionSources: [source],
        lightSources: [],
      }),
    ).toEqual([source]);
  });

  test('refreshes other token visuals after pending movement is stored', () => {
    const observer = { id: 'observer', document: { id: 'observer' }, refresh: jest.fn() };
    const target = { id: 'target', document: { id: 'target' }, refresh: jest.fn() };
    const other = { id: 'other', document: { id: 'other' }, refresh: jest.fn() };
    global.canvas = {
      ...global.canvas,
      tokens: {
        placeables: [observer, target, other],
      },
      perception: {
        update: jest.fn(),
      },
    };

    refreshPendingMovementTokenVisibility('observer');
    flushScheduledCanvasPerceptionUpdate();

    expect(observer.refresh).not.toHaveBeenCalled();
    expect(target.refresh).toHaveBeenCalledTimes(1);
    expect(other.refresh).toHaveBeenCalledTimes(1);
    expect(global.canvas.perception.update).toHaveBeenCalledWith({
      refreshVision: true,
      refreshOcclusion: true,
    });
  });

  test('preserves Visioner-hidden loot soundwave filter during movement refresh', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', actorType: 'loot', visible: true });
    target.mesh = { visible: true };
    target.detectionFilter = { id: 'native-filter' };
    target.refresh = jest.fn();
    global.canvas = {
      ...global.canvas,
      tokens: {
        placeables: [observer, target],
      },
      perception: {
        update: jest.fn(),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);
    refreshPendingMovementTokenVisibility('observer');

    expect(target.visible).toBe(true);
    expect(target.mesh.visible).toBe(true);
    expect(target.detectionFilter).toEqual({ id: 'native-filter' });
    expect(target.refresh).toHaveBeenCalledTimes(1);
    expect(shouldTemporarilyForceTokenInvisible(target)).toBe(false);
  });

  test('does not force Visioner-hidden NPC tokens invisible during movement refresh', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', actorType: 'npc', visible: true });
    target.mesh = { visible: true };
    target.refresh = jest.fn();
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      perception: {
        update: jest.fn(),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);
    refreshPendingMovementTokenVisibility('observer');

    expect(target.visible).toBe(true);
    expect(target.mesh.visible).toBe(true);
    expect(target.refresh).toHaveBeenCalledTimes(1);
    expect(shouldTemporarilyForceTokenInvisible(target)).toBe(false);
  });

  test('keeps Visioner-undetected NPC tokens render-locked during movement refresh', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', actorType: 'npc', visible: true });
    target.mesh = { visible: true };
    target.refresh = jest.fn();
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      perception: {
        update: jest.fn(),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);
    refreshPendingMovementTokenVisibility('observer');

    expect(target.visible).toBe(false);
    expect(target.mesh.visible).toBe(false);
    expect(target.refresh).toHaveBeenCalledTimes(1);
    expect(shouldTemporarilyForceTokenInvisible(target)).toBe(true);
  });

  test('keeps wall-blocked token rendering core-owned while pending movement expires', () => {
    jest.useFakeTimers();

    const observer = createMockToken({ id: 'observer', x: 0, y: 0 });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.nameplate = { visible: false };
    target.bars = { visible: false };
    target.tooltip = { visible: false };
    target.effects = { visible: false };
    target.levelIndicator = { visible: false };
    target.targetPips = { visible: false };
    target.document.getVisibilityTestPoints = jest.fn(() => [{ x: 175, y: 25 }]);
    target.refresh = jest.fn();
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      effects: {
        visionSources: [{ active: true, object: observer }],
        lightSources: [],
      },
      visibility: {
        testVisibility: jest.fn(() => false),
      },
      perception: {
        update: jest.fn(),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);
    refreshPendingMovementTokenVisibility('observer');

    expect(target.renderable).toBe(true);
    expect(target.mesh.renderable).toBe(true);

    jest.advanceTimersByTime(2500);

    expect(target.renderable).toBe(true);
    expect(target.mesh.renderable).toBe(true);
    expect(target.mesh.alpha).toBe(1);
    expect(target.nameplate.visible).toBe(false);
    expect(target.effects.visible).toBe(false);
    expect(target.levelIndicator.visible).toBe(false);
  });

  test('lets core decide wall-blocked token rendering during active movement', () => {
    const observer = createMockToken({ id: 'observer', x: 0, y: 0 });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.nameplate = { visible: false };
    target.bars = { visible: false };
    target.tooltip = { visible: false };
    target.effects = { visible: false };
    target.levelIndicator = { visible: false };
    target.targetPips = { visible: false };
    target.document.getVisibilityTestPoints = jest.fn(() => [{ x: 175, y: 25 }]);
    target.refresh = jest.fn();
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      effects: {
        visionSources: [{ active: true, object: observer }],
        lightSources: [],
      },
      visibility: {
        testVisibility: jest.fn().mockReturnValueOnce(false).mockReturnValue(true),
      },
      perception: {
        update: jest.fn(),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);
    refreshPendingMovementTokenVisibility('observer');

    expect(target.renderable).toBe(true);
    expect(target.mesh.renderable).toBe(true);
    expect(target.mesh.alpha).toBe(1);
    expect(target.nameplate.visible).toBe(false);
    expect(target.effects.visible).toBe(false);
    expect(target.levelIndicator.visible).toBe(false);

    refreshPendingMovementTokenVisibility('observer');

    expect(target.renderable).toBe(true);
    expect(target.mesh.renderable).toBe(true);
    expect(target.mesh.alpha).toBe(1);
    expect(target.nameplate.visible).toBe(false);
    expect(target.effects.visible).toBe(false);
    expect(target.levelIndicator.visible).toBe(false);
    expect(global.canvas.visibility.testVisibility).not.toHaveBeenCalled();

    expect(completePendingTokenMovement('observer')).toBe(true);
    expect(target.renderable).toBe(true);
    expect(target.mesh.renderable).toBe(true);
    expect(target.mesh.alpha).toBe(1);
    expect(target.nameplate.visible).toBe(false);
    expect(target.effects.visible).toBe(false);
    expect(target.levelIndicator.visible).toBe(false);
  });

  test('keeps rendering core-owned until movement animation completes', async () => {
    jest.useFakeTimers();

    let resolveAnimation;
    const animationPromise = new Promise((resolve) => {
      resolveAnimation = resolve;
    });
    const observer = createMockToken({ id: 'observer', x: 0, y: 0 });
    observer._animation = { state: 'running', promise: animationPromise };
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.nameplate = { visible: true };
    target.document.getVisibilityTestPoints = jest.fn(() => [{ x: 175, y: 25 }]);
    target.refresh = jest.fn();
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      effects: {
        visionSources: [{ active: true, object: observer }],
        lightSources: [],
      },
      visibility: {
        testVisibility: jest.fn(() => false),
      },
      perception: {
        update: jest.fn(),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);
    refreshPendingMovementTokenVisibility('observer');

    expect(schedulePendingTokenMovementCompletion(observer.document)).toBe(true);
    expect(target.renderable).toBe(true);

    jest.advanceTimersByTime(0);
    expect(target.renderable).toBe(true);

    resolveAnimation();
    await animationPromise;
    await Promise.resolve();

    expect(target.renderable).toBe(true);
    expect(target.mesh.renderable).toBe(true);
    expect(target.mesh.alpha).toBe(1);
    expect(target.nameplate.visible).toBe(true);
  });

  test('waits briefly for Foundry animation without render-locking token visuals', async () => {
    jest.useFakeTimers();

    let resolveAnimation;
    const animationPromise = new Promise((resolve) => {
      resolveAnimation = resolve;
    });
    const observer = createMockToken({ id: 'observer', x: 0, y: 0 });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.nameplate = { visible: true };
    target.document.getVisibilityTestPoints = jest.fn(() => [{ x: 175, y: 25 }]);
    target.refresh = jest.fn();
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      effects: {
        visionSources: [{ active: true, object: observer }],
        lightSources: [],
      },
      visibility: {
        testVisibility: jest.fn(() => false),
      },
      perception: {
        update: jest.fn(),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);
    refreshPendingMovementTokenVisibility('observer');

    expect(schedulePendingTokenMovementCompletion(observer.document)).toBe(true);
    expect(target.renderable).toBe(true);

    jest.advanceTimersByTime(25);
    observer._animation = { state: 'running', promise: animationPromise };

    jest.advanceTimersByTime(25);
    expect(target.renderable).toBe(true);

    resolveAnimation();
    await animationPromise;
    await Promise.resolve();

    expect(target.renderable).toBe(true);
    expect(target.mesh.renderable).toBe(true);
    expect(target.mesh.alpha).toBe(1);
    expect(target.nameplate.visible).toBe(true);
  });

  test('keeps token rendering core-owned when player animation appears after first completion check', async () => {
    jest.useFakeTimers();

    let resolveAnimation;
    const animationPromise = new Promise((resolve) => {
      resolveAnimation = resolve;
    });
    const observer = createMockToken({ id: 'observer', x: 0, y: 0 });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.nameplate = { visible: true };
    target.document.getVisibilityTestPoints = jest.fn(() => [{ x: 175, y: 25 }]);
    target.refresh = jest.fn();
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      effects: {
        visionSources: [{ active: true, object: observer }],
        lightSources: [],
      },
      visibility: {
        testVisibility: jest.fn(() => false),
      },
      perception: {
        update: jest.fn(),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);
    refreshPendingMovementTokenVisibility('observer');

    expect(schedulePendingTokenMovementCompletion(observer.document)).toBe(true);
    setTimeout(() => {
      observer._animation = { state: 'running', promise: animationPromise };
    }, 75);

    jest.advanceTimersByTime(100);
    expect(target.renderable).toBe(true);
    expect(target.mesh.renderable).toBe(true);

    resolveAnimation();
    await animationPromise;
    await Promise.resolve();

    expect(target.renderable).toBe(true);
    expect(target.mesh.renderable).toBe(true);
    expect(target.mesh.alpha).toBe(1);
    expect(target.nameplate.visible).toBe(true);
  });

  test('keeps pending movement active until token visual position reaches destination without animation handle', () => {
    jest.useFakeTimers();

    const observer = createMockToken({ id: 'observer', x: 0, y: 0 });
    observer.document.object = observer;
    const target = createMockToken({ id: 'target', x: 3, y: 0 });
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 300, y: 0 }, [observer]);
    expect(schedulePendingTokenMovementCompletion(observer.document)).toBe(true);

    jest.advanceTimersByTime(350);

    expect(getPendingTokenMovementPosition('observer')).toEqual({ x: 300, y: 0 });

    observer.x = 300;
    observer.y = 0;
    jest.advanceTimersByTime(60);

    expect(getPendingTokenMovementPosition('observer')).toBeNull();
  });

  test('movement completion restores token when final visibility becomes observed during grace', () => {
    jest.useFakeTimers();

    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', actorType: 'loot', visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.nameplate = { visible: true };
    target.refresh = jest.fn();
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      perception: {
        update: jest.fn(),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);
    refreshPendingMovementTokenVisibility('observer');
    observer.document.getFlag.mockReturnValue(visibilityV2Map({ target: 'observed' }));

    expect(completePendingTokenMovement('observer')).toBe(true);
    expect(target.renderable).toBe(true);
    expect(target.mesh.renderable).toBe(true);
    expect(target.mesh.alpha).toBe(1);
    expect(target.nameplate.visible).toBe(true);
  });

  test('post-completion refresh restores token when player-side visibility settles late', () => {
    jest.useFakeTimers();

    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', actorType: 'loot', visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.nameplate = { visible: true };
    target.refresh = jest.fn();
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      perception: {
        update: jest.fn(),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);
    refreshPendingMovementTokenVisibility('observer');

    expect(completePendingTokenMovement('observer')).toBe(true);
    expect(target.renderable).toBe(false);
    expect(target.mesh.renderable).toBe(false);

    observer.document.getFlag.mockReturnValue(visibilityV2Map({ target: 'observed' }));
    jest.advanceTimersByTime(100);

    expect(target.renderable).toBe(true);
    expect(target.mesh.renderable).toBe(true);
    expect(target.mesh.alpha).toBe(1);
    expect(target.nameplate.visible).toBe(true);
  });

  test('does not run stale post-completion refresh after the same token starts moving again', () => {
    jest.useFakeTimers();

    global.canvas.walls.placeables = [];
    const observer = createMockToken({ id: 'observer', x: 0, y: 0 });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.refresh = jest.fn();
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      perception: {
        update: jest.fn(),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);
    expect(completePendingTokenMovement('observer')).toBe(true);
    target.refresh.mockClear();

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer]);
    jest.advanceTimersByTime(100);

    expect(target.refresh).not.toHaveBeenCalled();
  });

  test('keeps undetected targets render-locked during pending movement even when LOS can see them', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.document.getVisibilityTestPoints = jest.fn(() => [{ x: 175, y: 25 }]);
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      visibility: {
        testVisibility: jest.fn(() => true),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);

    expect(shouldTemporarilyForceTokenInvisible(target)).toBe(true);
    expect(global.canvas.visibility.testVisibility).not.toHaveBeenCalled();
  });

  test('uses core LOS during pending movement when final visibility is hidden, not undetected', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    observer._animation = { state: 'running', promise: Promise.resolve() };
    const target = createMockToken({ id: 'target', visible: true });
    target.document.getVisibilityTestPoints = jest.fn(() => [{ x: 175, y: 25 }]);
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      visibility: {
        testVisibility: jest.fn(() => true),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer], {
      finalVisibilityStatesByTargetId: { target: 'hidden' },
    });

    expect(shouldUseCoreDetectionDuringPendingMovement(observer, target)).toBe(true);
    expect(shouldTemporarilyForceTokenInvisible(target)).toBe(false);
  });

  test('keeps render lock until core movement source can own LOS', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.document.getVisibilityTestPoints = jest.fn(() => [{ x: 175, y: 25 }]);
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      visibility: {
        testVisibility: jest.fn(() => true),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer], {
      finalVisibilityStatesByTargetId: { target: 'hidden' },
    });

    expect(shouldUseCoreDetectionDuringPendingMovement(observer, target)).toBe(false);
    expect(shouldTemporarilyForceTokenInvisible(target)).toBe(true);

    observer._animation = { state: 'running', promise: Promise.resolve() };

    expect(shouldUseCoreDetectionDuringPendingMovement(observer, target)).toBe(true);
    expect(shouldTemporarilyForceTokenInvisible(target)).toBe(false);
  });

  test('uses core LOS once committed movement visually leaves its start position', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      x: 0,
      y: 0,
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.document.getVisibilityTestPoints = jest.fn(() => [{ x: 175, y: 25 }]);
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      visibility: {
        testVisibility: jest.fn(() => true),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer], {
      finalVisibilityStatesByTargetId: { target: 'hidden' },
    });

    observer.x = 50;
    observer.document.x = 50;

    expect(shouldUseCoreDetectionDuringPendingMovement(observer, target)).toBe(true);
    expect(shouldTemporarilyForceTokenInvisible(target)).toBe(false);
  });

  test('probes current core LOS for stale undetected once committed movement leaves start', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      x: 0,
      y: 0,
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.document.getVisibilityTestPoints = jest.fn(() => [{ x: 175, y: 25 }]);
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      visibility: {
        testVisibility: jest.fn(() => true),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer]);

    observer.x = 50;
    observer.document.x = 50;

    expect(shouldTemporarilyForceTokenInvisible(target)).toBe(false);
    expect(global.canvas.visibility.testVisibility).toHaveBeenCalled();
  });

  test('does not leave soundwave visuals behind from current core LOS probe', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      x: 0,
      y: 0,
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.detectionFilterMesh = { visible: false, renderable: false, alpha: 0 };
    target.document.getVisibilityTestPoints = jest.fn(() => [{ x: 175, y: 25 }]);
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      visibility: {
        testVisibility: jest.fn(() => {
          target.detectionFilter = { id: 'probe-soundwave-filter' };
          target.detectionFilterMesh.visible = true;
          target.detectionFilterMesh.renderable = true;
          target.detectionFilterMesh.alpha = 1;
          return true;
        }),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer]);

    observer.x = 50;
    observer.document.x = 50;

    expect(shouldTemporarilyForceTokenInvisible(target)).toBe(false);
    expect(target.detectionFilter).toBeNull();
    expect(target.detectionFilterMesh).toMatchObject({
      visible: false,
      renderable: false,
      alpha: 0,
    });
  });

  test('keeps core-visible stale undetected rendered during post-completion grace', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      x: 0,
      y: 0,
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.nameplate = { visible: false };
    target.bars = { visible: false };
    target.tooltip = { visible: false };
    target.effects = { visible: false };
    target.levelIndicator = { visible: false };
    target.targetPips = { visible: false };
    target.document.getVisibilityTestPoints = jest.fn(() => [{ x: 175, y: 25 }]);
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      effects: {
        visionSources: [{ active: true, object: observer, shape: { contains: jest.fn(() => true) } }],
        lightSources: [],
      },
      visibility: {
        testVisibility: jest.fn(() => true),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer]);
    observer.x = 50;
    observer.document.x = 50;

    expect(shouldTemporarilyForceTokenInvisible(target)).toBe(false);
    expect(target.nameplate.visible).toBe(false);
    expect(target.bars.visible).toBe(false);
    expect(target.tooltip.visible).toBe(false);
    expect(target.effects.visible).toBe(false);
    expect(target.levelIndicator.visible).toBe(false);
    expect(target.targetPips.visible).toBe(false);
    clearPendingTokenMovementPosition('observer');

    target.visible = false;
    target.renderable = true;
    target.mesh.visible = false;
    target.mesh.renderable = true;
    target.mesh.alpha = 1;

    expect(restorePendingMovementTokenRendering(target)).toBe(true);
    expect(target.visible).toBe(true);
    expect(target.renderable).toBe(true);
    expect(target.mesh.visible).toBe(true);
    expect(target.mesh.renderable).toBe(true);
    expect(target.mesh.alpha).toBe(1);
    expect(target.nameplate.visible).toBe(false);
    expect(target.bars.visible).toBe(false);
    expect(target.tooltip.visible).toBe(false);
    expect(target.effects.visible).toBe(false);
    expect(target.levelIndicator.visible).toBe(false);
    expect(target.targetPips.visible).toBe(false);
  });

  test('clears stale soundwave visuals during core-visible grace reveal', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      x: 0,
      y: 0,
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    const hiddenEcho = {
      visible: true,
      parent: { removeChild: jest.fn() },
      destroy: jest.fn(),
    };
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.detectionFilter = { id: 'soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    target._pvHiddenEcho = hiddenEcho;
    target.document.getVisibilityTestPoints = jest.fn(() => [{ x: 175, y: 25 }]);
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      effects: {
        visionSources: [{ active: true, object: observer }],
        lightSources: [],
      },
      visibility: {
        testVisibility: jest.fn(() => true),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer]);
    observer.x = 50;
    observer.document.x = 50;

    expect(shouldTemporarilyForceTokenInvisible(target)).toBe(false);
    clearPendingTokenMovementPosition('observer');

    target.visible = false;
    target.mesh.visible = false;

    expect(restorePendingMovementTokenRendering(target)).toBe(true);
    expect(target.visible).toBe(true);
    expect(target.mesh.visible).toBe(true);
    expect(target.detectionFilter).toBeNull();
    expect(target.detectionFilterMesh).toMatchObject({
      visible: false,
      renderable: false,
      alpha: 0,
    });
    expect(target._pvHiddenEcho).toBeNull();
    expect(hiddenEcho.parent.removeChild).toHaveBeenCalledWith(hiddenEcho);
    expect(hiddenEcho.destroy).toHaveBeenCalled();
  });

  test('does not restore captured soundwave mesh when hidden render lock yields to core LOS', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      x: 0,
      y: 0,
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    target.document.getVisibilityTestPoints = jest.fn(() => [{ x: 175, y: 25 }]);
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      effects: {
        visionSources: [{ active: true, object: observer }],
        lightSources: [],
      },
      visibility: {
        testVisibility: jest.fn(() => true),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer]);
    forcePendingMovementTokenInvisible(target);
    observer.x = 50;
    observer.document.x = 50;

    expect(shouldTemporarilyForceTokenInvisible(target)).toBe(false);
    expect(restorePendingMovementTokenRendering(target)).toBe(true);
    expect(target.visible).toBe(true);
    expect(target.mesh.visible).toBe(true);
    expect(target.detectionFilter).toBeNull();
    expect(target.detectionFilterMesh).toMatchObject({
      visible: false,
      renderable: false,
      alpha: 0,
    });
  });

  test('keeps predicted core-owned reveal rendered after pending movement clears', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      x: 0,
      y: 0,
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.document.getVisibilityTestPoints = jest.fn(() => [{ x: 175, y: 25 }]);
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      effects: {
        visionSources: [{ active: true, object: observer }],
        lightSources: [],
      },
      visibility: {
        testVisibility: jest.fn(() => true),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer], {
      finalVisibilityStatesByTargetId: { target: 'observed' },
    });
    observer.x = 50;
    observer.document.x = 50;

    expect(shouldTemporarilyForceTokenInvisible(target)).toBe(false);
    clearPendingTokenMovementPosition('observer');

    target.visible = false;
    target.mesh.visible = false;

    expect(restorePendingMovementTokenRendering(target)).toBe(true);
    expect(target.visible).toBe(true);
    expect(target.mesh.visible).toBe(true);
  });

  test('keeps stale undetected locked when final visibility remains undetected', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    observer._animation = { state: 'running', promise: Promise.resolve() };
    const target = createMockToken({ id: 'target', visible: true });
    target.document.getVisibilityTestPoints = jest.fn(() => [{ x: 175, y: 25 }]);
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      visibility: {
        testVisibility: jest.fn(() => true),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer], {
      finalVisibilityStatesByTargetId: { target: 'undetected' },
    });

    expect(shouldUseCoreDetectionDuringPendingMovement(observer, target)).toBe(false);
    expect(shouldTemporarilyForceTokenInvisible(target)).toBe(true);
    expect(global.canvas.visibility.testVisibility).not.toHaveBeenCalled();
  });

  test('uses core LOS while final visibility prediction is pending during active movement', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    observer._animation = { state: 'running', promise: Promise.resolve() };
    const target = createMockToken({ id: 'target', visible: true });
    target.document.getVisibilityTestPoints = jest.fn(() => [{ x: 175, y: 25 }]);
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      visibility: {
        testVisibility: jest.fn(() => true),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer], {
      predictFinalVisibility: () => new Promise(() => { }),
    });

    expect(shouldUseCoreDetectionDuringPendingMovement(observer, target)).toBe(true);
    expect(shouldTemporarilyForceTokenInvisible(target)).toBe(false);
  });

  test('precomputes final clear LOS so stale undetected can reveal during movement', () => {
    global.canvas.walls.placeables = [
      createMockWall({ id: 'wall', c: [100, 0, 100, 200], sight: 1, sound: 20 }),
    ];
    const observer = createMockToken({
      id: 'observer',
      x: 0,
      y: 0,
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    observer._animation = { state: 'running', promise: Promise.resolve() };
    const target = createMockToken({ id: 'target', x: 4, y: 0, visible: true });
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 150, y: 0 }, [observer], {
      predictFinalVisibility: () => new Promise(() => { }),
    });

    expect(shouldUseCoreDetectionDuringPendingMovement(observer, target)).toBe(true);
    expect(shouldTemporarilyForceTokenInvisible(target)).toBe(false);
  });

  test('precomputes final hearing detection as hidden during movement', () => {
    global.canvas.walls.placeables = [
      createMockWall({ id: 'wall', c: [100, 0, 100, 200], sight: 1, sound: 0 }),
    ];
    const observer = createMockToken({
      id: 'observer',
      x: 0,
      y: 0,
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    observer._animation = { state: 'running', promise: Promise.resolve() };
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer], {
      predictFinalVisibility: () => new Promise(() => { }),
    });

    expect(shouldUseCoreDetectionDuringPendingMovement(observer, target)).toBe(true);
    expect(shouldTemporarilyForceTokenInvisible(target)).toBe(false);
  });

  test('precomputes final observed when edge rays clear despite blocked center ray', () => {
    global.canvas.walls.placeables = [
      createMockWall({ id: 'wall', c: [50, 0, 50, 40], sight: 1, sound: 0 }),
    ];
    const observer = createMockToken({
      id: 'observer',
      x: 100,
      y: 50,
      center: { x: 125, y: 75 },
      controlled: true,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({
      id: 'target',
      x: 0,
      y: 0,
      center: { x: 25, y: 25 },
      visible: true,
    });
    target.detectionFilter = { id: 'stale-soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 50 }, [observer], {
      predictFinalVisibility: () => new Promise(() => { }),
    });

    expect(shouldSuppressPendingMovementDetectionFilterVisuals(target)).toBe(true);
  });

  test('keeps stale undetected locked when final sight and sound are blocked', () => {
    global.canvas.walls.placeables = [
      createMockWall({ id: 'wall', c: [100, 0, 100, 200], sight: 1, sound: 20 }),
    ];
    const observer = createMockToken({
      id: 'observer',
      x: 0,
      y: 0,
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    observer._animation = { state: 'running', promise: Promise.resolve() };
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer], {
      predictFinalVisibility: () => new Promise(() => { }),
    });

    expect(shouldUseCoreDetectionDuringPendingMovement(observer, target)).toBe(false);
    expect(shouldTemporarilyForceTokenInvisible(target)).toBe(true);
  });

  test('keeps stale undetected locked when deafened observer only has sound path', () => {
    global.canvas.walls.placeables = [
      createMockWall({ id: 'wall', c: [100, 0, 100, 200], sight: 1, sound: 0 }),
    ];
    const observer = createMockToken({
      id: 'observer',
      x: 0,
      y: 0,
      actor: {
        hasCondition: jest.fn((slug) => slug === 'deafened'),
      },
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    observer._animation = { state: 'running', promise: Promise.resolve() };
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer], {
      predictFinalVisibility: () => new Promise(() => { }),
    });

    expect(shouldUseCoreDetectionDuringPendingMovement(observer, target)).toBe(false);
    expect(shouldTemporarilyForceTokenInvisible(target)).toBe(true);
  });

  test('keeps stale undetected locked while final visibility prediction waits for core movement', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.document.getVisibilityTestPoints = jest.fn(() => [{ x: 175, y: 25 }]);
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      visibility: {
        testVisibility: jest.fn(() => true),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer], {
      predictFinalVisibility: () => new Promise(() => { }),
    });

    expect(shouldUseCoreDetectionDuringPendingMovement(observer, target)).toBe(false);
    expect(shouldTemporarilyForceTokenInvisible(target)).toBe(true);
  });

  test('uses core LOS from movement start when final visibility is undetected', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'observed' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.document.getVisibilityTestPoints = jest.fn(() => [{ x: 175, y: 25 }]);
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      visibility: {
        testVisibility: jest.fn(() => true),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer], {
      finalVisibilityStatesByTargetId: { target: 'undetected' },
    });

    expect(shouldUseCoreDetectionDuringPendingMovement(observer, target)).toBe(true);
    expect(shouldTemporarilyForceTokenInvisible(target)).toBe(false);
    expect(global.canvas.visibility.testVisibility).not.toHaveBeenCalled();
  });

  test('keeps v2 undetected targets render-locked during pending movement even when LOS can see them', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: {
        'pf2e-visioner': {
          visibilityV2: {
            target: {
              detectionState: 'undetected',
              hasConcealment: false,
              coverState: 'none',
            },
          },
        },
      },
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.document.getVisibilityTestPoints = jest.fn(() => [{ x: 175, y: 25 }]);
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      visibility: {
        testVisibility: jest.fn(() => true),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);

    expect(shouldTemporarilyForceTokenInvisible(target)).toBe(true);
    expect(global.canvas.visibility.testVisibility).not.toHaveBeenCalled();
  });

  test('keeps undetected token render-locked when pending position can see it', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.document.getVisibilityTestPoints = jest.fn(() => [{ x: 175, y: 25 }]);
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.nameplate = { visible: true };
    target.refresh = jest.fn();
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      effects: {
        visionSources: [{ active: true, object: observer }],
        lightSources: [],
      },
      visibility: {
        testVisibility: jest.fn(() => true),
      },
      perception: {
        update: jest.fn(),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);
    refreshPendingMovementTokenVisibility('observer');

    expect(target.renderable).toBe(false);
    expect(target.mesh.renderable).toBe(false);
    expect(target.mesh.alpha).toBe(0);
    expect(target.nameplate.visible).toBe(false);

    expect(restorePendingMovementTokenRendering(target)).toBe(false);
    expect(target.renderable).toBe(false);
    expect(target.mesh.renderable).toBe(false);
    expect(target.mesh.alpha).toBe(0);
    expect(target.nameplate.visible).toBe(false);
  });

  test('keeps undetected token hidden when token refresh redraws it visible', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', actorType: 'npc', visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.nameplate = { visible: true };
    target.refresh = jest.fn(() => {
      expect(target.renderable).toBe(false);
      expect(target.mesh.renderable).toBe(false);
      expect(target.mesh.alpha).toBe(0);
      expect(target.nameplate.visible).toBe(false);
      target.visible = true;
      target.renderable = true;
      target.mesh.visible = true;
      target.mesh.renderable = true;
      target.mesh.alpha = 1;
      target.nameplate.visible = true;
    });
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      perception: {
        update: jest.fn(),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);
    refreshPendingMovementTokenVisibility('observer');

    expect(target.renderable).toBe(false);
    expect(target.mesh.renderable).toBe(false);
    expect(target.mesh.alpha).toBe(0);
    expect(target.nameplate.visible).toBe(false);
  });

  test('hides alternate token render surfaces while pending undetected visibility is active', () => {
    jest.useFakeTimers();

    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.nameplate = { visible: true };
    target.effects = { visible: true };
    target.targetArrows = { visible: true };
    target.targetPips = { visible: true };
    target.turnMarker = { visible: true, mesh: { visible: true } };
    target.detectionFilter = { id: 'native-filter' };
    target.refresh = jest.fn();
    global.canvas = {
      ...global.canvas,
      tokens: {
        placeables: [observer, target],
      },
      perception: {
        update: jest.fn(),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);
    refreshPendingMovementTokenVisibility('observer');

    expect(target.visible).toBe(false);
    expect(target.renderable).toBe(false);
    expect(target.mesh).toMatchObject({ visible: false, renderable: false, alpha: 0 });
    expect(target.nameplate.visible).toBe(false);
    expect(target.effects.visible).toBe(false);
    expect(target.targetArrows.visible).toBe(false);
    expect(target.targetPips.visible).toBe(false);
    expect(target.turnMarker.visible).toBe(false);
    expect(target.turnMarker.mesh.visible).toBe(false);
    expect(target.detectionFilter).toBeNull();

    clearPendingTokenMovementPosition('observer');
    observer.document.getFlag.mockReturnValue(visibilityV2Map({ target: 'observed' }));
    jest.advanceTimersByTime(1001);
    refreshPendingMovementTokenVisibility([]);

    expect(target.renderable).toBe(true);
    expect(target.mesh.renderable).toBe(true);
    expect(target.mesh.alpha).toBe(1);
    expect(target.nameplate.visible).toBe(true);
    expect(target.effects.visible).toBe(true);
    expect(target.targetArrows.visible).toBe(true);
    expect(target.targetPips.visible).toBe(true);
    expect(target.turnMarker.visible).toBe(true);
    expect(target.turnMarker.mesh.visible).toBe(true);
  });

  test('does not restore token rendering while remembered observer still has target undetected', () => {
    jest.useFakeTimers();

    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.nameplate = { visible: true };
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      perception: {
        update: jest.fn(),
      },
    };

    expect(forceTokenInvisibleForObserverVisibility(observer, target, 'undetected')).toBe(true);
    jest.advanceTimersByTime(1001);

    expect(restorePendingMovementTokenRendering(target)).toBe(false);
    expect(target.renderable).toBe(false);
    expect(target.mesh.renderable).toBe(false);
    expect(target.mesh.alpha).toBe(0);
    expect(target.nameplate.visible).toBe(false);
  });

  test('does not restore token rendering while undetected pending visibility is active', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.nameplate = { visible: true };
    target.refresh = jest.fn();
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      perception: {
        update: jest.fn(),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);
    refreshPendingMovementTokenVisibility('observer');

    expect(target.renderable).toBe(false);
    expect(target.mesh.renderable).toBe(false);
    expect(target.mesh.alpha).toBe(0);
    expect(target.nameplate.visible).toBe(false);

    expect(restorePendingMovementTokenRendering(target)).toBe(false);
    expect(target.renderable).toBe(false);
    expect(target.mesh.renderable).toBe(false);
    expect(target.mesh.alpha).toBe(0);
    expect(target.nameplate.visible).toBe(false);
  });

  test('can limit pending movement visibility refresh to specific target tokens', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'undetected', unrelated: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    const unrelated = createMockToken({ id: 'unrelated', visible: true });
    for (const token of [target, unrelated]) {
      token.renderable = true;
      token.mesh = { visible: true, renderable: true, alpha: 1 };
      token.nameplate = { visible: true };
      token.refresh = jest.fn();
    }
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target, unrelated],
      },
      perception: {
        update: jest.fn(),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);
    refreshPendingMovementTokenVisibility('observer', {
      source: 'unit-targeted',
      targetTokenIds: ['target'],
    });

    expect(target.renderable).toBe(false);
    expect(target.refresh).toHaveBeenCalledTimes(1);
    expect(unrelated.renderable).toBe(true);
    expect(unrelated.refresh).not.toHaveBeenCalled();
  });

  test('does not collect pending movement refresh performance counters by default', () => {
    resetPendingMovementPerformanceCounters();
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'undetected', unrelated: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    const unrelated = createMockToken({ id: 'unrelated', visible: true });
    for (const token of [target, unrelated]) {
      token.renderable = true;
      token.mesh = { visible: true, renderable: true, alpha: 1 };
      token.nameplate = { visible: true };
      token.refresh = jest.fn();
    }
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target, unrelated],
      },
      perception: {
        update: jest.fn(),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);
    refreshPendingMovementTokenVisibility('observer', {
      source: 'unit-targeted',
      targetTokenIds: ['target'],
    });

    expect(target.refresh).toHaveBeenCalledTimes(1);
    expect(getPendingMovementPerformanceSnapshot()).toEqual({
      refreshCalls: 0,
      targetedRefreshCalls: 0,
      fullSceneRefreshCalls: 0,
      suppressedRefreshCalls: 0,
      tokensScanned: 0,
      tokensRefreshed: 0,
      bySource: {},
    });
  });

  test('tracks pending movement refresh performance counters when diagnostics are enabled', () => {
    setMovementPerformanceDiagnosticsEnabled(true);
    resetPendingMovementPerformanceCounters();
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'observed' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    const unrelated = createMockToken({ id: 'unrelated', visible: true });
    for (const token of [target, unrelated]) {
      token.refresh = jest.fn();
      token.renderable = true;
      token.mesh = { visible: true, renderable: true, alpha: 1 };
    }
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target, unrelated],
      },
      perception: {
        update: jest.fn(),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);
    refreshPendingMovementTokenVisibility('observer', {
      source: 'unit-targeted',
      targetTokenIds: ['target'],
    });

    expect(getPendingMovementPerformanceSnapshot()).toEqual(
      expect.objectContaining({
        refreshCalls: 1,
        targetedRefreshCalls: 1,
        fullSceneRefreshCalls: 0,
        tokensScanned: 1,
        tokensRefreshed: 1,
        bySource: {
          'unit-targeted': expect.objectContaining({
            refreshCalls: 1,
            targetedRefreshCalls: 1,
            tokensScanned: 1,
            tokensRefreshed: 1,
          }),
        },
      }),
    );
  });

  test('coalesces pending movement visual refreshes into one animation frame', () => {
    jest.useFakeTimers();
    setMovementPerformanceDiagnosticsEnabled(true);
    const originalRequestAnimationFrame = global.requestAnimationFrame;
    const originalCancelAnimationFrame = global.cancelAnimationFrame;
    global.requestAnimationFrame = jest.fn((callback) => setTimeout(callback, 16));
    global.cancelAnimationFrame = jest.fn((id) => clearTimeout(id));
    resetPendingMovementPerformanceCounters();
    global.canvas.walls.placeables = [];
    const target = createMockToken({ id: 'target', visible: true });
    const unrelated = createMockToken({ id: 'unrelated', visible: true });
    for (const token of [target, unrelated]) {
      token.refresh = jest.fn();
      token.renderable = true;
      token.mesh = { visible: true, renderable: true, alpha: 1 };
      token.nameplate = { visible: true };
    }
    global.canvas = {
      ...global.canvas,
      tokens: {
        placeables: [target, unrelated],
      },
      perception: {
        update: jest.fn(),
      },
    };

    refreshPendingMovementTokenVisibility([], {
      coalesceFrame: true,
      source: 'unit-coalesced-a',
      targetTokenIds: ['target'],
    });
    refreshPendingMovementTokenVisibility([], {
      coalesceFrame: true,
      source: 'unit-coalesced-b',
      targetTokenIds: ['unrelated'],
    });

    expect(target.refresh).not.toHaveBeenCalled();
    expect(unrelated.refresh).not.toHaveBeenCalled();

    jest.advanceTimersByTime(16);

    expect(target.refresh).toHaveBeenCalledTimes(1);
    expect(unrelated.refresh).toHaveBeenCalledTimes(1);
    expect(getPendingMovementPerformanceSnapshot()).toEqual(
      expect.objectContaining({
        refreshCalls: 1,
        targetedRefreshCalls: 1,
        tokensScanned: 2,
        tokensRefreshed: 2,
      }),
    );

    global.requestAnimationFrame = originalRequestAnimationFrame;
    global.cancelAnimationFrame = originalCancelAnimationFrame;
  });

  test('skips token refresh when pending movement visual state is unchanged', () => {
    setMovementPerformanceDiagnosticsEnabled(true);
    resetPendingMovementPerformanceCounters();
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'observed' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.nameplate = { visible: true };
    target.refresh = jest.fn();
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        placeables: [observer, target],
      },
      perception: {
        update: jest.fn(),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);
    refreshPendingMovementTokenVisibility(['observer'], {
      skipPerceptionRefresh: true,
      targetTokenIds: ['target'],
    });
    refreshPendingMovementTokenVisibility(['observer'], {
      skipPerceptionRefresh: true,
      targetTokenIds: ['target'],
    });

    expect(target.refresh).toHaveBeenCalledTimes(1);
    expect(getPendingMovementPerformanceSnapshot()).toEqual(
      expect.objectContaining({
        refreshCalls: 2,
        tokensScanned: 2,
        tokensRefreshed: 1,
      }),
    );
  });

  test('debug suppression skips pending movement visual refresh work', async () => {
    const runtimeState = await import('../../../scripts/services/runtime-state.js');
    setMovementPerformanceDiagnosticsEnabled(true);
    runtimeState.setSuppressPendingMovementVisualRefresh(true);
    resetPendingMovementPerformanceCounters();
    const target = createMockToken({ id: 'target', visible: true });
    target.refresh = jest.fn();
    global.canvas = {
      ...global.canvas,
      tokens: {
        placeables: [target],
      },
      perception: {
        update: jest.fn(),
      },
    };

    refreshPendingMovementTokenVisibility([], {
      source: 'unit-suppressed',
      targetTokenIds: ['target'],
    });

    expect(target.refresh).not.toHaveBeenCalled();
    expect(global.canvas.perception.update).not.toHaveBeenCalled();
    expect(getPendingMovementPerformanceSnapshot()).toEqual(
      expect.objectContaining({
        refreshCalls: 1,
        suppressedRefreshCalls: 1,
        tokensScanned: 0,
        tokensRefreshed: 0,
      }),
    );

    runtimeState.clearSuppressPendingMovementVisualRefresh();
  });

  test('completion refresh only scans pending movement affected targets', () => {
    jest.useFakeTimers();

    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'undetected', unrelated: 'observed' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    const unrelated = createMockToken({ id: 'unrelated', visible: true });
    for (const token of [target, unrelated]) {
      token.renderable = true;
      token.mesh = { visible: true, renderable: true, alpha: 1 };
      token.nameplate = { visible: true };
      token.refresh = jest.fn();
    }
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target, unrelated],
      },
      perception: {
        update: jest.fn(),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);

    expect(completePendingTokenMovement('observer')).toBe(true);
    expect(target.refresh).toHaveBeenCalledTimes(1);
    expect(unrelated.refresh).not.toHaveBeenCalled();
  });

  test('keeps completed movement target ids available for AVS batch-complete refresh', () => {
    jest.useFakeTimers();

    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'undetected', unrelated: 'observed' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    const unrelated = createMockToken({ id: 'unrelated', visible: true });
    for (const token of [target, unrelated]) {
      token.renderable = true;
      token.mesh = { visible: true, renderable: true, alpha: 1 };
      token.nameplate = { visible: true };
      token.refresh = jest.fn();
    }
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target, unrelated],
      },
      perception: {
        update: jest.fn(),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);
    expect(completePendingTokenMovement('observer')).toBe(true);

    expect(getPendingMovementRefreshTargetIds()).toEqual(['target']);
  });

  test('post-completion refresh targets pending movement affected tokens', () => {
    jest.useFakeTimers();

    const refreshTokenVisibility = jest.fn();
    schedulePostCompletionRenderRefreshes('observer', 1, {
      hasActivePendingMovementForObserver: () => false,
      hasRenderWork: () => true,
      getTargetTokenIds: () => ['target'],
      refreshTokenVisibility,
    });

    jest.advanceTimersByTime(100);

    expect(refreshTokenVisibility).toHaveBeenCalledWith([], {
      ignoreObservedGrace: true,
      source: 'post-completion-refresh',
      targetTokenIds: ['target'],
    });
  });

  test('post-completion refresh uses light cadence unless full cadence is requested', () => {
    jest.useFakeTimers();

    const refreshTokenVisibility = jest.fn();
    schedulePostCompletionRenderRefreshes('observer', 1, {
      hasActivePendingMovementForObserver: () => false,
      hasRenderWork: () => true,
      getTargetTokenIds: () => ['target'],
      refreshTokenVisibility,
    });

    jest.advanceTimersByTime(1200);

    expect(refreshTokenVisibility).toHaveBeenCalledTimes(2);
  });

  test('post-completion refresh keeps full cadence for sensitive visual work', () => {
    jest.useFakeTimers();

    const refreshTokenVisibility = jest.fn();
    schedulePostCompletionRenderRefreshes('observer', 1, {
      hasActivePendingMovementForObserver: () => false,
      hasRenderWork: () => true,
      getTargetTokenIds: () => ['target'],
      shouldUseFullPostCompletionRefreshCadence: () => true,
      refreshTokenVisibility,
    });

    jest.advanceTimersByTime(1200);

    expect(refreshTokenVisibility).toHaveBeenCalledTimes(4);
  });

  test('animation refresh uses light cadence unless full cadence is requested', () => {
    jest.useFakeTimers();

    const refreshTokenVisibility = jest.fn();
    scheduleAnimationRenderRefreshes('observer', 1, {
      getEntry: () => ({ serial: 1 }),
      getTargetTokenIds: () => ['target'],
      refreshTokenVisibility,
    });

    jest.advanceTimersByTime(100);

    expect(refreshTokenVisibility).toHaveBeenCalledTimes(3);
  });

  test('animation refresh keeps full cadence for sensitive visual work', () => {
    jest.useFakeTimers();

    const refreshTokenVisibility = jest.fn();
    scheduleAnimationRenderRefreshes('observer', 1, {
      getEntry: () => ({ serial: 1 }),
      getTargetTokenIds: () => ['target'],
      shouldUseFullAnimationRefreshCadence: () => true,
      refreshTokenVisibility,
    });

    jest.advanceTimersByTime(100);

    expect(refreshTokenVisibility).toHaveBeenCalledTimes(8);
  });

  test('can refresh pending movement token visuals without refreshing perception', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.nameplate = { visible: true };
    target.refresh = jest.fn();
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      perception: {
        update: jest.fn(),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);
    refreshPendingMovementTokenVisibility('observer', { skipPerceptionRefresh: true });

    expect(target.renderable).toBe(false);
    expect(target.refresh).toHaveBeenCalledTimes(1);
    expect(global.canvas.perception.update).not.toHaveBeenCalled();
  });

  test('does not restore undetected token rendering during a transient observer lookup gap', () => {
    jest.useFakeTimers();

    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.nameplate = { visible: true };
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      perception: {
        update: jest.fn(),
      },
    };

    expect(forceTokenInvisibleForObserverVisibility(observer, target, 'undetected')).toBe(true);
    global.canvas.tokens.get = jest.fn(() => null);
    global.canvas.tokens.placeables = [target];

    expect(restorePendingMovementTokenRendering(target)).toBe(false);
    expect(target.renderable).toBe(false);
    expect(target.mesh.renderable).toBe(false);
    expect(target.mesh.alpha).toBe(0);
    expect(target.nameplate.visible).toBe(false);

    jest.advanceTimersByTime(1001);

    expect(restorePendingMovementTokenRendering(target)).toBe(true);
    expect(target.renderable).toBe(true);
    expect(target.mesh.renderable).toBe(true);
    expect(target.mesh.alpha).toBe(1);
    expect(target.nameplate.visible).toBe(true);
  });

  test('does not restore undetected token rendering from a remembered force decision', () => {
    jest.useFakeTimers();

    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', visible: false });
    target.renderable = false;
    target.mesh = { visible: false, renderable: false, alpha: 0 };
    target.nameplate = { visible: false };
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      perception: {
        update: jest.fn(),
      },
    };

    expect(forceTokenInvisibleForObserverVisibility(observer, target, 'undetected')).toBe(true);
    target._pf2eVisionerPendingRenderState = {
      tokenRenderable: true,
      meshRenderable: true,
      meshAlpha: 1,
      surfaceVisibility: [{ name: 'nameplate', surface: target.nameplate, visible: true }],
    };
    global.canvas.tokens.get = jest.fn(() => null);
    global.canvas.tokens.placeables = [target];

    expect(restorePendingMovementTokenRendering(target)).toBe(false);
    expect(target.renderable).toBe(false);
    expect(target.mesh.renderable).toBe(false);
    expect(target.mesh.alpha).toBe(0);
    expect(target.nameplate.visible).toBe(false);

    jest.advanceTimersByTime(1001);

    expect(restorePendingMovementTokenRendering(target)).toBe(true);
    expect(target.renderable).toBe(true);
    expect(target.mesh.renderable).toBe(true);
    expect(target.mesh.alpha).toBe(1);
    expect(target.nameplate.visible).toBe(true);
  });

  test('does not clear remembered undetected rendering during a later wall-only force check', () => {
    jest.useFakeTimers();

    const observer = createMockToken({
      id: 'observer',
      x: 0,
      y: 0,
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const other = createMockToken({ id: 'other', x: 0, y: 0 });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: false });
    target.document.getVisibilityTestPoints = jest.fn(() => [{ x: 175, y: 25 }]);
    target.renderable = false;
    target.mesh = { visible: false, renderable: false, alpha: 0 };
    target.nameplate = { visible: false };
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => {
          if (id === 'observer') return observer;
          if (id === 'other') return other;
          return null;
        }),
        placeables: [observer, other, target],
      },
      effects: {
        visionSources: [{ active: true, object: other }],
        lightSources: [],
      },
      visibility: {
        testVisibility: jest.fn(() => true),
      },
      perception: {
        update: jest.fn(),
      },
    };

    expect(forceTokenInvisibleForObserverVisibility(observer, target, 'undetected')).toBe(true);
    target._pf2eVisionerPendingRenderState = {
      tokenRenderable: true,
      meshRenderable: true,
      meshAlpha: 1,
      surfaceVisibility: [{ name: 'nameplate', surface: target.nameplate, visible: true }],
    };
    setPendingTokenMovementPosition(other.document, { x: 0, y: 0 }, [other]);
    expect(shouldTemporarilyForceTokenInvisible(target)).toBe(false);
    clearPendingTokenMovementPosition('other');
    global.canvas.tokens.get = jest.fn(() => null);
    global.canvas.tokens.placeables = [target];
    global.canvas.effects.visionSources = [];

    expect(restorePendingMovementTokenRendering(target)).toBe(false);
    expect(target.renderable).toBe(false);
    expect(target.mesh.renderable).toBe(false);
    expect(target.mesh.alpha).toBe(0);
    expect(target.nameplate.visible).toBe(false);
  });

  test('restores undetected token rendering immediately when observer state becomes observed', () => {
    jest.useFakeTimers();

    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', visible: false });
    target.renderable = false;
    target.mesh = { visible: false, renderable: false, alpha: 0 };
    target.nameplate = { visible: false };
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      perception: {
        update: jest.fn(),
      },
    };

    expect(forceTokenInvisibleForObserverVisibility(observer, target, 'undetected')).toBe(true);
    target._pf2eVisionerPendingRenderState = {
      tokenRenderable: true,
      meshRenderable: true,
      meshAlpha: 1,
      surfaceVisibility: [{ name: 'nameplate', surface: target.nameplate, visible: true }],
    };
    observer.document.getFlag.mockReturnValue(visibilityV2Map({ target: 'observed' }));

    expect(restorePendingMovementTokenRendering(target)).toBe(true);
    expect(target.renderable).toBe(true);
    expect(target.mesh.renderable).toBe(true);
    expect(target.mesh.alpha).toBe(1);
    expect(target.nameplate.visible).toBe(true);
  });

  test('restores observed token rendering while other pending movement is active', () => {
    jest.useFakeTimers();

    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.nameplate = { visible: true };
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      perception: {
        update: jest.fn(),
      },
    };

    expect(forceTokenInvisibleForObserverVisibility(observer, target, 'undetected')).toBe(true);
    observer.document.getFlag.mockReturnValue(visibilityV2Map({ target: 'observed' }));

    expect(restorePendingMovementTokenRendering(target)).toBe(true);
    expect(target.renderable).toBe(true);
    expect(target.mesh.renderable).toBe(true);
    expect(target.mesh.alpha).toBe(1);
    expect(target.nameplate.visible).toBe(true);
  });

  test('restoring observed token rendering preserves hidden level and target-pip chrome', () => {
    jest.useFakeTimers();

    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.levelIndicator = { visible: false };
    target.targetPips = { visible: false };
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      perception: {
        update: jest.fn(),
      },
    };

    expect(forceTokenInvisibleForObserverVisibility(observer, target, 'undetected')).toBe(true);
    observer.document.getFlag.mockReturnValue(visibilityV2Map({ target: 'observed' }));

    expect(restorePendingMovementTokenRendering(target)).toBe(true);
    expect(target.renderable).toBe(true);
    expect(target.mesh.renderable).toBe(true);
    expect(target.levelIndicator.visible).toBe(false);
    expect(target.targetPips.visible).toBe(false);
  });

  test('hides transient level indicator chrome after refreshing observed pending target', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'observed' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.levelIndicator = { visible: false };
    target.refresh = jest.fn(() => {
      target.levelIndicator.visible = true;
    });
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        controlled: [observer],
        placeables: [observer, target],
      },
      perception: {
        update: jest.fn(),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);
    refreshPendingMovementTokenVisibility('observer', {
      skipPerceptionRefresh: true,
      targetTokenIds: ['target'],
    });

    expect(target.refresh).toHaveBeenCalledTimes(1);
    expect(target.levelIndicator.visible).toBe(false);
  });

  test('restores concealed observed token rendering immediately after Visioner-hidden movement upgrade', () => {
    jest.useFakeTimers();

    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.nameplate = { visible: true };
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      perception: {
        update: jest.fn(),
      },
    };

    expect(forceTokenInvisibleForObserverVisibility(observer, target, 'undetected')).toBe(true);
    observer.document.getFlag.mockReturnValue({
      target: {
        detectionState: 'observed',
        hasConcealment: true,
      },
    });

    expect(restorePendingMovementTokenRendering(target)).toBe(true);
    expect(target.renderable).toBe(true);
    expect(target.mesh.renderable).toBe(true);
    expect(target.mesh.alpha).toBe(1);
    expect(target.nameplate.visible).toBe(true);
  });

  test('restores token rendering after pending movement clears and target becomes observed', () => {
    jest.useFakeTimers();

    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.nameplate = { visible: true };
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      perception: {
        update: jest.fn(),
      },
    };

    expect(forceTokenInvisibleForObserverVisibility(observer, target, 'undetected')).toBe(true);
    observer.document.getFlag.mockReturnValue(visibilityV2Map({ target: 'observed' }));

    expect(restorePendingMovementTokenRendering(target)).toBe(true);
    expect(target.renderable).toBe(true);
    expect(target.mesh.renderable).toBe(true);
    expect(target.mesh.alpha).toBe(1);
    expect(target.nameplate.visible).toBe(true);
  });

  test('does not keep render lock from stale legacy hidden when canonical state is observed', () => {
    jest.useFakeTimers();

    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: {
        'pf2e-visioner': {
          visibility: {
            target: 'hidden',
          },
        },
      },
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.nameplate = { visible: true };
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      perception: {
        update: jest.fn(),
      },
    };

    expect(forceTokenInvisibleForObserverVisibility(observer, target, 'undetected')).toBe(true);
    expect(restorePendingMovementTokenRendering(target, { ignoreObservedGrace: true })).toBe(true);
    expect(target.renderable).toBe(true);
    expect(target.mesh.renderable).toBe(true);
    expect(target.mesh.alpha).toBe(1);
    expect(target.nameplate.visible).toBe(true);
  });

  test('does not restore token rendering while controlled observer still has target undetected', () => {
    jest.useFakeTimers();

    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.nameplate = { visible: true };
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        controlled: [observer],
        placeables: [observer, target],
      },
      perception: {
        update: jest.fn(),
      },
    };

    expect(forceTokenInvisibleForObserverVisibility(observer, target, 'undetected')).toBe(true);
    jest.advanceTimersByTime(300);

    expect(restorePendingMovementTokenRendering(target)).toBe(false);
    expect(target.renderable).toBe(false);
    expect(target.mesh.renderable).toBe(false);
    expect(target.mesh.alpha).toBe(0);
    expect(target.nameplate.visible).toBe(false);
  });

  test('waits for detection filter when controlled observer state settles back to hidden', () => {
    jest.useFakeTimers();

    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.nameplate = { visible: true };
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        controlled: [observer],
        placeables: [observer, target],
      },
      perception: {
        update: jest.fn(),
      },
    };

    observer.document.getFlag.mockImplementation((moduleId, key) => {
      if (moduleId !== 'pf2e-visioner') return null;
      if (key === 'visibilityV2') return visibilityV2Map({ target: 'hidden' });
      return {};
    });
    expect(forceTokenInvisibleForObserverVisibility(observer, target, 'hidden')).toBe(true);

    expect(restorePendingMovementTokenRendering(target)).toBe(false);
    expect(target.renderable).toBe(false);
    expect(target.mesh.renderable).toBe(false);
    expect(target.mesh.alpha).toBe(0);
    expect(target.nameplate.visible).toBe(false);

    target.detectionFilter = { id: 'soundwave-filter' };

    expect(restorePendingMovementTokenRendering(target)).toBe(true);
    expect(target.renderable).toBe(true);
    expect(target.mesh.renderable).toBe(true);
    expect(target.mesh.alpha).toBe(1);
    expect(target.nameplate.visible).toBe(true);
  });

  test('keeps newly hidden target invisible until detection filter is ready', () => {
    jest.useFakeTimers();

    const observer = createMockToken({ id: 'observer' });
    const target = createMockToken({ id: 'target', visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.nameplate = { visible: true };
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        controlled: [observer],
        placeables: [observer, target],
      },
      perception: {
        update: jest.fn(),
      },
    };

    expect(forceTokenInvisibleForObserverVisibility(observer, target, 'hidden')).toBe(true);
    expect(target.visible).toBe(false);
    expect(target.renderable).toBe(false);
    expect(target.mesh.visible).toBe(false);
    expect(restorePendingMovementTokenRendering(target)).toBe(false);
    expect(restorePendingMovementTokenRendering(target, { ignoreObserverLocks: true })).toBe(false);

    target.detectionFilter = { id: 'soundwave-filter' };

    expect(restorePendingMovementTokenRendering(target)).toBe(true);
    expect(target.visible).toBe(true);
    expect(target.renderable).toBe(true);
    expect(target.mesh.visible).toBe(true);
    expect(target.mesh.renderable).toBe(true);
    expect(target.nameplate.visible).toBe(true);
  });

  test('does not force newly hidden target invisible while stale stored state is undetected', () => {
    const observer = createMockToken({
      id: 'observer',
      flags: {
        'pf2e-visioner': {
          visibilityV2: {
            target: {
              detectionState: 'undetected',
              hasConcealment: false,
              coverState: 'none',
            },
          },
        },
      },
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.nameplate = { visible: true };
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        controlled: [observer],
        placeables: [observer, target],
      },
      perception: {
        update: jest.fn(),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);

    expect(forceTokenInvisibleForObserverVisibility(observer, target, 'hidden')).toBe(false);
    expect(target.visible).toBe(true);
    expect(target.renderable).toBe(true);
    expect(target.mesh.visible).toBe(true);
    expect(target.mesh.renderable).toBe(true);
    expect(target.mesh.alpha).toBe(1);
    expect(target.nameplate.visible).toBe(true);
  });

  test('does not downgrade filter-pending hidden lock during wall-blocked refresh', () => {
    jest.useFakeTimers();

    const observer = createMockToken({ id: 'observer', x: 0, y: 0 });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.nameplate = { visible: true };
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        controlled: [observer],
        placeables: [observer, target],
      },
      perception: {
        update: jest.fn(),
      },
    };

    expect(forceTokenInvisibleForObserverVisibility(observer, target, 'hidden')).toBe(true);
    expect(forceTokenInvisibleForObserverVisibility(observer, target, 'undetected')).toBe(true);

    expect(restorePendingMovementTokenRendering(target)).toBe(false);

    target.detectionFilter = { id: 'soundwave-filter' };

    expect(restorePendingMovementTokenRendering(target)).toBe(true);
  });

  test('skips token refresh while newly hidden target waits for detection filter', () => {
    jest.useFakeTimers();

    const observer = createMockToken({ id: 'observer' });
    const target = createMockToken({ id: 'target', visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.nameplate = { visible: true };
    target.refresh = jest.fn(() => {
      target.visible = true;
      target.renderable = true;
      target.mesh.visible = true;
      target.mesh.renderable = true;
      target.mesh.alpha = 1;
      target.nameplate.visible = true;
    });
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        controlled: [observer],
        placeables: [observer, target],
      },
      perception: {
        update: jest.fn(),
      },
    };

    expect(forceTokenInvisibleForObserverVisibility(observer, target, 'hidden')).toBe(true);

    refreshPendingMovementTokenVisibility([], { targetTokenIds: ['target'] });

    expect(target.refresh).not.toHaveBeenCalled();
    expect(target.visible).toBe(false);
    expect(target.renderable).toBe(false);
    expect(target.mesh.visible).toBe(false);
    expect(target.mesh.renderable).toBe(false);
    expect(target.mesh.alpha).toBe(0);

    target.detectionFilter = { id: 'soundwave-filter' };
    refreshPendingMovementTokenVisibility([], { targetTokenIds: ['target'] });

    expect(target.visible).toBe(true);
    expect(target.renderable).toBe(true);
    expect(target.mesh.visible).toBe(true);
  });

  test('does not delete detection filter created for pending hidden render unlock', () => {
    jest.useFakeTimers();

    const observer = createMockToken({ id: 'observer' });
    const target = createMockToken({ id: 'target', visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        controlled: [observer],
        placeables: [observer, target],
      },
      perception: {
        update: jest.fn(),
      },
    };

    expect(forceTokenInvisibleForObserverVisibility(observer, target, 'hidden')).toBe(true);

    const detectionFilterState = capturePendingMovementDetectionFilterState(target, {
      hasDetectionWork: true,
    });
    const soundwaveFilter = { id: 'soundwave-filter' };
    target.detectionFilter = soundwaveFilter;

    expect(restorePendingMovementTokenRendering(target)).toBe(true);
    restorePendingMovementDetectionFilterState(target, detectionFilterState);

    expect(target.detectionFilter).toBe(soundwaveFilter);
  });

  test('suppresses hidden soundwave while controlled pending observer has current sight line', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.detectionFilter = { id: 'stale-soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer]);

    expect(shouldSuppressPendingMovementDetectionFilterVisuals(target)).toBe(true);
    expect(capturePendingMovementDetectionFilterState(target, { hasDetectionWork: true })).toBeNull();
  });

  test('does not scan wall geometry for current sight-line soundwave suppression without limited walls', () => {
    let geometryReads = 0;
    global.canvas.walls.placeables = Array.from({ length: 1000 }, (_, index) => ({
      document: {
        id: `normal-wall-${index}`,
        get c() {
          geometryReads += 1;
          return [10000 + index, 0, 10000 + index, 100];
        },
        sight: WALL_SENSE_TYPES.NORMAL,
        sound: WALL_SENSE_TYPES.NORMAL,
        door: 0,
        ds: 0,
      },
    }));
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.detectionFilter = { id: 'stale-soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: [
          {
            active: true,
            object: observer,
            los: { contains: jest.fn(() => true) },
          },
        ],
        lightSources: [],
      },
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer]);

    expect(shouldSuppressPendingMovementDetectionFilterVisuals(target)).toBe(true);
    expect(geometryReads).toBe(0);
  });

  test('suppresses hidden soundwave during drag before pending movement entry exists', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.detectionFilter = { id: 'stale-soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    expect(shouldSuppressPendingMovementDetectionFilterVisuals(target)).toBe(true);
    expect(capturePendingMovementDetectionFilterState(target, { hasDetectionWork: true })).toBeNull();
  });

  test('prefers live dragged observer position over stale canvas token position', () => {
    const staleObserver = createMockToken({
      id: 'observer',
      x: 0,
      y: 0,
      controlled: true,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const draggedObserver = createMockToken({
      id: 'observer',
      x: 200,
      y: 0,
      controlled: true,
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.detectionFilter = { id: 'stale-soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      walls: {
        placeables: [
          {
            document: {
              id: 'wall',
              c: [100, 0, 100, 200],
              sight: 1,
              door: 0,
              ds: 0,
            },
          },
        ],
      },
      tokens: {
        get: jest.fn((id) =>
          id === 'observer' ? staleObserver : id === 'target' ? target : null,
        ),
        _draggedToken: draggedObserver,
        controlled: [staleObserver],
        placeables: [staleObserver, target],
      },
    };

    setPendingTokenMovementPosition(staleObserver.document, { x: 200, y: 0 }, [staleObserver]);

    expect(shouldSuppressPendingMovementDetectionFilterVisuals(target)).toBe(true);
  });

  test('uses active core LOS source before fallback wall geometry', () => {
    const observer = createMockToken({
      id: 'observer',
      x: 0,
      y: 0,
      controlled: true,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.detectionFilter = { id: 'stale-soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: new Map([
          [
            'observer',
            {
              active: true,
              object: observer,
              los: { contains: jest.fn(() => true) },
            },
          ],
        ]),
        lightSources: new Map(),
      },
      walls: {
        placeables: [
          {
            document: {
              id: 'wall',
              c: [100, 0, 100, 200],
              sight: 1,
              door: 0,
              ds: 0,
            },
          },
        ],
      },
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer]);

    expect(shouldSuppressPendingMovementDetectionFilterVisuals(target)).toBe(true);
  });

  test('falls back to moving token geometry when active LOS source has not caught up', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      x: 0,
      y: 0,
      controlled: true,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.detectionFilter = { id: 'stale-soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: new Map([
          [
            'observer',
            {
              active: true,
              object: observer,
              los: { contains: jest.fn(() => false) },
            },
          ],
        ]),
        lightSources: new Map(),
      },
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer]);

    expect(shouldSuppressPendingMovementDetectionFilterVisuals(target)).toBe(true);
  });

  test('restores core-visible undetected render lock without token refresh stall', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      x: 100,
      y: 0,
      controlled: true,
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    observer._animation = { state: 'running', promise: Promise.resolve() };
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.levelIndicator = { visible: false };
    target.targetPips = { visible: false };
    target.refresh = jest.fn();
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: new Map([
          [
            'observer',
            {
              active: true,
              object: observer,
              los: { contains: jest.fn(() => false) },
            },
          ],
        ]),
        lightSources: new Map(),
      },
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    expect(forceTokenInvisibleForObserverVisibility(observer, target, 'undetected')).toBe(true);
    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer], {
      finalVisibilityStatesByTargetId: { target: 'observed' },
    });
    refreshPendingMovementTokenVisibility(['observer'], {
      skipPerceptionRefresh: true,
      targetTokenIds: ['target'],
    });

    expect(target.refresh).not.toHaveBeenCalled();
    expect(target.visible).toBe(true);
    expect(target.renderable).toBe(true);
    expect(target.mesh.visible).toBe(true);
    expect(target.mesh.renderable).toBe(true);
    expect(target._pf2eVisionerPendingRenderState).toBeUndefined();

  });

  test('keeps core-owned undetected render lock without token refresh while current LOS is blocked', () => {
    global.canvas.walls.placeables = [
      createMockWall({ id: 'wall', c: [100, 0, 100, 200], sight: 1, sound: 0 }),
    ];
    const observer = createMockToken({
      id: 'observer',
      x: 0,
      y: 0,
      controlled: true,
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    observer._animation = { state: 'running', promise: Promise.resolve() };
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.refresh = jest.fn();
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: new Map([
          [
            'observer',
            {
              active: true,
              object: observer,
              los: { contains: jest.fn(() => false) },
            },
          ],
        ]),
        lightSources: new Map(),
      },
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    expect(forceTokenInvisibleForObserverVisibility(observer, target, 'undetected')).toBe(true);
    setPendingTokenMovementPosition(observer.document, { x: 150, y: 0 }, [observer], {
      finalVisibilityStatesByTargetId: { target: 'observed' },
    });
    refreshPendingMovementTokenVisibility(['observer'], {
      skipPerceptionRefresh: true,
      targetTokenIds: ['target'],
    });

    expect(target.refresh).not.toHaveBeenCalled();
    expect(target.visible).toBe(false);
    expect(target.renderable).toBe(false);
    expect(target.mesh.visible).toBe(false);
    expect(target.mesh.renderable).toBe(false);
    expect(target._pf2eVisionerPendingRenderState).toBeDefined();
  });

  test('uses active core LOS source even when observer sight range is zero', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      vision: { enabled: true, range: 0, angle: 360 },
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.detectionFilter = { id: 'stale-soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: new Map([
          [
            'observer',
            {
              active: true,
              object: observer,
              los: { contains: jest.fn(() => true) },
            },
          ],
        ]),
        lightSources: new Map(),
      },
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer]);

    expect(shouldSuppressPendingMovementDetectionFilterVisuals(target)).toBe(true);
  });

  test('suppresses hidden soundwave from current sight line even when final state is still hidden', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.detectionFilter = { id: 'stale-soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer], {
      finalVisibilityStatesByTargetId: { target: 'hidden' },
    });

    expect(shouldSuppressPendingMovementDetectionFilterVisuals(target)).toBe(true);
  });

  test('uses current sight line for hidden soundwave even when final movement state is undetected', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.detectionFilter = { id: 'soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer], {
      finalVisibilityStatesByTargetId: { target: 'undetected' },
    });

    expect(shouldSuppressPendingMovementDetectionFilterVisuals(target)).toBe(true);
  });

  test('keeps clear-sight hidden soundwave suppression briefly after movement completes', () => {
    jest.useFakeTimers();
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.detectionFilter = { id: 'stale-soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer]);
    expect(shouldSuppressPendingMovementDetectionFilterVisuals(target)).toBe(true);

    expect(completePendingTokenMovement('observer')).toBe(true);
    global.canvas.tokens._draggedToken = null;

    expect(shouldSuppressPendingMovementDetectionFilterVisuals(target)).toBe(true);

    jest.advanceTimersByTime(1001);

    expect(shouldSuppressPendingMovementDetectionFilterVisuals(target)).toBe(false);
  });

  test('drops clear-sight grace when current hidden sight line becomes wall-blocked', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.detectionFilter = { id: 'soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer]);
    expect(shouldSuppressPendingMovementDetectionFilterVisuals(target)).toBe(true);

    global.canvas.walls.placeables = [
      createMockWall({ id: 'wall', c: [100, 0, 100, 200], sight: 1, sound: 0 }),
    ];

    expect(shouldSuppressPendingMovementDetectionFilterVisuals(target)).toBe(false);
  });

  test('keeps hidden soundwave despite observed-transition suppression when current sight is blocked', () => {
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.detectionFilter = { id: 'soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };
    suppressPendingMovementDetectionFilterVisualsForObservedTransition(target, {
      durationMs: 1000,
    });

    expect(shouldSuppressPendingMovementDetectionFilterVisuals(target)).toBe(false);
  });

  test('suppresses stale soundwave when current controlled observer sees target as observed', () => {
    const staleObserver = createMockToken({
      id: 'stale-observer',
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const currentObserver = createMockToken({
      id: 'current-observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'observed' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.detectionFilter = { id: 'stale-soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: new Map([
          [
            'current-observer',
            {
              active: true,
              object: currentObserver,
              los: { contains: jest.fn(() => true) },
            },
          ],
        ]),
        lightSources: new Map(),
      },
      tokens: {
        get: jest.fn((id) =>
          id === 'stale-observer'
            ? staleObserver
            : id === 'current-observer'
              ? currentObserver
              : id === 'target'
                ? target
                : null,
        ),
        _draggedToken: null,
        controlled: [currentObserver],
        placeables: [staleObserver, currentObserver, target],
      },
    };

    expect(shouldSuppressPendingMovementDetectionFilterVisuals(target)).toBe(true);
  });

  test('clears stale soundwave visuals when no observer is selected', () => {
    const target = createMockToken({ id: 'target', visible: true });
    target.detectionFilter = { id: 'stale-soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'target' ? target : null)),
        controlled: [],
        placeables: [target],
      },
    };

    expect(clearNoObserverDetectionFilterVisuals()).toBe(1);
    expect(target.detectionFilter).toBeNull();
    expect(target.detectionFilterMesh).toMatchObject({
      visible: false,
      renderable: false,
      alpha: 0,
    });
  });

  test('keeps soundwave visuals while an observer is selected', () => {
    const observer = createMockToken({ id: 'observer', controlled: true });
    const target = createMockToken({ id: 'target', visible: true });
    target.detectionFilter = { id: 'soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) =>
          id === 'observer' ? observer : id === 'target' ? target : null,
        ),
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    expect(clearNoObserverDetectionFilterVisuals()).toBe(0);
    expect(target.detectionFilter).toEqual({ id: 'soundwave-filter' });
    expect(target.detectionFilterMesh).toMatchObject({
      visible: true,
      renderable: true,
      alpha: 1,
    });
  });

  test('keeps core soundwave while observed state waits for wall-blocked movement update', () => {
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'observed' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.detectionFilter = { id: 'core-soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };
    suppressPendingMovementDetectionFilterVisualsForObservedTransition(target, {
      durationMs: 1000,
    });

    expect(shouldSuppressPendingMovementDetectionFilterVisuals(target)).toBe(false);
  });

  test('keeps core soundwave after movement completes while observed state waits for hidden write', () => {
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'observed' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.detectionFilter = { id: 'core-soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    target.refresh = jest.fn();
    global.canvas = {
      ...global.canvas,
      walls: {
        placeables: [
          {
            document: {
              id: 'sight-wall',
              c: [100, -100, 100, 100],
              sight: 1,
              sound: 0,
              door: 0,
              ds: 0,
            },
          },
        ],
      },
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: null,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer], {
      finalVisibilityStatesByTargetId: { target: 'hidden' },
    });
    completePendingTokenMovement('observer');

    expect(target.detectionFilter).toEqual({ id: 'core-soundwave-filter' });
    expect(target.detectionFilterMesh).toMatchObject({
      visible: true,
      renderable: true,
      alpha: 1,
    });
  });

  test('lets core render soundwave when observed target leaves current sight line before state update', () => {
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'observed' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.detectionFilter = null;
    target.detectionFilterMesh = { visible: false, renderable: false, alpha: 0 };
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };
    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);

    expect(shouldSuppressPendingMovementDetectionFilterVisuals(target)).toBe(false);
  });

  test('refreshes targets during controlled drag intent so core LOS can add soundwaves before movement end', () => {
    jest.useFakeTimers();
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'observed' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.detectionFilter = null;
    target.detectionFilterMesh = { visible: false, renderable: false, alpha: 0 };
    target.refresh = jest.fn(() => {
      target.detectionFilter = { id: 'core-soundwave-filter' };
      target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    });
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: null,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    primePendingControlledTokenDragIntent(observer);
    jest.advanceTimersByTime(100);

    expect(target.refresh).toHaveBeenCalled();
    expect(target.detectionFilter).toEqual({ id: 'core-soundwave-filter' });
    expect(target.detectionFilterMesh).toMatchObject({
      visible: true,
      renderable: true,
      alpha: 1,
    });
  });

  test('refreshes observed targets as soon as moving observer LOS becomes blocked', () => {
    jest.useFakeTimers();
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'observed' }),
    });
    observer.document.object = observer;
    const target = createMockToken({ id: 'target', x: 0, y: 0, visible: true });
    target.detectionFilter = null;
    target.detectionFilterMesh = { visible: false, renderable: false, alpha: 0 };
    target.refresh = jest.fn(() => {
      target.detectionFilter = { id: 'core-soundwave-filter' };
      target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    });

    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: new Map([
          [
            'observer',
            {
              active: true,
              object: observer,
              los: { contains: jest.fn(() => false) },
              shape: { contains: jest.fn(() => false) },
            },
          ],
        ]),
        lightSources: new Map(),
      },
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer]);
    observer.x = 100;
    observer.center = { x: 125, y: 25 };
    observer.getCenterPoint.mockReturnValue(observer.center);
    observer.document.x = 100;
    expect(schedulePendingTokenMovementCompletion(observer.document)).toBe(true);

    jest.advanceTimersByTime(50);

    expect(target.refresh).toHaveBeenCalled();
    expect(target.detectionFilter).toEqual({ id: 'core-soundwave-filter' });
  });

  test('starts observed-to-hidden refresh cadence from pending movement preupdate', () => {
    jest.useFakeTimers();
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'observed' }),
    });
    observer.document.object = observer;
    const target = createMockToken({ id: 'target', x: 0, y: 0, visible: true });
    target.refresh = jest.fn(() => {
      target.detectionFilter = { id: 'core-soundwave-filter' };
    });
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: new Map([
          [
            'observer',
            {
              active: true,
              object: observer,
              los: { contains: jest.fn(() => false) },
              shape: { contains: jest.fn(() => false) },
            },
          ],
        ]),
        lightSources: new Map(),
      },
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer]);
    observer.x = 100;
    observer.center = { x: 125, y: 25 };
    observer.getCenterPoint.mockReturnValue(observer.center);
    observer.document.x = 100;
    jest.advanceTimersByTime(50);

    expect(target.refresh).toHaveBeenCalled();
    expect(target.detectionFilter).toEqual({ id: 'core-soundwave-filter' });
  });

  test('skips undetected targets during pre-drag controlled intent refreshes', () => {
    jest.useFakeTimers();
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.refresh = jest.fn();
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: null,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    primePendingControlledTokenDragIntent(observer);
    jest.advanceTimersByTime(500);

    expect(target.refresh).not.toHaveBeenCalled();
  });

  test('keeps hidden soundwave while controlled pending observer sight line remains wall-blocked', () => {
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.detectionFilter = { id: 'soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer]);

    expect(shouldSuppressPendingMovementDetectionFilterVisuals(target)).toBe(false);
    expect(capturePendingMovementDetectionFilterState(target, { hasDetectionWork: true })).not.toBeNull();
  });

  test('keeps hidden soundwave while blinded moving observer light overlaps target', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      actor: {
        hasCondition: jest.fn((slug) => slug === 'blinded'),
      },
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.detectionFilter = { id: 'soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: [],
        lightSources: [
          {
            active: true,
            object: observer,
            los: { contains: jest.fn(() => true) },
            shape: { contains: jest.fn(() => true) },
          },
        ],
      },
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer]);

    expect(currentPendingMovementSightLineSeesTarget(observer, target)).toBe(false);
    expect(shouldSuppressPendingMovementDetectionFilterVisuals(target)).toBe(false);
    expect(capturePendingMovementDetectionFilterState(target, { hasDetectionWork: true })).not.toBeNull();
  });

  test('refreshes wall-blocked hidden soundwave targets without freezing animation', () => {
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    const soundwaveFilter = { id: 'soundwave-filter', animated: true };
    target.detectionFilter = soundwaveFilter;
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    target.refresh = jest.fn(() => {
      target.detectionFilter = { id: 'recomputed-soundwave-filter', animated: true };
    });
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer]);
    refreshPendingMovementTokenVisibility(['observer'], { skipPerceptionRefresh: true });

    expect(target.refresh).toHaveBeenCalledTimes(1);
    expect(target.detectionFilter).not.toBe(soundwaveFilter);
    expect(target.detectionFilter).toMatchObject({ id: 'recomputed-soundwave-filter' });
    expect(target.detectionFilter.animated).toBe(true);
  });

  test('clears stale soundwave when pending final observed target enters current sight line', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.detectionFilter = { id: 'stale-soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    target.refresh = jest.fn();
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer], {
      finalVisibilityStatesByTargetId: { target: 'observed' },
    });
    refreshPendingMovementTokenVisibility(['observer'], { skipPerceptionRefresh: true });

    expect(target.refresh).not.toHaveBeenCalled();
    expect(target.detectionFilter).toBeNull();
    expect(target.detectionFilterMesh).toMatchObject({
      visible: false,
      renderable: false,
      alpha: 0,
    });
  });

  test('clears observed soundwave then recreates animated hidden soundwave when returning behind same wall', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.detectionFilter = { id: 'stale-soundwave-filter', animated: true };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    target.refresh = jest.fn(() => {
      target.detectionFilter = {
        id: 'returned-hidden-soundwave-filter',
        animated: true,
        uniforms: { wave: true },
      };
      target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    });
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer], {
      finalVisibilityStatesByTargetId: { target: 'observed' },
    });
    refreshPendingMovementTokenVisibility(['observer'], { skipPerceptionRefresh: true });

    expect(target.refresh).not.toHaveBeenCalled();
    expect(target.detectionFilter).toBeNull();
    expect(target.detectionFilterMesh).toMatchObject({
      visible: false,
      renderable: false,
      alpha: 0,
    });

    global.canvas.walls.placeables = [
      createMockWall({ id: 'wall', c: [100, 0, 100, 200], sight: 1, sound: 0 }),
    ];
    observer.document.update({ flags: visibilityV2Flags({ target: 'hidden' }) });
    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer], {
      finalVisibilityStatesByTargetId: { target: 'hidden' },
    });
    refreshPendingMovementTokenVisibility(['observer'], { skipPerceptionRefresh: true });

    expect(target.refresh).toHaveBeenCalledTimes(1);
    expect(target.detectionFilter).toMatchObject({
      id: 'returned-hidden-soundwave-filter',
      animated: true,
      uniforms: { wave: true },
    });
    expect(target.detectionFilterMesh).toMatchObject({
      visible: true,
      renderable: true,
      alpha: 1,
    });
  });

  test('keeps pending final observed soundwave while current sight line remains blocked', () => {
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const soundwaveFilter = { id: 'wall-blocked-soundwave-filter' };
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.detectionFilter = soundwaveFilter;
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    target.refresh = jest.fn();
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer], {
      finalVisibilityStatesByTargetId: { target: 'observed' },
    });
    refreshPendingMovementTokenVisibility(['observer'], { skipPerceptionRefresh: true });

    expect(target.detectionFilter).toBe(soundwaveFilter);
    expect(target.detectionFilterMesh).toMatchObject({
      visible: true,
      renderable: true,
      alpha: 1,
    });
  });

  test('clears pending final observed soundwave once moving observer reaches destination', () => {
    global.canvas.walls.placeables = [
      createMockWall({ id: 'wall', c: [100, 0, 100, 200], sight: 1, sound: 0 }),
    ];
    const observer = createMockToken({
      id: 'observer',
      x: 100,
      y: 0,
      controlled: true,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.detectionFilter = { id: 'stale-soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    target.refresh = jest.fn();
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer], {
      finalVisibilityStatesByTargetId: { target: 'observed' },
    });
    refreshPendingMovementTokenVisibility(['observer'], { skipPerceptionRefresh: true });

    expect(target.refresh).not.toHaveBeenCalled();
    expect(target.detectionFilter).toBeNull();
    expect(target.detectionFilterMesh).toMatchObject({
      visible: false,
      renderable: false,
      alpha: 0,
    });
  });

  test('clears stale current-view observed soundwave after movement settles even when sight line helper is blocked', () => {
    global.canvas.walls.placeables = [
      createMockWall({ id: 'wall', c: [100, 0, 100, 200], sight: 1, sound: 0 }),
    ];
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'observed' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.detectionFilter = { id: 'stale-soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    target.refresh = jest.fn();
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: null,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    refreshPendingMovementTokenVisibility([], {
      skipPerceptionRefresh: true,
      targetTokenIds: ['target'],
    });

    expect(target.refresh).not.toHaveBeenCalled();
    expect(target.detectionFilter).toBeNull();
    expect(target.detectionFilterMesh).toMatchObject({
      visible: false,
      renderable: false,
      alpha: 0,
    });
  });

  test('clears predicted observed soundwave as pending movement completes before map write settles', () => {
    global.canvas.walls.placeables = [
      createMockWall({ id: 'wall', c: [100, 0, 100, 200], sight: 1, sound: 0 }),
    ];
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.detectionFilter = { id: 'stale-soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: null,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer], {
      finalVisibilityStatesByTargetId: { target: 'observed' },
    });
    completePendingTokenMovement('observer');

    expect(target.detectionFilter).toBeNull();
    expect(target.detectionFilterMesh).toMatchObject({
      visible: false,
      renderable: false,
      alpha: 0,
    });
  });

  test('keeps token refresh when hidden soundwave target is no longer wall-blocked', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.detectionFilter = { id: 'soundwave-filter', animated: true };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    target.refresh = jest.fn();
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer]);
    refreshPendingMovementTokenVisibility(['observer'], { skipPerceptionRefresh: true });

    expect(target.refresh).toHaveBeenCalledTimes(1);
  });

  test('does not use current sight line to suppress undetected targets during pending movement', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.detectionFilter = { id: 'soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer]);

    expect(shouldSuppressPendingMovementDetectionFilterVisuals(target)).toBe(false);
  });

  test('keeps native soundwave filter recomputed from stale hidden mesh-only state', () => {
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.detectionFilter = null;
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    const soundwaveFilter = { id: 'native-soundwave-filter' };
    target.refresh = jest.fn(() => {
      target.detectionFilter = soundwaveFilter;
      target.detectionFilterMesh.visible = true;
      target.detectionFilterMesh.renderable = true;
      target.detectionFilterMesh.alpha = 1;
    });
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        controlled: [observer],
        placeables: [observer, target],
      },
      perception: {
        update: jest.fn(),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer]);
    refreshPendingMovementTokenVisibility('observer');

    expect(target.refresh).toHaveBeenCalledTimes(1);
    expect(target.detectionFilter).toBe(soundwaveFilter);
    expect(target.detectionFilterMesh).toMatchObject({
      visible: true,
      renderable: true,
      alpha: 1,
    });
  });

  test('does not render-lock newly hidden target when detection filter already exists', () => {
    const observer = createMockToken({ id: 'observer' });
    const target = createMockToken({ id: 'target', visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.detectionFilter = { id: 'soundwave-filter' };
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    expect(forceTokenInvisibleForObserverVisibility(observer, target, 'hidden')).toBe(false);
    expect(target.visible).toBe(true);
    expect(target.renderable).toBe(true);
    expect(target.mesh.visible).toBe(true);
  });

  test('restores undetected render lock when observer perspective is intentionally cleared', () => {
    jest.useFakeTimers();

    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.nameplate = { visible: true };
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        controlled: [],
        placeables: [observer, target],
      },
      perception: {
        update: jest.fn(),
      },
    };

    expect(forceTokenInvisibleForObserverVisibility(observer, target, 'undetected')).toBe(true);

    expect(restorePendingMovementTokenRendering(target)).toBe(false);
    expect(restorePendingMovementTokenRendering(target, { ignoreObserverLocks: true })).toBe(true);
    expect(target.visible).toBe(true);
    expect(target.renderable).toBe(true);
    expect(target.mesh.visible).toBe(true);
    expect(target.mesh.renderable).toBe(true);
    expect(target.mesh.alpha).toBe(1);
    expect(target.nameplate.visible).toBe(true);
  });
});
