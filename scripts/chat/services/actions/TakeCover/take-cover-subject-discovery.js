import { shouldFilterAlly as defaultShouldFilterAlly } from '../../infra/shared-utils.js';

export function discoverTakeCoverSubjects(actionData, deps = {}) {
  const tokens = deps.tokens || canvas?.tokens?.placeables || [];
  const actorId = actionData?.actor?.id || actionData?.actor?.document?.id || null;
  const shouldFilterAlly = deps.shouldFilterAlly || defaultShouldFilterAlly;

  return (tokens || [])
    .filter((token) => token && token.actor)
    .filter((token) => (actorId ? token.id !== actorId : token !== actionData.actor))
    .filter((token) => !shouldFilterAlly(actionData.actor, token, 'enemies'))
    .filter((token) => token.actor?.type !== 'loot' && token.actor?.type !== 'hazard');
}
