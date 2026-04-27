import '../../setup.js';

import { BatchProcessor } from '../../../scripts/visibility/auto-visibility/core/BatchProcessor.js';
import { GlobalLosCache } from '../../../scripts/visibility/auto-visibility/utils/GlobalLosCache.js';
import { GlobalVisibilityCache } from '../../../scripts/visibility/auto-visibility/utils/GlobalVisibilityCache.js';

const makeToken = (id, x, y) => createMockToken({ id, x, y, width: 1, height: 1, actor: createMockActor() });

describe('BatchProcessor - Observer Movement Override Fix', () => {
    let spatialAnalyzer;
    let viewportFilterService;
    let optimizedVisibilityCalculator;
    let globalLosCache;
    let globalVisibilityCache;
    let positionManager;
    let getActiveOverride;
    let getVisibilityMap;
    let processor;

    beforeEach(() => {
        global.canvas.grid.size = 100;
        spatialAnalyzer = {
            canTokensSeeEachOther: jest.fn(() => true),
            getAffectedTokensByMovement: jest.fn(() => new Set())
        };
        viewportFilterService = {
            getTokensInViewport: jest.fn(tokens => new Set(tokens.map(t => t.document.id)))
        };
        optimizedVisibilityCalculator = {
            calculateVisibilityBetweenTokens: jest.fn(async () => 'concealed')
        };
        globalLosCache = new GlobalLosCache();
        globalVisibilityCache = new GlobalVisibilityCache();
        positionManager = {
            getTokenPosition: jest.fn(token => ({ x: token.document.x, y: token.document.y, elevation: 0 }))
        };
        getActiveOverride = jest.fn(() => null);
        getVisibilityMap = jest.fn(() => ({}));

        const overrideService = { getActiveOverrideForTokens: getActiveOverride };
        const visibilityMapService = { getVisibilityMap };

        // Mock the SystemStateProvider dependency
        const mockSystemState = {
            debug: jest.fn(),
            isDebugMode: jest.fn(() => false)
        };

        processor = new BatchProcessor({
            spatialAnalyzer,
            viewportFilterService,
            optimizedVisibilityCalculator,
            globalLosCache,
            globalVisibilityCache,
            positionManager,
            overrideService,
            visibilityMapService,
            systemState: mockSystemState,
            maxVisibilityDistance: 20
        });

        // Create tokens in global canvas
        global.canvas.tokens.placeables = [
            makeToken('A', 0, 0),    // Observer (moving)
            makeToken('B', 100, 0),  // Target
        ];
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    test('should recalculate when observer moves even with observer override', async () => {
        // Set up scenario: Observer A has override to Target B, but A moves so should recalculate
        getActiveOverride.mockImplementation((obs, tgt) => {
            if (obs?.document?.id === 'A' && tgt?.document?.id === 'B') {
                return { state: 'hidden' }; // Observer A has override to target B
            }
            return null;
        });

        // Process batch with A as changed token (moved)
        const res = await processor.process(global.canvas.tokens.placeables, new Set(['A']), {});

        // Should still perform calculation despite observer override
        expect(optimizedVisibilityCalculator.calculateVisibilityBetweenTokens).toHaveBeenCalled();

        // Should have updates for both the override and the recalculated visibility
        expect(res.updates.length).toBeGreaterThan(0);

        // Should not skip all calculations due to observer override
        expect(res.breakdown.pairsSkippedOverride).toBeLessThan(2); // At most 1 direction skipped
    });

    test('should skip calculation only when target has override', async () => {
        // Set up scenario: Target B has override from Observer A (reverse direction)
        getActiveOverride.mockImplementation((obs, tgt) => {
            if (obs?.document?.id === 'B' && tgt?.document?.id === 'A') {
                return { state: 'hidden' }; // Target B has override to observer A
            }
            return null;
        });

        // Process batch with A as changed token (moved)
        const res = await processor.process(global.canvas.tokens.placeables, new Set(['A']), {});

        // Should skip calculation when target has override
        expect(res.breakdown.pairsSkippedOverride).toBeGreaterThan(0);
    });

    test('should skip calculation when both directions have overrides', async () => {
        // Set up scenario: Both directions have overrides
        getActiveOverride.mockImplementation((obs, tgt) => {
            const obsId = obs?.document?.id;
            const tgtId = tgt?.document?.id;
            if ((obsId === 'A' && tgtId === 'B') || (obsId === 'B' && tgtId === 'A')) {
                return { state: 'hidden' };
            }
            return null;
        });

        // Process batch with A as changed token (moved)
        const res = await processor.process(global.canvas.tokens.placeables, new Set(['A']), {});

        // Should skip calculation when both directions have overrides
        expect(res.breakdown.pairsSkippedOverride).toBe(2); // Both directions skipped
        expect(optimizedVisibilityCalculator.calculateVisibilityBetweenTokens).not.toHaveBeenCalled();
    });

    test('should calculate visibility when no overrides exist', async () => {
        // No overrides
        getActiveOverride.mockImplementation(() => null);

        // Process batch with A as changed token (moved)
        const res = await processor.process(global.canvas.tokens.placeables, new Set(['A']), {});

        // Should perform calculation when no overrides
        expect(optimizedVisibilityCalculator.calculateVisibilityBetweenTokens).toHaveBeenCalled();
        expect(res.breakdown.pairsSkippedOverride).toBe(0);
    });

    test('should ignore burst LOS memo during movement so crossing a wall recalculates LOS', async () => {
        getActiveOverride.mockImplementation(() => null);
        getVisibilityMap.mockImplementation((token) => {
            if (token.document.id === 'A') return { B: 'undetected' };
            return {};
        });

        const visionAnalyzer = {
            hasLineOfSight: jest.fn(() => true),
            getVisionCapabilities: jest.fn(() => ({
                sensingSummary: { precise: [], imprecise: [] },
                isDeafened: false,
            })),
        };

        processor = new BatchProcessor({
            spatialAnalyzer,
            viewportFilterService,
            optimizedVisibilityCalculator,
            globalLosCache,
            globalVisibilityCache,
            positionManager,
            overrideService: { getActiveOverrideForTokens: getActiveOverride },
            visibilityMapService: { getVisibilityMap },
            visionAnalyzer,
            maxVisibilityDistance: 20
        });

        const burstLosMemo = new Map([
            ['A|0:0>>B|1:0', false],
        ]);

        const res = await processor.process(global.canvas.tokens.placeables, new Set(['A']), {
            burstLosMemo,
            skipPrecomputedLOS: true,
        });

        expect(visionAnalyzer.hasLineOfSight).toHaveBeenCalledWith(
            expect.objectContaining({ document: expect.objectContaining({ id: 'A' }) }),
            expect.objectContaining({ document: expect.objectContaining({ id: 'B' }) }),
            'sight',
        );
        expect(optimizedVisibilityCalculator.calculateVisibilityBetweenTokens).toHaveBeenCalled();
        expect(res.updates).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    observer: expect.objectContaining({ document: expect.objectContaining({ id: 'A' }) }),
                    target: expect.objectContaining({ document: expect.objectContaining({ id: 'B' }) }),
                    visibility: 'concealed',
                }),
            ]),
        );
    });

    test('should ignore global visibility cache during movement so stale undetected does not skip recalculation', async () => {
        getActiveOverride.mockImplementation(() => null);
        getVisibilityMap.mockImplementation((token) => {
            if (token.document.id === 'A') return { B: 'undetected' };
            return {};
        });

        globalVisibilityCache.set('A|0:0:0>>B|100:0:0', 'undetected');
        globalVisibilityCache.set('B|100:0:0>>A|0:0:0', 'observed');

        const visionAnalyzer = {
            hasLineOfSight: jest.fn(() => true),
            getVisionCapabilities: jest.fn(() => ({
                sensingSummary: { precise: [], imprecise: [] },
                isDeafened: false,
            })),
        };

        processor = new BatchProcessor({
            spatialAnalyzer,
            viewportFilterService,
            optimizedVisibilityCalculator,
            globalLosCache,
            globalVisibilityCache,
            positionManager,
            overrideService: { getActiveOverrideForTokens: getActiveOverride },
            visibilityMapService: { getVisibilityMap },
            visionAnalyzer,
            maxVisibilityDistance: 20
        });

        const res = await processor.process(global.canvas.tokens.placeables, new Set(['A']), {
            skipPrecomputedLOS: true,
        });

        expect(optimizedVisibilityCalculator.calculateVisibilityBetweenTokens).toHaveBeenCalled();
        expect(res.breakdown.pairsSkippedNoChange).toBe(0);
        expect(res.updates).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    observer: expect.objectContaining({ document: expect.objectContaining({ id: 'A' }) }),
                    target: expect.objectContaining({ document: expect.objectContaining({ id: 'B' }) }),
                    visibility: 'concealed',
                }),
            ]),
        );
    });
});
