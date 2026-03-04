import { calculateVisibility } from '../../../../scripts/visibility/StatelessVisibilityCalculator.js';

describe('Thoughtsense Through Walls', () => {
    describe('Precise Thoughtsense', () => {
        test('should detect normal creature through wall', () => {
            const input = {
                target: {
                    lightingLevel: 'bright',
                    concealment: false,
                    auxiliary: [],
                    traits: [],
                    movementAction: 0
                },
                observer: {
                    precise: {
                        thoughtsense: { range: 30 }
                    },
                    imprecise: {},
                    conditions: {
                        blinded: false,
                        deafened: false,
                        dazzled: false
                    }
                },
                hasLineOfSight: false,
                soundBlocked: false,
                rayDarkness: null
            };

            const result = calculateVisibility(input);

            expect(result.state).toBe('observed');
            expect(result.detection.sense).toBe('thoughtsense');
            expect(result.detection.isPrecise).toBe(true);
        });

        test('should detect normal creature through wall in darkness', () => {
            const input = {
                target: {
                    lightingLevel: 'darkness',
                    concealment: false,
                    auxiliary: [],
                    traits: [],
                    movementAction: 0
                },
                observer: {
                    precise: {
                        thoughtsense: { range: 30 }
                    },
                    imprecise: {},
                    conditions: {
                        blinded: false,
                        deafened: false,
                        dazzled: false
                    }
                },
                hasLineOfSight: false,
                soundBlocked: false,
                rayDarkness: null
            };

            const result = calculateVisibility(input);

            expect(result.state).toBe('observed');
            expect(result.detection.sense).toBe('thoughtsense');
            expect(result.detection.isPrecise).toBe(true);
        });

        test('should detect invisible normal creature through wall', () => {
            const input = {
                target: {
                    lightingLevel: 'bright',
                    concealment: false,
                    auxiliary: ['invisible'],
                    traits: [],
                    movementAction: 0
                },
                observer: {
                    precise: {
                        thoughtsense: { range: 30 }
                    },
                    imprecise: {},
                    conditions: {
                        blinded: false,
                        deafened: false,
                        dazzled: false
                    }
                },
                hasLineOfSight: false,
                soundBlocked: false,
                rayDarkness: null
            };

            const result = calculateVisibility(input);

            expect(result.state).toBe('observed');
            expect(result.detection.sense).toBe('thoughtsense');
            expect(result.detection.isPrecise).toBe(true);
        });

        test('should NOT detect mindless creature through wall', () => {
            const input = {
                target: {
                    lightingLevel: 'bright',
                    concealment: false,
                    auxiliary: [],
                    traits: ['mindless'],
                    movementAction: 0
                },
                observer: {
                    precise: {
                        thoughtsense: { range: 30 }
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
                hasLineOfSight: false,
                soundBlocked: false,
                rayDarkness: null
            };

            const result = calculateVisibility(input);

            expect(result.state).toBe('hidden');
            expect(result.detection.sense).toBe('hearing');
            expect(result.detection.isPrecise).toBe(false);
        });

        test('should NOT detect construct through wall', () => {
            const input = {
                target: {
                    lightingLevel: 'bright',
                    concealment: false,
                    auxiliary: [],
                    traits: ['construct'],
                    movementAction: 0
                },
                observer: {
                    precise: {
                        thoughtsense: { range: 30 }
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
                hasLineOfSight: false,
                soundBlocked: false,
                rayDarkness: null
            };

            const result = calculateVisibility(input);

            expect(result.state).toBe('hidden');
            expect(result.detection.sense).toBe('hearing');
            expect(result.detection.isPrecise).toBe(false);
        });

        test('should detect undead creature without mindless trait', () => {
            const input = {
                target: {
                    lightingLevel: 'darkness',
                    concealment: false,
                    auxiliary: [],
                    traits: ['undead'],
                    movementAction: 0
                },
                observer: {
                    precise: {
                        thoughtsense: { range: 30 }
                    },
                    imprecise: {},
                    conditions: {
                        blinded: false,
                        deafened: false,
                        dazzled: false
                    }
                },
                hasLineOfSight: false,
                soundBlocked: false,
                rayDarkness: null
            };

            const result = calculateVisibility(input);

            expect(result.state).toBe('observed');
            expect(result.detection.sense).toBe('thoughtsense');
            expect(result.detection.isPrecise).toBe(true);
        });

        test('should NOT detect mindless undead', () => {
            const input = {
                target: {
                    lightingLevel: 'bright',
                    concealment: false,
                    auxiliary: [],
                    traits: ['undead', 'mindless'],
                    movementAction: 0
                },
                observer: {
                    precise: {
                        thoughtsense: { range: 30 }
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
                hasLineOfSight: false,
                soundBlocked: false,
                rayDarkness: null
            };

            const result = calculateVisibility(input);

            expect(result.state).toBe('hidden');
            expect(result.detection.sense).toBe('hearing');
            expect(result.detection.isPrecise).toBe(false);
        });
    });

    describe('Imprecise Thoughtsense', () => {
        test('should detect normal creature through wall as hidden', () => {
            const input = {
                target: {
                    lightingLevel: 'bright',
                    concealment: false,
                    auxiliary: [],
                    traits: [],
                    movementAction: 0
                },
                observer: {
                    precise: {},
                    imprecise: {
                        thoughtsense: { range: 30 }
                    },
                    conditions: {
                        blinded: false,
                        deafened: false,
                        dazzled: false
                    }
                },
                hasLineOfSight: false,
                soundBlocked: false,
                rayDarkness: null
            };

            const result = calculateVisibility(input);

            expect(result.state).toBe('hidden');
            expect(result.detection.sense).toBe('thoughtsense');
            expect(result.detection.isPrecise).toBe(false);
        });

        test('should detect invisible normal creature as hidden', () => {
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
                        thoughtsense: { range: 30 }
                    },
                    conditions: {
                        blinded: false,
                        deafened: false,
                        dazzled: false
                    }
                },
                hasLineOfSight: false,
                soundBlocked: false,
                rayDarkness: null
            };

            const result = calculateVisibility(input);

            expect(result.state).toBe('hidden');
            expect(result.detection.sense).toBe('thoughtsense');
            expect(result.detection.isPrecise).toBe(false);
        });

        test('should NOT detect mindless creature', () => {
            const input = {
                target: {
                    lightingLevel: 'bright',
                    concealment: false,
                    auxiliary: [],
                    traits: ['mindless'],
                    movementAction: 0
                },
                observer: {
                    precise: {},
                    imprecise: {
                        thoughtsense: { range: 30 },
                        hearing: { range: Infinity }
                    },
                    conditions: {
                        blinded: false,
                        deafened: false,
                        dazzled: false
                    }
                },
                hasLineOfSight: false,
                soundBlocked: false,
                rayDarkness: null
            };

            const result = calculateVisibility(input);

            expect(result.state).toBe('hidden');
            expect(result.detection.sense).toBe('hearing');
        });

        test('should NOT detect construct', () => {
            const input = {
                target: {
                    lightingLevel: 'bright',
                    concealment: false,
                    auxiliary: [],
                    traits: ['construct'],
                    movementAction: 0
                },
                observer: {
                    precise: {},
                    imprecise: {
                        thoughtsense: { range: 30 },
                        hearing: { range: Infinity }
                    },
                    conditions: {
                        blinded: false,
                        deafened: false,
                        dazzled: false
                    }
                },
                hasLineOfSight: false,
                soundBlocked: false,
                rayDarkness: null
            };

            const result = calculateVisibility(input);

            expect(result.state).toBe('hidden');
            expect(result.detection.sense).toBe('hearing');
        });
    });
});
