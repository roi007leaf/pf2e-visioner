export function resolveSneakingToken(actionData, tokens = canvas?.tokens?.placeables || []) {
  let token = actionData.actorToken || actionData.sneakingToken;
  if (token) return token;

  if (actionData.actor?.token?.object) {
    return actionData.actor.token.object;
  }

  if (actionData.actor?.getActiveTokens) {
    const activeTokens = actionData.actor.getActiveTokens();
    if (activeTokens.length > 0) return activeTokens[0];
  }

  if (actionData.actor?.id && tokens) {
    const tokenByName = tokens.find((candidate) => candidate.name === actionData.actor?.name);
    if (tokenByName) return tokenByName;
    token = tokens.find((candidate) => candidate.actor?.id === actionData.actor.id);
    if (token) return token;
  }

  if (actionData.message?.speaker?.token) {
    const tokenId = actionData.message.speaker.token;
    token = tokens?.find((candidate) => candidate.id === tokenId);
    if (token) return token;
  }

  return null;
}
