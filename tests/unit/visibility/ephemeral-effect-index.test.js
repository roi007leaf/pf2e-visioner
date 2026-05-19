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
});
