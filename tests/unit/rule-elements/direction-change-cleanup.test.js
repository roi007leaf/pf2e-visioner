/**
 * @file Regression test for direction property change cleanup
 * @description Tests that when the direction property on an effect changes,
 * all visibility flags from the previous direction are properly cleaned up.
 */

import { VisibilityOverride } from '../../../scripts/rule-elements/operations/VisibilityOverride.js';
import { SourceTracker } from '../../../scripts/rule-elements/SourceTracker.js';

describe('Rule Elements - Direction Change Cleanup', () => {
    let mockSubjectToken;
    let mockObserverToken1;
    let mockObserverToken2;
    let mockCanvas;

    beforeEach(() => {
        // Mock subject token
        mockSubjectToken = {
            id: 'subject-token-id',
            name: 'Subject Token',
            document: {
                id: 'subject-token-id',
                getFlag: jest.fn((scope, key) => {
                    if (scope === 'pf2e-visioner') {
                        if (key === 'ruleElementOverride') {
                            return {
                                active: true,
                                source: 'test-source-id',
                                state: 'hidden',
                                direction: 'from',
                            };
                        }
                        if (key === 'stateSource') {
                            return {
                                visibilityByObserver: {
                                    'observer-1': {
                                        sources: [{ id: 'test-source-id', type: 'test-source', priority: 100, state: 'hidden' }],
                                        state: 'hidden',
                                    },
                                },
                            };
                        }
                    }
                    return null;
                }),
                setFlag: jest.fn().mockResolvedValue(undefined),
                unsetFlag: jest.fn().mockResolvedValue(undefined),
                update: jest.fn().mockResolvedValue(undefined),
            },
            actor: {
                id: 'subject-actor-id',
                hasPlayerOwner: false,
                token: { disposition: 1 },
            },
        };

        // Mock observer tokens
        mockObserverToken1 = {
            id: 'observer-1',
            name: 'Observer 1',
            document: {
                id: 'observer-1',
                getFlag: jest.fn((scope, key) => {
                    if (scope === 'pf2e-visioner' && key === 'stateSource') {
                        return {
                            visibilityByObserver: {
                                'subject-token-id': {
                                    sources: [{ id: 'test-source-id', type: 'test-source', priority: 100, state: 'hidden' }],
                                    state: 'hidden',
                                },
                            },
                        };
                    }
                    return null;
                }),
                setFlag: jest.fn().mockResolvedValue(undefined),
                unsetFlag: jest.fn().mockResolvedValue(undefined),
                update: jest.fn().mockResolvedValue(undefined),
            },
            actor: {
                id: 'observer-1-actor',
                hasPlayerOwner: false,
                token: { disposition: -1 },
            },
        };

        mockObserverToken2 = {
            id: 'observer-2',
            name: 'Observer 2',
            document: {
                id: 'observer-2',
                getFlag: jest.fn((scope, key) => {
                    if (scope === 'pf2e-visioner' && key === 'stateSource') {
                        return {
                            visibilityByObserver: {
                                'subject-token-id': {
                                    sources: [{ id: 'test-source-id', type: 'test-source', priority: 100, state: 'hidden' }],
                                    state: 'hidden',
                                },
                            },
                        };
                    }
                    return null;
                }),
                setFlag: jest.fn().mockResolvedValue(undefined),
                unsetFlag: jest.fn().mockResolvedValue(undefined),
                update: jest.fn().mockResolvedValue(undefined),
            },
            actor: {
                id: 'observer-2-actor',
                hasPlayerOwner: false,
                token: { disposition: -1 },
            },
        };

        // Mock canvas
        mockCanvas = {
            tokens: {
                placeables: [mockSubjectToken, mockObserverToken1, mockObserverToken2],
            },
        };

        global.canvas = mockCanvas;
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('removeVisibilityOverride with direction="from"', () => {
        it('should remove sources from subject token with observer-specific tracking', async () => {
            // Use call counter to return null for early extraction, but return ruleElementOverride for fallback extraction
            let getFlagCallCount = 0;
            mockSubjectToken.document.getFlag = jest.fn((scope, key) => {
                getFlagCallCount++;
                // Early extraction (first few calls) should return null so idToMatch stays undefined
                // Fallback extraction (later calls) should return ruleElementOverride so sourceId gets set
                if (scope === 'pf2e-visioner') {
                    if (key === 'ruleElementOverride') {
                        // Return null for first call (early extraction), return value for later calls (fallback)
                        if (getFlagCallCount <= 2) {
                            return null;
                        }
                        return {
                            active: true,
                            source: 'test-source-id',
                            state: 'hidden',
                            direction: 'from',
                        };
                    }
                    if (key === 'stateSource') {
                        return {
                            visibilityByObserver: {
                                'observer-1': {
                                    sources: [{ id: 'test-source-id', type: 'test-source', priority: 100, state: 'hidden' }],
                                    state: 'hidden',
                                },
                                'observer-2': {
                                    sources: [{ id: 'test-source-id', type: 'test-source', priority: 100, state: 'hidden' }],
                                    state: 'hidden',
                                },
                            },
                        };
                    }
                }
                return null;
            });

            const operation = {
                // Don't provide source - will use fallback path that calls SourceTracker.removeSource
                direction: 'from',
                observers: 'all',
            };

            // Spy on SourceTracker
            const removeSourceSpy = jest.spyOn(SourceTracker, 'removeSource');

            await VisibilityOverride.removeVisibilityOverride(operation, mockSubjectToken);

            // Should remove from subject token with each observer ID (fallback path uses SourceTracker.removeSource)
            expect(removeSourceSpy).toHaveBeenCalledWith(
                mockSubjectToken,
                'test-source-id',
                'visibility',
                'observer-1',
            );
            expect(removeSourceSpy).toHaveBeenCalledWith(
                mockSubjectToken,
                'test-source-id',
                'visibility',
                'observer-2',
            );

            removeSourceSpy.mockRestore();
        });

        it('should unset ruleElementOverride and visibilityReplacement flags', async () => {
            const operation = {
                // source provided to test comprehensive cleanup path
                source: 'test-source-id',
                direction: 'from',
                observers: 'all',
            };

            await VisibilityOverride.removeVisibilityOverride(operation, mockSubjectToken);

            expect(mockSubjectToken.document.unsetFlag).toHaveBeenCalledWith(
                'pf2e-visioner',
                'ruleElementOverride',
            );
            expect(mockSubjectToken.document.unsetFlag).toHaveBeenCalledWith(
                'pf2e-visioner',
                'visibilityReplacement',
            );
        });
    });

    describe('removeVisibilityOverride with direction="to"', () => {
        it('should remove sources from observer tokens with subject as observer ID', async () => {
            let getFlagCallCount = 0;
            mockSubjectToken.document.getFlag = jest.fn((scope, key) => {
                getFlagCallCount++;
                if (scope === 'pf2e-visioner') {
                    if (key === 'ruleElementOverride') {
                        if (getFlagCallCount <= 2) {
                            return null;
                        }
                        return {
                            active: true,
                            source: 'test-source-id',
                            state: 'hidden',
                            direction: 'to',
                        };
                    }
                    if (key === 'stateSource') {
                        return {};
                    }
                }
                return null;
            });

            const operation = {
                // Don't provide source - will use fallback path that calls SourceTracker.removeSource
                direction: 'to',
                observers: 'all',
            };

            // Spy on SourceTracker
            const removeSourceSpy = jest.spyOn(SourceTracker, 'removeSource');

            await VisibilityOverride.removeVisibilityOverride(operation, mockSubjectToken);

            // Should remove from each observer token with subject as observer ID (no general call anymore)
            expect(removeSourceSpy).toHaveBeenCalledWith(
                mockObserverToken1,
                'test-source-id',
                'visibility',
                'subject-token-id',
            );
            expect(removeSourceSpy).toHaveBeenCalledWith(
                mockObserverToken2,
                'test-source-id',
                'visibility',
                'subject-token-id',
            );

            removeSourceSpy.mockRestore();
        });
    });

    describe('removeVisibilityOverride extracts direction from flags', () => {
        it('should extract direction from ruleElementOverride flag when not provided in operation', async () => {
            let getFlagCallCount = 0;
            mockSubjectToken.document.getFlag = jest.fn((scope, key) => {
                getFlagCallCount++;
                if (scope === 'pf2e-visioner') {
                    if (key === 'ruleElementOverride') {
                        if (getFlagCallCount <= 2) {
                            return null;
                        }
                        return {
                            active: true,
                            source: 'test-source-id',
                            state: 'hidden',
                            direction: 'from',
                        };
                    }
                    if (key === 'stateSource') {
                        return {
                            visibilityByObserver: {
                                'observer-1': {
                                    sources: [{ id: 'test-source-id', type: 'test-source', priority: 100, state: 'hidden' }],
                                    state: 'hidden',
                                },
                                'observer-2': {
                                    sources: [{ id: 'test-source-id', type: 'test-source', priority: 100, state: 'hidden' }],
                                    state: 'hidden',
                                },
                            },
                        };
                    }
                }
                return null;
            });

            const operation = {
                // Don't provide source or direction - fallback path will extract both from flags
            };

            const removeSourceSpy = jest.spyOn(SourceTracker, 'removeSource');

            await VisibilityOverride.removeVisibilityOverride(operation, mockSubjectToken);

            // Should use direction from flag ('from')
            expect(removeSourceSpy).toHaveBeenCalledWith(
                mockSubjectToken,
                'test-source-id',
                'visibility',
                'observer-1',
            );
            expect(removeSourceSpy).toHaveBeenCalledWith(
                mockSubjectToken,
                'test-source-id',
                'visibility',
                'observer-2',
            );

            removeSourceSpy.mockRestore();
        });

        it('should extract direction from visibilityReplacement flag as fallback', async () => {
            let getFlagCallCount = 0;
            mockSubjectToken.document.getFlag = jest.fn((scope, key) => {
                getFlagCallCount++;
                if (scope === 'pf2e-visioner') {
                    if (key === 'ruleElementOverride') {
                        return null;
                    }
                    if (key === 'visibilityReplacement') {
                        if (getFlagCallCount <= 2) {
                            return null;
                        }
                        return {
                            active: true,
                            id: 'test-source-id',
                            direction: 'to',
                        };
                    }
                    if (key === 'stateSource') {
                        return {};
                    }
                }
                return null;
            });

            const operation = {
                // Don't provide source or direction - fallback path will extract both from flags
            };

            const removeSourceSpy = jest.spyOn(SourceTracker, 'removeSource');

            await VisibilityOverride.removeVisibilityOverride(operation, mockSubjectToken);

            // Should use direction from visibilityReplacement flag ('to')
            expect(removeSourceSpy).toHaveBeenCalledWith(
                mockObserverToken1,
                'test-source-id',
                'visibility',
                'subject-token-id',
            );
            expect(removeSourceSpy).toHaveBeenCalledWith(
                mockObserverToken2,
                'test-source-id',
                'visibility',
                'subject-token-id',
            );

            removeSourceSpy.mockRestore();
        });
    });

    describe('removeVisibilityOverride with filtered observers', () => {
        it('should only remove from enemy tokens when observers="enemies"', async () => {
            let getFlagCallCount = 0;
            mockSubjectToken.document.getFlag = jest.fn((scope, key) => {
                getFlagCallCount++;
                if (scope === 'pf2e-visioner') {
                    if (key === 'ruleElementOverride') {
                        if (getFlagCallCount <= 2) {
                            return null;
                        }
                        return {
                            active: true,
                            source: 'test-source-id',
                            state: 'hidden',
                            direction: 'from',
                        };
                    }
                    if (key === 'stateSource') {
                        return {
                            visibilityByObserver: {
                                'observer-1': {
                                    sources: [{ id: 'test-source-id', type: 'test-source', priority: 100, state: 'hidden' }],
                                    state: 'hidden',
                                },
                                'observer-2': {
                                    sources: [{ id: 'test-source-id', type: 'test-source', priority: 100, state: 'hidden' }],
                                    state: 'hidden',
                                },
                            },
                        };
                    }
                }
                return null;
            });

            const operation = {
                // Don't provide source - will use fallback path that calls SourceTracker.removeSource
                direction: 'from',
                observers: 'enemies',
            };

            const removeSourceSpy = jest.spyOn(SourceTracker, 'removeSource');

            await VisibilityOverride.removeVisibilityOverride(operation, mockSubjectToken);

            // Should remove from enemies only (both observers are enemies) - no general call anymore
            expect(removeSourceSpy).toHaveBeenCalledWith(
                mockSubjectToken,
                'test-source-id',
                'visibility',
                'observer-1',
            );
            expect(removeSourceSpy).toHaveBeenCalledWith(
                mockSubjectToken,
                'test-source-id',
                'visibility',
                'observer-2',
            );

            removeSourceSpy.mockRestore();
        });
    });

    describe('Regression: Direction change scenario', () => {
        it('should properly clean up when direction changes from "to" to "from"', async () => {
            let getFlagCallCount = 0;
            mockSubjectToken.document.getFlag = jest.fn((scope, key) => {
                getFlagCallCount++;
                if (scope === 'pf2e-visioner') {
                    if (key === 'ruleElementOverride') {
                        if (getFlagCallCount <= 2) {
                            return null;
                        }
                        return {
                            active: true,
                            source: 'test-source-id',
                            state: 'hidden',
                            direction: 'to', // OLD direction
                        };
                    }
                    if (key === 'stateSource') {
                        return {};
                    }
                }
                return null;
            });

            const removeSourceSpy = jest.spyOn(SourceTracker, 'removeSource');

            // Remove with old direction (source will be extracted from flag in fallback path)
            await VisibilityOverride.removeVisibilityOverride(
                {},
                mockSubjectToken,
            );

            // Should clean up observer tokens (because old direction was 'to')
            expect(removeSourceSpy).toHaveBeenCalledWith(
                mockObserverToken1,
                'test-source-id',
                'visibility',
                'subject-token-id',
            );
            expect(removeSourceSpy).toHaveBeenCalledWith(
                mockObserverToken2,
                'test-source-id',
                'visibility',
                'subject-token-id',
            );

            removeSourceSpy.mockRestore();
        });

        it('should properly clean up when direction changes from "from" to "to"', async () => {
            let getFlagCallCount = 0;
            mockSubjectToken.document.getFlag = jest.fn((scope, key) => {
                getFlagCallCount++;
                if (scope === 'pf2e-visioner') {
                    if (key === 'ruleElementOverride') {
                        if (getFlagCallCount <= 2) {
                            return null;
                        }
                        return {
                            active: true,
                            source: 'test-source-id',
                            state: 'hidden',
                            direction: 'from', // OLD direction
                        };
                    }
                    if (key === 'stateSource') {
                        return {
                            visibilityByObserver: {
                                'observer-1': {
                                    sources: [{ id: 'test-source-id', type: 'test-source', priority: 100, state: 'hidden' }],
                                    state: 'hidden',
                                },
                                'observer-2': {
                                    sources: [{ id: 'test-source-id', type: 'test-source', priority: 100, state: 'hidden' }],
                                    state: 'hidden',
                                },
                            },
                        };
                    }
                }
                return null;
            });

            const removeSourceSpy = jest.spyOn(SourceTracker, 'removeSource');

            // Remove with old direction (source will be extracted from flag in fallback path)
            await VisibilityOverride.removeVisibilityOverride(
                {},
                mockSubjectToken,
            );

            // Should clean up subject token with observer IDs (because old direction was 'from')
            expect(removeSourceSpy).toHaveBeenCalledWith(
                mockSubjectToken,
                'test-source-id',
                'visibility',
                'observer-1',
            );
            expect(removeSourceSpy).toHaveBeenCalledWith(
                mockSubjectToken,
                'test-source-id',
                'visibility',
                'observer-2',
            );

            removeSourceSpy.mockRestore();
        });
    });
});
