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
  createSystemHiddenIndicator,
  drawSystemHiddenIndicatorFrame,
  getSystemHiddenIndicatorColor,
  removeSystemHiddenFactorsBadge,
  showObserverHoverTooltips,
} from '../../../scripts/services/system-hidden-indicator-rendering.js';
import {
  HoverTooltips,
  showVisibilityIndicators,
} from '../../../scripts/services/HoverTooltips.js';

function makePixiMock() {
  const makeDisplayObject = () => ({
    position: { set: jest.fn() },
    anchor: { set: jest.fn() },
    addChild: jest.fn(),
    removeChild: jest.fn(),
    destroy: jest.fn(),
    clear: jest.fn(),
    lineStyle: jest.fn(),
    beginFill: jest.fn(),
    drawRect: jest.fn(),
    endFill: jest.fn(),
    on: jest.fn(),
  });

  return {
    Graphics: jest.fn(function Graphics() {
      return makeDisplayObject();
    }),
    Container: jest.fn(function Container() {
      return makeDisplayObject();
    }),
    Text: jest.fn(function Text(text, style) {
      return {
        ...makeDisplayObject(),
        text,
        style,
      };
    }),
    TextStyle: jest.fn(function TextStyle(options) {
      return options;
    }),
    Point: jest.fn(function Point(x, y) {
      return { x, y };
    }),
  };
}

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
    ).toBe(0x9400d3);
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

  test('presence-only indicator tick keeps token body, effects, and soundwave hidden', async () => {
    const pixi = makePixiMock();
    const parent = {
      addChild: jest.fn((child) => {
        child.parent = parent;
      }),
    };
    const token = {
      document: { id: 'target', width: 1, x: 100, y: 100, disposition: 0 },
      center: { x: 125, y: 125 },
      visible: false,
      renderable: false,
      mesh: { visible: false, renderable: false, alpha: 0 },
      effects: { visible: false },
      detectionFilter: null,
      detectionFilterMesh: { visible: false, renderable: false, alpha: 0 },
    };
    const observer = { document: { id: 'observer' } };
    const canvasLayer = {
      ready: true,
      grid: { size: 50 },
      interface: parent,
      tokens: { get: jest.fn(() => token) },
    };

    const indicator = await createSystemHiddenIndicator({
      observer,
      token,
      indicatorMode: 'thoughtsense',
      shouldShowThoughtsenseIndicator: true,
      canvasLayer,
      pixi,
    });

    token.visible = true;
    token.renderable = true;
    token.mesh.visible = true;
    token.mesh.renderable = true;
    token.mesh.alpha = 1;
    token.effects.visible = true;
    token.detectionFilter = { id: 'recreated-soundwave' };
    token.detectionFilterMesh.visible = true;
    token.detectionFilterMesh.renderable = true;
    token.detectionFilterMesh.alpha = 1;

    indicator._pvAnimateFunction();

    expect(token._pvPresenceOnlyRenderSuppression).toMatchObject({
      mode: 'thoughtsense',
      observerId: 'observer',
    });
    expect(token).toMatchObject({
      visible: false,
      renderable: false,
      mesh: {
        visible: false,
        renderable: false,
        alpha: 0,
      },
      effects: { visible: false },
      detectionFilter: null,
      detectionFilterMesh: {
        visible: false,
        renderable: false,
        alpha: 0,
      },
    });
  });
});
