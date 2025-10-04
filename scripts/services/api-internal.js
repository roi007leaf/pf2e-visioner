/**
 * Internal helpers used by the public API (Pf2eVisionerApi)
 */

import { MODULE_ID } from '../constants.js';
import { cleanupCoverEffectsForObserver } from '../cover/ephemeral.js';
import {
    batchUpdateVisibilityEffects,
    cleanupEphemeralEffectsForTarget,
} from '../visibility/ephemeral.js';
import { refreshEveryonesPerception } from './socket.js';
import { updateTokenVisuals } from './visual-effects.js';

export async function unsetMapsForTokens(scene, tokens) {
  try {
    if (!scene || !Array.isArray(tokens) || tokens.length === 0) return;
    const updates = tokens.map((t) => ({
      _id: t.id,
      // Remove ALL visioner flags completely
      [`flags.${MODULE_ID}`]: null,
    }));
    
    
    const result = await scene.updateEmbeddedDocuments('Token', updates, { diff: false });
  } catch (error) {
    console.error('PF2E Visioner | Error in unsetMapsForTokens:', error);
  }
}

export function collectModuleEffectIds(actor) {
  const effects = actor?.itemTypes?.effect ?? [];
  return effects
    .filter((e) => {
      const f = e.flags?.[MODULE_ID] || {};
      return (
        f.isEphemeralOffGuard ||
        f.isEphemeralCover ||
        f.aggregateOffGuard === true ||
        f.aggregateCover === true
      );
    })
    .map((e) => e.id)
    .filter((id) => !!actor?.items?.get?.(id));
}

export async function removeModuleEffectsFromActors(actors) {
  try {
    for (const actor of actors) {
      if (!actor) continue;
      const toDelete = collectModuleEffectIds(actor);
      if (toDelete.length) {
        // Only GMs can delete effects
        if (game.user.isGM) {
          try {
            await actor.deleteEmbeddedDocuments('Item', toDelete);
          } catch (_) {}
        }
      }
    }
  } catch (_) {}
}

export async function removeModuleEffectsFromTokenActors(tokens) {
  try {
    for (const tok of tokens) {
      const a = tok?.actor;
      if (!a) continue;
      const toDelete = collectModuleEffectIds(a);
      if (toDelete.length) {
        // Only GMs can delete effects
        if (game.user.isGM) {
          try {
            await a.deleteEmbeddedDocuments('Item', toDelete);
          } catch (_) {}
        }
      }
    }
  } catch (_) {}
}

export async function removeObserverContributions(observerToken, tokens) {
  // Visibility contributions
  try {
    const targetUpdates = tokens
      .filter((t) => t?.actor && t.id !== observerToken.id)
      .map((t) => ({ target: t, state: 'observed' }));
    if (targetUpdates.length) {
      await batchUpdateVisibilityEffects(observerToken, targetUpdates, {
        removeAllEffects: true,
      });
    }
  } catch (_) {}

  // Cover contributions
  try {
    for (const t of tokens) {
      if (!t?.actor || t.id === observerToken.id) continue;
      await cleanupCoverEffectsForObserver(t, observerToken);
    }
  } catch (_) {}
}

export async function removeAllReferencesToTarget(targetToken, tokens, cleanupDeletedTokenFn) {
  try {
    await cleanupDeletedTokenFn(targetToken.document);
  } catch (_) {}

  try {
    for (const obs of tokens) {
      if (!obs?.actor || obs.id === targetToken.id) continue;
      try {
        await cleanupEphemeralEffectsForTarget(obs, targetToken);
      } catch (_) {}
      try {
        await cleanupCoverEffectsForObserver(targetToken, obs);
      } catch (_) {}
    }
  } catch (_) {}
}

export async function rebuildAndRefresh() {
  try {
    const { cleanupAllCoverEffects } = await import('../cover/ephemeral.js');
    await cleanupAllCoverEffects();
  } catch (_) {}
  // Removed effects-coordinator bulk rebuild
  try {
    await updateTokenVisuals();
  } catch (_) {}
  try {
    refreshEveryonesPerception();
  } catch (_) {}
  try {
    canvas.perception.update({ refreshVision: true });
  } catch (_) {}
}
