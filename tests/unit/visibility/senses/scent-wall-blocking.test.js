import { describe, expect, test } from '@jest/globals';
import { calculateVisibility } from '../../../../scripts/visibility/StatelessVisibilityCalculator.js';

function input(acuity, overrides = {}) {
  return {
    target: { lightingLevel: 'bright', auxiliary: [] },
    observer: {
      precise: { vision: { range: Infinity } },
      imprecise: { hearing: { range: 60 } },
      conditions: {},
      [acuity]: {
        ...(acuity === 'precise' ? { vision: { range: Infinity } } : { hearing: { range: 60 } }),
        scent: { range: 60 },
      },
    },
    hasLineOfSight: false,
    soundBlocked: true,
    scentBlocked: true,
    ...overrides,
  };
}

describe.each(['imprecise', 'precise'])('%s scent wall blocking (#306)', (acuity) => {
  test('wall configured to block scent prevents detection without a manual override', () => {
    const result = calculateVisibility(input(acuity));
    expect(result.state).toBe('undetected');
    expect(result.detection).toBeNull();
  });

  test('blinded observer cannot smell through a scent-blocking wall', () => {
    const state = input(acuity);
    state.observer.conditions.blinded = true;
    expect(calculateVisibility(state).state).toBe('undetected');
  });

  test('opening the wall restores normal visual observation', () => {
    const result = calculateVisibility(input(acuity, { hasLineOfSight: true, soundBlocked: false, scentBlocked: false }));
    expect(result.state).toBe('observed');
    expect(result.detection.sense).toBe('vision');
  });

  test('sight-only barrier still permits scent of an invisible target', () => {
    const result = calculateVisibility(input(acuity, {
      soundBlocked: false,
      scentBlocked: false,
      target: { lightingLevel: 'darkness', auxiliary: ['invisible'] },
    }));
    expect(result.state).toBe(acuity === 'precise' ? 'observed' : 'hidden');
    expect(result.detection.sense).toBe('scent');
  });

  test('blocked scent does not suppress tremorsense', () => {
    const state = input(acuity);
    state.observer.imprecise.tremorsense = { range: 60 };
    const result = calculateVisibility(state);
    expect(result.state).toBe('hidden');
    expect(result.detection.sense).toBe('tremorsense');
  });

  test('Silence does not stop smell even without line of sight', () => {
    const result = calculateVisibility(input(acuity, { scentBlocked: false }));
    expect(result.state).toBe(acuity === 'precise' ? 'observed' : 'hidden');
    expect(result.detection.sense).toBe('scent');
  });
});
