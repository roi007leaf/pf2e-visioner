/**
 * Integration tests for MinimumVisibilityService
 * Tests end-to-end workflow with BatchProcessor and visibility maps
 */

import { MinimumVisibilityService } from '../../scripts/services/minimum-visibility-service.js';
import { getVisibilityBetween, setVisibilityBetween } from '../../scripts/stores/visibility-map.js';

describe('MinimumVisibility Integration Tests', () => {
    let service;
    let observer, target, observer2;

    beforeEach(() => {
        service = new MinimumVisibilityService();

        observer = createMockToken({
            id: 'observer-1',
            x: 100,
            y: 100,
            actor: createMockActor({
                id: 'actor-observer-1',
                type: 'character',
                itemTypes: { effect: [] }
            })
        });

        target = createMockToken({
            id: 'target-1',
            x: 300,
            y: 300,
            actor: createMockActor({
                id: 'actor-target-1',
                type: 'npc',
                itemTypes: { effect: [] }
            })
        });

        observer2 = createMockToken({
            id: 'observer-2',
            x: 500,
            y: 100,
            actor: createMockActor({
                id: 'actor-observer-2',
                type: 'character',
                itemTypes: { effect: [] }
            })
        });
    });

    describe('End-to-End Workflow', () => {
        test('should enforce minimum visibility as target in full workflow', async () => {
            // Setup: Target has "Minimum Visibility (As Target)" set to "hidden"
            target.actor.itemTypes.effect = [
                {
                    system: {
                        rules: [
                            {
                                key: 'RollOption',
                                option: 'minimum-visibility-target:hidden'
                            }
                        ]
                    }
                }
            ];

            // Simulate AVS calculating "observed"
            const calculatedState = 'observed';

            // Apply minimum visibility
            const finalState = service.applyMinimumVisibilityForPair(observer, target, calculatedState);

            // Should be enforced to "hidden"
            expect(finalState).toBe('hidden');

            // Apply to visibility map
            await setVisibilityBetween(observer, target, finalState);

            // Verify it was stored correctly
            expect(getVisibilityBetween(observer, target)).toBe('hidden');
        });

        test('should enforce minimum visibility as observer in full workflow', async () => {
            // Setup: Observer has "Minimum Visibility (As Observer)" set to "concealed"
            observer.actor.itemTypes.effect = [
                {
                    system: {
                        rules: [
                            {
                                key: 'RollOption',
                                option: 'maximum-visibility-observer:concealed'
                            }
                        ]
                    }
                }
            ];

            // Simulate AVS calculating "observed"
            const calculatedState = 'observed';

            // Apply minimum visibility
            const finalState = service.applyMinimumVisibilityForPair(observer, target, calculatedState);

            // Should be enforced to "concealed"
            expect(finalState).toBe('concealed');

            // Apply to visibility map
            await setVisibilityBetween(observer, target, finalState);

            // Verify it was stored correctly
            expect(getVisibilityBetween(observer, target)).toBe('concealed');
        });

        test('should apply both target and observer minimums (worst wins)', async () => {
            // Setup: Target has "concealed", Observer has "hidden"
            target.actor.itemTypes.effect = [
                {
                    system: {
                        rules: [
                            {
                                key: 'RollOption',
                                option: 'minimum-visibility-target:concealed'
                            }
                        ]
                    }
                }
            ];

            observer.actor.itemTypes.effect = [
                {
                    system: {
                        rules: [
                            {
                                key: 'RollOption',
                                option: 'maximum-visibility-observer:hidden'
                            }
                        ]
                    }
                }
            ];

            // Simulate AVS calculating "observed"
            const calculatedState = 'observed';

            // Apply minimum visibility
            const finalState = service.applyMinimumVisibilityForPair(observer, target, calculatedState);

            // Should be "hidden" (worst of concealed and hidden)
            expect(finalState).toBe('hidden');

            // Apply to visibility map
            await setVisibilityBetween(observer, target, finalState);

            // Verify
            expect(getVisibilityBetween(observer, target)).toBe('hidden');
        });

        test('should not improve already-worse calculated states', async () => {
            // Setup: Target has minimum of "concealed"
            target.actor.itemTypes.effect = [
                {
                    system: {
                        rules: [
                            {
                                key: 'RollOption',
                                option: 'minimum-visibility-target:concealed'
                            }
                        ]
                    }
                }
            ];

            // Simulate AVS calculating "undetected" (worse than minimum)
            const calculatedState = 'undetected';

            // Apply minimum visibility
            const finalState = service.applyMinimumVisibilityForPair(observer, target, calculatedState);

            // Should keep "undetected" (don't improve it)
            expect(finalState).toBe('undetected');

            await setVisibilityBetween(observer, target, finalState);
            expect(getVisibilityBetween(observer, target)).toBe('undetected');
        });

        test('should handle no minimum set (pass through calculated)', async () => {
            // Setup: No effects on either token
            observer.actor.itemTypes.effect = [];
            target.actor.itemTypes.effect = [];

            // Test all states pass through unchanged
            const states = ['observed', 'concealed', 'hidden', 'undetected'];

            for (const state of states) {
                const finalState = service.applyMinimumVisibilityForPair(observer, target, state);
                expect(finalState).toBe(state);
            }
        });
    });

    describe('Multiple Observer Scenarios', () => {
        test('should enforce different minimums for different observers', async () => {
            // Setup: Target has "hidden" minimum
            target.actor.itemTypes.effect = [
                {
                    system: {
                        rules: [
                            {
                                key: 'RollOption',
                                option: 'minimum-visibility-target:hidden'
                            }
                        ]
                    }
                }
            ];

            // Observer 1 has "concealed" minimum
            observer.actor.itemTypes.effect = [
                {
                    system: {
                        rules: [
                            {
                                key: 'RollOption',
                                option: 'maximum-visibility-observer:concealed'
                            }
                        ]
                    }
                }
            ];

            // Observer 2 has no minimum
            observer2.actor.itemTypes.effect = [];

            // Observer 1 sees target: hidden (worst of target's hidden and observer's concealed)
            const state1 = service.applyMinimumVisibilityForPair(observer, target, 'observed');
            expect(state1).toBe('hidden');

            // Observer 2 sees target: hidden (only target's minimum applies)
            const state2 = service.applyMinimumVisibilityForPair(observer2, target, 'observed');
            expect(state2).toBe('hidden');

            // Apply to maps
            await setVisibilityBetween(observer, target, state1);
            await setVisibilityBetween(observer2, target, state2);

            // Verify independence
            expect(getVisibilityBetween(observer, target)).toBe('hidden');
            expect(getVisibilityBetween(observer2, target)).toBe('hidden');
        });

        test('should handle observer-specific minimums affecting all targets', async () => {
            // Setup: Observer has "undetected" minimum (sees everything as at least undetected)
            observer.actor.itemTypes.effect = [
                {
                    system: {
                        rules: [
                            {
                                key: 'RollOption',
                                option: 'maximum-visibility-observer:undetected'
                            }
                        ]
                    }
                }
            ];

            // Create multiple targets with no minimums
            const targets = [target, observer2];

            // All targets should appear as "undetected" to this observer
            for (const t of targets) {
                const state = service.applyMinimumVisibilityForPair(observer, t, 'observed');
                expect(state).toBe('undetected');
            }
        });
    });

    describe('Precedence with Manual Overrides', () => {
        test('should document that manual overrides bypass minimum (tested in BatchProcessor)', async () => {
            // Note: This is tested at the BatchProcessor level
            // Manual overrides are applied BEFORE minimum visibility enforcement
            // So minimum visibility never sees or affects manual overrides

            // Setup for documentation purposes
            target.actor.itemTypes.effect = [
                {
                    system: {
                        rules: [
                            {
                                key: 'RollOption',
                                option: 'minimum-visibility-target:undetected'
                            }
                        ]
                    }
                }
            ];

            // If there's a manual override to "observed", BatchProcessor uses it directly
            // Minimum visibility is never checked when an override exists

            // This test confirms the service works correctly when called
            const calculated = 'observed';
            const withMinimum = service.applyMinimumVisibilityForPair(observer, target, calculated);
            expect(withMinimum).toBe('undetected');

            // In real usage, BatchProcessor would skip calling this service if override exists
        });
    });

    describe('State Transitions', () => {
        test('should handle visibility state changes over time', async () => {
            // Initial state: Target has "concealed" minimum
            target.actor.itemTypes.effect = [
                {
                    system: {
                        rules: [
                            {
                                key: 'RollOption',
                                option: 'minimum-visibility-target:concealed'
                            }
                        ]
                    }
                }
            ];

            // Time 1: AVS calculates "observed"
            let state = service.applyMinimumVisibilityForPair(observer, target, 'observed');
            expect(state).toBe('concealed');
            await setVisibilityBetween(observer, target, state);

            // Time 2: Effect upgraded to "hidden"
            target.actor.itemTypes.effect = [
                {
                    system: {
                        rules: [
                            {
                                key: 'RollOption',
                                option: 'minimum-visibility-target:hidden'
                            }
                        ]
                    }
                }
            ];

            state = service.applyMinimumVisibilityForPair(observer, target, 'observed');
            expect(state).toBe('hidden');
            await setVisibilityBetween(observer, target, state);

            // Time 3: Effect removed
            target.actor.itemTypes.effect = [];

            state = service.applyMinimumVisibilityForPair(observer, target, 'observed');
            expect(state).toBe('observed');
            await setVisibilityBetween(observer, target, state);

            // Verify final state
            expect(getVisibilityBetween(observer, target)).toBe('observed');
        });
    });

    describe('Complex Scenarios', () => {
        test('should handle invisibility + minimum visibility combination', async () => {
            // Scenario: Invisible creature (normally concealed in darkness)
            // with minimum visibility of "undetected"

            target.actor.itemTypes.effect = [
                {
                    system: {
                        rules: [
                            {
                                key: 'RollOption',
                                option: 'minimum-visibility-target:undetected'
                            }
                        ]
                    }
                }
            ];

            // AVS might calculate "concealed" due to invisibility
            const avsCalculated = 'concealed';

            // Minimum visibility enforces "undetected"
            const final = service.applyMinimumVisibilityForPair(observer, target, avsCalculated);
            expect(final).toBe('undetected');

            await setVisibilityBetween(observer, target, final);
            expect(getVisibilityBetween(observer, target)).toBe('undetected');
        });

        test('should handle blinded observer scenario', async () => {
            // Blinded observer with minimum visibility (As Observer) of "hidden"
            // This makes them see everything as at least hidden

            observer.actor.itemTypes.effect = [
                {
                    system: {
                        rules: [
                            {
                                key: 'RollOption',
                                option: 'maximum-visibility-observer:hidden'
                            }
                        ]
                    }
                }
            ];

            // Even if AVS says "observed" (unlikely for blinded), minimum enforces "hidden"
            const state = service.applyMinimumVisibilityForPair(observer, target, 'observed');
            expect(state).toBe('hidden');

            await setVisibilityBetween(observer, target, state);
            expect(getVisibilityBetween(observer, target)).toBe('hidden');
        });

        test('should handle stacking multiple effects of same type', async () => {
            // If token somehow has multiple minimum visibility effects, first one wins
            target.actor.itemTypes.effect = [
                {
                    system: {
                        rules: [
                            {
                                key: 'RollOption',
                                option: 'minimum-visibility-target:concealed'
                            }
                        ]
                    }
                },
                {
                    system: {
                        rules: [
                            {
                                key: 'RollOption',
                                option: 'minimum-visibility-target:hidden'
                            }
                        ]
                    }
                }
            ];

            // Service returns first match (concealed)
            const minimum = service.getMinimumVisibilityAsTarget(target);
            expect(minimum).toBe('concealed');

            const state = service.applyMinimumVisibilityForPair(observer, target, 'observed');
            expect(state).toBe('concealed');
        });
    });

    describe('Error Resilience', () => {
        test('should handle tokens with malformed effect data gracefully', async () => {
            // Malformed effect structure
            target.actor.itemTypes.effect = [
                {
                    // Missing system property
                }
            ];

            // Should not throw and should return null
            expect(() => service.getMinimumVisibilityAsTarget(target)).not.toThrow();
            expect(service.getMinimumVisibilityAsTarget(target)).toBe(null);

            // Should pass through calculated state
            const state = service.applyMinimumVisibilityForPair(observer, target, 'concealed');
            expect(state).toBe('concealed');
        });

        test('should handle null/undefined tokens gracefully', async () => {
            expect(() => service.applyMinimumVisibilityForPair(null, target, 'observed')).not.toThrow();
            expect(() => service.applyMinimumVisibilityForPair(observer, null, 'observed')).not.toThrow();
            expect(() => service.applyMinimumVisibilityForPair(undefined, undefined, 'observed')).not.toThrow();
        });

        test('should handle missing actor data gracefully', async () => {
            const tokenNoActor = createMockToken({
                id: 'no-actor',
                x: 100,
                y: 100,
                actor: null
            });

            expect(() => service.getMinimumVisibilityAsTarget(tokenNoActor)).not.toThrow();
            expect(service.getMinimumVisibilityAsTarget(tokenNoActor)).toBe(null);

            const state = service.applyMinimumVisibilityForPair(observer, tokenNoActor, 'hidden');
            expect(state).toBe('hidden');
        });
    });

    describe('Performance and Batch Processing', () => {
        test('should efficiently handle multiple token pairs in batch', async () => {
            // Create multiple observers and targets
            const observers = [];
            const targets = [];

            for (let i = 0; i < 5; i++) {
                observers.push(createMockToken({
                    id: `observer-${i}`,
                    x: 100 * i,
                    y: 100,
                    actor: createMockActor({
                        id: `actor-obs-${i}`,
                        type: 'character',
                        itemTypes: {
                            effect: [
                                {
                                    system: {
                                        rules: [
                                            {
                                                key: 'RollOption',
                                                option: 'maximum-visibility-observer:concealed'
                                            }
                                        ]
                                    }
                                }
                            ]
                        }
                    })
                }));

                targets.push(createMockToken({
                    id: `target-${i}`,
                    x: 300 + 100 * i,
                    y: 300,
                    actor: createMockActor({
                        id: `actor-tgt-${i}`,
                        type: 'npc',
                        itemTypes: {
                            effect: [
                                {
                                    system: {
                                        rules: [
                                            {
                                                key: 'RollOption',
                                                option: 'minimum-visibility-target:hidden'
                                            }
                                        ]
                                    }
                                }
                            ]
                        }
                    })
                }));
            }

            // Process all pairs
            const startTime = Date.now();

            for (const obs of observers) {
                for (const tgt of targets) {
                    const state = service.applyMinimumVisibilityForPair(obs, tgt, 'observed');
                    await setVisibilityBetween(obs, tgt, state);
                    expect(state).toBe('hidden'); // Worst of concealed and hidden
                }
            }

            const endTime = Date.now();
            const duration = endTime - startTime;

            // Should complete quickly (adjust threshold as needed)
            expect(duration).toBeLessThan(1000); // 1 second for 25 pairs
        });
    });
});
