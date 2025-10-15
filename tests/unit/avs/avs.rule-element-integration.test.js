import { ruleElementService } from '../../../scripts/services/RuleElementService.js';
import { BatchProcessor } from '../../../scripts/visibility/auto-visibility/core/BatchProcessor.js';

jest.mock('../../../scripts/services/RuleElementService.js', () => ({
    ruleElementService: {
        applyVisibilityModifiers: jest.fn((visibility) => visibility),
        clearCache: jest.fn(),
    },
}));

describe('AVS BatchProcessor - Rule Element Integration', () => {
    let batchProcessor;
    let mockDependencies;

    beforeEach(() => {
        jest.clearAllMocks();
        ruleElementService.applyVisibilityModifiers.mockImplementation((visibility) => visibility);

        mockDependencies = {
            viewportFilterService: {
                getTokenIdSet: jest.fn(() => null),
            },
            optimizedVisibilityCalculator: {
                calculateVisibilityBetweenTokens: jest.fn().mockResolvedValue('observed'),
            },
            globalLosCache: {
                get: jest.fn(),
                set: jest.fn(),
                getWithMeta: jest.fn(() => ({ state: 'miss' })),
                pruneIfDue: jest.fn(),
            },
            globalVisibilityCache: {
                get: jest.fn(),
                set: jest.fn(),
                getWithMeta: jest.fn(() => ({ state: 'miss' })),
                pruneIfDue: jest.fn(),
            },
            positionManager: {
                getTokenPosition: jest.fn((token) => ({ x: token.x || 0, y: token.y || 0 })),
            },
            overrideService: {
                getActiveOverrideForTokens: jest.fn(),
            },
            visibilityMapService: {
                getVisibility: jest.fn(() => 'observed'),
                getMap: jest.fn(() => ({})),
            },
            visionAnalyzer: {
                hasLineOfSight: jest.fn(() => true),
                getVisionCapabilities: jest.fn(() => ({
                    senses: [],
                    hasDarkvision: false,
                    hasLowLightVision: false,
                })),
            },
            maxVisibilityDistance: 100,
        };

        batchProcessor = new BatchProcessor(mockDependencies);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('calls ruleElementService during visibility calculation', () => {
        test('calls applyVisibilityModifiers for direction 1 (changedToken -> otherToken)', async () => {
            const changedToken = {
                id: 'changed1',
                document: { id: 'changed1' },
                x: 100,
                y: 100,
                actor: { uuid: 'Actor.changed', items: { contents: [] } },
            };

            const otherToken = {
                id: 'other1',
                document: { id: 'other1' },
                x: 200,
                y: 200,
                actor: { uuid: 'Actor.other', items: { contents: [] } },
            };

            const allTokens = [changedToken, otherToken];
            const changedTokenIds = new Set(['changed1']);

            await batchProcessor.process(allTokens, changedTokenIds, {});

            expect(ruleElementService.applyVisibilityModifiers).toHaveBeenCalledWith(
                expect.any(String),
                changedToken,
                otherToken
            );
        });

        test('calls applyVisibilityModifiers for direction 2 (otherToken -> changedToken)', async () => {
            const changedToken = {
                id: 'changed1',
                document: { id: 'changed1' },
                x: 100,
                y: 100,
                actor: { uuid: 'Actor.changed', items: { contents: [] } },
            };

            const otherToken = {
                id: 'other1',
                document: { id: 'other1' },
                x: 200,
                y: 200,
                actor: { uuid: 'Actor.other', items: { contents: [] } },
            };

            const allTokens = [changedToken, otherToken];
            const changedTokenIds = new Set(['changed1']);

            await batchProcessor.process(allTokens, changedTokenIds, {});

            expect(ruleElementService.applyVisibilityModifiers).toHaveBeenCalledWith(
                expect.any(String),
                otherToken,
                changedToken
            );
        });

        test('calls applyVisibilityModifiers twice per token pair (both directions)', async () => {
            const changedToken = {
                id: 'changed1',
                document: { id: 'changed1' },
                x: 100,
                y: 100,
                actor: { uuid: 'Actor.changed', items: { contents: [] } },
            };

            const otherToken = {
                id: 'other1',
                document: { id: 'other1' },
                x: 200,
                y: 200,
                actor: { uuid: 'Actor.other', items: { contents: [] } },
            };

            const allTokens = [changedToken, otherToken];
            const changedTokenIds = new Set(['changed1']);

            await batchProcessor.process(allTokens, changedTokenIds, {});

            expect(ruleElementService.applyVisibilityModifiers).toHaveBeenCalledTimes(2);
        });

        test('uses modified visibility in updates', async () => {
            ruleElementService.applyVisibilityModifiers.mockImplementation((visibility, observer) => {
                if (observer.id === 'changed1') {
                    return 'concealed';
                }
                return visibility;
            });

            const changedToken = {
                id: 'changed1',
                document: { id: 'changed1' },
                x: 100,
                y: 100,
                actor: { uuid: 'Actor.changed', items: { contents: [] } },
            };

            const otherToken = {
                id: 'other1',
                document: { id: 'other1' },
                x: 200,
                y: 200,
                actor: { uuid: 'Actor.other', items: { contents: [] } },
            };

            const allTokens = [changedToken, otherToken];
            const changedTokenIds = new Set(['changed1']);

            const result = await batchProcessor.process(allTokens, changedTokenIds, {});

            const update = result.updates.find(
                (u) => u.observer.id === 'changed1' && u.target.id === 'other1'
            );
            expect(update?.visibility).toBe('concealed');
        });

        test('handles multiple token pairs correctly', async () => {
            const changedToken = {
                id: 'changed1',
                document: { id: 'changed1' },
                x: 100,
                y: 100,
                actor: { uuid: 'Actor.changed', items: { contents: [] } },
            };

            const otherToken1 = {
                id: 'other1',
                document: { id: 'other1' },
                x: 200,
                y: 200,
                actor: { uuid: 'Actor.other1', items: { contents: [] } },
            };

            const otherToken2 = {
                id: 'other2',
                document: { id: 'other2' },
                x: 300,
                y: 300,
                actor: { uuid: 'Actor.other2', items: { contents: [] } },
            };

            const allTokens = [changedToken, otherToken1, otherToken2];
            const changedTokenIds = new Set(['changed1']);

            await batchProcessor.process(allTokens, changedTokenIds, {});

            expect(ruleElementService.applyVisibilityModifiers).toHaveBeenCalledTimes(4);
        });
    });

    describe('error handling', () => {
        test('continues processing if applyVisibilityModifiers throws', async () => {
            ruleElementService.applyVisibilityModifiers.mockImplementation(() => {
                throw new Error('Rule element error');
            });

            const changedToken = {
                id: 'changed1',
                document: { id: 'changed1' },
                x: 100,
                y: 100,
                actor: { uuid: 'Actor.changed', items: { contents: [] } },
            };

            const otherToken = {
                id: 'other1',
                document: { id: 'other1' },
                x: 200,
                y: 200,
                actor: { uuid: 'Actor.other', items: { contents: [] } },
            };

            const allTokens = [changedToken, otherToken];
            const changedTokenIds = new Set(['changed1']);

            await expect(batchProcessor.process(allTokens, changedTokenIds, {})).rejects.toThrow();
        });

        test('uses base visibility if modifier fails', async () => {
            ruleElementService.applyVisibilityModifiers.mockImplementationOnce(() => {
                throw new Error('Rule element error');
            });

            const changedToken = {
                id: 'changed1',
                document: { id: 'changed1' },
                x: 100,
                y: 100,
                actor: { uuid: 'Actor.changed', items: { contents: [] } },
            };

            const otherToken = {
                id: 'other1',
                document: { id: 'other1' },
                x: 200,
                y: 200,
                actor: { uuid: 'Actor.other', items: { contents: [] } },
            };

            const allTokens = [changedToken, otherToken];
            const changedTokenIds = new Set(['changed1']);

            await expect(batchProcessor.process(allTokens, changedTokenIds, {})).rejects.toThrow();
        });
    });

    describe('integration with overrides', () => {
        test('applies rule elements even when overrides exist', async () => {
            mockDependencies.overrideService.getActiveOverrideForTokens.mockReturnValue(null);

            const changedToken = {
                id: 'changed1',
                document: { id: 'changed1' },
                x: 100,
                y: 100,
                actor: { uuid: 'Actor.changed', items: { contents: [] } },
            };

            const otherToken = {
                id: 'other1',
                document: { id: 'other1' },
                x: 200,
                y: 200,
                actor: { uuid: 'Actor.other', items: { contents: [] } },
            };

            const allTokens = [changedToken, otherToken];
            const changedTokenIds = new Set(['changed1']);

            await batchProcessor.process(allTokens, changedTokenIds, {});

            expect(ruleElementService.applyVisibilityModifiers).toHaveBeenCalled();
        });
    });

    describe('performance', () => {
        test('rule element integration does not significantly impact performance', async () => {
            const tokens = [];
            for (let i = 0; i < 10; i++) {
                tokens.push({
                    id: `token${i}`,
                    document: { id: `token${i}` },
                    x: i * 100,
                    y: i * 100,
                    actor: { uuid: `Actor.${i}`, items: { contents: [] } },
                });
            }

            const changedTokenIds = new Set(['token0']);

            const start = Date.now();
            await batchProcessor.process(tokens, changedTokenIds, {});
            const duration = Date.now() - start;

            expect(duration).toBeLessThan(1000);
        });
    });
});
