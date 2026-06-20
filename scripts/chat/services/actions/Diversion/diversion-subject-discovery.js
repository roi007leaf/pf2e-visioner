import { shouldFilterAlly as defaultShouldFilterAlly } from '../../infra/shared-utils.js';

function getExplicitIgnoreAllies(actionData) {
  if (actionData?.ignoreAllies === true || actionData?.ignoreAllies === false) {
    return actionData.ignoreAllies;
  }
  return null;
}

export function discoverDiversionSubjects(actionData, deps = {}) {
  const tokens = deps.tokens || canvas?.tokens?.placeables || [];
  const actorId = actionData?.actor?.id || actionData?.actor?.document?.id || null;
  const ignoreAllies = getExplicitIgnoreAllies(actionData);
  const shouldFilterAlly = deps.shouldFilterAlly || defaultShouldFilterAlly;

  return (tokens || [])
    .filter((token) => token && token.actor)
    .filter((token) => (actorId ? token.id !== actorId : token !== actionData.actor))
    .filter((token) => !shouldFilterAlly(actionData.actor, token, 'enemies', ignoreAllies))
    .filter((token) => token.actor?.type !== 'loot' && token.actor?.type !== 'hazard');
}
