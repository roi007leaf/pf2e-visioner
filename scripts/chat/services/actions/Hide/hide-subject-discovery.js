import { shouldFilterAlly as defaultShouldFilterAlly } from '../../infra/shared-utils.js';

function getExplicitIgnoreAllies(actionData) {
  if (actionData?.ignoreAllies === true || actionData?.ignoreAllies === false) {
    return actionData.ignoreAllies;
  }
  return null;
}

export function discoverHideSubjects(actionData, deps = {}) {
  const tokens = deps.tokens || canvas?.tokens?.placeables || [];
  const actorToken = actionData?.actor;
  const actorId = actorToken?.id || actorToken?.document?.id || null;
  const ignoreAllies = getExplicitIgnoreAllies(actionData);
  const shouldFilterAlly = deps.shouldFilterAlly || defaultShouldFilterAlly;

  return (tokens || [])
    .filter((token) => token && token.actor)
    .filter((token) => (actorId ? token.id !== actorId : token !== actorToken))
    .filter((token) => !shouldFilterAlly(actorToken, token, 'enemies', ignoreAllies))
    .filter((token) => token.actor?.type !== 'loot' && token.actor?.type !== 'hazard');
}
