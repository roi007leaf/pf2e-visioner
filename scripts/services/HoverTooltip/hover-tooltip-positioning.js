export function getRoundedTooltipTransform(left, top) {
  return `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
}

export function setTooltipBadgeTransform(element, left, top) {
  if (!element?.style) return false;

  const nextTransform = getRoundedTooltipTransform(left, top);
  if (element.style.transform === nextTransform) return false;

  element.style.transform = nextTransform;
  return true;
}

export function createTooltipPositionPoint(pixi = globalThis.PIXI) {
  if (typeof pixi?.Point === 'function') {
    return new pixi.Point(0, 0);
  }

  return { x: 0, y: 0 };
}

export function toGlobalTooltipPoint(tokensLayer, point, x, y) {
  point.x = x;
  point.y = y;
  return tokensLayer?.toGlobal?.(point) || point;
}
