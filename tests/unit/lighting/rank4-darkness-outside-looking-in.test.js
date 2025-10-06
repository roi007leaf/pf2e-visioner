/**
 * Debug test: Token outside rank 4 darkness looking at token inside
 * 
 * Expected: Observer with darkvision should see target as CONCEALED
 * Actual (bug): Observer sees target as OBSERVED
 */

import { calculateVisibility } from '../../../scripts/visibility/StatelessVisibilityCalculator.js';

describe('Debug: Rank 4 Darkness - Outside Looking In', () => {
    test('observer outside with darkvision, target inside rank 4 darkness = concealed', () => {
        // Observer: outside darkness, has darkvision
        // Target: inside rank 4 magical darkness
        const input = {
            target: {
                lightingLevel: 'greaterMagicalDarkness', // Rank 4+ darkness at target position
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

        console.log('Input:', JSON.stringify(input, null, 2));

        const result = calculateVisibility(input);

        console.log('Result:', JSON.stringify(result, null, 2));

        // Expected: concealed (because target is in rank 4+ magical darkness)
        expect(result.state).toBe('concealed');
        expect(result.detection).toEqual({
            isPrecise: true,
            sense: 'darkvision'
        });
    });

    test('verify the lighting level is being set correctly by adapter', () => {
        // This test will help us verify if the adapter is correctly
        // determining the lighting level when observer is outside
        // and target is inside rank 4 darkness

        // Simulating what the adapter should do:
        const mockLightLevel = {
            level: 'darkness',
            darknessRank: 4, // Rank 4 darkness
            isDarknessSource: true // Magical darkness source
        };

        // Adapter logic:
        let lightingLevel = 'bright';
        const darknessRank = mockLightLevel.darknessRank ?? 0;
        const isDarknessSource = mockLightLevel.isDarknessSource ?? false;

        console.log('Mock light level:', mockLightLevel);
        console.log('darknessRank:', darknessRank);
        console.log('isDarknessSource:', isDarknessSource);

        if (darknessRank >= 4 && isDarknessSource) {
            lightingLevel = 'greaterMagicalDarkness';
        } else if (darknessRank >= 1 && isDarknessSource) {
            lightingLevel = 'magicalDarkness';
        } else if (darknessRank >= 1 || mockLightLevel.level === 'darkness') {
            lightingLevel = 'darkness';
        }

        console.log('Resulting lightingLevel:', lightingLevel);

        expect(lightingLevel).toBe('greaterMagicalDarkness');
    });
});
