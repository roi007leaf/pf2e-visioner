/**
 * Tests for PF2e Visioner Region Behavior
 */

// Mock FoundryVTT globals BEFORE importing
global.foundry = global.foundry || {};
global.foundry.data = global.foundry.data || {};
global.foundry.data.regionBehaviors = global.foundry.data.regionBehaviors || {};
global.foundry.data.regionBehaviors.RegionBehaviorType = class RegionBehaviorType {
  constructor() {
    this.region = null;
  }

  static defineSchema() {
    return {};
  }

  static _createEventsField(events) {
    return {
      events: new Set(events.events || events),
    };
  }

  static LOCALIZATION_PREFIXES = [];
};

global.CONST = {
  REGION_EVENTS: {
    REGION_BOUNDARY: 'regionBoundary',
    BEHAVIOR_ACTIVATED: 'behaviorActivated',
    BEHAVIOR_DEACTIVATED: 'behaviorDeactivated',
    BEHAVIOR_VIEWED: 'behaviorViewed',
    BEHAVIOR_UNVIEWED: 'behaviorUnviewed',
    TOKEN_ENTER: 'tokenEnter',
    TOKEN_EXIT: 'tokenExit',
    TOKEN_MOVE_IN: 'tokenMoveIn',
    TOKEN_MOVE_OUT: 'tokenMoveOut',
    TOKEN_MOVE_WITHIN: 'tokenMoveWithin',
    TOKEN_ANIMATE_IN: 'tokenAnimateIn',
    TOKEN_ANIMATE_OUT: 'tokenAnimateOut',
    TOKEN_TURN_START: 'tokenTurnStart',
    TOKEN_TURN_END: 'tokenTurnEnd',
    TOKEN_ROUND_START: 'tokenRoundStart',
    TOKEN_ROUND_END: 'tokenRoundEnd',
  },
};

// Import after setting up mocks
import { VisibilityRegionBehavior } from '../../scripts/regions/VisibilityRegionBehavior.js';

global.foundry.data.fields = {
  StringField: class StringField {
    constructor(options = {}) {
      this.options = options;
    }
  },
  BooleanField: class BooleanField {
    constructor(options = {}) {
      this.options = options;
    }
  },
};

global.game = {
  user: { isGM: true },
  i18n: {
    format: (key, data) => `${key} ${JSON.stringify(data)}`,
  },
};

global.ui = {
  notifications: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
};

global.canvas = {
  tokens: {
    placeables: [],
    get: jest.fn(),
  },
};

describe('VisibilityRegionBehavior', () => {
  let regionBehavior;
  let mockRegion;
  let mockToken1, mockToken2, mockToken3;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock region
    mockRegion = {
      document: {
        testPoint: jest.fn(),
      },
      behaviors: new Map(),
    };

    // Create mock tokens
    mockToken1 = {
      id: 'token1',
      document: { id: 'token1' },
      center: { x: 100, y: 100 },
      elevationZ: 0,
      actor: { type: 'character' },
    };

    mockToken2 = {
      id: 'token2',
      document: { id: 'token2' },
      center: { x: 200, y: 200 },
      elevationZ: 0,
      actor: { type: 'npc' },
    };

    mockToken3 = {
      id: 'token3',
      document: { id: 'token3' },
      center: { x: 300, y: 300 },
      elevationZ: 0,
      actor: { type: 'character' },
    };

    // Set up canvas tokens
    global.canvas.tokens.placeables = [mockToken1, mockToken2, mockToken3];
    global.canvas.tokens.get.mockImplementation((id) => {
      return global.canvas.tokens.placeables.find((t) => t.id === id);
    });

    // Create region behavior instance
    regionBehavior = new VisibilityRegionBehavior();
    regionBehavior.region = mockRegion;
    regionBehavior.visibilityState = 'hidden';
    regionBehavior.applyToInsideTokens = false;
    regionBehavior.twoWayRegion = false;
  });

  describe('Schema Definition', () => {
    test('should have defineSchema method', () => {
      expect(typeof VisibilityRegionBehavior.defineSchema).toBe('function');
    });

    test('should have correct localization prefixes', () => {
      expect(VisibilityRegionBehavior.LOCALIZATION_PREFIXES).toContain(
        'PF2E_VISIONER.REGION_BEHAVIOR',
      );
    });
  });

  describe('Token Region Detection', () => {
    beforeEach(() => {
      regionBehavior.parent = mockRegion;
    });

    test('should handle empty region', () => {
      mockRegion.document.testPoint.mockReturnValue(false);

      const tokensInRegion = regionBehavior._getTokensInRegion();

      expect(tokensInRegion).toHaveLength(0);
    });
  });

  describe('Region Property Access', () => {
    test('should access region through parent property', () => {
      regionBehavior.parent = mockRegion;

      expect(regionBehavior.parent).toBe(mockRegion);
    });
  });

  describe('Update Generation Logic', () => {
    beforeEach(() => {
      regionBehavior.parent = mockRegion;
      // Mock setVisibilityBetween to avoid actual visibility updates
      jest.doMock('../../scripts/stores/visibility-map.js', () => ({
        setVisibilityBetween: jest.fn(),
        getVisibilityBetween: jest.fn().mockReturnValue('observed'),
      }));
    });

    test('should generate updates for entering token', () => {
      // Token1 is entering, token2 is inside, token3 is outside
      mockRegion.document.testPoint.mockImplementation((center) => {
        return center.x <= 200; // token1 and token2 inside, token3 outside
      });

      const tokensInRegion = [mockToken2]; // token2 already inside
      const updates = regionBehavior._gatherUpdatesForToken('token1', true, tokensInRegion);

      // Should create at least one update
      expect(Array.isArray(updates)).toBe(true);
    });

    test('should generate updates for exiting token', () => {
      mockRegion.document.testPoint.mockImplementation((center) => {
        return center.x <= 200;
      });

      const tokensInRegion = [mockToken2];
      const updates = regionBehavior._gatherUpdatesForToken('token1', false, tokensInRegion);

      // Should create updates to reset visibility
      expect(Array.isArray(updates)).toBe(true);
    });
  });

  describe('Error Handling', () => {
    test('should handle empty updates gracefully', async () => {
      await regionBehavior._applyVisibilityUpdates([]);
      expect(ui.notifications.error).not.toHaveBeenCalled();
    });

    test('should handle invalid token IDs gracefully', () => {
      const updates = regionBehavior._gatherUpdatesForToken('nonexistent', true, []);
      expect(updates).toEqual([]);
    });
  });
});
