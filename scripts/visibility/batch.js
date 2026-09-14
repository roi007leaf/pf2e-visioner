import { MODULE_ID } from '../constants.js';
import { yieldToBrowser } from '../utils/yield-to-browser.js';
import {
  createAggregateEffectData,
  createEphemeralEffectRule,
} from '../helpers/visibility-helpers.js';
import { OffGuardSuppression } from '../rule-elements/operations/OffGuardSuppression.js';
import { hasActivePendingTokenMovement } from '../services/movement-tracking.js';
import { EphemeralEffectIndex } from './ephemeral-effect-index.js';
import { cleanupLegacyVisibilityPair } from './legacy-effect-cleanup.js';
import { deleteExistingEmbeddedItems, runWithEffectLock } from './utils.js';

const OBSERVED_EFFECT_MUTATION_SUPPRESSION_MS = 750;

function tokenIdOf(token) {
  return token?.document?.id || token?.id || null;
}

function getCurrentViewObserverIds() {
  const ids = new Set();
  const addToken = (token) => {
    const id = tokenIdOf(token);
    if (id) ids.add(id);
  };

  addToken(canvas?.tokens?._draggedToken);
  for (const token of canvas?.tokens?.controlled || []) {
    addToken(token);
  }

  return ids;
}

function shouldSuppressObservedTargetForObserver(observerToken) {
  const viewObserverIds = getCurrentViewObserverIds();
  if (viewObserverIds.size === 0) return true;
  return viewObserverIds.has(tokenIdOf(observerToken));
}

export async function batchUpdateVisibilityEffects(observerToken, targetUpdates, options = {}) {
  return batchUpdateVisibilityEffectsForObservers(
    [{ observer: observerToken, targets: targetUpdates }],
    options,
  );
}

/** Combine an AVS result's ordered observer updates before writing each receiving actor. */
export async function batchUpdateVisibilityEffectsForObservers(observerUpdates, options = {}) {
  if (!game.user?.isGM) return;
  if (!observerUpdates?.length) return;
  if (options.deferDuringPendingMovement !== false && hasActivePendingTokenMovement()) return;
  const effectTarget =
    options.effectTarget || (options.direction === 'target_to_observer' ? 'observer' : 'subject');
  const updatesByReceiver = new Map();
  const now = () => globalThis.performance?.now?.() ?? Date.now();
  let sliceStartedAt = now();
  const yieldIfNeeded = async () => {
    if (now() - sliceStartedAt < 8) return;
    await yieldToBrowser();
    sliceStartedAt = now();
  };
  for (const entry of observerUpdates) {
    const { observer: observerToken, targets: targetUpdates } = entry ?? {};
    if (!observerToken?.actor || !targetUpdates?.length) continue;
    try {
      const oType = observerToken.actor.type;
      if (oType && ['loot', 'vehicle', 'party'].includes(oType)) continue;
    } catch (_) {}
    for (const update of targetUpdates) {
      if (!update.target?.actor) continue;
      try {
        const tType = update.target.actor?.type;
        if (tType && ['loot', 'vehicle', 'party'].includes(tType)) continue;
      } catch (_) {}
      const receiver = effectTarget === 'observer' ? observerToken : update.target;
      const source = effectTarget === 'observer' ? update.target : observerToken;
      const suppressionContext = update.profileMetadata || update.perceptionProfile || {};
      const suppressionActive =
        ['hidden', 'undetected'].includes(update.state) &&
        OffGuardSuppression.shouldSuppressOffGuardForState(
          source,
          update.state,
          receiver,
          suppressionContext,
        );
      // Linked tokens share an actor; synthetic actors sharing a base id do not.
      const receiverId = receiver.actor.uuid ?? receiver.actor;
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
    await yieldIfNeeded();
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
      const { effectsToCreate, effectsToUpdate, effectsToDelete } = effectIndex.buildMutationPlan({
        createAggregateEffectData,
        options,
        receiverId: receiver.actor.id,
      });
      if (effectsToDelete.length > 0) {
        // Only GMs can delete effects
        if (game.user.isGM) {
          await deleteExistingEmbeddedItems(receiver.actor, effectsToDelete);
        }
      }
      if (effectsToUpdate.length > 0)
        await receiver.actor.updateEmbeddedDocuments('Item', effectsToUpdate);
      if (effectsToCreate.length > 0)
        await receiver.actor.createEmbeddedDocuments('Item', effectsToCreate);
    });
    await yieldIfNeeded();
  }
}
