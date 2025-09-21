/**
 * @jest-environment jsdom
 */

import { VisionAnalyzer } from '../../scripts/visibility/auto-visibility/VisionAnalyzer.js';

// Mock canvas and game globals
global.canvas = {
  grid: { size: 100 },
  scene: { grid: { distance: 5 } },
};

global.game = {
  settings: {
    get: jest.fn(() => false),
  },
};

describe('Seek Dialog Lifesense Badge', () => {
  let visionAnalyzer;

  beforeEach(() => {
    visionAnalyzer = new VisionAnalyzer();
  });

  describe('Lifesense detection for seek dialog', () => {
    test('detects lifesense from actor senses array', () => {
      const tokenWithLifesense = {
        actor: {
          system: {
            perception: {
              senses: [
                { type: 'lifesense', acuity: 'imprecise', range: 10 },
                { type: 'darkvision', acuity: 'precise', range: 60 },
              ],
            },
          },
        },
      };

      const sensingSummary = visionAnalyzer.getSensingSummary(tokenWithLifesense);

      expect(sensingSummary.lifesense).toBeDefined();
      expect(sensingSummary.lifesense.range).toBe(10);
    });

    test('detects lifesense from actor senses object', () => {
      const tokenWithLifesense = {
        actor: {
          system: {
            perception: {
              senses: {
                lifesense: { acuity: 'imprecise', range: 15 },
                darkvision: { acuity: 'precise', range: 60 },
              },
            },
          },
        },
      };

      const sensingSummary = visionAnalyzer.getSensingSummary(tokenWithLifesense);

      expect(sensingSummary.lifesense).toBeDefined();
      expect(sensingSummary.lifesense.range).toBe(15);
    });

    test('returns null lifesense when not present', () => {
      const tokenWithoutLifesense = {
        actor: {
          system: {
            perception: {
              senses: [{ type: 'darkvision', acuity: 'precise', range: 60 }],
            },
          },
        },
      };

      const sensingSummary = visionAnalyzer.getSensingSummary(tokenWithoutLifesense);

      expect(sensingSummary.lifesense).toBeNull();
    });

    test('handles infinite range lifesense', () => {
      const tokenWithInfiniteLifesense = {
        actor: {
          system: {
            perception: {
              senses: [{ type: 'lifesense', acuity: 'imprecise', range: Infinity }],
            },
          },
        },
      };

      const sensingSummary = visionAnalyzer.getSensingSummary(tokenWithInfiniteLifesense);

      expect(sensingSummary.lifesense).toBeDefined();
      expect(sensingSummary.lifesense.range).toBe(Infinity);
    });

    test('handles missing actor gracefully', () => {
      const tokenWithoutActor = { actor: null };

      const sensingSummary = visionAnalyzer.getSensingSummary(tokenWithoutActor);

      expect(sensingSummary.lifesense).toBeNull();
    });
  });

  describe('Integration with seek dialog context', () => {
    test('lifesense should be included in imprecise senses', () => {
      const observerWithLifesense = {
        center: { x: 100, y: 100 },
        actor: {
          system: {
            perception: {
              senses: [{ type: 'lifesense', acuity: 'imprecise', range: 10 }],
            },
          },
        },
      };

      const livingTarget = {
        center: { x: 105, y: 100 }, // Within range
        actor: {
          type: 'character',
          system: { details: { creatureType: 'humanoid' } },
        },
      };

      const sensingSummary = visionAnalyzer.getSensingSummary(observerWithLifesense);
      const canSenseImprecisely = visionAnalyzer.canSenseImprecisely(
        observerWithLifesense,
        livingTarget,
      );

      expect(sensingSummary.lifesense).toBeDefined();
      expect(sensingSummary.imprecise).toContainEqual({ type: 'lifesense', range: 10 });
      expect(canSenseImprecisely).toBe(true);
    });
  });
});
