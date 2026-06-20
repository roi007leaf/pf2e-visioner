function getCanvasTokens(deps) {
  return deps.canvasTokens || canvas?.tokens;
}

function getMessage(actionData, deps) {
  if (deps.message) return deps.message;
  return game.messages?.get?.(actionData?.messageId) || null;
}

function resolvePointer(actionData, message, tokens) {
  return (
    actionData?.actor ||
    (message?.speaker?.token ? tokens?.get?.(message.speaker.token) : null) ||
    tokens?.controlled?.[0] ||
    null
  );
}

function resolveTargetFromUser(message, deps) {
  try {
    const user = deps.user || game.user;
    const isFromPlayer = !!message?.author && message.author.isGM === false;
    if (isFromPlayer) {
      if (user.id === message.author.id && user.targets?.size) {
        return Array.from(user.targets)[0];
      }
      return null;
    }
    if (user.targets?.size) return Array.from(user.targets)[0];
  } catch { }
  return null;
}

function resolvePointOutTarget(message, tokens, deps) {
  let target = null;
  const isFromPlayer = !!message?.author && message.author.isGM === false;

  if (isFromPlayer) {
    const authorTargetId = message?.flags?.pf2e?.target?.token;
    if (authorTargetId) target = tokens?.get?.(authorTargetId) || null;
  }

  target ||= resolveTargetFromUser(message, deps);
  if (target) return target;

  const visionerTargetId = message?.flags?.['pf2e-visioner']?.pointOut?.targetTokenId;
  if (visionerTargetId) target = tokens?.get?.(visionerTargetId) || null;
  if (target) return target;

  const pf2eTargetId = message?.flags?.pf2e?.target?.token;
  return pf2eTargetId ? tokens?.get?.(pf2eTargetId) || null : null;
}

function getPointOutAllies(pointer, target, tokens) {
  return (tokens?.placeables || []).filter((token) => {
    return (
      token &&
      token.actor &&
      (!pointer || token.id !== pointer.id) &&
      (pointer ? token.document?.disposition === pointer.document?.disposition : true) &&
      token.actor?.type !== 'loot'
    );
  });
}

export async function discoverPointOutSubjects(actionData, deps = {}) {
  const tokens = getCanvasTokens(deps);
  const message = getMessage(actionData, deps);
  const pointer = deps.pointer || resolvePointer(actionData, message, tokens);
  const target = deps.target || resolvePointOutTarget(message, tokens, deps);

  if (!target) return [];
  try {
    if (target?.actor?.type === 'loot') return [];
  } catch { }

  const getVisibilityBetween =
    deps.getVisibilityBetween || (await import('../../../../utils.js')).getVisibilityBetween;
  const cannotSee = [];

  for (const ally of getPointOutAllies(pointer, target, tokens)) {
    const visibility = getVisibilityBetween(ally, target);
    if (visibility === 'hidden' || visibility === 'undetected') {
      cannotSee.push({ ally, target, currentVisibility: visibility });
    }
  }

  return cannotSee;
}
