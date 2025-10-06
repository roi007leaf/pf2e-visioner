/**
 * Single-target visibility update (off-guard) extracted from off-guard-ephemeral.js
 */

import { MODULE_ID } from '../constants.js';
import {
  createAggregateEffectData,
  createEphemeralEffectRule,
} from '../helpers/visibility-helpers.js';
import { runWithEffectLock } from './utils.js';

export async function updateSingleVisibilityEffect(
  observerToken,
  targetToken,
  newVisibilityState,
  options = {},
) {
  if (!observerToken?.actor || !targetToken?.actor) return;

  // Debug logging for Hidden effect creation
  const debugMode = game.settings.get(MODULE_ID, 'autoVisibilityDebugMode');
  // Determine receiver based on effectTarget
  const direction = options.direction || 'observer_to_target';
  const effectTarget =
    options.effectTarget || (direction === 'target_to_observer' ? 'observer' : 'subject');
  const effectReceiverToken = effectTarget === 'observer' ? observerToken : targetToken;
  const effectSourceToken = effectTarget === 'observer' ? targetToken : observerToken;

  // Skip non-creature receivers
  try {
    const t = effectReceiverToken?.actor?.type;
    if (t && ['loot', 'vehicle', 'party'].includes(t)) return;
  } catch (_) {}

  await runWithEffectLock(effectReceiverToken.actor, async () => {
    const effects = effectReceiverToken.actor.itemTypes.effect;
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
    const signature = effectSourceToken.actor.signature;
    const operations = {
      hidden: { add: false, remove: false },
      undetected: { add: false, remove: false },
    };
    if (options.removeAllEffects) {
      operations.hidden.remove = true;
      operations.undetected.remove = true;
    } else if (newVisibilityState === 'hidden') {
      operations.hidden.add = true;
      operations.undetected.remove = true;
    } else if (newVisibilityState === 'undetected') {
      operations.hidden.remove = true;
      operations.undetected.add = true;
    } else {
      operations.hidden.remove = true;
      operations.undetected.remove = true;
    }

    const effectsToCreate = [];
    const effectsToUpdate = [];
    const effectsToDelete = [];

    if (operations.hidden.remove && hiddenAggregate) {
      const rules = Array.isArray(hiddenAggregate.system.rules)
        ? hiddenAggregate.system.rules.filter(
            (r) =>
              !(
                r?.key === 'EphemeralEffect' &&
                Array.isArray(r.predicate) &&
                r.predicate.includes(`target:signature:${signature}`)
              ),
          )
        : [];
      if (rules.length === 0) effectsToDelete.push(hiddenAggregate.id);
      else effectsToUpdate.push({ _id: hiddenAggregate.id, 'system.rules': rules });
    }
    if (operations.undetected.remove && undetectedAggregate) {
      const rules = Array.isArray(undetectedAggregate.system.rules)
        ? undetectedAggregate.system.rules.filter(
            (r) =>
              !(
                r?.key === 'EphemeralEffect' &&
                Array.isArray(r.predicate) &&
                r.predicate.includes(`target:signature:${signature}`)
              ),
          )
        : [];
      if (rules.length === 0) effectsToDelete.push(undetectedAggregate.id);
      else effectsToUpdate.push({ _id: undetectedAggregate.id, 'system.rules': rules });
    }

    if (operations.hidden.add) {
      if (!hiddenAggregate) {
        effectsToCreate.push(
          createAggregateEffectData('hidden', signature, {
            ...options,
            receiverId: effectReceiverToken.actor.id,
          }),
        );
      } else {
        const rules = Array.isArray(hiddenAggregate.system.rules)
          ? [...hiddenAggregate.system.rules]
          : [];
        const exists = rules.some(
          (r) =>
            r?.key === 'EphemeralEffect' &&
            Array.isArray(r.predicate) &&
            r.predicate.includes(`target:signature:${signature}`),
        );
        if (!exists) {
          rules.push(createEphemeralEffectRule(signature));
          effectsToUpdate.push({ _id: hiddenAggregate.id, 'system.rules': rules });
        }
      }
    }
    if (operations.undetected.add) {
      if (!undetectedAggregate) {
        effectsToCreate.push(
          createAggregateEffectData('undetected', signature, {
            ...options,
            receiverId: effectReceiverToken.actor.id,
          }),
        );
      } else {
        const rules = Array.isArray(undetectedAggregate.system.rules)
          ? [...undetectedAggregate.system.rules]
          : [];
        const exists = rules.some(
          (r) =>
            r?.key === 'EphemeralEffect' &&
            Array.isArray(r.predicate) &&
            r.predicate.includes(`target:signature:${signature}`),
        );
        if (!exists) {
          rules.push(createEphemeralEffectRule(signature));
          effectsToUpdate.push({ _id: undetectedAggregate.id, 'system.rules': rules });
        }
      }
    }

    if (effectsToDelete.length > 0) {
      // Only GMs can delete effects
      if (game.user.isGM) {
        await effectReceiverToken.actor.deleteEmbeddedDocuments('Item', effectsToDelete);
      }
    }
    if (effectsToUpdate.length > 0) {
      await effectReceiverToken.actor.updateEmbeddedDocuments('Item', effectsToUpdate);
    }
    if (effectsToCreate.length > 0) {
      await effectReceiverToken.actor.createEmbeddedDocuments('Item', effectsToCreate);
    }
  });
}
