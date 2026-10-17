export const TOOLTIP_BADGE_SELECTOR = '[data-pf2e-visioner-tooltip-badge]';

export function markTooltipBadgeElement(element) {
  element.dataset.pf2eVisionerTooltipBadge = 'true';
  return element;
}

export function isTooltipBadgeElement(element) {
  return !!element?.closest?.(TOOLTIP_BADGE_SELECTOR);
}

export function findHoveredTooltipBadge(doc = globalThis.document) {
  const hovered = doc?.querySelectorAll?.(':hover');
  if (!hovered?.length) return null;
  return hovered[hovered.length - 1].closest?.(TOOLTIP_BADGE_SELECTOR) ?? null;
}

export function watchTooltipBadgeHoverExit({
  token,
  onExit,
  doc = globalThis.document,
  delay = 50,
}) {
  let timer = null;
  const handler = (event) => {
    if (isTooltipBadgeElement(event.target)) return;
    doc.removeEventListener('pointerover', handler, true);
    timer = setTimeout(() => {
      timer = null;
      if (!token?.hover) onExit();
    }, delay);
  };
  doc.addEventListener('pointerover', handler, true);
  return () => {
    doc.removeEventListener('pointerover', handler, true);
    if (timer) clearTimeout(timer);
  };
}
