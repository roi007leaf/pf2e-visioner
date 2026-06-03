// GATE for during-move decision optimization (Phase 2b).
// When a cross-frame throttle is added to currentPendingMovementSightLineSeesTarget,
// `live` may lag `fresh` by at most the throttle window, but MUST equal `fresh` at
// the final (settled) step. Tighten/relax the per-step tolerance here accordingly.

import '../../setup.js';

import {
  currentPendingMovementSightLineSeesTarget,
  currentPendingMovementSightLineSeesTargetUncached,
  setPendingTokenMovementPosition,
  clearPendingTokenMovementPosition,
} from '../../../scripts/services/PendingMovement/pending-token-movement.js';
import { withPendingMovementEvaluationCache } from '../../../scripts/services/PendingMovement/pending-movement-evaluation-cache.js';

// Wall at x=100, spanning y=0..200 (vertical, full sight block).
// Target center fixed at (150, 100) — right side of wall.
// Observer route moves from right side (same side as target) to left side,
// crossing the wall so the sight decision flips from true to false.

const WALL = {
  document: {
    id: 'sight-wall',
    c: [100, 0, 100, 200],
    sight: 1,
    door: 0,
    ds: 0,
  },
};

function buildObserver(id) {
  return {
    id,
    document: {
      id,
      x: 0,
      y: 75,
      width: 1,
      height: 1,
      vision: { enabled: true, range: 60, angle: 360 },
      sight: { enabled: true, range: 60 },
      getFlag: jest.fn().mockReturnValue(null),
    },
    actor: {},
  };
}

function buildTarget(id) {
  return {
    id,
    document: {
      id,
      x: 125,
      y: 75,
      width: 1,
      height: 1,
      vision: { enabled: false },
      getFlag: jest.fn().mockReturnValue(null),
    },
    actor: {},
  };
}

// Observer document.x values for each route step.
// gridSize=50, tokenWidth=1 → center.x = doc.x + 25.
// Steps 0-2: center.x > 100 (same side as target) → visible (true).
// Steps 3-7: center.x < 100 (behind wall)          → blocked  (false).
const ROUTE_DOC_X = [110, 95, 80, 60, 40, 20, 10, 0];
// Centers:        [135,120,105, 85, 65, 45, 35,25]
// Wall crossed between step 2 (center=105) and step 3 (center=85).

describe('cross-frame sight-line correctness harness', () => {
  let observer;
  let target;
  let originalCanvas;

  beforeEach(() => {
    originalCanvas = global.canvas;
    global.canvas = {
      grid: { size: 50 },
      walls: { placeables: [WALL] },
      tokens: {
        controlled: [],
        placeables: [],
        _draggedToken: null,
        get: jest.fn().mockReturnValue(null),
      },
      effects: {
        visionSources: [],
        lightSources: [],
      },
    };
    observer = buildObserver('crossframe-observer');
    target = buildTarget('crossframe-target');
  });

  afterEach(() => {
    clearPendingTokenMovementPosition('crossframe-observer');
    global.canvas = originalCanvas;
  });

  test('live === fresh at every step and decision flips across route', () => {
    const finalDestination = { x: ROUTE_DOC_X[ROUTE_DOC_X.length - 1], y: 75 };
    setPendingTokenMovementPosition(observer.document, finalDestination, [observer]);

    const freshResults = [];
    const liveResults = [];

    for (const docX of ROUTE_DOC_X) {
      observer.document.x = docX;
      observer.document.y = 75;

      const fresh = currentPendingMovementSightLineSeesTargetUncached(observer, target);
      const live = withPendingMovementEvaluationCache(() =>
        currentPendingMovementSightLineSeesTarget(observer, target),
      );

      freshResults.push(fresh);
      liveResults.push(live);
    }

    expect(new Set(freshResults).size).toBe(2);

    for (let i = 0; i < ROUTE_DOC_X.length; i += 1) {
      expect(liveResults[i]).toBe(freshResults[i]);
    }
  });

  test('live === fresh at final (settled) step', () => {
    const finalDocX = ROUTE_DOC_X[ROUTE_DOC_X.length - 1];
    const finalDestination = { x: finalDocX, y: 75 };
    setPendingTokenMovementPosition(observer.document, finalDestination, [observer]);

    observer.document.x = finalDocX;
    observer.document.y = 75;

    const fresh = currentPendingMovementSightLineSeesTargetUncached(observer, target);
    const live = withPendingMovementEvaluationCache(() =>
      currentPendingMovementSightLineSeesTarget(observer, target),
    );

    expect(live).toBe(fresh);
  });
});
