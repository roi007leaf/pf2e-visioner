/**
 * @jest-environment jsdom
 */

import { VisionAnalyzer } from '../../scripts/visibility/auto-visibility/VisionAnalyzer.js';

describe('Deafened Condition Support', () => {
  let visionAnalyzer;

  beforeEach(() => {
    // Setup mocks
    global.canvas = {
      grid: { size: 100 },
      scene: { grid: { distance: 5 } },
    };

    global.game = {
      settings: {
        get: jest.fn(() => false),
      },
    };

    visionAnalyzer = new VisionAnalyzer();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('should exclude hearing from sensing summary when deafened', () => {
    const token = {
      actor: {
        name: 'Test Actor',
        hasCondition: jest.fn((condition) => condition === 'deafened'),
        system: {
          perception: {
            senses: [{ type: 'hearing', acuity: 'imprecise', range: 30 }],
          },
        },
      },
    };

    const summary = visionAnalyzer.getSensingCapabilities(token);

    // Should have called hasCondition with 'deafened'
    expect(token.actor.hasCondition).toHaveBeenCalledWith('deafened');

    // Should NOT have hearing in summary since deafened (check both precise and imprecise)
    expect(summary.precise.hearing).toBeUndefined();
    expect(summary.imprecise.hearing).toBeUndefined();
  });

  test('should include hearing in sensing summary when not deafened', () => {
    const token = {
      actor: {
        name: 'Test Actor',
        hasCondition: jest.fn(() => false), // Not deafened
        system: {
          perception: {
            senses: [{ type: 'hearing', acuity: 'imprecise', range: 30 }],
          },
        },
      },
    };

    const summary = visionAnalyzer.getSensingCapabilities(token);

    // Should have hearing in imprecise senses since not deafened
    expect(summary.imprecise.hearing).toBeDefined();
    expect(summary.imprecise.hearing).toBe(30);
  });

  test('should prevent imprecise sensing via hearing when deafened', () => {
    const observer = {
      center: { x: 0, y: 0 },
      actor: {
        name: 'Deafened Observer',
        hasCondition: jest.fn((condition) => condition === 'deafened'),
        system: {
          perception: {
            vision: false, // Explicitly disable vision to test only hearing
            senses: [{ type: 'hearing', acuity: 'imprecise', range: 30 }],
          },
        },
      },
      document: {
        detectionModes: [],
        elevation: 0,
      },
    };

    const target = {
      center: { x: 20, y: 0 }, // Within hearing range
      document: { elevation: 0 },
    };

    const result = visionAnalyzer.canSenseImprecisely(observer, target);
    expect(result).toBe(false); // Cannot sense via hearing when deafened
  });

  test('should allow imprecise sensing via non-hearing senses when deafened', () => {
    const observer = {
      center: { x: 0, y: 0 },
      actor: {
        name: 'Deafened Observer',
        hasCondition: jest.fn((condition) => condition === 'deafened'),
        system: {
          perception: {
            senses: [
              { type: 'hearing', acuity: 'imprecise', range: 30 },
              { type: 'tremorsense', acuity: 'imprecise', range: 30 },
            ],
          },
        },
      },
      document: {
        detectionModes: [],
        elevation: 0,
      },
    };

    const target = {
      center: { x: 20, y: 0 }, // Within range
      document: { elevation: 0 },
    };

    const result = visionAnalyzer.canSenseImprecisely(observer, target);
    // Tremorsense should work even when deafened (it's not hearing-based)
    expect(result).toBe(true); // Can still sense via tremorsense when deafened
  });

  test('should prevent echolocation when deafened', () => {
    const observer = {
      center: { x: 0, y: 0 },
      actor: {
        name: 'Deafened Observer',
        hasCondition: jest.fn((condition) => condition === 'deafened'),
        system: {
          perception: {
            senses: [{ type: 'echolocation', acuity: 'precise', range: 40 }],
          },
        },
      },
      document: {
        detectionModes: [],
        elevation: 0,
      },
    };

    const target = {
      center: { x: 30, y: 0 }, // Within echolocation range
      document: { elevation: 0 },
    };

    const result = visionAnalyzer.hasPreciseNonVisualInRange(observer, target);
    expect(result).toBe(false); // Cannot use echolocation when deafened
  });

  test('should allow non-hearing precise senses when deafened', () => {
    const observer = {
      center: { x: 0, y: 0 },
      actor: {
        name: 'Deafened Observer',
        hasCondition: jest.fn((condition) => condition === 'deafened'),
        system: {
          perception: {
            senses: [
              { type: 'echolocation', acuity: 'precise', range: 40 },
              { type: 'tremorsense', acuity: 'precise', range: 30 },
            ],
          },
        },
      },
      document: {
        detectionModes: [],
        elevation: 0,
      },
    };

    const target = {
      center: { x: 25, y: 0 }, // Within tremorsense range
      document: { elevation: 0 },
    };

    const result = visionAnalyzer.hasPreciseNonVisualInRange(observer, target);
    // Tremorsense should work even when deafened (it's not hearing-based)
    expect(result).toBe(true); // Can still use precise tremorsense when deafened
  });
});
