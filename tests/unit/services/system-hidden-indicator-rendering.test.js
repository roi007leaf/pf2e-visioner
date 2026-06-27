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
  getLiveTokenCenter,
  getSystemHiddenIndicatorColor,
  removeSystemHiddenFactorsBadge,
  repositionIndicatorIfMoved,
  showObserverHoverTooltips,
  syncSystemHiddenIndicatorPositionForToken,
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

describe('getLiveTokenCenter (indicator tracks its token, incl. drag preview)', () => {
  function tokenAt(id, cx, cy) {
    return { document: { id, x: cx - 50, y: cy - 50, width: 1, height: 1 }, center: { x: cx, y: cy } };
  }

  test('returns the token center when there is no drag preview', () => {
    const token = tokenAt('t', 300, 400);
    const canvasLayer = { tokens: { preview: { children: [] } }, grid: { size: 100 } };
    expect(getLiveTokenCenter(token, canvasLayer)).toEqual({ x: 300, y: 400 });
  });

  test('follows the drag preview clone position (matched by _original)', () => {
    const token = tokenAt('t', 300, 400);
    const preview = { _original: token, document: { id: 't', width: 1, height: 1 }, center: { x: 1500, y: 400 } };
    const canvasLayer = { tokens: { preview: { children: [preview] } }, grid: { size: 100 } };
    expect(getLiveTokenCenter(token, canvasLayer)).toEqual({ x: 1500, y: 400 });
  });

  test('matches the preview clone by document id when _original is absent', () => {
    const token = tokenAt('t', 300, 400);
    const preview = { document: { id: 't', width: 1, height: 1 }, center: { x: 900, y: 400 } };
    const canvasLayer = { tokens: { preview: { children: [preview] } }, grid: { size: 100 } };
    expect(getLiveTokenCenter(token, canvasLayer)).toEqual({ x: 900, y: 400 });
  });

  test('falls back to document coordinates when no center is available', () => {
    const token = { document: { id: 't', x: 200, y: 200, width: 2, height: 2 } };
    const canvasLayer = { tokens: { preview: { children: [] } }, grid: { size: 100 } };
    expect(getLiveTokenCenter(token, canvasLayer)).toEqual({ x: 300, y: 300 });
  });
});

describe('syncSystemHiddenIndicatorPositionForToken', () => {
  function indicator() {
    return { position: { set: jest.fn() } };
  }

  test('repositions the indicator to the token live center', () => {
    const ind = indicator();
    const token = { document: { id: 't', width: 1, height: 1 }, center: { x: 700, y: 800 }, _pvSystemHiddenIndicator: ind };
    const canvasLayer = { tokens: { get: () => token, preview: { children: [] } }, grid: { size: 100 } };

    expect(syncSystemHiddenIndicatorPositionForToken(token, canvasLayer)).toBe(true);
    expect(ind.position.set).toHaveBeenCalledWith(700, 800);
  });

  test('repositions to the drag preview center when dragging (refreshToken fires for the preview)', () => {
    const ind = indicator();
    const original = { document: { id: 't', width: 1, height: 1 }, center: { x: 300, y: 400 }, _pvSystemHiddenIndicator: ind };
    const preview = { _original: original, document: { id: 't', width: 1, height: 1 }, center: { x: 2500, y: 400 } };
    const canvasLayer = { tokens: { get: () => original, preview: { children: [preview] } }, grid: { size: 100 } };

    // refreshToken fires for the preview clone; sync resolves the original + uses preview center
    expect(syncSystemHiddenIndicatorPositionForToken(preview, canvasLayer)).toBe(true);
    expect(ind.position.set).toHaveBeenCalledWith(2500, 400);
  });

  test('no-ops when the token has no indicator', () => {
    const token = { document: { id: 't' }, center: { x: 0, y: 0 } };
    const canvasLayer = { tokens: { get: () => token, preview: { children: [] } }, grid: { size: 100 } };
    expect(syncSystemHiddenIndicatorPositionForToken(token, canvasLayer)).toBe(false);
  });
});

describe('repositionIndicatorIfMoved (skip-if-unchanged keeps fast drags smooth)', () => {
  test('skips position.set when the indicator is already at the token center', () => {
    const token = { document: { id: 't', width: 1, height: 1 }, center: { x: 400, y: 400 } };
    const indicator = { _pvTokenRef: token, position: { x: 400, y: 400, set: jest.fn() } };
    const canvasLayer = { tokens: { preview: { children: [] } }, grid: { size: 100 } };

    expect(repositionIndicatorIfMoved(indicator, canvasLayer)).toBe(false);
    expect(indicator.position.set).not.toHaveBeenCalled();
  });

  test('repositions only when the live center moved (e.g. drag preview)', () => {
    const token = { document: { id: 't', width: 1, height: 1 }, center: { x: 400, y: 400 } };
    const preview = { _original: token, document: { id: 't', width: 1, height: 1 }, center: { x: 1800, y: 400 } };
    const indicator = { _pvTokenRef: token, position: { x: 400, y: 400, set: jest.fn() } };
    const canvasLayer = { tokens: { preview: { children: [preview] } }, grid: { size: 100 } };

    expect(repositionIndicatorIfMoved(indicator, canvasLayer)).toBe(true);
    expect(indicator.position.set).toHaveBeenCalledWith(1800, 400);
  });

  test('no-ops for an indicator without a position', () => {
    expect(repositionIndicatorIfMoved({ _pvTokenRef: {} }, {})).toBe(false);
  });
});
