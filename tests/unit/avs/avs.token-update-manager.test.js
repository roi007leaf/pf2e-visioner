import '../../setup.js';

import { OptimizedTokenUpdateManager } from '../../../scripts/visibility/auto-visibility/TokenUpdateManager.js';

describe('OptimizedTokenUpdateManager', () => {
    let mgr;
    let calcCalls;
    let refreshCalls;
    beforeEach(() => {
        mgr = OptimizedTokenUpdateManager.getInstance();
        mgr.cleanup();
        calcCalls = [];
        refreshCalls = 0;
        mgr.initialize(async (obs, tgt) => {
            calcCalls.push([obs?.document?.id, tgt?.document?.id]);
        }, () => { refreshCalls++; });

        // mock canvas tokens and grid
        global.canvas.grid.size = 100; // threshold 50 px
        const t1 = createMockToken({ id: 'A', x: 0, y: 0 });
        const t2 = createMockToken({ id: 'B', x: 100, y: 0 });
        global.canvas.tokens.placeables = [t1, t2];
    });

    test('handleTokenUpdate triggers on significant movement only', async () => {
        const tokenDoc = { id: 'A', x: 0, y: 0 };
        // below threshold
        let triggered = mgr.handleTokenUpdate(tokenDoc, { x: 20, y: 0 });
        expect(triggered).toBe(false);
        // above threshold
        triggered = mgr.handleTokenUpdate(tokenDoc, { x: 60, y: 0 });
        expect(triggered).toBe(true);
    });

    test('lighting and actor changes trigger regardless of movement', () => {
        const tokenDoc = { id: 'A', x: 0, y: 0 };
        expect(mgr.handleTokenUpdate(tokenDoc, { light: {} })).toBe(true);
        expect(mgr.handleTokenUpdate(tokenDoc, { actorId: 'xyz' })).toBe(true);
    });

    test('updateAllTokensVisibility runs n^2 - self excluded - and refresh once', async () => {
        const targetToken = global.canvas.tokens.placeables[0];
        await mgr.updateAllTokensVisibility([...global.canvas.tokens.placeables]);
        // pairs: (A,B) and (B,A) since both have actors
        expect(calcCalls).toContainEqual(['A', 'B']);
        expect(calcCalls).toContainEqual(['B', 'A']);
        expect(refreshCalls).toBe(1);
    });

    test('updateTokenVisibility guarded by processingTokens', async () => {
        const doc = { id: 'A' };
        // mark as processing to ensure early return
        expect(mgr.isProcessingToken('A')).toBe(false);
        const p = mgr.updateTokenVisibility(doc);
        expect(mgr.isProcessingToken('A')).toBe(true);
        await p; // complete
        expect(mgr.isProcessingToken('A')).toBe(false);
    });
});
