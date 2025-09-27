/**
 * @jest-environment jsdom
 */

import { SeekActionHandler } from '../../scripts/chat/services/actions/seek-action.js';

// Mock canvas and game globals
global.canvas = {
  grid: { size: 100 },
  scene: { grid: { distance: 5 } },
};

global.game = {
  settings: {
    get: jest.fn(() => false),
  },
  i18n: {
    localize: jest.fn((key) => {
      const translations = {
        'PF2E_VISIONER.SEEK_AUTOMATION.UNMET_CONDITIONS': 'Unmet Conditions',
      };
      return translations[key] || key;
    }),
  },
};

describe('Unmet Conditions for Special Senses', () => {
  describe('Integration test', () => {
    test('should generate unmet-conditions outcome with explanation', async () => {
      const seekHandler = new SeekActionHandler();
      // Mock the imports and methods
      const mockVisionAnalyzer = {
        getInstance: () => ({
          getSensingSummary: () => ({
            lifesense: { range: 10 },
          }),
          canDetectWithSpecialSense: async () => false, // Cannot detect
        }),
      };

      const mockConstants = {
        SPECIAL_SENSES: {
          lifesense: {
            hasRangeLimit: true,
            detectsConstructs: false,
          },
        },
      };

      // Mock the dynamic imports
      const originalImport = global.import;
      global.import = jest.fn((path) => {
        if (path.includes('VisionAnalyzer')) {
          return Promise.resolve({ VisionAnalyzer: mockVisionAnalyzer });
        }
        if (path.includes('constants')) {
          return Promise.resolve(mockConstants);
        }
        return originalImport(path);
      });

      const actionData = {
        actor: {
          center: { x: 100, y: 100 },
          document: { getFlag: jest.fn(() => ({})) },
          actor: {
            system: {
              perception: {
                senses: [{ type: 'lifesense', acuity: 'imprecise', range: 10 }],
              },
            },
          },
        },
        roll: { total: 25 },
      };

      const constructTarget = {
        center: { x: 105, y: 100 },
        document: { getFlag: jest.fn(() => ({})) },
        actor: {
          type: 'npc',
          system: { details: { creatureType: 'construct' } },
        },
      };

      // Mock outcome determination and other required functions
      global.determineOutcome = jest.fn(() => 'success');

      try {
        const result = await seekHandler.analyzeOutcome(actionData, constructTarget);

        expect(result.outcome).toBe('unmet-conditions');
        expect(result.unmetConditions).toBe(true);
        expect(result.unmetCondition).toBe(
          'Constructs have no life force or void energy to detect',
        );
        expect(result.changed).toBe(false);
      } finally {
        // Restore original import
        global.import = originalImport;
      }
    });
  });
});
