const EMPTY_BREAKDOWN = Object.freeze({
  visGlobalHits: 0,
  visGlobalMisses: 0,
  losGlobalHits: 0,
  losGlobalMisses: 0,
});

const EMPTY_PRECOMPUTE_STATS = Object.freeze({
  observerUsed: 0,
  observerMiss: 0,
  targetUsed: 0,
  targetMiss: 0,
});

const EMPTY_DETAILED_TIMINGS = Object.freeze({
  cacheBuilding: 0,
  lightingPrecompute: 0,
  mainProcessingLoop: 0,
  spatialFiltering: 0,
  losCalculations: 0,
  visibilityCalculations: 0,
  cacheOperations: 0,
  updateCollection: 0,
});

export function buildFallbackTelemetryPayload({
  batchId = undefined,
  clientId = undefined,
  clientName = undefined,
  visibleChangedTokens = new Set(),
  changedTokens = new Set(),
  allTokensCount = 0,
  viewportFilteringEnabled = false,
  hasDarknessSources = false,
  debugMode = false,
} = {}) {
  return {
    batchId,
    clientId,
    clientName,
    changedAtStartCount: visibleChangedTokens.size || changedTokens.size,
    allTokensCount,
    viewportFilteringEnabled,
    hasDarknessSources,
    processedTokens: 0,
    uniqueUpdateCount: 0,
    breakdown: { ...EMPTY_BREAKDOWN },
    precomputeStats: { ...EMPTY_PRECOMPUTE_STATS },
    debugMode,
    timings: {
      tokenPrep: 0,
      lightingPrecompute: 0,
      calcOptionsPrep: 0,
      batchProcessing: 0,
      resultApplication: 0,
      detailedBatchTimings: { ...EMPTY_DETAILED_TIMINGS },
    },
  };
}

export function buildSuccessTelemetryPayload({
  batchId = undefined,
  clientId = undefined,
  clientName = undefined,
  batchStartTime = undefined,
  batchEndTime = undefined,
  changedTokens = new Set(),
  allTokens = [],
  batchResult = {},
  precomputeStats = undefined,
  uniqueUpdateCount = 0,
  viewportFilteringEnabled = false,
  hasDarknessSources = false,
  debugMode = false,
  timings = undefined,
  movementSession = null,
} = {}) {
  return {
    batchId,
    clientId,
    clientName,
    batchStartTime,
    batchEndTime,
    changedAtStartCount: changedTokens.size,
    allTokensCount: allTokens.length,
    viewportFilteringEnabled,
    hasDarknessSources,
    processedTokens: batchResult.processedTokens || 0,
    uniqueUpdateCount,
    breakdown: batchResult.breakdown,
    precomputeStats: batchResult.precomputeStats || precomputeStats,
    debugMode,
    timings,
    movementSession,
  };
}

export function buildFollowUpBatchPlan({
  pendingTokens = new Set(),
  isTokenMoving = false,
  pendingMovementSessionData = null,
} = {}) {
  if (isTokenMoving || pendingTokens.size === 0) {
    return {
      shouldSchedule: false,
      tokens: new Set(),
      options: undefined,
      shouldCallMovementComplete: false,
    };
  }

  return {
    shouldSchedule: true,
    tokens: new Set(pendingTokens),
    options: pendingMovementSessionData
      ? { movementSession: pendingMovementSessionData }
      : undefined,
    shouldCallMovementComplete: !!pendingMovementSessionData,
  };
}
