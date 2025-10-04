/**
 * @jest-environment jsdom
 */

import { SeekActionHandler } from '../../../../scripts/chat/services/actions/SeekAction.js';
import { VisionAnalyzer } from '../../../../scripts/visibility/auto-visibility/VisionAnalyzer.js';

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

describe('Imprecise Sense Visibility Cap', () => {
  let seekHandler;
  let visionAnalyzer;

  beforeEach(() => {
    seekHandler = new SeekActionHandler();
    visionAnalyzer = VisionAnalyzer.getInstance();

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('Imprecise senses cap visibility at hidden', () => {
    test('lifesense critical success should result in hidden, not observed', async () => {
      const blindedObserverWithLifesense = {
        id: 'observer1',
        name: 'Blinded Oracle',
        center: { x: 100, y: 100 },
        actor: {
          system: {
            perception: {
              senses: [{ type: 'lifesense', acuity: 'imprecise', range: 10 }],
            },
            traits: {
              senses: [{ type: 'lifesense', acuity: 'imprecise', range: 10 }],
            },
          },
          itemTypes: {
            condition: [{ slug: 'blinded', name: 'Blinded' }],
          },
        },
        document: { getFlag: jest.fn(() => ({})) },
      };

      const livingTarget = {
        id: 'target1',
        name: 'Human Fighter',
        center: { x: 105, y: 105 }, // 5 feet away, within lifesense range
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
        actor: blindedObserverWithLifesense,
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
        sensingSummary: {
          precise: [], // No precise non-visual senses
          imprecise: [{ type: 'lifesense', range: 10 }], // Has lifesense but it's imprecise
        },
      });

      // Mock no precise non-visual senses in range
      jest.spyOn(visionAnalyzer, 'hasPreciseNonVisualInRange').mockReturnValue(false);

      const result = await seekHandler.analyzeOutcome(actionData, livingTarget);

      // Even with a critical success (roll 25 vs DC 15), imprecise sense should cap at hidden
      expect(result.outcome).toBe('critical-success');
      expect(result.newVisibility).toBe('hidden'); // Not 'observed' - imprecise sense caps at hidden
      expect(result.changed).toBe(true); // Assuming target was observed before
    });

    test('tremorsense success should result in hidden, not observed', async () => {
      const blindedObserverWithTremorsense = {
        id: 'observer2',
        name: 'Blinded Monk',
        center: { x: 200, y: 200 },
        actor: {
          system: {
            perception: {
              senses: [{ type: 'tremorsense', acuity: 'imprecise', range: 30 }],
            },
          },
          itemTypes: {
            condition: [{ slug: 'blinded', name: 'Blinded' }],
          },
        },
        document: { getFlag: jest.fn(() => ({})) },
      };

      const constructTarget = {
        id: 'target2',
        name: 'Iron Golem',
        center: { x: 220, y: 200 }, // 20 feet away, within tremorsense range
        actor: {
          type: 'npc',
          system: {
            details: { creatureType: 'construct' },
            traits: { value: ['construct'] },
          },
        },
        document: { getFlag: jest.fn(() => ({})) },
      };

      const actionData = {
        actor: blindedObserverWithTremorsense,
        roll: {
          total: 17,
          dice: [{ results: [{ result: 10 }] }],
        },
        total: 17, // Success roll (margin = 1, not critical)
        die: 10,
        dc: 16,
      };

      // Mock the vision capabilities to show blinded (no visual precise)
      jest.spyOn(visionAnalyzer, 'getVisionCapabilities').mockReturnValue({
        hasVision: false,
        isBlinded: true,
        sensingSummary: {
          precise: [], // No precise non-visual senses
          imprecise: [{ type: 'tremorsense', range: 30 }], // Has tremorsense but it's imprecise
        },
      });

      // Mock no precise non-visual senses in range
      jest.spyOn(visionAnalyzer, 'hasPreciseNonVisualInRange').mockReturnValue(false);

      const result = await seekHandler.analyzeOutcome(actionData, constructTarget);

      // Success/Critical success with imprecise sense should result in hidden
      expect(['success', 'critical-success']).toContain(result.outcome);
      expect(result.newVisibility).toBe('hidden');
    });

    test('echolocation critical success should result in observed (precise sense)', async () => {
      const blindedObserverWithEcholocation = {
        id: 'observer3',
        name: 'Blinded Bat',
        center: { x: 300, y: 300 },
        actor: {
          system: {
            perception: {
              senses: [{ type: 'echolocation', acuity: 'precise', range: 40 }],
            },
          },
          itemTypes: {
            condition: [{ slug: 'blinded', name: 'Blinded' }],
          },
        },
        document: { getFlag: jest.fn(() => ({})) },
      };

      const target = {
        id: 'target3',
        name: 'Rogue',
        center: { x: 320, y: 300 }, // 20 feet away, within echolocation range
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
        actor: blindedObserverWithEcholocation,
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
        sensingSummary: {
          precise: [{ type: 'echolocation', range: 40 }], // Echolocation is precise
          imprecise: [],
        },
      });

      // Mock precise non-visual sense in range (echolocation)
      jest.spyOn(visionAnalyzer, 'hasPreciseNonVisualInRange').mockReturnValue(true);

      const result = await seekHandler.analyzeOutcome(actionData, target);

      // Critical success with precise sense should result in observed
      expect(result.outcome).toBe('critical-success');
      expect(result.newVisibility).toBe('observed'); // Precise sense allows observed
    });

    test('normal vision critical success should result in observed', async () => {
      const sightedObserver = {
        id: 'observer4',
        name: 'Human Fighter',
        center: { x: 400, y: 400 },
        actor: {
          system: {
            perception: {
              senses: [],
            },
          },
          itemTypes: {
            condition: [],
          },
        },
        document: { getFlag: jest.fn(() => ({})) },
      };

      const target = {
        id: 'target4',
        name: 'Hidden Rogue',
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
        actor: sightedObserver,
        roll: {
          total: 25,
          dice: [{ results: [{ result: 20 }] }],
        },
        total: 25, // Critical success roll
        die: 20,
        dc: 15,
      };

      // Mock normal vision capabilities (not blinded)
      jest.spyOn(visionAnalyzer, 'getVisionCapabilities').mockReturnValue({
        hasVision: true,
        isBlinded: false,
        sensingSummary: {
          precise: [{ type: 'vision', range: Infinity }],
          imprecise: [],
        },
      });

      const result = await seekHandler.analyzeOutcome(actionData, target);

      // Critical success with normal vision should result in observed
      expect(result.outcome).toBe('critical-success');
      expect(result.newVisibility).toBe('observed'); // Normal vision allows observed
    });
  });

  describe('Mixed senses scenarios', () => {
    test('blinded observer with both lifesense and echolocation should use echolocation for observed', async () => {
      const observerWithBothSenses = {
        id: 'observer5',
        name: 'Blinded Oracle with Echolocation',
        center: { x: 500, y: 500 },
        actor: {
          system: {
            perception: {
              senses: [
                { type: 'lifesense', acuity: 'imprecise', range: 10 },
                { type: 'echolocation', acuity: 'precise', range: 40 },
              ],
            },
          },
          itemTypes: {
            condition: [{ slug: 'blinded', name: 'Blinded' }],
          },
        },
        document: { getFlag: jest.fn(() => ({})) },
      };

      const target = {
        id: 'target5',
        name: 'Living Target',
        center: { x: 520, y: 500 }, // 20 feet away, within both ranges
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
        actor: observerWithBothSenses,
        roll: {
          total: 25,
          dice: [{ results: [{ result: 20 }] }],
        },
        total: 25, // Critical success roll
        die: 20,
        dc: 15,
      };

      // Mock blinded but with precise non-visual sense
      jest.spyOn(visionAnalyzer, 'getVisionCapabilities').mockReturnValue({
        hasVision: false,
        isBlinded: true,
        sensingSummary: {
          precise: [{ type: 'echolocation', range: 40 }],
          imprecise: [{ type: 'lifesense', range: 10 }],
        },
      });

      // Mock echolocation as precise non-visual sense in range
      jest.spyOn(visionAnalyzer, 'hasPreciseNonVisualInRange').mockReturnValue(true);

      const result = await seekHandler.analyzeOutcome(actionData, target);

      // Should use echolocation (precise) for observed result
      expect(result.outcome).toBe('critical-success');
      expect(result.newVisibility).toBe('observed'); // Echolocation allows observed
    });
  });
});
