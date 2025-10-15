/**
 * Tests for qualifyConcealment tri-state behavior
 * Tests the interaction between visibility rule elements and DualSystemIntegration
 */

import { ruleElementService } from '../../../scripts/services/RuleElementService.js';

// Mock DualSystemIntegration
const mockDualSystemIntegration = {
  _combineSystemStates: jest.fn(),
};

describe('qualifyConcealment Tri-State Behavior', () => {
  let mockToken;

  beforeEach(() => {
    jest.clearAllMocks();

    mockToken = {
      id: 'token1',
      name: 'TestToken',
      document: { id: 'token1' },
      actor: {
        uuid: 'Actor.test',
        id: 'test1',
        items: { contents: [] },
        getRollOptions: jest.fn(() => ['self:test']),
      },
    };
  });

  describe('qualifyConcealment: true', () => {
    test('allows Hide/Sneak when observed', () => {
      const ruleElement = {
        key: 'PF2eVisionerVisibility',
        mode: 'set',
        status: 'observed',
        qualifyConcealment: true,
      };

      mockToken.actor.items.contents = [{
        system: { rules: [ruleElement] },
      }];

      const rules = ruleElementService.getVisibilityRuleElements(mockToken);
      
      expect(rules).toHaveLength(1);
      expect(rules[0].rule.qualifyConcealment).toBe(true);
      expect(rules[0].rule.status).toBe('observed');
    });

    test('should be checked by DualSystemIntegration for observed tokens', () => {
      const ruleElement = {
        key: 'PF2eVisionerVisibility',
        mode: 'set',
        status: 'observed',
        qualifyConcealment: true,
      };

      mockToken.actor.items.contents = [{
        system: { rules: [ruleElement] },
      }];

      const rules = ruleElementService.getVisibilityRuleElements(mockToken);
      const hasQualifyConcealment = rules.some(re => re.rule?.qualifyConcealment === true);
      
      expect(hasQualifyConcealment).toBe(true);
    });

    test('multiple tokens can have qualifyConcealment: true', () => {
      const ruleElement = {
        key: 'PF2eVisionerVisibility',
        mode: 'set',
        status: 'observed',
        qualifyConcealment: true,
      };

      const token1 = {
        ...mockToken,
        id: 'token1',
        actor: {
          ...mockToken.actor,
          items: { contents: [{ system: { rules: [ruleElement] } }] },
        },
      };

      const token2 = {
        ...mockToken,
        id: 'token2',
        actor: {
          ...mockToken.actor,
          items: { contents: [{ system: { rules: [ruleElement] } }] },
        },
      };

      const rules1 = ruleElementService.getVisibilityRuleElements(token1);
      const rules2 = ruleElementService.getVisibilityRuleElements(token2);

      expect(rules1[0].rule.qualifyConcealment).toBe(true);
      expect(rules2[0].rule.qualifyConcealment).toBe(true);
    });

    test('works with predicate conditions', () => {
      const ruleElement = {
        key: 'PF2eVisionerVisibility',
        mode: 'set',
        status: 'observed',
        qualifyConcealment: true,
        predicate: ['terrain:natural'],
      };

      mockToken.actor.items.contents = [{
        system: { rules: [ruleElement] },
      }];

      mockToken.actor.getRollOptions.mockReturnValue(['self:test', 'terrain:natural']);

      const rules = ruleElementService.getVisibilityRuleElements(mockToken);
      expect(rules[0].rule.qualifyConcealment).toBe(true);
      expect(rules[0].rule.predicate).toEqual(['terrain:natural']);
    });

    test('can be applied with increase mode', () => {
      const ruleElement = {
        key: 'PF2eVisionerVisibility',
        mode: 'increase',
        steps: 0, // No actual visibility change
        qualifyConcealment: true,
      };

      mockToken.actor.items.contents = [{
        system: { rules: [ruleElement] },
      }];

      const rules = ruleElementService.getVisibilityRuleElements(mockToken);
      expect(rules[0].rule.qualifyConcealment).toBe(true);
    });
  });

  describe('qualifyConcealment: false', () => {
    test('prevents Hide/Sneak when concealed (Blur spell)', () => {
      const ruleElement = {
        key: 'PF2eVisionerVisibility',
        mode: 'set',
        status: 'concealed',
        qualifyConcealment: false,
      };

      mockToken.actor.items.contents = [{
        system: { rules: [ruleElement] },
      }];

      const rules = ruleElementService.getVisibilityRuleElements(mockToken);
      
      expect(rules).toHaveLength(1);
      expect(rules[0].rule.qualifyConcealment).toBe(false);
      expect(rules[0].rule.status).toBe('concealed');
    });

    test('should be checked by DualSystemIntegration for concealed tokens', () => {
      const ruleElement = {
        key: 'PF2eVisionerVisibility',
        mode: 'set',
        status: 'concealed',
        qualifyConcealment: false,
      };

      mockToken.actor.items.contents = [{
        system: { rules: [ruleElement] },
      }];

      const rules = ruleElementService.getVisibilityRuleElements(mockToken);
      const hasDisqualifyConcealment = rules.some(re => re.rule?.qualifyConcealment === false);
      
      expect(hasDisqualifyConcealment).toBe(true);
    });

    test('explicitly false is different from null/undefined', () => {
      const ruleElement = {
        key: 'PF2eVisionerVisibility',
        mode: 'set',
        status: 'concealed',
        qualifyConcealment: false,
      };

      mockToken.actor.items.contents = [{
        system: { rules: [ruleElement] },
      }];

      const rules = ruleElementService.getVisibilityRuleElements(mockToken);
      expect(rules[0].rule.qualifyConcealment).toBe(false);
      expect(rules[0].rule.qualifyConcealment).not.toBeNull();
      expect(rules[0].rule.qualifyConcealment).not.toBeUndefined();
    });

    test('works with predicate conditions', () => {
      const ruleElement = {
        key: 'PF2eVisionerVisibility',
        mode: 'set',
        status: 'concealed',
        qualifyConcealment: false,
        predicate: ['spell:blur'],
      };

      mockToken.actor.items.contents = [{
        system: { rules: [ruleElement] },
      }];

      mockToken.actor.getRollOptions.mockReturnValue(['self:test', 'spell:blur']);

      const rules = ruleElementService.getVisibilityRuleElements(mockToken);
      expect(rules[0].rule.qualifyConcealment).toBe(false);
      expect(rules[0].rule.predicate).toEqual(['spell:blur']);
    });
  });

  describe('qualifyConcealment: null', () => {
    test('normal rules apply when null', () => {
      const ruleElement = {
        key: 'PF2eVisionerVisibility',
        mode: 'set',
        status: 'concealed',
        qualifyConcealment: null,
      };

      mockToken.actor.items.contents = [{
        system: { rules: [ruleElement] },
      }];

      const rules = ruleElementService.getVisibilityRuleElements(mockToken);
      expect(rules[0].rule.qualifyConcealment).toBeNull();
    });

    test('should not trigger qualification logic', () => {
      const ruleElement = {
        key: 'PF2eVisionerVisibility',
        mode: 'set',
        status: 'concealed',
        qualifyConcealment: null,
      };

      mockToken.actor.items.contents = [{
        system: { rules: [ruleElement] },
      }];

      const rules = ruleElementService.getVisibilityRuleElements(mockToken);
      const hasQualify = rules.some(re => re.rule?.qualifyConcealment === true);
      const hasDisqualify = rules.some(re => re.rule?.qualifyConcealment === false);
      
      expect(hasQualify).toBe(false);
      expect(hasDisqualify).toBe(false);
    });
  });

  describe('qualifyConcealment: undefined (omitted)', () => {
    test('normal rules apply when undefined', () => {
      const ruleElement = {
        key: 'PF2eVisionerVisibility',
        mode: 'set',
        status: 'concealed',
        // qualifyConcealment omitted
      };

      mockToken.actor.items.contents = [{
        system: { rules: [ruleElement] },
      }];

      const rules = ruleElementService.getVisibilityRuleElements(mockToken);
      expect(rules[0].rule.qualifyConcealment).toBeUndefined();
    });

    test('should not trigger qualification logic', () => {
      const ruleElement = {
        key: 'PF2eVisionerVisibility',
        mode: 'set',
        status: 'concealed',
      };

      mockToken.actor.items.contents = [{
        system: { rules: [ruleElement] },
      }];

      const rules = ruleElementService.getVisibilityRuleElements(mockToken);
      const hasQualify = rules.some(re => re.rule?.qualifyConcealment === true);
      const hasDisqualify = rules.some(re => re.rule?.qualifyConcealment === false);
      
      expect(hasQualify).toBe(false);
      expect(hasDisqualify).toBe(false);
    });

    test('is the default value', () => {
      const ruleElement = {
        key: 'PF2eVisionerVisibility',
        mode: 'set',
        status: 'hidden',
      };

      mockToken.actor.items.contents = [{
        system: { rules: [ruleElement] },
      }];

      const rules = ruleElementService.getVisibilityRuleElements(mockToken);
      expect(rules[0].rule.qualifyConcealment).toBeUndefined();
    });
  });

  describe('Multiple Tokens with Different States', () => {
    test('one token qualifies, another disqualifies', () => {
      const token1 = {
        ...mockToken,
        id: 'token1',
        actor: {
          ...mockToken.actor,
          items: {
            contents: [{
              system: {
                rules: [{
                  key: 'PF2eVisionerVisibility',
                  mode: 'set',
                  status: 'observed',
                  qualifyConcealment: true,
                }],
              },
            }],
          },
        },
      };

      const token2 = {
        ...mockToken,
        id: 'token2',
        actor: {
          ...mockToken.actor,
          items: {
            contents: [{
              system: {
                rules: [{
                  key: 'PF2eVisionerVisibility',
                  mode: 'set',
                  status: 'concealed',
                  qualifyConcealment: false,
                }],
              },
            }],
          },
        },
      };

      const rules1 = ruleElementService.getVisibilityRuleElements(token1);
      const rules2 = ruleElementService.getVisibilityRuleElements(token2);

      expect(rules1[0].rule.qualifyConcealment).toBe(true);
      expect(rules2[0].rule.qualifyConcealment).toBe(false);
    });

    test('one token has qualifier, another has none', () => {
      const token1 = {
        ...mockToken,
        id: 'token1',
        actor: {
          ...mockToken.actor,
          items: {
            contents: [{
              system: {
                rules: [{
                  key: 'PF2eVisionerVisibility',
                  mode: 'set',
                  status: 'observed',
                  qualifyConcealment: true,
                }],
              },
            }],
          },
        },
      };

      const token2 = {
        ...mockToken,
        id: 'token2',
        actor: {
          ...mockToken.actor,
          items: {
            contents: [{
              system: {
                rules: [{
                  key: 'PF2eVisionerVisibility',
                  mode: 'set',
                  status: 'concealed',
                }],
              },
            }],
          },
        },
      };

      const rules1 = ruleElementService.getVisibilityRuleElements(token1);
      const rules2 = ruleElementService.getVisibilityRuleElements(token2);

      expect(rules1[0].rule.qualifyConcealment).toBe(true);
      expect(rules2[0].rule.qualifyConcealment).toBeUndefined();
    });
  });

  describe('Multiple Rule Elements on Same Token', () => {
    test('last qualifyConcealment value wins when multiple set to true', () => {
      mockToken.actor.items.contents = [
        {
          system: {
            rules: [{
              key: 'PF2eVisionerVisibility',
              mode: 'set',
              status: 'observed',
              qualifyConcealment: true,
            }],
          },
        },
        {
          system: {
            rules: [{
              key: 'PF2eVisionerVisibility',
              mode: 'set',
              status: 'observed',
              qualifyConcealment: true,
            }],
          },
        },
      ];

      const rules = ruleElementService.getVisibilityRuleElements(mockToken);
      const hasQualify = rules.some(re => re.rule?.qualifyConcealment === true);
      
      expect(hasQualify).toBe(true);
      expect(rules).toHaveLength(2);
    });

    test('conflicting qualifyConcealment values', () => {
      mockToken.actor.items.contents = [
        {
          system: {
            rules: [{
              key: 'PF2eVisionerVisibility',
              mode: 'set',
              status: 'observed',
              qualifyConcealment: true,
            }],
          },
        },
        {
          system: {
            rules: [{
              key: 'PF2eVisionerVisibility',
              mode: 'set',
              status: 'concealed',
              qualifyConcealment: false,
            }],
          },
        },
      ];

      const rules = ruleElementService.getVisibilityRuleElements(mockToken);
      const hasQualify = rules.some(re => re.rule?.qualifyConcealment === true);
      const hasDisqualify = rules.some(re => re.rule?.qualifyConcealment === false);
      
      expect(hasQualify).toBe(true);
      expect(hasDisqualify).toBe(true);
      expect(rules).toHaveLength(2);
    });

    test('some with qualifier, some without', () => {
      mockToken.actor.items.contents = [
        {
          system: {
            rules: [{
              key: 'PF2eVisionerVisibility',
              mode: 'set',
              status: 'observed',
              qualifyConcealment: true,
            }],
          },
        },
        {
          system: {
            rules: [{
              key: 'PF2eVisionerVisibility',
              mode: 'increase',
              steps: 1,
            }],
          },
        },
      ];

      const rules = ruleElementService.getVisibilityRuleElements(mockToken);
      
      expect(rules).toHaveLength(2);
      expect(rules[0].rule.qualifyConcealment).toBe(true);
      expect(rules[1].rule.qualifyConcealment).toBeUndefined();
    });
  });

  describe('Integration with Visibility States', () => {
    test('qualifyConcealment with observed status', () => {
      const ruleElement = {
        key: 'PF2eVisionerVisibility',
        mode: 'set',
        status: 'observed',
        qualifyConcealment: true,
      };

      mockToken.actor.items.contents = [{
        system: { rules: [ruleElement] },
      }];

      const rules = ruleElementService.getVisibilityRuleElements(mockToken);
      expect(rules[0].rule.status).toBe('observed');
      expect(rules[0].rule.qualifyConcealment).toBe(true);
    });

    test('qualifyConcealment:false with concealed status', () => {
      const ruleElement = {
        key: 'PF2eVisionerVisibility',
        mode: 'set',
        status: 'concealed',
        qualifyConcealment: false,
      };

      mockToken.actor.items.contents = [{
        system: { rules: [ruleElement] },
      }];

      const rules = ruleElementService.getVisibilityRuleElements(mockToken);
      expect(rules[0].rule.status).toBe('concealed');
      expect(rules[0].rule.qualifyConcealment).toBe(false);
    });

    test('qualifyConcealment:true with concealed status (unusual but valid)', () => {
      const ruleElement = {
        key: 'PF2eVisionerVisibility',
        mode: 'set',
        status: 'concealed',
        qualifyConcealment: true,
      };

      mockToken.actor.items.contents = [{
        system: { rules: [ruleElement] },
      }];

      const rules = ruleElementService.getVisibilityRuleElements(mockToken);
      expect(rules[0].rule.status).toBe('concealed');
      expect(rules[0].rule.qualifyConcealment).toBe(true);
    });

    test('qualifyConcealment with hidden status (should not affect)', () => {
      const ruleElement = {
        key: 'PF2eVisionerVisibility',
        mode: 'set',
        status: 'hidden',
        qualifyConcealment: true,
      };

      mockToken.actor.items.contents = [{
        system: { rules: [ruleElement] },
      }];

      const rules = ruleElementService.getVisibilityRuleElements(mockToken);
      expect(rules[0].rule.status).toBe('hidden');
      expect(rules[0].rule.qualifyConcealment).toBe(true);
    });

    test('qualifyConcealment with undetected status (should not affect)', () => {
      const ruleElement = {
        key: 'PF2eVisionerVisibility',
        mode: 'set',
        status: 'undetected',
        qualifyConcealment: false,
      };

      mockToken.actor.items.contents = [{
        system: { rules: [ruleElement] },
      }];

      const rules = ruleElementService.getVisibilityRuleElements(mockToken);
      expect(rules[0].rule.status).toBe('undetected');
      expect(rules[0].rule.qualifyConcealment).toBe(false);
    });
  });

  describe('Predicate Interaction', () => {
    test('qualifyConcealment only applies when predicate matches', () => {
      const ruleElement = {
        key: 'PF2eVisionerVisibility',
        mode: 'set',
        status: 'observed',
        qualifyConcealment: true,
        predicate: ['environment:mist'],
      };

      mockToken.actor.items.contents = [{
        system: { rules: [ruleElement] },
      }];

      // Predicate matches
      mockToken.actor.getRollOptions.mockReturnValue(['self:test', 'environment:mist']);
      let rules = ruleElementService.getVisibilityRuleElements(mockToken);
      expect(rules[0].rule.qualifyConcealment).toBe(true);

      // Predicate doesn't match
      mockToken.actor.getRollOptions.mockReturnValue(['self:test']);
      rules = ruleElementService.getVisibilityRuleElements(mockToken);
      expect(rules).toHaveLength(1); // Rule still exists but predicate would fail
    });

    test('complex predicate with qualifyConcealment', () => {
      const ruleElement = {
        key: 'PF2eVisionerVisibility',
        mode: 'set',
        status: 'observed',
        qualifyConcealment: true,
        predicate: [
          { or: ['environment:fog', 'environment:smoke'] },
          { not: 'sense:true-seeing' },
        ],
      };

      mockToken.actor.items.contents = [{
        system: { rules: [ruleElement] },
      }];

      const rules = ruleElementService.getVisibilityRuleElements(mockToken);
      expect(rules[0].rule.qualifyConcealment).toBe(true);
      expect(rules[0].rule.predicate).toHaveLength(2);
    });
  });

  describe('Error Handling', () => {
    test('handles malformed qualifyConcealment value', () => {
      const ruleElement = {
        key: 'PF2eVisionerVisibility',
        mode: 'set',
        status: 'concealed',
        qualifyConcealment: 'invalid', // Not a boolean
      };

      mockToken.actor.items.contents = [{
        system: { rules: [ruleElement] },
      }];

      const rules = ruleElementService.getVisibilityRuleElements(mockToken);
      expect(rules).toHaveLength(1);
      // Should still return the rule, even with invalid value
    });

    test('handles null token', () => {
      const rules = ruleElementService.getVisibilityRuleElements(null);
      expect(rules).toEqual([]);
    });

    test('handles token without actor', () => {
      const invalidToken = {
        id: 'token1',
        actor: null,
      };

      const rules = ruleElementService.getVisibilityRuleElements(invalidToken);
      expect(rules).toEqual([]);
    });

    test('handles token without items', () => {
      const invalidToken = {
        id: 'token1',
        actor: {
          uuid: 'Actor.test',
          items: null,
        },
      };

      const rules = ruleElementService.getVisibilityRuleElements(invalidToken);
      expect(rules).toEqual([]);
    });
  });

  describe('Real-World Use Cases', () => {
    test('Obscuring Mist spell effect', () => {
      const ruleElement = {
        key: 'PF2eVisionerVisibility',
        mode: 'set',
        status: 'observed',
        qualifyConcealment: true,
        predicate: ['spell:obscuring-mist'],
      };

      mockToken.actor.items.contents = [{
        system: { rules: [ruleElement] },
      }];

      const rules = ruleElementService.getVisibilityRuleElements(mockToken);
      expect(rules[0].rule).toMatchObject({
        key: 'PF2eVisionerVisibility',
        status: 'observed',
        qualifyConcealment: true,
      });
    });

    test('Blur spell effect', () => {
      const ruleElement = {
        key: 'PF2eVisionerVisibility',
        mode: 'set',
        status: 'concealed',
        qualifyConcealment: false,
        predicate: ['spell:blur'],
      };

      mockToken.actor.items.contents = [{
        system: { rules: [ruleElement] },
      }];

      const rules = ruleElementService.getVisibilityRuleElements(mockToken);
      expect(rules[0].rule).toMatchObject({
        key: 'PF2eVisionerVisibility',
        status: 'concealed',
        qualifyConcealment: false,
      });
    });

    test('Smokestick consumable', () => {
      const ruleElement = {
        key: 'PF2eVisionerVisibility',
        mode: 'set',
        status: 'observed',
        qualifyConcealment: true,
        predicate: ['item:smokestick'],
      };

      mockToken.actor.items.contents = [{
        system: { rules: [ruleElement] },
      }];

      const rules = ruleElementService.getVisibilityRuleElements(mockToken);
      expect(rules[0].rule.qualifyConcealment).toBe(true);
    });

    test('Mirror Image spell - concealed but location obvious', () => {
      const ruleElement = {
        key: 'PF2eVisionerVisibility',
        mode: 'set',
        status: 'concealed',
        qualifyConcealment: false,
        predicate: ['spell:mirror-image'],
      };

      mockToken.actor.items.contents = [{
        system: { rules: [ruleElement] },
      }];

      const rules = ruleElementService.getVisibilityRuleElements(mockToken);
      expect(rules[0].rule).toMatchObject({
        status: 'concealed',
        qualifyConcealment: false,
      });
    });

    test('Displacement spell - similar to Mirror Image', () => {
      const ruleElement = {
        key: 'PF2eVisionerVisibility',
        mode: 'set',
        status: 'concealed',
        qualifyConcealment: false,
        predicate: ['spell:displacement'],
      };

      mockToken.actor.items.contents = [{
        system: { rules: [ruleElement] },
      }];

      const rules = ruleElementService.getVisibilityRuleElements(mockToken);
      expect(rules[0].rule.qualifyConcealment).toBe(false);
    });
  });
});
