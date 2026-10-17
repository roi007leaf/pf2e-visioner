export function getRoundedTooltipTransform(left, top, scale = 1) {
  const translate = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  if (scale === 1) return translate;
  return `${translate} scale(${Math.round(scale * 1000) / 1000})`;
}

export function setTooltipBadgeTransform(element, left, top, scale = 1) {
  if (!element?.style) return false;

  const nextTransform = getRoundedTooltipTransform(left, top, scale);
  if (element.style.transform === nextTransform) return false;

  element.style.transformOrigin = '0 0';
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
