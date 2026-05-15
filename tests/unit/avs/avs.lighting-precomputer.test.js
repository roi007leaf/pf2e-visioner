import '../../setup.js';

describe('LightingPrecomputer', () => {
    test('returns null map when LightingCalculator getInstance returns undefined', async () => {
        const LC = await import('../../../scripts/visibility/auto-visibility/LightingCalculator.js');
        const originalGetInstance = LC.LightingCalculator.getInstance;
        LC.LightingCalculator.getInstance = () => undefined;
        const { LightingPrecomputer } = await import('../../../scripts/visibility/auto-visibility/core/LightingPrecomputer.js');
        const { map, stats } = await LightingPrecomputer.precompute([]);
        expect(map).toBeNull();
        expect(stats).toEqual(expect.objectContaining({ batch: 'process' }));
        // restore
        LC.LightingCalculator.getInstance = originalGetInstance;
    });

    test('maps tokens to light levels using provided positions', async () => {
        // mock LightingCalculator singleton and getLightLevelAt
        const mockLC = {
            getLightLevelAt: jest.fn((pos, tok) => ({ level: pos?.x > 50 ? 'bright' : 'darkness', token: tok?.document?.id })),
        };
        const LC = await import('../../../scripts/visibility/auto-visibility/LightingCalculator.js');
        const originalGetInstance = LC.LightingCalculator.getInstance;
        LC.LightingCalculator.getInstance = () => mockLC;

        const t1 = createMockToken({ id: 'A', x: 10, y: 10, elevation: 0 });
        const t2 = createMockToken({ id: 'B', x: 100, y: 10, elevation: 0 });
        const pos = new Map([
            ['A', { x: 10, y: 10, elevation: 0 }],
            ['B', { x: 100, y: 10, elevation: 0 }],
        ]);

        const { LightingPrecomputer } = await import('../../../scripts/visibility/auto-visibility/core/LightingPrecomputer.js');
        const { map } = await LightingPrecomputer.precompute([t1, t2], pos);
        expect(map).toBeInstanceOf(Map);
        expect(map.get('A')).toEqual({ level: 'darkness', token: 'A' });
        expect(map.get('B')).toEqual({ level: 'bright', token: 'B' });
        // restore
        LC.LightingCalculator.getInstance = originalGetInstance;
    });

    test('consumes forced fresh lighting after one successful recompute', async () => {
        const mockLC = {
            getLightLevelAt: jest.fn((pos, tok) => ({ level: 'bright', token: tok?.document?.id })),
        };
        const LC = await import('../../../scripts/visibility/auto-visibility/LightingCalculator.js');
        const originalGetInstance = LC.LightingCalculator.getInstance;
        LC.LightingCalculator.getInstance = () => mockLC;

        const { LightingPrecomputer } = await import('../../../scripts/visibility/auto-visibility/core/LightingPrecomputer.js');
        const t1 = createMockToken({ id: 'A', x: 10, y: 10, elevation: 0 });

        LightingPrecomputer.clearLightingCaches();
        const first = await LightingPrecomputer.precompute([t1]);
        const second = await LightingPrecomputer.precompute([t1], undefined, first);

        expect(mockLC.getLightLevelAt).toHaveBeenCalledTimes(1);
        expect(second.stats.fastPathUsed).toBe(true);
        expect(LightingPrecomputer.isForcingFreshComputation()).toBe(false);

        LC.LightingCalculator.getInstance = originalGetInstance;
    });
});
