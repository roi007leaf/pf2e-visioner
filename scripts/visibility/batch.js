import { MODULE_ID } from '../constants.js';
import {
  createAggregateEffectData,
  createEphemeralEffectRule,
} from '../helpers/visibility-helpers.js';
import { OffGuardSuppression } from '../rule-elements/operations/OffGuardSuppression.js';
import { EphemeralEffectIndex } from './ephemeral-effect-index.js';
import { cleanupLegacyVisibilityPair } from './legacy-effect-cleanup.js';
import { runWithEffectLock } from './utils.js';

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
    const source = effectTarget === 'observer' ? update.target : observerToken;
    const suppressionActive =
      ['hidden', 'undetected'].includes(update.state) &&
      OffGuardSuppression.shouldSuppressOffGuardForState(source, update.state, receiver);
    const receiverId = receiver.actor.id;
    if (
      update.state === 'observed' ||
      update.state === 'concealed' ||
      update.state === 'undetected' ||
      options.removeAllEffects ||
      suppressionActive
    ) {
      await cleanupLegacyVisibilityPair(observerToken, update.target);
    }
    if (!updatesByReceiver.has(receiverId))
      updatesByReceiver.set(receiverId, { receiver, updates: [] });
    updatesByReceiver.get(receiverId).updates.push({
      source,
      state: update.state,
      suppressionActive,
    });
  }
  for (const { receiver, updates } of updatesByReceiver.values()) {
    try {
      const rType = receiver?.actor?.type;
      if (rType && ['loot', 'vehicle', 'party'].includes(rType)) continue;
    } catch (_) {}
    await runWithEffectLock(receiver.actor, async () => {
      const effects = receiver.actor.itemTypes.effect;
      const effectIndex = new EphemeralEffectIndex({
        effects,
        moduleId: MODULE_ID,
        effectTarget,
      });
      for (const { source, state, suppressionActive } of updates) {
        const signature = source.actor.signature;
        const operations = {
          hidden: { add: false, remove: false },
          undetected: { add: false, remove: false },
        };
        if (
          options.removeAllEffects ||
          suppressionActive ||
          state === 'observed' ||
          state === 'concealed'
        ) {
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
          effectIndex.removeSignature('hidden', signature);
        }
        if (operations.undetected.remove) {
          effectIndex.removeSignature('undetected', signature);
        }
        if (operations.hidden.add) {
          effectIndex.addSignature('hidden', signature, createEphemeralEffectRule);
        }
        if (operations.undetected.add) {
          effectIndex.addSignature('undetected', signature, createEphemeralEffectRule);
        }
      }
      const { effectsToCreate, effectsToUpdate, effectsToDelete } =
        effectIndex.buildMutationPlan({
          createAggregateEffectData,
          options,
          receiverId: receiver.actor.id,
        });
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
