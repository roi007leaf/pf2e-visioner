/**
 * COMPREHENSIVE TEST - StatelessVisibilityCalculator
 * Tests all use cases using the new stateless architecture
 */

import { calculateVisibility } from '../../scripts/visibility/StatelessVisibilityCalculator.js';

describe('StatelessVisibilityCalculator - Comprehensive Coverage', () => {

    describe('Step 1: Blinded Observer Scenarios', () => {
        test('blinded observer + precise non-visual sense → observed', () => {
            const input = {
                observer: {
                    precise: { tremorsense: { range: 30 } },
                    imprecise: {},
                    conditions: { blinded: true, deafened: false, dazzled: false }
                },
                target: {
                    lightingLevel: 'bright',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: []
                }
            };

            const result = calculateVisibility(input);
            expect(result.state).toBe('observed');
        });

        test('blinded observer + imprecise sense only → hidden', () => {
            const input = {
                observer: {
                    precise: {},
                    imprecise: { scent: { range: 30 } },
                    conditions: { blinded: true, deafened: false, dazzled: false }
                },
                target: {
                    lightingLevel: 'bright',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: []
                }
            };

            const result = calculateVisibility(input);
            expect(result.state).toBe('hidden');
        });

        test('blinded observer + no senses → undetected', () => {
            const input = {
                observer: {
                    precise: {},
                    imprecise: {},
                    conditions: { blinded: true, deafened: false, dazzled: false }
                },
                target: {
                    lightingLevel: 'bright',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: []
                }
            };

            const result = calculateVisibility(input);
            expect(result.state).toBe('undetected');
        });
    });

    describe('Step 2: Invisible Target Scenarios', () => {
        test('invisible target + precise non-visual sense → observed', () => {
            const input = {
                observer: {
                    precise: { vision: { range: Infinity }, tremorsense: { range: 30 } },
                    imprecise: {},
                    conditions: { blinded: false, deafened: false, dazzled: false }
                },
                target: {
                    lightingLevel: 'bright',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: ['invisible']
                }
            };

            const result = calculateVisibility(input);
            expect(result.state).toBe('observed');
        });

        test('invisible target + imprecise sense only → undetected', () => {
            const input = {
                observer: {
                    precise: { vision: { range: Infinity } },
                    imprecise: { scent: { range: 30 } },
                    conditions: { blinded: false, deafened: false, dazzled: false }
                },
                target: {
                    lightingLevel: 'bright',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: ['invisible']
                }
            };

            const result = calculateVisibility(input);
            expect(result.state).toBe('undetected');
        });

        test('invisible target + deafened observer (no hearing) → undetected', () => {
            const input = {
                observer: {
                    precise: { vision: { range: Infinity } },
                    imprecise: { hearing: { range: 60 } },
                    conditions: { blinded: false, deafened: true, dazzled: false }
                },
                target: {
                    lightingLevel: 'bright',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: ['invisible']
                }
            };

            const result = calculateVisibility(input);
            expect(result.state).toBe('undetected');
        });
    });

    describe('Step 3: Dazzled Observer Scenarios', () => {
        test('dazzled observer + precise non-visual sense → observed', () => {
            const input = {
                observer: {
                    precise: { vision: { range: Infinity }, tremorsense: { range: 30 } },
                    imprecise: {},
                    conditions: { blinded: false, deafened: false, dazzled: true }
                },
                target: {
                    lightingLevel: 'bright',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: []
                }
            };

            const result = calculateVisibility(input);
            expect(result.state).toBe('observed');
        });

        test('dazzled observer + no precise non-visual sense → concealed', () => {
            const input = {
                observer: {
                    precise: { vision: { range: Infinity } },
                    imprecise: {},
                    conditions: { blinded: false, deafened: false, dazzled: true }
                },
                target: {
                    lightingLevel: 'bright',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: []
                }
            };

            const result = calculateVisibility(input);
            expect(result.state).toBe('concealed');
        });
    });

    describe('Step 4: Darkness and Vision', () => {
        test('normal vision in bright light → observed', () => {
            const input = {
                observer: {
                    precise: { vision: { range: Infinity } },
                    imprecise: {},
                    conditions: { blinded: false, deafened: false, dazzled: false }
                },
                target: {
                    lightingLevel: 'bright',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: []
                }
            };

            const result = calculateVisibility(input);
            expect(result.state).toBe('observed');
        });

        test('normal vision in darkness → undetected', () => {
            const input = {
                observer: {
                    precise: { vision: { range: Infinity } },
                    imprecise: {},
                    conditions: { blinded: false, deafened: false, dazzled: false }
                },
                target: {
                    lightingLevel: 'darkness',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: []
                }
            };

            const result = calculateVisibility(input);
            expect(result.state).toBe('undetected');
        });

        test('darkvision in rank 4 darkness → concealed', () => {
            const input = {
                observer: {
                    precise: { darkvision: { range: Infinity } },
                    imprecise: {},
                    conditions: { blinded: false, deafened: false, dazzled: false }
                },
                target: {
                    lightingLevel: 'greaterMagicalDarkness',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: []
                }
            };

            const result = calculateVisibility(input);
            expect(result.state).toBe('concealed');
        });

        test('greater darkvision in rank 4 darkness → observed', () => {
            const input = {
                observer: {
                    precise: { greaterDarkvision: { range: Infinity } },
                    imprecise: {},
                    conditions: { blinded: false, deafened: false, dazzled: false }
                },
                target: {
                    lightingLevel: 'greaterMagicalDarkness',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: []
                }
            };

            const result = calculateVisibility(input);
            expect(result.state).toBe('observed');
        });
    });

    describe('Step 5: Special Senses', () => {
        test('tremorsense through solid walls → observed', () => {
            const input = {
                observer: {
                    precise: { tremorsense: { range: 30 } },
                    imprecise: {},
                    conditions: { blinded: false, deafened: false, dazzled: false }
                },
                target: {
                    lightingLevel: 'darkness',
                    coverLevel: 'greater',
                    concealment: false,
                    auxiliary: []
                }
            };

            const result = calculateVisibility(input);
            expect(result.state).toBe('observed');
        });

        test('scent through walls + no sight → hidden', () => {
            const input = {
                observer: {
                    precise: {},
                    imprecise: { scent: { range: 30 } },
                    conditions: { blinded: false, deafened: false, dazzled: false }
                },
                target: {
                    lightingLevel: 'darkness',
                    coverLevel: 'greater',
                    concealment: false,
                    auxiliary: []
                }
            };

            const result = calculateVisibility(input);
            expect(result.state).toBe('hidden');
        });

        test('blindsense in darkness → observed', () => {
            const input = {
                observer: {
                    precise: { blindsense: { range: 30 } },
                    imprecise: {},
                    conditions: { blinded: false, deafened: false, dazzled: false }
                },
                target: {
                    lightingLevel: 'greaterMagicalDarkness',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: []
                }
            };

            const result = calculateVisibility(input);
            expect(result.state).toBe('observed');
        });
    });
});
