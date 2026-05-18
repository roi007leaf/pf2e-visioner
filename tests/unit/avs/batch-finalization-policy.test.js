import {
  buildFallbackTelemetryPayload,
  buildFollowUpBatchPlan,
  buildSuccessTelemetryPayload,
} from '../../../scripts/visibility/auto-visibility/core/BatchFinalizationPolicy.js';

describe('BatchFinalizationPolicy', () => {
  test('builds fallback telemetry payload for aborted or failed batches', () => {
    const payload = buildFallbackTelemetryPayload({
      batchId: 'batch-1',
      clientId: 'user-1',
      clientName: 'GM',
      visibleChangedTokens: new Set(['A', 'B']),
      changedTokens: new Set(['A', 'B', 'C']),
      allTokensCount: 7,
      viewportFilteringEnabled: true,
      hasDarknessSources: false,
      debugMode: true,
    });

    expect(payload).toEqual({
      batchId: 'batch-1',
      clientId: 'user-1',
      clientName: 'GM',
      changedAtStartCount: 2,
      allTokensCount: 7,
      viewportFilteringEnabled: true,
      hasDarknessSources: false,
      processedTokens: 0,
      uniqueUpdateCount: 0,
      breakdown: {
        visGlobalHits: 0,
        visGlobalMisses: 0,
        losGlobalHits: 0,
        losGlobalMisses: 0,
      },
      precomputeStats: { observerUsed: 0, observerMiss: 0, targetUsed: 0, targetMiss: 0 },
      debugMode: true,
      timings: {
        tokenPrep: 0,
        lightingPrecompute: 0,
        calcOptionsPrep: 0,
        batchProcessing: 0,
        resultApplication: 0,
        detailedBatchTimings: {
          cacheBuilding: 0,
          lightingPrecompute: 0,
          mainProcessingLoop: 0,
          spatialFiltering: 0,
          losCalculations: 0,
          visibilityCalculations: 0,
          cacheOperations: 0,
          updateCollection: 0,
        },
      },
    });
  });

  test('falls back to original changed token count when no visible changed tokens exist', () => {
    const payload = buildFallbackTelemetryPayload({
      visibleChangedTokens: new Set(),
      changedTokens: new Set(['A', 'B', 'C']),
    });

    expect(payload.changedAtStartCount).toBe(3);
  });

  test('builds success telemetry payload from completed batch context', () => {
    const movementSession = { sessionId: 'move-1' };
    const timings = { batchProcessing: 12 };
    const payload = buildSuccessTelemetryPayload({
      batchId: 'batch-1',
      clientId: 'user-1',
      clientName: 'GM',
      batchStartTime: 10,
      batchEndTime: 25,
      changedTokens: new Set(['A', 'B']),
      allTokens: [{ id: 'A' }, { id: 'B' }, { id: 'C' }],
      batchResult: {
        processedTokens: 2,
        uniqueUpdateCount: 99,
        breakdown: { visGlobalHits: 1 },
        precomputeStats: { observerUsed: 7 },
      },
      precomputeStats: { observerUsed: 3 },
      uniqueUpdateCount: 4,
      viewportFilteringEnabled: true,
      hasDarknessSources: false,
      debugMode: true,
      timings,
      movementSession,
    });

    expect(payload).toEqual({
      batchId: 'batch-1',
      clientId: 'user-1',
      clientName: 'GM',
      batchStartTime: 10,
      batchEndTime: 25,
      changedAtStartCount: 2,
      allTokensCount: 3,
      viewportFilteringEnabled: true,
      hasDarknessSources: false,
      processedTokens: 2,
      uniqueUpdateCount: 4,
      breakdown: { visGlobalHits: 1 },
      precomputeStats: { observerUsed: 7 },
      debugMode: true,
      timings,
      movementSession,
    });
  });

  test('success telemetry falls back to provided precompute stats and zero processed tokens', () => {
    const payload = buildSuccessTelemetryPayload({
      batchResult: {},
      precomputeStats: { targetUsed: 2 },
      changedTokens: new Set(['A']),
      allTokens: [],
    });

    expect(payload.processedTokens).toBe(0);
    expect(payload.precomputeStats).toEqual({ targetUsed: 2 });
  });

  test('plans a follow-up batch when pending tokens exist and movement is settled', () => {
    const pendingMovementSessionData = { sessionId: 'move-1' };
    const plan = buildFollowUpBatchPlan({
      pendingTokens: new Set(['A', 'B']),
      isTokenMoving: false,
      pendingMovementSessionData,
    });

    expect(plan).toEqual({
      shouldSchedule: true,
      tokens: new Set(['A', 'B']),
      options: { movementSession: pendingMovementSessionData },
      shouldCallMovementComplete: true,
    });
  });

  test('does not plan a follow-up while movement is still active or no tokens are pending', () => {
    expect(
      buildFollowUpBatchPlan({
        pendingTokens: new Set(['A']),
        isTokenMoving: true,
      }),
    ).toEqual({
      shouldSchedule: false,
      tokens: new Set(),
      options: undefined,
      shouldCallMovementComplete: false,
    });

    expect(
      buildFollowUpBatchPlan({
        pendingTokens: new Set(),
        isTokenMoving: false,
      }),
    ).toEqual({
      shouldSchedule: false,
      tokens: new Set(),
      options: undefined,
      shouldCallMovementComplete: false,
    });
  });
});
