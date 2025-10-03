import '../setup.js';

describe('Dazzled Condition - Correct Implementation', () => {
    const { calculateVisibility } = require('../../scripts/visibility/StatelessVisibilityCalculator.js');

    describe('Dazzled with vision as ONLY precise sense', () => {
        test('dazzled observer with only vision sees target as concealed in bright light', () => {
            const input = {
                target: {
                    lightingLevel: 'bright',
                    concealment: false,
                    auxiliary: [],
                },
                observer: {
                    precise: { vision: { range: Infinity } },
                    imprecise: {},
                    conditions: { blinded: false, deafened: false, dazzled: true },
                },
                hasLineOfSight: true,
            };

            const result = calculateVisibility(input);
            expect(result.state).toBe('concealed');
            expect(result.detection.sense).toBe('vision');
        });

        test('dazzled observer with only darkvision sees target as concealed in bright light', () => {
            const input = {
                target: {
                    lightingLevel: 'bright',
                    concealment: false,
                    auxiliary: [],
                },
                observer: {
                    precise: { darkvision: { range: Infinity } },
                    imprecise: {},
                    conditions: { blinded: false, deafened: false, dazzled: true },
                },
                hasLineOfSight: true,
            };

            const result = calculateVisibility(input);
            expect(result.state).toBe('concealed');
            expect(result.detection.sense).toBe('darkvision');
        });

        test('dazzled observer with only low-light vision sees target as concealed in dim light', () => {
            const input = {
                target: {
                    lightingLevel: 'dim',
                    concealment: false,
                    auxiliary: [],
                },
                observer: {
                    precise: { lowLightVision: { range: Infinity } },
                    imprecise: {},
                    conditions: { blinded: false, deafened: false, dazzled: true },
                },
                hasLineOfSight: true,
            };

            const result = calculateVisibility(input);
            expect(result.state).toBe('concealed');
            expect(result.detection.sense).toBe('lowLightVision');
        });
    });

    describe('Dazzled with precise NON-visual senses', () => {
        test('dazzled observer with precise thoughtsense sees target as OBSERVED (not concealed)', () => {
            const input = {
                target: {
                    lightingLevel: 'bright',
                    concealment: false,
                    auxiliary: [],
                },
                observer: {
                    precise: {
                        vision: { range: Infinity },
                        thoughtsense: { range: 60 }, // Precise non-visual sense
                    },
                    imprecise: {},
                    conditions: { blinded: false, deafened: false, dazzled: true },
                },
                hasLineOfSight: true,
            };

            const result = calculateVisibility(input);
            // With thoughtsense (precise non-visual), dazzled should NOT apply
            expect(result.state).toBe('observed');
            expect(result.detection.sense).toBe('thoughtsense');
        });

        test('dazzled observer with precise echolocation sees target as OBSERVED (not concealed)', () => {
            const input = {
                target: {
                    lightingLevel: 'bright',
                    concealment: false,
                    auxiliary: [],
                },
                observer: {
                    precise: {
                        darkvision: { range: Infinity },
                        echolocation: { range: 30 }, // Precise non-visual sense
                    },
                    imprecise: {},
                    conditions: { blinded: false, deafened: false, dazzled: true },
                },
                hasLineOfSight: true,
            };

            const result = calculateVisibility(input);
            // With echolocation (precise non-visual), dazzled should NOT apply
            expect(result.state).toBe('observed');
            expect(result.detection.sense).toBe('echolocation');
        });

        test('dazzled observer with precise lifesense sees living target as OBSERVED (not concealed)', () => {
            const input = {
                target: {
                    lightingLevel: 'bright',
                    concealment: false,
                    auxiliary: [],
                    traits: [], // Living creature (no undead/construct traits)
                },
                observer: {
                    precise: {
                        vision: { range: Infinity },
                        lifesense: { range: 60 }, // Precise non-visual sense
                    },
                    imprecise: {},
                    conditions: { blinded: false, deafened: false, dazzled: true },
                },
                hasLineOfSight: true,
            };

            const result = calculateVisibility(input);
            // With precise lifesense, dazzled should NOT apply
            expect(result.state).toBe('observed');
            expect(result.detection.sense).toBe('lifesense');
        });

        test('dazzled observer with precise scent sees target as OBSERVED via visual sense when using vision', () => {
            const input = {
                target: {
                    lightingLevel: 'bright',
                    concealment: false,
                    auxiliary: [],
                },
                observer: {
                    precise: {
                        vision: { range: Infinity },
                        scent: { range: 30 }, // Precise non-visual sense (rare but possible)
                    },
                    imprecise: {},
                    conditions: { blinded: false, deafened: false, dazzled: true },
                },
                hasLineOfSight: true,
            };

            const result = calculateVisibility(input);
            // With precise scent (non-visual), dazzled should NOT apply even when using vision
            // Because vision is NOT the ONLY precise sense
            expect(result.state).toBe('observed');
            expect(result.detection.sense).toBe('scent');
        });
    });

    describe('Dazzled with IMPRECISE non-visual senses only', () => {
        test('dazzled observer with only imprecise hearing still has concealed from visual detection', () => {
            const input = {
                target: {
                    lightingLevel: 'bright',
                    concealment: false,
                    auxiliary: [],
                },
                observer: {
                    precise: { vision: { range: Infinity } },
                    imprecise: { hearing: { range: 60 } }, // Imprecise, not precise
                    conditions: { blinded: false, deafened: false, dazzled: true },
                },
                hasLineOfSight: true,
            };

            const result = calculateVisibility(input);
            // Imprecise senses don't count - vision is still the only PRECISE sense
            expect(result.state).toBe('concealed');
            expect(result.detection.sense).toBe('vision');
        });

        test('dazzled observer with only imprecise tremorsense still has concealed from visual detection', () => {
            const input = {
                target: {
                    lightingLevel: 'bright',
                    concealment: false,
                    auxiliary: [],
                    movementAction: 0, // On ground
                },
                observer: {
                    precise: { darkvision: { range: Infinity } },
                    imprecise: { tremorsense: { range: 60 } }, // Imprecise, not precise
                    conditions: { blinded: false, deafened: false, dazzled: true },
                    movementAction: 0, // On ground
                },
                hasLineOfSight: true,
            };

            const result = calculateVisibility(input);
            // Imprecise senses don't count - darkvision is still the only PRECISE sense
            expect(result.state).toBe('concealed');
            expect(result.detection.sense).toBe('darkvision');
        });
    });

    describe('Edge cases', () => {
        test('dazzled observer with NO visual sense but precise thoughtsense sees OBSERVED', () => {
            const input = {
                target: {
                    lightingLevel: 'bright',
                    concealment: false,
                    auxiliary: [],
                },
                observer: {
                    precise: {
                        thoughtsense: { range: 60 }, // Only precise sense, non-visual
                    },
                    imprecise: {},
                    conditions: { blinded: false, deafened: false, dazzled: true },
                },
                hasLineOfSight: true,
            };

            const result = calculateVisibility(input);
            // Thoughtsense is not affected by dazzled
            expect(result.state).toBe('observed');
            expect(result.detection.sense).toBe('thoughtsense');
        });

        test('not dazzled observer with only vision sees OBSERVED', () => {
            const input = {
                target: {
                    lightingLevel: 'bright',
                    concealment: false,
                    auxiliary: [],
                },
                observer: {
                    precise: { vision: { range: Infinity } },
                    imprecise: {},
                    conditions: { blinded: false, deafened: false, dazzled: false },
                },
                hasLineOfSight: true,
            };

            const result = calculateVisibility(input);
            expect(result.state).toBe('observed');
            expect(result.detection.sense).toBe('vision');
        });
    });
});
