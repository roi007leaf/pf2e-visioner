/**
 * @jest-environment jsdom
 */

// Mock canvas and game globals
global.canvas = {
  grid: { size: 100 },
  scene: {
    grid: { distance: 5 },
    tokens: {
      get: jest.fn(() => null),
      find: jest.fn(() => null),
    },
  },
  tokens: {
    get: jest.fn(() => null),
    placeables: [],
  },
};

global.game = {
  settings: {
    get: jest.fn(() => false),
    set: jest.fn(() => Promise.resolve()),
  },
  i18n: {
    localize: jest.fn((key) => key),
  },
};

describe('Sense the Unseen Feat Logic', () => {
  describe('Feat detection logic', () => {
    test('should detect Sense the Unseen feat by name', () => {
      const actor = {
        itemTypes: {
          feat: [
            {
              name: 'Sense the Unseen',
              system: { slug: 'sense-the-unseen' },
            },
          ],
        },
      };

      const feats = actor.itemTypes?.feat ?? [];
      const hasFeat = !!feats?.some?.((feat) => {
        const name = feat?.name?.toLowerCase?.() || '';
        const slug = feat?.system?.slug?.toLowerCase?.() || '';
        return name.includes('sense the unseen') || slug.includes('sense-the-unseen');
      });

      expect(hasFeat).toBe(true);
    });

    test('should detect Sense the Unseen feat by slug', () => {
      const actor = {
        itemTypes: {
          feat: [
            {
              name: 'Different Name',
              system: { slug: 'sense-the-unseen' },
            },
          ],
        },
      };

      const feats = actor.itemTypes?.feat ?? [];
      const hasFeat = !!feats?.some?.((feat) => {
        const name = feat?.name?.toLowerCase?.() || '';
        const slug = feat?.system?.slug?.toLowerCase?.() || '';
        return name.includes('sense the unseen') || slug.includes('sense-the-unseen');
      });

      expect(hasFeat).toBe(true);
    });

    test('should not detect feat when not present', () => {
      const actor = {
        itemTypes: {
          feat: [
            {
              name: 'Other Feat',
              system: { slug: 'other-feat' },
            },
          ],
        },
      };

      const feats = actor.itemTypes?.feat ?? [];
      const hasFeat = !!feats?.some?.((feat) => {
        const name = feat?.name?.toLowerCase?.() || '';
        const slug = feat?.system?.slug?.toLowerCase?.() || '';
        return name.includes('sense the unseen') || slug.includes('sense-the-unseen');
      });

      expect(hasFeat).toBe(false);
    });
  });

  describe('Failed outcomes detection logic', () => {
    test('should detect failed outcomes with undetected targets', () => {
      const outcomes = [
        {
          outcome: 'failure',
          currentVisibility: 'undetected',
        },
        {
          outcome: 'critical-failure',
          currentVisibility: 'undetected',
        },
        {
          outcome: 'success',
          currentVisibility: 'hidden',
        },
        {
          outcome: 'failure',
          currentVisibility: 'hidden',
        },
      ];

      const hasFailedOutcomes = outcomes.some(
        (outcome) =>
          (outcome.outcome === 'failure' || outcome.outcome === 'critical-failure') &&
          outcome.currentVisibility === 'undetected',
      );

      expect(hasFailedOutcomes).toBe(true);
    });

    test('should not detect failed outcomes when none are undetected', () => {
      const outcomes = [
        {
          outcome: 'success',
          currentVisibility: 'hidden',
        },
        {
          outcome: 'failure',
          currentVisibility: 'hidden',
        },
      ];

      const hasFailedOutcomes = outcomes.some(
        (outcome) =>
          (outcome.outcome === 'failure' || outcome.outcome === 'critical-failure') &&
          outcome.currentVisibility === 'undetected',
      );

      expect(hasFailedOutcomes).toBe(false);
    });
  });

  describe('Sense the Unseen application logic', () => {
    test('should upgrade failed undetected outcomes to hidden', () => {
      const outcomes = [
        {
          target: { id: 'target1', name: 'Hidden Rogue' },
          outcome: 'failure',
          currentVisibility: 'undetected',
          newVisibility: 'undetected',
          changed: false,
        },
        {
          target: { id: 'target2', name: 'Sneaky Assassin' },
          outcome: 'critical-failure',
          currentVisibility: 'undetected',
          newVisibility: 'undetected',
          changed: false,
        },
        {
          target: { id: 'target3', name: 'Visible Fighter' },
          outcome: 'success',
          currentVisibility: 'hidden',
          newVisibility: 'observed',
          changed: true,
        },
        {
          target: { id: 'target4', name: 'Failed but Hidden' },
          outcome: 'failure',
          currentVisibility: 'hidden',
          newVisibility: 'hidden',
          changed: false,
        },
      ];

      // Apply Sense the Unseen logic
      const failedUndetectedOutcomes = outcomes.filter(
        (outcome) =>
          (outcome.outcome === 'failure' || outcome.outcome === 'critical-failure') &&
          outcome.currentVisibility === 'undetected',
      );

      for (const outcome of failedUndetectedOutcomes) {
        outcome.newVisibility = 'hidden';
        outcome.changed = outcome.currentVisibility !== 'hidden';
        outcome.senseUnseenApplied = true;
        outcome.hasActionableChange = outcome.changed;
      }

      // Check that failed undetected outcomes were upgraded
      expect(failedUndetectedOutcomes).toHaveLength(2);

      for (const outcome of failedUndetectedOutcomes) {
        expect(outcome.newVisibility).toBe('hidden');
        expect(outcome.changed).toBe(true);
        expect(outcome.senseUnseenApplied).toBe(true);
        expect(outcome.hasActionableChange).toBe(true);
      }

      // Check that successful outcomes were not affected
      const successfulOutcome = outcomes.find((o) => o.outcome === 'success');
      expect(successfulOutcome.newVisibility).toBe('observed'); // Unchanged
      expect(successfulOutcome.senseUnseenApplied).toBeUndefined();

      // Check that failed but already hidden outcomes were not affected
      const failedHiddenOutcome = outcomes.find(
        (o) => o.outcome === 'failure' && o.currentVisibility === 'hidden',
      );
      expect(failedHiddenOutcome.newVisibility).toBe('hidden'); // Unchanged
      expect(failedHiddenOutcome.senseUnseenApplied).toBeUndefined();
    });

    test('should handle case with no applicable outcomes', () => {
      const outcomes = [
        {
          target: { id: 'target1', name: 'Success' },
          outcome: 'success',
          currentVisibility: 'hidden',
          newVisibility: 'observed',
          changed: true,
        },
      ];

      const failedUndetectedOutcomes = outcomes.filter(
        (outcome) =>
          (outcome.outcome === 'failure' || outcome.outcome === 'critical-failure') &&
          outcome.currentVisibility === 'undetected',
      );

      expect(failedUndetectedOutcomes).toHaveLength(0);
    });
  });
});
