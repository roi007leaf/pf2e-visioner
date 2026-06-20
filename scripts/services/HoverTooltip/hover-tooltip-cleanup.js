const DEFAULT_DESTROY_OPTIONS = { children: true, texture: true, baseTexture: true };

export function removeTooltipDomElement(element) {
  try {
    element?.remove?.();
  } catch (_) {}
}

function removeIndicatorDomFields(indicator, fields) {
  if (!indicator) return;
  for (const field of fields) {
    removeTooltipDomElement(indicator[field]);
    delete indicator[field];
  }
}

export function destroyTooltipIndicator(
  indicator,
  domFields,
  destroyOptions = DEFAULT_DESTROY_OPTIONS,
) {
  removeIndicatorDomFields(indicator, domFields);
  if (indicator) {
    delete indicator._suppressionBadgeEl;
  }

  if (indicator?.parent) {
    indicator.parent.removeChild(indicator);
  }
  indicator?.destroy?.(destroyOptions);
}

export function destroyVisibilityTooltipIndicator(indicator) {
  destroyTooltipIndicator(indicator, [
    '_senseBadgeEl',
    '_visBadgeEl',
    '_coverBadgeEl',
    '_tooltipAnchor',
  ]);
}

export function destroyCoverTooltipIndicator(indicator) {
  destroyTooltipIndicator(indicator, ['_coverBadgeEl', '_tooltipAnchor']);
}

export function destroyVisibilityBadge(badge, destroyOptions = DEFAULT_DESTROY_OPTIONS) {
  removeTooltipDomElement(badge?.badgeEl);
  removeTooltipDomElement(badge?.tooltipEl);

  if (badge?.container?.parent) {
    badge.container.parent.removeChild(badge.container);
  }
  badge?.container?.destroy?.(destroyOptions);
}
