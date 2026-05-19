import { RuleElementBatchContext } from '../../../scripts/visibility/auto-visibility/core/RuleElementBatchContext.js';

function token(id, flags = {}) {
  return {
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
});
