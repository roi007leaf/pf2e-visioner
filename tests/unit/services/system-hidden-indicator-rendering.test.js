import '../../setup.js';

import {
  createSystemHiddenIndicator,
  drawSystemHiddenIndicatorFrame,
  getSystemHiddenIndicatorColor,
  removeSystemHiddenFactorsBadge,
} from '../../../scripts/services/system-hidden-indicator-rendering.js';
import { HoverTooltips } from '../../../scripts/services/HoverTooltips.js';
import { showVisibilityIndicatorsForTokenPair } from '../../../scripts/services/HoverTooltips.js';
import { getVisibilityBetween } from '../../../scripts/stores/visibility-map.js';
import { legacyVisibilityToProfile } from '../../../scripts/visibility/perception-profile.js';

function visibilityV2Flags(map) {
  return {
    'pf2e-visioner': {
      visibilityV2: Object.fromEntries(
        Object.entries(map).map(([targetId, state]) => [
          targetId,
          legacyVisibilityToProfile(state),
        ]),
      ),
    },
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

  test('lifesense indicator hover does not leak observer tooltip mode into normal token hovers', async () => {
    const handlers = {};
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
      on: jest.fn((eventName, handler) => {
        handlers[eventName] = handler;
      }),
    });
    global.PIXI = {
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

    const observer = {
      id: 'observer',
      isOwner: true,
      document: { id: 'observer', x: 0, y: 0, width: 1, height: 1 },
      center: { x: 25, y: 25 },
      actor: { type: 'character' },
      distanceTo: jest.fn(() => 30),
    };
    const hiddenTarget = {
      id: 'target',
      isOwner: true,
      x: 100,
      y: 0,
      document: { id: 'target', x: 100, y: 0, width: 1, height: 1, displayName: 0 },
      center: { x: 125, y: 25 },
      actor: { type: 'character' },
      bounds: { x: 100, y: 0, width: 50, height: 50 },
      visible: true,
      renderable: true,
      mesh: { visible: true, renderable: true, alpha: 1 },
    };
    const otherVisibleToken = {
      id: 'other',
      isOwner: true,
      x: 200,
      y: 0,
      document: {
        id: 'other',
        x: 200,
        y: 0,
        width: 1,
        height: 1,
        flags: visibilityV2Flags({ target: 'hidden' })['pf2e-visioner'],
        getFlag: jest.fn((moduleId, key) =>
          moduleId === 'pf2e-visioner'
            ? visibilityV2Flags({ target: 'hidden' })['pf2e-visioner'][key]
            : null,
        ),
      },
      center: { x: 225, y: 25 },
      actor: { type: 'character' },
      visible: true,
      renderable: true,
      mesh: { visible: true, renderable: true, alpha: 1 },
    };
    const previousHovered = { id: 'previous', document: { id: 'previous' } };
    const parentLayer = {
      addChild: jest.fn((child) => {
        child.parent = parentLayer;
      }),
    };
    global.canvas = {
      ...global.canvas,
      ready: true,
      interface: parentLayer,
      grid: { ...global.canvas.grid, size: 50 },
      app: {
        view: {
          getBoundingClientRect: jest.fn(() => ({ left: 0, top: 0 })),
        },
        ticker: {
          add: jest.fn(),
          remove: jest.fn(),
        },
      },
      stage: { pivot: { x: 0, y: 0 }, scale: { x: 1 } },
      tokens: {
        controlled: [observer],
        placeables: [observer, hiddenTarget, otherVisibleToken],
        get: jest.fn((id) =>
          id === 'observer' ? observer : id === 'other' ? otherVisibleToken : hiddenTarget,
        ),
        toGlobal: jest.fn((point) => point),
      },
    };
    global.game.settings.get = jest.fn((moduleId, settingId) => {
      if (moduleId === 'pf2e-visioner' && settingId === 'enableHoverTooltips') return true;
      if (moduleId === 'pf2e-visioner' && settingId === 'tooltipFontSize') return 'medium';
      return false;
    });
    HoverTooltips.tooltipMode = 'target';
    HoverTooltips.currentHoveredToken = previousHovered;
    HoverTooltips._keyboardContext = undefined;

    await createSystemHiddenIndicator({
      observer,
      token: hiddenTarget,
      indicatorMode: 'lifesense',
    });

    await handlers.pointerover();

    expect(HoverTooltips.tooltipMode).toBe('target');
    expect(HoverTooltips.currentHoveredToken).toBe(previousHovered);
    expect(HoverTooltips._keyboardContext).toBeUndefined();
  });

  test('lifesense indicator hover places tooltip badges from the hidden token target perspective', async () => {
    const handlers = {};
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
      on: jest.fn((eventName, handler) => {
        handlers[eventName] = handler;
      }),
    });
    global.PIXI = {
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

    const observer = {
      id: 'observer',
      isOwner: true,
      x: 0,
      y: 0,
      document: {
        id: 'observer',
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        flags: visibilityV2Flags({ target: 'hidden' })['pf2e-visioner'],
        getFlag: jest.fn((moduleId, key) =>
          moduleId === 'pf2e-visioner'
            ? visibilityV2Flags({ target: 'hidden' })['pf2e-visioner'][key]
            : null,
        ),
      },
      center: { x: 25, y: 25 },
      actor: { type: 'character' },
      distanceTo: jest.fn(() => 30),
      visible: true,
      renderable: true,
      mesh: { visible: true, renderable: true, alpha: 1 },
    };
    const hiddenTarget = {
      id: 'target',
      isOwner: true,
      x: 100,
      y: 0,
      document: { id: 'target', x: 100, y: 0, width: 1, height: 1, displayName: 0 },
      center: { x: 125, y: 25 },
      actor: { type: 'character' },
      bounds: { x: 100, y: 0, width: 50, height: 50 },
      visible: true,
      renderable: true,
      mesh: { visible: true, renderable: true, alpha: 1 },
    };
    const parentLayer = {
      addChild: jest.fn((child) => {
        child.parent = parentLayer;
      }),
    };
    global.canvas = {
      ...global.canvas,
      ready: true,
      interface: parentLayer,
      grid: { ...global.canvas.grid, size: 50 },
      app: {
        view: {
          getBoundingClientRect: jest.fn(() => ({ left: 0, top: 0 })),
        },
        ticker: {
          add: jest.fn(),
          remove: jest.fn(),
        },
      },
      stage: { pivot: { x: 0, y: 0 }, scale: { x: 1 } },
      tokens: {
        controlled: [observer],
        placeables: [observer, hiddenTarget],
        get: jest.fn((id) => (id === 'observer' ? observer : hiddenTarget)),
        toGlobal: jest.fn((point) => point),
      },
    };
    global.game.settings.get = jest.fn((moduleId, settingId) => {
      if (moduleId === 'pf2e-visioner' && settingId === 'enableHoverTooltips') return true;
      if (moduleId === 'pf2e-visioner' && settingId === 'autoVisibilityEnabled') return true;
      if (moduleId === 'pf2e-visioner' && settingId === 'tooltipFontSize') return 'medium';
      return false;
    });
    HoverTooltips.visibilityIndicators.clear();
    HoverTooltips.tooltipMode = 'target';
    HoverTooltips.currentHoveredToken = null;
    HoverTooltips._keyboardContext = undefined;
    HoverTooltips.isShowingKeyTooltips = false;
    HoverTooltips._isPanning = false;

    await createSystemHiddenIndicator({
      observer,
      token: hiddenTarget,
      indicatorMode: 'lifesense',
    });

    expect(getVisibilityBetween(observer, hiddenTarget)).toBe('hidden');
    showVisibilityIndicatorsForTokenPair(observer, hiddenTarget, 'target');
    expect([...HoverTooltips.visibilityIndicators.keys()]).toEqual([observer.id]);
    HoverTooltips.visibilityIndicators.clear();

    await handlers.pointerover();

    expect([...HoverTooltips.visibilityIndicators.keys()]).toEqual([observer.id]);
  });
});
