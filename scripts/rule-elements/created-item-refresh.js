import { isPrimaryGM } from '../services/gm-election.js';

// PF2e invokes native rule onCreate only on the originating client. Player
// clients cannot write Visioner's scene flags, so the active GM applies them.
export async function applyPlayerCreatedVisionerRules(
  item,
  userId,
  {
    isGM = isPrimaryGM,
    isOriginGM = (id) => globalThis.game?.users?.get?.(id)?.isGM === true,
  } = {},
) {
  if (!isGM() || !item?.parent || !userId || isOriginGM(userId)) return false;
  const rules = (item.rules || []).filter((rule) => rule.key === 'PF2eVisionerEffect');
  for (const rule of rules) await rule.applyOperations({ triggerRecalculation: true });
  return rules.length > 0;
}
