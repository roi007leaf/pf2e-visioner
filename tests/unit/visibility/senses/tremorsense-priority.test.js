/**
 * Tests for imprecise-sense precedence.
 *
 * Hearing takes precedence among the imprecise senses: when the observer can hear the
 * target (not deafened, sound not blocked, target not invisible), hearing is the
 * detecting sense. Only when hearing cannot detect do we fall back to the next imprecise
 * sense, in the order Tremorsense > Lifesense > Thoughtsense > Scent.
 *
 * Invisible targets are a special case: hearing cannot detect them (it returns
 * undetected), so the invisibility-bypassing senses win for invisible targets.
 */

import { calculateVisibility } from '../../../../scripts/visibility/StatelessVisibilityCalculator.js';

describe('Tremorsense Priority over Other Imprecise Senses', () => {
    describe('Tremorsense vs Hearing Priority', () => {
        test('hearing takes precedence over tremorsense when the target is audible', () => {
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

            // Hearing (priority 0) wins over tremorsense (priority 1) when it can detect
            expect(result.state).toBe('hidden');
            expect(result.detection.sense).toBe('hearing');
            expect(result.detection.isPrecise).toBe(false);
        });

        test('tremorsense is used when the observer is deafened (hearing unavailable)', () => {
            const input = {
                observer: {
                    precise: {},
                    imprecise: {
                        tremorsense: { range: 60 },
                        hearing: { range: Infinity }
                    },
                    conditions: {
                        blinded: false,
                        deafened: true, // deafened -> hearing unavailable
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

            // Hearing unavailable (deafened) -> tremorsense is the detecting sense
            expect(result.state).toBe('hidden');
            expect(result.detection.sense).toBe('tremorsense');
        });

        test('tremorsense is used when sound is blocked (hearing unavailable)', () => {
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
                soundBlocked: true, // sound blocked -> hearing unavailable
                hasLineOfSight: true
            };

            const result = calculateVisibility(input);

            // Hearing unavailable (sound blocked) -> tremorsense is the detecting sense
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
                    precise: {
                        vision: { range: Infinity }
                    },
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
                    auxiliary: ['invisible'],
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
        test('scent is used when hearing is blocked (hearing unavailable)', () => {
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
                soundBlocked: true, // sound blocked -> hearing unavailable
                hasLineOfSight: true
            };

            const result = calculateVisibility(input);

            // Hearing unavailable (sound blocked) -> scent is the detecting sense
            expect(result.state).toBe('hidden');
            expect(result.detection.sense).toBe('scent');
            expect(result.detection.isPrecise).toBe(false);
        });

        test('hearing takes precedence over scent when the target is audible', () => {
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

            // Hearing (priority 0) wins over scent when it can detect
            expect(result.state).toBe('hidden');
            expect(result.detection.sense).toBe('hearing');
            expect(result.detection.isPrecise).toBe(false);
        });
    });

    describe('Thoughtsense vs Hearing Priority', () => {
        function thoughtsenseInput(soundBlocked) {
            return {
                observer: {
                    precise: {},
                    imprecise: {
                        thoughtsense: { range: 100 },
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
                    traits: [], // has a mind (not mindless)
                    movementAction: null
                },
                rayDarkness: null,
                soundBlocked,
                hasLineOfSight: true
            };
        }

        test('hearing takes precedence over thoughtsense when the target is audible', () => {
            const result = calculateVisibility(thoughtsenseInput(false));
            expect(result.state).toBe('hidden');
            expect(result.detection.sense).toBe('hearing');
        });

        test('thoughtsense is used when sound is blocked (hearing unavailable)', () => {
            const result = calculateVisibility(thoughtsenseInput(true));
            expect(result.state).toBe('hidden');
            expect(result.detection.sense).toBe('thoughtsense');
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
                    auxiliary: ['invisible'],
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

        test('tremorsense > scent in the fallback order when hearing is blocked', () => {
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
                soundBlocked: true, // hearing unavailable -> fall back to the next senses
                hasLineOfSight: true
            };

            const result = calculateVisibility(input);

            // Fallback order: tremorsense (priority 1) beats scent (priority 3)
            expect(result.state).toBe('hidden');
            expect(result.detection.sense).toBe('tremorsense');
        });

        test('lifesense > scent when both work', () => {
            const input = {
                observer: {
                    precise: {
                        vision: { range: Infinity }
                    },
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
                    auxiliary: ['invisible'],
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

        test('all five imprecise senses, audible target: hearing wins', () => {
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

            // Hearing (priority 0) wins over every fallback sense when it can detect
            expect(result.state).toBe('hidden');
            expect(result.detection.sense).toBe('hearing');
        });

        test('all four fallback senses, hearing blocked: tremorsense wins', () => {
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
                soundBlocked: true, // hearing unavailable -> fall back to the next senses
                hasLineOfSight: true
            };

            const result = calculateVisibility(input);

            // Fallback order: tremorsense (priority 1) wins
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
