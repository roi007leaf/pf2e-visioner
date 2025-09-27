import '../setup.js';

import { TelemetryReporter } from '../../scripts/visibility/auto-visibility/core/TelemetryReporter.js';

describe('TelemetryReporter', () => {
    let reporter;
    beforeEach(() => {
        reporter = new TelemetryReporter();
    });

    test('start logs minimal payload', () => {
        reporter.start({ batchId: 'b1', clientId: 'u1', clientName: 'User', changedAtStartCount: 2 });
        expect(console.log).toHaveBeenCalledWith(
            'PF2E Visioner | AVS batch START',
            expect.objectContaining({ batchId: 'b1', clientId: 'u1', clientName: 'User', changedCount: 2 })
        );
    });

    test('stop logs comprehensive payload', () => {
        reporter.stop({
            batchId: 'b1', clientId: 'u1', clientName: 'User',
            batchStartTime: 100, batchEndTime: 160,
            changedAtStartCount: 2, allTokensCount: 3,
            viewportFilteringEnabled: false, hasDarknessSources: false,
            processedTokens: 1, uniqueUpdateCount: 4,
            breakdown: { visGlobalHits: 1, visGlobalMisses: 2, losGlobalHits: 1, losGlobalMisses: 0 },
            precomputeStats: { observerUsed: 0, observerMiss: 1, targetUsed: 0, targetMiss: 1 },
        });
        expect(console.log).toHaveBeenCalledWith(
            'PF2E Visioner | AVS batch STOP',
            expect.objectContaining({
                batchId: 'b1', clientId: 'u1', clientName: 'User', totalMs: 60,
                tokensIncluded: 3, processedTokens: 1, uniqueUpdates: 4,
                visGlobalHits: 1, visGlobalMisses: 2,
                losGlobalHits: 1, losGlobalMisses: 0,
                precompute: expect.objectContaining({ observerMiss: 1, targetMiss: 1 }),
            })
        );
    });
});
