import { jest } from '@jest/globals';

class MockStringField { constructor(opts = {}) { Object.assign(this, opts); } }
class MockNumberField { constructor(opts = {}) { Object.assign(this, opts); } }
class MockBooleanField { constructor(opts = {}) { Object.assign(this, opts); } }
class MockArrayField { constructor(element, opts = {}) { this.element = element; Object.assign(this, opts); } }
class MockSchemaField { constructor(schema) { this.schema = schema; } }
class MockObjectField {}
class MockAnyField {}
class MockPredicateField { constructor() {} }

function makeFields() {
  return {
    AnyField: MockAnyField,
    ArrayField: MockArrayField,
    SchemaField: MockSchemaField,
    StringField: MockStringField,
    NumberField: MockNumberField,
    BooleanField: MockBooleanField,
    ObjectField: MockObjectField,
  };
}

async function makeRuleElementClass() {
  global.game = global.game || {};
  global.game.user = { isGM: true };
  global.game.pf2e = {
    RuleElements: { builtin: { RollOption: { defineSchema: () => ({ predicate: { constructor: MockPredicateField } }) } } },
  };
  const baseRuleElementClass = class {
    constructor(data = {}, item = {}) {
      this.operations = data.operations || [];
      this.slug = data.slug || 'effect';
      this.item = item;
      this.actor = item.actor;
      this.predicate = [];
    }
    static defineSchema() { return {}; }
    test() { return true; }
  };
  const { createPF2eVisionerEffectRuleElement } = await import(
    '../../../scripts/rule-elements/PF2eVisionerEffect.js'
  );
  return createPF2eVisionerEffectRuleElement(baseRuleElementClass, makeFields());
}

describe('PF2eVisionerEffect adjustCover wiring', () => {
  beforeEach(() => { jest.resetModules(); });

  it('schema exposes adjustCover type, scope field, and step/bonus modes', async () => {
    const EffectRuleElement = await makeRuleElementClass();
    const schema = EffectRuleElement.defineSchema();
    const opSchema = schema.operations.element.schema;
    expect(opSchema.type.choices).toContain('adjustCover');
    expect(opSchema.scope.choices).toEqual(expect.arrayContaining(['while-active', 'next-attack']));
    expect(opSchema.mode.choices).toEqual(expect.arrayContaining(['step', 'bonus']));
  });

  it('applyOperation dispatches adjustCover to CoverAdjustment.applyCoverAdjustment', async () => {
    const applyCoverAdjustment = jest.fn().mockResolvedValue(undefined);
    jest.doMock('../../../scripts/rule-elements/operations/CoverAdjustment.js', () => ({
      CoverAdjustment: { applyCoverAdjustment, removeCoverAdjustment: jest.fn() },
    }));
    const EffectRuleElement = await makeRuleElementClass();
    const token = {
      id: 't1',
      document: { getFlag: jest.fn(() => ({})), setFlag: jest.fn().mockResolvedValue(undefined) },
    };
    const item = { id: 'effect-1', name: 'Effect', slug: 'eff', actor: { getActiveTokens: () => [token] } };
    const operation = { type: 'adjustCover', mode: 'step', steps: -1 };
    const instance = new EffectRuleElement({ operations: [operation] }, item);
    await instance.applyOperation(operation, token);
    expect(applyCoverAdjustment).toHaveBeenCalledWith(operation, token, instance);
  });
});
