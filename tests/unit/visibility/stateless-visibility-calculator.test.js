/**
 * Tests for StatelessVisibilityCalculator
 * 
 * Tests the pure function-based visibility calculator with standardized JSON inputs
 */

import { describe, expect, test } from '@jest/globals';
import { calculateVisibility } from '../../../scripts/visibility/StatelessVisibilityCalculator.js';

describe('StatelessVisibilityCalculator', () => {

    describe('Basic visibility with normal vision', () => {
        test('bright light + normal vision = observed', () => {
            const input = {
                target: {
                    lightingLevel: 'bright',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: []
                },
                observer: {
                    precise: {
                        vision: { range: Infinity }
                    },
                    imprecise: {},
                    conditions: {}
                }
            };

            const result = calculateVisibility(input);
            expect(result.state).toBe('observed');
            expect(result.detection).toEqual({
                isPrecise: true,
                sense: 'vision'
            });
        });

        test('dim light + normal vision = concealed', () => {
            const input = {
                target: {
                    lightingLevel: 'dim',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: []
                },
                observer: {
                    precise: {
                        vision: { range: Infinity }
                    },
                    imprecise: {},
                    conditions: {}
                }
            };

            const result = calculateVisibility(input);
            expect(result.state).toBe('concealed');
            expect(result.detection).toEqual({
                isPrecise: true,
                sense: 'vision'
            });
        });

        test('darkness + normal vision = undetected (with hearing fallback)', () => {
            const input = {
                target: {
                    lightingLevel: 'darkness',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: []
                },
                observer: {
                    precise: {
                        vision: { range: Infinity }
                    },
                    imprecise: {
                        hearing: { range: 60 }
                    },
                    conditions: {}
                }
            };

            const result = calculateVisibility(input);
            // Vision fails in darkness, but hearing detects at hidden level
            expect(result.state).toBe('hidden');
            expect(result.detection).toEqual({
                isPrecise: false,
                sense: 'hearing'
            });
        });

        test('darkness + normal vision + no other senses = undetected', () => {
            const input = {
                target: {
                    lightingLevel: 'darkness',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: []
                },
                observer: {
                    precise: {
                        vision: { range: Infinity }
                    },
                    imprecise: {},
                    conditions: {}
                }
            };

            const result = calculateVisibility(input);
            expect(result.state).toBe('undetected');
            expect(result.detection).toBe(null);
        });
    });

    describe('Low-light vision', () => {
        test('dim light + low-light vision = observed', () => {
            const input = {
                target: {
                    lightingLevel: 'dim',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: []
                },
                observer: {
                    precise: {
                        lowLightVision: { range: Infinity }
                    },
                    imprecise: {},
                    conditions: {}
                }
            };

            const result = calculateVisibility(input);
            expect(result.state).toBe('observed');
            expect(result.detection).toEqual({
                isPrecise: true,
                sense: 'lowLightVision'
            });
        });

        test('darkness + low-light vision = undetected (low-light doesn\'t work in darkness)', () => {
            const input = {
                target: {
                    lightingLevel: 'darkness',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: []
                },
                observer: {
                    precise: {
                        lowLightVision: { range: Infinity }
                    },
                    imprecise: {},
                    conditions: {}
                }
            };

            const result = calculateVisibility(input);
            expect(result.state).toBe('undetected');
            expect(result.detection).toBe(null);
        });
    });

    describe('Darkvision', () => {
        test('darkness + darkvision = observed', () => {
            const input = {
                target: {
                    lightingLevel: 'darkness',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: []
                },
                observer: {
                    precise: {
                        darkvision: { range: 60 }
                    },
                    imprecise: {},
                    conditions: {}
                }
            };

            const result = calculateVisibility(input);
            expect(result.state).toBe('observed');
            expect(result.detection).toEqual({
                isPrecise: true,
                sense: 'darkvision'
            });
        });

        test('dim light + darkvision = observed', () => {
            const input = {
                target: {
                    lightingLevel: 'dim',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: []
                },
                observer: {
                    precise: {
                        darkvision: { range: 60 }
                    },
                    imprecise: {},
                    conditions: {}
                }
            };

            const result = calculateVisibility(input);
            expect(result.state).toBe('observed');
            expect(result.detection).toEqual({
                isPrecise: true,
                sense: 'darkvision'
            });
        });

        test('bright light + darkvision = observed', () => {
            const input = {
                target: {
                    lightingLevel: 'bright',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: []
                },
                observer: {
                    precise: {
                        darkvision: { range: 60 }
                    },
                    imprecise: {},
                    conditions: {}
                }
            };

            const result = calculateVisibility(input);
            expect(result.state).toBe('observed');
            expect(result.detection).toEqual({
                isPrecise: true,
                sense: 'darkvision'
            });
        });
    });

    describe('Greater darkvision', () => {
        test('any lighting + greater darkvision = observed', () => {
            const lightingLevels = ['bright', 'dim', 'darkness', 'magicalDarkness', 'greaterMagicalDarkness'];

            lightingLevels.forEach(lightingLevel => {
                const input = {
                    target: {
                        lightingLevel,
                        coverLevel: 'none',
                        concealment: false,
                        auxiliary: []
                    },
                    observer: {
                        precise: {
                            greaterDarkvision: { range: 120 }
                        },
                        imprecise: {},
                        conditions: {}
                    }
                };

                const result = calculateVisibility(input);
                expect(result.state).toBe('observed');
                expect(result.detection).toEqual({
                    isPrecise: true,
                    sense: 'greaterDarkvision'
                });
            });
        });
    });

    describe('Magical Darkness', () => {
        test('magical darkness + normal vision = undetected (no other senses)', () => {
            const input = {
                target: {
                    lightingLevel: 'magicalDarkness',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: []
                },
                observer: {
                    precise: {
                        vision: { range: Infinity }
                    },
                    imprecise: {},
                    conditions: {}
                }
            };

            const result = calculateVisibility(input);
            expect(result.state).toBe('undetected');
            expect(result.detection).toBe(null);
        });

        test('magical darkness + darkvision = observed', () => {
            const input = {
                target: {
                    lightingLevel: 'magicalDarkness',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: []
                },
                observer: {
                    precise: {
                        darkvision: { range: 60 }
                    },
                    imprecise: {},
                    conditions: {}
                }
            };

            const result = calculateVisibility(input);
            expect(result.state).toBe('observed');
            expect(result.detection).toEqual({
                isPrecise: true,
                sense: 'darkvision'
            });
        });

        test('magical darkness + low-light vision = undetected', () => {
            const input = {
                target: {
                    lightingLevel: 'magicalDarkness',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: []
                },
                observer: {
                    precise: {
                        lowLightVision: { range: Infinity }
                    },
                    imprecise: {},
                    conditions: {}
                }
            };

            const result = calculateVisibility(input);
            expect(result.state).toBe('undetected');
            expect(result.detection).toBe(null);
        });
    });

    describe('Greater Magical Darkness', () => {
        test('greater magical darkness + normal vision = undetected', () => {
            const input = {
                target: {
                    lightingLevel: 'greaterMagicalDarkness',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: []
                },
                observer: {
                    precise: {
                        vision: { range: Infinity }
                    },
                    imprecise: {},
                    conditions: {}
                }
            };

            const result = calculateVisibility(input);
            expect(result.state).toBe('undetected');
            expect(result.detection).toBe(null);
        });

        test('greater magical darkness + darkvision = concealed (target in darkness)', () => {
            const input = {
                target: {
                    lightingLevel: 'greaterMagicalDarkness',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: []
                },
                observer: {
                    precise: {
                        darkvision: { range: 60 }
                    },
                    imprecise: {},
                    conditions: {}
                }
            };

            const result = calculateVisibility(input);
            expect(result.state).toBe('concealed');
            expect(result.detection).toEqual({
                isPrecise: true,
                sense: 'darkvision'
            });
        });

        test('observer in greater magical darkness + darkvision = concealed (observer in darkness)', () => {
            const input = {
                target: {
                    lightingLevel: 'bright', // Target is in bright light
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: []
                },
                observer: {
                    precise: {
                        darkvision: { range: 60 }
                    },
                    imprecise: {},
                    conditions: {},
                    lightingLevel: 'greaterMagicalDarkness' // Observer is in rank 4+ darkness
                }
            };

            const result = calculateVisibility(input);
            expect(result.state).toBe('concealed');
            expect(result.detection).toEqual({
                isPrecise: true,
                sense: 'darkvision'
            });
        });

        test('greater magical darkness + greater darkvision = observed', () => {
            const input = {
                target: {
                    lightingLevel: 'greaterMagicalDarkness',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: []
                },
                observer: {
                    precise: {
                        greaterDarkvision: { range: 120 }
                    },
                    imprecise: {},
                    conditions: {}
                }
            };

            const result = calculateVisibility(input);
            expect(result.state).toBe('observed');
            expect(result.detection).toEqual({
                isPrecise: true,
                sense: 'greaterDarkvision'
            });
        });

        test('greater magical darkness + low-light vision = undetected', () => {
            const input = {
                target: {
                    lightingLevel: 'greaterMagicalDarkness',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: []
                },
                observer: {
                    precise: {
                        lowLightVision: { range: Infinity }
                    },
                    imprecise: {},
                    conditions: {}
                }
            };

            const result = calculateVisibility(input);
            expect(result.state).toBe('undetected');
            expect(result.detection).toBe(null);
        });
    });

    describe('Invisibility condition', () => {
        test('bright light + vision + invisible = undetected (user example)', () => {
            const input = {
                target: {
                    lightingLevel: 'bright',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: ['invisible']
                },
                observer: {
                    precise: {
                        vision: { range: Infinity }
                    },
                    imprecise: {},
                    conditions: {}
                }
            };

            const result = calculateVisibility(input);
            expect(result.state).toBe('undetected');
            expect(result.detection).toBe(null);
        });

        test('dim light + vision + invisible + standard cover + concealment = undetected (user example)', () => {
            const input = {
                target: {
                    lightingLevel: 'dim',
                    coverLevel: 'standard',
                    concealment: true,
                    auxiliary: ['invisible']
                },
                observer: {
                    precise: {
                        vision: { range: Infinity }
                    },
                    imprecise: {},
                    conditions: {}
                }
            };

            const result = calculateVisibility(input);
            // Without invisibility, dim light + vision = concealed
            // With invisibility: always undetected
            expect(result.state).toBe('undetected');
            expect(result.detection).toBe(null);
        });

        test('darkness + vision + invisible = undetected (no hearing)', () => {
            const input = {
                target: {
                    lightingLevel: 'darkness',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: ['invisible']
                },
                observer: {
                    precise: {
                        vision: { range: Infinity }
                    },
                    imprecise: {},
                    conditions: {}
                }
            };

            const result = calculateVisibility(input);
            // Vision fails in darkness, so base state is already undetected
            expect(result.state).toBe('undetected');
            expect(result.detection).toBe(null);
        });

        test('invisible + tremorsense = hidden (tremorsense bypasses invisibility)', () => {
            const input = {
                target: {
                    lightingLevel: 'bright',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: ['invisible']
                },
                observer: {
                    precise: {},
                    imprecise: {
                        tremorsense: { range: 30 }
                    },
                    conditions: {}
                }
            };

            const result = calculateVisibility(input);
            // Tremorsense bypasses invisibility
            expect(result.state).toBe('hidden');
            expect(result.detection).toEqual({
                isPrecise: false,
                sense: 'tremorsense'
            });
        });
    });

    describe('Observer conditions', () => {
        test('blinded observer + no other senses = undetected', () => {
            const input = {
                target: {
                    lightingLevel: 'bright',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: []
                },
                observer: {
                    precise: {
                        vision: { range: Infinity }
                    },
                    imprecise: {},
                    conditions: {
                        blinded: true
                    }
                }
            };

            const result = calculateVisibility(input);
            expect(result.state).toBe('undetected');
            expect(result.detection).toBe(null);
        });

        test('blinded observer + hearing = hidden', () => {
            const input = {
                target: {
                    lightingLevel: 'bright',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: []
                },
                observer: {
                    precise: {
                        vision: { range: Infinity }
                    },
                    imprecise: {
                        hearing: { range: 60 }
                    },
                    conditions: {
                        blinded: true
                    }
                }
            };

            const result = calculateVisibility(input);
            expect(result.state).toBe('hidden');
            expect(result.detection).toEqual({
                isPrecise: false,
                sense: 'hearing'
            });
        });

        test('dazzled observer + bright light = concealed', () => {
            const input = {
                target: {
                    lightingLevel: 'bright',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: []
                },
                observer: {
                    precise: {
                        vision: { range: Infinity }
                    },
                    imprecise: {},
                    conditions: {
                        dazzled: true
                    }
                }
            };

            const result = calculateVisibility(input);
            expect(result.state).toBe('concealed');
            expect(result.detection).toEqual({
                isPrecise: true,
                sense: 'vision'
            });
        });

        test('deafened observer + hearing = cannot hear', () => {
            const input = {
                target: {
                    lightingLevel: 'darkness',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: []
                },
                observer: {
                    precise: {
                        vision: { range: Infinity }
                    },
                    imprecise: {
                        hearing: { range: 60 }
                    },
                    conditions: {
                        deafened: true
                    }
                }
            };

            const result = calculateVisibility(input);
            // Vision fails in darkness, hearing is disabled by deafened
            expect(result.state).toBe('undetected');
            expect(result.detection).toBe(null);
        });
    });

    describe('Imprecise senses', () => {
        test('tremorsense = hidden', () => {
            const input = {
                target: {
                    lightingLevel: 'darkness',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: []
                },
                observer: {
                    precise: {},
                    imprecise: {
                        tremorsense: { range: 30 }
                    },
                    conditions: {}
                }
            };

            const result = calculateVisibility(input);
            expect(result.state).toBe('hidden');
            expect(result.detection).toEqual({
                isPrecise: false,
                sense: 'tremorsense'
            });
        });

        test('scent = hidden', () => {
            const input = {
                target: {
                    lightingLevel: 'darkness',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: []
                },
                observer: {
                    precise: {},
                    imprecise: {
                        scent: { range: 30 }
                    },
                    conditions: {}
                }
            };

            const result = calculateVisibility(input);
            expect(result.state).toBe('hidden');
            expect(result.detection).toEqual({
                isPrecise: false,
                sense: 'scent'
            });
        });

        test('lifesense = hidden', () => {
            const input = {
                target: {
                    lightingLevel: 'darkness',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: []
                },
                observer: {
                    precise: {},
                    imprecise: {
                        lifesense: { range: 60 }
                    },
                    conditions: {}
                }
            };

            const result = calculateVisibility(input);
            expect(result.state).toBe('hidden');
            expect(result.detection).toEqual({
                isPrecise: false,
                sense: 'lifesense'
            });
        });
    });

    describe('Concealment and cover', () => {
        test('bright light + vision + concealment = concealed', () => {
            const input = {
                target: {
                    lightingLevel: 'bright',
                    coverLevel: 'none',
                    concealment: true,
                    auxiliary: []
                },
                observer: {
                    precise: {
                        vision: { range: Infinity }
                    },
                    imprecise: {},
                    conditions: {}
                }
            };

            const result = calculateVisibility(input);
            expect(result.state).toBe('concealed');
            expect(result.detection).toEqual({
                isPrecise: true,
                sense: 'vision'
            });
        });

        test('bright light + vision + standard cover = observed (cover doesn\'t change visibility state)', () => {
            const input = {
                target: {
                    lightingLevel: 'bright',
                    coverLevel: 'standard',
                    concealment: false,
                    auxiliary: []
                },
                observer: {
                    precise: {
                        vision: { range: Infinity }
                    },
                    imprecise: {},
                    conditions: {}
                }
            };

            const result = calculateVisibility(input);
            // Cover provides AC/Reflex bonus but doesn't change visibility state
            expect(result.state).toBe('observed');
            expect(result.detection).toEqual({
                isPrecise: true,
                sense: 'vision'
            });
        });
    });

    describe('Complex scenarios from user examples', () => {
        test('Example 1: dim + standard cover + concealment + invisible + vision only = undetected', () => {
            const input = {
                target: {
                    lightingLevel: 'dim',
                    coverLevel: 'standard',
                    concealment: true,
                    auxiliary: ['invisible']
                },
                observer: {
                    precise: {
                        vision: { range: Infinity }
                    },
                    imprecise: {},
                    conditions: {}
                }
            };

            const result = calculateVisibility(input);
            // With invisible condition, always results in undetected
            expect(result.state).toBe('undetected');
            expect(result.detection).toBe(null);
        });

        test('Example 2: dim + standard cover + concealment + vision only = concealed', () => {
            const input = {
                target: {
                    lightingLevel: 'dim',
                    coverLevel: 'standard',
                    concealment: true,
                    auxiliary: []
                },
                observer: {
                    precise: {
                        vision: { range: Infinity }
                    },
                    imprecise: {},
                    conditions: {}
                }
            };

            const result = calculateVisibility(input);
            // Dim + normal vision = concealed (from lighting)
            // + concealment = still concealed (doesn't stack)
            // Cover doesn't affect visibility state
            expect(result.state).toBe('concealed');
            expect(result.detection).toEqual({
                isPrecise: true,
                sense: 'vision'
            });
        });
    });

    describe('Sense priority', () => {
        test('greater darkvision takes priority over darkvision', () => {
            const input = {
                target: {
                    lightingLevel: 'darkness',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: []
                },
                observer: {
                    precise: {
                        vision: { range: Infinity },
                        darkvision: { range: 60 },
                        greaterDarkvision: { range: 120 }
                    },
                    imprecise: {},
                    conditions: {}
                }
            };

            const result = calculateVisibility(input);
            expect(result.state).toBe('observed');
            expect(result.detection).toEqual({
                isPrecise: true,
                sense: 'greaterDarkvision'
            });
        });

        test('darkvision takes priority over low-light vision in darkness', () => {
            const input = {
                target: {
                    lightingLevel: 'darkness',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: []
                },
                observer: {
                    precise: {
                        lowLightVision: { range: Infinity },
                        darkvision: { range: 60 }
                    },
                    imprecise: {},
                    conditions: {}
                }
            };

            const result = calculateVisibility(input);
            expect(result.state).toBe('observed');
            expect(result.detection).toEqual({
                isPrecise: true,
                sense: 'darkvision'
            });
        });
    });

    describe('Ray passes through darkness', () => {
        test('both tokens in bright light, ray through rank 1-3 darkness: normal vision cannot see', () => {
            const input = {
                target: {
                    lightingLevel: 'bright',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: []
                },
                observer: {
                    precise: {
                        vision: { range: Infinity }
                    },
                    imprecise: {
                        hearing: { range: 60 }
                    },
                    conditions: {}
                },
                rayDarkness: {
                    passesThroughDarkness: true,
                    rank: 2,
                    lightingLevel: 'magicalDarkness'
                }
            };

            const result = calculateVisibility(input);
            // Normal vision fails in darkness, falls back to hearing
            expect(result.state).toBe('hidden');
            expect(result.detection).toEqual({
                isPrecise: false,
                sense: 'hearing'
            });
        });

        test('both tokens in bright light, ray through rank 1-3 darkness: darkvision sees observed', () => {
            const input = {
                target: {
                    lightingLevel: 'bright',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: []
                },
                observer: {
                    precise: {
                        darkvision: { range: 60 }
                    },
                    imprecise: {},
                    conditions: {}
                },
                rayDarkness: {
                    passesThroughDarkness: true,
                    rank: 2,
                    lightingLevel: 'magicalDarkness'
                }
            };

            const result = calculateVisibility(input);
            // Darkvision can see through magical darkness (rank 1-3)
            expect(result.state).toBe('observed');
            expect(result.detection).toEqual({
                isPrecise: true,
                sense: 'darkvision'
            });
        });

        test('both tokens in bright light, ray through rank 4+ darkness: darkvision sees concealed', () => {
            const input = {
                target: {
                    lightingLevel: 'bright',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: []
                },
                observer: {
                    precise: {
                        darkvision: { range: 60 }
                    },
                    imprecise: {},
                    conditions: {}
                },
                rayDarkness: {
                    passesThroughDarkness: true,
                    rank: 4,
                    lightingLevel: 'greaterMagicalDarkness'
                }
            };

            const result = calculateVisibility(input);
            // Greater magical darkness (rank 4+) makes darkvision see concealed
            expect(result.state).toBe('concealed');
            expect(result.detection).toEqual({
                isPrecise: true,
                sense: 'darkvision'
            });
        });

        test('both tokens in bright light, ray through rank 4+ darkness: greater darkvision sees observed', () => {
            const input = {
                target: {
                    lightingLevel: 'bright',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: []
                },
                observer: {
                    precise: {
                        greaterDarkvision: { range: 120 }
                    },
                    imprecise: {},
                    conditions: {}
                },
                rayDarkness: {
                    passesThroughDarkness: true,
                    rank: 4,
                    lightingLevel: 'greaterMagicalDarkness'
                }
            };

            const result = calculateVisibility(input);
            // Greater darkvision can see through any darkness
            expect(result.state).toBe('observed');
            expect(result.detection).toEqual({
                isPrecise: true,
                sense: 'greaterDarkvision'
            });
        });

        test('both tokens in bright light, ray through rank 1-3 darkness: low-light vision cannot see', () => {
            const input = {
                target: {
                    lightingLevel: 'bright',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: []
                },
                observer: {
                    precise: {
                        lowLightVision: { range: Infinity }
                    },
                    imprecise: {
                        hearing: { range: 60 }
                    },
                    conditions: {}
                },
                rayDarkness: {
                    passesThroughDarkness: true,
                    rank: 2,
                    lightingLevel: 'magicalDarkness'
                }
            };

            const result = calculateVisibility(input);
            // Low-light vision doesn't work in any darkness
            expect(result.state).toBe('hidden');
            expect(result.detection).toEqual({
                isPrecise: false,
                sense: 'hearing'
            });
        });

        test('ray darkness overrides bright target lighting for normal vision', () => {
            const input = {
                target: {
                    lightingLevel: 'bright',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: []
                },
                observer: {
                    precise: {
                        vision: { range: Infinity }
                    },
                    imprecise: {},
                    conditions: {},
                    lightingLevel: 'bright'
                },
                rayDarkness: {
                    passesThroughDarkness: true,
                    rank: 1,
                    lightingLevel: 'magicalDarkness'
                }
            };

            const result = calculateVisibility(input);
            // Normal vision cannot see through darkness
            expect(result.state).toBe('undetected');
            expect(result.detection).toBe(null);
        });
    });

    describe('Edge cases', () => {
        test('no senses at all = undetected', () => {
            const input = {
                target: {
                    lightingLevel: 'bright',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: []
                },
                observer: {
                    precise: {},
                    imprecise: {},
                    conditions: {}
                }
            };

            const result = calculateVisibility(input);
            expect(result.state).toBe('undetected');
            expect(result.detection).toBe(null);
        });

        test('partial input normalization', () => {
            const input = {
                target: {
                    lightingLevel: 'bright'
                    // Missing other fields - should be normalized
                },
                observer: {
                    precise: {
                        vision: { range: Infinity }
                    }
                    // Missing imprecise and conditions - should be normalized
                }
            };

            const result = calculateVisibility(input);
            expect(result.state).toBe('observed');
            expect(result.detection).toEqual({
                isPrecise: true,
                sense: 'vision'
            });
        });
    });

    describe('Precise non-visual senses', () => {
        test('echolocation (precise) = observed', () => {
            const input = {
                target: {
                    lightingLevel: 'darkness',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: []
                },
                observer: {
                    precise: {
                        echolocation: { range: 60 }
                    },
                    imprecise: {},
                    conditions: {}
                }
            };

            const result = calculateVisibility(input);
            expect(result.state).toBe('observed');
            expect(result.detection).toEqual({
                isPrecise: true,
                sense: 'echolocation'
            });
        });

        test('echolocation + invisible = observed (bypasses invisibility)', () => {
            const input = {
                target: {
                    lightingLevel: 'bright',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: ['invisible']
                },
                observer: {
                    precise: {
                        echolocation: { range: 60 }
                    },
                    imprecise: {},
                    conditions: {}
                }
            };

            const result = calculateVisibility(input);
            expect(result.state).toBe('observed');
            expect(result.detection).toEqual({
                isPrecise: true,
                sense: 'echolocation'
            });
        });

        test('precise blindsense = observed in any lighting', () => {
            const input = {
                target: {
                    lightingLevel: 'greaterMagicalDarkness',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: []
                },
                observer: {
                    precise: {
                        blindsense: { range: 30 }
                    },
                    imprecise: {},
                    conditions: {}
                }
            };

            const result = calculateVisibility(input);
            expect(result.state).toBe('observed');
            expect(result.detection).toEqual({
                isPrecise: true,
                sense: 'blindsense'
            });
        });
    });

    describe('Non-visual imprecise senses bypass invisibility', () => {
        test('scent + invisible = hidden (scent bypasses invisibility)', () => {
            const input = {
                target: {
                    lightingLevel: 'bright',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: ['invisible']
                },
                observer: {
                    precise: {},
                    imprecise: {
                        scent: { range: 30 }
                    },
                    conditions: {}
                }
            };

            const result = calculateVisibility(input);
            expect(result.state).toBe('hidden');
            expect(result.detection).toEqual({
                isPrecise: false,
                sense: 'scent'
            });
        });

        test('lifesense + invisible = hidden (lifesense bypasses invisibility)', () => {
            const input = {
                target: {
                    lightingLevel: 'bright',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: ['invisible']
                },
                observer: {
                    precise: {},
                    imprecise: {
                        lifesense: { range: 60 }
                    },
                    conditions: {}
                }
            };

            const result = calculateVisibility(input);
            expect(result.state).toBe('hidden');
            expect(result.detection).toEqual({
                isPrecise: false,
                sense: 'lifesense'
            });
        });

        test('hearing + invisible = follows invisibility rules (hearing does NOT bypass)', () => {
            const input = {
                target: {
                    lightingLevel: 'bright',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: ['invisible']
                },
                observer: {
                    precise: {},
                    imprecise: {
                        hearing: { range: 60 }
                    },
                    conditions: {}
                }
            };

            const result = calculateVisibility(input);
            // Hearing detects at hidden, invisible makes hidden → undetected
            expect(result.state).toBe('undetected');
            expect(result.detection).toBe(null);
        });
    });

    describe('Condition interactions with non-visual senses', () => {
        test('blinded + echolocation (precise) = observed', () => {
            const input = {
                target: {
                    lightingLevel: 'bright',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: []
                },
                observer: {
                    precise: {
                        vision: { range: Infinity },
                        echolocation: { range: 60 }
                    },
                    imprecise: {},
                    conditions: {
                        blinded: true
                    }
                }
            };

            const result = calculateVisibility(input);
            // Blinded disables vision, but echolocation still works
            expect(result.state).toBe('observed');
            expect(result.detection).toEqual({
                isPrecise: true,
                sense: 'echolocation'
            });
        });

        test('dazzled + tremorsense = hidden (tremorsense unaffected by dazzled)', () => {
            const input = {
                target: {
                    lightingLevel: 'bright',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: []
                },
                observer: {
                    precise: {},
                    imprecise: {
                        tremorsense: { range: 30 }
                    },
                    conditions: {
                        dazzled: true
                    }
                }
            };

            const result = calculateVisibility(input);
            // Dazzled affects vision, but tremorsense is unaffected
            expect(result.state).toBe('hidden');
            expect(result.detection).toEqual({
                isPrecise: false,
                sense: 'tremorsense'
            });
        });

        test('blinded + dazzled + vision = undetected (both conditions, no other senses)', () => {
            const input = {
                target: {
                    lightingLevel: 'bright',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: []
                },
                observer: {
                    precise: {
                        vision: { range: Infinity }
                    },
                    imprecise: {},
                    conditions: {
                        blinded: true,
                        dazzled: true
                    }
                }
            };

            const result = calculateVisibility(input);
            // Blinded takes precedence, both disable vision, no other senses = undetected
            expect(result.state).toBe('undetected');
            expect(result.detection).toBe(null);
        });
    });

    describe('Multiple senses with different capabilities', () => {
        test('vision + hearing: vision preferred in bright light', () => {
            const input = {
                target: {
                    lightingLevel: 'bright',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: []
                },
                observer: {
                    precise: {
                        vision: { range: Infinity }
                    },
                    imprecise: {
                        hearing: { range: 60 }
                    },
                    conditions: {}
                }
            };

            const result = calculateVisibility(input);
            expect(result.state).toBe('observed');
            expect(result.detection).toEqual({
                isPrecise: true,
                sense: 'vision'
            });
        });

        test('vision + hearing: hearing used in darkness', () => {
            const input = {
                target: {
                    lightingLevel: 'darkness',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: []
                },
                observer: {
                    precise: {
                        vision: { range: Infinity }
                    },
                    imprecise: {
                        hearing: { range: 60 }
                    },
                    conditions: {}
                }
            };

            const result = calculateVisibility(input);
            expect(result.state).toBe('hidden');
            expect(result.detection).toEqual({
                isPrecise: false,
                sense: 'hearing'
            });
        });

        test('multiple imprecise senses: first working sense is used', () => {
            const input = {
                target: {
                    lightingLevel: 'darkness',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: []
                },
                observer: {
                    precise: {},
                    imprecise: {
                        tremorsense: { range: 30 },
                        scent: { range: 30 },
                        hearing: { range: 60 }
                    },
                    conditions: {}
                }
            };

            const result = calculateVisibility(input);
            expect(result.state).toBe('hidden');
            // Should use one of the imprecise senses
            expect(result.detection.isPrecise).toBe(false);
            expect(['tremorsense', 'scent', 'hearing']).toContain(result.detection.sense);
        });
    });

    describe('Observer in different lighting than target', () => {
        test('observer in greater magical darkness with darkvision, target in bright light = concealed', () => {
            const input = {
                target: {
                    lightingLevel: 'bright',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: []
                },
                observer: {
                    precise: {
                        darkvision: { range: 60 }
                    },
                    imprecise: {},
                    conditions: {},
                    lightingLevel: 'greaterMagicalDarkness'
                }
            };

            const result = calculateVisibility(input);
            // Observer in greater magical darkness (rank 4+) with darkvision sees concealed
            expect(result.state).toBe('concealed');
            expect(result.detection).toEqual({
                isPrecise: true,
                sense: 'darkvision'
            });
        });

        test('observer in magical darkness with darkvision, target in bright light = observed', () => {
            const input = {
                target: {
                    lightingLevel: 'bright',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: []
                },
                observer: {
                    precise: {
                        darkvision: { range: 60 }
                    },
                    imprecise: {},
                    conditions: {},
                    lightingLevel: 'magicalDarkness' // rank 1-3
                }
            };

            const result = calculateVisibility(input);
            // Observer in magical darkness (rank 1-3) with darkvision sees observed
            expect(result.state).toBe('observed');
            expect(result.detection).toEqual({
                isPrecise: true,
                sense: 'darkvision'
            });
        });

        test('observer in greater magical darkness with greater darkvision, target in bright light = observed', () => {
            const input = {
                target: {
                    lightingLevel: 'bright',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: []
                },
                observer: {
                    precise: {
                        greaterDarkvision: { range: 120 }
                    },
                    imprecise: {},
                    conditions: {},
                    lightingLevel: 'greaterMagicalDarkness'
                }
            };

            const result = calculateVisibility(input);
            // Greater darkvision works perfectly in any darkness
            expect(result.state).toBe('observed');
            expect(result.detection).toEqual({
                isPrecise: true,
                sense: 'greaterDarkvision'
            });
        });

        test('observer in darkness with normal vision, target in bright light = observed (target is well-lit)', () => {
            const input = {
                target: {
                    lightingLevel: 'bright',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: []
                },
                observer: {
                    precise: {
                        vision: { range: Infinity }
                    },
                    imprecise: {
                        hearing: { range: 60 }
                    },
                    conditions: {},
                    lightingLevel: 'darkness'
                }
            };

            const result = calculateVisibility(input);
            // Observer in darkness can see target in bright light (target is well-lit)
            expect(result.state).toBe('observed');
            expect(result.detection).toEqual({
                isPrecise: true,
                sense: 'vision'
            });
        });

        test('observer in dim light, target in bright light = observed (vision works)', () => {
            const input = {
                target: {
                    lightingLevel: 'bright',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: []
                },
                observer: {
                    precise: {
                        vision: { range: Infinity }
                    },
                    imprecise: {},
                    conditions: {},
                    lightingLevel: 'dim'
                }
            };

            const result = calculateVisibility(input);
            // Observer in dim light can still see target in bright light
            expect(result.state).toBe('observed');
            expect(result.detection).toEqual({
                isPrecise: true,
                sense: 'vision'
            });
        });
    });

    describe('Greater cover scenarios', () => {
        test('bright light + vision + greater cover = observed (cover doesn\'t affect visibility)', () => {
            const input = {
                target: {
                    lightingLevel: 'bright',
                    coverLevel: 'greater',
                    concealment: false,
                    auxiliary: []
                },
                observer: {
                    precise: {
                        vision: { range: Infinity }
                    },
                    imprecise: {},
                    conditions: {}
                }
            };

            const result = calculateVisibility(input);
            expect(result.state).toBe('observed');
            expect(result.detection).toEqual({
                isPrecise: true,
                sense: 'vision'
            });
        });

        test('darkness + tremorsense + greater cover = hidden', () => {
            const input = {
                target: {
                    lightingLevel: 'darkness',
                    coverLevel: 'greater',
                    concealment: false,
                    auxiliary: []
                },
                observer: {
                    precise: {},
                    imprecise: {
                        tremorsense: { range: 30 }
                    },
                    conditions: {}
                }
            };

            const result = calculateVisibility(input);
            expect(result.state).toBe('hidden');
            expect(result.detection).toEqual({
                isPrecise: false,
                sense: 'tremorsense'
            });
        });
    });

    describe('Complex multi-factor scenarios', () => {
        test('invisible + concealment + greater cover + dim light + darkvision = undetected', () => {
            const input = {
                target: {
                    lightingLevel: 'dim',
                    coverLevel: 'greater',
                    concealment: true,
                    auxiliary: ['invisible']
                },
                observer: {
                    precise: {
                        darkvision: { range: 60 }
                    },
                    imprecise: {},
                    conditions: {}
                }
            };

            const result = calculateVisibility(input);
            // Invisible condition always results in undetected
            expect(result.state).toBe('undetected');
            expect(result.detection).toBe(null);
        });

        test('invisible + dazzled + bright light = undetected', () => {
            const input = {
                target: {
                    lightingLevel: 'bright',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: ['invisible']
                },
                observer: {
                    precise: {
                        vision: { range: Infinity }
                    },
                    imprecise: {},
                    conditions: {
                        dazzled: true
                    }
                }
            };

            const result = calculateVisibility(input);
            // Invisible condition always results in undetected
            expect(result.state).toBe('undetected');
            expect(result.detection).toBe(null);
        });

        test('concealment + dazzled + dim light = concealed', () => {
            const input = {
                target: {
                    lightingLevel: 'dim',
                    coverLevel: 'none',
                    concealment: true,
                    auxiliary: []
                },
                observer: {
                    precise: {
                        vision: { range: Infinity }
                    },
                    imprecise: {},
                    conditions: {
                        dazzled: true
                    }
                }
            };

            const result = calculateVisibility(input);
            // Both dim light and dazzled cause concealment (doesn't stack)
            expect(result.state).toBe('concealed');
            expect(result.detection).toEqual({
                isPrecise: true,
                sense: 'vision'
            });
        });

        test('blinded + invisible + tremorsense = hidden (tremorsense bypasses both)', () => {
            const input = {
                target: {
                    lightingLevel: 'bright',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: ['invisible']
                },
                observer: {
                    precise: {
                        vision: { range: Infinity }
                    },
                    imprecise: {
                        tremorsense: { range: 30 }
                    },
                    conditions: {
                        blinded: true
                    }
                }
            };

            const result = calculateVisibility(input);
            // Tremorsense bypasses both blinded and invisible
            expect(result.state).toBe('hidden');
            expect(result.detection).toEqual({
                isPrecise: false,
                sense: 'tremorsense'
            });
        });
    });

    describe('Natural vs magical darkness', () => {
        test('natural darkness + darkvision = observed', () => {
            const input = {
                target: {
                    lightingLevel: 'darkness',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: []
                },
                observer: {
                    precise: {
                        darkvision: { range: 60 }
                    },
                    imprecise: {},
                    conditions: {}
                }
            };

            const result = calculateVisibility(input);
            expect(result.state).toBe('observed');
            expect(result.detection).toEqual({
                isPrecise: true,
                sense: 'darkvision'
            });
        });

        test('magical darkness (rank 1) + darkvision = observed', () => {
            const input = {
                target: {
                    lightingLevel: 'magicalDarkness',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: []
                },
                observer: {
                    precise: {
                        darkvision: { range: 60 }
                    },
                    imprecise: {},
                    conditions: {}
                }
            };

            const result = calculateVisibility(input);
            expect(result.state).toBe('observed');
            expect(result.detection).toEqual({
                isPrecise: true,
                sense: 'darkvision'
            });
        });
    });

    describe('Deafened condition', () => {
        test('deafened + hearing in darkness = undetected', () => {
            const input = {
                target: {
                    lightingLevel: 'darkness',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: []
                },
                observer: {
                    precise: {
                        vision: { range: Infinity }
                    },
                    imprecise: {
                        hearing: { range: 60 }
                    },
                    conditions: {
                        deafened: true
                    }
                }
            };

            const result = calculateVisibility(input);
            expect(result.state).toBe('undetected');
            expect(result.detection).toBe(null);
        });

        test('deafened + tremorsense in darkness = hidden (tremorsense unaffected)', () => {
            const input = {
                target: {
                    lightingLevel: 'darkness',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: []
                },
                observer: {
                    precise: {},
                    imprecise: {
                        tremorsense: { range: 30 }
                    },
                    conditions: {
                        deafened: true
                    }
                }
            };

            const result = calculateVisibility(input);
            expect(result.state).toBe('hidden');
            expect(result.detection).toEqual({
                isPrecise: false,
                sense: 'tremorsense'
            });
        });
    });

    describe('Invisibility transitions', () => {
        test('concealed + invisible = undetected (PF2e rules)', () => {
            const input = {
                target: {
                    lightingLevel: 'dim',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: ['invisible']
                },
                observer: {
                    precise: {
                        vision: { range: Infinity }
                    },
                    imprecise: {},
                    conditions: {}
                }
            };

            const result = calculateVisibility(input);
            // Invisible condition always results in undetected
            expect(result.state).toBe('undetected');
            expect(result.detection).toBe(null);
        });

        test('hidden + invisible = undetected (PF2e rules)', () => {
            const input = {
                target: {
                    lightingLevel: 'darkness',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: ['invisible']
                },
                observer: {
                    precise: {
                        vision: { range: Infinity }
                    },
                    imprecise: {
                        hearing: { range: 60 }
                    },
                    conditions: {}
                }
            };

            const result = calculateVisibility(input);
            // Vision fails → hearing detects at hidden → invisible makes it undetected
            expect(result.state).toBe('undetected');
            expect(result.detection).toBe(null);
        });
    });

    describe('All lighting levels with each vision type', () => {
        const lightingLevels = ['bright', 'dim', 'darkness', 'magicalDarkness', 'greaterMagicalDarkness'];

        test('normal vision: bright=observed, dim=concealed, darkness=undetected', () => {
            const expected = {
                'bright': 'observed',
                'dim': 'concealed',
                'darkness': 'undetected',
                'magicalDarkness': 'undetected',
                'greaterMagicalDarkness': 'undetected'
            };

            lightingLevels.forEach(level => {
                const input = {
                    target: {
                        lightingLevel: level,
                        coverLevel: 'none',
                        concealment: false,
                        auxiliary: []
                    },
                    observer: {
                        precise: {
                            vision: { range: Infinity }
                        },
                        imprecise: {},
                        conditions: {}
                    }
                };

                const result = calculateVisibility(input);
                expect(result.state).toBe(expected[level]);
            });
        });

        test('low-light vision: bright=observed, dim=observed, darkness=undetected', () => {
            const expected = {
                'bright': 'observed',
                'dim': 'observed',
                'darkness': 'undetected',
                'magicalDarkness': 'undetected',
                'greaterMagicalDarkness': 'undetected'
            };

            lightingLevels.forEach(level => {
                const input = {
                    target: {
                        lightingLevel: level,
                        coverLevel: 'none',
                        concealment: false,
                        auxiliary: []
                    },
                    observer: {
                        precise: {
                            lowLightVision: { range: Infinity }
                        },
                        imprecise: {},
                        conditions: {}
                    }
                };

                const result = calculateVisibility(input);
                expect(result.state).toBe(expected[level]);
            });
        });

        test('darkvision: all lighting except greaterMagicalDarkness = observed', () => {
            const expected = {
                'bright': 'observed',
                'dim': 'observed',
                'darkness': 'observed',
                'magicalDarkness': 'observed',
                'greaterMagicalDarkness': 'concealed'
            };

            lightingLevels.forEach(level => {
                const input = {
                    target: {
                        lightingLevel: level,
                        coverLevel: 'none',
                        concealment: false,
                        auxiliary: []
                    },
                    observer: {
                        precise: {
                            darkvision: { range: 60 }
                        },
                        imprecise: {},
                        conditions: {}
                    }
                };

                const result = calculateVisibility(input);
                expect(result.state).toBe(expected[level]);
            });
        });
    });

    describe('Elevation and tremorsense', () => {
        test('tremorsense detects target at same elevation', () => {
            const input = {
                target: {
                    lightingLevel: 'darkness',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: [],
                    movementAction: 'stride'
                },
                observer: {
                    precise: {},
                    imprecise: {
                        tremorsense: { range: 30 }
                    },
                    conditions: {}
                }
            };

            const result = calculateVisibility(input);
            expect(result.state).toBe('hidden');
            expect(result.detection).toEqual({
                isPrecise: false,
                sense: 'tremorsense'
            });
        });

        test('tremorsense fails against target with Petal Step feat', () => {
            const input = {
                target: {
                    lightingLevel: 'darkness',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: ['petal-step'],
                    movementAction: 'stride'
                },
                observer: {
                    precise: {},
                    imprecise: {
                        tremorsense: { range: 30 }
                    },
                    conditions: {}
                }
            };

            const result = calculateVisibility(input);
            expect(result.state).toBe('undetected');
            expect(result.detection).toBe(null);
        });

        test('tremorsense fails but hearing works against Petal Step target', () => {
            const input = {
                target: {
                    lightingLevel: 'darkness',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: ['petal-step'],
                    movementAction: 'stride'
                },
                observer: {
                    precise: {},
                    imprecise: {
                        tremorsense: { range: 30 },
                        hearing: { range: 60 }
                    },
                    conditions: {}
                }
            };

            const result = calculateVisibility(input);
            expect(result.state).toBe('hidden');
            expect(result.detection).toEqual({
                isPrecise: false,
                sense: 'hearing'
            });
        });

        test('tremorsense cannot detect elevated target (target above observer)', () => {
            const input = {
                target: {
                    lightingLevel: 'darkness',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: [],
                    movementAction: 'fly'
                },
                observer: {
                    precise: {},
                    imprecise: {
                        tremorsense: { range: 30 }
                    },
                    conditions: {}
                }
            };

            const result = calculateVisibility(input);
            // Tremorsense fails, no other senses
            expect(result.state).toBe('undetected');
            expect(result.detection).toBe(null);
        });

        test('tremorsense cannot detect target when observer is elevated', () => {
            const input = {
                target: {
                    lightingLevel: 'darkness',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: [],
                    movementAction: 'fly'
                },
                observer: {
                    precise: {},
                    imprecise: {
                        tremorsense: { range: 30 }
                    },
                    conditions: {}
                }
            };

            const result = calculateVisibility(input);
            // Tremorsense fails when observer is elevated
            expect(result.state).toBe('undetected');
            expect(result.detection).toBe(null);
        });

        test('tremorsense fails but hearing still works (elevated target)', () => {
            const input = {
                target: {
                    lightingLevel: 'darkness',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: [],
                    movementAction: 'fly'
                },
                observer: {
                    precise: {},
                    imprecise: {
                        tremorsense: { range: 30 },
                        hearing: { range: 60 }
                    },
                    conditions: {}
                }
            };

            const result = calculateVisibility(input);
            // Tremorsense fails due to elevation, but hearing works
            expect(result.state).toBe('hidden');
            expect(result.detection).toEqual({
                isPrecise: false,
                sense: 'hearing'
            });
        });

        test('tremorsense with invisible elevated target = undetected', () => {
            const input = {
                target: {
                    lightingLevel: 'bright',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: ['invisible'],
                    movementAction: 'fly'
                },
                observer: {
                    precise: {},
                    imprecise: {
                        tremorsense: { range: 30 }
                    },
                    conditions: {}
                }
            };

            const result = calculateVisibility(input);
            // Tremorsense fails (elevated), no other senses
            expect(result.state).toBe('undetected');
            expect(result.detection).toBe(null);
        });

        test('tremorsense only, visible elevated target = undetected (no vision to see)', () => {
            const input = {
                target: {
                    lightingLevel: 'bright',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: [], // NOT invisible - just elevated
                    movementAction: 'fly'
                },
                observer: {
                    precise: {}, // NO vision at all
                    imprecise: {
                        tremorsense: { range: 30 }
                    },
                    conditions: {}
                }
            };

            const result = calculateVisibility(input);
            // Observer has no vision, tremorsense fails (elevated), so undetected
            expect(result.state).toBe('undetected');
            expect(result.detection).toBe(null);
        });

        test('scent still works for elevated targets (unaffected by elevation)', () => {
            const input = {
                target: {
                    lightingLevel: 'darkness',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: [],
                    movementAction: 'fly'
                },
                observer: {
                    precise: {},
                    imprecise: {
                        scent: { range: 30 }
                    },
                    conditions: {}
                }
            };

            const result = calculateVisibility(input);
            // Scent is not affected by elevation
            expect(result.state).toBe('hidden');
            expect(result.detection).toEqual({
                isPrecise: false,
                sense: 'scent'
            });
        });
    });
});
