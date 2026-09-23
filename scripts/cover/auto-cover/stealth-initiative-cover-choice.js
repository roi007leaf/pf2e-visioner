import { MODULE_ID } from '../../constants.js';

export const STEALTH_INITIATIVE_COVER_CHOICE_FLAG = 'stealthInitiativeCoverChoice';
export const STEALTH_INITIATIVE_COVER_STATES = new Set(['none', 'lesser', 'standard', 'greater']);

export async function saveStealthInitiativeCoverChoice({ combatId, tokenId, state } = {}) {
  if (!game.user?.isGM || !tokenId || !STEALTH_INITIATIVE_COVER_STATES.has(state)) return false;
  const combat = game.combats?.get?.(combatId) ??
    (game.combat?.id === combatId ? game.combat : null);
  const combatant = combat?.combatants?.find?.((entry) => entry.tokenId === tokenId);
  if (!combatant?.setFlag) return false;
  await combatant.setFlag(MODULE_ID, STEALTH_INITIATIVE_COVER_CHOICE_FLAG, state);
  return true;
}
