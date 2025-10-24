import { CoverOverride } from '../../../scripts/rule-elements/operations/CoverOverride.js';
import '../../setup.js';

jest.mock('../../../scripts/utils.js', () => ({
    setCoverBetween: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../scripts/rule-elements/SourceTracker.js', () => ({
    SourceTracker: {
        addSourceToState: jest.fn().mockResolvedValue(undefined),
        removeSource: jest.fn().mockResolvedValue(undefined),
    },
}));

describe('overrideCover Operation - Rule Element', () => {
    let mockSubjectToken;
    let mockTargetToken1;
    let mockTargetToken2;
    let mockRuleElement;
    let setCoverBetween;
    let SourceTracker;

    beforeEach(() => {
        setCoverBetween = require('../../../scripts/utils.js').setCoverBetween;
        SourceTracker = require('../../../scripts/rule-elements/SourceTracker.js').SourceTracker;

        setCoverBetween.mockClear();
        SourceTracker.addSourceToState.mockClear();
        SourceTracker.removeSource.mockClear();

        mockSubjectToken = {
            id: 'token-subject',
            actor: {
                name: 'Subject',
                hasPlayerOwner: true,
                token: { disposition: 1 }
            },
            x: 0,
            y: 0,
            document: {
                id: 'token-subject',
                getFlag: jest.fn(),
                setFlag: jest.fn(),
            }
        };

        mockTargetToken1 = {
            id: 'token-target1',
            actor: {
                name: 'Target 1',
                hasPlayerOwner: false,
                token: { disposition: -1 }
            },
            x: 100,
            y: 0,
            document: {
                id: 'token-target1',
                getFlag: jest.fn(),
                setFlag: jest.fn(),
            }
        };

        mockTargetToken2 = {
            id: 'token-target2',
            actor: {
                name: 'Target 2',
                hasPlayerOwner: false,
                token: { disposition: -1 }
            },
            x: 200,
            y: 0,
            document: {
                id: 'token-target2',
                getFlag: jest.fn(),
                setFlag: jest.fn(),
            }
        };

        mockRuleElement = {
            item: {
                name: 'Tower Shield',
                slug: 'tower-shield',
            }
        };

        global.canvas = {
            tokens: {
                placeables: [mockSubjectToken, mockTargetToken1, mockTargetToken2]
            },
            grid: {
                measureDistance: jest.fn((from, to) => {
                    const dx = Math.abs(to.x - from.x);
                    const dy = Math.abs(to.y - from.y);
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    return distance / 5;
                })
            }
        };

        global.game = {
            user: {
                targets: new Set()
            }
        };
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('Basic overrideCover Operation', () => {
        test('should apply cover override to all enemies', async () => {
            const operation = {
                type: 'overrideCover',
                state: 'standard',
                direction: 'to',
                targets: 'enemies',
                source: 'tower-shield'
            };

            await CoverOverride.applyCoverOverride(operation, mockSubjectToken, mockRuleElement);

            expect(setCoverBetween).toHaveBeenCalledTimes(2);
            expect(setCoverBetween).toHaveBeenCalledWith(mockSubjectToken, mockTargetToken1, 'standard');
            expect(setCoverBetween).toHaveBeenCalledWith(mockSubjectToken, mockTargetToken2, 'standard');

            expect(SourceTracker.addSourceToState).toHaveBeenCalledTimes(2);
        });

        test('should apply cover override with direction "from"', async () => {
            const operation = {
                type: 'overrideCover',
                state: 'greater',
                direction: 'from',
                targets: 'all',
                source: 'cover-effect'
            };

            await CoverOverride.applyCoverOverride(operation, mockSubjectToken, mockRuleElement);

            expect(setCoverBetween).toHaveBeenCalledTimes(2);
            expect(setCoverBetween).toHaveBeenCalledWith(mockTargetToken1, mockSubjectToken, 'greater');
            expect(setCoverBetween).toHaveBeenCalledWith(mockTargetToken2, mockSubjectToken, 'greater');
        });

        test('should respect range limits', async () => {
            const operation = {
                type: 'overrideCover',
                state: 'standard',
                direction: 'to',
                targets: 'all',
                range: 25,
                source: 'limited-cover'
            };

            await CoverOverride.applyCoverOverride(operation, mockSubjectToken, mockRuleElement);

            expect(setCoverBetween).toHaveBeenCalledTimes(1);
            expect(setCoverBetween).toHaveBeenCalledWith(mockSubjectToken, mockTargetToken1, 'standard');
            expect(setCoverBetween).not.toHaveBeenCalledWith(mockSubjectToken, mockTargetToken2, 'standard');
        });

        test('should apply cover to targeted tokens only', async () => {
            global.game.user.targets = new Set([mockTargetToken1]);

            const operation = {
                type: 'overrideCover',
                state: 'lesser',
                direction: 'to',
                targets: 'targeted',
                source: 'selective-cover'
            };

            await CoverOverride.applyCoverOverride(operation, mockSubjectToken, mockRuleElement);

            expect(setCoverBetween).toHaveBeenCalledTimes(1);
            expect(setCoverBetween).toHaveBeenCalledWith(mockSubjectToken, mockTargetToken1, 'lesser');
        });

        test('should apply different cover states', async () => {
            const coverStates = ['none', 'lesser', 'standard', 'greater'];

            for (const state of coverStates) {
                setCoverBetween.mockClear();

                const operation = {
                    type: 'overrideCover',
                    state: state,
                    direction: 'to',
                    targets: 'all',
                    source: `cover-${state}`
                };

                await CoverOverride.applyCoverOverride(operation, mockSubjectToken, mockRuleElement);

                expect(setCoverBetween).toHaveBeenCalledWith(mockSubjectToken, expect.anything(), state);
            }
        });
    });

    describe('Cover Override with Predicates', () => {
        test('should pass predicate in source data', async () => {
            const operation = {
                type: 'overrideCover',
                state: 'standard',
                direction: 'to',
                targets: 'all',
                source: 'conditional-cover'
            };

            await CoverOverride.applyCoverOverride(operation, mockSubjectToken, mockRuleElement);

            expect(SourceTracker.addSourceToState).toHaveBeenCalledTimes(2);
            const firstCall = SourceTracker.addSourceToState.mock.calls[0];
            expect(firstCall[1]).toBe('cover');
            expect(firstCall[2].type).toBe('rule-element');
        });
    });

    describe('Cover Override with Priority', () => {
        test('should include priority in source data', async () => {
            const operation = {
                type: 'overrideCover',
                state: 'standard',
                direction: 'to',
                targets: 'all',
                priority: 150,
                source: 'high-priority-cover'
            };

            await CoverOverride.applyCoverOverride(operation, mockSubjectToken, mockRuleElement);

            expect(SourceTracker.addSourceToState).toHaveBeenCalledWith(
                expect.anything(),
                'cover',
                expect.objectContaining({
                    priority: 150,
                    state: 'standard'
                }),
                expect.anything()
            );
        });

        test('should use default priority when not specified', async () => {
            const operation = {
                type: 'overrideCover',
                state: 'standard',
                direction: 'to',
                targets: 'all',
                source: 'default-priority-cover'
            };

            await CoverOverride.applyCoverOverride(operation, mockSubjectToken, mockRuleElement);

            expect(SourceTracker.addSourceToState).toHaveBeenCalledWith(
                expect.anything(),
                'cover',
                expect.objectContaining({
                    priority: 100
                }),
                expect.anything()
            );
        });
    });

    describe('Cover Override with preventAutoCover', () => {
        test('should include preventAutoCover flag', async () => {
            const operation = {
                type: 'overrideCover',
                state: 'none',
                direction: 'from',
                targets: 'all',
                preventAutoCover: true,
                source: 'no-cover-effect'
            };

            await CoverOverride.applyCoverOverride(operation, mockSubjectToken, mockRuleElement);

            expect(SourceTracker.addSourceToState).toHaveBeenCalledWith(
                expect.anything(),
                'cover',
                expect.objectContaining({
                    preventAutoCover: true,
                    state: 'none'
                }),
                expect.anything()
            );
        });
    });

    describe('Cover Override Removal', () => {
        test('should remove cover override from all affected targets', async () => {
            const operation = {
                type: 'overrideCover',
                state: 'standard',
                direction: 'to',
                targets: 'all',
                source: 'tower-shield'
            };

            await CoverOverride.removeCoverOverride(operation, mockSubjectToken, mockRuleElement);

            expect(SourceTracker.removeSource).toHaveBeenCalledTimes(2);
            expect(SourceTracker.removeSource).toHaveBeenCalledWith(
                mockTargetToken1,
                'tower-shield',
                'cover',
                'token-subject'
            );
            expect(SourceTracker.removeSource).toHaveBeenCalledWith(
                mockTargetToken2,
                'tower-shield',
                'cover',
                'token-subject'
            );
        });

        test('should remove cover override with direction "from"', async () => {
            const operation = {
                type: 'overrideCover',
                state: 'greater',
                direction: 'from',
                targets: 'all',
                source: 'cover-effect'
            };

            await CoverOverride.removeCoverOverride(operation, mockSubjectToken, mockRuleElement);

            expect(SourceTracker.removeSource).toHaveBeenCalledTimes(2);
            expect(SourceTracker.removeSource).toHaveBeenCalledWith(
                mockSubjectToken,
                'cover-effect',
                'cover',
                'token-target1'
            );
            expect(SourceTracker.removeSource).toHaveBeenCalledWith(
                mockSubjectToken,
                'cover-effect',
                'cover',
                'token-target2'
            );
        });

        test('should respect range when removing cover override', async () => {
            const operation = {
                type: 'overrideCover',
                state: 'standard',
                direction: 'to',
                targets: 'all',
                range: 25,
                source: 'limited-cover'
            };

            await CoverOverride.removeCoverOverride(operation, mockSubjectToken, mockRuleElement);

            expect(SourceTracker.removeSource).toHaveBeenCalledTimes(1);
            expect(SourceTracker.removeSource).toHaveBeenCalledWith(
                mockTargetToken1,
                'limited-cover',
                'cover',
                'token-subject'
            );
        });
    });

    describe('Cover Override with Specific Tokens', () => {
        test('should apply cover to specific tokens only', async () => {
            const operation = {
                type: 'overrideCover',
                state: 'greater',
                direction: 'to',
                targets: 'specific',
                tokenIds: ['token-target1'],
                source: 'specific-cover'
            };

            await CoverOverride.applyCoverOverride(operation, mockSubjectToken, mockRuleElement);

            expect(setCoverBetween).toHaveBeenCalledTimes(1);
            expect(setCoverBetween).toHaveBeenCalledWith(mockSubjectToken, mockTargetToken1, 'greater');
        });
    });

    describe('Edge Cases', () => {
        test('should handle null subjectToken gracefully', async () => {
            const operation = {
                type: 'overrideCover',
                state: 'standard',
                direction: 'to',
                targets: 'all',
                source: 'test-cover'
            };

            await CoverOverride.applyCoverOverride(operation, null, mockRuleElement);

            expect(setCoverBetween).not.toHaveBeenCalled();
            expect(SourceTracker.addSourceToState).not.toHaveBeenCalled();
        });

        test('should not apply cover to self', async () => {
            const operation = {
                type: 'overrideCover',
                state: 'standard',
                direction: 'to',
                targets: 'all',
                source: 'self-cover'
            };

            await CoverOverride.applyCoverOverride(operation, mockSubjectToken, mockRuleElement);

            expect(setCoverBetween).not.toHaveBeenCalledWith(mockSubjectToken, mockSubjectToken, expect.anything());
        });

        test('should handle empty target list', async () => {
            global.canvas.tokens.placeables = [mockSubjectToken];

            const operation = {
                type: 'overrideCover',
                state: 'standard',
                direction: 'to',
                targets: 'all',
                source: 'no-targets'
            };

            await CoverOverride.applyCoverOverride(operation, mockSubjectToken, mockRuleElement);

            expect(setCoverBetween).not.toHaveBeenCalled();
        });

        test('should use generated source ID when source not provided', async () => {
            const operation = {
                type: 'overrideCover',
                state: 'standard',
                direction: 'to',
                targets: 'all'
            };

            await CoverOverride.applyCoverOverride(operation, mockSubjectToken, mockRuleElement);

            expect(SourceTracker.addSourceToState).toHaveBeenCalledWith(
                expect.anything(),
                'cover',
                expect.objectContaining({
                    id: 'rule-element-tower-shield'
                }),
                expect.anything()
            );
        });
    });

    describe('Integration with Source Tracking', () => {
        test('should track source with correct metadata', async () => {
            const operation = {
                type: 'overrideCover',
                state: 'standard',
                direction: 'to',
                targets: 'all',
                priority: 120,
                preventAutoCover: false,
                source: 'tracked-cover'
            };

            await CoverOverride.applyCoverOverride(operation, mockSubjectToken, mockRuleElement);

            expect(SourceTracker.addSourceToState).toHaveBeenCalledWith(
                expect.anything(),
                'cover',
                expect.objectContaining({
                    id: 'tracked-cover',
                    type: 'rule-element',
                    priority: 120,
                    state: 'standard',
                    direction: 'to',
                    preventAutoCover: false
                }),
                expect.anything()
            );
        });
    });
});
