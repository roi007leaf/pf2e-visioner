import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ActionQualifier } from '../../../scripts/rule-elements/operations/ActionQualifier.js';
import { CoverOverride } from '../../../scripts/rule-elements/operations/CoverOverride.js';
import { DetectionModeModifier } from '../../../scripts/rule-elements/operations/DetectionModeModifier.js';
import { DistanceBasedVisibility } from '../../../scripts/rule-elements/operations/DistanceBasedVisibility.js';
import { LightingModifier } from '../../../scripts/rule-elements/operations/LightingModifier.js';
import { SenseModifier } from '../../../scripts/rule-elements/operations/SenseModifier.js';
import { VisibilityOverride } from '../../../scripts/rule-elements/operations/VisibilityOverride.js';
import { PredicateHelper } from '../../../scripts/rule-elements/PredicateHelper.js';

describe('Rule Element Predicate Filtering', () => {
    let mockSubjectToken;
    let mockTargetToken1;
    let mockTargetToken2;
    let mockCanvas;

    beforeEach(() => {
        mockSubjectToken = {
            id: 'subject-token',
            actor: {
                getRollOptions: jest.fn(() => ['self:trait:human', 'self:level:5']),
                hasPlayerOwner: true,
                token: { disposition: 1 },
                isAllyOf: jest.fn((other) => {
                    return other === mockTargetToken2.actor;
                }),
            },
            document: {
                id: 'subject-doc',
                getFlag: jest.fn(() => null),
                setFlag: jest.fn(() => Promise.resolve()),
                unsetFlag: jest.fn(() => Promise.resolve()),
            },
            x: 0,
            y: 0,
        };

        mockTargetToken1 = {
            id: 'target-token-1',
            actor: {
                getRollOptions: jest.fn(() => ['self:trait:undead', 'self:level:3']),
                hasPlayerOwner: false,
                token: { disposition: -1 },
                isAllyOf: jest.fn(() => false),
            },
            document: {
                id: 'target-doc-1',
                getFlag: jest.fn(() => null),
                setFlag: jest.fn(() => Promise.resolve()),
                unsetFlag: jest.fn(() => Promise.resolve()),
            },
            x: 100,
            y: 0,
        };

        mockTargetToken2 = {
            id: 'target-token-2',
            actor: {
                getRollOptions: jest.fn(() => ['self:trait:elf', 'self:level:4']),
                hasPlayerOwner: true,
                token: { disposition: 1 },
                isAllyOf: jest.fn(() => true),
            },
            document: {
                id: 'target-doc-2',
                getFlag: jest.fn(() => null),
                setFlag: jest.fn(() => Promise.resolve()),
                unsetFlag: jest.fn(() => Promise.resolve()),
            },
            x: 200,
            y: 0,
        };

        mockCanvas = {
            tokens: {
                placeables: [mockSubjectToken, mockTargetToken1, mockTargetToken2],
                controlled: [],
            },
            grid: {
                measureDistance: jest.fn(() => 50),
            },
        };

        global.canvas = mockCanvas;
        global.game = {
            user: {
                targets: new Set(),
            },
            pf2e: {
                Predicate: jest.fn().mockImplementation((predicate) => ({
                    test: (options) => {
                        return predicate.every((term) => options.includes(term));
                    },
                })),
            },
        };
    });

    describe('CoverOverride - Per-Target Predicate Filtering', () => {
        it('should apply cover only to targets matching predicate', async () => {
            const operation = {
                state: 'standard',
                targets: 'all',
                direction: 'from',
                predicate: ['target:self:trait:undead'],
                priority: 100,
            };

            const mockRuleElement = {
                item: { slug: 'test-effect' },
            };

            await CoverOverride.applyCoverOverride(operation, mockSubjectToken, mockRuleElement);

            expect(mockSubjectToken.document.setFlag).toHaveBeenCalled();
            expect(mockTargetToken1.document.setFlag).not.toHaveBeenCalled();
            expect(mockTargetToken2.document.setFlag).not.toHaveBeenCalled();
        });

        it('should skip targets that do not match predicate', async () => {
            const operation = {
                state: 'standard',
                targets: 'all',
                direction: 'from',
                predicate: ['target:self:trait:dragon'],
                priority: 100,
            };

            const mockRuleElement = {
                item: { slug: 'test-effect' },
            };

            const setFlagCallsBefore = mockSubjectToken.document.setFlag.mock.calls.length;
            await CoverOverride.applyCoverOverride(operation, mockSubjectToken, mockRuleElement);

            expect(mockSubjectToken.document.setFlag.mock.calls.length).toBe(setFlagCallsBefore);
        });

        it('should apply cover to all targets when no predicate is provided', async () => {
            const operation = {
                state: 'standard',
                targets: 'all',
                direction: 'from',
                priority: 100,
            };

            const mockRuleElement = {
                item: { slug: 'test-effect' },
            };

            await CoverOverride.applyCoverOverride(operation, mockSubjectToken, mockRuleElement);

            expect(mockSubjectToken.document.setFlag).toHaveBeenCalled();
        });

        it('should combine subject and target roll options for predicate evaluation', async () => {
            const evaluateSpy = jest.spyOn(PredicateHelper, 'evaluate');

            const operation = {
                state: 'standard',
                targets: 'all',
                direction: 'from',
                predicate: ['self:trait:human', 'target:self:trait:undead'],
                priority: 100,
            };

            const mockRuleElement = {
                item: { slug: 'test-effect' },
            };

            await CoverOverride.applyCoverOverride(operation, mockSubjectToken, mockRuleElement);

            expect(evaluateSpy).toHaveBeenCalledWith(
                ['self:trait:human', 'target:self:trait:undead'],
                expect.arrayContaining(['self:trait:human', 'target:self:trait:undead']),
            );

            evaluateSpy.mockRestore();
        });
    });

    describe('LightingModifier - Token-Level Predicate Filtering', () => {
        beforeEach(() => {
            global.window = {
                pf2eVisioner: {
                    services: {
                        autoVisibilitySystem: {
                            recalculateForTokens: jest.fn(() => Promise.resolve()),
                        },
                    },
                },
            };
        });

        it('should apply lighting modification when predicate matches', async () => {
            const operation = {
                lightingLevel: 'dim',
                predicate: ['self:trait:human'],
                priority: 100,
            };

            await LightingModifier.applyLightingModification(operation, mockSubjectToken);

            expect(mockSubjectToken.document.setFlag).toHaveBeenCalledWith(
                'pf2e-visioner',
                expect.stringMatching(/lightingModification/),
                expect.objectContaining({
                    lightingLevel: 'dim',
                }),
            );
        });

        it('should not apply lighting modification when predicate fails', async () => {
            const operation = {
                lightingLevel: 'dim',
                predicate: ['self:trait:elf'],
                priority: 100,
            };

            const setFlagCallsBefore = mockSubjectToken.document.setFlag.mock.calls.length;
            await LightingModifier.applyLightingModification(operation, mockSubjectToken);

            expect(mockSubjectToken.document.setFlag.mock.calls.length).toBe(setFlagCallsBefore);
        });

        it('should apply lighting modification when no predicate provided', async () => {
            const operation = {
                lightingLevel: 'bright',
                priority: 100,
            };

            await LightingModifier.applyLightingModification(operation, mockSubjectToken);

            expect(mockSubjectToken.document.setFlag).toHaveBeenCalledWith(
                'pf2e-visioner',
                expect.stringMatching(/lightingModification/),
                expect.objectContaining({
                    lightingLevel: 'bright',
                }),
            );
        });
    });

    describe('VisibilityOverride - Per-Target Predicate Filtering', () => {
        beforeEach(() => {
            global.window = {
                pf2eVisioner: {
                    services: {
                        autoVisibilitySystem: {
                            recalculateForTokens: jest.fn(() => Promise.resolve()),
                        },
                    },
                },
            };
        });

        it('should apply visibility only to targets matching predicate', async () => {
            const operation = {
                state: 'concealed',
                observers: 'all',
                direction: 'from',
                predicate: ['target:trait:undead'],
                priority: 100,
            };

            await VisibilityOverride.applyVisibilityOverride(operation, mockSubjectToken);

            expect(mockSubjectToken.document.setFlag).toHaveBeenCalled();
        });

        it('should skip targets that do not match predicate', async () => {
            const operation = {
                state: 'concealed',
                observers: 'all',
                direction: 'from',
                predicate: ['target:trait:dragon'],
                priority: 100,
            };

            const setFlagCallsBefore = mockSubjectToken.document.setFlag.mock.calls.length;
            await VisibilityOverride.applyVisibilityOverride(operation, mockSubjectToken);
        });

        it('should apply visibility to all targets when no predicate provided', async () => {
            const operation = {
                state: 'hidden',
                observers: 'all',
                direction: 'from',
                priority: 100,
            };

            await VisibilityOverride.applyVisibilityOverride(operation, mockSubjectToken);

            expect(mockSubjectToken.document.setFlag).toHaveBeenCalled();
        });
    });

    describe('PredicateHelper - Roll Options Combination', () => {
        it('should get subject token roll options', () => {
            const options = PredicateHelper.getTokenRollOptions(mockSubjectToken);
            expect(options).toContain('self:trait:human');
            expect(options).toContain('self:level:5');
        });

        it('should get target roll options with target: prefix', () => {
            const options = PredicateHelper.getTargetRollOptions(mockTargetToken1, mockSubjectToken);
            expect(options).toContain('target:self:trait:undead');
            expect(options).toContain('target:self:level:3');
            expect(options).toContain('target:enemy');
        });

        it('should get target roll options with ally designation', () => {
            const options = PredicateHelper.getTargetRollOptions(mockTargetToken2, mockSubjectToken);
            expect(options).toContain('target:self:trait:elf');
            expect(options.some(opt => opt === 'target:ally' || opt === 'target:enemy')).toBe(true);
        });

        it('should combine multiple roll option sets', () => {
            const set1 = ['option1', 'option2'];
            const set2 = ['option3', 'option4'];
            const set3 = new Set(['option5']);

            const combined = PredicateHelper.combineRollOptions(set1, set2, set3);

            expect(combined).toContain('option1');
            expect(combined).toContain('option2');
            expect(combined).toContain('option3');
            expect(combined).toContain('option4');
            expect(combined).toContain('option5');
        });

        it('should evaluate predicate with combined options', () => {
            const predicate = ['self:trait:human', 'target:self:trait:undead'];
            const subjectOptions = PredicateHelper.getTokenRollOptions(mockSubjectToken);
            const targetOptions = PredicateHelper.getTargetRollOptions(mockTargetToken1, mockSubjectToken);
            const combined = PredicateHelper.combineRollOptions(subjectOptions, targetOptions);

            const result = PredicateHelper.evaluate(predicate, combined);
            expect(result).toBe(true);
        });

        it('should fail predicate when condition not met', () => {
            const predicate = ['self:trait:dragon'];
            const options = PredicateHelper.getTokenRollOptions(mockSubjectToken);

            const result = PredicateHelper.evaluate(predicate, options);
            expect(result).toBe(false);
        });
    });

    describe('Complex Predicate Scenarios', () => {
        it('should handle multiple predicate terms (AND logic)', async () => {
            const operation = {
                state: 'standard',
                targets: 'all',
                direction: 'from',
                predicate: ['self:trait:human', 'target:self:trait:undead', 'target:enemy'],
                priority: 100,
            };

            const mockRuleElement = {
                item: { slug: 'test-effect' },
            };

            await CoverOverride.applyCoverOverride(operation, mockSubjectToken, mockRuleElement);

            expect(mockSubjectToken.document.setFlag).toHaveBeenCalled();
            expect(mockTargetToken1.document.setFlag).not.toHaveBeenCalled();
        });

        it('should fail when any predicate term is not met', async () => {
            const operation = {
                state: 'standard',
                targets: 'all',
                direction: 'from',
                predicate: ['self:trait:human', 'target:self:trait:dragon'],
                priority: 100,
            };

            const mockRuleElement = {
                item: { slug: 'test-effect' },
            };

            const setFlagCallsBefore = mockSubjectToken.document.setFlag.mock.calls.length;
            await CoverOverride.applyCoverOverride(operation, mockSubjectToken, mockRuleElement);

            expect(mockSubjectToken.document.setFlag.mock.calls.length).toBe(setFlagCallsBefore);
        });

        it('should evaluate different predicates for different targets', async () => {
            mockCanvas.tokens.placeables = [mockSubjectToken, mockTargetToken1, mockTargetToken2];

            const operation = {
                state: 'standard',
                targets: 'all',
                direction: 'from',
                predicate: ['target:enemy'],
                priority: 100,
            };

            const mockRuleElement = {
                item: { slug: 'test-effect' },
            };

            await CoverOverride.applyCoverOverride(operation, mockSubjectToken, mockRuleElement);
        });
    });

    describe('Predicate with targets filtering', () => {
        it('should apply predicate after targets filter (allies only + predicate)', async () => {
            const operation = {
                state: 'standard',
                targets: 'allies',
                direction: 'from',
                predicate: ['target:self:trait:elf'],
                priority: 100,
            };

            const mockRuleElement = {
                item: { slug: 'test-effect' },
            };

            await CoverOverride.applyCoverOverride(operation, mockSubjectToken, mockRuleElement);
        });

        it('should apply predicate after targets filter (enemies only + predicate)', async () => {
            const operation = {
                state: 'standard',
                targets: 'enemies',
                direction: 'from',
                predicate: ['target:self:trait:undead'],
                priority: 100,
            };

            const mockRuleElement = {
                item: { slug: 'test-effect' },
            };

            await CoverOverride.applyCoverOverride(operation, mockSubjectToken, mockRuleElement);

            expect(mockSubjectToken.document.setFlag).toHaveBeenCalled();
            expect(mockTargetToken1.document.setFlag).not.toHaveBeenCalled();
        });
    });

    describe('SenseModifier - Token-Level Predicate Filtering', () => {
        it('should apply sense modifications when predicate matches', async () => {
            mockSubjectToken.actor.system = {
                perception: {
                    senses: [{ type: 'darkvision', range: 30, acuity: 'precise' }],
                },
            };
            mockSubjectToken.actor.update = jest.fn(() => Promise.resolve());
            mockSubjectToken.document.update = jest.fn(() => Promise.resolve());

            const operation = {
                senseModifications: {
                    darkvision: {
                        range: 60,
                    },
                },
                predicate: ['self:trait:human'],
            };

            await SenseModifier.applySenseModifications(
                mockSubjectToken,
                operation.senseModifications,
                'test-rule-id',
                operation.predicate,
            );

            expect(mockSubjectToken.actor.update).toHaveBeenCalled();
        });

        it('should not apply sense modifications when predicate fails', async () => {
            mockSubjectToken.actor.system = {
                perception: {
                    senses: [{ type: 'darkvision', range: 30, acuity: 'precise' }],
                },
            };
            mockSubjectToken.actor.update = jest.fn(() => Promise.resolve());
            mockSubjectToken.document.update = jest.fn(() => Promise.resolve());

            const operation = {
                senseModifications: {
                    darkvision: {
                        range: 60,
                    },
                },
                predicate: ['self:trait:elf'],
            };

            const updateCallsBefore = mockSubjectToken.actor.update.mock.calls.length;
            await SenseModifier.applySenseModifications(
                mockSubjectToken,
                operation.senseModifications,
                'test-rule-id',
                operation.predicate,
            );

            expect(mockSubjectToken.actor.update.mock.calls.length).toBe(updateCallsBefore);
        });

        it('should apply sense modifications when no predicate provided', async () => {
            mockSubjectToken.actor.system = {
                perception: {
                    senses: [{ type: 'darkvision', range: 30, acuity: 'precise' }],
                },
            };
            mockSubjectToken.actor.update = jest.fn(() => Promise.resolve());
            mockSubjectToken.document.update = jest.fn(() => Promise.resolve());

            const operation = {
                senseModifications: {
                    darkvision: {
                        range: 60,
                    },
                },
            };

            await SenseModifier.applySenseModifications(
                mockSubjectToken,
                operation.senseModifications,
                'test-rule-id',
            );

            expect(mockSubjectToken.actor.update).toHaveBeenCalled();
        });
    });

    describe('DetectionModeModifier - Token-Level Predicate Filtering', () => {
        it('should apply detection mode modifications when predicate matches', async () => {
            mockSubjectToken.document.update = jest.fn(() => Promise.resolve());
            mockSubjectToken.document.detectionModes = [
                { id: 'hearing', range: 30, enabled: true },
            ];

            const operation = {
                modeModifications: {
                    hearing: {
                        range: 60,
                    },
                },
                predicate: ['self:trait:human'],
            };

            await DetectionModeModifier.applyDetectionModeModifications(
                mockSubjectToken,
                operation.modeModifications,
                'test-rule-id',
                operation.predicate,
            );

            expect(mockSubjectToken.document.update).toHaveBeenCalled();
        });

        it('should not apply detection mode modifications when predicate fails', async () => {
            mockSubjectToken.document.update = jest.fn(() => Promise.resolve());
            mockSubjectToken.document.detectionModes = [
                { id: 'hearing', range: 30, enabled: true },
            ];

            const operation = {
                modeModifications: {
                    hearing: {
                        range: 60,
                    },
                },
                predicate: ['self:trait:elf'],
            };

            const updateCallsBefore = mockSubjectToken.document.update.mock.calls.length;
            await DetectionModeModifier.applyDetectionModeModifications(
                mockSubjectToken,
                operation.modeModifications,
                'test-rule-id',
                operation.predicate,
            );

            expect(mockSubjectToken.document.update.mock.calls.length).toBe(updateCallsBefore);
        });
    });

    describe('ActionQualifier - Token-Level Predicate Filtering', () => {
        it('should apply action qualifications when predicate matches', async () => {
            const operation = {
                qualifications: {
                    hide: {
                        qualifiesOnConcealment: false,
                    },
                },
                predicate: ['self:trait:human'],
                priority: 100,
            };

            await ActionQualifier.applyActionQualifications(operation, mockSubjectToken);

            expect(mockSubjectToken.document.setFlag).toHaveBeenCalledWith(
                'pf2e-visioner',
                expect.stringMatching(/actionQualifications/),
                expect.any(Object),
            );
        });

        it('should not apply action qualifications when predicate fails', async () => {
            const operation = {
                qualifications: {
                    hide: {
                        qualifiesOnConcealment: false,
                    },
                },
                predicate: ['self:trait:elf'],
                priority: 100,
            };

            const setFlagCallsBefore = mockSubjectToken.document.setFlag.mock.calls.length;
            await ActionQualifier.applyActionQualifications(operation, mockSubjectToken);

            expect(mockSubjectToken.document.setFlag.mock.calls.length).toBe(setFlagCallsBefore);
        });
    });

    describe('DistanceBasedVisibility - Stores Predicate in Flag', () => {
        beforeEach(() => {
            global.window = {
                pf2eVisioner: {
                    services: {
                        autoVisibilitySystem: {
                            recalculateForTokens: jest.fn(() => Promise.resolve()),
                        },
                    },
                },
            };
        });

        it('should store predicate in flag for later evaluation', async () => {
            const operation = {
                distanceBands: [
                    { minDistance: 0, maxDistance: 30, state: 'observed' },
                    { minDistance: 30, maxDistance: null, state: 'concealed' },
                ],
                predicate: ['self:trait:human'],
                priority: 100,
            };

            await DistanceBasedVisibility.applyDistanceBasedVisibility(operation, mockSubjectToken);

            expect(mockSubjectToken.document.setFlag).toHaveBeenCalledWith(
                'pf2e-visioner',
                'distanceBasedVisibility',
                expect.objectContaining({
                    predicate: ['self:trait:human'],
                }),
            );
        });

        it('should store empty predicate when not provided', async () => {
            const operation = {
                distanceBands: [
                    { minDistance: 0, maxDistance: 30, state: 'observed' },
                    { minDistance: 30, maxDistance: null, state: 'concealed' },
                ],
                priority: 100,
            };

            await DistanceBasedVisibility.applyDistanceBasedVisibility(operation, mockSubjectToken);

            expect(mockSubjectToken.document.setFlag).toHaveBeenCalledWith(
                'pf2e-visioner',
                'distanceBasedVisibility',
                expect.objectContaining({
                    predicate: undefined,
                }),
            );
        });
    });
});
