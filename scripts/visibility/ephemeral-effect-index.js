const VISIBILITY_EFFECT_STATES = ['hidden', 'undetected'];

function hasSignaturePredicate(rule, signature) {
  return (
    rule?.key === 'EphemeralEffect' &&
    Array.isArray(rule.predicate) &&
    rule.predicate.includes(`target:signature:${signature}`)
  );
}

export class EphemeralEffectIndex {
  constructor({ effects = [], moduleId, effectTarget = 'subject' } = {}) {
    this.moduleId = moduleId;
    this.effectTarget = effectTarget;
    this.aggregates = new Map();
    this.rulesByState = new Map();
    this.changedStates = new Set();

    for (const state of VISIBILITY_EFFECT_STATES) {
      const aggregate = effects.find(
        (effect) =>
          effect?.flags?.[moduleId]?.aggregateOffGuard === true &&
          effect?.flags?.[moduleId]?.visibilityState === state &&
          effect?.flags?.[moduleId]?.effectTarget === effectTarget,
      );
      this.aggregates.set(state, aggregate || null);
      this.rulesByState.set(
        state,
        aggregate && Array.isArray(aggregate.system?.rules) ? [...aggregate.system.rules] : [],
      );
    }
  }

  getAggregate(state) {
    return this.aggregates.get(state) || null;
  }

  getRules(state) {
    return this.rulesByState.get(state) || [];
  }

  hasSignature(state, signature) {
    return this.getRules(state).some((rule) => hasSignaturePredicate(rule, signature));
  }

  removeSignature(state, signature) {
    const rules = this.getRules(state);
    const nextRules = rules.filter((rule) => !hasSignaturePredicate(rule, signature));
    if (nextRules.length === rules.length) return false;

    this.rulesByState.set(state, nextRules);
    this.changedStates.add(state);
    return true;
  }

  addSignature(state, signature, createRule) {
    if (this.hasSignature(state, signature)) return false;

    this.rulesByState.set(state, [...this.getRules(state), createRule(signature)]);
    this.changedStates.add(state);
    return true;
  }

  buildMutationPlan({ createAggregateEffectData, options = {}, receiverId, aggregateSignature = 'batch' } = {}) {
    const effectsToCreate = [];
    const effectsToUpdate = [];
    const effectsToDelete = [];

    for (const state of VISIBILITY_EFFECT_STATES) {
      const aggregate = this.getAggregate(state);
      const rules = this.getRules(state);
      const changed = this.changedStates.has(state);

      if (aggregate) {
        if (rules.length === 0) {
          effectsToDelete.push(aggregate.id);
        } else if (changed) {
          effectsToUpdate.push({ _id: aggregate.id, 'system.rules': rules });
        }
      } else if (rules.length > 0) {
        effectsToCreate.push(
          createAggregateEffectData(state, aggregateSignature, {
            ...options,
            receiverId,
            existingRules: rules,
          }),
        );
      }
    }

    return { effectsToCreate, effectsToUpdate, effectsToDelete };
  }
}
