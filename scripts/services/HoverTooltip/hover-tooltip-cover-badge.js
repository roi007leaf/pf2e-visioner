export const COVER_COLORBLIND_COLORS = {
  protanopia: {
    none: '#0072b2',
    lesser: '#f0e442',
    standard: '#cc79a7',
    greater: '#9467bd',
  },
  deuteranopia: {
    none: '#0072b2',
    lesser: '#f0e442',
    standard: '#ff8c00',
    greater: '#d946ef',
  },
  tritanopia: {
    none: '#00b050',
    lesser: '#ffd700',
    standard: '#ff6600',
    greater: '#dc143c',
  },
  achromatopsia: {
    none: '#ffffff',
    lesser: '#cccccc',
    standard: '#888888',
    greater: '#333333',
  },
};

export function getTooltipCoverBadgeColor({ colorblindMode, coverState, fallbackColor }) {
  if (!colorblindMode || colorblindMode === 'none') {
    return fallbackColor;
  }

  return COVER_COLORBLIND_COLORS[colorblindMode]?.[coverState] ?? fallbackColor;
}
