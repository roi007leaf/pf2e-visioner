/**
 * TelemetryReporter centralizes AVS START/STOP batch logs and optional debug breakdowns.
 */
export class TelemetryReporter {
    constructor() { }

    start(info) {
        try {
        } catch { /* noop */ }
    }

    stop(info) {
        try {
            const s = info.precomputeStats || {};
            const t = info.timings || {};

            // Calculate timing breakdown
            const totalMs = Number((info.batchEndTime - info.batchStartTime).toFixed(2));

            // If this batch is part of a movement session, add session time to total
            const sessionTotalMs = info.movementSession
                ? Number((info.movementSession.sessionDurationMs + totalMs).toFixed(2))
                : totalMs;

            const timingBreakdown = {
                tokenPrep: Number((t.tokenPrep || 0).toFixed(2)),
                lightingPrecompute: Number((t.lightingPrecompute || 0).toFixed(2)),
                calcOptionsPrep: Number((t.calcOptionsPrep || 0).toFixed(2)),
                batchProcessing: Number((t.batchProcessing || 0).toFixed(2)),
                resultApplication: Number((t.resultApplication || 0).toFixed(2))
            };

            // Include detailed batch processor timings
            const detailedTimings = t.detailedBatchTimings || {};
            const detailedBreakdown = {
                cacheBuilding: Number((detailedTimings.cacheBuilding || 0).toFixed(2)),
                lightingPrecomputeDetailed: Number((detailedTimings.lightingPrecompute || 0).toFixed(2)),
                mainProcessingLoop: Number((detailedTimings.mainProcessingLoop || 0).toFixed(2)),
                spatialFiltering: Number((detailedTimings.spatialFiltering || 0).toFixed(2)),
                losCalculations: Number((detailedTimings.losCalculations || 0).toFixed(2)),
                visibilityCalculations: Number((detailedTimings.visibilityCalculations || 0).toFixed(2)),
                cacheOperations: Number((detailedTimings.cacheOperations || 0).toFixed(2)),
                updateCollection: Number((detailedTimings.updateCollection || 0).toFixed(2))
            };

            // Calculate percentages for easy reading
            const timingPercentages = {};
            const detailedPercentages = {};
            const baseTimeForPercentages = totalMs; // Use batch time for percentage calculations
            if (baseTimeForPercentages > 0) {
                Object.keys(timingBreakdown).forEach(phase => {
                    timingPercentages[`${phase}Pct`] = Number(((timingBreakdown[phase] / baseTimeForPercentages) * 100).toFixed(1));
                });
                Object.keys(detailedBreakdown).forEach(phase => {
                    detailedPercentages[`${phase}Pct`] = Number(((detailedBreakdown[phase] / baseTimeForPercentages) * 100).toFixed(1));
                });
            }

        } catch { /* noop */ }
    }

    debugBreakdown(breakdown) {
    }
}
