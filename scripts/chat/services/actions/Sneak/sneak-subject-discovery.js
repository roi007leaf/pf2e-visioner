import { MODULE_ID } from '../../../../constants.js';
import { shouldFilterAlly as defaultShouldFilterAlly } from '../../infra/shared-utils.js';

function getIgnoreAllies(actionData, deps) {
  if (actionData?.ignoreAllies !== undefined) return actionData.ignoreAllies;
  if (typeof deps.getSetting === 'function') return deps.getSetting('ignoreAllies');
  return game.settings.get(MODULE_ID, 'ignoreAllies');
}

export function discoverSneakSubjects(actionData, deps = {}) {
  const tokens = deps.tokens || canvas?.tokens?.placeables || [];
  const sneakingToken = deps.getSneakingToken?.(actionData) || actionData?.actor || null;
  const sneakingTokenId = sneakingToken?.document?.id || sneakingToken?.id || null;
  const ignoreAllies = getIgnoreAllies(actionData, deps);
  const shouldFilterAlly = deps.shouldFilterAlly || defaultShouldFilterAlly;

  return (tokens || [])
    .filter((token) => token && token.actor)
    .filter((token) =>
      sneakingTokenId ? token.document?.id !== sneakingTokenId : token !== sneakingToken,
    )
    .filter((token) => !shouldFilterAlly(actionData.actor, token, 'enemies', ignoreAllies))
    .filter((token) => token.actor?.type !== 'loot' && token.actor?.type !== 'hazard');
}
