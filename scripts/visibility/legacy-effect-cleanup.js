import { MODULE_ID } from '../constants.js';
import { deleteExistingEmbeddedItems } from './utils.js';

export async function deleteLegacyVisibilityEffects(actor, hiddenActorSignature) {
  if (!game.user?.isGM || !actor?.itemTypes?.effect || !hiddenActorSignature) return 0;
  const legacyEffects = actor.itemTypes.effect.filter(
    (effect) =>
      effect?.flags?.[MODULE_ID]?.isEphemeralOffGuard === true &&
      effect?.flags?.[MODULE_ID]?.hiddenActorSignature === hiddenActorSignature,
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
