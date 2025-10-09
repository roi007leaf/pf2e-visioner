/**
 * Test: Echolocation sense should be labeled as 'echolocation', not 'hearing'
 * 
 * Bug: VisionAnalyzer was converting echolocation into precise.hearing instead of precise.echolocation
 * This caused the detection map to store 'hearing' with isPrecise: true (contradictory)
 * and badges showed the hearing icon instead of echolocation icon.
 * 
 * Fix: VisionAnalyzer now correctly sets precise.echolocation when echolocation is active
 */

import { calculateVisibility } from '../../../scripts/visibility/StatelessVisibilityCalculator.js';

describe('Echolocation sense labeling', () => {
  test('echolocation detection should be labeled as "echolocation" not "hearing"', () => {
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
          echolocation: { range: 60 }
        },
        imprecise: {
          hearing: Infinity  // Regular hearing should still exist
        },
        conditions: {
          blinded: false,
          deafened: false,
          dazzled: false
        },
        movementAction: 0
      },
      soundBlocked: false,
      rayDarkness: null,
      distance: 30
    };

    const result = calculateVisibility(input);

    expect(result.state).toBe('observed');
    expect(result.detection).toBeDefined();
    expect(result.detection.sense).toBe('echolocation');  // Should be 'echolocation' not 'hearing'
    expect(result.detection.isPrecise).toBe(true);
  });

  test('echolocation blocked by sound-blocking wall returns undetected', () => {
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
          echolocation: { range: 60 }
        },
        imprecise: {},
        conditions: {
          blinded: false,
          deafened: false,
          dazzled: false
        },
        movementAction: 0
      },
      soundBlocked: true,  // Sound blocked
      rayDarkness: null,
      distance: 30
    };

    const result = calculateVisibility(input);

    expect(result.state).toBe('undetected');
    expect(result.detection).toBeNull();
  });

  test('echolocation blocked by deafened condition returns undetected', () => {
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
          echolocation: { range: 60 }
        },
        imprecise: {},
        conditions: {
          blinded: false,
          deafened: true,  // Deafened
          dazzled: false
        },
        movementAction: 0
      },
      soundBlocked: false,
      rayDarkness: null,
      distance: 30
    };

    const result = calculateVisibility(input);

    expect(result.state).toBe('undetected');
    expect(result.detection).toBeNull();
  });

  test('regular hearing (imprecise) should return hidden, not observed', () => {
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
          hearing: Infinity
        },
        conditions: {
          blinded: false,
          deafened: false,
          dazzled: false
        },
        movementAction: 0
      },
      soundBlocked: false,
      rayDarkness: null,
      distance: 30
    };

    const result = calculateVisibility(input);

    expect(result.state).toBe('hidden');  // Hearing is imprecise, so hidden
    expect(result.detection).toBeDefined();
    expect(result.detection.sense).toBe('hearing');
    expect(result.detection.isPrecise).toBe(false);  // Hearing is imprecise
  });
});
