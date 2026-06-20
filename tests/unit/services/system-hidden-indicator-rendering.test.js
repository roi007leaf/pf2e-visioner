import '../../setup.js';

jest.mock('../../../scripts/services/HoverTooltips.js', () => ({
  HoverTooltips: {
    tooltipMode: 'observer',
    currentHoveredToken: null,
    _keyboardContext: false,
    isShowingKeyTooltips: false,
    _isPanning: false,
  },
  showVisibilityIndicators: jest.fn(),
  hideAllVisibilityIndicators: jest.fn(),
  hideAllCoverIndicators: jest.fn(),
}));

import {
  drawSystemHiddenIndicatorFrame,
  getSystemHiddenIndicatorColor,
  removeSystemHiddenFactorsBadge,
  showObserverHoverTooltips,
} from '../../../scripts/services/system-hidden-indicator-rendering.js';
import {
  HoverTooltips,
  showVisibilityIndicators,
} from '../../../scripts/services/HoverTooltips.js';

describe('system-hidden indicator rendering helpers', () => {
  const tokenDispositions = {
    FRIENDLY: 1,
    HOSTILE: -1,
    NEUTRAL: 0,
  };

  test('resolves base indicator colors by sense mode', () => {
    expect(getSystemHiddenIndicatorColor()).toBe(0x00d4ff);
    expect(
      getSystemHiddenIndicatorColor({
        shouldShowThoughtsenseIndicator: true,
      }),
    ).toBe(0x9400d3);
    expect(
      getSystemHiddenIndicatorColor({
        observerIsBlindAndDeaf: true,
        shouldShowThoughtsenseIndicator: true,
      }),
    ).toBe(0x555555);
  });

  test('targeting color follows token disposition and falls back to mode color', () => {
    expect(
      getSystemHiddenIndicatorColor({
        isTargeted: true,
        disposition: tokenDispositions.FRIENDLY,
        tokenDispositions,
      }),
    ).toBe(0x00ff00);
    expect(
      getSystemHiddenIndicatorColor({
        isTargeted: true,
        disposition: tokenDispositions.HOSTILE,
        tokenDispositions,
      }),
    ).toBe(0xff0000);
    expect(
      getSystemHiddenIndicatorColor({
        isTargeted: true,
        disposition: tokenDispositions.NEUTRAL,
        tokenDispositions,
      }),
    ).toBe(0xffa500);
    expect(
      getSystemHiddenIndicatorColor({
        isTargeted: true,
        disposition: 99,
        shouldShowThoughtsenseIndicator: true,
        tokenDispositions,
      }),
    ).toBe(0x9400d3);
  });

  test('draws indicator frame around token square', () => {
    const graphics = {
      clear: jest.fn(),
      lineStyle: jest.fn(),
      beginFill: jest.fn(),
      drawRect: jest.fn(),
      endFill: jest.fn(),
    };

    drawSystemHiddenIndicatorFrame({
      graphics,
      size: 100,
      color: 0x00d4ff,
    });

    expect(graphics.clear).toHaveBeenCalledTimes(1);
    expect(graphics.lineStyle).toHaveBeenCalledWith(3, 0x00d4ff, 0.6);
    expect(graphics.beginFill).toHaveBeenCalledWith(0x00d4ff, 0.03);
    expect(graphics.drawRect).toHaveBeenCalledWith(-50, -50, 100, 100);
    expect(graphics.endFill).toHaveBeenCalledTimes(1);
  });

  test('removes active factors badge and tooltip from indicator', () => {
    const badgeEl = { remove: jest.fn() };
    const tooltipEl = { remove: jest.fn() };
    const indicator = {
      _pvFactorsActive: true,
      _pvFactorsBadgeEl: badgeEl,
      _pvFactorsTooltipEl: tooltipEl,
    };

    removeSystemHiddenFactorsBadge(indicator);

    expect(indicator._pvFactorsActive).toBe(false);
    expect(badgeEl.remove).toHaveBeenCalledTimes(1);
    expect(tooltipEl.remove).toHaveBeenCalledTimes(1);
    expect(indicator._pvFactorsBadgeEl).toBeNull();
    expect(indicator._pvFactorsTooltipEl).toBeNull();
  });

  test('indicator hover renders the sensed token in target mode (badge on the observer)', async () => {
    global.game.settings.set('pf2e-visioner', 'enableHoverTooltips', true);
    showVisibilityIndicators.mockClear();
    HoverTooltips.tooltipMode = 'observer';
    HoverTooltips.currentHoveredToken = null;
    HoverTooltips.isShowingKeyTooltips = false;
    HoverTooltips._isPanning = false;

    const token = { document: { id: 'sensed-token' } };
    const indicator = {};

    await showObserverHoverTooltips({ indicator, token });

    expect(HoverTooltips.tooltipMode).toBe('target');
    expect(HoverTooltips.currentHoveredToken).toBe(token);
    expect(showVisibilityIndicators).toHaveBeenCalledWith(token);
  });
});
