/**
 * Visibility (off-guard) cleanup utilities
 */

import { MODULE_ID } from '../constants.js';
import { deleteExistingEmbeddedItems } from './utils.js';

async function removeObserverFromAggregate(
  effectReceiverToken,
  observerToken,
  visibilityState,
  options = {},
) {
  // Only GMs can perform cleanup operations
  if (!game.user.isGM) return;

  const effects = effectReceiverToken.actor.itemTypes.effect;
  const aggregate = effects.find(
    (e) =>
      e.flags?.[MODULE_ID]?.aggregateOffGuard === true &&
      e.flags?.[MODULE_ID]?.visibilityState === visibilityState &&
      e.flags?.[MODULE_ID]?.effectTarget === (options.effectTarget || 'subject'),
  );
  if (!aggregate) return;
  const signature = observerToken.actor.signature;
  const rules = Array.isArray(aggregate.system.rules)
    ? aggregate.system.rules.filter(
        (r) =>
          !(
            r?.key === 'EphemeralEffect' &&
            Array.isArray(r.predicate) &&
            r.predicate.includes(`target:signature:${signature}`)
          ),
      )
    : [];
  if (rules.length === 0) {
    try {
      const id = aggregate?.id;
      if (id && effectReceiverToken?.actor?.items?.get?.(id)) {
        await deleteExistingEmbeddedItems(effectReceiverToken.actor, [id]);
      } else {
        await aggregate.update({ 'system.rules': [] });
      }
    } catch (_) {}
    return;
  }
  try {
    const aggId2 = aggregate?.id;
    if (!aggId2 || !effectReceiverToken?.actor?.items?.get?.(aggId2)) return;
    await aggregate.update({ 'system.rules': rules });
  } catch (_) {}
}

async function pruneEmptyAggregates(effectReceiverToken) {
  // Only GMs can perform cleanup operations
  if (!game.user.isGM) return;

  if (!effectReceiverToken?.actor?.itemTypes?.effect) return;
  try {
    const empties = effectReceiverToken.actor.itemTypes.effect.filter((e) => {
      if (e.flags?.[MODULE_ID]?.aggregateOffGuard !== true) return false;
      const rules = Array.isArray(e.system?.rules) ? e.system.rules : [];
      const effCount = rules.filter((r) => r?.key === 'EphemeralEffect').length;
      return effCount === 0;
    });
    if (empties.length) {
      const ids = empties
        .map((e) => e?.id)
        .filter((id) => !!id && !!effectReceiverToken?.actor?.items?.get?.(id));
      if (ids.length) {
        try {
          await deleteExistingEmbeddedItems(effectReceiverToken.actor, ids);
        } catch (error) {
          console.error(`[${MODULE_ID}] Error pruning empty aggregates:`, error);
        }
      }
    }
  } catch (error) {
    console.error(`[${MODULE_ID}] Error in pruneEmptyAggregates:`, error);
  }
}

export async function cleanupEphemeralEffectsForTarget(observerToken, hiddenToken) {
  // Only GMs can perform cleanup operations
  if (!game.user.isGM) return;

  if (!observerToken?.actor || !hiddenToken?.actor) return;
  try {
    const ephemeralEffects = observerToken.actor.itemTypes.effect.filter(
      (e) =>
        e.flags?.[MODULE_ID]?.isEphemeralOffGuard &&
        e.flags?.[MODULE_ID]?.hiddenActorSignature === hiddenToken.actor.signature,
    );
    if (ephemeralEffects.length > 0) {
      const effectIds = ephemeralEffects.map((e) => e?.id).filter((id) => !!id);
      const existingIds = effectIds.filter((id) => !!observerToken?.actor?.items?.get?.(id));
      if (existingIds.length > 0) {
        try {
          await deleteExistingEmbeddedItems(observerToken.actor, existingIds);
        } catch (error) {
          console.error(`[${MODULE_ID}] Error bulk deleting observer effects:`, error);
          for (const id of existingIds) {
            if (!!id && !!observerToken?.actor?.items?.get?.(id)) {
              try {
                await deleteExistingEmbeddedItems(observerToken.actor, [id]);
              } catch (_) {}
            }
          }
        }
      }
    }
    try {
      const legacyOnTarget = hiddenToken.actor.itemTypes.effect.filter(
        (e) =>
          e.flags?.[MODULE_ID]?.isEphemeralOffGuard &&
          e.flags?.[MODULE_ID]?.hiddenActorSignature === observerToken.actor.signature,
      );
      if (legacyOnTarget.length) {
        const ids = legacyOnTarget
          .map((e) => e.id)
          .filter((id) => !!hiddenToken.actor.items.get(id));
        if (ids.length) {
          try {
            await deleteExistingEmbeddedItems(hiddenToken.actor, ids);
          } catch (error) {
            console.error(`[${MODULE_ID}] Error deleting legacy off-guard effects:`, error);
          }
        }
      }
    } catch (error) {
      console.error(`[${MODULE_ID}] Error processing legacy target effects:`, error);
    }
    try {
      await Promise.all([
        removeObserverFromAggregate(hiddenToken, observerToken, 'hidden'),
        removeObserverFromAggregate(hiddenToken, observerToken, 'undetected'),
      ]);
      await pruneEmptyAggregates(hiddenToken);
    } catch (error) {
      console.error(`[${MODULE_ID}] Error removing observer from aggregates:`, error);
    }
  } catch (error) {
    console.error(`[${MODULE_ID}] Error cleaning up ephemeral effects for target:`, error);
  }
}

export async function cleanupDeletedTokenEffects(tokenDoc) {
  // Only GMs can perform cleanup operations
  if (!game.user.isGM) return;

  if (!tokenDoc?.id || !tokenDoc?.actor?.id) return;
  try {
    const deletedToken = {
      id: tokenDoc.id,
      actor: { id: tokenDoc.actor.id, signature: tokenDoc.actor?.signature || tokenDoc.actor.id },
    };
    const allTokens = canvas.tokens?.placeables || [];
    const batchSize = 10;
    for (let i = 0; i < allTokens.length; i += batchSize) {
      const batch = allTokens.slice(i, i + batchSize);
      for (const token of batch) {
        if (!token?.actor) continue;
        let effectsToDelete = [];
        let effectsToUpdate = [];
        const signature = deletedToken.actor.signature;
        const tokenId = deletedToken.id;
        const effects = token.actor.itemTypes.effect || [];
        const observerEffects = effects.filter(
          (e) =>
            e.flags?.[MODULE_ID]?.aggregateOffGuard === true &&
            e.flags?.[MODULE_ID]?.observerToken === tokenId,
        );
        if (observerEffects.length > 0) {
          effectsToDelete.push(...observerEffects.map((e) => e.id));
          continue;
        }
        const relevantEffects = effects.filter(
          (e) => e.flags?.[MODULE_ID]?.aggregateOffGuard === true,
        );
        for (const effect of relevantEffects) {
          const rules = Array.isArray(effect.system?.rules) ? [...effect.system.rules] : [];
          const newRules = rules.filter((r) => {
            const s = JSON.stringify(r);
            if (s.includes(signature) || s.includes(tokenId)) {
              return false;
            }
            return true;
          });
          if (newRules.length !== rules.length) {
            if (newRules.length === 0) {
              effectsToDelete.push(effect.id);
            } else {
              effectsToUpdate.push({ _id: effect.id, 'system.rules': newRules });
            }
          }
        }
        const legacyEffects = effects.filter(
          (e) =>
            e.flags?.[MODULE_ID]?.offGuard === true &&
            (e.flags?.[MODULE_ID]?.observerToken === tokenId ||
              e.flags?.[MODULE_ID]?.targetToken === tokenId),
        );
        if (legacyEffects.length > 0) {
          effectsToDelete.push(...legacyEffects.map((e) => e.id));
        }
        try {
          if (effectsToDelete.length > 0) {
            await deleteExistingEmbeddedItems(token.actor, effectsToDelete);
          }
          if (effectsToUpdate.length > 0) {
            await token.actor.updateEmbeddedDocuments('Item', effectsToUpdate);
          }
        } catch (error) {
          console.error(`${MODULE_ID}: Error updating effects for deleted token:`, error);
        }
      }
    }
  } catch (error) {
    console.error(`${MODULE_ID}: Error cleaning up effects for deleted token:`, error);
  }
}
