/**
 * @jest-environment jsdom
 */

import { SeekActionHandler } from '../../scripts/chat/services/actions/seek-action.js';
import { VisionAnalyzer } from '../../scripts/visibility/auto-visibility/VisionAnalyzer.js';

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
  },
  i18n: {
    localize: jest.fn((key) => key),
  },
};

describe('Echolocation Effect as Precise Sense', () => {
  let seekHandler;
  let visionAnalyzer;

  beforeEach(() => {
    seekHandler = new SeekActionHandler();
    visionAnalyzer = VisionAnalyzer.getInstance();

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('Echolocation effect detection', () => {
    test('echolocation effect should be detected as precise sense in sensing summary', () => {
      const tokenWithEcholocationEffect = {
        actor: {
          itemTypes: {
            effect: [
              {
                slug: 'effect-echolocation',
                name: 'Echolocation',
                system: { slug: 'effect-echolocation' },
              },
            ],
          },
          system: {
            perception: {
              senses: [{ type: 'hearing', acuity: 'imprecise', range: 30 }],
            },
          },
        },
      };

      const sensingSummary = visionAnalyzer.getSensingSummary(tokenWithEcholocationEffect);

      // Verify echolocation is detected
      expect(sensingSummary.echolocationActive).toBe(true);
      expect(sensingSummary.echolocationRange).toBe(40);

      // Verify hearing is upgraded to precise within echolocation range
      expect(sensingSummary.precise).toHaveLength(1);
      expect(sensingSummary.precise[0]).toEqual({
        type: 'hearing',
        range: 40, // Should use echolocation range
      });
    });

    test('echolocation effect should enable precise non-visual sense detection', () => {
      const observerWithEcholocationEffect = {
        center: { x: 100, y: 100 },
        actor: {
          itemTypes: {
            effect: [
              {
                slug: 'effect-echolocation',
                name: 'Echolocation',
                system: { slug: 'effect-echolocation' },
              },
            ],
          },
          system: {
            perception: {
              senses: [{ type: 'hearing', acuity: 'imprecise', range: 30 }],
            },
          },
        },
      };

      const targetWithinRange = {
        center: { x: 120, y: 100 }, // 20 feet away, within echolocation range
      };

      const hasPrecise = visionAnalyzer.hasPreciseNonVisualInRange(
        observerWithEcholocationEffect,
        targetWithinRange,
      );

      expect(hasPrecise).toBe(true);
    });

    test('echolocation effect should respect range limitations', () => {
      const observerWithEcholocationEffect = {
        center: { x: 100, y: 100 },
        actor: {
          itemTypes: {
            effect: [
              {
                slug: 'effect-echolocation',
                name: 'Echolocation',
                system: { slug: 'effect-echolocation' },
              },
            ],
          },
          system: {
            perception: {
              senses: [{ type: 'hearing', acuity: 'imprecise', range: 30 }],
            },
          },
        },
      };

      const targetOutOfRange = {
        center: { x: 1100, y: 100 }, // 1000 pixels = 50 feet away, outside echolocation range (40 ft)
      };

      const hasPrecise = visionAnalyzer.hasPreciseNonVisualInRange(
        observerWithEcholocationEffect,
        targetOutOfRange,
      );

      expect(hasPrecise).toBe(false);
    });
  });

  describe('Echolocation effect in seek action', () => {
    test('blinded observer with echolocation effect should achieve observed on critical success', async () => {
      const blindedObserverWithEcholocationEffect = {
        id: 'observer1',
        name: 'Blinded Bat',
        center: { x: 200, y: 200 },
        actor: {
          itemTypes: {
            effect: [
              {
                slug: 'effect-echolocation',
                name: 'Echolocation',
                system: { slug: 'effect-echolocation' },
              },
            ],
            condition: [{ slug: 'blinded', name: 'Blinded' }],
          },
          system: {
            perception: {
              senses: [{ type: 'hearing', acuity: 'imprecise', range: 30 }],
            },
          },
        },
        document: { getFlag: jest.fn(() => ({})) },
      };

      const target = {
        id: 'target1',
        name: 'Hidden Rogue',
        center: { x: 220, y: 200 }, // 20 feet away, within echolocation range
        actor: {
          type: 'character',
          system: {
            details: { creatureType: 'humanoid' },
            traits: { value: [] },
          },
        },
        document: { getFlag: jest.fn(() => ({})) },
      };

      const actionData = {
        actor: blindedObserverWithEcholocationEffect,
        roll: {
          total: 25,
          dice: [{ results: [{ result: 20 }] }],
        },
        total: 25, // Critical success roll
        die: 20,
        dc: 15,
      };

      // Mock the vision capabilities to show blinded (no visual precise)
      jest.spyOn(visionAnalyzer, 'getVisionCapabilities').mockReturnValue({
        hasVision: false,
        isBlinded: true,
      });

      const result = await seekHandler.analyzeOutcome(actionData, target);

      // Critical success with echolocation effect should result in observed
      expect(result.outcome).toBe('critical-success');
      expect(result.newVisibility).toBe('observed'); // Echolocation effect enables precise sense
    });

    test('blinded observer with echolocation effect outside range should not achieve observed', async () => {
      const blindedObserverWithEcholocationEffect = {
        id: 'observer2',
        name: 'Blinded Bat',
        center: { x: 300, y: 300 },
        actor: {
          itemTypes: {
            effect: [
              {
                slug: 'effect-echolocation',
                name: 'Echolocation',
                system: { slug: 'effect-echolocation' },
              },
            ],
            condition: [{ slug: 'blinded', name: 'Blinded' }],
          },
          system: {
            perception: {
              senses: [{ type: 'hearing', acuity: 'imprecise', range: 30 }],
            },
          },
        },
        document: { getFlag: jest.fn(() => ({})) },
      };

      const targetOutOfRange = {
        id: 'target2',
        name: 'Distant Rogue',
        center: { x: 1300, y: 300 }, // 1000 pixels = 50 feet away, outside echolocation range
        actor: {
          type: 'character',
          system: {
            details: { creatureType: 'humanoid' },
            traits: { value: [] },
          },
        },
        document: { getFlag: jest.fn(() => ({})) },
      };

      const actionData = {
        actor: blindedObserverWithEcholocationEffect,
        roll: {
          total: 25,
          dice: [{ results: [{ result: 20 }] }],
        },
        total: 25, // Critical success roll
        die: 20,
        dc: 15,
      };

      // Mock the vision capabilities to show blinded (no visual precise)
      jest.spyOn(visionAnalyzer, 'getVisionCapabilities').mockReturnValue({
        hasVision: false,
        isBlinded: true,
      });

      const result = await seekHandler.analyzeOutcome(actionData, targetOutOfRange);

      // Critical success but outside echolocation range should cap at hidden
      expect(result.outcome).toBe('critical-success');
      expect(result.newVisibility).toBe('hidden'); // No precise sense in range
    });

    test('echolocation effect vs echolocation sense should both work as precise', async () => {
      // Test that both the temporary effect and permanent sense work the same way
      const observerWithEcholocationSense = {
        id: 'observer3',
        name: 'Bat with Natural Echolocation',
        center: { x: 400, y: 400 },
        actor: {
          itemTypes: {
            condition: [{ slug: 'blinded', name: 'Blinded' }],
          },
          system: {
            perception: {
              senses: [{ type: 'echolocation', acuity: 'precise', range: 40 }],
            },
          },
        },
        document: { getFlag: jest.fn(() => ({})) },
      };

      const target = {
        id: 'target3',
        name: 'Target',
        center: { x: 420, y: 400 }, // 20 feet away
        actor: {
          type: 'character',
          system: {
            details: { creatureType: 'humanoid' },
            traits: { value: [] },
          },
        },
        document: { getFlag: jest.fn(() => ({})) },
      };

      const actionData = {
        actor: observerWithEcholocationSense,
        roll: {
          total: 25,
          dice: [{ results: [{ result: 20 }] }],
        },
        total: 25,
        die: 20,
        dc: 15,
      };

      // Mock the vision capabilities to show blinded
      jest.spyOn(visionAnalyzer, 'getVisionCapabilities').mockReturnValue({
        hasVision: false,
        isBlinded: true,
      });

      const result = await seekHandler.analyzeOutcome(actionData, target);

      // Both effect and natural sense should achieve observed
      expect(result.outcome).toBe('critical-success');
      expect(result.newVisibility).toBe('observed');
    });
  });

  describe('Echolocation effect vs module flag compatibility', () => {
    test('should prefer effect over module flag when both present', () => {
      const tokenWithBoth = {
        actor: {
          itemTypes: {
            effect: [
              {
                slug: 'effect-echolocation',
                name: 'Echolocation',
                system: { slug: 'effect-echolocation' },
              },
            ],
          },
          system: {
            perception: {
              senses: [{ type: 'hearing', acuity: 'imprecise', range: 30 }],
            },
          },
          getFlag: jest.fn(() => ({ active: true, range: 60 })), // Module flag with different range
        },
      };

      const sensingSummary = visionAnalyzer.getSensingSummary(tokenWithBoth);

      // Should use effect (40 ft) not module flag (60 ft)
      expect(sensingSummary.echolocationActive).toBe(true);
      expect(sensingSummary.echolocationRange).toBe(40); // Effect range, not flag range
    });

    test('should fall back to module flag when no effect present', () => {
      const tokenWithFlagOnly = {
        actor: {
          itemTypes: {
            effect: [],
          },
          system: {
            perception: {
              senses: [{ type: 'hearing', acuity: 'imprecise', range: 30 }],
            },
          },
          getFlag: jest.fn(() => ({ active: true, range: 50 })),
        },
      };

      const sensingSummary = visionAnalyzer.getSensingSummary(tokenWithFlagOnly);

      // Should use module flag
      expect(sensingSummary.echolocationActive).toBe(true);
      expect(sensingSummary.echolocationRange).toBe(50); // Flag range
    });
  });
});
