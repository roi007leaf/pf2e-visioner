import { isTokenDocumentPendingDeletion } from './token-deletion-guard.js';
import { hasPendingTokenMovementPosition } from '../services/movement-tracking.js';

function getRenderableToken(token) {
  return token?.object ?? token ?? null;
}

function hasMovementAnimation(renderableToken) {
  if (renderableToken?.movementAnimationPromise) return true;
  if ((renderableToken?.animationContexts?.size ?? 0) > 0) return true;
  const tokenId = renderableToken?.document?.id ?? renderableToken?.id;
  return !!tokenId && hasPendingTokenMovementPosition(tokenId);
}

export function isTokenActivelyAnimating(token) {
  const renderableToken = getRenderableToken(token);
  if (hasMovementAnimation(renderableToken)) return true;
  const animation = renderableToken?._animation;
  if (!animation) return false;
  if (animation.state === 'completed') return false;
  return !!(animation.promise || animation.active || animation.state !== undefined);
}

export function getTokenRenderDocumentDelta(token) {
  const renderableToken = getRenderableToken(token);
  if (renderableToken?.destroyed || renderableToken?._destroyed) return null;
  const documentToken = token?.document ?? token ?? null;
  const renderX = Number(renderableToken?.x);
  const renderY = Number(renderableToken?.y);
  const documentX = Number(documentToken?.x);
  const documentY = Number(documentToken?.y);

  if (
    !Number.isFinite(renderX) ||
    !Number.isFinite(renderY) ||
    !Number.isFinite(documentX) ||
    !Number.isFinite(documentY)
  ) {
    return null;
  }

  const dx = renderX - documentX;
  const dy = renderY - documentY;
  return {
    renderX,
    renderY,
    documentX,
    documentY,
    distance: Math.hypot(dx, dy),
  };
}

export function shouldDeferTokenDocumentUpdate(token) {
  const document = token?.document ?? token;
  const renderable = getRenderableToken(token);
  if (renderable?.destroyed || renderable?._destroyed || isTokenDocumentPendingDeletion(document)) return false;
  if (document?.parent?.tokens?.has && !document.parent.tokens.has(document.id)) return false;
  return isTokenActivelyAnimating(token) || (getTokenRenderDocumentDelta(token)?.distance ?? 0) > 1;
}

export async function waitForTokenDocumentUpdateSafe(
  token,
  {
    timeoutMs = 3000,
    intervalMs = 25,
  } = {},
) {
  if (!shouldDeferTokenDocumentUpdate(token)) {
    return;
  }

  const startedAt = Date.now();
  while (shouldDeferTokenDocumentUpdate(token)) {
    if (Date.now() - startedAt >= timeoutMs) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
