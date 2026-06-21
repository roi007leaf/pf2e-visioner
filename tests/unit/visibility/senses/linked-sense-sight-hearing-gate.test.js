import { calculateVisibility } from '../../../../scripts/visibility/StatelessVisibilityCalculator.js';

function buildInput({ precise = {}, imprecise = {}, conditions = {}, hasLineOfSight = true, soundBlocked = false } = {}) {
  return {
    target: {
      lightingLevel: 'bright',
      concealment: false,
      auxiliary: ['invisible'],
      traits: [],
      movementAction: 0,
    },
    observer: {
      precise: {
        vision: { range: Infinity },
        ...precise,
      },
      imprecise: {
        hearing: { range: Infinity },
        ...imprecise,
      },
      conditions: {
        blinded: false,
        deafened: false,
        dazzled: false,
        ...conditions,
      },
    },
    hasLineOfSight,
    soundBlocked,
    rayDarkness: null,
  };
}

describe('lifesense and thoughtsense sense rules', () => {
  test('precise lifesense can reveal invisible targets when sight and hearing paths are usable', () => {
    const result = calculateVisibility(buildInput({ precise: { lifesense: { range: 30 } } }));

    expect(result.state).toBe('observed');
    expect(result.detection).toMatchObject({ sense: 'lifesense', isPrecise: true });
  });

  test('precise lifesense does not reveal invisible targets without line of sight', () => {
    const result = calculateVisibility(
      buildInput({ precise: { lifesense: { range: 30 } }, hasLineOfSight: false }),
    );

    expect(result.state).toBe('undetected');
    expect(result.detection).toBeNull();
  });

  test('imprecise lifesense does not reveal invisible targets when sound is blocked', () => {
    const result = calculateVisibility(
      buildInput({ imprecise: { lifesense: { range: 30 } }, soundBlocked: true }),
    );

    expect(result.state).toBe('undetected');
    expect(result.detection).toBeNull();
  });

  test('precise thoughtsense reveals invisible targets when observer is blinded', () => {
    const result = calculateVisibility(
      buildInput({
        precise: { thoughtsense: { range: 30 } },
        conditions: { blinded: true },
      }),
    );

    expect(result.state).toBe('observed');
    expect(result.detection).toMatchObject({ sense: 'thoughtsense', isPrecise: true });
  });

  test('imprecise thoughtsense reveals invisible targets when observer is deafened', () => {
    const result = calculateVisibility(
      buildInput({
        imprecise: { thoughtsense: { range: 30 } },
        conditions: { deafened: true },
      }),
    );

    expect(result.state).toBe('hidden');
    expect(result.detection).toMatchObject({ sense: 'thoughtsense', isPrecise: false });
  });
});
