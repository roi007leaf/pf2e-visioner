/**
 * Tests for PF2e Visioner Region Behavior
 */

// Mock FoundryVTT globals BEFORE importing
global.foundry = global.foundry || {};
global.foundry.data = global.foundry.data || {};
global.foundry.data.regionBehaviors = global.foundry.data.regionBehaviors || {};
global.foundry.data.regionBehaviors.RegionBehaviorType = class RegionBehaviorType {
  get region() { return this.parent?.region ?? null; }

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
const { VisibilityRegionBehavior } = require('../../../scripts/regions/VisibilityRegionBehavior.js');
import AvsOverrideManager from '../../../scripts/chat/services/infra/AvsOverrideManager.js';
jest.mock('../../../scripts/stores/visibility-map.js', () => ({
  getVisibility: jest.fn(() => 'undetected'), getVisibilityBetween: jest.fn(() => 'undetected'), setVisibilityBetween: jest.fn(),
}));

VisibilityRegionBehavior._createEventsField = (events) => ({
  events: new Set(events.events || events),
});

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
    regionBehavior.parent = { region: mockRegion };
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

    test('excludes encounter-only unnoticed from visibility choices while keeping AVS', () => {
      const schema = VisibilityRegionBehavior.defineSchema();
      const choices = Object.keys(schema.visibilityState.options.choices);

      expect(choices).toEqual(
        expect.arrayContaining(['avs', 'observed', 'concealed', 'hidden', 'undetected']),
      );
      expect(choices).not.toContain('unnoticed');
    });
  });

  describe('Token Region Detection', () => {
    beforeEach(() => {
      regionBehavior.parent = { region: mockRegion };
    });

    test('finds contained tokens through the native behavior document hierarchy', () => {
      mockRegion.document.testPoint.mockImplementation(point => point.x === 100 && point.elevation === 10);
      mockToken1.document.elevation = 10;
      expect(regionBehavior._getTokensInRegion()).toEqual([mockToken1]);
    });

    test('should handle empty region', () => {
      mockRegion.document.testPoint.mockReturnValue(false);

      const tokensInRegion = regionBehavior._getTokensInRegion();

      expect(tokensInRegion).toHaveLength(0);
    });
  });

  describe('Region Property Access', () => {
    test('resolves the region through its parent behavior document', () => {
      regionBehavior.parent = { region: mockRegion };

      expect(regionBehavior.region).toBe(mockRegion);
    });
  });

  describe('Update Generation Logic', () => {
    test.each(['ready', 'different-scene', 'timeout'])('queued events survive canvas rebuild with %s cleanup', async outcome => {
      jest.useFakeTimers();
      const saved = { ready: canvas.ready, loading: canvas.loading, scene: canvas.scene };
      let resume;
      const once = jest.spyOn(Hooks, 'once').mockImplementation((_name, callback) => { resume = callback; return 9123; });
      const off = jest.spyOn(Hooks, 'off').mockImplementation(() => {});
      canvas.scene = { id: 'qa-scene' };
      canvas.ready = false; canvas.loading = true;
      mockRegion.document.testPoint.mockImplementation(point => point.x === 100);
      regionBehavior._applyVisibilityUpdates = jest.fn();
      regionBehavior._pendingTokenEvents = new Map([['token1', { id: 'token1', isEntering: true, eventName: CONST.REGION_EVENTS.TOKEN_ENTER }]]);
      try {
        await regionBehavior._processPendingEvents();
        await regionBehavior._processPendingEvents();
        expect(once).toHaveBeenCalledTimes(1);
        expect(regionBehavior._pendingTokenEvents.size).toBe(1);
        expect(regionBehavior._applyVisibilityUpdates).not.toHaveBeenCalled();
        if (outcome === 'timeout') jest.advanceTimersByTime(60000);
        else {
          // Native canvasReady fires while loading is still true.
          canvas.ready = true; canvas.loading = true;
          if (outcome === 'different-scene') canvas.scene = { id: 'other' };
          await resume();
        }
        expect(regionBehavior._pendingTokenEvents.size).toBe(0);
        expect(regionBehavior._applyVisibilityUpdates).toHaveBeenCalledTimes(outcome === 'ready' ? 1 : 0);
        expect(off).toHaveBeenCalledWith('canvasReady', 9123);
        expect(jest.getTimerCount()).toBe(0);
      } finally {
        Object.assign(canvas, saved); once.mockRestore(); off.mockRestore(); jest.useRealTimers();
      }
    });
    test('queues native token document events while canvas placeables are absent', async () => {
      const original = canvas.tokens.placeables;
      canvas.tokens.placeables = [];
      regionBehavior._scheduleTokenEvent = jest.fn();
      try {
        await regionBehavior._handleRegionEvent({ name: CONST.REGION_EVENTS.TOKEN_ENTER, data: { token: mockToken1.document } });
        expect(regionBehavior._scheduleTokenEvent).toHaveBeenCalledWith(mockToken1.document, true, CONST.REGION_EVENTS.TOKEN_ENTER);
      } finally { canvas.tokens.placeables = original; }
    });
    test.each(['manual_action', 'region_override'])('region removal respects override source %s', async source => {
      mockToken1.document.getFlag = () => ({ source, state: 'undetected' });
      const remove = jest.spyOn(AvsOverrideManager, 'removeOverride').mockResolvedValue(true);
      try {
        await regionBehavior._applyVisibilityUpdates([{ source: 'token2', target: 'token1', state: 'observed' }]);
        expect(remove).toHaveBeenCalledTimes(source === 'region_override' ? 1 : 0);
      } finally { remove.mockRestore(); }
    });
    test('a real exit still resets when the next combatant is inside the region', () => {
      game.combat = { combatant: { tokenId: 'token2' } };
      try {
        expect(regionBehavior._gatherUpdatesForToken('token1', false, [mockToken2])).toContainEqual({ source: 'token2', target: 'token1', state: 'observed' });
      } finally { delete game.combat; }
    });
    test('a turn ending preserves visibility while that token remains in the region', async () => {
      mockRegion.document.testPoint.mockImplementation(point => point.x === 100);
      regionBehavior._applyVisibilityUpdates = jest.fn();
      regionBehavior._pendingTokenEvents = new Map([['token1', {
        id: 'token1', isEntering: false, eventName: CONST.REGION_EVENTS.TOKEN_TURN_END,
      }]]);
      await regionBehavior._processPendingEvents();
      expect(regionBehavior._applyVisibilityUpdates).toHaveBeenCalledWith(expect.arrayContaining([
        { source: 'token2', target: 'token1', state: 'hidden' },
      ]));
    });

    test.each(['BEHAVIOR_ACTIVATED', 'BEHAVIOR_DEACTIVATED'])('%s updates tokens already inside without a movement event', async key => {
      regionBehavior._getTokensInRegion = () => [mockToken1];
      regionBehavior._scheduleTokenEvent = jest.fn();
      await regionBehavior._handleRegionEvent({ name: CONST.REGION_EVENTS[key] });
      expect(regionBehavior._scheduleTokenEvent).toHaveBeenCalledWith(mockToken1, key === 'BEHAVIOR_ACTIVATED', CONST.REGION_EVENTS[key]);
    });

    beforeEach(() => {
      regionBehavior.parent = { region: mockRegion };
      // Mock setVisibilityBetween to avoid actual visibility updates
      jest.doMock('../../../scripts/stores/visibility-map.js', () => ({
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

    test('entering token updates only relationships changed by that entry', () => {
      regionBehavior.applyToInsideTokens = true;
      regionBehavior.twoWayRegion = true;

      const updates = regionBehavior._gatherUpdatesForToken(
        'token1',
        true,
        [mockToken2, mockToken3],
      );

      expect(updates).toEqual(
        expect.arrayContaining([
          { source: 'token1', target: 'token2', state: 'hidden' },
          { source: 'token2', target: 'token1', state: 'hidden' },
          { source: 'token1', target: 'token3', state: 'hidden' },
          { source: 'token3', target: 'token1', state: 'hidden' },
        ]),
      );
      expect(updates).not.toContainEqual({ source: 'token2', target: 'token3', state: 'hidden' });
      expect(updates).not.toContainEqual({ source: 'token3', target: 'token2', state: 'hidden' });
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


  test('secondary GM does not handle region broadcasts or queued writes', async () => {
    const previousUsers = game.users, previousUser = game.user;
    try {
      game.users = { activeGM: { id: 'primary' } }; game.user = { id: 'secondary', isGM: true };
      const name = jest.fn(() => CONST.REGION_EVENTS.BEHAVIOR_ACTIVATED);
      await regionBehavior._handleRegionEvent({ get name() { return name(); } });
      expect(name).not.toHaveBeenCalled();
      const source = jest.fn(() => mockToken1);
      await regionBehavior._applyVisibilityUpdates([{ get source() { return source(); }, target: mockToken2, state: 'hidden' }]);
      expect(source).not.toHaveBeenCalled();
    } finally { game.users = previousUsers; game.user = previousUser; }
  });

});
