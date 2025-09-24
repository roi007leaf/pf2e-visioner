import '../setup.js';

import { BatchOrchestrator } from '../../scripts/visibility/auto-visibility/core/BatchOrchestrator.js';

describe('BatchOrchestrator', () => {
    let orchestrator;
    let batchProcessor;
    let telemetryReporter;
    let exclusionManager;
    let applied;

    beforeEach(() => {
        applied = [];
        batchProcessor = {
            process: jest.fn(async () => ({
                updates: [
                    // duplicate pair should be deduped
                    { observer: global.canvas.tokens.placeables[0], target: global.canvas.tokens.placeables[1], visibility: 'hidden' },
                    { observer: global.canvas.tokens.placeables[0], target: global.canvas.tokens.placeables[1], visibility: 'hidden' },
                ],
                breakdown: { visGlobalHits: 0, visGlobalMisses: 1, losGlobalHits: 0, losGlobalMisses: 1 },
                processedTokens: 1,
                precomputeStats: { observerUsed: 0, observerMiss: 1, targetUsed: 0, targetMiss: 1 },
            }))
        };
        telemetryReporter = { start: jest.fn(), stop: jest.fn() };
        exclusionManager = { isExcludedToken: jest.fn(() => false) };
        const getAllTokens = () => global.canvas.tokens.placeables;
        orchestrator = new BatchOrchestrator({
            batchProcessor,
            telemetryReporter,
            exclusionManager,
            setVisibilityBetween: (o, t, v) => applied.push([o?.document?.id, t?.document?.id, v]),
            getAllTokens,
            moduleId: 'pf2e-visioner',
        });

        // seed tokens
        const t1 = createMockToken({ id: 'A', x: 0, y: 0 });
        const t2 = createMockToken({ id: 'B', x: 100, y: 0 });
        global.canvas.tokens.placeables = [t1, t2];
    });

    test('processBatch starts/stop telemetry, applies deduped updates', async () => {
        const changed = new Set(['A']);
        await orchestrator.processBatch(changed);
        expect(telemetryReporter.start).toHaveBeenCalled();
        expect(telemetryReporter.stop).toHaveBeenCalled();
        expect(applied).toEqual([['A', 'B', 'hidden']]);
    });

    test('isProcessing flag prevents reentrancy and resets after', async () => {
        const changed = new Set(['A']);
        const p = orchestrator.processBatch(changed);
        expect(orchestrator.isProcessing()).toBe(true);
        await p;
        expect(orchestrator.isProcessing()).toBe(false);
    });
});
