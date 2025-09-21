/**
 * @jest-environment jsdom
 */

import { SPECIAL_SENSES } from '../../scripts/constants.js';
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

describe('Seek Dialog All Special Senses Badges', () => {
  let visionAnalyzer;

  beforeEach(() => {
    visionAnalyzer = new VisionAnalyzer();
  });

  describe('Multiple special senses detection', () => {
    test('detects and formats multiple special senses correctly', () => {
      const tokenWithMultipleSenses = {
        actor: {
          system: {
            perception: {
              senses: [
                { type: 'lifesense', acuity: 'imprecise', range: 10 },
                { type: 'tremorsense', acuity: 'imprecise', range: 30 },
                { type: 'scent', acuity: 'imprecise', range: 30 },
                { type: 'echolocation', acuity: 'precise', range: 40 },
              ],
            },
          },
        },
      };

      const sensingSummary = visionAnalyzer.getSensingSummary(tokenWithMultipleSenses);

      // Verify all senses are detected
      expect(sensingSummary.lifesense).toEqual({ range: 10 });
      expect(sensingSummary.tremorsense).toEqual({ range: 30 });
      expect(sensingSummary.scent).toEqual({ range: 30 });
      expect(sensingSummary.echolocation).toEqual({ range: 40 });

      // Verify they're in the correct acuity arrays
      expect(sensingSummary.imprecise).toHaveLength(3); // lifesense, tremorsense, scent
      expect(sensingSummary.precise).toHaveLength(1); // echolocation
    });

    test('handles mixed range values including infinity', () => {
      const tokenWithMixedRanges = {
        actor: {
          system: {
            perception: {
              senses: [
                { type: 'lifesense', acuity: 'imprecise', range: 10 },
                { type: 'tremorsense', acuity: 'imprecise', range: Infinity },
                { type: 'scent', acuity: 'imprecise', range: 0 }, // Disabled
              ],
            },
          },
        },
      };

      const sensingSummary = visionAnalyzer.getSensingSummary(tokenWithMixedRanges);

      expect(sensingSummary.lifesense.range).toBe(10);
      expect(sensingSummary.tremorsense.range).toBe(Infinity);
      expect(sensingSummary.scent.range).toBe(0);
    });

    test('handles object format senses', () => {
      const tokenWithObjectSenses = {
        actor: {
          system: {
            perception: {
              senses: {
                lifesense: { acuity: 'imprecise', range: 15 },
                tremorsense: { acuity: 'imprecise', range: 25 },
                scent: { acuity: 'imprecise', range: 35 },
              },
            },
          },
        },
      };

      const sensingSummary = visionAnalyzer.getSensingSummary(tokenWithObjectSenses);

      expect(sensingSummary.lifesense).toEqual({ range: 15 });
      expect(sensingSummary.tremorsense).toEqual({ range: 25 });
      expect(sensingSummary.scent).toEqual({ range: 35 });
    });
  });

  describe('SPECIAL_SENSES configuration completeness', () => {
    test('all special senses have required display properties', () => {
      for (const [senseType, config] of Object.entries(SPECIAL_SENSES)) {
        expect(config).toHaveProperty('label');
        expect(config).toHaveProperty('description');
        expect(config).toHaveProperty('icon');
        expect(config).toHaveProperty('type');
        expect(config).toHaveProperty('defaultRange');

        // Verify icon is a valid FontAwesome class
        expect(config.icon).toMatch(/^fas? fa-/);

        // Verify type is valid
        expect(['precise', 'imprecise']).toContain(config.type);

        // Verify range is a number
        expect(typeof config.defaultRange).toBe('number');
        expect(config.defaultRange).toBeGreaterThan(0);
      }
    });

    test('each sense has unique icon', () => {
      const icons = Object.values(SPECIAL_SENSES).map((config) => config.icon);
      const uniqueIcons = new Set(icons);
      expect(uniqueIcons.size).toBe(icons.length);
    });

    test('sense configurations are logically consistent', () => {
      const { lifesense, echolocation, tremorsense, scent } = SPECIAL_SENSES;

      // Lifesense should be imprecise and detect living/undead but not constructs
      expect(lifesense.type).toBe('imprecise');
      expect(lifesense.detectsLiving).toBe(true);
      expect(lifesense.detectsUndead).toBe(true);
      expect(lifesense.detectsConstructs).toBe(false);

      // Echolocation should be precise and detect everything (sound-based)
      expect(echolocation.type).toBe('precise');
      expect(echolocation.detectsLiving).toBe(true);
      expect(echolocation.detectsUndead).toBe(true);
      expect(echolocation.detectsConstructs).toBe(true);

      // Tremorsense should be imprecise and detect everything (vibration-based)
      expect(tremorsense.type).toBe('imprecise');
      expect(tremorsense.detectsLiving).toBe(true);
      expect(tremorsense.detectsUndead).toBe(true);
      expect(tremorsense.detectsConstructs).toBe(true);

      // Scent should be imprecise and only detect living creatures
      expect(scent.type).toBe('imprecise');
      expect(scent.detectsLiving).toBe(true);
      expect(scent.detectsUndead).toBe(false);
      expect(scent.detectsConstructs).toBe(false);
    });
  });

  describe('Badge display logic', () => {
    test('creates proper badge data structure', () => {
      // This would be the structure created by the seek dialog
      const mockActiveSenses = [
        {
          type: 'lifesense',
          range: 10,
          config: SPECIAL_SENSES.lifesense,
        },
        {
          type: 'tremorsense',
          range: 30,
          config: SPECIAL_SENSES.tremorsense,
        },
      ];

      // Verify structure
      for (const sense of mockActiveSenses) {
        expect(sense).toHaveProperty('type');
        expect(sense).toHaveProperty('range');
        expect(sense).toHaveProperty('config');
        expect(sense.config).toHaveProperty('label');
        expect(sense.config).toHaveProperty('description');
        expect(sense.config).toHaveProperty('icon');
      }
    });
  });
});
