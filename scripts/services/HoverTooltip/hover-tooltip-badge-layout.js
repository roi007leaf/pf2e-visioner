export const VISIBILITY_FACTOR_BADGE_SIZE = 40;
export const VISIBILITY_FACTOR_BADGE_TOP_GAP = 5;

export function computeTooltipBadgeMetrics({ iconPx, borderPx }) {
  const badgeWidth = Math.round(iconPx + borderPx * 2 + 8);
  const badgeHeight = Math.round(iconPx + borderPx * 2 + 6);

  return {
    badgeWidth,
    badgeHeight,
    spacing: Math.max(6, Math.round(iconPx / 2)),
    borderRadius: Math.round(badgeHeight / 3),
  };
}

export function computeTooltipBadgeVerticalOffset(hudActive) {
  return hudActive ? 26 : -6;
}

export function computeTooltipBadgeCenter({ canvasRect, globalPoint, badgeHeight, hudActive }) {
  return {
    centerX: canvasRect.left + globalPoint.x,
    centerY:
      canvasRect.top +
      globalPoint.y -
      badgeHeight / 2 +
      computeTooltipBadgeVerticalOffset(hudActive),
  };
}

export function computeSingleTooltipBadgePosition({ centerX, centerY, badgeWidth }) {
  return {
    left: centerX - badgeWidth / 2,
    top: centerY,
  };
}

export function computeTooltipBadgeStackPositions({
  centerX,
  centerY,
  badgeWidth,
  spacing,
  slots,
}) {
  const totalWidth =
    slots.length > 0 ? slots.length * badgeWidth + (slots.length - 1) * spacing : 0;
  let currentX = centerX - totalWidth / 2;

  return slots.reduce((positions, slot) => {
    positions[slot] = {
      left: currentX,
      top: centerY,
    };
    currentX += badgeWidth + spacing;
    return positions;
  }, {});
}

export function computeVisibilityFactorBadgeWorldPoint({
  tokenX,
  tokenY,
  tokenBounds,
  badgeSize = VISIBILITY_FACTOR_BADGE_SIZE,
  topGap = VISIBILITY_FACTOR_BADGE_TOP_GAP,
}) {
  return {
    x: tokenX + tokenBounds.width / 2,
    y: tokenY - badgeSize - topGap,
  };
}

export function computeVisibilityFactorBadgePlacement({
  canvasRect,
  globalPoint,
  badgeSize = VISIBILITY_FACTOR_BADGE_SIZE,
}) {
  const screenX = canvasRect.left + globalPoint.x;
  const screenY = canvasRect.top + globalPoint.y;

  return {
    screenX,
    screenY,
    left: screenX - badgeSize / 2,
    top: screenY - badgeSize / 2,
  };
}

export function computeVisibilityFactorTooltipPosition({
  screenX,
  screenY,
  badgeSize = VISIBILITY_FACTOR_BADGE_SIZE,
  gap = VISIBILITY_FACTOR_BADGE_TOP_GAP,
}) {
  return {
    left: screenX + badgeSize / 2 + gap,
    top: screenY - badgeSize / 2,
  };
}

export const TOOLTIP_BADGE_TOKEN_GAP = 4;
export const TOOLTIP_BADGE_MIN_ZOOM_SCALE = 0.6;

export function computeTooltipBadgeZoomScale(zoom, minScale = TOOLTIP_BADGE_MIN_ZOOM_SCALE) {
  const value = Number(zoom);
  if (!Number.isFinite(value) || value <= 0) return 1;
  return Math.min(1, Math.max(minScale, value));
}

export function scaleTooltipBadgeMetrics(metrics, scale) {
  return {
    ...metrics,
    badgeWidth: metrics.badgeWidth * scale,
    badgeHeight: metrics.badgeHeight * scale,
    spacing: metrics.spacing * scale,
  };
}

export function computeTooltipBadgeWorldAnchor({
  tokenX,
  tokenY,
  tokenWidth,
  tokenHeight,
  below = false,
}) {
  return {
    x: tokenX + tokenWidth / 2,
    y: below ? tokenY + tokenHeight : tokenY,
    placement: below ? 'below' : 'above',
  };
}

export function computeTooltipBadgeRowOrigin({
  canvasRect,
  globalPoint,
  badgeHeight,
  placement = 'above',
  gap = TOOLTIP_BADGE_TOKEN_GAP,
}) {
  const anchorY = canvasRect.top + globalPoint.y;
  return {
    centerX: canvasRect.left + globalPoint.x,
    centerY: placement === 'below' ? anchorY + gap : anchorY - badgeHeight - gap,
  };
}
