/**
 * Unit tests for Position State Helper Functions
 */

import { jest } from '@jest/globals';

describe('Position State Helper Functions', () => {
  let PositionStateModels;
  let PositionStateHelpers;

  beforeAll(async () => {
    // Import the modules
    PositionStateModels = await import('../../scripts/chat/services/position/PositionStateModels.js');
    PositionStateHelpers = await import('../../scripts/chat/services/position/PositionStateHelpers.js');
  });

  describe('comparePositionStates', () => {
    it('should return true for identical position states', () => {
      const state1 = PositionStateModels.createDefaultPositionState({
        avsVisibility: 'hidden',
        stealthBonus: 5,
        timestamp: 1000
      });
      const state2 = PositionStateModels.createDefaultPositionState({
        avsVisibility: 'hidden',
        stealthBonus: 5,
        timestamp: 1000
      });
      
      const result = PositionStateHelpers.comparePositionStates(state1, state2);
      expect(result).toBe(true);
    });

    it('should return false for different position states', () => {
      const state1 = PositionStateModels.createDefaultPositionState({
        avsVisibility: 'hidden'
      });
      const state2 = PositionStateModels.createDefaultPositionState({
        avsVisibility: 'observed'
      });
      
      const result = PositionStateHelpers.comparePositionStates(state1, state2);
      expect(result).toBe(false);
    });

    it('should ignore timestamp when option is set', () => {
      const state1 = PositionStateModels.createDefaultPositionState({
        timestamp: 1000
      });
      const state2 = PositionStateModels.createDefaultPositionState({
        timestamp: 2000
      });
      
      const result = PositionStateHelpers.comparePositionStates(state1, state2, {
        ignoreTimestamp: true
      });
      expect(result).toBe(true);
    });

    it('should ignore system errors when option is set', () => {
      const state1 = PositionStateModels.createDefaultPositionState({
        systemErrors: ['error 1']
      });
      const state2 = PositionStateModels.createDefaultPositionState({
        systemErrors: ['error 2']
      });
      
      const result = PositionStateHelpers.comparePositionStates(state1, state2, {
        ignoreSystemErrors: true
      });
      expect(result).toBe(true);
    });

    it('should return false for invalid position states', () => {
      const validState = PositionStateModels.createDefaultPositionState();
      const invalidState = { invalid: 'state' };
      
      const result = PositionStateHelpers.comparePositionStates(validState, invalidState);
      expect(result).toBe(false);
    });
  });

  describe('analyzeStealthImprovement', () => {
    it('should detect visibility improvement', () => {
      const fromState = PositionStateModels.createDefaultPositionState({
        avsVisibility: 'observed',
        stealthBonus: 0
      });
      const toState = PositionStateModels.createDefaultPositionState({
        avsVisibility: 'hidden',
        stealthBonus: 0
      });
      
      const result = PositionStateHelpers.analyzeStealthImprovement(fromState, toState);
      expect(result.isImprovement).toBe(true);
      expect(result.details.overallImpact).toBe('improved');
      expect(result.details.visibilityChange.isImprovement).toBe(true);
    });

    it('should detect cover improvement', () => {
      const fromState = PositionStateModels.createDefaultPositionState({
        coverState: 'none',
        stealthBonus: 0
      });
      const toState = PositionStateModels.createDefaultPositionState({
        coverState: 'standard',
        stealthBonus: 2
      });
      
      const result = PositionStateHelpers.analyzeStealthImprovement(fromState, toState);
      expect(result.isImprovement).toBe(true);
      expect(result.details.overallImpact).toBe('improved');
      expect(result.details.coverChange.isImprovement).toBe(true);
      expect(result.details.stealthBonusChange).toBe(2);
    });

    it('should detect mixed changes', () => {
      const fromState = PositionStateModels.createDefaultPositionState({
        avsVisibility: 'hidden',
        coverState: 'standard',
        stealthBonus: 2
      });
      const toState = PositionStateModels.createDefaultPositionState({
        avsVisibility: 'observed',
        coverState: 'greater',
        stealthBonus: 4
      });
      
      const result = PositionStateHelpers.analyzeStealthImprovement(fromState, toState);
      expect(result.details.overallImpact).toBe('mixed');
      expect(result.details.visibilityChange.isWorsening).toBe(true);
      expect(result.details.coverChange.isImprovement).toBe(true);
    });

    it('should detect worsening', () => {
      const fromState = PositionStateModels.createDefaultPositionState({
        avsVisibility: 'hidden',
        stealthBonus: 2
      });
      const toState = PositionStateModels.createDefaultPositionState({
        avsVisibility: 'observed',
        stealthBonus: 0
      });
      
      const result = PositionStateHelpers.analyzeStealthImprovement(fromState, toState);
      expect(result.isImprovement).toBe(false);
      expect(result.details.overallImpact).toBe('worsened');
    });

    it('should handle no change', () => {
      const state = PositionStateModels.createDefaultPositionState({
        avsVisibility: 'concealed',
        stealthBonus: 1
      });
      
      const result = PositionStateHelpers.analyzeStealthImprovement(state, state);
      expect(result.isImprovement).toBe(false);
      expect(result.details.overallImpact).toBe('unchanged');
    });

    it('should handle invalid states', () => {
      const validState = PositionStateModels.createDefaultPositionState();
      const invalidState = { invalid: 'state' };
      
      const result = PositionStateHelpers.analyzeStealthImprovement(validState, invalidState);
      expect(result.isImprovement).toBe(false);
      expect(result.reason).toBe('Invalid position states');
    });
  });

  describe('analyzeVisibilityChange', () => {
    it('should detect visibility improvements', () => {
      const result = PositionStateHelpers.analyzeVisibilityChange('observed', 'hidden');
      expect(result.isImprovement).toBe(true);
      expect(result.isWorsening).toBe(false);
      expect(result.change).toBe(2);
      expect(result.description).toContain('improved');
    });

    it('should detect visibility worsening', () => {
      const result = PositionStateHelpers.analyzeVisibilityChange('undetected', 'concealed');
      expect(result.isImprovement).toBe(false);
      expect(result.isWorsening).toBe(true);
      expect(result.change).toBe(-2);
      expect(result.description).toContain('worsened');
    });

    it('should detect no change', () => {
      const result = PositionStateHelpers.analyzeVisibilityChange('hidden', 'hidden');
      expect(result.isImprovement).toBe(false);
      expect(result.isWorsening).toBe(false);
      expect(result.isUnchanged).toBe(true);
      expect(result.change).toBe(0);
      expect(result.description).toContain('unchanged');
    });
  });

  describe('analyzeCoverChange', () => {
    it('should detect cover improvements', () => {
      const result = PositionStateHelpers.analyzeCoverChange('none', 'standard', 0, 2);
      expect(result.isImprovement).toBe(true);
      expect(result.isWorsening).toBe(false);
      expect(result.coverChange).toBe(2);
      expect(result.bonusChange).toBe(2);
      expect(result.description).toContain('improved');
    });

    it('should detect cover worsening', () => {
      const result = PositionStateHelpers.analyzeCoverChange('greater', 'lesser', 4, 0);
      expect(result.isImprovement).toBe(false);
      expect(result.isWorsening).toBe(true);
      expect(result.coverChange).toBe(-2);
      expect(result.bonusChange).toBe(-4);
      expect(result.description).toContain('worsened');
    });

    it('should detect no change', () => {
      const result = PositionStateHelpers.analyzeCoverChange('standard', 'standard', 2, 2);
      expect(result.isImprovement).toBe(false);
      expect(result.isWorsening).toBe(false);
      expect(result.isUnchanged).toBe(true);
      expect(result.description).toContain('unchanged');
    });
  });

  describe('calculateDCModifier', () => {
    it('should calculate DC modifier from stealth bonus', () => {
      const state = PositionStateModels.createDefaultPositionState({
        coverState: 'standard',
        stealthBonus: 2
      });
      
      const result = PositionStateHelpers.calculateDCModifier(state);
      expect(result.modifier).toBe(2);
      expect(result.source).toContain('standard cover');
      expect(result.description).toContain('+2');
    });

    it('should handle no modifiers', () => {
      const state = PositionStateModels.createDefaultPositionState({
        stealthBonus: 0
      });
      
      const result = PositionStateHelpers.calculateDCModifier(state);
      expect(result.modifier).toBe(0);
      expect(result.source).toBe('none');
      expect(result.description).toContain('No DC modifiers');
    });

    it('should handle invalid state', () => {
      const result = PositionStateHelpers.calculateDCModifier({ invalid: 'state' });
      expect(result.modifier).toBe(0);
      expect(result.source).toBe('error');
      expect(result.description).toBe('Invalid position state');
      expect(result.errors).toBeDefined();
    });
  });

  describe('calculateStealthScore', () => {
    it('should calculate higher scores for better stealth positions', () => {
      const hiddenState = PositionStateModels.createDefaultPositionState({
        avsVisibility: 'hidden',
        coverState: 'standard',
        stealthBonus: 2,
        lightingConditions: 'darkness',
        hasLineOfSight: false
      });
      
      const observedState = PositionStateModels.createDefaultPositionState({
        avsVisibility: 'observed',
        coverState: 'none',
        stealthBonus: 0,
        lightingConditions: 'bright',
        hasLineOfSight: true
      });
      
      const hiddenScore = PositionStateHelpers.calculateStealthScore(hiddenState);
      const observedScore = PositionStateHelpers.calculateStealthScore(observedState);
      
      expect(hiddenScore).toBeGreaterThan(observedScore);
    });

    it('should return negative infinity for invalid states', () => {
      const score = PositionStateHelpers.calculateStealthScore({ invalid: 'state' });
      expect(score).toBe(-Infinity);
    });

    it('should penalize system errors', () => {
      const errorState = PositionStateModels.createDefaultPositionState({
        systemErrors: ['error 1', 'error 2']
      });
      
      const cleanState = PositionStateModels.createDefaultPositionState();
      
      const errorScore = PositionStateHelpers.calculateStealthScore(errorState);
      const cleanScore = PositionStateHelpers.calculateStealthScore(cleanState);
      
      expect(errorScore).toBeLessThan(cleanScore);
    });
  });

  describe('findBestPositionForStealth', () => {
    it('should find the best position from multiple states', () => {
      const states = [
        PositionStateModels.createDefaultPositionState({
          avsVisibility: 'observed'
        }),
        PositionStateModels.createDefaultPositionState({
          avsVisibility: 'hidden',
          coverState: 'standard'
        }),
        PositionStateModels.createDefaultPositionState({
          avsVisibility: 'concealed'
        })
      ];
      
      const result = PositionStateHelpers.findBestPositionForStealth(states);
      expect(result.bestIndex).toBe(1); // Hidden with standard cover should be best
      expect(result.bestPosition.avsVisibility).toBe('hidden');
    });

    it('should handle empty array', () => {
      const result = PositionStateHelpers.findBestPositionForStealth([]);
      expect(result.bestPosition).toBe(null);
      expect(result.bestIndex).toBe(-1);
      expect(result.reason).toContain('No position states provided');
    });

    it('should handle invalid input', () => {
      const result = PositionStateHelpers.findBestPositionForStealth('not an array');
      expect(result.bestPosition).toBe(null);
      expect(result.bestIndex).toBe(-1);
    });

    it('should handle all invalid states', () => {
      const invalidStates = [
        { invalid: 'state1' },
        { invalid: 'state2' }
      ];
      
      const result = PositionStateHelpers.findBestPositionForStealth(invalidStates);
      expect(result.bestPosition).toBe(null);
      expect(result.bestIndex).toBe(-1);
      expect(result.reason).toContain('No valid position states found');
    });
  });

  describe('groupTransitionsByType', () => {
    it('should group transitions by type correctly', () => {
      const startPos = PositionStateModels.createDefaultPositionState();
      const endPos = PositionStateModels.createDefaultPositionState();
      
      const transitions = [
        PositionStateModels.createDefaultPositionTransition('target-1', startPos, endPos, {
          transitionType: 'improved'
        }),
        PositionStateModels.createDefaultPositionTransition('target-2', startPos, endPos, {
          transitionType: 'worsened'
        }),
        PositionStateModels.createDefaultPositionTransition('target-3', startPos, endPos, {
          transitionType: 'unchanged'
        })
      ];
      
      const groups = PositionStateHelpers.groupTransitionsByType(transitions);
      expect(groups.improved).toHaveLength(1);
      expect(groups.worsened).toHaveLength(1);
      expect(groups.unchanged).toHaveLength(1);
      expect(groups.invalid).toHaveLength(0);
    });

    it('should handle invalid transitions', () => {
      const transitions = [
        { invalid: 'transition' },
        PositionStateModels.createDefaultPositionTransition('target-1')
      ];
      
      const groups = PositionStateHelpers.groupTransitionsByType(transitions);
      expect(groups.invalid).toHaveLength(1);
      expect(groups.unchanged).toHaveLength(1);
    });

    it('should handle non-array input', () => {
      const groups = PositionStateHelpers.groupTransitionsByType('not an array');
      expect(groups.improved).toHaveLength(0);
      expect(groups.worsened).toHaveLength(0);
      expect(groups.unchanged).toHaveLength(0);
      expect(groups.invalid).toHaveLength(0);
    });
  });

  describe('summarizeTransitions', () => {
    it('should summarize transitions correctly', () => {
      const startPos = PositionStateModels.createDefaultPositionState();
      const endPos = PositionStateModels.createDefaultPositionState();
      
      const transitions = [
        PositionStateModels.createDefaultPositionTransition('target-1', startPos, endPos, {
          transitionType: 'improved',
          stealthBonusChange: 2,
          impactOnDC: 2
        }),
        PositionStateModels.createDefaultPositionTransition('target-2', startPos, endPos, {
          transitionType: 'worsened',
          stealthBonusChange: -1,
          impactOnDC: -1
        }),
        PositionStateModels.createDefaultPositionTransition('target-3', startPos, endPos, {
          transitionType: 'unchanged',
          stealthBonusChange: 0,
          impactOnDC: 0
        })
      ];
      
      const summary = PositionStateHelpers.summarizeTransitions(transitions);
      expect(summary.total).toBe(3);
      expect(summary.improved).toBe(1);
      expect(summary.worsened).toBe(1);
      expect(summary.unchanged).toBe(1);
      expect(summary.invalid).toBe(0);
      expect(summary.averageStealthBonusChange).toBeCloseTo(0.33, 1);
      expect(summary.averageImpactOnDC).toBeCloseTo(0.33, 1);
    });

    it('should handle empty array', () => {
      const summary = PositionStateHelpers.summarizeTransitions([]);
      expect(summary.total).toBe(0);
      expect(summary.averageStealthBonusChange).toBe(0);
      expect(summary.averageImpactOnDC).toBe(0);
    });

    it('should handle non-array input', () => {
      const summary = PositionStateHelpers.summarizeTransitions('not an array');
      expect(summary.total).toBe(0);
      expect(summary.improved).toBe(0);
      expect(summary.worsened).toBe(0);
      expect(summary.unchanged).toBe(0);
      expect(summary.invalid).toBe(0);
    });

    it('should handle all invalid transitions', () => {
      const invalidTransitions = [
        { invalid: 'transition1' },
        { invalid: 'transition2' }
      ];
      
      const summary = PositionStateHelpers.summarizeTransitions(invalidTransitions);
      expect(summary.total).toBe(2);
      expect(summary.invalid).toBe(2);
      expect(summary.averageStealthBonusChange).toBe(0);
      expect(summary.averageImpactOnDC).toBe(0);
    });
  });
});