import { calculateVisibility } from '../../../../scripts/visibility/StatelessVisibilityCalculator.js';

function buildInput({
  precise = {},
  imprecise = {},
  conditions = {},
  target = {},
  hasLineOfSight = true,
  soundBlocked = false,
} = {}) {
  return {
    target: {
      lightingLevel: 'bright',
      concealment: false,
      auxiliary: ['invisible'],
      traits: [],
      movementAction: 0,
      ...target,
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

describe('Thoughtsense sight and hearing gate', () => {
  describe('Precise Thoughtsense', () => {
    test('detects invisible thinking targets when sight and hearing paths are usable', () => {
      const result = calculateVisibility(buildInput({ precise: { thoughtsense: { range: 30 } } }));

      expect(result.state).toBe('observed');
      expect(result.detection.sense).toBe('thoughtsense');
      expect(result.detection.isPrecise).toBe(true);
    });

    test('detects through sight-blocking walls', () => {
      const result = calculateVisibility(
        buildInput({ precise: { thoughtsense: { range: 30 } }, hasLineOfSight: false }),
      );

      expect(result.state).toBe('observed');
      expect(result.detection.sense).toBe('thoughtsense');
      expect(result.detection.isPrecise).toBe(true);
    });

    test('detects when sound is blocked', () => {
      const result = calculateVisibility(
        buildInput({ precise: { thoughtsense: { range: 30 } }, soundBlocked: true }),
      );

      expect(result.state).toBe('observed');
      expect(result.detection.sense).toBe('thoughtsense');
      expect(result.detection.isPrecise).toBe(true);
    });

    test('detects when both sight and hearing are disabled by conditions', () => {
      const result = calculateVisibility(
        buildInput({
          precise: { thoughtsense: { range: 30 } },
          conditions: { blinded: true, deafened: true },
        }),
      );

      expect(result.state).toBe('observed');
      expect(result.detection.sense).toBe('thoughtsense');
      expect(result.detection.isPrecise).toBe(true);
    });

    test('still detects blind-deaf observers through blocked paths', () => {
      const result = calculateVisibility(
        buildInput({
          precise: { thoughtsense: { range: 30 } },
          conditions: { blinded: true, deafened: true },
          hasLineOfSight: false,
          soundBlocked: true,
        }),
      );

      expect(result.state).toBe('observed');
      expect(result.detection.sense).toBe('thoughtsense');
      expect(result.detection.isPrecise).toBe(true);
    });

    test('does not detect mindless creatures', () => {
      const result = calculateVisibility(
        buildInput({
          precise: { thoughtsense: { range: 30 } },
          target: { traits: ['mindless'] },
        }),
      );

      expect(result.state).toBe('undetected');
      expect(result.detection).toBeNull();
    });

    test('does not detect constructs', () => {
      const result = calculateVisibility(
        buildInput({
          precise: { thoughtsense: { range: 30 } },
          target: { traits: ['construct'] },
        }),
      );

      expect(result.state).toBe('undetected');
      expect(result.detection).toBeNull();
    });

    test('detects undead creatures without the mindless trait', () => {
      const result = calculateVisibility(
        buildInput({
          precise: { thoughtsense: { range: 30 } },
          target: { traits: ['undead'] },
        }),
      );

      expect(result.state).toBe('observed');
      expect(result.detection.sense).toBe('thoughtsense');
      expect(result.detection.isPrecise).toBe(true);
    });
  });

  describe('Imprecise Thoughtsense', () => {
    test('detects invisible thinking targets as hidden when sight and hearing paths are usable', () => {
      const result = calculateVisibility(
        buildInput({ imprecise: { thoughtsense: { range: 30 } } }),
      );

      expect(result.state).toBe('hidden');
      expect(result.detection.sense).toBe('thoughtsense');
      expect(result.detection.isPrecise).toBe(false);
    });

    test('detects through sight-blocking walls', () => {
      const result = calculateVisibility(
        buildInput({ imprecise: { thoughtsense: { range: 30 } }, hasLineOfSight: false }),
      );

      expect(result.state).toBe('hidden');
      expect(result.detection.sense).toBe('thoughtsense');
      expect(result.detection.isPrecise).toBe(false);
    });

    test('detects as hidden when both sight and hearing are disabled by conditions', () => {
      const result = calculateVisibility(
        buildInput({
          imprecise: { thoughtsense: { range: 30 } },
          conditions: { blinded: true, deafened: true },
        }),
      );

      expect(result.state).toBe('hidden');
      expect(result.detection.sense).toBe('thoughtsense');
      expect(result.detection.isPrecise).toBe(false);
    });
  });
});
