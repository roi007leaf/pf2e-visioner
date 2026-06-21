import { calculateVisibility } from '../../../../scripts/visibility/StatelessVisibilityCalculator.js';

function buildInput({
  precise = {},
  imprecise = {},
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
      },
    },
    hasLineOfSight,
    soundBlocked,
    rayDarkness: null,
  };
}

describe('Lifesense sight and hearing gate', () => {
  describe('Precise Lifesense', () => {
    test('detects invisible living targets when sight and hearing paths are usable', () => {
      const result = calculateVisibility(buildInput({ precise: { lifesense: { range: 30 } } }));

      expect(result.state).toBe('observed');
      expect(result.detection.sense).toBe('lifesense');
      expect(result.detection.isPrecise).toBe(true);
    });

    test('does not detect through sight-blocking walls', () => {
      const result = calculateVisibility(
        buildInput({ precise: { lifesense: { range: 30 } }, hasLineOfSight: false }),
      );

      expect(result.state).toBe('undetected');
      expect(result.detection).toBeNull();
    });

    test('does not detect when sound is blocked', () => {
      const result = calculateVisibility(
        buildInput({ precise: { lifesense: { range: 30 } }, soundBlocked: true }),
      );

      expect(result.state).toBe('undetected');
      expect(result.detection).toBeNull();
    });

    test('does not detect constructs even when sight and hearing paths are usable', () => {
      const result = calculateVisibility(
        buildInput({
          precise: { lifesense: { range: 30 } },
          target: { traits: ['construct'] },
        }),
      );

      expect(result.state).toBe('undetected');
      expect(result.detection).toBeNull();
    });

    test('detects undead creatures when sight and hearing paths are usable', () => {
      const result = calculateVisibility(
        buildInput({
          precise: { lifesense: { range: 30 } },
          target: { traits: ['undead'] },
        }),
      );

      expect(result.state).toBe('observed');
      expect(result.detection.sense).toBe('lifesense');
      expect(result.detection.isPrecise).toBe(true);
    });
  });

  describe('Imprecise Lifesense', () => {
    test('detects invisible living targets as hidden when sight and hearing paths are usable', () => {
      const result = calculateVisibility(buildInput({ imprecise: { lifesense: { range: 30 } } }));

      expect(result.state).toBe('hidden');
      expect(result.detection.sense).toBe('lifesense');
      expect(result.detection.isPrecise).toBe(false);
    });

    test('does not detect through sight-blocking walls', () => {
      const result = calculateVisibility(
        buildInput({ imprecise: { lifesense: { range: 30 } }, hasLineOfSight: false }),
      );

      expect(result.state).toBe('undetected');
      expect(result.detection).toBeNull();
    });
  });

  describe('Lifesense Priority Over Vision', () => {
    test('prefers vision over lifesense when vision already observes the target', () => {
      const result = calculateVisibility(
        buildInput({
          precise: { lifesense: { range: 30 } },
          target: { auxiliary: [] },
        }),
      );

      expect(result.state).toBe('observed');
      expect(result.detection.sense).toBe('vision');
      expect(result.detection.isPrecise).toBe(true);
    });
  });
});
