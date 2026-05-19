import { MODULE_ID } from '../../../constants.js';
import { overrideToDisplayVisibility } from '../../../visibility/perception-profile.js';

export function getTokensForActor(actorId, tokens = globalThis.canvas?.tokens?.placeables || []) {
  if (!actorId) return [];
  return tokens.filter((token) => token?.actor?.id === actorId);
}

export function getHideOverrideVisibility(hidingTokens, observerId) {
  if (!observerId) return null;

  const flagKey = `avs-override-from-${observerId}`;
  for (const hidingToken of hidingTokens || []) {
    const flag = hidingToken?.document?.flags?.[MODULE_ID]?.[flagKey];
    const flagVisibility = flag ? overrideToDisplayVisibility(flag) : null;
    if (flagVisibility) return flagVisibility;
  }

  return null;
}

export function getHideOverrideVisibilityForActor(actorId, observerId, tokens) {
  return getHideOverrideVisibility(getTokensForActor(actorId, tokens), observerId);
}
