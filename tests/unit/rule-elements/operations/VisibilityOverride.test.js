import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { VisibilityOverride } from '../../../../scripts/rule-elements/operations/VisibilityOverride.js';
import { SourceTracker } from '../../../../scripts/rule-elements/SourceTracker.js';

// Mock dependencies
jest.mock('../../../../scripts/rule-elements/SourceTracker.js');
jest.mock('../../../../scripts/stores/visibility-map.js', () => ({
  setVisibilityBetween: jest.fn(),
  getVisibilityBetween: jest.fn(),
}));

describe('VisibilityOverride', () => {
  let mockSubjectToken;
  let mockObserverTokens;
  let mockSetVisibilityBetween;

  beforeEach(async () => {
    jest.clearAllMocks();
    
    const visibilityMap = await import('../../../../scripts/stores/visibility-map.js');
    mockSetVisibilityBetween = visibilityMap.setVisibilityBetween;

    mockSubjectToken = {
      id: 'subject-token',
      name: 'Subject Token',
      actor: { hasPlayerOwner: true },
      document: {
        id: 'subject-token',
        setFlag: jest.fn(() => Promise.resolve()),
        unsetFlag: jest.fn(() => Promise.resolve()),
        getFlag: jest.fn(() => null),
        update: jest.fn(() => Promise.resolve()),
        flags: { 'pf2e-visioner': {} }
      },
    };

    mockObserverTokens = [
      {
        id: 'observer-1',
        name: 'Observer 1',
        actor: { hasPlayerOwner: true },
        document: { 
          id: 'observer-1',
          getFlag: jest.fn(() => null),
        },
      },
      {
        id: 'observer-2',
        name: 'Observer 2',
        actor: { hasPlayerOwner: false, token: { disposition: -1 } },
        document: { 
          id: 'observer-2',
          getFlag: jest.fn(() => null),
        },
      },
    ];

    global.canvas = {
      tokens: {
        placeables: [mockSubjectToken, ...mockObserverTokens],
      },
      grid: {
        measureDistance: jest.fn(() => 10),
      },
      perception: {
        update: jest.fn(),
      }
    };
    
    // Setup window mock
    if (!global.window) {
      global.window = {};
    }
    
    global.window.pf2eVisioner = {
      services: {
        autoVisibilitySystem: {
          recalculateForTokens: jest.fn(),
          recalculateAll: jest.fn(),
        }
      }
    };
  });

  describe('applyVisibilityOverride', () => {
    it('should set global override flag when no predicates are used', async () => {
      const operation = {
        state: 'hidden',
        source: 'test-source',
        direction: 'to',
        observers: 'all',
        priority: 50
      };

      await VisibilityOverride.applyVisibilityOverride(operation, mockSubjectToken);

      // Should set the global ruleElementOverride flag
      expect(mockSubjectToken.document.setFlag).toHaveBeenCalledWith(
        'pf2e-visioner',
        'ruleElementOverride',
        expect.objectContaining({
          active: true,
          source: expect.stringContaining('test-source'),
          state: 'hidden',
          direction: 'to'
        })
      );
      
      // Should also set per-pair visibility
      expect(mockSetVisibilityBetween).toHaveBeenCalledTimes(2);
      expect(SourceTracker.addSourceToState).toHaveBeenCalledTimes(2);
    });

    it('should NOT set global override flag when predicates are used', async () => {
      const operation = {
        state: 'hidden',
        source: 'test-source',
        direction: 'to',
        observers: 'all',
        predicate: ['target:trait:undead']
      };

      // Mock predicate helper to return true
      const { PredicateHelper } = await import('../../../../scripts/rule-elements/PredicateHelper.js');
      jest.spyOn(PredicateHelper, 'getTokenRollOptions').mockReturnValue(['trait:undead']);
      jest.spyOn(PredicateHelper, 'getTargetRollOptions').mockReturnValue(['target:trait:undead']);
      jest.spyOn(PredicateHelper, 'combineRollOptions').mockReturnValue(['trait:undead', 'target:trait:undead']);
      jest.spyOn(PredicateHelper, 'evaluate').mockReturnValue(true);

      await VisibilityOverride.applyVisibilityOverride(operation, mockSubjectToken);

      // Should NOT set the global ruleElementOverride flag
      expect(mockSubjectToken.document.setFlag).not.toHaveBeenCalledWith(
        'pf2e-visioner',
        'ruleElementOverride',
        expect.anything()
      );
      
      // Should still set per-pair visibility
      expect(mockSetVisibilityBetween).toHaveBeenCalled();
    });

    it('should set visibilityReplacement flag when fromStates and toState are provided', async () => {
      const operation = {
        fromStates: ['observed'],
        toState: 'hidden',
        source: 'replacement-source',
        direction: 'to',
        priority: 100
      };

      await VisibilityOverride.applyVisibilityOverride(operation, mockSubjectToken);

      expect(mockSubjectToken.document.setFlag).toHaveBeenCalledWith(
        'pf2e-visioner',
        'visibilityReplacement',
        expect.objectContaining({
          active: true,
          fromStates: ['observed'],
          toState: 'hidden',
          id: expect.stringContaining('replacement-source')
        })
      );
      
      // Should NOT set per-pair visibility for replacement
      expect(mockSetVisibilityBetween).not.toHaveBeenCalled();
    });

    it('should trigger recalculation when requested', async () => {
      const operation = {
        state: 'hidden',
        source: 'test-source',
        triggerRecalculation: true
      };

      await VisibilityOverride.applyVisibilityOverride(operation, mockSubjectToken);

      expect(window.pf2eVisioner.services.autoVisibilitySystem.recalculateForTokens).toHaveBeenCalledWith(
        expect.arrayContaining([mockSubjectToken.id])
      );
    });
  });

  describe('removeVisibilityOverride', () => {
    it('should remove override by ruleElementId', async () => {
      const ruleElementId = 'test-re-id';
      
      // Mock existing flag
      mockSubjectToken.document.getFlag.mockImplementation((scope, key) => {
        if (key === 'ruleElementOverride') return { source: ruleElementId };
        return null;
      });

      await VisibilityOverride.removeVisibilityOverride({}, mockSubjectToken, ruleElementId);

      expect(mockSubjectToken.document.unsetFlag).toHaveBeenCalledWith(
        'pf2e-visioner',
        'ruleElementOverride'
      );
    });

    it('should remove override by sourceId from operation', async () => {
      const operation = { source: 'test-source' };
      
      // Mock existing flag to return something so it proceeds to cleanup
      mockSubjectToken.document.getFlag.mockImplementation((scope, key) => {
        if (key === 'ruleElementOverride') return { source: 'test-source' };
        return null;
      });

      await VisibilityOverride.removeVisibilityOverride(operation, mockSubjectToken);

      expect(mockSubjectToken.document.unsetFlag).toHaveBeenCalledWith(
        'pf2e-visioner',
        'ruleElementOverride'
      );
    });

    it('should remove visibilityReplacement flag', async () => {
      const operation = { source: 'replacement-source' };
      
      // Mock existing replacement flag
      mockSubjectToken.document.getFlag.mockImplementation((scope, key) => {
        if (key === 'visibilityReplacement') return { id: 'replacement-source' };
        return null;
      });

      await VisibilityOverride.removeVisibilityOverride(operation, mockSubjectToken);

      expect(mockSubjectToken.document.unsetFlag).toHaveBeenCalledWith(
        'pf2e-visioner',
        'visibilityReplacement'
      );
    });
  });

  describe('getObserverTokens', () => {
    it('should return all tokens when observers is "all"', async () => {
      const tokens = VisibilityOverride.getObserverTokens(mockSubjectToken, 'all');

      expect(tokens.length).toBe(2);
      expect(tokens.map((t) => t.id)).toEqual(['observer-1', 'observer-2']);
    });

    it('should filter allies when observers is "allies"', async () => {
      const tokens = VisibilityOverride.getObserverTokens(mockSubjectToken, 'allies');

      expect(tokens.length).toBe(1);
      expect(tokens[0].id).toBe('observer-1');
    });

    it('should filter enemies when observers is "enemies"', async () => {
      const tokens = VisibilityOverride.getObserverTokens(mockSubjectToken, 'enemies');

      expect(tokens.length).toBe(1);
      expect(tokens[0].id).toBe('observer-2');
    });

    it('should filter specific tokens when observers is "specific"', async () => {
      const tokenIds = ['observer-2'];
      const tokens = VisibilityOverride.getObserverTokens(
        mockSubjectToken,
        'specific',
        null,
        tokenIds,
      );

      expect(tokens.length).toBe(1);
      expect(tokens[0].id).toBe('observer-2');
    });

    it('should apply range filter when range is specified', async () => {
      global.canvas.grid.measureDistance = jest.fn().mockReturnValueOnce(5).mockReturnValueOnce(25);

      const tokens = VisibilityOverride.getObserverTokens(mockSubjectToken, 'all', 20);

      expect(tokens.length).toBe(1);
      expect(tokens[0].id).toBe('observer-1');
    });
  });

  describe('areAllies', () => {
    it('should return true for PC vs PC', async () => {
      const actor1 = { hasPlayerOwner: true };
      const actor2 = { hasPlayerOwner: true };

      expect(VisibilityOverride.areAllies(actor1, actor2)).toBe(true);
    });

    it('should return false for PC vs NPC', async () => {
      const actor1 = { hasPlayerOwner: true };
      const actor2 = { hasPlayerOwner: false, token: { disposition: -1 } };

      expect(VisibilityOverride.areAllies(actor1, actor2)).toBe(false);
    });

    it('should return true for NPCs with same disposition', async () => {
      const actor1 = { hasPlayerOwner: false, token: { disposition: 1 } };
      const actor2 = { hasPlayerOwner: false, token: { disposition: 1 } };

      expect(VisibilityOverride.areAllies(actor1, actor2)).toBe(true);
    });
  });
});
