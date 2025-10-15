/**
 * Tests for complex rule element combinations and edge cases
 * Tests interactions between multiple rule elements and property combinations
 */

import { RuleElementService } from '../../../scripts/services/RuleElementService.js';

describe('Rule Element Combinations and Edge Cases', () => {
    let service;
    let mockObserver;
    let mockTarget;

    beforeEach(() => {
        service = new RuleElementService();

        mockObserver = {
            id: 'observer1',
            name: 'Observer',
            document: { id: 'observer1' },
            actor: {
                uuid: 'Actor.observer',
                id: 'observer1',
                items: { contents: [] },
                getRollOptions: jest.fn(() => ['self:observer']),
            },
        };

        mockTarget = {
            id: 'target1',
            name: 'Target',
            document: { id: 'target1' },
            actor: {
                uuid: 'Actor.target',
                id: 'target1',
                items: { contents: [] },
                getRollOptions: jest.fn(() => ['self:target']),
            },
        };
    });

    describe('Cover and Visibility Together', () => {
        test('token has both cover and visibility rule elements', () => {
            const coverRule = {
                key: 'PF2eVisionerCover',
                mode: 'set',
                coverLevel: 'standard',
            };

            const visibilityRule = {
                key: 'PF2eVisionerVisibility',
                mode: 'set',
                status: 'concealed',
            };

            mockTarget.actor.items.contents = [{
                system: { rules: [coverRule, visibilityRule] },
            }];

            const coverResult = service.applyCoverModifiers('none', mockObserver, mockTarget);
            const visibilityResult = service.applyVisibilityModifiers('observed', mockObserver, mockTarget);

            expect(coverResult).toBe('standard');
            expect(visibilityResult).toBe('concealed');
        });

        test('observer reduces cover while target is concealed', () => {
            const observerCoverRule = {
                key: 'PF2eVisionerCover',
                mode: 'decrease',
                steps: 1,
            };

            const targetVisibilityRule = {
                key: 'PF2eVisionerVisibility',
                mode: 'set',
                status: 'concealed',
            };

            mockObserver.actor.items.contents = [{
                system: { rules: [observerCoverRule] },
            }];

            mockTarget.actor.items.contents = [{
                system: { rules: [targetVisibilityRule] },
            }];

            const coverResult = service.applyCoverModifiers('standard', mockObserver, mockTarget);
            const visibilityResult = service.applyVisibilityModifiers('observed', mockObserver, mockTarget);

            expect(coverResult).toBe('lesser');
            expect(visibilityResult).toBe('concealed');
        });

        test('both cover and visibility with predicates', () => {
            const coverRule = {
                key: 'PF2eVisionerCover',
                mode: 'increase',
                steps: 2,
                predicate: ['item:ranged'],
            };

            const visibilityRule = {
                key: 'PF2eVisionerVisibility',
                mode: 'increase',
                steps: 1,
                predicate: ['lighting:dim'],
            };

            mockTarget.actor.items.contents = [{
                system: { rules: [coverRule, visibilityRule] },
            }];

            mockTarget.actor.getRollOptions.mockReturnValue([
                'self:target',
                'item:ranged',
                'lighting:dim',
            ]);

            const coverResult = service.applyCoverModifiers('none', mockObserver, mockTarget);
            const visibilityResult = service.applyVisibilityModifiers('observed', mockObserver, mockTarget);

            expect(coverResult).toBe('standard');
            expect(visibilityResult).toBe('concealed');
        });
    });

    describe('Stacking and Priority', () => {
        test('set mode always overrides increase/decrease', () => {
            const increaseRule = {
                key: 'PF2eVisionerCover',
                mode: 'increase',
                steps: 3,
            };

            const setRule = {
                key: 'PF2eVisionerCover',
                mode: 'set',
                coverLevel: 'lesser',
            };

            mockTarget.actor.items.contents = [
                { system: { rules: [increaseRule] } },
                { system: { rules: [setRule] } },
            ];

            const result = service.applyCoverModifiers('none', mockObserver, mockTarget);
            expect(result).toBe('lesser');
        });

        test('multiple increase rules stack', () => {
            const rule1 = {
                key: 'PF2eVisionerCover',
                mode: 'increase',
                steps: 1,
            };

            const rule2 = {
                key: 'PF2eVisionerCover',
                mode: 'increase',
                steps: 1,
            };

            const rule3 = {
                key: 'PF2eVisionerCover',
                mode: 'increase',
                steps: 1,
            };

            mockTarget.actor.items.contents = [
                { system: { rules: [rule1] } },
                { system: { rules: [rule2] } },
                { system: { rules: [rule3] } },
            ];

            const result = service.applyCoverModifiers('none', mockObserver, mockTarget);
            expect(result).toBe('greater');
        });

        test('increase then decrease', () => {
            const increaseRule = {
                key: 'PF2eVisionerCover',
                mode: 'increase',
                steps: 2,
            };

            const decreaseRule = {
                key: 'PF2eVisionerCover',
                mode: 'decrease',
                steps: 1,
            };

            mockTarget.actor.items.contents = [
                { system: { rules: [increaseRule] } },
            ];

            mockObserver.actor.items.contents = [
                { system: { rules: [decreaseRule] } },
            ];

            const result = service.applyCoverModifiers('none', mockObserver, mockTarget);
            expect(result).toBe('lesser'); // none + 2 - 1 = lesser
        });

        test('remove mode overrides everything', () => {
            const increaseRule = {
                key: 'PF2eVisionerCover',
                mode: 'increase',
                steps: 3,
            };

            const removeRule = {
                key: 'PF2eVisionerCover',
                mode: 'remove',
            };

            mockTarget.actor.items.contents = [
                { system: { rules: [increaseRule] } },
            ];

            mockObserver.actor.items.contents = [
                { system: { rules: [removeRule] } },
            ];

            const result = service.applyCoverModifiers('standard', mockObserver, mockTarget);
            expect(result).toBe('none');
        });
    });

    describe('Direction and EffectTarget Interactions', () => {
        test('direction:"to" with effectTarget:"self" affects observer', () => {
            const rule = {
                key: 'PF2eVisionerCover',
                mode: 'decrease',
                steps: 2,
                direction: 'to',
                effectTarget: 'self',
            };

            mockObserver.actor.items.contents = [{
                system: { rules: [rule] },
            }];

            const result = service.applyCoverModifiers('greater', mockObserver, mockTarget);
            expect(result).toBe('lesser');
        });

        test('direction:"from" with effectTarget:"self" affects target', () => {
            const rule = {
                key: 'PF2eVisionerVisibility',
                mode: 'increase',
                steps: 2,
                direction: 'from',
                effectTarget: 'self',
            };

            mockTarget.actor.items.contents = [{
                system: { rules: [rule] },
            }];

            const result = service.applyVisibilityModifiers('observed', mockObserver, mockTarget);
            expect(result).toBe('hidden');
        });

        test('direction:"to" with effectTarget:"other" affects target', () => {
            const rule = {
                key: 'PF2eVisionerCover',
                mode: 'increase',
                steps: 1,
                direction: 'to',
                effectTarget: 'other',
            };

            mockObserver.actor.items.contents = [{
                system: { rules: [rule] },
            }];

            const result = service.applyCoverModifiers('none', mockObserver, mockTarget);
            expect(result).toBe('lesser');
        });

        test('direction:"from" with effectTarget:"other" affects observer', () => {
            const rule = {
                key: 'PF2eVisionerVisibility',
                mode: 'decrease',
                steps: 1,
                direction: 'from',
                effectTarget: 'other',
            };

            mockTarget.actor.items.contents = [{
                system: { rules: [rule] },
            }];

            const result = service.applyVisibilityModifiers('concealed', mockObserver, mockTarget);
            expect(result).toBe('observed');
        });
    });

    describe('Predicate Complexity', () => {
        test('predicate with "and" logic (array)', () => {
            const rule = {
                key: 'PF2eVisionerCover',
                mode: 'set',
                coverLevel: 'greater',
                predicate: ['item:ranged', 'distance:30'],
            };

            mockTarget.actor.items.contents = [{
                system: { rules: [rule] },
            }];

            // Both conditions true
            mockTarget.actor.getRollOptions.mockReturnValue([
                'self:target',
                'item:ranged',
                'distance:30',
            ]);

            let result = service.applyCoverModifiers('none', mockObserver, mockTarget);
            expect(result).toBe('greater');

            // One condition false
            mockTarget.actor.getRollOptions.mockReturnValue([
                'self:target',
                'item:ranged',
            ]);

            result = service.applyCoverModifiers('none', mockObserver, mockTarget);
            expect(result).toBe('none');
        });

        test('predicate with "or" logic', () => {
            const rule = {
                key: 'PF2eVisionerVisibility',
                mode: 'increase',
                steps: 1,
                predicate: [{ or: ['lighting:dim', 'lighting:darkness'] }],
            };

            mockTarget.actor.items.contents = [{
                system: { rules: [rule] },
            }];

            // First condition true
            mockTarget.actor.getRollOptions.mockReturnValue([
                'self:target',
                'lighting:dim',
            ]);

            let result = service.applyVisibilityModifiers('observed', mockObserver, mockTarget);
            expect(result).toBe('concealed');

            // Second condition true
            mockTarget.actor.getRollOptions.mockReturnValue([
                'self:target',
                'lighting:darkness',
            ]);

            result = service.applyVisibilityModifiers('observed', mockObserver, mockTarget);
            expect(result).toBe('concealed');

            // Neither true
            mockTarget.actor.getRollOptions.mockReturnValue([
                'self:target',
                'lighting:bright',
            ]);

            result = service.applyVisibilityModifiers('observed', mockObserver, mockTarget);
            expect(result).toBe('observed');
        });

        test('predicate with "not" logic', () => {
            const rule = {
                key: 'PF2eVisionerCover',
                mode: 'decrease',
                steps: 1,
                predicate: [{ not: 'target:ally' }],
            };

            mockObserver.actor.items.contents = [{
                system: { rules: [rule] },
            }];

            // Not ally (enemy)
            mockObserver.actor.getRollOptions.mockReturnValue([
                'self:observer',
            ]);

            let result = service.applyCoverModifiers('standard', mockObserver, mockTarget);
            expect(result).toBe('lesser');

            // Is ally
            mockObserver.actor.getRollOptions.mockReturnValue([
                'self:observer',
                'target:ally',
            ]);

            result = service.applyCoverModifiers('standard', mockObserver, mockTarget);
            expect(result).toBe('standard');
        });

        test('nested predicates', () => {
            const rule = {
                key: 'PF2eVisionerVisibility',
                mode: 'increase',
                steps: 2,
                predicate: [
                    'self:target',
                    {
                        or: [
                            { and: ['lighting:dim', 'terrain:forest'] },
                            { and: ['lighting:darkness', 'terrain:urban'] },
                        ],
                    },
                ],
            };

            mockTarget.actor.items.contents = [{
                system: { rules: [rule] },
            }];

            // First nested condition true
            mockTarget.actor.getRollOptions.mockReturnValue([
                'self:target',
                'lighting:dim',
                'terrain:forest',
            ]);

            let result = service.applyVisibilityModifiers('observed', mockObserver, mockTarget);
            expect(result).toBe('hidden');

            // Second nested condition true
            mockTarget.actor.getRollOptions.mockReturnValue([
                'self:target',
                'lighting:darkness',
                'terrain:urban',
            ]);

            result = service.applyVisibilityModifiers('observed', mockObserver, mockTarget);
            expect(result).toBe('hidden');

            // No nested conditions true
            mockTarget.actor.getRollOptions.mockReturnValue([
                'self:target',
                'lighting:bright',
            ]);

            result = service.applyVisibilityModifiers('observed', mockObserver, mockTarget);
            expect(result).toBe('observed');
        });
    });

    describe('Boundary Conditions', () => {
        test('cannot increase cover beyond greater', () => {
            const rule = {
                key: 'PF2eVisionerCover',
                mode: 'increase',
                steps: 10,
            };

            mockTarget.actor.items.contents = [{
                system: { rules: [rule] },
            }];

            const result = service.applyCoverModifiers('standard', mockObserver, mockTarget);
            expect(result).toBe('greater');
        });

        test('cannot decrease cover below none', () => {
            const rule = {
                key: 'PF2eVisionerCover',
                mode: 'decrease',
                steps: 10,
            };

            mockObserver.actor.items.contents = [{
                system: { rules: [rule] },
            }];

            const result = service.applyCoverModifiers('lesser', mockObserver, mockTarget);
            expect(result).toBe('none');
        });

        test('cannot increase visibility beyond undetected', () => {
            const rule = {
                key: 'PF2eVisionerVisibility',
                mode: 'increase',
                steps: 10,
            };

            mockTarget.actor.items.contents = [{
                system: { rules: [rule] },
            }];

            const result = service.applyVisibilityModifiers('hidden', mockObserver, mockTarget);
            expect(result).toBe('undetected');
        });

        test('cannot decrease visibility below observed', () => {
            const rule = {
                key: 'PF2eVisionerVisibility',
                mode: 'decrease',
                steps: 10,
            };

            mockObserver.actor.items.contents = [{
                system: { rules: [rule] },
            }];

            const result = service.applyVisibilityModifiers('concealed', mockObserver, mockTarget);
            expect(result).toBe('observed');
        });

        test('zero steps means no change', () => {
            const coverRule = {
                key: 'PF2eVisionerCover',
                mode: 'increase',
                steps: 0,
            };

            const visibilityRule = {
                key: 'PF2eVisionerVisibility',
                mode: 'increase',
                steps: 0,
            };

            mockTarget.actor.items.contents = [{
                system: { rules: [coverRule, visibilityRule] },
            }];

            const coverResult = service.applyCoverModifiers('lesser', mockObserver, mockTarget);
            const visibilityResult = service.applyVisibilityModifiers('concealed', mockObserver, mockTarget);

            expect(coverResult).toBe('lesser');
            expect(visibilityResult).toBe('concealed');
        });

        test('negative steps treated as zero', () => {
            const rule = {
                key: 'PF2eVisionerCover',
                mode: 'increase',
                steps: -5,
            };

            mockTarget.actor.items.contents = [{
                system: { rules: [rule] },
            }];

            const result = service.applyCoverModifiers('lesser', mockObserver, mockTarget);
            expect(result).toBe('lesser');
        });
    });

    describe('Complex Real-World Scenarios', () => {
        test('Sniper with Greater Cover against ranged', () => {
            // Sniper reduces enemy cover
            const sniperRule = {
                key: 'PF2eVisionerCover',
                mode: 'decrease',
                steps: 1,
                predicate: ['item:ranged'],
            };

            // Target has feat granting greater cover
            const coverFeatRule = {
                key: 'PF2eVisionerCover',
                mode: 'set',
                coverLevel: 'greater',
                predicate: ['item:ranged'],
            };

            mockObserver.actor.items.contents = [{
                system: { rules: [sniperRule] },
            }];

            mockTarget.actor.items.contents = [{
                system: { rules: [coverFeatRule] },
            }];

            mockObserver.actor.getRollOptions.mockReturnValue([
                'self:observer',
                'item:ranged',
            ]);

            mockTarget.actor.getRollOptions.mockReturnValue([
                'self:target',
                'item:ranged',
            ]);

            const result = service.applyCoverModifiers('none', mockObserver, mockTarget);
            expect(result).toBe('standard'); // Set to greater, then reduced to standard
        });

        test('Invisibility with Blur spell', () => {
            const invisibilityRule = {
                key: 'PF2eVisionerVisibility',
                mode: 'set',
                status: 'undetected',
            };

            const blurRule = {
                key: 'PF2eVisionerVisibility',
                mode: 'set',
                status: 'concealed',
                qualifyConcealment: false,
            };

            mockTarget.actor.items.contents = [
                { system: { rules: [invisibilityRule] } },
                { system: { rules: [blurRule] } },
            ];

            const result = service.applyVisibilityModifiers('observed', mockObserver, mockTarget);
            // Blur's set should override invisibility if processed second
            expect(result).toBe('concealed');
        });

        test('Darkvision in darkness with natural terrain stealth bonus', () => {
            const darkvisionRule = {
                key: 'PF2eVisionerVisibility',
                mode: 'decrease',
                steps: 2,
                predicate: ['lighting:darkness', 'sense:darkvision'],
            };

            const stealthBonusRule = {
                key: 'PF2eVisionerVisibility',
                mode: 'increase',
                steps: 1,
                predicate: ['terrain:natural'],
            };

            mockObserver.actor.items.contents = [{
                system: { rules: [darkvisionRule] },
            }];

            mockTarget.actor.items.contents = [{
                system: { rules: [stealthBonusRule] },
            }];

            mockObserver.actor.getRollOptions.mockReturnValue([
                'self:observer',
                'lighting:darkness',
                'sense:darkvision',
            ]);

            mockTarget.actor.getRollOptions.mockReturnValue([
                'self:target',
                'terrain:natural',
            ]);

            const result = service.applyVisibilityModifiers('hidden', mockObserver, mockTarget);
            // hidden + 1 (stealth) - 2 (darkvision) = concealed
            expect(result).toBe('concealed');
        });

        test('Shield Master with reactive cover', () => {
            const shieldMasterRule = {
                key: 'PF2eVisionerCover',
                mode: 'increase',
                steps: 1,
                predicate: ['item:shield'],
            };

            mockTarget.actor.items.contents = [{
                system: { rules: [shieldMasterRule] },
            }];

            mockTarget.actor.getRollOptions.mockReturnValue([
                'self:target',
                'item:shield',
            ]);

            let result = service.applyCoverModifiers('none', mockObserver, mockTarget);
            expect(result).toBe('lesser');

            result = service.applyCoverModifiers('lesser', mockObserver, mockTarget);
            expect(result).toBe('standard');

            result = service.applyCoverModifiers('standard', mockObserver, mockTarget);
            expect(result).toBe('greater');
        });

        test('Obscuring mist with displacement', () => {
            const obscuringMistRule = {
                key: 'PF2eVisionerVisibility',
                mode: 'set',
                status: 'observed',
                qualifyConcealment: true,
                predicate: ['environment:mist'],
            };

            const displacementRule = {
                key: 'PF2eVisionerVisibility',
                mode: 'set',
                status: 'concealed',
                qualifyConcealment: false,
                predicate: ['spell:displacement'],
            };

            mockTarget.actor.items.contents = [
                { system: { rules: [obscuringMistRule] } },
                { system: { rules: [displacementRule] } },
            ];

            mockTarget.actor.getRollOptions.mockReturnValue([
                'self:target',
                'environment:mist',
                'spell:displacement',
            ]);

            const result = service.applyVisibilityModifiers('observed', mockObserver, mockTarget);
            // Both predicates match; displacement's set should win
            expect(result).toBe('concealed');

            const rules = service.getVisibilityRuleElements(mockTarget);
            const hasQualify = rules.some(re => re.rule?.qualifyConcealment === true);
            const hasDisqualify = rules.some(re => re.rule?.qualifyConcealment === false);

            expect(hasQualify).toBe(true);
            expect(hasDisqualify).toBe(true);
        });
    });

    describe('Performance and Efficiency', () => {
        test('handles many rule elements efficiently', () => {
            const rules = [];
            for (let i = 0; i < 50; i++) {
                rules.push({
                    key: 'PF2eVisionerCover',
                    mode: 'increase',
                    steps: 0, // No actual change
                });
            }

            mockTarget.actor.items.contents = [{
                system: { rules },
            }];

            const start = Date.now();
            const result = service.applyCoverModifiers('standard', mockObserver, mockTarget);
            const duration = Date.now() - start;

            expect(result).toBe('standard');
            expect(duration).toBeLessThan(100); // Should be fast
        });

        test('handles deeply nested predicates', () => {
            const rule = {
                key: 'PF2eVisionerVisibility',
                mode: 'increase',
                steps: 1,
                predicate: [
                    {
                        or: [
                            {
                                and: [
                                    'lighting:dim',
                                    { or: ['terrain:forest', 'terrain:urban'] },
                                ],
                            },
                            {
                                and: [
                                    'lighting:darkness',
                                    { not: 'sense:darkvision' },
                                ],
                            },
                        ],
                    },
                ],
            };

            mockTarget.actor.items.contents = [{
                system: { rules: [rule] },
            }];

            mockTarget.actor.getRollOptions.mockReturnValue([
                'self:target',
                'lighting:dim',
                'terrain:forest',
            ]);

            const result = service.applyVisibilityModifiers('observed', mockObserver, mockTarget);
            expect(result).toBe('concealed');
        });
    });
});
