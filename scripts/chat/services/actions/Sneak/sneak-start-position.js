import { resolveSneakingToken } from './sneak-token-resolution.js';

function getMessage(actionData) {
  return actionData?.message || game.messages?.get?.(actionData?.messageId);
}

function getStoredPositionFromMessage(actionData) {
  const message = getMessage(actionData);
  return (
    message?.flags?.['pf2e-visioner']?.sneakStartPosition ||
    message?.flags?.['pf2e-visioner']?.rollTimePosition ||
    null
  );
}

function buildCurrentTokenPosition(token, now) {
  const cx = token?.center?.x;
  const cy = token?.center?.y;
  if (typeof cx !== 'number' || typeof cy !== 'number') return null;

  return {
    x: typeof token.x === 'number' ? token.x : undefined,
    y: typeof token.y === 'number' ? token.y : undefined,
    center: { x: cx, y: cy },
    elevation: token?.document?.elevation || 0,
    tokenId: token?.id,
    tokenName: token?.name,
    timestamp: now(),
  };
}

export function captureSneakStartPosition(
  actionData,
  {
    storedStartPosition = null,
    getSneakingToken = resolveSneakingToken,
    now = Date.now,
  } = {},
) {
  try {
    if (storedStartPosition) {
      actionData.storedStartPosition = storedStartPosition;
      return;
    }

    const messagePosition = getStoredPositionFromMessage(actionData);
    if (messagePosition) {
      actionData.storedStartPosition = messagePosition;
      return;
    }

    const token = getSneakingToken(actionData);
    const currentPosition = buildCurrentTokenPosition(token, now);
    if (currentPosition) actionData.storedStartPosition = currentPosition;
  } catch (error) {
    console.warn('PF2E Visioner | Error in position capture setup:', error);
  }
}
