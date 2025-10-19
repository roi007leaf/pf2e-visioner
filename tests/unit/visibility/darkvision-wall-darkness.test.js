/**
 * Test for darkvision working in darkness scenarios even when walls block LOS
 */

import { calculateVisibility } from '../../../scripts/visibility/StatelessVisibilityCalculator.js';

describe('Darkvision in Darkness with Walls', () => {
  test('darkvision should see concealed in greater magical darkness even with wall blocking LOS', () => {
    const input = {
      target: {
        lightingLevel: 'greaterMagicalDarkness',
        concealment: 'none',
        auxiliary: [],
      },
      observer: {
        precise: {
          darkvision: { range: 60 }, // Observer has darkvision
        },
        imprecise: {
          hearing: { range: 30 },
        },
        conditions: {
          blinded: false,
          deafened: false,
          dazzled: false,
        },
        lightingLevel: 'bright',
      },
      hasLineOfSight: false, // Wall blocks LOS
      soundBlocked: false,
      rayDarkness: null,
    };

    const result = calculateVisibility(input);

    expect(result.state).toBe('concealed');
    expect(result.detection.sense).toBe('darkvision');
    expect(result.detection.isPrecise).toBe(true);
  });

  test('darkvision should see concealed in magical darkness even with wall blocking LOS', () => {
    const input = {
      target: {
        lightingLevel: 'magicalDarkness',
        concealment: 'none',
        auxiliary: [],
      },
      observer: {
        precise: {
          darkvision: { range: 60 }, // Observer has darkvision
        },
        imprecise: {
          hearing: { range: 30 },
        },
        conditions: {
          blinded: false,
          deafened: false,
          dazzled: false,
        },
        lightingLevel: 'bright',
      },
      hasLineOfSight: false, // Wall blocks LOS
      soundBlocked: false,
      rayDarkness: null,
    };

    const result = calculateVisibility(input);

    expect(result.state).toBe('concealed'); // In magical darkness with wall blocking LOS, darkvision sees concealed
    expect(result.detection.sense).toBe('darkvision');
    expect(result.detection.isPrecise).toBe(true);
  });

  test('no darkvision should fall back to hearing when wall blocks LOS in darkness', () => {
    const input = {
      target: {
        lightingLevel: 'greaterMagicalDarkness',
        concealment: 'none',
        auxiliary: [],
      },
      observer: {
        precise: {
          // No darkvision
        },
        imprecise: {
          hearing: { range: 30 },
        },
        conditions: {
          blinded: false,
          deafened: false,
          dazzled: false,
        },
        lightingLevel: 'bright',
      },
      hasLineOfSight: false, // Wall blocks LOS
      soundBlocked: false,
      rayDarkness: null,
    };

    const result = calculateVisibility(input);

    expect(result.state).toBe('hidden'); // No darkvision, wall blocks LOS, falls back to hearing
    expect(result.detection.sense).toBe('hearing');
    expect(result.detection.isPrecise).toBe(false);
  });

  test('wall blocks LOS in bright light should still block vision completely', () => {
    const input = {
      target: {
        lightingLevel: 'bright', // Not in darkness
        concealment: 'none',
        auxiliary: [],
      },
      observer: {
        precise: {
          darkvision: 60, // Observer has darkvision but target is in bright light
        },
        imprecise: {
          hearing: { range: 30 },
        },
        conditions: {
          blinded: false,
          deafened: false,
          dazzled: false,
        },
        lightingLevel: 'bright',
      },
      hasLineOfSight: false, // Wall blocks LOS
      soundBlocked: false,
      rayDarkness: null,
    };

    const result = calculateVisibility(input);

    expect(result.state).toBe('hidden'); // Wall blocks LOS in bright light, falls back to hearing
    expect(result.detection.sense).toBe('hearing');
    expect(result.detection.isPrecise).toBe(false);
  });
});
