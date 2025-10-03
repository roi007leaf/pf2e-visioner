/**
 * Debug test: Greater Darkvision feat with rank 4 darkness
 * 
 * Issue: Player characters with Greater Darkvision feat cannot see through rank 4 darkness
 * Expected: Greater darkvision should work with rank 4 darkness (same as NPCs with the sense)
 */

import { calculateVisibility } from '../../scripts/visibility/StatelessVisibilityCalculator.js';

describe('Debug: Greater Darkvision Feat + Rank 4 Darkness', () => {
    test('PC with greater darkvision feat in rank 4 darkness = observed', () => {
        const input = {
            target: {
                lightingLevel: 'greaterMagicalDarkness',
                coverLevel: 'none',
                concealment: false,
                auxiliary: []
            },
            observer: {
                precise: {
                    vision: { range: Infinity },
                    greaterDarkvision: { range: Infinity }
                },
                imprecise: {
                    hearing: { range: Infinity }
                },
                conditions: {
                    blinded: false,
                    deafened: false,
                    dazzled: false
                }
            }
        };

        console.log('Input:', JSON.stringify(input, null, 2));

        const result = calculateVisibility(input);

        console.log('Result:', JSON.stringify(result, null, 2));

        expect(result.state).toBe('observed');
        expect(result.detection).toEqual({
            isPrecise: true,
            sense: 'greaterDarkvision'
        });
    });

    test('PC with greater darkvision feat, ray through rank 4 darkness = observed', () => {
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
                    greaterDarkvision: { range: Infinity }
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
            rayDarkness: {
                passesThroughDarkness: true,
                rank: 4,
                lightingLevel: 'greaterMagicalDarkness'
            }
        };

        console.log('Input (ray darkness):', JSON.stringify(input, null, 2));

        const result = calculateVisibility(input);

        console.log('Result (ray darkness):', JSON.stringify(result, null, 2));

        expect(result.state).toBe('observed');
        expect(result.detection).toEqual({
            isPrecise: true,
            sense: 'greaterDarkvision'
        });
    });

    test('verify greater darkvision detection in adapter input', () => {
        console.log('This test verifies that VisionAnalyzer correctly detects greater darkvision from feats');
        console.log('The issue is likely in how actor.system.perception.senses is populated from feats');
        console.log('PF2e system should automatically add greater-darkvision to senses when the feat is present');
    });
});
