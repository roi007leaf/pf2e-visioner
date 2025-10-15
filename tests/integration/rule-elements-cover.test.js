import { ruleElementService } from '../../scripts/services/RuleElementService.js';

describe('Rule Elements - Cover Integration', () => {
    beforeEach(() => {
        ruleElementService.clearCache();
    });

    afterEach(() => {
        ruleElementService.clearCache();
    });

    describe('Cover Modifiers', () => {
        test('applies cover increase modifier', () => {
            const item = {
                system: {
                    rules: [
                        {
                            key: 'PF2eVisionerCover',
                            mode: 'increase',
                            steps: 1,
                        },
                    ],
                },
            };

            const source = {
                id: 'source1',
                actor: { uuid: 'Actor.src1', items: { contents: [item] } },
            };

            const target = {
                id: 'target1',
                actor: { uuid: 'Actor.tgt1', items: { contents: [] } },
            };

            const baseCover = 'lesser';
            const modifiedCover = ruleElementService.applyCoverModifiers(baseCover, source, target);

            expect(modifiedCover).toBe('standard');
        });

        test('applies cover decrease modifier', () => {
            const item = {
                system: {
                    rules: [
                        {
                            key: 'PF2eVisionerCover',
                            mode: 'decrease',
                            steps: 1,
                        },
                    ],
                },
            };

            const source = {
                id: 'source1',
                actor: { uuid: 'Actor.src1', items: { contents: [item] } },
            };

            const target = {
                id: 'target1',
                actor: { uuid: 'Actor.tgt1', items: { contents: [] } },
            };

            const baseCover = 'standard';
            const modifiedCover = ruleElementService.applyCoverModifiers(baseCover, source, target);

            expect(modifiedCover).toBe('lesser');
        });

        test('set mode directly sets cover level', () => {
            const item = {
                system: {
                    rules: [
                        {
                            key: 'PF2eVisionerCover',
                            mode: 'set',
                            coverLevel: 'greater',
                        },
                    ],
                },
            };

            const source = {
                id: 'source1',
                actor: { uuid: 'Actor.src1', items: { contents: [item] } },
            };

            const target = {
                id: 'target1',
                actor: { uuid: 'Actor.tgt1', items: { contents: [] } },
            };

            const baseCover = 'none';
            const modifiedCover = ruleElementService.applyCoverModifiers(baseCover, source, target);

            expect(modifiedCover).toBe('greater');
        });

        test('remove mode negates all cover', () => {
            const item = {
                system: {
                    rules: [
                        {
                            key: 'PF2eVisionerCover',
                            mode: 'remove',
                        },
                    ],
                },
            };

            const source = {
                id: 'source1',
                actor: { uuid: 'Actor.src1', items: { contents: [item] } },
            };

            const target = {
                id: 'target1',
                actor: { uuid: 'Actor.tgt1', items: { contents: [] } },
            };

            const baseCover = 'greater';
            const modifiedCover = ruleElementService.applyCoverModifiers(baseCover, source, target);

            expect(modifiedCover).toBe('none');
        });

        test('applies modifiers from both source and target', () => {
            const sourceItem = {
                system: {
                    rules: [
                        {
                            key: 'PF2eVisionerCover',
                            mode: 'increase',
                            steps: 1,
                        },
                    ],
                },
            };

            const targetItem = {
                system: {
                    rules: [
                        {
                            key: 'PF2eVisionerCover',
                            mode: 'increase',
                            steps: 1,
                        },
                    ],
                },
            };

            const source = {
                id: 'source1',
                actor: { uuid: 'Actor.src1', items: { contents: [sourceItem] } },
            };

            const target = {
                id: 'target1',
                actor: { uuid: 'Actor.tgt1', items: { contents: [targetItem] } },
            };

            const baseCover = 'none';
            const modifiedCover = ruleElementService.applyCoverModifiers(baseCover, source, target);

            expect(modifiedCover).toBe('standard');
        });
    });

    describe('Cover State Transitions', () => {
        test('none -> lesser -> standard -> greater', () => {
            const item = {
                system: {
                    rules: [
                        {
                            key: 'PF2eVisionerCover',
                            mode: 'increase',
                            steps: 1,
                        },
                    ],
                },
            };

            const source = {
                id: 'source1',
                actor: { uuid: 'Actor.src1', items: { contents: [item] } },
            };

            const target = {
                id: 'target1',
                actor: { uuid: 'Actor.tgt1', items: { contents: [] } },
            };

            let cover = 'none';
            cover = ruleElementService.applyCoverModifiers(cover, source, target);
            expect(cover).toBe('lesser');

            item.system.rules[0].steps = 2;
            ruleElementService.clearCache();
            cover = 'none';
            cover = ruleElementService.applyCoverModifiers(cover, source, target);
            expect(cover).toBe('standard');

            item.system.rules[0].steps = 3;
            ruleElementService.clearCache();
            cover = 'none';
            cover = ruleElementService.applyCoverModifiers(cover, source, target);
            expect(cover).toBe('greater');
        });

        test('greater -> standard -> lesser -> none', () => {
            const item = {
                system: {
                    rules: [
                        {
                            key: 'PF2eVisionerCover',
                            mode: 'decrease',
                            steps: 1,
                        },
                    ],
                },
            };

            const source = {
                id: 'source1',
                actor: { uuid: 'Actor.src1', items: { contents: [item] } },
            };

            const target = {
                id: 'target1',
                actor: { uuid: 'Actor.tgt1', items: { contents: [] } },
            };

            let cover = 'greater';
            cover = ruleElementService.applyCoverModifiers(cover, source, target);
            expect(cover).toBe('standard');

            item.system.rules[0].steps = 2;
            ruleElementService.clearCache();
            cover = 'greater';
            cover = ruleElementService.applyCoverModifiers(cover, source, target);
            expect(cover).toBe('lesser');

            item.system.rules[0].steps = 3;
            ruleElementService.clearCache();
            cover = 'greater';
            cover = ruleElementService.applyCoverModifiers(cover, source, target);
            expect(cover).toBe('none');
        });

        test('clamps at greater cover', () => {
            const item = {
                system: {
                    rules: [
                        {
                            key: 'PF2eVisionerCover',
                            mode: 'increase',
                            steps: 10,
                        },
                    ],
                },
            };

            const source = {
                id: 'source1',
                actor: { uuid: 'Actor.src1', items: { contents: [item] } },
            };

            const target = {
                id: 'target1',
                actor: { uuid: 'Actor.tgt1', items: { contents: [] } },
            };

            const modifiedCover = ruleElementService.applyCoverModifiers('standard', source, target);
            expect(modifiedCover).toBe('greater');
        });

        test('clamps at none cover', () => {
            const item = {
                system: {
                    rules: [
                        {
                            key: 'PF2eVisionerCover',
                            mode: 'decrease',
                            steps: 10,
                        },
                    ],
                },
            };

            const source = {
                id: 'source1',
                actor: { uuid: 'Actor.src1', items: { contents: [item] } },
            };

            const target = {
                id: 'target1',
                actor: { uuid: 'Actor.tgt1', items: { contents: [] } },
            };

            const modifiedCover = ruleElementService.applyCoverModifiers('standard', source, target);
            expect(modifiedCover).toBe('none');
        });
    });

    describe('Predicates and Conditionals', () => {
        test('only applies when predicate passes', () => {
            const item = {
                system: {
                    rules: [
                        {
                            key: 'PF2eVisionerCover',
                            mode: 'increase',
                            steps: 1,
                            predicate: ['impossible-condition'],
                        },
                    ],
                },
            };

            const source = {
                id: 'source1',
                actor: { uuid: 'Actor.src1', items: { contents: [item] } },
            };

            const target = {
                id: 'target1',
                actor: { uuid: 'Actor.tgt1', items: { contents: [] } },
            };

            const modifiedCover = ruleElementService.applyCoverModifiers('lesser', source, target);
            expect(modifiedCover).toBe('lesser');
        });

        test('respects direction property', () => {
            const item = {
                system: {
                    rules: [
                        {
                            key: 'PF2eVisionerCover',
                            mode: 'increase',
                            steps: 1,
                            direction: 'to',
                        },
                    ],
                },
            };

            const source = {
                id: 'source1',
                actor: { uuid: 'Actor.src1', items: { contents: [item] } },
            };

            const target = {
                id: 'target1',
                actor: { uuid: 'Actor.tgt1', items: { contents: [] } },
            };

            const modifiedCover = ruleElementService.applyCoverModifiers('lesser', source, target);
            expect(modifiedCover).toBe('standard');
        });
    });

    describe('Use Cases', () => {
        test('feat grants permanent standard cover', () => {
            const feat = {
                system: {
                    rules: [
                        {
                            key: 'PF2eVisionerCover',
                            mode: 'set',
                            coverLevel: 'standard',
                        },
                    ],
                },
            };

            const source = {
                id: 'source1',
                actor: { uuid: 'Actor.src1', items: { contents: [] } },
            };

            const target = {
                id: 'target1',
                actor: { uuid: 'Actor.tgt1', items: { contents: [feat] } },
            };

            const modifiedCover = ruleElementService.applyCoverModifiers('none', source, target);
            expect(modifiedCover).toBe('standard');
        });

        test('ability negates cover from specific enemies', () => {
            const ability = {
                system: {
                    rules: [
                        {
                            key: 'PF2eVisionerCover',
                            mode: 'remove',
                            predicate: ['target:enemy'],
                        },
                    ],
                },
            };

            const source = {
                id: 'source1',
                actor: { uuid: 'Actor.src1', items: { contents: [ability] } },
            };

            const target = {
                id: 'target1',
                actor: { uuid: 'Actor.tgt1', items: { contents: [] } },
            };

            const context = { customOptions: ['target:enemy'] };
            const ruleElements = ruleElementService.getCoverRuleElements(source);
            const shouldApply = ruleElementService.shouldApplyRuleElement(ruleElements[0], context);

            expect(shouldApply).toBe(true);
        });

        test('condition increases cover effectiveness', () => {
            const condition = {
                system: {
                    rules: [
                        {
                            key: 'PF2eVisionerCover',
                            mode: 'increase',
                            steps: 1,
                        },
                    ],
                },
            };

            const source = {
                id: 'source1',
                actor: { uuid: 'Actor.src1', items: { contents: [] } },
            };

            const target = {
                id: 'target1',
                actor: { uuid: 'Actor.tgt1', items: { contents: [condition] } },
            };

            const modifiedCover = ruleElementService.applyCoverModifiers('lesser', source, target);
            expect(modifiedCover).toBe('standard');
        });
    });

    describe('Edge Cases', () => {
        test('handles null/undefined tokens gracefully', () => {
            const result1 = ruleElementService.applyCoverModifiers('none', null, null);
            expect(result1).toBe('none');

            const result2 = ruleElementService.applyCoverModifiers('none', undefined, undefined);
            expect(result2).toBe('none');
        });

        test('handles tokens without actors', () => {
            const source = { id: 'source1' };
            const target = { id: 'target1' };

            const result = ruleElementService.applyCoverModifiers('none', source, target);
            expect(result).toBe('none');
        });

        test('handles malformed rule elements', () => {
            const item = {
                system: {
                    rules: [
                        {
                            key: 'PF2eVisionerCover',
                        },
                    ],
                },
            };

            const source = {
                id: 'source1',
                actor: { uuid: 'Actor.src1', items: { contents: [item] } },
            };

            const target = {
                id: 'target1',
                actor: { uuid: 'Actor.tgt1', items: { contents: [] } },
            };

            expect(() => {
                ruleElementService.applyCoverModifiers('none', source, target);
            }).not.toThrow();
        });

        test('handles invalid cover states', () => {
            const item = {
                system: {
                    rules: [
                        {
                            key: 'PF2eVisionerCover',
                            mode: 'increase',
                            steps: 1,
                        },
                    ],
                },
            };

            const source = {
                id: 'source1',
                actor: { uuid: 'Actor.src1', items: { contents: [item] } },
            };

            const target = {
                id: 'target1',
                actor: { uuid: 'Actor.tgt1', items: { contents: [] } },
            };

            const result = ruleElementService.applyCoverModifiers('invalid-cover', source, target);
            expect(result).toBe('invalid-cover');
        });
    });

    describe('Performance', () => {
        test('handles many cover checks efficiently', () => {
            const item = {
                system: {
                    rules: [
                        {
                            key: 'PF2eVisionerCover',
                            mode: 'increase',
                            steps: 1,
                        },
                    ],
                },
            };

            const source = {
                id: 'source1',
                actor: { uuid: 'Actor.src1', items: { contents: [item] } },
            };

            const target = {
                id: 'target1',
                actor: { uuid: 'Actor.tgt1', items: { contents: [] } },
            };

            const startTime = Date.now();
            for (let i = 0; i < 100; i++) {
                ruleElementService.applyCoverModifiers('lesser', source, target);
            }
            const endTime = Date.now();

            const duration = endTime - startTime;
            expect(duration).toBeLessThan(100);
        });
    });
});
