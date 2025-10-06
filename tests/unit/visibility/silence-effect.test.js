/**
 * Tests for Silence spell effect detection
 * 
 * Verifies that:
 * - Silence effect blocks hearing and echolocation
 * - Silence effect is detected on both observer and target
 * - Sound-based senses fail when Silence is active
 */

import { calculateVisibility } from '../../../scripts/visibility/StatelessVisibilityCalculator.js';

describe('Silence Effect Detection', () => {
    describe('Hearing blocked by Silence', () => {
        it('should block hearing when observer has Silence effect', () => {
            const input = {
                target: {
                    lightingLevel: 'darkness',
                    concealment: false,
                    auxiliary: [],
                    traits: [],
                    movementAction: 0
                },
                observer: {
                    precise: {},
                    imprecise: {
                        hearing: { range: Infinity }
                    },
                    conditions: {
                        blinded: false,
                        deafened: false,
                        dazzled: false
                    }
                },
                soundBlocked: true, // Silence effect sets this to true
                hasLineOfSight: false,
                rayDarkness: null
            };

            const result = calculateVisibility(input);

            expect(result.state).toBe('undetected');
            expect(result.detection).toBeNull();
        });

        it('should block hearing when target has Silence effect', () => {
            const input = {
                target: {
                    lightingLevel: 'darkness',
                    concealment: false,
                    auxiliary: [],
                    traits: [],
                    movementAction: 0
                },
                observer: {
                    precise: {},
                    imprecise: {
                        hearing: { range: Infinity }
                    },
                    conditions: {
                        blinded: false,
                        deafened: false,
                        dazzled: false
                    }
                },
                soundBlocked: true, // Silence effect sets this to true
                hasLineOfSight: false,
                rayDarkness: null
            };

            const result = calculateVisibility(input);

            expect(result.state).toBe('undetected');
            expect(result.detection).toBeNull();
        });
    });

    describe('Echolocation blocked by Silence', () => {
        it('should block echolocation when Silence effect active', () => {
            const input = {
                target: {
                    lightingLevel: 'darkness',
                    concealment: false,
                    auxiliary: ['invisible'],
                    traits: [],
                    movementAction: 0
                },
                observer: {
                    precise: {
                        echolocation: { range: 40 }
                    },
                    imprecise: {},
                    conditions: {
                        blinded: false,
                        deafened: true, // Silence makes observer deafened for echolocation purposes
                        dazzled: false
                    }
                },
                soundBlocked: true,
                hasLineOfSight: false,
                rayDarkness: null
            };

            const result = calculateVisibility(input);

            // Echolocation fails when deafened (similar to Silence)
            expect(result.state).toBe('undetected');
            expect(result.detection).toBeNull();
        });
    });

    describe('Non-auditory senses still work with Silence', () => {
        it('should allow tremorsense even with Silence effect', () => {
            const input = {
                target: {
                    lightingLevel: 'darkness',
                    concealment: false,
                    auxiliary: [],
                    traits: [],
                    movementAction: 0 // On ground
                },
                observer: {
                    precise: {},
                    imprecise: {
                        tremorsense: { range: 30 },
                        hearing: { range: Infinity }
                    },
                    conditions: {
                        blinded: false,
                        deafened: false,
                        dazzled: false
                    },
                    movementAction: 0 // Observer on ground
                },
                soundBlocked: true, // Silence effect
                hasLineOfSight: false,
                rayDarkness: null
            };

            const result = calculateVisibility(input);

            // Tremorsense should still work (non-auditory)
            expect(result.state).toBe('hidden');
            expect(result.detection.sense).toBe('tremorsense');
            expect(result.detection.isPrecise).toBe(false);
        });

        it('should allow lifesense even with Silence effect', () => {
            const input = {
                target: {
                    lightingLevel: 'darkness',
                    concealment: false,
                    auxiliary: [],
                    traits: [], // Living creature (no undead or construct trait)
                    movementAction: 0
                },
                observer: {
                    precise: {},
                    imprecise: {
                        lifesense: { range: 30 },
                        hearing: { range: Infinity }
                    },
                    conditions: {
                        blinded: false,
                        deafened: false,
                        dazzled: false
                    }
                },
                soundBlocked: true, // Silence effect
                hasLineOfSight: false,
                rayDarkness: null
            };

            const result = calculateVisibility(input);

            // Lifesense should still work (non-auditory)
            expect(result.state).toBe('hidden');
            expect(result.detection.sense).toBe('lifesense');
            expect(result.detection.isPrecise).toBe(false);
        });

        it('should allow precise lifesense even with Silence effect', () => {
            const input = {
                target: {
                    lightingLevel: 'darkness',
                    concealment: false,
                    auxiliary: [],
                    traits: [], // Living creature
                    movementAction: 0
                },
                observer: {
                    precise: {
                        lifesense: { range: 30 } // Precise lifesense
                    },
                    imprecise: {
                        hearing: { range: Infinity }
                    },
                    conditions: {
                        blinded: false,
                        deafened: false,
                        dazzled: false
                    }
                },
                soundBlocked: true, // Silence effect
                hasLineOfSight: false,
                rayDarkness: null
            };

            const result = calculateVisibility(input);

            // Precise lifesense should work and give Observed state
            expect(result.state).toBe('observed');
            expect(result.detection.sense).toBe('lifesense');
            expect(result.detection.isPrecise).toBe(true);
        });

        it('should allow scent even with Silence effect', () => {
            const input = {
                target: {
                    lightingLevel: 'darkness',
                    concealment: false,
                    auxiliary: [],
                    traits: [],
                    movementAction: 0
                },
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
                    }
                },
                soundBlocked: true, // Silence effect
                hasLineOfSight: false,
                rayDarkness: null
            };

            const result = calculateVisibility(input);

            // Scent should still work (non-auditory)
            expect(result.state).toBe('hidden');
            expect(result.detection.sense).toBe('scent');
            expect(result.detection.isPrecise).toBe(false);
        });
    });

    describe('Silence with invisible targets', () => {
        it('should make invisible target undetected when hearing is only sense and Silence active', () => {
            const input = {
                target: {
                    lightingLevel: 'bright',
                    concealment: false,
                    auxiliary: ['invisible'],
                    traits: [],
                    movementAction: 0
                },
                observer: {
                    precise: {},
                    imprecise: {
                        hearing: { range: Infinity }
                    },
                    conditions: {
                        blinded: false,
                        deafened: false,
                        dazzled: false
                    }
                },
                soundBlocked: true, // Silence effect
                hasLineOfSight: true,
                rayDarkness: null
            };

            const result = calculateVisibility(input);

            // Vision fails (invisible), hearing fails (Silence), no other senses
            expect(result.state).toBe('undetected');
            expect(result.detection).toBeNull();
        });

        it('should detect invisible target with tremorsense even with Silence', () => {
            const input = {
                target: {
                    lightingLevel: 'bright',
                    concealment: false,
                    auxiliary: ['invisible'],
                    traits: [],
                    movementAction: 0 // On ground
                },
                observer: {
                    precise: {},
                    imprecise: {
                        hearing: { range: Infinity },
                        tremorsense: { range: 30 }
                    },
                    conditions: {
                        blinded: false,
                        deafened: false,
                        dazzled: false
                    },
                    movementAction: 0 // Observer on ground
                },
                soundBlocked: true, // Silence effect
                hasLineOfSight: true,
                rayDarkness: null
            };

            const result = calculateVisibility(input);

            // Vision fails (invisible), hearing fails (Silence), but tremorsense works
            expect(result.state).toBe('hidden');
            expect(result.detection.sense).toBe('tremorsense');
            expect(result.detection.isPrecise).toBe(false);
        });
    });
});
