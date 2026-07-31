import { systemIconPath } from '../../system-adapter.js';
import { isSceneTokenVisionDisabled } from '../../services/scene-token-vision.js';
import { PredicateHelper } from '../PredicateHelper.js';

function createVisibilityRollContextEffect(operation, ruleElement, rollOption) {
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
          option: rollOption,
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
        rollContextVisibility: true,
      },
    },
  };
}

function failUnsupportedConfiguration(ruleElement) {
  ruleElement.failValidation?.(
    'roll-context visibility selectors require unrestricted observer selection',
  );
}

function hasQualifications(operation) {
  return (
    operation.qualifications &&
    typeof operation.qualifications === 'object' &&
    Object.keys(operation.qualifications).length > 0
  );
}

export class RollContextVisibility {
  static isOperation(operation) {
    return operation?.type === 'overrideVisibility' && operation.selectors?.length > 0;
  }

  static register(operation, ruleElement) {
    if (!this.isOperation(operation)) return false;

    const ephemeralEffects = ruleElement?.actor?.synthetics?.ephemeralEffects;
    if (!ephemeralEffects) return false;

    if (
      typeof operation.state !== 'string' ||
      !['from', 'to'].includes(operation.direction || 'from') ||
      (operation.observers || 'all') !== 'all' ||
      operation.range != null ||
      operation.tokenIds?.length ||
      hasQualifications(operation)
    ) {
      failUnsupportedConfiguration(ruleElement);
      return false;
    }

    const direction = operation.direction || 'from';
    const affects = direction === 'from' ? 'origin' : 'target';
    const rollOption =
      direction === 'from'
        ? `target:condition:${operation.state}`
        : `self:condition:${operation.state}`;
    const deferredEffect = async ({ test = [] } = {}) => {
      if (isSceneTokenVisionDisabled()) return null;
      const rollOptions = new Set(test);
      if (ruleElement.ignored) return null;
      if (ruleElement.predicate?.length > 0 && !ruleElement.test(rollOptions)) return null;
      if (!PredicateHelper.evaluate(operation.predicate, rollOptions)) return null;
      return createVisibilityRollContextEffect(operation, ruleElement, rollOption);
    };

    const configuredSelectors =
      ruleElement.resolveInjectedProperties?.(operation.selectors) ?? operation.selectors;
    const selectors = new Set(
      configuredSelectors.filter((selector) => typeof selector === 'string' && selector.length > 0),
    );
    for (const selector of selectors) {
      const synthetic = (ephemeralEffects[selector] ??= {
        target: [],
        origin: [],
      });
      synthetic[affects].push(deferredEffect);
    }
    return selectors.size > 0;
  }
}
