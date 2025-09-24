import '../setup.js';

describe('LightingPrecomputer', () => {
    test('returns null map when LightingCalculator getInstance returns undefined', async () => {
        const LC = await import('../../scripts/visibility/auto-visibility/LightingCalculator.js');
        const originalGetInstance = LC.LightingCalculator.getInstance;
        LC.LightingCalculator.getInstance = () => undefined;
        const { LightingPrecomputer } = await import('../../scripts/visibility/auto-visibility/core/LightingPrecomputer.js');
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
        const LC = await import('../../scripts/visibility/auto-visibility/LightingCalculator.js');
        const originalGetInstance = LC.LightingCalculator.getInstance;
        LC.LightingCalculator.getInstance = () => mockLC;

        const t1 = createMockToken({ id: 'A', x: 0, y: 0 });
        const t2 = createMockToken({ id: 'B', x: 0, y: 0 });
        const pos = new Map([
            ['A', { x: 10, y: 10, elevation: 0 }],
            ['B', { x: 100, y: 10, elevation: 0 }],
        ]);

        const { LightingPrecomputer } = await import('../../scripts/visibility/auto-visibility/core/LightingPrecomputer.js');
        const { map } = await LightingPrecomputer.precompute([t1, t2], pos);
        expect(map).toBeInstanceOf(Map);
        expect(map.get('A')).toEqual({ level: 'darkness', token: 'A' });
        expect(map.get('B')).toEqual({ level: 'bright', token: 'B' });
        // restore
        LC.LightingCalculator.getInstance = originalGetInstance;
    });
});
