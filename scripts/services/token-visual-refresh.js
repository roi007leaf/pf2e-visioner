const DEFAULT_VIEWPORT_PADDING_PX = 64;

export function isTokenInCurrentViewport(
  token,
  { canvasRef = globalThis.canvas, paddingPx = DEFAULT_VIEWPORT_PADDING_PX } = {},
) {
  try {
    const screen = canvasRef?.app?.renderer?.screen;
    const worldTransform = canvasRef?.stage?.worldTransform;
    if (!screen || typeof worldTransform?.applyInverse !== 'function') return false;

    const topLeft = worldTransform.applyInverse({ x: 0, y: 0 });
    const bottomRight = worldTransform.applyInverse({ x: screen.width, y: screen.height });
    const minX = Math.min(topLeft.x, bottomRight.x) - paddingPx;
    const minY = Math.min(topLeft.y, bottomRight.y) - paddingPx;
    const maxX = Math.max(topLeft.x, bottomRight.x) + paddingPx;
    const maxY = Math.max(topLeft.y, bottomRight.y) + paddingPx;

    const gridSize = canvasRef?.grid?.size || 1;
    const doc = token?.document;
    const centerX =
      token?.center?.x ?? (doc?.x ?? token?.x ?? 0) + ((doc?.width ?? 1) * gridSize) / 2;
    const centerY =
      token?.center?.y ?? (doc?.y ?? token?.y ?? 0) + ((doc?.height ?? 1) * gridSize) / 2;

    return centerX >= minX && centerX <= maxX && centerY >= minY && centerY <= maxY;
  } catch (_) {
    return false;
  }
}

export function canRefreshTokenVisual(token, { requireVisibleTrue = false } = {}) {
  if (!token || token.destroyed || !token.sprite || !token.mesh) return false;
  if (requireVisibleTrue ? token.visible !== true : token.visible === false) return false;
  if (token.turnMarker && !token.turnMarker.mesh) return false;
  return true;
}

export function refreshTokenVisual(
  token,
  { canvasRef = globalThis.canvas, paddingPx, requireVisibleTrue = false } = {},
) {
  if (!isTokenInCurrentViewport(token, { canvasRef, paddingPx })) return false;
  if (!canRefreshTokenVisual(token, { requireVisibleTrue })) return false;
  token.refresh?.();
  return true;
}

export function refreshTokenVisuals(tokens, options = {}) {
  let refreshed = 0;
  for (const token of tokens || []) {
    if (refreshTokenVisual(token, options)) refreshed += 1;
  }
  return refreshed;
}
