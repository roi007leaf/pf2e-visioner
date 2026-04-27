import { MODULE_ID } from '../constants.js';
import {
  createAggregateEffectData,
  createEphemeralEffectRule,
} from '../helpers/visibility-helpers.js';
import { runWithEffectLock } from './utils.js';

async function deleteLegacyVisibilityEffects(actor, hiddenActorSignature) {
  if (!game.user.isGM || !actor?.itemTypes?.effect || !hiddenActorSignature) return 0;
  const legacyEffects = actor.itemTypes.effect.filter(
    (effect) =>
      effect?.flags?.[MODULE_ID]?.isEphemeralOffGuard === true &&
      effect?.flags?.[MODULE_ID]?.hiddenActorSignature === hiddenActorSignature,
  );
  const ids = legacyEffects
    .map((effect) => effect?.id)
    .filter((id) => !!id && (actor.items?.get?.(id) ?? true));
  if (!ids.length) return 0;
  await actor.deleteEmbeddedDocuments?.('Item', ids);
  return ids.length;
}

async function cleanupLegacyObservedPair(observerToken, targetToken) {
  const observerSignature = observerToken?.actor?.signature;
  const targetSignature = targetToken?.actor?.signature;
  await deleteLegacyVisibilityEffects(observerToken?.actor, targetSignature);
  await deleteLegacyVisibilityEffects(targetToken?.actor, observerSignature);
}

export async function batchUpdateVisibilityEffects(observerToken, targetUpdates, options = {}) {
  if (!observerToken?.actor || !targetUpdates?.length) return;
  try {
    const oType = observerToken?.actor?.type;
    if (oType && ['loot', 'vehicle', 'party'].includes(oType)) return;
  } catch (_) {}
  const effectTarget =
    options.effectTarget || (options.direction === 'target_to_observer' ? 'observer' : 'subject');
  const updatesByReceiver = new Map();
  for (const update of targetUpdates) {
    if (!update.target?.actor) continue;
    try {
      const tType = update.target.actor?.type;
      if (tType && ['loot', 'vehicle', 'party'].includes(tType)) continue;
    } catch (_) {}
    const receiver = effectTarget === 'observer' ? observerToken : update.target;
    const receiverId = receiver.actor.id;
    if (update.state === 'observed' || update.state === 'concealed' || options.removeAllEffects) {
      await cleanupLegacyObservedPair(observerToken, update.target);
    }
    if (!updatesByReceiver.has(receiverId))
      updatesByReceiver.set(receiverId, { receiver, updates: [] });
    updatesByReceiver.get(receiverId).updates.push({
      source: effectTarget === 'observer' ? update.target : observerToken,
      state: update.state,
    });
  }
  for (const { receiver, updates } of updatesByReceiver.values()) {
    try {
      const rType = receiver?.actor?.type;
      if (rType && ['loot', 'vehicle', 'party'].includes(rType)) continue;
    } catch (_) {}
    await runWithEffectLock(receiver.actor, async () => {
      const effects = receiver.actor.itemTypes.effect;
      const hiddenAggregate = effects.find(
        (e) =>
          e.flags?.[MODULE_ID]?.aggregateOffGuard === true &&
          e.flags?.[MODULE_ID]?.visibilityState === 'hidden' &&
          e.flags?.[MODULE_ID]?.effectTarget === effectTarget,
      );
      const undetectedAggregate = effects.find(
        (e) =>
          e.flags?.[MODULE_ID]?.aggregateOffGuard === true &&
          e.flags?.[MODULE_ID]?.visibilityState === 'undetected' &&
          e.flags?.[MODULE_ID]?.effectTarget === effectTarget,
      );
      let hiddenRules = hiddenAggregate
        ? Array.isArray(hiddenAggregate.system.rules)
          ? [...hiddenAggregate.system.rules]
          : []
        : [];
      let undetectedRules = undetectedAggregate
        ? Array.isArray(undetectedAggregate.system.rules)
          ? [...undetectedAggregate.system.rules]
          : []
        : [];
      const effectsToCreate = [];
      const effectsToUpdate = [];
      const effectsToDelete = [];
      for (const { source, state } of updates) {
        const signature = source.actor.signature;
        const operations = {
          hidden: { add: false, remove: false },
          undetected: { add: false, remove: false },
        };
        if (options.removeAllEffects || state === 'observed' || state === 'concealed') {
          operations.hidden.remove = true;
          operations.undetected.remove = true;
        } else if (state === 'hidden') {
          operations.hidden.add = true;
          operations.undetected.remove = true;
        } else if (state === 'undetected') {
          operations.hidden.remove = true;
          operations.undetected.add = true;
        }
        if (operations.hidden.remove) {
          hiddenRules = hiddenRules.filter(
            (r) =>
              !(
                r?.key === 'EphemeralEffect' &&
                Array.isArray(r.predicate) &&
                r.predicate.includes(`target:signature:${signature}`)
              ),
          );
        }
        if (operations.undetected.remove) {
          undetectedRules = undetectedRules.filter(
            (r) =>
              !(
                r?.key === 'EphemeralEffect' &&
                Array.isArray(r.predicate) &&
                r.predicate.includes(`target:signature:${signature}`)
              ),
          );
        }
        if (operations.hidden.add) {
          const exists = hiddenRules.some(
            (r) =>
              r?.key === 'EphemeralEffect' &&
              Array.isArray(r.predicate) &&
              r.predicate.includes(`target:signature:${signature}`),
          );
          if (!exists) hiddenRules.push(createEphemeralEffectRule(signature));
        }
        if (operations.undetected.add) {
          const exists = undetectedRules.some(
            (r) =>
              r?.key === 'EphemeralEffect' &&
              Array.isArray(r.predicate) &&
              r.predicate.includes(`target:signature:${signature}`),
          );
          if (!exists) undetectedRules.push(createEphemeralEffectRule(signature));
        }
      }
      if (hiddenAggregate) {
        if (hiddenRules.length === 0) effectsToDelete.push(hiddenAggregate.id);
        else effectsToUpdate.push({ _id: hiddenAggregate.id, 'system.rules': hiddenRules });
      } else if (hiddenRules.length > 0)
        effectsToCreate.push(
          createAggregateEffectData('hidden', 'batch', {
            ...options,
            receiverId: receiver.actor.id,
            existingRules: hiddenRules,
          }),
        );
      if (undetectedAggregate) {
        if (undetectedRules.length === 0) effectsToDelete.push(undetectedAggregate.id);
        else effectsToUpdate.push({ _id: undetectedAggregate.id, 'system.rules': undetectedRules });
      } else if (undetectedRules.length > 0)
        effectsToCreate.push(
          createAggregateEffectData('undetected', 'batch', {
            ...options,
            receiverId: receiver.actor.id,
            existingRules: undetectedRules,
          }),
        );
      if (effectsToDelete.length > 0) {
        // Only GMs can delete effects
        if (game.user.isGM) {
          await receiver.actor.deleteEmbeddedDocuments('Item', effectsToDelete);
        }
      }
      if (effectsToUpdate.length > 0)
        await receiver.actor.updateEmbeddedDocuments('Item', effectsToUpdate);
      if (effectsToCreate.length > 0)
        await receiver.actor.createEmbeddedDocuments('Item', effectsToCreate);
    });
  }
}
