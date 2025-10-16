import { RuleElementChecker } from '../../../scripts/rule-elements/RuleElementChecker.js';

describe('RuleElementChecker', () => {
  let mockObserverToken, mockTargetToken;

  beforeEach(() => {
    mockObserverToken = {
      id: 'observer-1',
      name: 'Observer',
      actor: {
        itemTypes: {
          condition: [{ slug: 'invisible' }, { slug: 'concealed' }],
        },
      },
      document: {
        getFlag: jest.fn(),
      },
      distanceTo: jest.fn().mockReturnValue(25),
    };

    mockTargetToken = {
      id: 'target-1',
      name: 'Target',
      actor: {
        itemTypes: {
          condition: [],
        },
      },
      document: {
        getFlag: jest.fn(),
      },
    };
  });

  describe('checkRuleElements', () => {
    it('should return null when no rule elements are active', () => {
      mockObserverToken.document.getFlag.mockReturnValue(null);
      mockTargetToken.document.getFlag.mockReturnValue(null);

      const result = RuleElementChecker.checkRuleElements(mockObserverToken, mockTargetToken);
      expect(result).toBeNull();
    });

    it('should return distance-based visibility result when active', () => {
      mockObserverToken.document.getFlag.mockImplementation((namespace, key) => {
        if (key === 'distanceBasedVisibility') {
          return {
            active: true,
            direction: 'to',
            source: 'heavy-precipitation',
            priority: 150,
            distanceBands: [
              { minDistance: 0, maxDistance: 30, state: 'observed' },
              { minDistance: 30, maxDistance: null, state: 'concealed' },
            ],
          };
        }
        return null;
      });
      mockTargetToken.document.getFlag.mockReturnValue(null);

      const result = RuleElementChecker.checkRuleElements(mockObserverToken, mockTargetToken);

      expect(result).toEqual({
        state: 'observed',
        source: 'heavy-precipitation',
        priority: 150,
        distance: 25,
        type: 'distanceBasedVisibility',
      });
    });

    it('should return rule element override result when active', () => {
      mockObserverToken.document.getFlag.mockImplementation((namespace, key) => {
        if (key === 'ruleElementOverride') {
          return {
            active: true,
            state: 'hidden',
            source: 'blur-spell',
            priority: 200,
          };
        }
        return null;
      });
      mockTargetToken.document.getFlag.mockReturnValue(null);

      const result = RuleElementChecker.checkRuleElements(mockObserverToken, mockTargetToken);

      expect(result).toEqual({
        state: 'hidden',
        source: 'blur-spell',
        priority: 200,
        type: 'ruleElementOverride',
      });
    });

    it('should return highest priority result when multiple effects are active', () => {
      mockObserverToken.document.getFlag.mockImplementation((namespace, key) => {
        if (key === 'distanceBasedVisibility') {
          return {
            active: true,
            direction: 'to',
            source: 'heavy-precipitation',
            priority: 100,
            distanceBands: [{ minDistance: 0, maxDistance: 30, state: 'observed' }],
          };
        }
        if (key === 'ruleElementOverride') {
          return {
            active: true,
            state: 'hidden',
            source: 'blur-spell',
            priority: 200,
          };
        }
        return null;
      });
      mockTargetToken.document.getFlag.mockReturnValue(null);

      const result = RuleElementChecker.checkRuleElements(mockObserverToken, mockTargetToken);

      // Should return the higher priority rule element override
      expect(result).toEqual({
        state: 'hidden',
        source: 'blur-spell',
        priority: 200,
        type: 'ruleElementOverride',
      });
    });
  });

  describe('checkDistanceBasedVisibility', () => {
    it('should return null when no distance-based visibility is active', () => {
      mockObserverToken.document.getFlag.mockReturnValue(null);
      mockTargetToken.document.getFlag.mockReturnValue(null);

      const result = RuleElementChecker.checkDistanceBasedVisibility(
        mockObserverToken,
        mockTargetToken,
      );
      expect(result).toBeNull();
    });

    it('should return correct state for observer direction', () => {
      mockObserverToken.document.getFlag.mockImplementation((namespace, key) => {
        if (key === 'distanceBasedVisibility') {
          return {
            active: true,
            direction: 'to',
            source: 'heavy-precipitation',
            priority: 150,
            distanceBands: [
              { minDistance: 0, maxDistance: 30, state: 'observed' },
              { minDistance: 30, maxDistance: null, state: 'concealed' },
            ],
          };
        }
        return null;
      });
      mockTargetToken.document.getFlag.mockReturnValue(null);

      const result = RuleElementChecker.checkDistanceBasedVisibility(
        mockObserverToken,
        mockTargetToken,
      );

      expect(result).toEqual({
        state: 'observed',
        source: 'heavy-precipitation',
        priority: 150,
        distance: 25,
        type: 'distanceBasedVisibility',
      });
    });
  });

  describe('checkRuleElementOverride', () => {
    it('should return null when no override is active', () => {
      mockObserverToken.document.getFlag.mockReturnValue(null);
      mockTargetToken.document.getFlag.mockReturnValue(null);

      const result = RuleElementChecker.checkRuleElementOverride(
        mockObserverToken,
        mockTargetToken,
      );
      expect(result).toBeNull();
    });

    it('should return override state when active', () => {
      mockObserverToken.document.getFlag.mockImplementation((namespace, key) => {
        if (key === 'ruleElementOverride') {
          return {
            active: true,
            state: 'hidden',
            source: 'blur-spell',
            priority: 200,
          };
        }
        return null;
      });
      mockTargetToken.document.getFlag.mockReturnValue(null);

      const result = RuleElementChecker.checkRuleElementOverride(
        mockObserverToken,
        mockTargetToken,
      );

      expect(result).toEqual({
        state: 'hidden',
        source: 'blur-spell',
        priority: 200,
        type: 'ruleElementOverride',
      });
    });
  });

  describe('checkConditionalState', () => {
    it('should return null when no conditional state is active', () => {
      mockObserverToken.document.getFlag.mockReturnValue(null);
      mockTargetToken.document.getFlag.mockReturnValue(null);

      const result = RuleElementChecker.checkConditionalState(mockObserverToken, mockTargetToken);
      expect(result).toBeNull();
    });

    it('should return thenState when condition is met', () => {
      mockObserverToken.document.getFlag.mockImplementation((namespace, key) => {
        if (key === 'conditionalState') {
          return {
            active: true,
            condition: 'invisible',
            thenState: 'hidden',
            elseState: 'observed',
            source: 'conditional-effect',
            priority: 100,
          };
        }
        return null;
      });
      mockTargetToken.document.getFlag.mockReturnValue(null);

      const result = RuleElementChecker.checkConditionalState(mockObserverToken, mockTargetToken);

      expect(result).toEqual({
        state: 'hidden',
        source: 'conditional-effect',
        priority: 100,
        type: 'conditionalState',
        conditionMet: true,
      });
    });

    it('should return elseState when condition is not met', () => {
      mockObserverToken.document.getFlag.mockImplementation((namespace, key) => {
        if (key === 'conditionalState') {
          return {
            active: true,
            condition: 'hidden',
            thenState: 'undetected',
            elseState: 'observed',
            source: 'conditional-effect',
            priority: 100,
          };
        }
        return null;
      });
      mockTargetToken.document.getFlag.mockReturnValue(null);

      const result = RuleElementChecker.checkConditionalState(mockObserverToken, mockTargetToken);

      expect(result).toEqual({
        state: 'observed',
        source: 'conditional-effect',
        priority: 100,
        type: 'conditionalState',
        conditionMet: false,
      });
    });
  });

  describe('getApplicableDistanceBand', () => {
    it('should return correct band for distance within range', () => {
      const distanceBands = [
        { minDistance: 0, maxDistance: 30, state: 'observed' },
        { minDistance: 30, maxDistance: null, state: 'concealed' },
      ];

      const result = RuleElementChecker.getApplicableDistanceBand(25, distanceBands);
      expect(result).toEqual({ minDistance: 0, maxDistance: 30, state: 'observed' });
    });

    it('should return null when no band matches', () => {
      const distanceBands = [
        { minDistance: 0, maxDistance: 10, state: 'observed' },
        { minDistance: 20, maxDistance: 30, state: 'concealed' },
      ];

      const result = RuleElementChecker.getApplicableDistanceBand(15, distanceBands);
      expect(result).toBeNull();
    });
  });

  describe('evaluateCondition', () => {
    it('should return true when actor has the condition', () => {
      const result = RuleElementChecker.evaluateCondition(mockObserverToken.actor, 'invisible');
      expect(result).toBe(true);
    });

    it('should return false when actor does not have the condition', () => {
      const result = RuleElementChecker.evaluateCondition(mockObserverToken.actor, 'hidden');
      expect(result).toBe(false);
    });

    it('should return false for unknown condition', () => {
      const result = RuleElementChecker.evaluateCondition(mockObserverToken.actor, 'unknown');
      expect(result).toBe(false);
    });
  });
});
