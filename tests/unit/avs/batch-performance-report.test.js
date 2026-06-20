import {
  BATCH_PROCESSOR_TIMING_PHASES,
  BATCH_TIMING_PHASES,
  buildBatchPerformanceReport,
} from '../../../scripts/visibility/auto-visibility/core/BatchPerformanceReport.js';
import { TelemetryReporter } from '../../../scripts/visibility/auto-visibility/core/TelemetryReporter.js';

describe('BatchPerformanceReport', () => {
  test('builds stable phase and cache metric shape from telemetry payload', () => {
    const report = buildBatchPerformanceReport({
      batchId: 'batch-1',
      batchStartTime: 10,
      batchEndTime: 35,
      changedAtStartCount: 2,
      allTokensCount: 4,
      processedTokens: 3,
      uniqueUpdateCount: 5,
      movementSession: { sessionDurationMs: 15 },
      breakdown: {
        visGlobalHits: 1,
        visGlobalMisses: 2,
        losGlobalHits: 3,
        losGlobalMisses: 4,
      },
      precomputeStats: { observerUsed: 6 },
      timings: {
        tokenPrep: 1,
        lightingPrecompute: 2,
        calcOptionsPrep: 3,
        batchProcessing: 4,
        resultApplication: 5,
        detailedBatchTimings: {
          cacheBuilding: 6,
          lightingPrecompute: 7,
          mainProcessingLoop: 8,
          spatialFiltering: 9,
          losCalculations: 10,
          visibilityCalculations: 11,
          cacheOperations: 12,
          updateCollection: 13,
        },
      },
    });

    expect(Object.keys(report.timingBreakdown)).toEqual(BATCH_TIMING_PHASES);
    expect(Object.keys(report.detailedBreakdown)).toEqual(BATCH_PROCESSOR_TIMING_PHASES);
    expect(report).toMatchObject({
      batchId: 'batch-1',
      totalMs: 25,
      sessionTotalMs: 40,
      counts: {
        changedAtStart: 2,
        allTokens: 4,
        processedTokens: 3,
        uniqueUpdates: 5,
      },
      cacheBreakdown: {
        visGlobalHits: 1,
        visGlobalMisses: 2,
        losGlobalHits: 3,
        losGlobalMisses: 4,
      },
      precomputeStats: { observerUsed: 6 },
    });
    expect(report.timingPercentages.batchProcessingPct).toBe(16);
    expect(report.detailedPercentages.visibilityCalculationsPct).toBe(44);
  });

  test('TelemetryReporter stores report and forwards it to sink', () => {
    const reportSink = jest.fn();
    const reporter = new TelemetryReporter({ reportSink });
    const report = reporter.stop({
      batchId: 'batch-2',
      batchStartTime: 0,
      batchEndTime: 10,
      timings: { batchProcessing: 5 },
    });

    expect(report).toEqual(expect.objectContaining({
      batchId: 'batch-2',
      totalMs: 10,
      timingBreakdown: expect.objectContaining({ batchProcessing: 5 }),
    }));
    expect(reporter.getLastReport()).toBe(report);
    expect(reportSink).toHaveBeenCalledWith(report);
  });
});
