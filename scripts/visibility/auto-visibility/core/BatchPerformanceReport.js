export const BATCH_TIMING_PHASES = Object.freeze([
  'tokenPrep',
  'lightingPrecompute',
  'calcOptionsPrep',
  'batchProcessing',
  'resultApplication',
]);

export const BATCH_PROCESSOR_TIMING_PHASES = Object.freeze([
  'cacheBuilding',
  'lightingPrecompute',
  'mainProcessingLoop',
  'spatialFiltering',
  'losCalculations',
  'visibilityCalculations',
  'cacheOperations',
  'updateCollection',
]);

function roundMetric(value, digits = 2) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Number(numeric.toFixed(digits));
}

function timingValues(source = {}, phases = []) {
  return Object.fromEntries(phases.map((phase) => [phase, roundMetric(source?.[phase] || 0)]));
}

function timingPercentages(values = {}, totalMs = 0) {
  if (totalMs <= 0) return {};
  return Object.fromEntries(
    Object.entries(values).map(([phase, value]) => [
      `${phase}Pct`,
      roundMetric((value / totalMs) * 100, 1),
    ]),
  );
}

export function buildBatchPerformanceReport(info = {}) {
  const timings = info.timings || {};
  const totalMs = roundMetric((info.batchEndTime ?? 0) - (info.batchStartTime ?? 0));
  const movementSessionMs = Number(info.movementSession?.sessionDurationMs || 0);
  const sessionTotalMs = info.movementSession
    ? roundMetric(movementSessionMs + totalMs)
    : totalMs;
  const timingBreakdown = timingValues(timings, BATCH_TIMING_PHASES);
  const detailedBreakdown = timingValues(
    timings.detailedBatchTimings || {},
    BATCH_PROCESSOR_TIMING_PHASES,
  );

  return {
    batchId: info.batchId ?? null,
    totalMs,
    sessionTotalMs,
    counts: {
      changedAtStart: Number(info.changedAtStartCount || 0),
      allTokens: Number(info.allTokensCount || 0),
      processedTokens: Number(info.processedTokens || 0),
      uniqueUpdates: Number(info.uniqueUpdateCount || 0),
    },
    timingBreakdown,
    detailedBreakdown,
    timingPercentages: timingPercentages(timingBreakdown, totalMs),
    detailedPercentages: timingPercentages(detailedBreakdown, totalMs),
    cacheBreakdown: {
      visGlobalHits: Number(info.breakdown?.visGlobalHits || 0),
      visGlobalMisses: Number(info.breakdown?.visGlobalMisses || 0),
      losGlobalHits: Number(info.breakdown?.losGlobalHits || 0),
      losGlobalMisses: Number(info.breakdown?.losGlobalMisses || 0),
    },
    precomputeStats: { ...(info.precomputeStats || {}) },
  };
}
