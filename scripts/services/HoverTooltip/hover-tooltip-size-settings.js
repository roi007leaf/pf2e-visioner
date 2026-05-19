import { MODULE_ID } from '../../constants.js';
import { computeSizesFromSetting } from '../../helpers/tooltip-utils.js';
import { computeTooltipBadgeMetrics } from './hover-tooltip-badge-layout.js';

export const DEFAULT_TOOLTIP_SIZE_CONFIG = {
  fontPx: 16,
  iconPx: 14,
  borderPx: 2,
};

export function readTooltipSizeConfig({
  settings,
  fallbackFontPx = DEFAULT_TOOLTIP_SIZE_CONFIG.fontPx,
  fallbackConfig = DEFAULT_TOOLTIP_SIZE_CONFIG,
} = {}) {
  try {
    const raw = settings?.get?.(MODULE_ID, 'tooltipFontSize');
    return computeSizesFromSetting(raw ?? fallbackFontPx);
  } catch (_) {
    return { ...fallbackConfig };
  }
}

export function applyTooltipSizeCssVariables(style, sizeConfig) {
  const { fontPx, iconPx, borderPx } = sizeConfig;
  const { badgeWidth, badgeHeight, borderRadius } = computeTooltipBadgeMetrics({
    iconPx,
    borderPx,
  });

  style.setProperty('--pf2e-visioner-tooltip-font-size', `${fontPx}px`);
  style.setProperty('--pf2e-visioner-tooltip-icon-size', `${iconPx}px`);
  style.setProperty('--pf2e-visioner-tooltip-badge-border', `${borderPx}px`);
  style.setProperty('--pf2e-visioner-tooltip-badge-width', `${badgeWidth}px`);
  style.setProperty('--pf2e-visioner-tooltip-badge-height', `${badgeHeight}px`);
  style.setProperty('--pf2e-visioner-tooltip-badge-radius', `${borderRadius}px`);
}

export function applyDefaultTooltipSizeCssVariables(style) {
  applyTooltipSizeCssVariables(style, DEFAULT_TOOLTIP_SIZE_CONFIG);
}
