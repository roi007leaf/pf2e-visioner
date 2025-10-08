/**
 * Tests for tremorsense priority over other imprecise senses
 * 
 * This test suite verifies that tremorsense is properly prioritized over hearing,
 * ensuring it works even when the observer can hear the target.
 * 
 * Bug: Previously, tremorsense only worked when the observer was deafened or sound
 * was blocked, because the code checked senses sequentially and returned the first
 * one that worked. Since most creatures have hearing by default, hearing would
 * always detect first, preventing tremorsense from being used.
 * 
 * Fix: Refactored checkImpreciseSenses to check ALL senses and return the best one
 * based on priority: Tremorsense > Lifesense > Scent > Hearing
 */

import { calculateVisibility } from '../../../../scripts/visibility/StatelessVisibilityCalculator.js';

describe('Tremorsense Priority over Other Imprecise Senses', () => {
    describe('Tremorsense vs Hearing Priority', () => {
        test('tremorsense should be used even when hearing also works', () => {
            const input = {
                observer: {
                    precise: {},
                    imprecise: {
                        tremorsense: { range: 60 },
                        hearing: { range: Infinity }
                    },
                    conditions: {
                        blinded: false,
                        deafened: false,
                        dazzled: false
                    },
                    lightingLevel: 'bright',
                    movementAction: null
                },
                target: {
                    lightingLevel: 'bright',
                    concealment: false,
                    auxiliary: [],
                    traits: [],
                    movementAction: null
                },
                rayDarkness: null,
                soundBlocked: false,
                hasLineOfSight: true
            };

            const result = calculateVisibility(input);

            // Should detect with tremorsense (priority 1) not hearing (priority 4)
            expect(result.state).toBe('hidden');
            expect(result.detection.sense).toBe('tremorsense');
            expect(result.detection.isPrecise).toBe(false);
        });

        test('tremorsense should be used when observer is NOT deafened', () => {
            const input = {
                observer: {
                    precise: {},
                    imprecise: {
                        tremorsense: { range: 60 },
                        hearing: { range: Infinity }
                    },
                    conditions: {
                        blinded: false,
                        deafened: false, // NOT deafened
                        dazzled: false
                    },
                    lightingLevel: 'bright',
                    movementAction: null
                },
                target: {
                    lightingLevel: 'bright',
                    concealment: false,
                    auxiliary: [],
                    traits: [],
                    movementAction: null
                },
                rayDarkness: null,
                soundBlocked: false,
                hasLineOfSight: true
            };

            const result = calculateVisibility(input);

            // Tremorsense should still be used, not hearing
            expect(result.state).toBe('hidden');
            expect(result.detection.sense).toBe('tremorsense');
        });

        test('tremorsense should be used when sound is NOT blocked', () => {
            const input = {
                observer: {
                    precise: {},
                    imprecise: {
                        tremorsense: { range: 60 },
                        hearing: { range: Infinity }
                    },
                    conditions: {
                        blinded: false,
                        deafened: false,
                        dazzled: false
                    },
                    lightingLevel: 'bright',
                    movementAction: null
                },
                target: {
                    lightingLevel: 'bright',
                    concealment: false,
                    auxiliary: [],
                    traits: [],
                    movementAction: null
                },
                rayDarkness: null,
                soundBlocked: false, // Sound NOT blocked
                hasLineOfSight: true
            };

            const result = calculateVisibility(input);

            // Tremorsense should still be used, not hearing
            expect(result.state).toBe('hidden');
            expect(result.detection.sense).toBe('tremorsense');
        });

        test('hearing should be used when tremorsense fails (target flying)', () => {
            const input = {
                observer: {
                    precise: {},
                    imprecise: {
                        tremorsense: { range: 60 },
                        hearing: { range: Infinity }
                    },
                    conditions: {
                        blinded: false,
                        deafened: false,
                        dazzled: false
                    },
                    lightingLevel: 'bright',
                    movementAction: null
                },
                target: {
                    lightingLevel: 'bright',
                    concealment: false,
                    auxiliary: [],
                    traits: [],
                    movementAction: 'fly' // Target is flying
                },
                rayDarkness: null,
                soundBlocked: false,
                hasLineOfSight: true
            };

            const result = calculateVisibility(input);

            // Tremorsense fails (target flying), so hearing should be used
            expect(result.state).toBe('hidden');
            expect(result.detection.sense).toBe('hearing');
        });

        test('hearing should be used when tremorsense fails (Petal Step)', () => {
            const input = {
                observer: {
                    precise: {},
                    imprecise: {
                        tremorsense: { range: 60 },
                        hearing: { range: Infinity }
                    },
                    conditions: {
                        blinded: false,
                        deafened: false,
                        dazzled: false
                    },
                    lightingLevel: 'bright',
                    movementAction: null
                },
                target: {
                    lightingLevel: 'bright',
                    concealment: false,
                    auxiliary: ['petal-step'], // Has Petal Step feat
                    traits: [],
                    movementAction: null
                },
                rayDarkness: null,
                soundBlocked: false,
                hasLineOfSight: true
            };

            const result = calculateVisibility(input);

            // Tremorsense fails (Petal Step), so hearing should be used
            expect(result.state).toBe('hidden');
            expect(result.detection.sense).toBe('hearing');
        });

        test('hearing should be used when observer does not have tremorsense', () => {
            const input = {
                observer: {
                    precise: {},
                    imprecise: {
                        // No tremorsense
                        hearing: { range: Infinity }
                    },
                    conditions: {
                        blinded: false,
                        deafened: false,
                        dazzled: false
                    },
                    lightingLevel: 'bright',
                    movementAction: null
                },
                target: {
                    lightingLevel: 'bright',
                    concealment: false,
                    auxiliary: [],
                    traits: [],
                    movementAction: null
                },
                rayDarkness: null,
                soundBlocked: false,
                hasLineOfSight: true
            };

            const result = calculateVisibility(input);

            // Only hearing available
            expect(result.state).toBe('hidden');
            expect(result.detection.sense).toBe('hearing');
        });
    });

    describe('Lifesense vs Hearing Priority', () => {
        test('lifesense should be used even when hearing also works', () => {
            const input = {
                observer: {
                    precise: {},
                    imprecise: {
                        lifesense: { range: 60 },
                        hearing: { range: Infinity }
                    },
                    conditions: {
                        blinded: false,
                        deafened: false,
                        dazzled: false
                    },
                    lightingLevel: 'bright',
                    movementAction: null
                },
                target: {
                    lightingLevel: 'bright',
                    concealment: false,
                    auxiliary: [],
                    traits: [], // Living creature (no undead/construct traits)
                    movementAction: null
                },
                rayDarkness: null,
                soundBlocked: false,
                hasLineOfSight: true
            };

            const result = calculateVisibility(input);

            // Should detect with lifesense (priority 2) not hearing (priority 4)
            expect(result.state).toBe('hidden');
            expect(result.detection.sense).toBe('lifesense');
            expect(result.detection.isPrecise).toBe(false);
        });
    });

    describe('Scent vs Hearing Priority', () => {
        test('scent should be used even when hearing also works', () => {
            const input = {
                observer: {
                    precise: {},
                    imprecise: {
                        scent: { range: 30 },
                        hearing: { range: Infinity }
                    },
                    conditions: {
                        blinded: false,
                        deafened: false,
                        dazzled: false
                    },
                    lightingLevel: 'bright',
                    movementAction: null
                },
                target: {
                    lightingLevel: 'bright',
                    concealment: false,
                    auxiliary: [],
                    traits: [],
                    movementAction: null
                },
                rayDarkness: null,
                soundBlocked: false,
                hasLineOfSight: true
            };

            const result = calculateVisibility(input);

            // Should detect with scent (priority 3) not hearing (priority 4)
            expect(result.state).toBe('hidden');
            expect(result.detection.sense).toBe('scent');
            expect(result.detection.isPrecise).toBe(false);
        });
    });

    describe('Multiple Imprecise Senses Priority Order', () => {
        test('tremorsense > lifesense when both work', () => {
            const input = {
                observer: {
                    precise: {},
                    imprecise: {
                        tremorsense: { range: 60 },
                        lifesense: { range: 60 },
                        hearing: { range: Infinity }
                    },
                    conditions: {
                        blinded: false,
                        deafened: false,
                        dazzled: false
                    },
                    lightingLevel: 'bright',
                    movementAction: null
                },
                target: {
                    lightingLevel: 'bright',
                    concealment: false,
                    auxiliary: [],
                    traits: [], // Living creature
                    movementAction: null
                },
                rayDarkness: null,
                soundBlocked: false,
                hasLineOfSight: true
            };

            const result = calculateVisibility(input);

            // Tremorsense (priority 1) should be chosen over lifesense (priority 2)
            expect(result.state).toBe('hidden');
            expect(result.detection.sense).toBe('tremorsense');
        });

        test('tremorsense > scent when both work', () => {
            const input = {
                observer: {
                    precise: {},
                    imprecise: {
                        tremorsense: { range: 60 },
                        scent: { range: 30 },
                        hearing: { range: Infinity }
                    },
                    conditions: {
                        blinded: false,
                        deafened: false,
                        dazzled: false
                    },
                    lightingLevel: 'bright',
                    movementAction: null
                },
                target: {
                    lightingLevel: 'bright',
                    concealment: false,
                    auxiliary: [],
                    traits: [],
                    movementAction: null
                },
                rayDarkness: null,
                soundBlocked: false,
                hasLineOfSight: true
            };

            const result = calculateVisibility(input);

            // Tremorsense (priority 1) should be chosen over scent (priority 3)
            expect(result.state).toBe('hidden');
            expect(result.detection.sense).toBe('tremorsense');
        });

        test('lifesense > scent when both work', () => {
            const input = {
                observer: {
                    precise: {},
                    imprecise: {
                        lifesense: { range: 60 },
                        scent: { range: 30 },
                        hearing: { range: Infinity }
                    },
                    conditions: {
                        blinded: false,
                        deafened: false,
                        dazzled: false
                    },
                    lightingLevel: 'bright',
                    movementAction: null
                },
                target: {
                    lightingLevel: 'bright',
                    concealment: false,
                    auxiliary: [],
                    traits: [], // Living creature
                    movementAction: null
                },
                rayDarkness: null,
                soundBlocked: false,
                hasLineOfSight: true
            };

            const result = calculateVisibility(input);

            // Lifesense (priority 2) should be chosen over scent (priority 3)
            expect(result.state).toBe('hidden');
            expect(result.detection.sense).toBe('lifesense');
        });

        test('all four imprecise senses: tremorsense wins', () => {
            const input = {
                observer: {
                    precise: {},
                    imprecise: {
                        tremorsense: { range: 60 },
                        lifesense: { range: 60 },
                        scent: { range: 30 },
                        hearing: { range: Infinity }
                    },
                    conditions: {
                        blinded: false,
                        deafened: false,
                        dazzled: false
                    },
                    lightingLevel: 'bright',
                    movementAction: null
                },
                target: {
                    lightingLevel: 'bright',
                    concealment: false,
                    auxiliary: [],
                    traits: [], // Living creature
                    movementAction: null
                },
                rayDarkness: null,
                soundBlocked: false,
                hasLineOfSight: true
            };

            const result = calculateVisibility(input);

            // Tremorsense (priority 1) should win
            expect(result.state).toBe('hidden');
            expect(result.detection.sense).toBe('tremorsense');
        });
    });

    describe('Hearing Special Cases with Priority', () => {
        test('hearing returns undetected for invisible targets when tremorsense fails', () => {
            const input = {
                observer: {
                    precise: {},
                    imprecise: {
                        tremorsense: { range: 60 },
                        hearing: { range: Infinity }
                    },
                    conditions: {
                        blinded: false,
                        deafened: false,
                        dazzled: false
                    },
                    lightingLevel: 'bright',
                    movementAction: null
                },
                target: {
                    lightingLevel: 'bright',
                    concealment: false,
                    auxiliary: ['invisible'],
                    traits: [],
                    movementAction: 'fly' // Tremorsense fails
                },
                rayDarkness: null,
                soundBlocked: false,
                hasLineOfSight: true
            };

            const result = calculateVisibility(input);

            // Tremorsense fails (flying), hearing detects invisible as undetected
            expect(result.state).toBe('undetected');
            expect(result.detection).toBe(null);
        });

        test('tremorsense bypasses invisibility and is prioritized', () => {
            const input = {
                observer: {
                    precise: {},
                    imprecise: {
                        tremorsense: { range: 60 },
                        hearing: { range: Infinity }
                    },
                    conditions: {
                        blinded: false,
                        deafened: false,
                        dazzled: false
                    },
                    lightingLevel: 'bright',
                    movementAction: null
                },
                target: {
                    lightingLevel: 'bright',
                    concealment: false,
                    auxiliary: ['invisible'],
                    traits: [],
                    movementAction: null // On ground
                },
                rayDarkness: null,
                soundBlocked: false,
                hasLineOfSight: true
            };

            const result = calculateVisibility(input);

            // Tremorsense bypasses invisibility, detects at hidden (not undetected)
            expect(result.state).toBe('hidden');
            expect(result.detection.sense).toBe('tremorsense');
        });

        test('scent bypasses invisibility and is prioritized over hearing', () => {
            const input = {
                observer: {
                    precise: {},
                    imprecise: {
                        scent: { range: 30 },
                        hearing: { range: Infinity }
                    },
                    conditions: {
                        blinded: false,
                        deafened: false,
                        dazzled: false
                    },
                    lightingLevel: 'bright',
                    movementAction: null
                },
                target: {
                    lightingLevel: 'bright',
                    concealment: false,
                    auxiliary: ['invisible'],
                    traits: [],
                    movementAction: null
                },
                rayDarkness: null,
                soundBlocked: false,
                hasLineOfSight: true
            };

            const result = calculateVisibility(input);

            // Scent bypasses invisibility, detects at hidden (not undetected)
            // and is prioritized over hearing
            expect(result.state).toBe('hidden');
            expect(result.detection.sense).toBe('scent');
        });
    });

    describe('Edge Cases', () => {
        test('only hearing available and sound is blocked', () => {
            const input = {
                observer: {
                    precise: {},
                    imprecise: {
                        hearing: { range: Infinity }
                    },
                    conditions: {
                        blinded: false,
                        deafened: false,
                        dazzled: false
                    },
                    lightingLevel: 'bright',
                    movementAction: null
                },
                target: {
                    lightingLevel: 'bright',
                    concealment: false,
                    auxiliary: [],
                    traits: [],
                    movementAction: null
                },
                rayDarkness: null,
                soundBlocked: true, // Sound blocked
                hasLineOfSight: false
            };

            const result = calculateVisibility(input);

            // Hearing blocked, no other senses
            expect(result.state).toBe('undetected');
            expect(result.detection).toBe(null);
        });

        test('only hearing available and observer is deafened', () => {
            const input = {
                observer: {
                    precise: {},
                    imprecise: {
                        hearing: { range: Infinity }
                    },
                    conditions: {
                        blinded: false,
                        deafened: true, // Deafened
                        dazzled: false
                    },
                    lightingLevel: 'bright',
                    movementAction: null
                },
                target: {
                    lightingLevel: 'bright',
                    concealment: false,
                    auxiliary: [],
                    traits: [],
                    movementAction: null
                },
                rayDarkness: null,
                soundBlocked: false,
                hasLineOfSight: false
            };

            const result = calculateVisibility(input);

            // Deafened, no other senses
            expect(result.state).toBe('undetected');
            expect(result.detection).toBe(null);
        });

        test('no imprecise senses available', () => {
            const input = {
                observer: {
                    precise: {},
                    imprecise: {}, // No imprecise senses
                    conditions: {
                        blinded: false,
                        deafened: false,
                        dazzled: false
                    },
                    lightingLevel: 'bright',
                    movementAction: null
                },
                target: {
                    lightingLevel: 'bright',
                    concealment: false,
                    auxiliary: [],
                    traits: [],
                    movementAction: null
                },
                rayDarkness: null,
                soundBlocked: false,
                hasLineOfSight: false
            };

            const result = calculateVisibility(input);

            // No senses work, should be undetected
            expect(result.state).toBe('undetected');
            expect(result.detection).toBe(null);
        });
    });
});
