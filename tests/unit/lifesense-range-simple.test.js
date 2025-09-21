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

describe('Lifesense Range Detection', () => {
  let visionAnalyzer;

  beforeEach(() => {
    visionAnalyzer = new VisionAnalyzer();
  });

  describe('canDetectWithLifesenseInRange', () => {
    test('detects living creature within lifesense range', () => {
      const observer = {
        center: { x: 100, y: 100 },
        actor: {
          system: {
            perception: {
              senses: [{ type: 'lifesense', acuity: 'imprecise', range: 10 }],
            },
          },
        },
      };

      const target = {
        center: { x: 105, y: 100 }, // 5 pixels = 0.25 feet (well within 10 feet range)
        actor: {
          type: 'character',
          system: { details: { creatureType: 'humanoid' } },
        },
      };

      const result = visionAnalyzer.canDetectWithLifesenseInRange(observer, target);
      expect(result).toBe(true);
    });

    test('does not detect living creature outside lifesense range', () => {
      const observer = {
        center: { x: 100, y: 100 },
        actor: {
          system: {
            perception: {
              senses: [{ type: 'lifesense', acuity: 'imprecise', range: 10 }],
            },
          },
        },
      };

      const target = {
        center: { x: 350, y: 100 }, // 250 pixels = 12.5 feet (outside 10 feet range)
        actor: {
          type: 'character',
          system: { details: { creatureType: 'humanoid' } },
        },
      };

      const result = visionAnalyzer.canDetectWithLifesenseInRange(observer, target);
      expect(result).toBe(false);
    });

    test('does not detect construct within lifesense range', () => {
      const observer = {
        center: { x: 100, y: 100 },
        actor: {
          system: {
            perception: {
              senses: [{ type: 'lifesense', acuity: 'imprecise', range: 10 }],
            },
          },
        },
      };

      const target = {
        center: { x: 105, y: 100 }, // Within range but construct
        actor: {
          type: 'npc',
          system: { details: { creatureType: 'construct' } },
        },
      };

      const result = visionAnalyzer.canDetectWithLifesenseInRange(observer, target);
      expect(result).toBe(false);
    });

    test('detects undead creature within lifesense range', () => {
      const observer = {
        center: { x: 100, y: 100 },
        actor: {
          system: {
            perception: {
              senses: [{ type: 'lifesense', acuity: 'imprecise', range: 10 }],
            },
          },
        },
      };

      const target = {
        center: { x: 105, y: 100 }, // Within range
        actor: {
          type: 'npc',
          system: { details: { creatureType: 'undead' } },
        },
      };

      const result = visionAnalyzer.canDetectWithLifesenseInRange(observer, target);
      expect(result).toBe(true);
    });

    test('returns false when observer has no lifesense', () => {
      const observer = {
        center: { x: 100, y: 100 },
        actor: {
          system: {
            perception: {
              senses: [{ type: 'darkvision', acuity: 'precise', range: 60 }],
            },
          },
        },
      };

      const target = {
        center: { x: 105, y: 100 },
        actor: {
          type: 'character',
          system: { details: { creatureType: 'humanoid' } },
        },
      };

      const result = visionAnalyzer.canDetectWithLifesenseInRange(observer, target);
      expect(result).toBe(false);
    });

    test('handles infinite lifesense range', () => {
      const observer = {
        center: { x: 100, y: 100 },
        actor: {
          system: {
            perception: {
              senses: [{ type: 'lifesense', acuity: 'imprecise', range: Infinity }],
            },
          },
        },
      };

      const target = {
        center: { x: 1000, y: 1000 }, // Very far away
        actor: {
          type: 'character',
          system: { details: { creatureType: 'humanoid' } },
        },
      };

      const result = visionAnalyzer.canDetectWithLifesenseInRange(observer, target);
      expect(result).toBe(true);
    });
  });

  describe('Integration with canSenseImprecisely', () => {
    test('lifesense allows imprecise sensing of living creatures within range', () => {
      const observer = {
        center: { x: 100, y: 100 },
        actor: {
          system: {
            perception: {
              senses: [{ type: 'lifesense', acuity: 'imprecise', range: 10 }],
            },
          },
        },
      };

      const target = {
        center: { x: 105, y: 100 }, // Within range
        actor: {
          type: 'character',
          system: { details: { creatureType: 'humanoid' } },
        },
      };

      const result = visionAnalyzer.canSenseImprecisely(observer, target);
      expect(result).toBe(true);
    });

    test('lifesense does not allow sensing of creatures outside range', () => {
      const observer = {
        center: { x: 100, y: 100 },
        actor: {
          system: {
            perception: {
              senses: [{ type: 'lifesense', acuity: 'imprecise', range: 10 }],
            },
          },
        },
      };

      const target = {
        center: { x: 350, y: 100 }, // Outside range
        actor: {
          type: 'character',
          system: { details: { creatureType: 'humanoid' } },
        },
      };

      const result = visionAnalyzer.canSenseImprecisely(observer, target);
      expect(result).toBe(false);
    });
  });
});
