/**
 * Batch and reconcile operations for cover aggregates
 */

import { MODULE_ID } from '../constants.js';
import {
  extractCoverAgainstFromPredicate,
  extractSignaturesFromPredicate,
  getCoverImageForState,
  getCoverLabel,
} from '../helpers/cover-helpers.js';
import { getCoverMap } from '../stores/cover-map.js';
import { updateReflexStealthAcrossCoverAggregates } from './aggregates.js';
import { runWithCoverEffectLock } from './utils.js';

export async function dedupeCoverAggregates(effectReceiverToken) {
  const effects = effectReceiverToken.actor.itemTypes.effect.filter(
    (e) => e.flags?.[MODULE_ID]?.aggregateCover === true,
  );
  if (effects.length === 0) return;
  const legacy = effects.filter((e) => !e.flags?.[MODULE_ID]?.coverState);
  if (legacy.length) {
    const ids = legacy.map((e) => e.id).filter((id) => !!effectReceiverToken.actor.items.get(id));
    if (ids.length) {
      // Only GMs can delete effects
      if (game.user.isGM) {
        try {
          await effectReceiverToken.actor.deleteEmbeddedDocuments('Item', ids);
        } catch (_) {}
      }
    }
  }
  const byState = new Map();
  for (const eff of effects.filter((e) => e.flags?.[MODULE_ID]?.coverState)) {
    const state = eff.flags[MODULE_ID].coverState;
    if (!byState.has(state)) byState.set(state, []);
    byState.get(state).push(eff);
  }
  for (const [state, group] of byState.entries()) {
    if (group.length <= 1) continue;
    const primary = [...group].sort((a, b) => String(a.id).localeCompare(String(b.id)))[0];
    const mergedRules = [];
    const seen = new Set();
    for (const g of group) {
      const rules = Array.isArray(g.system.rules) ? g.system.rules : [];
      for (const r of rules) {
        const sig = JSON.stringify(r);
        if (seen.has(sig)) continue;
        seen.add(sig);
        mergedRules.push(r);
      }
    }
    if (effectReceiverToken.actor.items.get(primary.id)) {
      try {
        await primary.update({ 'system.rules': mergedRules });
      } catch (_) {}
    }
    const toDelete = group
      .filter((e) => e.id !== primary.id)
      .map((e) => e.id)
      .filter((id) => !!effectReceiverToken.actor.items.get(id));
    if (toDelete.length) {
      // Only GMs can delete effects
      if (game.user.isGM) {
        try {
          await effectReceiverToken.actor.deleteEmbeddedDocuments('Item', toDelete);
        } catch (_) {}
      }
    }
  }
}

export async function reconcileCoverAggregatesAgainstMaps(effectReceiverToken) {
  try {
    if (!effectReceiverToken?.actor) return;
    const targetId = effectReceiverToken.id || effectReceiverToken.document?.id;
    const observers = (canvas?.tokens?.placeables ?? []).filter(
      (t) => t && t !== effectReceiverToken && t.actor,
    );
    const aggregates = effectReceiverToken.actor.itemTypes.effect.filter(
      (e) => e.flags?.[MODULE_ID]?.aggregateCover === true,
    );
    const toDelete = [];
    for (const agg of aggregates) {
      const state = agg.flags?.[MODULE_ID]?.coverState || 'none';
      let rules = Array.isArray(agg.system.rules) ? [...agg.system.rules] : [];
      const seenAC = new Set();
      const seenRO = new Set();
      const filtered = rules.filter((r) => {
        if (r?.key === 'FlatModifier' && r.selector === 'ac') {
          const signatures = extractSignaturesFromPredicate(r.predicate);
          const signature = signatures[0] ?? null;
          const acKey = `ac:${signature}:${r.value}`;
          if (seenAC.has(acKey)) return false;
          seenAC.add(acKey);
          // If there is no signature recorded on this rule, consider it invalid and drop it
          if (!signature) return false;
          const candidates = observers.filter((o) => o.actor?.signature === signature);
          if (candidates.length === 0) return false;
          // If rule has a cover-against:<tokenId> predicate, verify it matches one of the candidate observer tokens
          const against = extractCoverAgainstFromPredicate(r.predicate);
          if (against.length > 0) {
            const match = candidates.some((o) => against.includes(o.id));
            if (!match) return false;
          }
          const stillValid = candidates.some(
            (o) => (getCoverMap(o)?.[targetId] || 'none') === state,
          );
          return stillValid;
        }
        if (
          r?.key === 'RollOption' &&
          typeof r.option === 'string' &&
          r.option.startsWith('cover-against:')
        ) {
          const tokenId = r.option.slice('cover-against:'.length);
          if (!tokenId) return false;
          if (seenRO.has(tokenId)) return false;
          seenRO.add(tokenId);
          const token = observers.find((o) => o.id === tokenId);
          if (!token) return false;
          const s = getCoverMap(token)?.[targetId] || 'none';
          return s === state;
        }
        return true;
      });
      if (filtered.length !== rules.length) {
        try {
          await agg.update({ 'system.rules': filtered });
        } catch (_) {}
      }
      if (filtered.length === 0) toDelete.push(agg.id);
    }
    if (toDelete.length) {
      // Only GMs can delete effects
      if (game.user.isGM) {
        try {
          await effectReceiverToken.actor.deleteEmbeddedDocuments('Item', toDelete);
        } catch (_) {}
      }
    }
  } catch (_) {}
}

export async function batchUpdateCoverEffects(observerToken, targetUpdates, options = {}) {
  // Only GMs can perform batch operations
  if (!game.user.isGM) return;

  if (!observerToken?.actor || !targetUpdates?.length) return;

  const updatesByTarget = new Map();
  for (const update of targetUpdates) {
    if (!update.target?.actor) continue;
    const targetId = update.target.actor.id;
    if (!updatesByTarget.has(targetId))
      updatesByTarget.set(targetId, { target: update.target, states: new Map() });
    const targetData = updatesByTarget.get(targetId);
    const state = update.state || 'none';
    if (!targetData.states.has(state)) targetData.states.set(state, []);
    targetData.states.get(state).push(observerToken);
  }
  for (const { target, states } of updatesByTarget.values()) {
    // Skip ignored actor types (targets like loot/vehicle/party)
    try {
      if (['loot', 'vehicle', 'party'].includes(target?.actor?.type)) continue;
    } catch (_) {}
    (await target?.actor) &&
      runWithCoverEffectLock(target.actor, async () => {
        const allCoverAggregates = target.actor.itemTypes.effect.filter(
          (e) => e.flags?.[MODULE_ID]?.aggregateCover === true,
        );
        const aggregatesByState = new Map();
        for (const agg of allCoverAggregates) {
          const state = agg.flags?.[MODULE_ID]?.coverState;
          if (state) aggregatesByState.set(state, agg);
        }
        const rulesByState = new Map();
        for (const agg of allCoverAggregates) {
          const state = agg.flags?.[MODULE_ID]?.coverState;
          if (state)
            rulesByState.set(state, Array.isArray(agg.system.rules) ? [...agg.system.rules] : []);
        }
        const effectsToCreate = [];
        const effectsToUpdate = [];
        const effectsToDelete = [];
        for (const [coverState, observers] of states.entries()) {
          const isRemove = coverState === 'none';
          if (isRemove) {
            for (const [state, rules] of rulesByState.entries()) {
              const aggregate = aggregatesByState.get(state);
              if (!aggregate) continue;
              let modified = false;
              const filteredRules = [...rules];
              for (const observer of observers) {
                const signature = observer.actor.signature;
                const tokenId = observer.id;
                const newRules = filteredRules.filter((r) => {
                  if (
                    r?.key === 'FlatModifier' &&
                    (r.selector === 'ac' ||
                      (Array.isArray(r.selector) &&
                        r.selector.length === 1 &&
                        r.selector[0] === 'ac'))
                  ) {
                    const hasSig = extractSignaturesFromPredicate(r.predicate).includes(signature);
                    const hasAgainst = extractCoverAgainstFromPredicate(r.predicate).includes(
                      tokenId,
                    );
                    if (hasSig || hasAgainst) {
                      modified = true;
                      return false;
                    }
                  }
                  if (
                    r?.key === 'RollOption' &&
                    r.domain === 'all' &&
                    r.option === `cover-against:${tokenId}`
                  ) {
                    modified = true;
                    return false;
                  }
                  return true;
                });
                // Always update filteredRules to ensure cumulative removals
                filteredRules.splice(0, filteredRules.length, ...newRules);
              }
              if (modified) {
                if (filteredRules.length === 0) effectsToDelete.push(aggregate.id);
                else effectsToUpdate.push({ _id: aggregate.id, 'system.rules': filteredRules });
              }
            }
          } else {
            let targetAggregate = aggregatesByState.get(coverState);
            let rules = rulesByState.get(coverState) || [];
            let modified = false;
            for (const observer of observers) {
              try {
                if (['loot', 'vehicle', 'party'].includes(observer?.actor?.type)) continue;
              } catch (_) {}
              const signature = observer.actor?.signature || observer.actor?.id || observer.id;
              const tokenId = observer.id;
              // Remove existing entries for this signature/tokenId, then append once
              let nextRules = rules.filter((r) => {
                if (r?.key === 'FlatModifier' && r.selector === 'ac') {
                  const hasSig = extractSignaturesFromPredicate(r.predicate).includes(signature);
                  const hasAgainst = extractCoverAgainstFromPredicate(r.predicate).includes(
                    tokenId,
                  );
                  if (hasSig || hasAgainst) {
                    modified = true;
                    return false;
                  }
                }
                if (r?.key === 'RollOption' && r.option === `cover-against:${tokenId}`) {
                  modified = true;
                  return false;
                }
                return true;
              });
              // Ensure de-duplication before pushing
              const roKey = `cover-against:${tokenId}`;
              const hasRO = nextRules.some((r) => r?.key === 'RollOption' && r.option === roKey);
              if (!hasRO) nextRules.push({ key: 'RollOption', domain: 'all', option: roKey });
              const hasAC = nextRules.some(
                (r) =>
                  r?.key === 'FlatModifier' &&
                  r.selector === 'ac' &&
                  extractSignaturesFromPredicate(r.predicate).includes(signature),
              );
              if (!hasAC) {
                const newACRule = {
                  key: 'FlatModifier',
                  selector: 'ac',
                  type: 'circumstance',
                  value: getBonus(coverState),
                  label: `${getCoverLabel(coverState)} vs ${signature} (${observer.name})`,
                  predicate: [`origin:signature:${signature}`],
                };
                nextRules.push(newACRule);
              }
              rules = nextRules;
              modified = true;
            }
            if (modified) {
              const canonical = ensureCoverLevelRules(canonicalizeObserverRules(rules), coverState);
              if (targetAggregate)
                effectsToUpdate.push({ _id: targetAggregate.id, 'system.rules': canonical });
              else effectsToCreate.push(createAggregate(target, coverState, canonical, options));
              for (const [state, stateRules] of rulesByState.entries()) {
                if (state === coverState) continue;
                const aggregate = aggregatesByState.get(state);
                if (!aggregate) continue;
                let stateModified = false;
                let filteredRules = [...stateRules];
                for (const observer of observers) {
                  try {
                    if (['loot', 'vehicle', 'party'].includes(observer?.actor?.type)) continue;
                  } catch (_) {}
                  const signature = observer.actor?.signature || observer.actor?.id || observer.id;
                  const tokenId = observer.id;

                  // Filter out rules for this specific observer
                  const newRules = filteredRules.filter((r) => {
                    if (
                      r?.key === 'FlatModifier' &&
                      (r.selector === 'ac' ||
                        (Array.isArray(r.selector) &&
                          r.selector.length === 1 &&
                          r.selector[0] === 'ac'))
                    ) {
                      const signatures = extractSignaturesFromPredicate(r.predicate);
                      const coverAgainst = extractCoverAgainstFromPredicate(r.predicate);
                      const hasSig = signatures.includes(signature);
                      const hasAgainst = coverAgainst.includes(tokenId);
                      if (hasSig || hasAgainst) {
                        stateModified = true;
                        return false;
                      }
                    }
                    if (r?.key === 'RollOption' && r.option === `cover-against:${tokenId}`) {
                      stateModified = true;
                      return false;
                    }
                    return true;
                  });

                  // Always update filteredRules to the new filtered result
                  // This ensures that multiple observer removals are cumulative
                  filteredRules = newRules;
                }
                if (stateModified) {
                  if (filteredRules.length === 0) effectsToDelete.push(aggregate.id);
                  else effectsToUpdate.push({ _id: aggregate.id, 'system.rules': filteredRules });
                }
              }
            }
          }
        }
        if (effectsToDelete.length > 0)
          await target.actor.deleteEmbeddedDocuments('Item', effectsToDelete);
        if (effectsToUpdate.length > 0)
          await target.actor.updateEmbeddedDocuments('Item', effectsToUpdate);
        if (effectsToCreate.length > 0)
          await target.actor.createEmbeddedDocuments('Item', effectsToCreate);
        // Remove any aggregates that ended up empty (no rules)
        const after = target.actor.itemTypes.effect.filter(
          (e) => e.flags?.[MODULE_ID]?.aggregateCover === true,
        );
        const empties = after
          .filter((e) => !Array.isArray(e.system?.rules) || e.system.rules.length === 0)
          .map((e) => e.id);
        if (empties.length > 0) {
          try {
            await target.actor.deleteEmbeddedDocuments('Item', empties);
          } catch (_) {}
        }
        // Recompute reflex/stealth distribution and reconcile against maps
        try {
          await updateReflexStealthAcrossCoverAggregates(target);
        } catch (_) {}
        try {
          await dedupeCoverAggregates(target);
        } catch (_) {}
        try {
          await reconcileCoverAggregatesAgainstMaps(target);
        } catch (_) {}
        // Final log of each state aggregate and rule count
        try {
          const finalAggs = target.actor.itemTypes.effect.filter(
            (e) => e.flags?.[MODULE_ID]?.aggregateCover === true,
          );
          const toDelete = [];
          const toUpdate = [];

          for (const agg of finalAggs) {
            const originalRules = agg.system?.rules || [];
            const rules = canonicalizeObserverRules(originalRules);
            const empty = !hasObserverPresence(rules);

            if (empty) {
              toDelete.push(agg.id);
            } else if (
              rules.length !== originalRules.length ||
              JSON.stringify(rules) !== JSON.stringify(originalRules)
            ) {
              // Rules were deduplicated or changed, update the effect
              toUpdate.push({ _id: agg.id, 'system.rules': rules });
            }
          }

          if (toDelete.length) {
            try {
              await target.actor.deleteEmbeddedDocuments('Item', toDelete);
            } catch (_) {}
          }

          if (toUpdate.length) {
            try {
              await target.actor.updateEmbeddedDocuments('Item', toUpdate);
            } catch (_) {}
          }
        } catch (_) {}
      });
  }
}

function getBonus(state) {
  // local helper
  switch (state) {
    case 'lesser':
      return 1;
    case 'standard':
      return 2;
    case 'greater':
      return 4;
    default:
      return 0;
  }
}

// Locking centralized in cover/utils.js via runWithCoverEffectLock

export function getCoverLevelRollOptions(coverState) {
  const bonus = getBonus(coverState);
  if (bonus <= 0) return [];
  return [
    { key: 'RollOption', domain: 'all', option: `self:cover-level:${coverState}` },
    { key: 'RollOption', domain: 'all', option: `self:cover-bonus:${bonus}` },
  ];
}

export function ensureCoverLevelRules(rules, coverState) {
  const levelOption = `self:cover-level:${coverState}`;
  const bonusOption = `self:cover-bonus:${getBonus(coverState)}`;
  const hasLevel = rules.some((r) => r?.key === 'RollOption' && r.option === levelOption);
  const hasBonus = rules.some((r) => r?.key === 'RollOption' && r.option === bonusOption);
  const result = [...rules];
  if (!hasLevel) result.push({ key: 'RollOption', domain: 'all', option: levelOption });
  if (!hasBonus) result.push({ key: 'RollOption', domain: 'all', option: bonusOption });
  return result;
}

function createAggregate(target, coverState, rules, options) {
  const label = getCoverLabel(coverState);
  const img = getCoverImageForState(coverState);
  const rulesWithCoverLevel = ensureCoverLevelRules(rules, coverState);
  return {
    name: label,
    type: 'effect',
    system: {
      description: { value: `<p>Aggregated ${label} vs multiple observers.</p>`, gm: '' },
      rules: rulesWithCoverLevel,
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
      tokenIcon: { show: false },
      unidentified: true,
      start: {
        value: 0,
        initiative: options.initiative
          ? game.combat?.getCombatantByToken(target?.id)?.initiative
          : null,
      },
      badge: null,
    },
    img,
    flags: { [MODULE_ID]: { aggregateCover: true, coverState } },
  };
}

// Ensure one AC rule per signature and one RollOption per tokenId; keep all other rules intact
export function canonicalizeObserverRules(rules) {
  if (!Array.isArray(rules)) return [];

  // Group rules by type for precise deduplication
  const acRules = new Map(); // signature -> rule
  const roRules = new Map(); // tokenId -> rule
  const otherRules = [];

  for (const r of rules) {
    if (
      r?.key === 'FlatModifier' &&
      (r.selector === 'ac' ||
        (Array.isArray(r.selector) && r.selector.length === 1 && r.selector[0] === 'ac'))
    ) {
      const normalizedSelector = Array.isArray(r.selector) ? r.selector[0] : r.selector;
      const sigs = extractSignaturesFromPredicate(r.predicate);
      if (sigs.length > 0) {
        const sig = sigs[0];

        // Keep only the latest AC rule per signature (last one wins)
        const normalizedRule = { ...r, selector: normalizedSelector };
        // Always replace with the latest rule for this signature
        acRules.set(sig, normalizedRule);
        continue; // Only continue if we actually processed it as an AC rule
      }
      // If no signatures found, let it fall through to "other rules"
    }
    if (
      r?.key === 'RollOption' &&
      typeof r.option === 'string' &&
      r.option.startsWith('cover-against:')
    ) {
      const tokenId = r.option.slice('cover-against:'.length);
      if (tokenId) {
        // Keep only the latest RollOption per token
        roRules.set(tokenId, r);
      }
      continue;
    }
    // Handle reflex/stealth rules with selector normalization
    if (
      r?.key === 'FlatModifier' &&
      (r.selector === 'reflex' ||
        r.selector === 'stealth' ||
        (Array.isArray(r.selector) &&
          r.selector.length === 1 &&
          (r.selector[0] === 'reflex' || r.selector[0] === 'stealth')))
    ) {
      const normalizedSelector = Array.isArray(r.selector) ? r.selector[0] : r.selector;
      const ruleKey = `${normalizedSelector}:${r.type}:${r.value}:${JSON.stringify(r.predicate || [])}`;

      // Check if we already have a rule for this selector/type/value/predicate combination
      if (
        !otherRules.some((existing) => {
          if (existing?.key !== 'FlatModifier') return false;
          const existingSelector = Array.isArray(existing.selector)
            ? existing.selector[0]
            : existing.selector;
          const existingKey = `${existingSelector}:${existing.type}:${existing.value}:${JSON.stringify(existing.predicate || [])}`;
          return existingKey === ruleKey;
        })
      ) {
        // Normalize the selector to string format for consistency
        const normalizedRule = { ...r, selector: normalizedSelector };
        otherRules.push(normalizedRule);
      }
    } else {
      // All other rules - use stringified rule as key to dedupe exact duplicates
      const ruleStr = JSON.stringify(r);
      if (!otherRules.some((existing) => JSON.stringify(existing) === ruleStr)) {
        otherRules.push(r);
      }
    }
  }

  // Assemble final rules: AC rules + RO rules + other rules
  const final = [...acRules.values(), ...roRules.values(), ...otherRules];

  return final;
}

function hasObserverPresence(rules) {
  if (!Array.isArray(rules)) return false;
  for (const r of rules) {
    if (r?.key === 'FlatModifier' && r.selector === 'ac') return true;
    if (
      r?.key === 'RollOption' &&
      typeof r.option === 'string' &&
      r.option.startsWith('cover-against:')
    )
      return true;
  }
  return false;
}
