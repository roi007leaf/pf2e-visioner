import {
  DEFAULT_BURST_LOS_MEMO_TTL_MS,
  buildBatchCalculationOptions,
  resolveBurstLosMemo,
} from '../../../scripts/visibility/auto-visibility/core/BatchCalculationOptionsPolicy.js';

describe('BatchCalculationOptionsPolicy', () => {
  test('reuses burst LOS memo within the TTL and refreshes its timestamp', () => {
    const existingMap = new Map([['A-B', true]]);

    expect(
      resolveBurstLosMemo({
        lastLosMemo: { map: existingMap, ts: 1000 },
        now: 1200,
      }),
    ).toEqual({
      map: existingMap,
      ts: 1200,
    });
  });

  test('replaces burst LOS memo when no memo exists or the TTL has expired', () => {
    const expiredMap = new Map([['A-B', true]]);

    const missing = resolveBurstLosMemo({
      lastLosMemo: { map: null, ts: 0 },
      now: 1200,
    });
    const expired = resolveBurstLosMemo({
      lastLosMemo: { map: expiredMap, ts: 1000 },
      now: 1000 + DEFAULT_BURST_LOS_MEMO_TTL_MS,
    });

    expect(missing.map).toBeInstanceOf(Map);
    expect(missing.map).not.toBe(expiredMap);
    expect(missing.ts).toBe(1200);
    expect(expired.map).toBeInstanceOf(Map);
    expect(expired.map).not.toBe(expiredMap);
    expect(expired.ts).toBe(1000 + DEFAULT_BURST_LOS_MEMO_TTL_MS);
  });

  test('builds BatchProcessor calculation options and updated memo state', () => {
    const precomputedLights = new Map();
    const precomputeStats = { cacheReused: true };
    const suppression = { reason: 'door-state-change' };

    const result = buildBatchCalculationOptions({
      lastLosMemo: { map: null, ts: 0 },
      now: 2000,
      hasDarknessSources: true,
      precomputedLights,
      precomputeStats,
      isTokenMoving: false,
      movementSession: { sessionId: 'move-1' },
      isMovementBatch: true,
      postBatchPerceptionSuppression: suppression,
    });

    expect(result.nextLosMemo.ts).toBe(2000);
    expect(result.nextLosMemo.map).toBeInstanceOf(Map);
    expect(result.calcOptions).toEqual({
      hasDarknessSources: true,
      precomputedLights,
      precomputeStats,
      burstLosMemo: result.nextLosMemo.map,
      fastMode: false,
      skipPrecomputedLOS: true,
      skipViewportFilter: true,
      isMovementBatch: true,
      postBatchPerceptionSuppression: suppression,
    });
  });

  test('skipViewportFilter defaults to isMovementBatch but can be forced for non-movement batches', () => {
    const defaulted = buildBatchCalculationOptions({
      isMovementBatch: false,
    });
    expect(defaulted.calcOptions.skipViewportFilter).toBe(false);
    expect(defaulted.calcOptions.isMovementBatch).toBe(false);

    const forced = buildBatchCalculationOptions({
      isMovementBatch: false,
      skipViewportFilter: true,
    });
    expect(forced.calcOptions.skipViewportFilter).toBe(true);
    expect(forced.calcOptions.isMovementBatch).toBe(false);
  });
});
