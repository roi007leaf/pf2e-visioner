export const TOOLTIP_SENSE_ICONS = {
  tremorsense: 'fa-solid fa-tower-broadcast',
  lifesense: 'fa-solid fa-heartbeat',
  thoughtsense: 'fa-solid fa-brain',
  scent: 'fa-solid fa-nose',
  hearing: 'fa-solid fa-ear-listen',
  'greater-darkvision': 'fa-solid fa-moon',
  greaterDarkvision: 'fa-solid fa-moon',
  darkvision: 'fa-regular fa-moon',
  'low-light-vision': 'fa-solid fa-moon-over-sun',
  lowLightVision: 'fa-solid fa-moon-over-sun',
  'see-invisibility': 'fa-solid fa-person-rays',
  'light-perception': 'fa-solid fa-eye',
  vision: 'fa-solid fa-eye',
  echolocation: 'fa-solid fa-wave-pulse',
};

function applyIconClasses(element, iconClass) {
  const classes = String(iconClass ?? '')
    .split(/\s+/)
    .filter(Boolean);
  if (classes.length) {
    element.classList.add(...classes);
  }
}

function createPositionedTooltipBadgeContainer({ left, top, tooltipLabel = '' }) {
  const el = document.createElement('div');
  el.style.position = 'fixed';
  el.style.pointerEvents = 'auto';
  el.style.cursor = 'pointer';
  el.style.zIndex = '15';
  el.style.left = '0';
  el.style.top = '0';
  el.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  el.style.willChange = 'transform';
  if (tooltipLabel) {
    el.dataset.tooltip = tooltipLabel;
    el.setAttribute('aria-label', tooltipLabel);
  }
  return el;
}

export function getTooltipSenseIcon(sense) {
  return TOOLTIP_SENSE_ICONS[sense] || 'fa-solid fa-eye';
}

export function createVisibilityTooltipBadge({
  left,
  top,
  stateClass,
  iconClass,
  kind = 'visibility',
  tooltipLabel = '',
  badgeWidth,
  badgeHeight,
  borderRadius,
}) {
  const el = createPositionedTooltipBadgeContainer({ left, top, tooltipLabel });
  const badge = document.createElement('span');
  badge.classList.add('pf2e-visioner-tooltip-badge');
  badge.classList.add(kind === 'cover' ? `cover-${stateClass}` : `visibility-${stateClass}`);
  badge.style.setProperty('--pf2e-visioner-tooltip-badge-width', `${badgeWidth}px`);
  badge.style.setProperty('--pf2e-visioner-tooltip-badge-height', `${badgeHeight}px`);
  badge.style.setProperty('--pf2e-visioner-tooltip-badge-radius', `${borderRadius}px`);

  const icon = document.createElement('i');
  applyIconClasses(icon, iconClass);
  badge.appendChild(icon);
  el.appendChild(badge);
  return el;
}

export function createSenseTooltipBadge({
  left,
  top,
  sense,
  badgeWidth,
  badgeHeight,
  borderRadius,
  iconPx,
}) {
  const el = createPositionedTooltipBadgeContainer({ left, top });
  const badge = document.createElement('span');
  badge.classList.add('pf2e-visioner-sense-badge');
  badge.style.display = 'inline-flex';
  badge.style.alignItems = 'center';
  badge.style.justifyContent = 'center';
  badge.style.background = 'rgba(0, 0, 0, 0.85)';
  badge.style.border = '2px solid #888';
  badge.style.borderRadius = `${borderRadius}px`;
  badge.style.width = `${badgeWidth}px`;
  badge.style.height = `${badgeHeight}px`;
  badge.style.color = '#aaa';

  const icon = document.createElement('i');
  applyIconClasses(icon, getTooltipSenseIcon(sense));
  icon.style.fontSize = `${iconPx}px`;
  badge.appendChild(icon);
  el.appendChild(badge);
  return el;
}

export function createCoverTooltipBadge({
  left,
  top,
  iconClass,
  color,
  badgeWidth,
  badgeHeight,
  borderRadius,
  isManualCover = false,
}) {
  const el = createPositionedTooltipBadgeContainer({ left, top });
  const badge = document.createElement('span');
  badge.style.display = 'inline-flex';
  badge.style.alignItems = 'center';
  badge.style.justifyContent = 'center';
  badge.style.position = 'relative';
  badge.style.background = 'rgba(0, 0, 0, 0.9)';
  badge.style.border = `var(--pf2e-visioner-tooltip-badge-border, 2px) solid ${color}`;
  badge.style.borderRadius = `${borderRadius}px`;
  badge.style.width = `${badgeWidth}px`;
  badge.style.height = `${badgeHeight}px`;
  badge.style.color = color;

  const icon = document.createElement('i');
  applyIconClasses(icon, iconClass);
  icon.style.fontSize = 'var(--pf2e-visioner-tooltip-icon-size, 14px)';
  icon.style.lineHeight = '1';
  badge.appendChild(icon);

  if (isManualCover) {
    const cog = document.createElement('i');
    cog.classList.add('fa-solid', 'fa-cog');
    cog.style.position = 'absolute';
    cog.style.bottom = '-2px';
    cog.style.right = '-2px';
    cog.style.fontSize = 'calc(var(--pf2e-visioner-tooltip-icon-size, 16px) * 0.5)';
    cog.style.color = '#888';
    cog.style.textShadow = '0 0 3px black';
    badge.appendChild(cog);
  }

  el.appendChild(badge);
  return el;
}

export function createSenseSuppressionOverlay({
  parentBadgeEl,
  suppressedSenses,
  iconPx,
  getSenseLabel,
  formatTooltip,
}) {
  const labels = [...suppressedSenses].map((sense) => getSenseLabel(sense));
  const tooltipText = formatTooltip(labels);
  const overlaySize = Math.max(10, Math.round(iconPx * 0.7));
  const el = document.createElement('div');
  el.style.position = 'absolute';
  el.style.top = '-4px';
  el.style.right = '-4px';
  el.style.width = `${overlaySize}px`;
  el.style.height = `${overlaySize}px`;
  el.style.borderRadius = '50%';
  el.style.background = 'rgba(180, 30, 30, 0.95)';
  el.style.display = 'flex';
  el.style.alignItems = 'center';
  el.style.justifyContent = 'center';
  el.style.zIndex = '16';
  el.style.pointerEvents = 'auto';
  el.dataset.tooltip = tooltipText;
  el.dataset.tooltipDirection = 'UP';

  const icon = document.createElement('i');
  icon.classList.add('fa-solid', 'fa-ban');
  icon.style.fontSize = `${Math.round(overlaySize * 0.7)}px`;
  icon.style.color = '#fff';
  el.appendChild(icon);

  const badgeSpan = parentBadgeEl.querySelector('span');
  if (badgeSpan) {
    badgeSpan.style.position = 'relative';
    badgeSpan.appendChild(el);
  } else {
    parentBadgeEl.style.position = 'relative';
    parentBadgeEl.appendChild(el);
  }
  return el;
}

export function resolveTooltipCssColor(cssColor) {
  if (!cssColor) return '#ffffff';
  if (!cssColor.includes?.('var(')) return cssColor;

  const tempEl = document.createElement('div');
  tempEl.style.color = cssColor;
  document.body.appendChild(tempEl);
  const computed = getComputedStyle(tempEl).color;
  tempEl.remove();
  return computed || '#ffffff';
}

export function createVisibilityFactorBadge({
  iconClass,
  iconColor,
  iconSize = 16,
  bgSize = 40,
  zIndex = '1000',
  left = null,
  top = null,
}) {
  const badgeEl = document.createElement('div');
  badgeEl.style.position = 'fixed';
  badgeEl.style.pointerEvents = 'auto';
  badgeEl.style.cursor = 'pointer';
  badgeEl.style.zIndex = zIndex;
  badgeEl.style.left = '0';
  badgeEl.style.top = '0';
  badgeEl.style.willChange = 'transform';
  if (Number.isFinite(left) && Number.isFinite(top)) {
    badgeEl.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  }

  const badge = document.createElement('span');
  badge.classList.add('pf2e-visioner-factor-badge');
  badge.style.display = 'inline-flex';
  badge.style.alignItems = 'center';
  badge.style.justifyContent = 'center';
  badge.style.background = 'rgba(0, 0, 0, 0.8)';
  badge.style.borderRadius = '6px';
  badge.style.width = `${bgSize}px`;
  badge.style.height = `${bgSize}px`;

  const icon = document.createElement('i');
  applyIconClasses(icon, iconClass);
  icon.style.fontSize = `${iconSize}px`;
  icon.style.color = iconColor;
  badge.appendChild(icon);
  badgeEl.appendChild(badge);
  return badgeEl;
}

function appendFactorTooltipLine(container, line) {
  const lineEl = document.createElement('div');
  lineEl.style.margin = '2px 0';

  if (line && typeof line === 'object') {
    if (line.bullet) lineEl.append('• ');
    if (line.emphasized) {
      const strong = document.createElement('strong');
      strong.textContent = line.text ?? '';
      lineEl.appendChild(strong);
    } else {
      lineEl.append(line.text ?? '');
    }
  } else {
    const strongBulletMatch = String(line).match(/^&bull;\s*<strong>(.*)<\/strong>$/u);
    if (!strongBulletMatch) {
      lineEl.textContent = String(line).replaceAll('&bull;', '•');
      container.appendChild(lineEl);
      return;
    }

    lineEl.append('• ');
    const strong = document.createElement('strong');
    strong.textContent = strongBulletMatch[1];
    lineEl.appendChild(strong);
  }

  container.appendChild(lineEl);
}

export function createVisibilityFactorTooltip({ lines, fallbackText = '' }) {
  const tooltipEl = document.createElement('div');
  tooltipEl.style.position = 'fixed';
  tooltipEl.style.pointerEvents = 'none';
  tooltipEl.style.zIndex = '2000';
  tooltipEl.style.display = 'none';
  tooltipEl.style.left = '0';
  tooltipEl.style.top = '0';
  tooltipEl.style.willChange = 'transform';

  const content = document.createElement('div');
  content.style.background = 'rgba(0, 0, 0, 0.9)';
  content.style.borderRadius = '4px';
  content.style.padding = '8px';
  content.style.color = '#ffffff';
  content.style.fontFamily = 'Arial';
  content.style.fontSize = '12px';
  content.style.whiteSpace = 'nowrap';
  content.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.3)';

  const visibleLines = lines?.length ? lines : [fallbackText];
  visibleLines.forEach((line) => appendFactorTooltipLine(content, line));
  tooltipEl.appendChild(content);
  return tooltipEl;
}
