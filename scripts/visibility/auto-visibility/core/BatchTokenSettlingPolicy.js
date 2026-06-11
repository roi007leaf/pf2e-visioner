function hasPositionDrift(aX, aY, bX, bY, threshold) {
  return (
    Number.isFinite(aX) &&
    Number.isFinite(aY) &&
    Number.isFinite(bX) &&
    Number.isFinite(bY) &&
    Math.hypot(aX - bX, aY - bY) > threshold
  );
}

function movementAnimationIsRunning(animation) {
  if (!animation || animation.state === 'completed') return false;
  return !!animation.promise || !!animation.active || animation.state !== undefined;
}

export function collectUnsettledChangedTokenIds({
  changedTokens = new Set(),
  getTokenById = () => null,
  getPendingDestinationById = () => null,
  desyncThreshold = 1,
} = {}) {
  const unsettledIds = [];

  for (const id of changedTokens) {
    const token = getTokenById(id);
    if (!token) continue;

    const isAnimating =
      !!token.movementAnimationPromise ||
      (token.animationContexts?.size ?? 0) > 0 ||
      movementAnimationIsRunning(token._animation) ||
      movementAnimationIsRunning(token.animation);
    const isDragging =
      token?._dragHandle != null ||
      !!token?._dragPassthrough ||
      !!token?.document?.flags?.core?.isDragging;

    const renderX = Number(token?.x);
    const renderY = Number(token?.y);
    const documentX = Number(token?.document?.x);
    const documentY = Number(token?.document?.y);
    const hasRenderDocumentDesync = hasPositionDrift(
      renderX,
      renderY,
      documentX,
      documentY,
      desyncThreshold,
    );

    const pendingDestination = getPendingDestinationById(id);
    const pendingX = Number(pendingDestination?.x);
    const pendingY = Number(pendingDestination?.y);
    const hasPendingDestinationDesync =
      pendingDestination != null &&
      Number.isFinite(pendingX) &&
      Number.isFinite(pendingY) &&
      (hasPositionDrift(renderX, renderY, pendingX, pendingY, desyncThreshold) ||
        hasPositionDrift(documentX, documentY, pendingX, pendingY, desyncThreshold));

    if (isAnimating || isDragging || hasRenderDocumentDesync || hasPendingDestinationDesync) {
      unsettledIds.push(id);
    }
  }

  return unsettledIds;
}
