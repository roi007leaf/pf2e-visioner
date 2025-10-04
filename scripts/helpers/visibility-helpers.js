/**
 * Helpers for off-guard visibility ephemeral effects
 */

import { MODULE_ID, VISIBILITY_STATES } from '../constants.js';

/**
 * Get the correct PF2E condition icon for a visibility state
 * @param {string} visibilityState - The visibility state (hidden, undetected, etc.)
 * @returns {string} The icon path or fallback
 */
function getPF2eConditionIcon(visibilityState) {
  try {
    // Try to get the icon from the actual PF2E condition item
    const conditionName = VISIBILITY_STATES[visibilityState]?.pf2eCondition;
    if (conditionName) {
      const condition = game.pf2e?.ConditionManager?.conditions?.get?.(conditionName);
      if (condition?.img) {
        return condition.img;
      }
    }

    // Fallback to direct path
    return `systems/pf2e/icons/conditions/${visibilityState}.webp`;
  } catch (error) {
    console.error(`PF2E Visioner: Failed to get condition icon for ${visibilityState}:`, error);
    // Ultimate fallback to a generic effect icon
    return 'icons/svg/aura.svg';
  }
}

export function createEphemeralEffectRule(signature) {
  return {
    key: 'EphemeralEffect',
    predicate: [`target:signature:${signature}`],
    selectors: ['strike-attack-roll', 'spell-attack-roll', 'strike-damage', 'attack-spell-damage'],
    uuid: 'Compendium.pf2e.conditionitems.AJh5ex99aV6VTggg',
  };
}

export function createAggregateEffectData(visibilityState, signature, options = {}) {
  const visibilityLabel = game.i18n.localize(`PF2E.condition.${visibilityState}.name`);
  const effectTarget = options.effectTarget || 'subject';
  let rules = options.existingRules || [];
  if (rules.length === 0 && signature !== 'batch') {
    rules = [createEphemeralEffectRule(signature)];
  }
  return {
    name: `${visibilityLabel}`,
    type: 'effect',
    system: {
      description: {
        value: `<p>Aggregated off-guard for ${visibilityState} vs multiple observers.</p>`,
        gm: '',
      },
      rules: rules,
      slug: null,
      traits: { otherTags: [], value: [] },
      level: { value: 1 },
      duration:
        options.durationRounds >= 0
          ? {
            value: options.durationRounds,
            unit: 'rounds',
            expiry: 'turn-end',
            sustained: false,
          }
          : { value: -1, unit: 'unlimited', expiry: null, sustained: false },
      tokenIcon: { show: false },
      unidentified: true,
      start: {
        value: 0,
        initiative: options.initiative
          ? game.combat?.getCombatantByToken(options.receiverId)?.initiative
          : null,
      },
      badge: null,
      fromSpell: false,
    },
    img: getPF2eConditionIcon(visibilityState),
    flags: {
      [MODULE_ID]: {
        aggregateOffGuard: true,
        visibilityState,
        effectTarget,
      },
    },
  };
}

export function getMinimumVisibilityAsTarget(token) {
  if (!token?.actor) return null;

  const effects = token.actor.itemTypes?.effect ?? [];
  const minimumEffect = effects.find((e) => {
    const rollOptions = e.system?.rules?.find?.(r => r.key === 'RollOption')?.option;
    return rollOptions?.startsWith?.('minimum-visibility-target:');
  });

  if (!minimumEffect) return null;

  const rollOptionRule = minimumEffect.system?.rules?.find?.(r => r.key === 'RollOption');
  if (!rollOptionRule?.option) return null;

  const match = rollOptionRule.option.match(/^minimum-visibility-target:(concealed|hidden|undetected)$/);
  return match ? match[1] : null;
}
