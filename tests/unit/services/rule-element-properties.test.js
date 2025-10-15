/**
 * Comprehensive tests for Rule Element properties and their possible values
 * Tests all three rule element types: Cover, Visibility, and Detection
 */

import { RuleElementService } from '../../../scripts/services/RuleElementService.js';

describe('Rule Element Properties - Comprehensive Tests', () => {
  let service;
  let mockObserver;
  let mockTarget;

  beforeEach(() => {
    service = new RuleElementService();
    
    mockObserver = {
      id: 'observer1',
      name: 'Observer',
      document: { id: 'observer1' },
      actor: {
        uuid: 'Actor.observer',
        id: 'observer1',
        items: { contents: [] },
        getRollOptions: jest.fn(() => ['self:observer']),
      },
    };

    mockTarget = {
      id: 'target1',
      name: 'Target',
      document: { id: 'target1' },
      actor: {
        uuid: 'Actor.target',
        id: 'target1',
        items: { contents: [] },
        getRollOptions: jest.fn(() => ['self:target']),
      },
    };
  });

  describe('Cover Rule Element - PF2eVisionerCover', () => {
    describe('mode property', () => {
      test('mode: "set" - sets cover to exact level', () => {
        const ruleElement = {
          key: 'PF2eVisionerCover',
          mode: 'set',
          coverLevel: 'greater',
        };

        mockTarget.actor.items.contents = [{
          system: { rules: [ruleElement] },
        }];

        const result = service.applyCoverModifiers('none', mockObserver, mockTarget);
        expect(result).toBe('greater');
      });

      test('mode: "increase" - increases cover by steps', () => {
        const ruleElement = {
          key: 'PF2eVisionerCover',
          mode: 'increase',
          steps: 1,
        };

        mockTarget.actor.items.contents = [{
          system: { rules: [ruleElement] },
        }];

        const result = service.applyCoverModifiers('lesser', mockObserver, mockTarget);
        expect(result).toBe('standard');
      });

      test('mode: "increase" with steps: 2', () => {
        const ruleElement = {
          key: 'PF2eVisionerCover',
          mode: 'increase',
          steps: 2,
        };

        mockTarget.actor.items.contents = [{
          system: { rules: [ruleElement] },
        }];

        const result = service.applyCoverModifiers('none', mockObserver, mockTarget);
        expect(result).toBe('standard');
      });

      test('mode: "increase" does not exceed greater cover', () => {
        const ruleElement = {
          key: 'PF2eVisionerCover',
          mode: 'increase',
          steps: 5,
        };

        mockTarget.actor.items.contents = [{
          system: { rules: [ruleElement] },
        }];

        const result = service.applyCoverModifiers('standard', mockObserver, mockTarget);
        expect(result).toBe('greater');
      });

      test('mode: "decrease" - reduces cover by steps', () => {
        const ruleElement = {
          key: 'PF2eVisionerCover',
          mode: 'decrease',
          steps: 1,
        };

        mockObserver.actor.items.contents = [{
          system: { rules: [ruleElement] },
        }];

        const result = service.applyCoverModifiers('standard', mockObserver, mockTarget);
        expect(result).toBe('lesser');
      });

      test('mode: "decrease" with steps: 2', () => {
        const ruleElement = {
          key: 'PF2eVisionerCover',
          mode: 'decrease',
          steps: 2,
        };

        mockObserver.actor.items.contents = [{
          system: { rules: [ruleElement] },
        }];

        const result = service.applyCoverModifiers('greater', mockObserver, mockTarget);
        expect(result).toBe('lesser');
      });

      test('mode: "decrease" does not go below none', () => {
        const ruleElement = {
          key: 'PF2eVisionerCover',
          mode: 'decrease',
          steps: 5,
        };

        mockObserver.actor.items.contents = [{
          system: { rules: [ruleElement] },
        }];

        const result = service.applyCoverModifiers('lesser', mockObserver, mockTarget);
        expect(result).toBe('none');
      });

      test('mode: "remove" - sets cover to none', () => {
        const ruleElement = {
          key: 'PF2eVisionerCover',
          mode: 'remove',
        };

        mockObserver.actor.items.contents = [{
          system: { rules: [ruleElement] },
        }];

        const result = service.applyCoverModifiers('greater', mockObserver, mockTarget);
        expect(result).toBe('none');
      });
    });

    describe('coverLevel property', () => {
      test('coverLevel: "none"', () => {
        const ruleElement = {
          key: 'PF2eVisionerCover',
          mode: 'set',
          coverLevel: 'none',
        };

        mockTarget.actor.items.contents = [{
          system: { rules: [ruleElement] },
        }];

        const result = service.applyCoverModifiers('greater', mockObserver, mockTarget);
        expect(result).toBe('none');
      });

      test('coverLevel: "lesser"', () => {
        const ruleElement = {
          key: 'PF2eVisionerCover',
          mode: 'set',
          coverLevel: 'lesser',
        };

        mockTarget.actor.items.contents = [{
          system: { rules: [ruleElement] },
        }];

        const result = service.applyCoverModifiers('none', mockObserver, mockTarget);
        expect(result).toBe('lesser');
      });

      test('coverLevel: "standard"', () => {
        const ruleElement = {
          key: 'PF2eVisionerCover',
          mode: 'set',
          coverLevel: 'standard',
        };

        mockTarget.actor.items.contents = [{
          system: { rules: [ruleElement] },
        }];

        const result = service.applyCoverModifiers('none', mockObserver, mockTarget);
        expect(result).toBe('standard');
      });

      test('coverLevel: "greater"', () => {
        const ruleElement = {
          key: 'PF2eVisionerCover',
          mode: 'set',
          coverLevel: 'greater',
        };

        mockTarget.actor.items.contents = [{
          system: { rules: [ruleElement] },
        }];

        const result = service.applyCoverModifiers('none', mockObserver, mockTarget);
        expect(result).toBe('greater');
      });
    });

    describe('steps property', () => {
      test('steps: 1 (default)', () => {
        const ruleElement = {
          key: 'PF2eVisionerCover',
          mode: 'increase',
        };

        mockTarget.actor.items.contents = [{
          system: { rules: [ruleElement] },
        }];

        const result = service.applyCoverModifiers('none', mockObserver, mockTarget);
        expect(result).toBe('lesser');
      });

      test('steps: 2', () => {
        const ruleElement = {
          key: 'PF2eVisionerCover',
          mode: 'increase',
          steps: 2,
        };

        mockTarget.actor.items.contents = [{
          system: { rules: [ruleElement] },
        }];

        const result = service.applyCoverModifiers('none', mockObserver, mockTarget);
        expect(result).toBe('standard');
      });

      test('steps: 3', () => {
        const ruleElement = {
          key: 'PF2eVisionerCover',
          mode: 'increase',
          steps: 3,
        };

        mockTarget.actor.items.contents = [{
          system: { rules: [ruleElement] },
        }];

        const result = service.applyCoverModifiers('none', mockObserver, mockTarget);
        expect(result).toBe('greater');
      });

      test('steps: 0 - no change', () => {
        const ruleElement = {
          key: 'PF2eVisionerCover',
          mode: 'increase',
          steps: 0,
        };

        mockTarget.actor.items.contents = [{
          system: { rules: [ruleElement] },
        }];

        const result = service.applyCoverModifiers('lesser', mockObserver, mockTarget);
        expect(result).toBe('lesser');
      });

      test('steps: -1 treated as 0', () => {
        const ruleElement = {
          key: 'PF2eVisionerCover',
          mode: 'increase',
          steps: -1,
        };

        mockTarget.actor.items.contents = [{
          system: { rules: [ruleElement] },
        }];

        const result = service.applyCoverModifiers('lesser', mockObserver, mockTarget);
        expect(result).toBe('lesser');
      });
    });

    describe('effectTarget property', () => {
      test('effectTarget: "self" - applies to self (target)', () => {
        const ruleElement = {
          key: 'PF2eVisionerCover',
          mode: 'set',
          coverLevel: 'standard',
          effectTarget: 'self',
        };

        mockTarget.actor.items.contents = [{
          system: { rules: [ruleElement] },
        }];

        const result = service.applyCoverModifiers('none', mockObserver, mockTarget);
        expect(result).toBe('standard');
      });

      test('effectTarget: "other" - applies to observer', () => {
        const ruleElement = {
          key: 'PF2eVisionerCover',
          mode: 'decrease',
          steps: 1,
          effectTarget: 'other',
        };

        mockObserver.actor.items.contents = [{
          system: { rules: [ruleElement] },
        }];

        const result = service.applyCoverModifiers('standard', mockObserver, mockTarget);
        expect(result).toBe('lesser');
      });
    });

    describe('direction property', () => {
      test('direction: "to" - observer has effect targeting others', () => {
        const ruleElement = {
          key: 'PF2eVisionerCover',
          mode: 'decrease',
          steps: 2,
          direction: 'to',
        };

        mockObserver.actor.items.contents = [{
          system: { rules: [ruleElement] },
        }];

        const result = service.applyCoverModifiers('greater', mockObserver, mockTarget);
        expect(result).toBe('lesser');
      });

      test('direction: "from" - target has effect affecting how others see them', () => {
        const ruleElement = {
          key: 'PF2eVisionerCover',
          mode: 'set',
          coverLevel: 'greater',
          direction: 'from',
        };

        mockTarget.actor.items.contents = [{
          system: { rules: [ruleElement] },
        }];

        const result = service.applyCoverModifiers('none', mockObserver, mockTarget);
        expect(result).toBe('greater');
      });
    });

    describe('predicate property', () => {
      test('predicate matches - rule applies', () => {
        const ruleElement = {
          key: 'PF2eVisionerCover',
          mode: 'set',
          coverLevel: 'standard',
          predicate: ['self:observer'],
        };

        mockObserver.actor.items.contents = [{
          system: { rules: [ruleElement] },
        }];

        mockObserver.actor.getRollOptions.mockReturnValue(['self:observer']);

        const result = service.applyCoverModifiers('none', mockObserver, mockTarget);
        expect(result).toBe('standard');
      });

      test('predicate does not match - rule does not apply', () => {
        const ruleElement = {
          key: 'PF2eVisionerCover',
          mode: 'set',
          coverLevel: 'standard',
          predicate: ['class:fighter'],
        };

        mockObserver.actor.items.contents = [{
          system: { rules: [ruleElement] },
        }];

        mockObserver.actor.getRollOptions.mockReturnValue(['self:observer']);

        const result = service.applyCoverModifiers('none', mockObserver, mockTarget);
        expect(result).toBe('none');
      });

      test('predicate with multiple conditions - all must match', () => {
        const ruleElement = {
          key: 'PF2eVisionerCover',
          mode: 'set',
          coverLevel: 'greater',
          predicate: ['self:observer', 'terrain:urban'],
        };

        mockObserver.actor.items.contents = [{
          system: { rules: [ruleElement] },
        }];

        mockObserver.actor.getRollOptions.mockReturnValue(['self:observer', 'terrain:urban']);

        const result = service.applyCoverModifiers('none', mockObserver, mockTarget);
        expect(result).toBe('greater');
      });

      test('predicate with "not" operator', () => {
        const ruleElement = {
          key: 'PF2eVisionerCover',
          mode: 'set',
          coverLevel: 'standard',
          predicate: [{ not: 'target:ally' }],
        };

        mockObserver.actor.items.contents = [{
          system: { rules: [ruleElement] },
        }];

        mockObserver.actor.getRollOptions.mockReturnValue(['self:observer']);

        const result = service.applyCoverModifiers('none', mockObserver, mockTarget);
        expect(result).toBe('standard');
      });
    });
  });

  describe('Visibility Rule Element - PF2eVisionerVisibility', () => {
    describe('mode property', () => {
      test('mode: "set" - sets visibility to exact state', () => {
        const ruleElement = {
          key: 'PF2eVisionerVisibility',
          mode: 'set',
          status: 'hidden',
        };

        mockTarget.actor.items.contents = [{
          system: { rules: [ruleElement] },
        }];

        const result = service.applyVisibilityModifiers('observed', mockObserver, mockTarget);
        expect(result).toBe('hidden');
      });

      test('mode: "increase" - increases visibility state', () => {
        const ruleElement = {
          key: 'PF2eVisionerVisibility',
          mode: 'increase',
          steps: 1,
        };

        mockTarget.actor.items.contents = [{
          system: { rules: [ruleElement] },
        }];

        const result = service.applyVisibilityModifiers('observed', mockObserver, mockTarget);
        expect(result).toBe('concealed');
      });

      test('mode: "increase" with steps: 2', () => {
        const ruleElement = {
          key: 'PF2eVisionerVisibility',
          mode: 'increase',
          steps: 2,
        };

        mockTarget.actor.items.contents = [{
          system: { rules: [ruleElement] },
        }];

        const result = service.applyVisibilityModifiers('observed', mockObserver, mockTarget);
        expect(result).toBe('hidden');
      });

      test('mode: "increase" does not exceed undetected', () => {
        const ruleElement = {
          key: 'PF2eVisionerVisibility',
          mode: 'increase',
          steps: 5,
        };

        mockTarget.actor.items.contents = [{
          system: { rules: [ruleElement] },
        }];

        const result = service.applyVisibilityModifiers('concealed', mockObserver, mockTarget);
        expect(result).toBe('undetected');
      });

      test('mode: "decrease" - decreases visibility state', () => {
        const ruleElement = {
          key: 'PF2eVisionerVisibility',
          mode: 'decrease',
          steps: 1,
        };

        mockObserver.actor.items.contents = [{
          system: { rules: [ruleElement] },
        }];

        const result = service.applyVisibilityModifiers('hidden', mockObserver, mockTarget);
        expect(result).toBe('concealed');
      });

      test('mode: "decrease" with steps: 2', () => {
        const ruleElement = {
          key: 'PF2eVisionerVisibility',
          mode: 'decrease',
          steps: 2,
        };

        mockObserver.actor.items.contents = [{
          system: { rules: [ruleElement] },
        }];

        const result = service.applyVisibilityModifiers('hidden', mockObserver, mockTarget);
        expect(result).toBe('observed');
      });

      test('mode: "decrease" does not go below observed', () => {
        const ruleElement = {
          key: 'PF2eVisionerVisibility',
          mode: 'decrease',
          steps: 5,
        };

        mockObserver.actor.items.contents = [{
          system: { rules: [ruleElement] },
        }];

        const result = service.applyVisibilityModifiers('concealed', mockObserver, mockTarget);
        expect(result).toBe('observed');
      });
    });

    describe('status property', () => {
      test('status: "observed"', () => {
        const ruleElement = {
          key: 'PF2eVisionerVisibility',
          mode: 'set',
          status: 'observed',
        };

        mockTarget.actor.items.contents = [{
          system: { rules: [ruleElement] },
        }];

        const result = service.applyVisibilityModifiers('hidden', mockObserver, mockTarget);
        expect(result).toBe('observed');
      });

      test('status: "concealed"', () => {
        const ruleElement = {
          key: 'PF2eVisionerVisibility',
          mode: 'set',
          status: 'concealed',
        };

        mockTarget.actor.items.contents = [{
          system: { rules: [ruleElement] },
        }];

        const result = service.applyVisibilityModifiers('observed', mockObserver, mockTarget);
        expect(result).toBe('concealed');
      });

      test('status: "hidden"', () => {
        const ruleElement = {
          key: 'PF2eVisionerVisibility',
          mode: 'set',
          status: 'hidden',
        };

        mockTarget.actor.items.contents = [{
          system: { rules: [ruleElement] },
        }];

        const result = service.applyVisibilityModifiers('observed', mockObserver, mockTarget);
        expect(result).toBe('hidden');
      });

      test('status: "undetected"', () => {
        const ruleElement = {
          key: 'PF2eVisionerVisibility',
          mode: 'set',
          status: 'undetected',
        };

        mockTarget.actor.items.contents = [{
          system: { rules: [ruleElement] },
        }];

        const result = service.applyVisibilityModifiers('observed', mockObserver, mockTarget);
        expect(result).toBe('undetected');
      });
    });

    describe('qualifyConcealment property', () => {
      test('qualifyConcealment: true - observed becomes concealed for action prerequisites', () => {
        const ruleElement = {
          key: 'PF2eVisionerVisibility',
          mode: 'set',
          status: 'observed',
          qualifyConcealment: true,
        };

        mockTarget.actor.items.contents = [{
          system: { rules: [ruleElement] },
        }];

        // This would be checked by DualSystemIntegration in actual use
        const rules = service.getVisibilityRuleElements(mockTarget);
        expect(rules[0].rule.qualifyConcealment).toBe(true);
      });

      test('qualifyConcealment: false - concealed becomes observed for action prerequisites', () => {
        const ruleElement = {
          key: 'PF2eVisionerVisibility',
          mode: 'set',
          status: 'concealed',
          qualifyConcealment: false,
        };

        mockTarget.actor.items.contents = [{
          system: { rules: [ruleElement] },
        }];

        const rules = service.getVisibilityRuleElements(mockTarget);
        expect(rules[0].rule.qualifyConcealment).toBe(false);
      });

      test('qualifyConcealment: null - normal rules apply', () => {
        const ruleElement = {
          key: 'PF2eVisionerVisibility',
          mode: 'set',
          status: 'concealed',
          qualifyConcealment: null,
        };

        mockTarget.actor.items.contents = [{
          system: { rules: [ruleElement] },
        }];

        const rules = service.getVisibilityRuleElements(mockTarget);
        expect(rules[0].rule.qualifyConcealment).toBeNull();
      });

      test('qualifyConcealment: undefined - normal rules apply', () => {
        const ruleElement = {
          key: 'PF2eVisionerVisibility',
          mode: 'set',
          status: 'concealed',
        };

        mockTarget.actor.items.contents = [{
          system: { rules: [ruleElement] },
        }];

        const rules = service.getVisibilityRuleElements(mockTarget);
        expect(rules[0].rule.qualifyConcealment).toBeUndefined();
      });
    });

    describe('steps property', () => {
      test('steps: 1 (default)', () => {
        const ruleElement = {
          key: 'PF2eVisionerVisibility',
          mode: 'increase',
        };

        mockTarget.actor.items.contents = [{
          system: { rules: [ruleElement] },
        }];

        const result = service.applyVisibilityModifiers('observed', mockObserver, mockTarget);
        expect(result).toBe('concealed');
      });

      test('steps: 2', () => {
        const ruleElement = {
          key: 'PF2eVisionerVisibility',
          mode: 'increase',
          steps: 2,
        };

        mockTarget.actor.items.contents = [{
          system: { rules: [ruleElement] },
        }];

        const result = service.applyVisibilityModifiers('observed', mockObserver, mockTarget);
        expect(result).toBe('hidden');
      });

      test('steps: 3', () => {
        const ruleElement = {
          key: 'PF2eVisionerVisibility',
          mode: 'increase',
          steps: 3,
        };

        mockTarget.actor.items.contents = [{
          system: { rules: [ruleElement] },
        }];

        const result = service.applyVisibilityModifiers('observed', mockObserver, mockTarget);
        expect(result).toBe('undetected');
      });

      test('steps: 0 - no change', () => {
        const ruleElement = {
          key: 'PF2eVisionerVisibility',
          mode: 'increase',
          steps: 0,
        };

        mockTarget.actor.items.contents = [{
          system: { rules: [ruleElement] },
        }];

        const result = service.applyVisibilityModifiers('concealed', mockObserver, mockTarget);
        expect(result).toBe('concealed');
      });
    });

    describe('effectTarget property', () => {
      test('effectTarget: "self" - applies to self (target)', () => {
        const ruleElement = {
          key: 'PF2eVisionerVisibility',
          mode: 'set',
          status: 'hidden',
          effectTarget: 'self',
        };

        mockTarget.actor.items.contents = [{
          system: { rules: [ruleElement] },
        }];

        const result = service.applyVisibilityModifiers('observed', mockObserver, mockTarget);
        expect(result).toBe('hidden');
      });

      test('effectTarget: "other" - applies to observer', () => {
        const ruleElement = {
          key: 'PF2eVisionerVisibility',
          mode: 'decrease',
          steps: 1,
          effectTarget: 'other',
        };

        mockObserver.actor.items.contents = [{
          system: { rules: [ruleElement] },
        }];

        const result = service.applyVisibilityModifiers('hidden', mockObserver, mockTarget);
        expect(result).toBe('concealed');
      });
    });

    describe('direction property', () => {
      test('direction: "to" - observer has effect affecting their vision', () => {
        const ruleElement = {
          key: 'PF2eVisionerVisibility',
          mode: 'decrease',
          steps: 2,
          direction: 'to',
        };

        mockObserver.actor.items.contents = [{
          system: { rules: [ruleElement] },
        }];

        const result = service.applyVisibilityModifiers('hidden', mockObserver, mockTarget);
        expect(result).toBe('observed');
      });

      test('direction: "from" - target has effect affecting how they are seen', () => {
        const ruleElement = {
          key: 'PF2eVisionerVisibility',
          mode: 'set',
          status: 'hidden',
          direction: 'from',
        };

        mockTarget.actor.items.contents = [{
          system: { rules: [ruleElement] },
        }];

        const result = service.applyVisibilityModifiers('observed', mockObserver, mockTarget);
        expect(result).toBe('hidden');
      });
    });

    describe('predicate property', () => {
      test('predicate matches - visibility rule applies', () => {
        const ruleElement = {
          key: 'PF2eVisionerVisibility',
          mode: 'set',
          status: 'concealed',
          predicate: ['self:target'],
        };

        mockTarget.actor.items.contents = [{
          system: { rules: [ruleElement] },
        }];

        mockTarget.actor.getRollOptions.mockReturnValue(['self:target']);

        const result = service.applyVisibilityModifiers('observed', mockObserver, mockTarget);
        expect(result).toBe('concealed');
      });

      test('predicate does not match - visibility rule does not apply', () => {
        const ruleElement = {
          key: 'PF2eVisionerVisibility',
          mode: 'set',
          status: 'hidden',
          predicate: ['lighting:darkness'],
        };

        mockTarget.actor.items.contents = [{
          system: { rules: [ruleElement] },
        }];

        mockTarget.actor.getRollOptions.mockReturnValue(['self:target']);

        const result = service.applyVisibilityModifiers('observed', mockObserver, mockTarget);
        expect(result).toBe('observed');
      });

      test('predicate with complex conditions', () => {
        const ruleElement = {
          key: 'PF2eVisionerVisibility',
          mode: 'increase',
          steps: 2,
          predicate: [
            'self:target',
            { or: ['lighting:dim', 'lighting:darkness'] },
          ],
        };

        mockTarget.actor.items.contents = [{
          system: { rules: [ruleElement] },
        }];

        mockTarget.actor.getRollOptions.mockReturnValue(['self:target', 'lighting:dim']);

        const result = service.applyVisibilityModifiers('observed', mockObserver, mockTarget);
        expect(result).toBe('hidden');
      });
    });
  });

  describe('Detection Rule Element - PF2eVisionerDetection', () => {
    describe('basic detection rule element structure', () => {
      test('detection rule element is recognized', () => {
        const ruleElement = {
          key: 'PF2eVisionerDetection',
          modifier: -2,
        };

        mockObserver.actor.items.contents = [{
          system: { rules: [ruleElement] },
        }];

        const rules = service.getDetectionRuleElements(mockObserver);
        expect(rules).toHaveLength(1);
        expect(rules[0].rule.key).toBe('PF2eVisionerDetection');
      });

      test('modifier property is accessible', () => {
        const ruleElement = {
          key: 'PF2eVisionerDetection',
          modifier: 5,
        };

        mockTarget.actor.items.contents = [{
          system: { rules: [ruleElement] },
        }];

        const rules = service.getDetectionRuleElements(mockTarget);
        expect(rules[0].rule.modifier).toBe(5);
      });
    });

    describe('modifier property values', () => {
      test('positive modifier', () => {
        const ruleElement = {
          key: 'PF2eVisionerDetection',
          modifier: 3,
        };

        mockTarget.actor.items.contents = [{
          system: { rules: [ruleElement] },
        }];

        const rules = service.getDetectionRuleElements(mockTarget);
        expect(rules[0].rule.modifier).toBe(3);
      });

      test('negative modifier', () => {
        const ruleElement = {
          key: 'PF2eVisionerDetection',
          modifier: -5,
        };

        mockTarget.actor.items.contents = [{
          system: { rules: [ruleElement] },
        }];

        const rules = service.getDetectionRuleElements(mockTarget);
        expect(rules[0].rule.modifier).toBe(-5);
      });

      test('zero modifier', () => {
        const ruleElement = {
          key: 'PF2eVisionerDetection',
          modifier: 0,
        };

        mockTarget.actor.items.contents = [{
          system: { rules: [ruleElement] },
        }];

        const rules = service.getDetectionRuleElements(mockTarget);
        expect(rules[0].rule.modifier).toBe(0);
      });
    });

    describe('predicate property', () => {
      test('detection rule with predicate', () => {
        const ruleElement = {
          key: 'PF2eVisionerDetection',
          modifier: -2,
          predicate: ['stealth'],
        };

        mockTarget.actor.items.contents = [{
          system: { rules: [ruleElement] },
        }];

        const rules = service.getDetectionRuleElements(mockTarget);
        expect(rules[0].rule.predicate).toEqual(['stealth']);
      });
    });
  });

  describe('Multiple Rule Elements', () => {
    test('multiple cover rule elements stack', () => {
      const ruleElement1 = {
        key: 'PF2eVisionerCover',
        mode: 'increase',
        steps: 1,
      };

      const ruleElement2 = {
        key: 'PF2eVisionerCover',
        mode: 'increase',
        steps: 1,
      };

      mockTarget.actor.items.contents = [
        { system: { rules: [ruleElement1] } },
        { system: { rules: [ruleElement2] } },
      ];

      const result = service.applyCoverModifiers('none', mockObserver, mockTarget);
      expect(result).toBe('standard');
    });

    test('multiple visibility rule elements stack', () => {
      const ruleElement1 = {
        key: 'PF2eVisionerVisibility',
        mode: 'increase',
        steps: 1,
      };

      const ruleElement2 = {
        key: 'PF2eVisionerVisibility',
        mode: 'increase',
        steps: 1,
      };

      mockTarget.actor.items.contents = [
        { system: { rules: [ruleElement1] } },
        { system: { rules: [ruleElement2] } },
      ];

      const result = service.applyVisibilityModifiers('observed', mockObserver, mockTarget);
      expect(result).toBe('hidden');
    });

    test('set mode overrides previous modifications', () => {
      const ruleElement1 = {
        key: 'PF2eVisionerCover',
        mode: 'increase',
        steps: 2,
      };

      const ruleElement2 = {
        key: 'PF2eVisionerCover',
        mode: 'set',
        coverLevel: 'none',
      };

      mockTarget.actor.items.contents = [
        { system: { rules: [ruleElement1] } },
        { system: { rules: [ruleElement2] } },
      ];

      const result = service.applyCoverModifiers('none', mockObserver, mockTarget);
      expect(result).toBe('none');
    });

    test('observer and target rule elements both apply', () => {
      const observerRule = {
        key: 'PF2eVisionerCover',
        mode: 'decrease',
        steps: 1,
        effectTarget: 'other',
      };

      const targetRule = {
        key: 'PF2eVisionerCover',
        mode: 'increase',
        steps: 2,
        effectTarget: 'self',
      };

      mockObserver.actor.items.contents = [
        { system: { rules: [observerRule] } },
      ];

      mockTarget.actor.items.contents = [
        { system: { rules: [targetRule] } },
      ];

      const result = service.applyCoverModifiers('none', mockObserver, mockTarget);
      expect(result).toBe('lesser'); // +2 -1 = +1 from none = lesser
    });
  });

  describe('Edge Cases', () => {
    test('invalid mode defaults to no change', () => {
      const ruleElement = {
        key: 'PF2eVisionerCover',
        mode: 'invalid',
        coverLevel: 'greater',
      };

      mockTarget.actor.items.contents = [{
        system: { rules: [ruleElement] },
      }];

      const result = service.applyCoverModifiers('none', mockObserver, mockTarget);
      expect(result).toBe('none');
    });

    test('missing required properties', () => {
      const ruleElement = {
        key: 'PF2eVisionerCover',
        mode: 'set',
        // missing coverLevel
      };

      mockTarget.actor.items.contents = [{
        system: { rules: [ruleElement] },
      }];

      const result = service.applyCoverModifiers('none', mockObserver, mockTarget);
      expect(result).toBe('none');
    });

    test('null token actors', () => {
      mockObserver.actor = null;
      mockTarget.actor = null;

      const result = service.applyCoverModifiers('standard', mockObserver, mockTarget);
      expect(result).toBe('standard');
    });

    test('tokens without items', () => {
      mockObserver.actor.items = null;
      mockTarget.actor.items = null;

      const result = service.applyCoverModifiers('standard', mockObserver, mockTarget);
      expect(result).toBe('standard');
    });

    test('empty items array', () => {
      mockObserver.actor.items.contents = [];
      mockTarget.actor.items.contents = [];

      const result = service.applyCoverModifiers('standard', mockObserver, mockTarget);
      expect(result).toBe('standard');
    });

    test('items without rules', () => {
      mockTarget.actor.items.contents = [
        { system: {} }, // no rules property
      ];

      const result = service.applyCoverModifiers('standard', mockObserver, mockTarget);
      expect(result).toBe('standard');
    });

    test('empty rules array', () => {
      mockTarget.actor.items.contents = [
        { system: { rules: [] } },
      ];

      const result = service.applyCoverModifiers('standard', mockObserver, mockTarget);
      expect(result).toBe('standard');
    });
  });

  describe('Real-World Scenarios', () => {
    test('Blur spell - concealed but cannot hide', () => {
      const ruleElement = {
        key: 'PF2eVisionerVisibility',
        mode: 'set',
        status: 'concealed',
        qualifyConcealment: false,
      };

      mockTarget.actor.items.contents = [{
        system: { rules: [ruleElement] },
      }];

      const result = service.applyVisibilityModifiers('observed', mockObserver, mockTarget);
      expect(result).toBe('concealed');

      const rules = service.getVisibilityRuleElements(mockTarget);
      expect(rules[0].rule.qualifyConcealment).toBe(false);
    });

    test('Obscuring mist - observed but can hide', () => {
      const ruleElement = {
        key: 'PF2eVisionerVisibility',
        mode: 'set',
        status: 'observed',
        qualifyConcealment: true,
      };

      mockTarget.actor.items.contents = [{
        system: { rules: [ruleElement] },
      }];

      const result = service.applyVisibilityModifiers('observed', mockObserver, mockTarget);
      expect(result).toBe('observed');

      const rules = service.getVisibilityRuleElements(mockTarget);
      expect(rules[0].rule.qualifyConcealment).toBe(true);
    });

    test('Greater cover from ranged attacks only', () => {
      const ruleElement = {
        key: 'PF2eVisionerCover',
        mode: 'set',
        coverLevel: 'greater',
        predicate: ['item:ranged'],
      };

      mockTarget.actor.items.contents = [{
        system: { rules: [ruleElement] },
      }];

      mockTarget.actor.getRollOptions.mockReturnValue(['item:ranged', 'self:target']);

      const result = service.applyCoverModifiers('none', mockObserver, mockTarget);
      expect(result).toBe('greater');
    });

    test('Sniper feat - reduces enemy cover by 1 step', () => {
      const ruleElement = {
        key: 'PF2eVisionerCover',
        mode: 'decrease',
        steps: 1,
        predicate: ['item:ranged'],
      };

      mockObserver.actor.items.contents = [{
        system: { rules: [ruleElement] },
      }];

      mockObserver.actor.getRollOptions.mockReturnValue(['item:ranged', 'self:observer']);

      const result = service.applyCoverModifiers('standard', mockObserver, mockTarget);
      expect(result).toBe('lesser');
    });

    test('Invisibility spell', () => {
      const ruleElement = {
        key: 'PF2eVisionerVisibility',
        mode: 'set',
        status: 'undetected',
      };

      mockTarget.actor.items.contents = [{
        system: { rules: [ruleElement] },
      }];

      const result = service.applyVisibilityModifiers('observed', mockObserver, mockTarget);
      expect(result).toBe('undetected');
    });

    test('Darkvision in darkness - reduces visibility by 2 steps', () => {
      const ruleElement = {
        key: 'PF2eVisionerVisibility',
        mode: 'decrease',
        steps: 2,
        predicate: ['lighting:darkness', 'sense:darkvision'],
      };

      mockObserver.actor.items.contents = [{
        system: { rules: [ruleElement] },
      }];

      mockObserver.actor.getRollOptions.mockReturnValue([
        'lighting:darkness',
        'sense:darkvision',
        'self:observer',
      ]);

      const result = service.applyVisibilityModifiers('hidden', mockObserver, mockTarget);
      expect(result).toBe('observed');
    });
  });
});
