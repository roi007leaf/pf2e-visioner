import { EphemeralEffectIndex } from '../../../scripts/visibility/ephemeral-effect-index.js';

function aggregate(id, state, rules) {
  return {
    id,
    flags: {
      'pf2e-visioner': {
        aggregateOffGuard: true,
        visibilityState: state,
        effectTarget: 'subject',
      },
    },
    system: { rules },
  };
}

function rule(signature) {
  return { key: 'EphemeralEffect', predicate: [`target:signature:${signature}`] };
}

describe('EphemeralEffectIndex', () => {
  test('updates aggregate rules without repeated aggregate scans', () => {
    const index = new EphemeralEffectIndex({
      effects: [aggregate('hidden-effect', 'hidden', [rule('old')])],
      moduleId: 'pf2e-visioner',
      effectTarget: 'subject',
    });

    index.removeSignature('hidden', 'old');
    index.addSignature('undetected', 'new', rule);

    const plan = index.buildMutationPlan({
      createAggregateEffectData: (state, signature, options) => ({ state, signature, options }),
      receiverId: 'receiver',
    });

    expect(plan.effectsToDelete).toEqual(['hidden-effect']);
    expect(plan.effectsToUpdate).toEqual([]);
    expect(plan.effectsToCreate).toEqual([
      expect.objectContaining({
        state: 'undetected',
        signature: 'batch',
        options: expect.objectContaining({
          receiverId: 'receiver',
          existingRules: [rule('new')],
        }),
      }),
    ]);
  });

  test('merges duplicate aggregate rules and deletes extra aggregate effects', () => {
    const index = new EphemeralEffectIndex({
      effects: [
        aggregate('hidden-primary', 'hidden', [rule('old')]),
        aggregate('hidden-duplicate', 'hidden', [rule('new'), rule('old')]),
      ],
      moduleId: 'pf2e-visioner',
      effectTarget: 'subject',
    });

    const plan = index.buildMutationPlan({
      createAggregateEffectData: (state, signature, options) => ({ state, signature, options }),
      receiverId: 'receiver',
    });

    expect(plan.effectsToDelete).toEqual(['hidden-duplicate']);
    expect(plan.effectsToUpdate).toEqual([
      {
        _id: 'hidden-primary',
        'system.rules': [rule('old'), rule('new')],
      },
    ]);
    expect(plan.effectsToCreate).toEqual([]);
  });

  test('deletes all duplicate aggregates when merged rules become empty', () => {
    const index = new EphemeralEffectIndex({
      effects: [
        aggregate('hidden-primary', 'hidden', [rule('old')]),
        aggregate('hidden-duplicate', 'hidden', [rule('old')]),
      ],
      moduleId: 'pf2e-visioner',
      effectTarget: 'subject',
    });

    index.removeSignature('hidden', 'old');

    const plan = index.buildMutationPlan({
      createAggregateEffectData: (state, signature, options) => ({ state, signature, options }),
      receiverId: 'receiver',
    });

    expect(plan.effectsToDelete).toEqual(['hidden-primary', 'hidden-duplicate']);
    expect(plan.effectsToUpdate).toEqual([]);
    expect(plan.effectsToCreate).toEqual([]);
  });
});
