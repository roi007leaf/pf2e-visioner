const VISIBILITY_EFFECT_STATES = ['hidden', 'undetected'];

function hasSignaturePredicate(rule, signature) {
  return (
    rule?.key === 'EphemeralEffect' &&
    Array.isArray(rule.predicate) &&
    rule.predicate.includes(`target:signature:${signature}`)
  );
}

function signaturePredicate(rule) {
  if (rule?.key !== 'EphemeralEffect' || !Array.isArray(rule.predicate)) return null;

  return rule.predicate.find(
    (predicate) => typeof predicate === 'string' && predicate.startsWith('target:signature:'),
  ) ?? null;
}

function ruleIdentity(rule) {
  return signaturePredicate(rule) ?? JSON.stringify(rule);
}

function mergeAggregateRules(aggregates) {
  const seen = new Set();
  const rules = [];

  for (const aggregate of aggregates) {
    const aggregateRules = Array.isArray(aggregate?.system?.rules) ? aggregate.system.rules : [];
    for (const rule of aggregateRules) {
      const identity = ruleIdentity(rule);
      if (seen.has(identity)) continue;

      seen.add(identity);
      rules.push(rule);
    }
  }

  return rules;
}

export class EphemeralEffectIndex {
  constructor({ effects = [], moduleId, effectTarget = 'subject' } = {}) {
    this.moduleId = moduleId;
    this.effectTarget = effectTarget;
    this.aggregates = new Map();
    this.duplicateAggregates = new Map();
    this.rulesByState = new Map();
    this.changedStates = new Set();

    for (const state of VISIBILITY_EFFECT_STATES) {
      const aggregates = effects.filter(
        (effect) =>
          effect?.flags?.[moduleId]?.aggregateOffGuard === true &&
          effect?.flags?.[moduleId]?.visibilityState === state &&
          effect?.flags?.[moduleId]?.effectTarget === effectTarget,
      );
      const aggregate = aggregates[0] || null;
      const duplicates = aggregates.slice(1);
      const rules = mergeAggregateRules(aggregates);

      this.aggregates.set(state, aggregate || null);
      this.duplicateAggregates.set(state, duplicates);
      this.rulesByState.set(state, rules);
      if (
        duplicates.length > 0 ||
        (aggregate && Array.isArray(aggregate.system?.rules) && rules.length !== aggregate.system.rules.length)
      ) {
        this.changedStates.add(state);
      }
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
      const duplicateIds = this.duplicateAggregates
        .get(state)
        .map((duplicate) => duplicate?.id)
        .filter(Boolean);
      const rules = this.getRules(state);
      const changed = this.changedStates.has(state);

      if (aggregate) {
        if (rules.length === 0) {
          effectsToDelete.push(aggregate.id, ...duplicateIds);
        } else if (changed) {
          effectsToUpdate.push({ _id: aggregate.id, 'system.rules': rules });
          effectsToDelete.push(...duplicateIds);
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
