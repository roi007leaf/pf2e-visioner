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
            const payload = {
                batchId: info.batchId,
                clientId: info.clientId,
                clientName: info.clientName,
                totalMs: Number((info.batchEndTime - info.batchStartTime).toFixed(2)),
                changedCountAtStart: info.changedAtStartCount,
                tokensIncluded: info.allTokensCount,
                viewportFiltering: !!info.viewportFilteringEnabled,
                hasDarknessSources: !!info.hasDarknessSources,
                processedTokens: info.processedTokens || 0,
                uniqueUpdates: info.uniqueUpdateCount || 0,
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
