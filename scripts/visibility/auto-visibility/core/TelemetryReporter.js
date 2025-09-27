/**
 * TelemetryReporter centralizes AVS START/STOP batch logs and optional debug breakdowns.
 */
export class TelemetryReporter {
    constructor() { }

    start(info) {
        try {
            const payload = {
                batchId: info.batchId,
                clientId: info.clientId,
                clientName: info.clientName,
                changedCount: info.changedAtStartCount,
                startedAtIso: new Date().toISOString(),
            };
            console.log('PF2E Visioner | AVS batch START', payload);
        } catch { /* noop */ }
    }

    stop(info) {
        try {
            const s = info.precomputeStats || {};
            const t = info.timings || {};

            // Calculate timing breakdown
            const totalMs = Number((info.batchEndTime - info.batchStartTime).toFixed(2));
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
            if (totalMs > 0) {
                Object.keys(timingBreakdown).forEach(phase => {
                    timingPercentages[`${phase}Pct`] = Number(((timingBreakdown[phase] / totalMs) * 100).toFixed(1));
                });
                Object.keys(detailedBreakdown).forEach(phase => {
                    detailedPercentages[`${phase}Pct`] = Number(((detailedBreakdown[phase] / totalMs) * 100).toFixed(1));
                });
            }

            const payload = {
                batchId: info.batchId,
                clientId: info.clientId,
                clientName: info.clientName,
                totalMs,
                changedCountAtStart: info.changedAtStartCount,
                tokensIncluded: info.allTokensCount,
                viewportFiltering: !!info.viewportFilteringEnabled,
                hasDarknessSources: !!info.hasDarknessSources,
                processedTokens: info.processedTokens || 0,
                uniqueUpdates: info.uniqueUpdateCount || 0,
                // Surface a few key breakdown counters at top-level for quick glance
                pairsConsidered: info.breakdown?.pairsConsidered || 0,
                pairsComputed: info.breakdown?.pairsComputed || 0,
                pairsCached: info.breakdown?.pairsCached || 0,
                losCacheHits: info.breakdown?.losCacheHits || 0,
                losCacheMisses: info.breakdown?.losCacheMisses || 0,
                // Global cache parity
                losGlobalHits: info.breakdown?.losGlobalHits || 0,
                losGlobalMisses: info.breakdown?.losGlobalMisses || 0,
                losGlobalExpired: info.breakdown?.losGlobalExpired || 0,
                visGlobalHits: info.breakdown?.visGlobalHits || 0,
                visGlobalMisses: info.breakdown?.visGlobalMisses || 0,
                visGlobalExpired: info.breakdown?.visGlobalExpired || 0,
                precompute: {
                    targetUsed: s.targetUsed || 0,
                    targetMiss: s.targetMiss || 0,
                    observerUsed: s.observerUsed || 0,
                    observerMiss: s.observerMiss || 0,
                    // Cache performance metrics
                    cacheReused: s.cacheReused || false,
                    cacheAge: s.cacheAge || 0,
                    fastPathUsed: s.fastPathUsed || false,
                    lightingChanged: !!s.lightingChanged
                },
                // Detailed timing breakdown
                timings: {
                    ...timingBreakdown,
                    ...timingPercentages
                },
                detailedTimings: {
                    ...detailedBreakdown,
                    ...detailedPercentages
                },
                breakdown: info.breakdown,
                finishedAtIso: new Date().toISOString(),
            };
            console.log('PF2E Visioner | AVS batch STOP', payload);
        } catch { /* noop */ }
    }

    debugBreakdown(breakdown) {
        try {
            console.debug('PF2E Visioner | AVS batch breakdown:', {
                pairsConsidered: breakdown.pairsConsidered,
                pairsComputed: breakdown.pairsComputed,
                pairsCached: breakdown.pairsCached,
                pairsSkippedSpatial: breakdown.pairsSkippedSpatial,
                pairsSkippedLOS: breakdown.pairsSkippedLOS,
                pairsSkippedDedup: breakdown.pairsSkippedDedup,
                losCacheHits: breakdown.losCacheHits,
                losCacheMisses: breakdown.losCacheMisses,
                losGlobalHits: breakdown.losGlobalHits,
                losGlobalMisses: breakdown.losGlobalMisses,
                losGlobalExpired: breakdown.losGlobalExpired,
                visGlobalHits: breakdown.visGlobalHits,
                visGlobalMisses: breakdown.visGlobalMisses,
                visGlobalExpired: breakdown.visGlobalExpired,
            });
        } catch { /* noop */ }
    }
}
