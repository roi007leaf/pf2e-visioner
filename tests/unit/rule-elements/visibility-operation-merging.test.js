import { createPF2eVisionerEffectRuleElement } from '../../../scripts/rule-elements/PF2eVisionerEffect.js';

test('native rule application keeps distinct visibility operations in either order', () => {
  const Rule = createPF2eVisionerEffectRuleElement(class {}, {});
  const first = { type: 'overrideVisibility', direction: 'to', fromStates: ['observed'], toState: 'concealed', source: 'a' };
  const second = { type: 'overrideVisibility', direction: 'from', fromStates: ['observed'], toState: 'concealed', source: 'b' };
  for (const operations of [[first, second], [second, first]]) {
    const rule = Object.assign(Object.create(Rule.prototype), { operations });
    expect(rule.smartMergeOperations()).toEqual(operations);
  }
});
