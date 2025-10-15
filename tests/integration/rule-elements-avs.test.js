import { ruleElementService } from '../../scripts/services/RuleElementService.js';

describe('Rule Elements - AVS Integration', () => {
    beforeEach(() => {
        ruleElementService.clearCache();
    });

    afterEach(() => {
        ruleElementService.clearCache();
    });

    describe('Visibility Modifiers in Batch Processing', () => {
        test('applies visibility increase modifier', () => {
            const item = {
                system: {
                    rules: [
                        {
                            key: 'PF2eVisionerVisibility',
                            mode: 'increase',
                            steps: 1,
                        },
                    ],
                },
            };

            const observer = {
                id: 'observer1',
                actor: { uuid: 'Actor.obs1', items: { contents: [item] } },
            };

            const target = {
                id: 'target1',
                actor: { uuid: 'Actor.tgt1', items: { contents: [] } },
            };

            const baseVisibility = 'observed';
            const modifiedVisibility = ruleElementService.applyVisibilityModifiers(
                baseVisibility,
                observer,
                target
            );

            expect(modifiedVisibility).toBe('concealed');
        });

        test('applies multiple modifiers from both observer and target', () => {
            const observerItem = {
                system: {
                    rules: [
                        {
                            key: 'PF2eVisionerVisibility',
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
                            key: 'PF2eVisionerVisibility',
                            mode: 'increase',
                            steps: 1,
                        },
                    ],
                },
            };

            const observer = {
                id: 'observer1',
                actor: { uuid: 'Actor.obs1', items: { contents: [observerItem] } },
            };

            const target = {
                id: 'target1',
                actor: { uuid: 'Actor.tgt1', items: { contents: [targetItem] } },
            };

            const baseVisibility = 'observed';
            const modifiedVisibility = ruleElementService.applyVisibilityModifiers(
                baseVisibility,
                observer,
                target
            );

            expect(modifiedVisibility).toBe('hidden');
        });

        test('set modifier overrides base visibility', () => {
            const item = {
                system: {
                    rules: [
                        {
                            key: 'PF2eVisionerVisibility',
                            mode: 'set',
                            status: 'undetected',
                        },
                    ],
                },
            };

            const observer = {
                id: 'observer1',
                actor: { uuid: 'Actor.obs1', items: { contents: [item] } },
            };

            const target = {
                id: 'target1',
                actor: { uuid: 'Actor.tgt1', items: { contents: [] } },
            };

            const baseVisibility = 'observed';
            const modifiedVisibility = ruleElementService.applyVisibilityModifiers(
                baseVisibility,
                observer,
                target
            );

            expect(modifiedVisibility).toBe('undetected');
        });

        test('respects direction property', () => {
            const item = {
                system: {
                    rules: [
                        {
                            key: 'PF2eVisionerVisibility',
                            mode: 'increase',
                            steps: 1,
                            direction: 'to',
                        },
                    ],
                },
            };

            const observer = {
                id: 'observer1',
                actor: { uuid: 'Actor.obs1', items: { contents: [item] } },
            };

            const target = {
                id: 'target1',
                actor: { uuid: 'Actor.tgt1', items: { contents: [] } },
            };

            const baseVisibility = 'observed';
            const modifiedVisibility = ruleElementService.applyVisibilityModifiers(
                baseVisibility,
                observer,
                target
            );

            expect(modifiedVisibility).toBe('concealed');
        });

        test('only applies when predicate passes', () => {
            const item = {
                system: {
                    rules: [
                        {
                            key: 'PF2eVisionerVisibility',
                            mode: 'increase',
                            steps: 1,
                            predicate: ['impossible-condition'],
                        },
                    ],
                },
            };

            const observer = {
                id: 'observer1',
                actor: { uuid: 'Actor.obs1', items: { contents: [item] } },
            };

            const target = {
                id: 'target1',
                actor: { uuid: 'Actor.tgt1', items: { contents: [] } },
            };

            const baseVisibility = 'observed';
            const modifiedVisibility = ruleElementService.applyVisibilityModifiers(
                baseVisibility,
                observer,
                target
            );

            expect(modifiedVisibility).toBe('observed');
        });
    });

    describe('Visibility State Transitions', () => {
        test('observed -> concealed -> hidden -> undetected', () => {
            const item = {
                system: {
                    rules: [
                        {
                            key: 'PF2eVisionerVisibility',
                            mode: 'increase',
                            steps: 1,
                        },
                    ],
                },
            };

            const observer = {
                id: 'observer1',
                actor: { uuid: 'Actor.obs1', items: { contents: [item] } },
            };

            const target = {
                id: 'target1',
                actor: { uuid: 'Actor.tgt1', items: { contents: [] } },
            };

            let visibility = 'observed';
            visibility = ruleElementService.applyVisibilityModifiers(visibility, observer, target);
            expect(visibility).toBe('concealed');

            item.system.rules[0].steps = 2;
            ruleElementService.clearCache();
            visibility = 'observed';
            visibility = ruleElementService.applyVisibilityModifiers(visibility, observer, target);
            expect(visibility).toBe('hidden');

            item.system.rules[0].steps = 3;
            ruleElementService.clearCache();
            visibility = 'observed';
            visibility = ruleElementService.applyVisibilityModifiers(visibility, observer, target);
            expect(visibility).toBe('undetected');
        });

        test('undetected -> hidden -> concealed -> observed', () => {
            const item = {
                system: {
                    rules: [
                        {
                            key: 'PF2eVisionerVisibility',
                            mode: 'decrease',
                            steps: 1,
                        },
                    ],
                },
            };

            const observer = {
                id: 'observer1',
                actor: { uuid: 'Actor.obs1', items: { contents: [item] } },
            };

            const target = {
                id: 'target1',
                actor: { uuid: 'Actor.tgt1', items: { contents: [] } },
            };

            let visibility = 'undetected';
            visibility = ruleElementService.applyVisibilityModifiers(visibility, observer, target);
            expect(visibility).toBe('hidden');

            item.system.rules[0].steps = 2;
            ruleElementService.clearCache();
            visibility = 'undetected';
            visibility = ruleElementService.applyVisibilityModifiers(visibility, observer, target);
            expect(visibility).toBe('concealed');

            item.system.rules[0].steps = 3;
            ruleElementService.clearCache();
            visibility = 'undetected';
            visibility = ruleElementService.applyVisibilityModifiers(visibility, observer, target);
            expect(visibility).toBe('observed');
        });
    });

    describe('Performance and Caching', () => {
        test('uses cached rule elements on repeated calls', () => {
            const item = {
                system: {
                    rules: [
                        {
                            key: 'PF2eVisionerVisibility',
                            mode: 'increase',
                            steps: 1,
                        },
                    ],
                },
            };

            const observer = {
                id: 'observer1',
                actor: { uuid: 'Actor.obs1', items: { contents: [item] } },
            };

            const target = {
                id: 'target1',
                actor: { uuid: 'Actor.tgt1', items: { contents: [] } },
            };

            const startTime = Date.now();
            for (let i = 0; i < 100; i++) {
                ruleElementService.applyVisibilityModifiers('observed', observer, target);
            }
            const endTime = Date.now();

            const duration = endTime - startTime;
            expect(duration).toBeLessThan(100);
        });

        test('handles tokens with no rule elements efficiently', () => {
            const observer = {
                id: 'observer1',
                actor: { uuid: 'Actor.obs1', items: { contents: [] } },
            };

            const target = {
                id: 'target1',
                actor: { uuid: 'Actor.tgt1', items: { contents: [] } },
            };

            const startTime = Date.now();
            for (let i = 0; i < 100; i++) {
                ruleElementService.applyVisibilityModifiers('observed', observer, target);
            }
            const endTime = Date.now();

            const duration = endTime - startTime;
            expect(duration).toBeLessThan(50);
        });
    });

    describe('Edge Cases', () => {
        test('handles null/undefined tokens gracefully', () => {
            const result1 = ruleElementService.applyVisibilityModifiers('observed', null, null);
            expect(result1).toBe('observed');

            const result2 = ruleElementService.applyVisibilityModifiers('observed', undefined, undefined);
            expect(result2).toBe('observed');
        });

        test('handles tokens without actors', () => {
            const observer = { id: 'observer1' };
            const target = { id: 'target1' };

            const result = ruleElementService.applyVisibilityModifiers('observed', observer, target);
            expect(result).toBe('observed');
        });

        test('handles malformed rule elements', () => {
            const item = {
                system: {
                    rules: [
                        {
                            key: 'PF2eVisionerVisibility',
                        },
                    ],
                },
            };

            const observer = {
                id: 'observer1',
                actor: { uuid: 'Actor.obs1', items: { contents: [item] } },
            };

            const target = {
                id: 'target1',
                actor: { uuid: 'Actor.tgt1', items: { contents: [] } },
            };

            expect(() => {
                ruleElementService.applyVisibilityModifiers('observed', observer, target);
            }).not.toThrow();
        });

        test('handles invalid visibility states', () => {
            const item = {
                system: {
                    rules: [
                        {
                            key: 'PF2eVisionerVisibility',
                            mode: 'increase',
                            steps: 1,
                        },
                    ],
                },
            };

            const observer = {
                id: 'observer1',
                actor: { uuid: 'Actor.obs1', items: { contents: [item] } },
            };

            const target = {
                id: 'target1',
                actor: { uuid: 'Actor.tgt1', items: { contents: [] } },
            };

            const result = ruleElementService.applyVisibilityModifiers(
                'invalid-state',
                observer,
                target
            );
            expect(result).toBe('invalid-state');
        });
    });
});
