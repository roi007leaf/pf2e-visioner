// GATE for during-move decision optimization (Phase 2b).
// With the cross-frame position-quantized cache, `live` at step i equals
// `fresh` evaluated at the FIRST step that entered the current observer cell
// (cellEntryStep). The harness asserts this exact behavior, verifies the flip
// occurs, proves at least one step exercises the lag path (live !== fresh at
// that step but === fresh[cellEntry]), and checks post-settle freshness.

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

// gridSize=50, tokenWidth=1 → center.x = doc.x + 25, center.y = doc.y + 25.
// cell = floor(50/2) = 25.
// Target doc.x=125 → target center.x=150 → target cell col = round(150/25)=6.
// Target doc.y=75  → target center.y=100 → target cell row = round(100/25)=4.
//
// Route designed so that:
//   - At least two consecutive steps share an observer cell (lag exercised).
//   - The wall is crossed so the fresh decision flips (true→false).
//   - At least one step where fresh[cellEntry] !== fresh[step] (lag is non-trivial).
//
// Observer doc.x values and derived center.x / cell col (cell=25):
//   Step 0: doc.x=110 → center.x=135 → col=round(135/25)=5   (visible, col 5)
//   Step 1: doc.x=108 → center.x=133 → col=round(133/25)=5   (visible, col 5) ← same cell as step 0
//   Step 2: doc.x= 80 → center.x=105 → col=round(105/25)=4   (visible, col 4)
//   Step 3: doc.x= 60 → center.x= 85 → col=round( 85/25)=3   (blocked,  col 3)
//   Step 4: doc.x= 40 → center.x= 65 → col=round( 65/25)=3   (blocked,  col 3) ← same cell as step 3
//   Step 5: doc.x= 10 → center.x= 35 → col=round( 35/25)=1   (blocked,  col 1)
//
// Step 1 shares cell 5 with step 0 → live[1] = fresh[0] = fresh[1] (both true, not interesting for lag).
// Step 4 shares cell 3 with step 3 → live[4] = fresh[3].
//   fresh[3] = false (same cell, same value) so not a flip-across-cell case here.
//
// The interesting lag case: wall flip happens between step 2 (center=105, still right of wall at x=100)
// and step 3 (center=85, left of wall). Steps 3 and 4 share a cell so live[4]=fresh[3]=false=fresh[4].
// The lag is that the cache locks in fresh[3] for step 4 rather than recomputing.
// To prove the lag path IS exercised we need a cell boundary that straddles the flip.
// Adjust: put steps 2 and 3 in the SAME cell AND have them straddle the flip.
//   Step 2: doc.x=78 → center.x=103 → col=round(103/25)=4   (visible, true)
//   Step 3: doc.x=72 → center.x= 97 → col=round( 97/25)=4   (blocked, false) ← same cell, FLIP!
//   → live[3] = fresh[cellEntry=2] = true ≠ fresh[3] = false  ← lag proven!
//
// Final route (doc.x values):
const ROUTE_DOC_X = [110, 108, 78, 72, 40, 10];
// Centers:          [135, 133,103, 97, 65, 35]
// Cols (cell=25):   [  5,   5,  4,  4,  3,  1]
// Fresh (wall@100): [  T,   T,  T,  F,  F,  F]
// cellEntry steps:  [  0,   0,  2,  2,  4,  5]
// live[i]=fresh[cellEntry[i]]:
//   live[0]=fresh[0]=T, live[1]=fresh[0]=T, live[2]=fresh[2]=T,
//   live[3]=fresh[2]=T ≠ fresh[3]=F  ← lag exercised here
//   live[4]=fresh[4]=F, live[5]=fresh[5]=F

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

  test('live === fresh[cellEntry] at every step, flip occurs, lag path exercised', () => {
    const finalDestination = { x: ROUTE_DOC_X[ROUTE_DOC_X.length - 1], y: 75 };
    setPendingTokenMovementPosition(observer.document, finalDestination, [observer]);

    const gridSize = global.canvas.grid.size;
    const cell = Math.max(1, Math.floor(gridSize / 2));

    const freshResults = [];
    const liveResults = [];
    const obsCols = [];

    for (const docX of ROUTE_DOC_X) {
      observer.document.x = docX;
      observer.document.y = 75;

      const centerX = docX + 25;
      obsCols.push(Math.round(centerX / cell));

      const fresh = currentPendingMovementSightLineSeesTargetUncached(observer, target);
      const live = withPendingMovementEvaluationCache(() =>
        currentPendingMovementSightLineSeesTarget(observer, target),
      );

      freshResults.push(fresh);
      liveResults.push(live);
    }

    function cellEntryStep(i) {
      let j = i;
      while (j > 0 && obsCols[j - 1] === obsCols[i]) j -= 1;
      return j;
    }

    expect(new Set(freshResults).size).toBe(2);

    for (let i = 0; i < ROUTE_DOC_X.length; i += 1) {
      expect(liveResults[i]).toBe(freshResults[cellEntryStep(i)]);
    }

    const lagExercised = ROUTE_DOC_X.some((_, i) => {
      const entry = cellEntryStep(i);
      return entry !== i && freshResults[entry] !== freshResults[i];
    });
    expect(lagExercised).toBe(true);
  });

  test('post-settle: after clearPendingTokenMovementPosition cache is gone and live === uncached', () => {
    const finalDocX = ROUTE_DOC_X[ROUTE_DOC_X.length - 1];
    const finalDestination = { x: finalDocX, y: 75 };
    setPendingTokenMovementPosition(observer.document, finalDestination, [observer]);

    observer.document.x = finalDocX;
    observer.document.y = 75;

    clearPendingTokenMovementPosition('crossframe-observer');

    const fresh = currentPendingMovementSightLineSeesTargetUncached(observer, target);
    const live = withPendingMovementEvaluationCache(() =>
      currentPendingMovementSightLineSeesTarget(observer, target),
    );

    expect(live).toBe(fresh);
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
