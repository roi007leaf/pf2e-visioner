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

        test('observer with truesight should detect invisible target as observed', () => {
            const input = {
                observer: {
                    precise: {
                        vision: { range: Infinity },
                        truesight: 60
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

            expect(result.state).toBe('observed');
            expect(result.detection).toEqual({
                isPrecise: true,
                sense: 'truesight'
            });
        });

        test('sense-invisibility detects invisible targets but not visible targets', () => {
            const observer = {
                precise: {
                    'sense-invisibility': { range: 60 }
                },
                imprecise: {},
                conditions: { blinded: true, deafened: false, dazzled: false }
            };

            const invisibleResult = calculateVisibility({
                observer,
                target: {
                    lightingLevel: 'bright',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: ['invisible']
                },
                hasLineOfSight: false,
                soundBlocked: false,
                rayDarkness: null
            });

            const visibleResult = calculateVisibility({
                observer,
                target: {
                    lightingLevel: 'bright',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: []
                },
                hasLineOfSight: false,
                soundBlocked: false,
                rayDarkness: null
            });

            expect(invisibleResult.state).toBe('observed');
            expect(invisibleResult.detection.sense).toBe('sense-invisibility');
            expect(visibleResult.state).toBe('undetected');
            expect(visibleResult.detection).toBe(null);
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

        test('blinded observer with see-all falls back to hearing for visible target', () => {
            const input = {
                observer: {
                    precise: {
                        'see-all': { range: 60 }
                    },
                    imprecise: {
                        hearing: { range: 60 }
                    },
                    conditions: { blinded: true, deafened: false, dazzled: false }
                },
                target: {
                    lightingLevel: 'bright',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: []
                },
                hasLineOfSight: true,
                soundBlocked: false,
                rayDarkness: null
            };

            const result = calculateVisibility(input);

            expect(result.state).toBe('hidden');
            expect(result.detection.sense).toBe('hearing');
        });

        test('dazzled observer with see-all treats see-all as visual', () => {
            const input = {
                observer: {
                    precise: {
                        vision: { range: Infinity },
                        'see-all': { range: 60 }
                    },
                    imprecise: {},
                    conditions: { blinded: false, deafened: false, dazzled: true }
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

            expect(result.state).toBe('concealed');
            expect(result.detection.sense).toBe('see-all');
        });

        test('infrared vision detects heat signatures in darkness', () => {
            const input = {
                observer: {
                    precise: {
                        'infrared-vision': { range: 60 }
                    },
                    imprecise: {},
                    conditions: { blinded: false, deafened: false, dazzled: false }
                },
                target: {
                    lightingLevel: 'darkness',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: []
                },
                hasLineOfSight: true,
                soundBlocked: false,
                rayDarkness: null
            };

            const result = calculateVisibility(input);

            expect(result.state).toBe('observed');
            expect(result.detection.sense).toBe('infrared-vision');
        });

        test('blinded observer with infrared vision falls back to hearing', () => {
            const input = {
                observer: {
                    precise: {
                        'infrared-vision': { range: 60 }
                    },
                    imprecise: {
                        hearing: { range: 60 }
                    },
                    conditions: { blinded: true, deafened: false, dazzled: false }
                },
                target: {
                    lightingLevel: 'darkness',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: []
                },
                hasLineOfSight: true,
                soundBlocked: false,
                rayDarkness: null
            };

            const result = calculateVisibility(input);

            expect(result.state).toBe('hidden');
            expect(result.detection.sense).toBe('hearing');
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
