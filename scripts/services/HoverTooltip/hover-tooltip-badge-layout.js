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
