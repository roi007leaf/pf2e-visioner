import { beforeEach, describe, expect, it, jest } from '@jest/globals';

describe('attack-qualified visibility overrides', () => {
  const rangedVisibilityOperation = {
    type: 'overrideVisibility',
    state: 'concealed',
    predicate: ['origin:item:ranged'],
    direction: 'from',
    observers: 'all',
  };

  beforeEach(() => {
    jest.resetModules();
  });

  it('adds Concealed only to ranged attack roll context', async () => {
    const { AttackQualifiedVisibility } = await import(
      '../../../scripts/rule-elements/operations/AttackQualifiedVisibility.js'
    );
    const actor = { synthetics: { ephemeralEffects: {} } };
    const ruleElement = {
      actor,
      item: { name: 'Elemental Rage' },
      test: jest.fn(() => true),
    };

    expect(AttackQualifiedVisibility.register(rangedVisibilityOperation, ruleElement)).toBe(true);

    const deferred = actor.synthetics.ephemeralEffects['attack-roll'].origin[0];
    await expect(deferred({ test: ['attack', 'item:melee'] })).resolves.toBeNull();
    await expect(deferred({ test: ['attack', 'item:ranged'] })).resolves.toEqual(
      expect.objectContaining({
        name: 'Concealed (Elemental Rage)',
        type: 'effect',
        system: expect.objectContaining({
          rules: [
            {
              key: 'RollOption',
              domain: 'all',
              option: 'target:condition:concealed',
            },
          ],
        }),
      }),
    );

    expect(Object.keys(actor.synthetics.ephemeralEffects)).toEqual(['attack-roll']);
  });

  it('keeps the contextual operation out of persistent observer-target state', async () => {
    const applyVisibilityOverride = jest.fn();
    jest.doMock(
      '../../../scripts/rule-elements/operations/VisibilityOverride.js',
      () => ({
        VisibilityOverride: {
          applyVisibilityOverride,
        },
      }),
    );

    const { createPF2eVisionerEffectRuleElement } = await import(
      '../../../scripts/rule-elements/PF2eVisionerEffect.js'
    );
    const BaseRuleElement = class {
      constructor(data, item) {
        this.operations = data.operations;
        this.item = item;
        this.actor = item.actor;
        this.predicate = [];
        this.slug = 'effect';
      }

      test() {
        return true;
      }
    };
    const token = {
      id: 'elemental-token',
      document: {
        getFlag: jest.fn(() => ({})),
        setFlag: jest.fn(),
      },
    };
    const actor = {
      synthetics: { ephemeralEffects: {} },
      getActiveTokens: jest.fn(() => [token]),
    };
    const item = { id: 'elemental-rage', name: 'Elemental Rage', actor };
    const EffectRuleElement = createPF2eVisionerEffectRuleElement(BaseRuleElement, {});
    const ruleElement = new EffectRuleElement(
      { operations: [rangedVisibilityOperation] },
      item,
    );

    ruleElement.afterPrepareData();
    await ruleElement.applyOperation(rangedVisibilityOperation, token);
    await ruleElement.onUpdate();

    expect(actor.synthetics.ephemeralEffects['attack-roll'].origin).toHaveLength(1);
    expect(applyVisibilityOverride).not.toHaveBeenCalled();
    expect(token.document.setFlag).not.toHaveBeenCalled();

    const persistentOperation = {
      type: 'overrideVisibility',
      state: 'concealed',
      predicate: ['target:trait:undead'],
      direction: 'from',
    };
    await ruleElement.applyOperation(persistentOperation, token);

    expect(applyVisibilityOverride).toHaveBeenCalledTimes(1);
    expect(token.document.setFlag).toHaveBeenCalledTimes(2);
  });
});
