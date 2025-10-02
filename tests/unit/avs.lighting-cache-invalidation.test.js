import { BatchOrchestrator } from '../../scripts/visibility/auto-visibility/core/BatchOrchestrator.js';
import { LightingPrecomputer } from '../../scripts/visibility/auto-visibility/core/LightingPrecomputer.js';
import '../setup.js';

jest.mock('../../scripts/visibility/auto-visibility/core/LightingPrecomputer.js', () => ({
    LightingPrecomputer: {
        precompute: jest.fn(),
        clearLightingCaches: jest.fn(),
    }
}));

describe('BatchOrchestrator - Lighting Cache Invalidation', () => {
    let orchestrator;
    let mockServices;
    let mockBatchProcessor;

    beforeEach(() => {
        jest.clearAllMocks();

        mockBatchProcessor = {
            _persistentCaches: {
                sensesCache: null,
                sensesCacheTs: 0,
                idToTokenMap: null,
                idToTokenMapTs: 0,
                spatialIndex: null,
                spatialIndexTs: 0,
            },
            globalLosCache: new Map(),
            globalVisibilityCache: new Map(),
        };

        mockServices = {
            LightingPrecomputer,
        };

        orchestrator = new BatchOrchestrator({
            batchProcessor: mockBatchProcessor,
            telemetryReporter: { start: jest.fn(), stop: jest.fn() },
            exclusionManager: { isExcludedToken: jest.fn(() => false) },
            visibilityMapService: { setVisibilityBetween: jest.fn() },
            moduleId: 'pf2e-visioner',
        });
        orchestrator.services = mockServices;
    });

    describe('clearPersistentCaches', () => {
        it('should clear BatchProcessor persistent caches', () => {
            mockBatchProcessor._persistentCaches.sensesCache = { some: 'data' };
            mockBatchProcessor._persistentCaches.sensesCacheTs = 12345;
            mockBatchProcessor._persistentCaches.idToTokenMap = new Map([['id1', {}]]);
            mockBatchProcessor._persistentCaches.idToTokenMapTs = 67890;
            mockBatchProcessor._persistentCaches.spatialIndex = { some: 'index' };
            mockBatchProcessor._persistentCaches.spatialIndexTs = 11111;

            orchestrator.clearPersistentCaches();

            expect(mockBatchProcessor._persistentCaches.sensesCache).toBeNull();
            expect(mockBatchProcessor._persistentCaches.sensesCacheTs).toBe(0);
            expect(mockBatchProcessor._persistentCaches.idToTokenMap).toBeNull();
            expect(mockBatchProcessor._persistentCaches.idToTokenMapTs).toBe(0);
            expect(mockBatchProcessor._persistentCaches.spatialIndex).toBeNull();
            expect(mockBatchProcessor._persistentCaches.spatialIndexTs).toBe(0);
        });

        it('should clear global LOS and visibility caches', () => {
            mockBatchProcessor.globalLosCache.set('key1', 'value1');
            mockBatchProcessor.globalVisibilityCache.set('key2', 'value2');

            orchestrator.clearPersistentCaches();

            expect(mockBatchProcessor.globalLosCache.size).toBe(0);
            expect(mockBatchProcessor.globalVisibilityCache.size).toBe(0);
        });

        it('should reset _lastPrecompute object', () => {
            orchestrator._lastPrecompute = {
                map: new Map([['id1', {}]]),
                stats: { some: 'stats' },
                posKeyMap: new Map([['id1', 'pos']]),
                lightingHash: 'old-hash',
                ts: 12345,
            };

            orchestrator.clearPersistentCaches();

            expect(orchestrator._lastPrecompute).toEqual({
                map: null,
                stats: null,
                posKeyMap: null,
                lightingHash: null,
                ts: 0,
            });
        });

        it('should call LightingPrecomputer.clearLightingCaches', () => {
            orchestrator.clearPersistentCaches();

            expect(LightingPrecomputer.clearLightingCaches).toHaveBeenCalledTimes(1);
        });

        it('should handle errors gracefully', () => {
            orchestrator.batchProcessor = null;

            expect(() => {
                orchestrator.clearPersistentCaches();
            }).not.toThrow();
        });
    });
});
