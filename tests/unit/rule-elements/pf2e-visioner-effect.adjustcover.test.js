import { jest } from '@jest/globals';

describe('PF2eVisionerEffect adjustCover wiring', () => {
  test('applyOperation dispatches adjustCover to CoverAdjustment', async () => {
    const applied = [];
    jest.unstable_mockModule('../../../scripts/rule-elements/operations/CoverAdjustment.js', () => ({
      CoverAdjustment: {
        applyCoverAdjustment: async (op, token) => applied.push([op.type, token.id]),
        removeCoverAdjustment: async () => {},
      },
    }));
    const { createPF2eVisionerEffectRuleElement } = await import('../../../scripts/rule-elements/PF2eVisionerEffect.js');
    const Base = class { constructor() {} static defineSchema() { return {}; } async registerFlag() {} };
    const fields = {
      ArrayField: class { constructor() {} }, SchemaField: class { constructor() {} },
      StringField: class { constructor() {} }, NumberField: class { constructor() {} },
      BooleanField: class { constructor() {} }, ObjectField: class { constructor() {} }, AnyField: class {},
    };
    const Cls = createPF2eVisionerEffectRuleElement(Base, fields);
    const inst = Object.create(Cls.prototype);
    inst.ruleElementId = 'x';
    await inst.applyOperation({ type: 'adjustCover', mode: 'step', steps: -1 }, { id: 't1', document: {} });
    expect(applied).toEqual([['adjustCover', 't1']]);
  });
});
