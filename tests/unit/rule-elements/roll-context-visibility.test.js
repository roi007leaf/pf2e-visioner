import { beforeEach, describe, expect, it, jest } from '@jest/globals';

describe('roll-context visibility overrides', () => {
  let evaluatedPredicates;

  const contextualVisibilityOperation = {
    type: 'overrideVisibility',
    state: 'concealed',
    selectors: ['attack-roll'],
    predicate: ['item:ranged'],
    direction: 'from',
    observers: 'all',
  };

  beforeEach(() => {
    jest.resetModules();
    evaluatedPredicates = [];
    global.game.pf2e = {
      ...global.game.pf2e,
      Predicate: class {
        constructor(predicate) {
          this.predicate = predicate;
          evaluatedPredicates.push(predicate);
        }

        test(rollOptions) {
          const options = new Set(rollOptions);
          return this.predicate.every((term) => options.has(term));
        }
      },
    };
  });

  it('uses configured selectors and delegates applicability to PF2e predicates', async () => {
    const { RollContextVisibility } = await import(
      '../../../scripts/rule-elements/operations/RollContextVisibility.js'
    );
    const actor = { synthetics: { ephemeralEffects: {} } };
    const ruleElement = {
      actor,
      item: { name: 'Elemental Rage' },
      test: jest.fn(() => true),
    };

    expect(RollContextVisibility.register(contextualVisibilityOperation, ruleElement)).toBe(true);

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
    expect(evaluatedPredicates).toContain(contextualVisibilityOperation.predicate);

    expect(Object.keys(actor.synthetics.ephemeralEffects)).toEqual(['attack-roll']);

    const magicalVisibilityOperation = {
      ...contextualVisibilityOperation,
      selectors: ['spell-attack-roll'],
      predicate: ['item:trait:magical'],
    };
    expect(RollContextVisibility.register(magicalVisibilityOperation, ruleElement)).toBe(true);
    const magicalDeferred = actor.synthetics.ephemeralEffects['spell-attack-roll'].origin[0];
    await expect(magicalDeferred({ test: ['item:ranged'] })).resolves.toBeNull();
    await expect(magicalDeferred({ test: ['item:trait:magical'] })).resolves.toEqual(
      expect.objectContaining({ name: 'Concealed (Elemental Rage)' }),
    );

    const outwardVisibilityOperation = {
      ...contextualVisibilityOperation,
      direction: 'to',
    };
    expect(RollContextVisibility.register(outwardVisibilityOperation, ruleElement)).toBe(true);
    const outwardDeferred = actor.synthetics.ephemeralEffects['attack-roll'].target[0];
    const outwardEffect = await outwardDeferred({ test: ['item:ranged'] });
    expect(outwardEffect.system.rules[0].option).toBe('self:condition:concealed');
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
      { operations: [contextualVisibilityOperation] },
      item,
    );

    ruleElement.afterPrepareData();
    await ruleElement.applyOperation(contextualVisibilityOperation, token);
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
