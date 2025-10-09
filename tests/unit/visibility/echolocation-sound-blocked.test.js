/**
 * Test echolocation behavior when sound is blocked
 */

import { calculateVisibility } from '../../../scripts/visibility/StatelessVisibilityCalculator.js';

describe('Echolocation with sound-blocked walls', () => {
  test('echolocation should not detect through sound-blocking walls', () => {
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
      soundBlocked: true, // Wall blocks sound
      rayDarkness: null,
      hasLineOfSight: false
    };

    const result = calculateVisibility(input);
    
    expect(result.state).toBe('undetected');
    expect(result.detection).toBeNull();
  });

  test('echolocation should work when sound is NOT blocked', () => {
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
      soundBlocked: false, // Sound can pass through
      rayDarkness: null,
      hasLineOfSight: false
    };

    const result = calculateVisibility(input);
    
    expect(result.state).toBe('observed');
    expect(result.detection).toEqual({
      isPrecise: true,
      sense: 'echolocation'
    });
  });

  test('hearing should not detect through sound-blocking walls', () => {
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
          hearing: { range: 60 }
        },
        conditions: {
          blinded: false,
          deafened: false,
          dazzled: false
        },
        movementAction: 0
      },
      soundBlocked: true, // Wall blocks sound
      rayDarkness: null,
      hasLineOfSight: false
    };

    const result = calculateVisibility(input);
    
    expect(result.state).toBe('undetected');
    expect(result.detection).toBeNull();
  });

  test('scent should still work through sound-blocking walls', () => {
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
          hearing: { range: 60 },
          scent: { range: 30 }
        },
        conditions: {
          blinded: false,
          deafened: false,
          dazzled: false
        },
        movementAction: 0
      },
      soundBlocked: true, // Wall blocks sound but not scent
      rayDarkness: null,
      hasLineOfSight: false
    };

    const result = calculateVisibility(input);
    
    // Should be detected by scent, not hearing
    expect(result.state).toBe('hidden');
    expect(result.detection).toEqual({
      isPrecise: false,
      sense: 'scent'
    });
  });
});
