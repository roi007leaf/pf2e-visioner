import { systemIconPath } from '../../system-adapter.js';
import { PredicateHelper } from '../PredicateHelper.js';

const ATTACK_ROLL_SELECTOR = 'attack-roll';
const RANGED_ITEM_OPTIONS = new Set(['item:ranged', 'origin:item:ranged']);

function containsPositiveRangedItemOption(value, negated = false) {
  if (typeof value === 'string') {
    return !negated && RANGED_ITEM_OPTIONS.has(value);
  }

  if (Array.isArray(value)) {
    return value.some((entry) => containsPositiveRangedItemOption(entry, negated));
  }

  if (!value || typeof value !== 'object') return false;

  return Object.entries(value).some(([operator, statement]) => {
    const statementIsNegated = operator === 'not' || operator === 'nor';
    return containsPositiveRangedItemOption(statement, statementIsNegated ? !negated : negated);
  });
}

function withOriginItemAliases(rollOptions) {
  const options = new Set(rollOptions || []);
  for (const option of options) {
    if (typeof option === 'string' && option.startsWith('item:')) {
      options.add(`origin:${option}`);
    }
  }
  return options;
}

function createVisibilityRollContextEffect(operation, ruleElement) {
  const state = operation.state;
  const condition = game.pf2e?.ConditionManager?.conditions?.get?.(state);
  const stateName = condition?.name || `${state.charAt(0).toUpperCase()}${state.slice(1)}`;
  const sourceName = ruleElement.item?.name;

  return {
    name: sourceName ? `${stateName} (${sourceName})` : stateName,
    type: 'effect',
    img: condition?.img || systemIconPath(`conditions/${state}.webp`),
    system: {
      description: { value: '', gm: '' },
      rules: [
        {
          key: 'RollOption',
          domain: 'all',
          option: `target:condition:${state}`,
        },
      ],
      traits: { otherTags: [], value: [] },
      level: { value: 1 },
      duration: {
        value: -1,
        unit: 'unlimited',
        expiry: null,
        sustained: false,
      },
      tokenIcon: { show: false },
      unidentified: false,
      start: { value: 0 },
      badge: null,
    },
    flags: {
      'pf2e-visioner': {
        attackQualifiedVisibility: true,
      },
    },
  };
}

export class AttackQualifiedVisibility {
  static isOperation(operation) {
    return (
      operation?.type === 'overrideVisibility' &&
      operation.state === 'concealed' &&
      (operation.direction || 'from') === 'from' &&
      (operation.observers || 'all') === 'all' &&
      operation.range == null &&
      !operation.tokenIds?.length &&
      !operation.qualifications &&
      containsPositiveRangedItemOption(operation.predicate)
    );
  }

  static register(operation, ruleElement) {
    if (!this.isOperation(operation)) return false;

    const ephemeralEffects = ruleElement?.actor?.synthetics?.ephemeralEffects;
    if (!ephemeralEffects) return false;

    const deferredEffect = async ({ test = [] } = {}) => {
      const rollOptions = withOriginItemAliases(test);
      if (!ruleElement.test(rollOptions)) return null;
      if (!PredicateHelper.evaluate(operation.predicate, rollOptions)) return null;
      return createVisibilityRollContextEffect(operation, ruleElement);
    };

    const selector = (ephemeralEffects[ATTACK_ROLL_SELECTOR] ??= {
      target: [],
      origin: [],
    });
    // The defender owns this rule, so PF2e applies its "origin" synthetic to the attacker clone.
    selector.origin.push(deferredEffect);
    return true;
  }
}
