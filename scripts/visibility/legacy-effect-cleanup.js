import { MODULE_ID } from '../constants.js';
import { deleteExistingEmbeddedItems } from './utils.js';

export async function deleteLegacyVisibilityEffects(actor, hiddenActorSignature) {
  return deleteLegacyVisibilityEffectsForSignatures(actor, [hiddenActorSignature]);
}

export async function deleteLegacyVisibilityEffectsForSignatures(actor, hiddenActorSignatures) {
  if (!game.user?.isGM || !actor?.itemTypes?.effect) return 0;
  const signatures = new Set(Array.from(hiddenActorSignatures || []).filter(Boolean));
  if (signatures.size === 0) return 0;
  const legacyEffects = actor.itemTypes.effect.filter(
    (effect) =>
      effect?.flags?.[MODULE_ID]?.isEphemeralOffGuard === true &&
      signatures.has(effect?.flags?.[MODULE_ID]?.hiddenActorSignature),
  );
  const ids = legacyEffects
    .map((effect) => effect?.id)
    .filter((id) => !!id && (actor.items?.get?.(id) ?? true));
  if (!ids.length) return 0;
  await deleteExistingEmbeddedItems(actor, ids);
  return ids.length;
}

export async function cleanupLegacyVisibilityPair(observerToken, targetToken) {
  const observerSignature = observerToken?.actor?.signature;
  const targetSignature = targetToken?.actor?.signature;
  await deleteLegacyVisibilityEffects(observerToken?.actor, targetSignature);
  await deleteLegacyVisibilityEffects(targetToken?.actor, observerSignature);
}
