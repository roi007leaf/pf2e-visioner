import { shouldFilterAlly as defaultShouldFilterAlly } from '../../infra/shared-utils.js';

function getExplicitIgnoreAllies(actionData) {
  if (actionData?.ignoreAllies === true || actionData?.ignoreAllies === false) {
    return actionData.ignoreAllies;
  }
  return null;
}

export function resolveTargetedDiversionBeneficiary(performer, targets, deps = {}) {
  const shouldFilterAlly = deps.shouldFilterAlly || defaultShouldFilterAlly;
  const validAllies = Array.from(targets || []).filter((token) => {
    if (!token?.actor || token.id === performer?.id || token.document?.hidden === true)
      return false;
    if (token.actor.type === 'loot' || token.actor.type === 'hazard') return false;
    return !shouldFilterAlly(performer, token, 'allies', true);
  });

  return validAllies.length === 1 ? validAllies[0] : null;
}

export function discoverDiversionSubjects(actionData, deps = {}) {
  const tokens = deps.tokens || canvas?.tokens?.placeables || [];
  const actorId = actionData?.actor?.id || actionData?.actor?.document?.id || null;
  const beneficiary = actionData?.diversionTarget || actionData?.actorToken || actionData?.actor;
  const beneficiaryId = beneficiary?.id || beneficiary?.document?.id || null;
  const ignoreAllies = getExplicitIgnoreAllies(actionData);
  const shouldFilterAlly = deps.shouldFilterAlly || defaultShouldFilterAlly;

  return (tokens || [])
    .filter((token) => token && token.actor)
    .filter((token) => (actorId ? token.id !== actorId : token !== actionData.actor))
    .filter((token) => (beneficiaryId ? token.id !== beneficiaryId : token !== beneficiary))
    .filter((token) => !shouldFilterAlly(actionData.actor, token, 'enemies', ignoreAllies))
    .filter((token) => token.actor?.type !== 'loot' && token.actor?.type !== 'hazard');
}
