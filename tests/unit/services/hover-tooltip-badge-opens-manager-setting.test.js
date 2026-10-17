import {
  makeTooltipBadgeClickThrough,
  tooltipBadgeOpensManager,
} from '../../../scripts/services/HoverTooltip/hover-tooltip-token-manager-click.js';
import { DEFAULT_SETTINGS } from '../../../scripts/constants.js';

function settingsWith(value) {
  return { get: jest.fn(() => value) };
}

describe('tooltip badge opens manager setting', () => {
  test('is a client setting enabled by default', () => {
    expect(DEFAULT_SETTINGS.tooltipBadgeOpensManager).toMatchObject({
      scope: 'client',
      config: true,
      type: Boolean,
      default: true,
    });
  });

  test('opens manager unless the setting is explicitly off', () => {
    expect(tooltipBadgeOpensManager(settingsWith(true))).toBe(true);
    expect(tooltipBadgeOpensManager(settingsWith(undefined))).toBe(true);
    expect(tooltipBadgeOpensManager(settingsWith(false))).toBe(false);
  });

  test('falls back to opening manager when settings throw', () => {
    const settings = {
      get: () => {
        throw new Error('not registered');
      },
    };
    expect(tooltipBadgeOpensManager(settings)).toBe(true);
  });

  test('click-through badge lets the pointer reach the token underneath', () => {
    const el = document.createElement('div');
    el.style.pointerEvents = 'auto';
    el.style.cursor = 'pointer';

    makeTooltipBadgeClickThrough(el);

    expect(el.style.pointerEvents).toBe('none');
    expect(el.style.cursor).toBe('');
  });
});
