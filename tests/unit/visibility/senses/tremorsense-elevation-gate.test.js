import { calculateVisibility } from '../../../../scripts/visibility/StatelessVisibilityCalculator.js';

function buildInput({ observer = {}, target = {} } = {}) {
  return {
    observer: {
      precise: {},
      imprecise: { tremorsense: { range: 60 } },
      conditions: { blinded: false, deafened: false, dazzled: false },
      lightingLevel: 'bright',
      movementAction: null,
      ...observer,
    },
    target: {
      lightingLevel: 'bright',
      concealment: false,
      auxiliary: [],
      traits: [],
      movementAction: null,
      ...target,
    },
    rayDarkness: null,
    soundBlocked: false,
    hasLineOfSight: true,
  };
}

describe('Tremorsense elevation gate', () => {
  test('detects when observer and target are both on the ground', () => {
    const result = calculateVisibility(
      buildInput({ observer: { elevation: 0 }, target: { elevation: 0 } }),
    );

    expect(result.state).toBe('hidden');
    expect(result.detection.sense).toBe('tremorsense');
  });

  test('does not detect an elevated target', () => {
    const result = calculateVisibility(
      buildInput({ observer: { elevation: 0 }, target: { elevation: 10 } }),
    );

    expect(result.state).toBe('undetected');
  });

  test('does not detect from an elevated observer', () => {
    const result = calculateVisibility(
      buildInput({ observer: { elevation: 10 }, target: { elevation: 0 } }),
    );

    expect(result.state).toBe('undetected');
  });

  test('does not detect when both share a non-ground elevation', () => {
    const result = calculateVisibility(
      buildInput({ observer: { elevation: 10 }, target: { elevation: 10 } }),
    );

    expect(result.state).toBe('undetected');
  });

  test('deafened observer path applies the same ground gate', () => {
    const result = calculateVisibility(
      buildInput({
        observer: {
          elevation: 0,
          conditions: { blinded: false, deafened: true, dazzled: false },
        },
        target: { elevation: 10 },
      }),
    );

    expect(result.state).toBe('undetected');
  });

  test('precise tremorsense observes a ground target', () => {
    const result = calculateVisibility(
      buildInput({
        observer: {
          elevation: 0,
          precise: { tremorsense: { range: 60 } },
          imprecise: {},
        },
        target: { elevation: 0 },
      }),
    );

    expect(result.state).toBe('observed');
    expect(result.detection.sense).toBe('tremorsense');
    expect(result.detection.isPrecise).toBe(true);
  });

  test('precise tremorsense does not observe an elevated target', () => {
    const result = calculateVisibility(
      buildInput({
        observer: {
          elevation: 0,
          precise: { tremorsense: { range: 60 } },
          imprecise: {},
        },
        target: { elevation: 10 },
      }),
    );

    expect(result.state).toBe('undetected');
  });

  test('precise tremorsense does not observe from an elevated observer', () => {
    const result = calculateVisibility(
      buildInput({
        observer: {
          elevation: 10,
          precise: { tremorsense: { range: 60 } },
          imprecise: {},
        },
        target: { elevation: 10 },
      }),
    );

    expect(result.state).toBe('undetected');
  });

  test('invisible previousState memory does not pin hidden once line of sight is wall-blocked', () => {
    const result = calculateVisibility({
      observer: {
        precise: { vision: { range: Infinity } },
        imprecise: {},
        conditions: { blinded: false, deafened: false, dazzled: false },
        lightingLevel: 'bright',
        movementAction: null,
      },
      target: {
        lightingLevel: 'bright',
        concealment: false,
        auxiliary: ['invisible'],
        traits: [],
        movementAction: null,
      },
      previousState: 'observed',
      soundBlocked: true,
      hasLineOfSight: false,
    });

    expect(result.state).toBe('undetected');
  });

  test('invisible previousState memory still pins hidden while line of sight is clear', () => {
    const result = calculateVisibility({
      observer: {
        precise: { vision: { range: Infinity } },
        imprecise: {},
        conditions: { blinded: false, deafened: false, dazzled: false },
        lightingLevel: 'bright',
        movementAction: null,
      },
      target: {
        lightingLevel: 'bright',
        concealment: false,
        auxiliary: ['invisible'],
        traits: [],
        movementAction: null,
      },
      previousState: 'observed',
      hasLineOfSight: true,
    });

    expect(result.state).toBe('hidden');
    expect(result.detection.sense).toBe('vision');
  });

  test('falls back to hearing for an elevated target when hearing is available', () => {
    const result = calculateVisibility(
      buildInput({
        observer: {
          elevation: 0,
          imprecise: { tremorsense: { range: 60 }, hearing: { range: Infinity } },
        },
        target: { elevation: 10 },
      }),
    );

    expect(result.state).toBe('hidden');
    expect(result.detection.sense).toBe('hearing');
  });
});
