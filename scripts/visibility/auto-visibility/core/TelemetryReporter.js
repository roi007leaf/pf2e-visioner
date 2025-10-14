/**
 * TelemetryReporter centralizes AVS START/STOP batch logs and optional debug breakdowns.
 */
export class TelemetryReporter {
    constructor() { }

    start(info) {
        try {
            // const payload = {
            //     batchId: info.batchId,
            //     clientId: info.clientId,
            //     clientName: info.clientName,
            //     changedCount: info.changedAtStartCount,
            //     startedAtIso: new Date().toISOString(),
            // };
            // console.log('PF2E Visioner | AVS batch START', payload);
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

            // const payload = {
            //     batchId: info.batchId,
            //     clientId: info.clientId,
            //     clientName: info.clientName,
            //     totalMs: sessionTotalMs, // Total including movement session if present
            //     batchOnlyMs: info.movementSession ? totalMs : undefined, // Batch processing time alone
            //     changedCountAtStart: info.changedAtStartCount,
            //     tokensIncluded: info.allTokensCount,
            //     viewportFiltering: !!info.viewportFilteringEnabled,
            //     hasDarknessSources: !!info.hasDarknessSources,
            //     processedTokens: info.processedTokens || 0,
            //     uniqueUpdates: info.uniqueUpdateCount || 0,
            //     // Movement session context if this batch completed a movement
            //     movementSession: info.movementSession ? {
            //         sessionId: info.movementSession.sessionId,
            //         sessionDurationMs: info.movementSession.sessionDurationMs,
            //         positionUpdates: info.movementSession.positionUpdates,
            //         tokensAccumulated: info.movementSession.tokensAccumulated,
            //     } : null,
            //     // Surface a few key breakdown counters at top-level for quick glance
            //     pairsConsidered: info.breakdown?.pairsConsidered || 0,
            //     pairsComputed: info.breakdown?.pairsComputed || 0,
            //     pairsCached: info.breakdown?.pairsCached || 0,
            //     losCacheHits: info.breakdown?.losCacheHits || 0,
            //     losCacheMisses: info.breakdown?.losCacheMisses || 0,
            //     // Global cache parity
            //     losGlobalHits: info.breakdown?.losGlobalHits || 0,
            //     losGlobalMisses: info.breakdown?.losGlobalMisses || 0,
            //     losGlobalExpired: info.breakdown?.losGlobalExpired || 0,
            //     visGlobalHits: info.breakdown?.visGlobalHits || 0,
            //     visGlobalMisses: info.breakdown?.visGlobalMisses || 0,
            //     visGlobalExpired: info.breakdown?.visGlobalExpired || 0,
            //     precompute: {
            //         targetUsed: s.targetUsed || 0,
            //         targetMiss: s.targetMiss || 0,
            //         observerUsed: s.observerUsed || 0,
            //         observerMiss: s.observerMiss || 0,
            //         // Cache performance metrics
            //         cacheReused: s.cacheReused || false,
            //         cacheAge: s.cacheAge || 0,
            //         fastPathUsed: s.fastPathUsed || false,
            //         lightingChanged: !!s.lightingChanged
            //     },
            //     // Detailed timing breakdown
            //     timings: {
            //         ...timingBreakdown,
            //         ...timingPercentages
            //     },
            //     detailedTimings: {
            //         ...detailedBreakdown,
            //         ...detailedPercentages
            //     },
            //     breakdown: info.breakdown,
            //     finishedAtIso: new Date().toISOString(),
            // };
            // console.log('PF2E Visioner | AVS batch STOP', payload);
        } catch { /* noop */ }
    }

    debugBreakdown(breakdown) {
    }
}
