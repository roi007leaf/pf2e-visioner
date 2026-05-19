import {
  DEFAULT_TOOLTIP_SIZE_CONFIG,
  applyDefaultTooltipSizeCssVariables,
  applyTooltipSizeCssVariables,
  readTooltipSizeConfig,
} from '../../../scripts/services/HoverTooltip/hover-tooltip-size-settings.js';

function makeStyle() {
  const values = new Map();
  return {
    values,
    setProperty: jest.fn((key, value) => values.set(key, value)),
  };
}

describe('hover tooltip size settings', () => {
  test('reads configured tooltip size through project size mapper', () => {
    const settings = { get: jest.fn(() => 20) };

    expect(readTooltipSizeConfig({ settings, fallbackFontPx: 16 })).toMatchObject({
      fontPx: expect.any(Number),
      iconPx: expect.any(Number),
      borderPx: expect.any(Number),
    });
    expect(settings.get).toHaveBeenCalledWith('pf2e-visioner', 'tooltipFontSize');
  });

  test('falls back when settings read fails', () => {
    const settings = {
      get: jest.fn(() => {
        throw new Error('boom');
      }),
    };
    const fallbackConfig = { fontPx: 11, iconPx: 9, borderPx: 3 };

    expect(readTooltipSizeConfig({ settings, fallbackConfig })).toEqual(fallbackConfig);
  });

  test('applies all tooltip CSS variables including badge metrics', () => {
    const style = makeStyle();

    applyTooltipSizeCssVariables(style, { fontPx: 16, iconPx: 14, borderPx: 2 });

    expect(style.values.get('--pf2e-visioner-tooltip-font-size')).toBe('16px');
    expect(style.values.get('--pf2e-visioner-tooltip-icon-size')).toBe('14px');
    expect(style.values.get('--pf2e-visioner-tooltip-badge-border')).toBe('2px');
    expect(style.values.get('--pf2e-visioner-tooltip-badge-width')).toBe('26px');
    expect(style.values.get('--pf2e-visioner-tooltip-badge-height')).toBe('24px');
    expect(style.values.get('--pf2e-visioner-tooltip-badge-radius')).toBe('8px');
  });

  test('default CSS variables stay aligned with default config', () => {
    const style = makeStyle();

    applyDefaultTooltipSizeCssVariables(style);

    expect(DEFAULT_TOOLTIP_SIZE_CONFIG).toEqual({ fontPx: 16, iconPx: 14, borderPx: 2 });
    expect(style.values.get('--pf2e-visioner-tooltip-font-size')).toBe('16px');
  });
});
