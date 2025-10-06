import { calculateVisibility } from '../../../../scripts/visibility/StatelessVisibilityCalculator.js';

describe('Lifesense Through Walls', () => {
    describe('Precise Lifesense', () => {
        test('should detect through sight-blocking wall without blinded condition', () => {
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
                        lifesense: { range: 30 }
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
            expect(result.detection.sense).toBe('lifesense');
            expect(result.detection.isPrecise).toBe(true);
        });

        test('should detect through sight-blocking wall in darkness without darkvision', () => {
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
                        lifesense: { range: 30 }
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
            expect(result.detection.sense).toBe('lifesense');
            expect(result.detection.isPrecise).toBe(true);
        });

        test('should detect invisible target through wall with precise lifesense', () => {
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
                        lifesense: { range: 30 }
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
            expect(result.detection.sense).toBe('lifesense');
            expect(result.detection.isPrecise).toBe(true);
        });

        test('should NOT detect construct through wall even with lifesense', () => {
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
                        lifesense: { range: 30 }
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

    describe('Imprecise Lifesense', () => {
        test('should detect through sight-blocking wall without blinded condition', () => {
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
                        lifesense: { range: 30 }
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
            expect(result.detection.sense).toBe('lifesense');
            expect(result.detection.isPrecise).toBe(false);
        });

        test('should detect through sight-blocking wall in darkness without darkvision', () => {
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
                        lifesense: { range: 30 }
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
            expect(result.detection.sense).toBe('lifesense');
            expect(result.detection.isPrecise).toBe(false);
        });

        test('should detect invisible target through wall with imprecise lifesense', () => {
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
                        lifesense: { range: 30 }
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
            expect(result.detection.sense).toBe('lifesense');
            expect(result.detection.isPrecise).toBe(false);
        });
    });

    describe('Lifesense with Sound Blocking', () => {
        test('should work through sound+sight-blocking wall', () => {
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
                        lifesense: { range: 30 }
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
                soundBlocked: true,
                rayDarkness: null
            };

            const result = calculateVisibility(input);

            expect(result.state).toBe('observed');
            expect(result.detection.sense).toBe('lifesense');
            expect(result.detection.isPrecise).toBe(true);
        });

        test('should work with invisible target through sound+sight-blocking wall', () => {
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
                        lifesense: { range: 30 }
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
                soundBlocked: true,
                rayDarkness: null
            };

            const result = calculateVisibility(input);

            expect(result.state).toBe('observed');
            expect(result.detection.sense).toBe('lifesense');
            expect(result.detection.isPrecise).toBe(true);
        });
    });

    describe('Lifesense Priority Over Vision', () => {
        test('should prefer precise lifesense over vision when vision is blocked by wall', () => {
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
                        vision: { range: Infinity },
                        lifesense: { range: 30 }
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
            expect(result.detection.sense).toBe('lifesense');
            expect(result.detection.isPrecise).toBe(true);
        });

        test('should prefer vision over lifesense when vision has clear LOS', () => {
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
                        vision: { range: Infinity },
                        lifesense: { range: 30 }
                    },
                    imprecise: {},
                    conditions: {
                        blinded: false,
                        deafened: false,
                        dazzled: false
                    }
                },
                hasLineOfSight: true,
                soundBlocked: false,
                rayDarkness: null
            };

            const result = calculateVisibility(input);

            // When both return observed, prefer vision (primary sense)
            expect(result.state).toBe('observed');
            expect(result.detection.sense).toBe('vision');
            expect(result.detection.isPrecise).toBe(true);
        });
    });

    describe('Undead Detection', () => {
        test('should detect undead creature with lifesense through wall', () => {
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
                        lifesense: { range: 30 }
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
            expect(result.detection.sense).toBe('lifesense');
            expect(result.detection.isPrecise).toBe(true);
        });
    });
});
