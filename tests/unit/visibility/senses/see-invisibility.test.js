/**
 * Tests for see-invisibility sense detecting invisible creatures as concealed
 */

import { calculateVisibility } from '../../../../scripts/visibility/StatelessVisibilityCalculator.js';

describe('See-Invisibility Sense', () => {
    describe('Basic see-invisibility detection', () => {
        test('observer with see-invisibility should detect invisible target as concealed', () => {
            const input = {
                observer: {
                    precise: {
                        vision: { range: Infinity },
                        'see-invisibility': { range: Infinity }
                    },
                    imprecise: {},
                    conditions: { blinded: false, deafened: false, dazzled: false }
                },
                target: {
                    lightingLevel: 'bright',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: ['invisible']
                },
                hasLineOfSight: true,
                soundBlocked: false,
                rayDarkness: null
            };

            const result = calculateVisibility(input);

            // See-invisibility detects invisible creatures as concealed (not observed)
            expect(result.state).toBe('concealed');
            expect(result.detection).toEqual({
                isPrecise: true,
                sense: 'see-invisibility'
            });
        });

        test('observer with see-invisibility should detect non-invisible target normally', () => {
            const input = {
                observer: {
                    precise: {
                        vision: { range: Infinity },
                        'see-invisibility': { range: Infinity }
                    },
                    imprecise: {},
                    conditions: { blinded: false, deafened: false, dazzled: false }
                },
                target: {
                    lightingLevel: 'bright',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: [] // NOT invisible
                },
                hasLineOfSight: true,
                soundBlocked: false,
                rayDarkness: null
            };

            const result = calculateVisibility(input);

            // Non-invisible target detected with regular vision as observed
            expect(result.state).toBe('observed');
            expect(result.detection).toEqual({
                isPrecise: true,
                sense: 'vision'
            });
        });

        test('observer without see-invisibility should not detect invisible target', () => {
            const input = {
                observer: {
                    precise: {
                        vision: { range: Infinity }
                    },
                    imprecise: {},
                    conditions: { blinded: false, deafened: false, dazzled: false }
                },
                target: {
                    lightingLevel: 'bright',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: ['invisible']
                },
                hasLineOfSight: true,
                soundBlocked: false,
                rayDarkness: null
            };

            const result = calculateVisibility(input);

            // Without see-invisibility, invisible target is undetected by vision
            expect(result.state).toBe('undetected');
            expect(result.detection).toBe(null);
        });
    });

    describe('See-invisibility with other conditions', () => {
        test('see-invisibility + invisible target + actual concealment = concealed', () => {
            const input = {
                observer: {
                    precise: {
                        vision: { range: Infinity },
                        'see-invisibility': { range: Infinity }
                    },
                    imprecise: {},
                    conditions: { blinded: false, deafened: false, dazzled: false }
                },
                target: {
                    lightingLevel: 'bright',
                    coverLevel: 'none',
                    concealment: true, // Has additional concealment
                    auxiliary: ['invisible']
                },
                hasLineOfSight: true,
                soundBlocked: false,
                rayDarkness: null
            };

            const result = calculateVisibility(input);

            // Invisible + see-invisibility = concealed (concealment doesn't stack)
            expect(result.state).toBe('concealed');
            expect(result.detection.sense).toBe('see-invisibility');
        });

        test('see-invisibility works through darkness (invisible target in darkness)', () => {
            const input = {
                observer: {
                    precise: {
                        vision: { range: Infinity },
                        'see-invisibility': { range: Infinity }
                    },
                    imprecise: {},
                    conditions: { blinded: false, deafened: false, dazzled: false }
                },
                target: {
                    lightingLevel: 'darkness',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: ['invisible']
                },
                hasLineOfSight: true,
                soundBlocked: false,
                rayDarkness: null
            };

            const result = calculateVisibility(input);

            // See-invisibility specifically counters invisibility regardless of lighting
            expect(result.state).toBe('concealed');
            expect(result.detection.sense).toBe('see-invisibility');
        });

        test('see-invisibility blocked by wall (no line of sight)', () => {
            const input = {
                observer: {
                    precise: {
                        vision: { range: Infinity },
                        'see-invisibility': { range: Infinity }
                    },
                    imprecise: {},
                    conditions: { blinded: false, deafened: false, dazzled: false }
                },
                target: {
                    lightingLevel: 'bright',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: ['invisible']
                },
                hasLineOfSight: false, // Wall blocks vision
                soundBlocked: false,
                rayDarkness: null
            };

            const result = calculateVisibility(input);

            // See-invisibility still requires line of sight
            expect(result.state).toBe('undetected');
            expect(result.detection).toBe(null);
        });

        test('blinded observer with see-invisibility cannot detect invisible target', () => {
            const input = {
                observer: {
                    precise: {
                        vision: { range: Infinity },
                        'see-invisibility': { range: Infinity }
                    },
                    imprecise: {},
                    conditions: { blinded: true, deafened: false, dazzled: false }
                },
                target: {
                    lightingLevel: 'bright',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: ['invisible']
                },
                hasLineOfSight: true,
                soundBlocked: false,
                rayDarkness: null
            };

            const result = calculateVisibility(input);

            // Blinded prevents all visual senses including see-invisibility
            expect(result.state).toBe('undetected');
            expect(result.detection).toBe(null);
        });
    });

    describe('See-invisibility with imprecise senses', () => {
        test('invisible target with see-invisibility and hearing = concealed (see-invisibility takes priority)', () => {
            const input = {
                observer: {
                    precise: {
                        vision: { range: Infinity },
                        'see-invisibility': { range: Infinity }
                    },
                    imprecise: {
                        hearing: { range: 60 }
                    },
                    conditions: { blinded: false, deafened: false, dazzled: false }
                },
                target: {
                    lightingLevel: 'bright',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: ['invisible']
                },
                hasLineOfSight: true,
                soundBlocked: false,
                rayDarkness: null
            };

            const result = calculateVisibility(input);

            // See-invisibility (precise, concealed) beats hearing (imprecise, hidden)
            expect(result.state).toBe('concealed');
            expect(result.detection.sense).toBe('see-invisibility');
            expect(result.detection.isPrecise).toBe(true);
        });
    });
});
