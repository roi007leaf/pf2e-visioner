import { calculateVisibility } from '../../../scripts/visibility/StatelessVisibilityCalculator.js';

describe('Rank 4 Darkness + Darkvision Logic Test', () => {

  it('step 4a logic should return concealed for darkvision in rank 4 darkness', () => {
    const input = {
      observer: {
        precise: {
          vision: { range: Infinity },
          darkvision: { range: Infinity },
          greaterDarkvision: null
        },
        imprecise: {},
        conditions: {
          blinded: false,
          deafened: false,
          dazzled: false
        }
      },
      target: {
        lightingLevel: 'greaterMagicalDarkness',
        coverLevel: 'none',
        concealment: false,
        auxiliary: []
      }
    };

    const result = calculateVisibility(input);
    expect(result.state).toBe('concealed');
  });

  it('step 4a logic should return observed for greater darkvision in rank 4 darkness', () => {
    const input = {
      observer: {
        precise: {
          vision: { range: Infinity },
          darkvision: { range: Infinity },
          greaterDarkvision: { range: Infinity }
        },
        imprecise: {},
        conditions: {
          blinded: false,
          deafened: false,
          dazzled: false
        }
      },
      target: {
        lightingLevel: 'greaterMagicalDarkness',
        coverLevel: 'none',
        concealment: false,
        auxiliary: []
      }
    };

    const result = calculateVisibility(input);
    expect(result.state).toBe('observed');
  });

  it('step 4a logic should return hidden for no darkvision in rank 4 darkness', () => {
    const input = {
      observer: {
        precise: {
          vision: { range: Infinity },
          darkvision: null,
          greaterDarkvision: null
        },
        imprecise: {},
        conditions: {
          blinded: false,
          deafened: false,
          dazzled: false
        }
      },
      target: {
        lightingLevel: 'greaterMagicalDarkness',
        coverLevel: 'none',
        concealment: false,
        auxiliary: []
      }
    };

    const result = calculateVisibility(input);
    expect(result.state).toBe('undetected');
  });
});
