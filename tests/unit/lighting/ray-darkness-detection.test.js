/**
 * Debug test: Ray passes through rank 4 darkness
 * 
 * Scenario: Two tokens with a rank 4 darkness effect between them
 * - Observer without darkvision should see target as HIDDEN (hearing only)
 * - Observer with darkvision should see target as CONCEALED
 */

import { calculateVisibility } from '../../../scripts/visibility/StatelessVisibilityCalculator.js';

describe('Debug: Ray Darkness Detection', () => {
    test('normal vision + ray through rank 4 darkness = hidden (hearing)', () => {
        const input = {
            target: {
                lightingLevel: 'bright', // Target is in bright light
                coverLevel: 'none',
                concealment: false,
                auxiliary: []
            },
            observer: {
                precise: {
                    vision: { range: Infinity } // Normal vision only
                },
                imprecise: {
                    hearing: { range: Infinity } // Default hearing
                },
                conditions: {},
                lightingLevel: 'bright' // Observer is in bright light
            },
            rayDarkness: {
                passesThroughDarkness: true,
                rank: 4,
                lightingLevel: 'greaterMagicalDarkness'
            }
        };

        console.log('Input (normal vision + ray darkness):', JSON.stringify(input, null, 2));

        const result = calculateVisibility(input);

        console.log('Result:', JSON.stringify(result, null, 2));

        // Expected: hidden (visual detection fails, hearing detects at hidden level)
        expect(result.state).toBe('hidden');
        expect(result.detection).toEqual({
            isPrecise: false,
            sense: 'hearing'
        });
    });

    test('darkvision + ray through rank 4 darkness = concealed', () => {
        const input = {
            target: {
                lightingLevel: 'bright', // Target is in bright light
                coverLevel: 'none',
                concealment: false,
                auxiliary: []
            },
            observer: {
                precise: {
                    darkvision: { range: 60 } // Darkvision
                },
                imprecise: {
                    hearing: { range: Infinity }
                },
                conditions: {},
                lightingLevel: 'bright' // Observer is in bright light
            },
            rayDarkness: {
                passesThroughDarkness: true,
                rank: 4,
                lightingLevel: 'greaterMagicalDarkness'
            }
        };

        console.log('Input (darkvision + ray darkness):', JSON.stringify(input, null, 2));

        const result = calculateVisibility(input);

        console.log('Result:', JSON.stringify(result, null, 2));

        // Expected: concealed (darkvision impaired by rank 4 darkness in the way)
        expect(result.state).toBe('concealed');
        expect(result.detection).toEqual({
            isPrecise: true,
            sense: 'darkvision'
        });
    });

    test('greater darkvision + ray through rank 4 darkness = observed', () => {
        const input = {
            target: {
                lightingLevel: 'bright',
                coverLevel: 'none',
                concealment: false,
                auxiliary: []
            },
            observer: {
                precise: {
                    greaterDarkvision: { range: 60 }
                },
                imprecise: {
                    hearing: { range: Infinity }
                },
                conditions: {},
                lightingLevel: 'bright'
            },
            rayDarkness: {
                passesThroughDarkness: true,
                rank: 4,
                lightingLevel: 'greaterMagicalDarkness'
            }
        };

        console.log('Input (greater darkvision + ray darkness):', JSON.stringify(input, null, 2));

        const result = calculateVisibility(input);

        console.log('Result:', JSON.stringify(result, null, 2));

        // Expected: observed (greater darkvision sees through all darkness)
        expect(result.state).toBe('observed');
        expect(result.detection).toEqual({
            isPrecise: true,
            sense: 'greaterDarkvision'
        });
    });
});
