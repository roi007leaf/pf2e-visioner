import { AuraVisibility } from '../../../../scripts/rule-elements/operations/AuraVisibility.js';
import { RuleElementChecker } from '../../../../scripts/rule-elements/RuleElementChecker.js';
import { SourceTracker } from '../../../../scripts/rule-elements/SourceTracker.js';

jest.mock('../../../../scripts/rule-elements/SourceTracker.js');
jest.mock('../../../../scripts/stores/visibility-map.js', () => ({
  setVisibilityMap: jest.fn().mockResolvedValue(undefined),
}));

describe('AuraVisibility', () => {
  let mockSourceToken, mockInsideToken1, mockInsideToken2, mockOutsideToken1, mockOutsideToken2;
  let mockCanvas;

  beforeEach(() => {
    mockSourceToken = {
      id: 'source-token',
      name: 'Source Token',
      x: 0,
      y: 0,
      actor: { hasPlayerOwner: true },
      document: {
        setFlag: jest.fn().mockResolvedValue(undefined),
        unsetFlag: jest.fn().mockResolvedValue(undefined),
        getFlag: jest.fn(() => ({})),
      },
      distanceTo: jest.fn((token) => {
        const dx = Math.abs(mockSourceToken.x - token.x);
        const dy = Math.abs(mockSourceToken.y - token.y);
        return Math.sqrt(dx * dx + dy * dy) / 5;
      }),
    };

    mockInsideToken1 = {
      id: 'inside-token-1',
      name: 'Inside Token 1',
      x: 25,
      y: 0,
      actor: { hasPlayerOwner: false },
      document: {
        setFlag: jest.fn().mockResolvedValue(undefined),
        getFlag: jest.fn(() => ({})),
      },
      distanceTo: jest.fn((token) => {
        const dx = Math.abs(mockInsideToken1.x - token.x);
        const dy = Math.abs(mockInsideToken1.y - token.y);
        return Math.sqrt(dx * dx + dy * dy) / 5;
      }),
    };

    mockInsideToken2 = {
      id: 'inside-token-2',
      name: 'Inside Token 2',
      x: 0,
      y: 25,
      actor: { hasPlayerOwner: false },
      document: {
        setFlag: jest.fn().mockResolvedValue(undefined),
        getFlag: jest.fn(() => ({})),
      },
      distanceTo: jest.fn((token) => {
        const dx = Math.abs(mockInsideToken2.x - token.x);
        const dy = Math.abs(mockInsideToken2.y - token.y);
        return Math.sqrt(dx * dx + dy * dy) / 5;
      }),
    };

    mockOutsideToken1 = {
      id: 'outside-token-1',
      name: 'Outside Token 1',
      x: 100,
      y: 0,
      actor: { hasPlayerOwner: false },
      document: {
        setFlag: jest.fn().mockResolvedValue(undefined),
        getFlag: jest.fn(() => ({})),
      },
      distanceTo: jest.fn((token) => {
        const dx = Math.abs(mockOutsideToken1.x - token.x);
        const dy = Math.abs(mockOutsideToken1.y - token.y);
        return Math.sqrt(dx * dx + dy * dy) / 5;
      }),
    };

    mockOutsideToken2 = {
      id: 'outside-token-2',
      name: 'Outside Token 2',
      x: 0,
      y: 100,
      actor: { hasPlayerOwner: false },
      document: {
        setFlag: jest.fn().mockResolvedValue(undefined),
        getFlag: jest.fn(() => ({})),
      },
      distanceTo: jest.fn((token) => {
        const dx = Math.abs(mockOutsideToken2.x - token.x);
        const dy = Math.abs(mockOutsideToken2.y - token.y);
        return Math.sqrt(dx * dx + dy * dy) / 5;
      }),
    };

    mockCanvas = {
      tokens: {
        placeables: [mockSourceToken, mockInsideToken1, mockInsideToken2, mockOutsideToken1, mockOutsideToken2],
      },
      grid: {
        measureDistance: jest.fn((token1, token2) => {
          const dx = Math.abs(token1.x - token2.x);
          const dy = Math.abs(token1.y - token2.y);
          return Math.sqrt(dx * dx + dy * dy) / 5;
        }),
      },
      perception: {
        update: jest.fn(),
      },
    };

    global.canvas = mockCanvas;
    global.window = global.window || {};
    global.window.pf2eVisioner = {
      services: {
        autoVisibilitySystem: {
          recalculateAll: jest.fn().mockResolvedValue(undefined),
        },
      },
    };

    SourceTracker.addSourceToState = jest.fn().mockResolvedValue(undefined);
    SourceTracker.removeSource = jest.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('partitionTokensByAura', () => {
    test('correctly splits tokens by distance', () => {
      const { inside, outside } = AuraVisibility.partitionTokensByAura(mockSourceToken, 10);

      expect(inside).toHaveLength(2);
      expect(outside).toHaveLength(2);
      expect(inside.map(t => t.id).sort()).toEqual(['inside-token-1', 'inside-token-2'].sort());
      expect(outside.map(t => t.id).sort()).toEqual(['outside-token-1', 'outside-token-2'].sort());
    });

    test('excludes source token from partitions', () => {
      const { inside, outside } = AuraVisibility.partitionTokensByAura(mockSourceToken, 10);

      expect(inside.find(t => t.id === 'source-token')).toBeUndefined();
      expect(outside.find(t => t.id === 'source-token')).toBeUndefined();
    });

    test('handles zero radius', () => {
      const { inside, outside } = AuraVisibility.partitionTokensByAura(mockSourceToken, 0);

      expect(inside).toHaveLength(0);
      expect(outside).toHaveLength(4);
    });

    test('handles large radius', () => {
      const { inside, outside } = AuraVisibility.partitionTokensByAura(mockSourceToken, 100);

      expect(inside).toHaveLength(4);
      expect(outside).toHaveLength(0);
    });
  });

  describe('applyAuraVisibility', () => {
    test('sets auraVisibility flag on source token', async () => {
      const operation = {
        auraRadius: 10,
        insideOutsideState: 'concealed',
        outsideInsideState: 'concealed',
        sourceExempt: true,
        source: 'kinetic-aura',
        priority: 150,
      };

      await AuraVisibility.applyAuraVisibility(operation, mockSourceToken);

      expect(mockSourceToken.document.setFlag).toHaveBeenCalledWith(
        'pf2e-visioner',
        'auraVisibility',
        expect.objectContaining({
          active: true,
          source: 'kinetic-aura',
          auraRadius: 10,
          insideOutsideState: 'concealed',
          outsideInsideState: 'concealed',
          sourceExempt: true,
          includeSourceAsTarget: false,
          auraTargets: 'all',
          priority: 150,
        })
      );
    });

    test('triggers recalculation', async () => {
      const operation = {
        auraRadius: 10,
        insideOutsideState: 'concealed',
        outsideInsideState: 'concealed',
        sourceExempt: true,
      };

      await AuraVisibility.applyAuraVisibility(operation, mockSourceToken);

      expect(window.pf2eVisioner.services.autoVisibilitySystem.recalculateAll).toHaveBeenCalled();
    });
  });

  describe('removeAuraVisibility', () => {
    test('removes sources from all tokens', async () => {
      const operation = {
        source: 'kinetic-aura',
      };

      await AuraVisibility.removeAuraVisibility(operation, mockSourceToken);

      expect(SourceTracker.removeSource).toHaveBeenCalledTimes(5);
      expect(SourceTracker.removeSource).toHaveBeenCalledWith(
        mockSourceToken,
        'kinetic-aura',
        'visibility'
      );
      expect(SourceTracker.removeSource).toHaveBeenCalledWith(
        mockInsideToken1,
        'kinetic-aura',
        'visibility'
      );
    });

    test('removes auraVisibility flag from source token', async () => {
      const operation = {
        source: 'kinetic-aura',
      };

      await AuraVisibility.removeAuraVisibility(operation, mockSourceToken);

      expect(mockSourceToken.document.unsetFlag).toHaveBeenCalledWith(
        'pf2e-visioner',
        'auraVisibility'
      );
    });

    test('uses flag source if operation source missing', async () => {
      mockSourceToken.document.getFlag = jest.fn((_scope, key) => {
        if (key === 'auraVisibility') {
          return { source: 'flag-source' };
        }
        return {};
      });

      await AuraVisibility.removeAuraVisibility({}, mockSourceToken);

      expect(SourceTracker.removeSource).toHaveBeenCalledWith(
        expect.anything(),
        'flag-source',
        'visibility'
      );
    });
  });

  describe('checkAuraVisibility', () => {
    beforeEach(() => {
      mockSourceToken.document.getFlag = jest.fn((_scope, key) => {
        if (key === 'auraVisibility') {
          return {
            active: true,
            source: 'kinetic-aura',
            auraRadius: 10,
            insideOutsideState: 'concealed',
            outsideInsideState: 'concealed',
            sourceExempt: true,
            priority: 150,
          };
        }
        return {};
      });
    });

    test('returns concealed for outside observer looking at inside target', () => {
      const result = RuleElementChecker.checkAuraVisibility(mockOutsideToken1, mockInsideToken1);

      expect(result).not.toBeNull();
      expect(result.state).toBe('concealed');
      expect(result.direction).toBe('inside-outside');
      expect(result.type).toBe('auraVisibility');
    });

    test('returns concealed for inside observer looking at outside target', () => {
      const result = RuleElementChecker.checkAuraVisibility(mockInsideToken1, mockOutsideToken1);

      expect(result).not.toBeNull();
      expect(result.state).toBe('concealed');
      expect(result.direction).toBe('outside-inside');
      expect(result.type).toBe('auraVisibility');
    });

    test('returns null for inside→inside', () => {
      const result = RuleElementChecker.checkAuraVisibility(mockInsideToken1, mockInsideToken2);

      expect(result).toBeNull();
    });

    test('returns null for outside→outside', () => {
      const result = RuleElementChecker.checkAuraVisibility(mockOutsideToken1, mockOutsideToken2);

      expect(result).toBeNull();
    });

    test('source exemption: source sees outside normally', () => {
      const result = RuleElementChecker.checkAuraVisibility(mockSourceToken, mockOutsideToken1);

      expect(result).toBeNull();
    });

    test('without source exemption: source is concealed to outside', () => {
      mockSourceToken.document.getFlag = jest.fn((_scope, key) => {
        if (key === 'auraVisibility') {
          return {
            active: true,
            source: 'kinetic-aura',
            auraRadius: 10,
            insideOutsideState: 'concealed',
            outsideInsideState: 'concealed',
            sourceExempt: false,
            priority: 150,
          };
        }
        return {};
      });

      const result = RuleElementChecker.checkAuraVisibility(mockSourceToken, mockOutsideToken1);

      expect(result).not.toBeNull();
      expect(result.state).toBe('concealed');
    });

    test('multiple auras: highest priority wins', () => {
      mockInsideToken1.document.getFlag = jest.fn((_scope, key) => {
        if (key === 'auraVisibility') {
          return {
            active: true,
            source: 'second-aura',
            auraRadius: 8,
            insideOutsideState: 'hidden',
            outsideInsideState: 'hidden',
            sourceExempt: true,
            priority: 200,
          };
        }
        return {};
      });

      mockCanvas.tokens.placeables = [
        mockSourceToken,
        mockInsideToken1,
        mockInsideToken2,
        mockOutsideToken1,
        mockOutsideToken2,
      ];

      const result = RuleElementChecker.checkAuraVisibility(mockOutsideToken1, mockSourceToken);

      expect(result).not.toBeNull();
      expect(result.priority).toBe(200);
      expect(result.state).toBe('hidden');
    });

    test('auraTargets=enemies: only affects enemies', () => {
      mockSourceToken.document.getFlag = jest.fn((_scope, key) => {
        if (key === 'auraVisibility') {
          return {
            active: true,
            source: 'kinetic-aura',
            auraRadius: 10,
            insideOutsideState: 'concealed',
            outsideInsideState: 'concealed',
            sourceExempt: true,
            auraTargets: 'enemies',
            priority: 150,
          };
        }
        return {};
      });

      mockSourceToken.actor.isAllyOf = jest.fn((actor) => actor === mockInsideToken1.actor);

      const resultEnemy = RuleElementChecker.checkAuraVisibility(mockOutsideToken1, mockInsideToken1);
      expect(resultEnemy).toBeNull();

      mockSourceToken.actor.isAllyOf = jest.fn(() => false);
      const resultAlly = RuleElementChecker.checkAuraVisibility(mockOutsideToken1, mockInsideToken1);
      expect(resultAlly).not.toBeNull();
    });

    test('auraTargets=allies: only affects allies', () => {
      mockSourceToken.document.getFlag = jest.fn((_scope, key) => {
        if (key === 'auraVisibility') {
          return {
            active: true,
            source: 'kinetic-aura',
            auraRadius: 10,
            insideOutsideState: 'concealed',
            outsideInsideState: 'concealed',
            sourceExempt: true,
            auraTargets: 'allies',
            priority: 150,
          };
        }
        return {};
      });

      mockSourceToken.actor.isAllyOf = jest.fn(() => false);
      const resultEnemy = RuleElementChecker.checkAuraVisibility(mockOutsideToken1, mockInsideToken1);
      expect(resultEnemy).toBeNull();

      mockSourceToken.actor.isAllyOf = jest.fn(() => true);
      const resultAlly = RuleElementChecker.checkAuraVisibility(mockOutsideToken1, mockInsideToken1);
      expect(resultAlly).not.toBeNull();
    });

    test('includeSourceAsTarget=false: source not concealed from outside', () => {
      mockSourceToken.document.getFlag = jest.fn((_scope, key) => {
        if (key === 'auraVisibility') {
          return {
            active: true,
            source: 'kinetic-aura',
            auraRadius: 10,
            insideOutsideState: 'concealed',
            outsideInsideState: 'concealed',
            sourceExempt: true,
            includeSourceAsTarget: false,
            priority: 150,
          };
        }
        return {};
      });

      const result = RuleElementChecker.checkAuraVisibility(mockOutsideToken1, mockSourceToken);
      expect(result).toBeNull();
    });

    test('includeSourceAsTarget=true: source IS concealed from outside', () => {
      mockSourceToken.document.getFlag = jest.fn((_scope, key) => {
        if (key === 'auraVisibility') {
          return {
            active: true,
            source: 'kinetic-aura',
            auraRadius: 10,
            insideOutsideState: 'concealed',
            outsideInsideState: 'concealed',
            sourceExempt: true,
            includeSourceAsTarget: true,
            priority: 150,
          };
        }
        return {};
      });

      const result = RuleElementChecker.checkAuraVisibility(mockOutsideToken1, mockSourceToken);
      expect(result).not.toBeNull();
      expect(result.state).toBe('concealed');
      expect(result.direction).toBe('inside-outside');
    });
  });
});
