/**
 * Aggregate cover effect helpers
 */

import { COVER_STATES, MODULE_ID } from '../constants.js';
import { getCoverImageForState, getCoverLabel } from '../helpers/cover-helpers.js';

export async function ensureAggregateCoverEffect(effectReceiverToken, state, options = {}) {
  const effects = effectReceiverToken.actor.itemTypes.effect;
  let aggregate = effects.find(
    (e) =>
      e.flags?.[MODULE_ID]?.aggregateCover === true && e.flags?.[MODULE_ID]?.coverState === state,
  );
  if (!aggregate) {
    const label = getCoverLabel(state);
    const img = getCoverImageForState(state);
    const base = {
      name: label,
      type: 'effect',
      system: {
        description: { value: `<p>Aggregated ${label} vs multiple observers.</p>`, gm: '' },
        rules: [],
        slug: null,
        traits: { otherTags: [], value: [] },
        level: { value: 1 },
        duration:
          options.durationRounds >= 0
            ? {
                value: options.durationRounds,
                unit: 'rounds',
                expiry: 'turn-start',
                sustained: false,
              }
            : { value: -1, unit: 'unlimited', expiry: null, sustained: false },
        tokenIcon: { show: true },
        unidentified: true,
        start: {
          value: 0,
          initiative: options.initiative
            ? game.combat?.getCombatantByToken(effectReceiverToken?.id)?.initiative
            : null,
        },
        badge: null,
      },
      img,
      flags: { [MODULE_ID]: { aggregateCover: true, coverState: state } },
    };
    const [created] = await effectReceiverToken.actor.createEmbeddedDocuments('Item', [base]);
    aggregate = created;
  }
  return aggregate;
}

export async function updateAggregateCoverMetaForState(aggregate, state) {
  const label = getCoverLabel(state);
  const desiredName = label;
  const desiredImg = getCoverImageForState(state);
  const update = {};
  if (aggregate?.name !== desiredName) update.name = desiredName;
  if (aggregate?.img !== desiredImg) update.img = desiredImg;
  if (Object.keys(update).length) {
    try {
      await aggregate.update(update);
    } catch (_) {}
  }
}

export async function upsertReflexStealthForMaxCoverOnThisAggregate(aggregate, maxState) {
  const rules = Array.isArray(aggregate.system.rules) ? [...aggregate.system.rules] : [];
  const filtered = rules.filter(
    (r) => !(r?.key === 'FlatModifier' && (r.selector === 'reflex' || r.selector === 'stealth')),
  );
  const cfg = COVER_STATES[maxState];
  if (cfg && (maxState === 'standard' || maxState === 'greater')) {
    const reflexRule = {
      key: 'FlatModifier',
      selector: 'reflex',
      type: 'circumstance',
      value: cfg.bonusReflex,
      predicate: ['area-effect'],
    };
    const stealthRule = {
      key: 'FlatModifier',
      selector: 'stealth',
      type: 'circumstance',
      value: cfg.bonusStealth,
      predicate: ['action:hide', 'action:sneak', 'avoid-detection'],
    };
    filtered.push(reflexRule);
    filtered.push(stealthRule);
  }
  await aggregate.update({ 'system.rules': filtered });
}

export async function updateReflexStealthAcrossCoverAggregates(effectReceiverToken) {
  const effects = effectReceiverToken.actor.itemTypes.effect.filter(
    (e) => e.flags?.[MODULE_ID]?.aggregateCover === true,
  );
  if (effects.length === 0) return;
  const order = { none: 0, lesser: 1, standard: 2, greater: 3 };
  let highestState = 'none';
  for (const agg of effects) {
    const aggregateState = agg.flags?.[MODULE_ID]?.coverState || 'none';
    if (order[aggregateState] > order[highestState]) {
      highestState = aggregateState;
    }
  }
  for (const agg of effects) {
    const rules = Array.isArray(agg.system.rules) ? [...agg.system.rules] : [];
    const withoutRS = rules.filter(
      (r) => !(r?.key === 'FlatModifier' && (r.selector === 'reflex' || r.selector === 'stealth')),
    );
    if (withoutRS.length !== rules.length) {
      await agg.update({ 'system.rules': withoutRS });
    }
  }
  if (highestState !== 'none') {
    const targetAgg = effects.find((e) => e.flags?.[MODULE_ID]?.coverState === highestState);
    if (targetAgg) {
      await upsertReflexStealthForMaxCoverOnThisAggregate(targetAgg, highestState, COVER_STATES);
    }
  }
}
