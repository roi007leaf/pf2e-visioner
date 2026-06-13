import { RuleElementBatchContext } from '../../../scripts/visibility/auto-visibility/core/RuleElementBatchContext.js';

function token(id, flags = {}, actor = null) {
  return {
    actor,
    document: {
      id,
      flags: { 'pf2e-visioner': flags },
      getFlag: jest.fn((moduleId, key) => flags[key]),
    },
  };
}

describe('RuleElementBatchContext', () => {
  test('skips checker when batch has no rule-element state', () => {
    const checker = { checkRuleElements: jest.fn() };
    const observer = token('observer');
    const target = token('target');
    const context = new RuleElementBatchContext({ checker, tokens: [observer, target] });

    expect(context.checkRuleElements(observer, target, 'hidden')).toBeNull();
    expect(checker.checkRuleElements).not.toHaveBeenCalled();
  });

  test('caches checker results per observer-target-visibility tuple', () => {
    const checker = {
      checkRuleElements: jest.fn(() => ({ state: 'concealed' })),
    };
    const observer = token('observer', {
      distanceBasedVisibility: { active: true },
    });
    const target = token('target');
    const context = new RuleElementBatchContext({ checker, tokens: [observer, target] });

    expect(context.checkRuleElements(observer, target, 'hidden')).toEqual({ state: 'concealed' });
    expect(context.checkRuleElements(observer, target, 'hidden')).toEqual({ state: 'concealed' });
    expect(checker.checkRuleElements).toHaveBeenCalledTimes(1);
  });

  test('keeps native Blind-Fight feature out of rule-element context', () => {
    const checker = {
      checkVisibilityReplacement: jest.fn(() => ({ state: 'hidden' })),
    };
    const observer = token('observer', {}, { itemTypes: { feat: [{ slug: 'blind-fight' }] } });
    const target = token('target');
    const context = new RuleElementBatchContext({ checker, tokens: [observer, target] });

    expect(context.checkVisibilityReplacement(observer, target, 'undetected')).toBeNull();
    expect(checker.checkVisibilityReplacement).not.toHaveBeenCalled();
  });
});
