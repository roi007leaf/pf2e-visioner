/**
 * @jest-environment jsdom
 */

import { jest } from '@jest/globals';
import '../../setup.js';

const mockGetVisibilityMap = jest.fn(() => ({}));
const mockGetCoverMap = jest.fn(() => ({}));
const mockGetDetectionBetween = jest.fn();

jest.mock('../../../scripts/utils.js', () => ({
  getVisibilityMap: mockGetVisibilityMap,
  getCoverMap: mockGetCoverMap,
}));

jest.mock('../../../scripts/stores/detection-map.js', () => ({
  getDetectionBetween: mockGetDetectionBetween,
}));

describe('HoverTooltips keybind state', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '';
    mockGetVisibilityMap.mockReset();
    mockGetVisibilityMap.mockReturnValue({});
    mockGetCoverMap.mockReset();
    mockGetCoverMap.mockReturnValue({});
    mockGetDetectionBetween.mockReset();

    global.PIXI = {
      Point: class Point {
        constructor(x, y) {
          this.x = x;
          this.y = y;
        }
      },
      Container: class Container {
        destroy = jest.fn();
      },
    };

    global.canvas.app = {
      view: {
        getBoundingClientRect: jest.fn(() => ({ left: 0, top: 0 })),
      },
      ticker: {
        add: jest.fn(),
        remove: jest.fn(),
      },
    };
    global.canvas.stage = {
      pivot: { x: 0, y: 0 },
      scale: { x: 1 },
    };
    global.canvas.animatePan = jest.fn(() => 'animated');
    global.canvas.tokens.addChild = jest.fn();
    global.canvas.tokens.toGlobal = jest.fn((point) => point);

    global.game.user.isGM = true;
    global.game.settings.get = jest.fn((moduleId, settingId) => {
      if (moduleId === 'pf2e-visioner' && settingId === 'enableHoverTooltips') return true;
      if (moduleId === 'pf2e-visioner' && settingId === 'tooltipFontSize') return 'medium';
      return false;
    });
  });

  function makeToken(id, x = 0) {
    return {
      id,
      x,
      y: 0,
      isVisible: true,
      isOwner: true,
      document: { id, width: 1, height: 1 },
      center: { x: x + 25, y: 25 },
      mesh: {},
      on: jest.fn(),
      off: jest.fn(),
    };
  }

  afterEach(() => {
    jest.useRealTimers();
  });

  function getHookHandler(eventName) {
    return global.Hooks.on.mock.calls.find(([hookName]) => hookName === eventName)?.[1];
  }

  test('key release clears saved key overlay state while panning', async () => {
    const mod = await import('../../../scripts/services/HoverTooltips.js');
    const { HoverTooltips, onHighlightObjects } = mod;

    HoverTooltips._isPanning = true;
    HoverTooltips.isShowingKeyTooltips = true;
    HoverTooltips._savedKeyTooltipsActive = true;

    onHighlightObjects(false);

    expect(HoverTooltips.isShowingKeyTooltips).toBe(false);
    expect(HoverTooltips._savedKeyTooltipsActive).toBeUndefined();
  });

  test('target keyboard overlay restores tooltip mode after rendering', async () => {
    const observer = makeToken('observer', 0);
    const target = makeToken('target', 100);
    global.canvas.tokens.controlled = [observer];
    global.canvas.tokens.placeables = [observer, target];
    mockGetVisibilityMap.mockReturnValue({ target: 'hidden' });

    const { HoverTooltips, showControlledTokenVisibility } = await import(
      '../../../scripts/services/HoverTooltips.js'
    );

    HoverTooltips.tooltipMode = 'observer';

    showControlledTokenVisibility();

    expect(HoverTooltips.isShowingKeyTooltips).toBe(true);
    expect(HoverTooltips.keyTooltipTokens.has('observer')).toBe(true);
    expect(HoverTooltips.tooltipMode).toBe('observer');
    expect(HoverTooltips._keyboardContext).toBeUndefined();
    expect(HoverTooltips._initialized).toBe(true);
  });

  test('observer keyboard overlay falls back to hovered token when none are controlled', async () => {
    const observer = makeToken('observer', 0);
    const target = makeToken('target', 100);
    global.canvas.tokens.controlled = [];
    global.canvas.tokens.placeables = [observer, target];
    mockGetVisibilityMap.mockReturnValue({ target: 'hidden' });

    const { HoverTooltips, showControlledTokenVisibilityObserver } = await import(
      '../../../scripts/services/HoverTooltips.js'
    );

    HoverTooltips.currentHoveredToken = observer;
    HoverTooltips.tooltipMode = 'target';

    showControlledTokenVisibilityObserver();

    expect(HoverTooltips.isShowingKeyTooltips).toBe(true);
    expect(HoverTooltips.keyTooltipTokens.has('observer')).toBe(true);
    expect(HoverTooltips.tooltipMode).toBe('target');
    expect(HoverTooltips._keyboardContext).toBeUndefined();
  });

  test('keyboard overlay does not start while panning', async () => {
    const observer = makeToken('observer', 0);
    global.canvas.tokens.controlled = [observer];
    global.canvas.tokens.placeables = [observer];

    const { HoverTooltips, showControlledTokenVisibility } = await import(
      '../../../scripts/services/HoverTooltips.js'
    );

    HoverTooltips._isPanning = true;

    showControlledTokenVisibility();

    expect(HoverTooltips.isShowingKeyTooltips).toBe(false);
    expect(HoverTooltips.keyTooltipTokens.size).toBe(0);
  });

  test('canvas pan suspends ticker and restores active key overlay after debounce', async () => {
    jest.useFakeTimers();
    const observer = makeToken('observer', 0);
    const target = makeToken('target', 100);
    const ticker = jest.fn();
    global.canvas.tokens.controlled = [observer];
    global.canvas.tokens.placeables = [observer, target];
    mockGetVisibilityMap.mockReturnValue({ target: 'hidden' });

    const { HoverTooltips, initializeHoverTooltips } = await import(
      '../../../scripts/services/HoverTooltips.js'
    );

    HoverTooltips.badgeTicker = ticker;
    HoverTooltips.isShowingKeyTooltips = true;
    HoverTooltips.keyTooltipTokens.add('observer');
    initializeHoverTooltips();

    getHookHandler('canvasPan')();

    expect(HoverTooltips._isPanning).toBe(true);
    expect(HoverTooltips.isShowingKeyTooltips).toBe(false);
    expect(HoverTooltips.keyTooltipTokens.size).toBe(0);
    expect(global.canvas.app.ticker.remove).toHaveBeenCalledWith(ticker);

    jest.advanceTimersByTime(150);

    expect(HoverTooltips._isPanning).toBe(false);
    expect(HoverTooltips.isShowingKeyTooltips).toBe(true);
    expect(HoverTooltips.keyTooltipTokens.has('observer')).toBe(true);
    expect(HoverTooltips._savedKeyTooltipsActive).toBeUndefined();
  });

  test('canvas zoom restores active key overlay after debounce', async () => {
    jest.useFakeTimers();
    const observer = makeToken('observer', 0);
    const target = makeToken('target', 100);
    global.canvas.tokens.controlled = [observer];
    global.canvas.tokens.placeables = [observer, target];
    mockGetVisibilityMap.mockReturnValue({ target: 'hidden' });

    const { HoverTooltips, initializeHoverTooltips } = await import(
      '../../../scripts/services/HoverTooltips.js'
    );

    HoverTooltips.isShowingKeyTooltips = true;
    HoverTooltips.keyTooltipTokens.add('observer');
    initializeHoverTooltips();

    expect(global.canvas.animatePan({ scale: 2 })).toBe('animated');

    expect(HoverTooltips._isZooming).toBe(true);
    expect(HoverTooltips.isShowingKeyTooltips).toBe(false);

    jest.advanceTimersByTime(150);

    expect(HoverTooltips._isZooming).toBe(false);
    expect(HoverTooltips.isShowingKeyTooltips).toBe(true);
    expect(HoverTooltips.keyTooltipTokens.has('observer')).toBe(true);
  });

  test('canvas pan clears active factor overlay instead of leaving hidden active state', async () => {
    jest.useFakeTimers();
    const badgeEl = document.createElement('button');
    const tooltipEl = document.createElement('div');
    document.body.append(badgeEl, tooltipEl);

    const { HoverTooltips, initializeHoverTooltips } = await import(
      '../../../scripts/services/HoverTooltips.js'
    );

    HoverTooltips.isShowingFactorsOverlay = true;
    HoverTooltips.factorsOverlayTokens.add('observer');
    HoverTooltips.visibilityBadges.set('factor:observer:target', {
      badgeEl,
      tooltipEl,
      isFactor: true,
    });
    initializeHoverTooltips();

    getHookHandler('canvasPan')();

    expect(HoverTooltips.isShowingFactorsOverlay).toBe(false);
    expect(HoverTooltips.factorsOverlayTokens.size).toBe(0);
    expect(HoverTooltips.visibilityBadges.size).toBe(0);
    expect(badgeEl.isConnected).toBe(false);
    expect(tooltipEl.isConnected).toBe(false);
    expect(global.Hooks.call).toHaveBeenCalledWith('pf2e-visioner:visibilityFactorsOverlay', {
      active: false,
    });
  });

  test('visibility map updates rebuild observer key overlay with hovered fallback', async () => {
    jest.useFakeTimers();
    const observer = makeToken('observer', 0);
    const target = makeToken('target', 100);
    global.canvas.tokens.controlled = [];
    global.canvas.tokens.placeables = [observer, target];
    mockGetVisibilityMap.mockReturnValue({ target: 'hidden' });

    const { HoverTooltips, initializeHoverTooltips } = await import(
      '../../../scripts/services/HoverTooltips.js'
    );

    HoverTooltips.tooltipMode = 'observer';
    HoverTooltips.currentHoveredToken = observer;
    HoverTooltips.isShowingKeyTooltips = true;
    initializeHoverTooltips();

    getHookHandler('pf2e-visioner.visibilityMapUpdated')();
    jest.advanceTimersByTime(150);
    jest.runOnlyPendingTimers();

    expect(HoverTooltips.isShowingKeyTooltips).toBe(true);
    expect(HoverTooltips.keyTooltipTokens.has('observer')).toBe(true);
    expect(HoverTooltips.tooltipMode).toBe('observer');
  });

  test('movement completion rebuilds key overlay after movement hide', async () => {
    jest.useFakeTimers();
    const observer = makeToken('observer', 0);
    const target = makeToken('target', 100);
    global.canvas.tokens.controlled = [observer];
    global.canvas.tokens.placeables = [observer, target];
    mockGetVisibilityMap.mockReturnValue({ target: 'hidden' });

    const { HoverTooltips, initializeHoverTooltips } = await import(
      '../../../scripts/services/HoverTooltips.js'
    );

    HoverTooltips.isShowingKeyTooltips = true;
    HoverTooltips.keyTooltipTokens.add('observer');
    initializeHoverTooltips();

    getHookHandler('preUpdateToken')({}, { x: 50 });

    expect(HoverTooltips._isTokenMoving).toBe(true);
    expect(HoverTooltips.keyTooltipTokens.size).toBe(0);

    jest.advanceTimersByTime(300);
    jest.runOnlyPendingTimers();

    expect(HoverTooltips._isTokenMoving).toBe(false);
    expect(HoverTooltips.isShowingKeyTooltips).toBe(true);
    expect(HoverTooltips.keyTooltipTokens.has('observer')).toBe(true);
  });

  test('token pointer down cancels pending hover badges before debounce renders', async () => {
    jest.useFakeTimers();
    const observer = makeToken('observer', 0);
    const target = makeToken('target', 100);
    global.canvas.tokens.controlled = [];
    global.canvas.tokens.placeables = [observer, target];
    mockGetVisibilityMap.mockReturnValue({ target: 'hidden' });

    const { HoverTooltips, initializeHoverTooltips } = await import(
      '../../../scripts/services/HoverTooltips.js'
    );

    initializeHoverTooltips();
    getHookHandler('hoverToken')(observer, true);

    expect(HoverTooltips._hoverDebounceTimer).toBeTruthy();

    const pointerDownHandler = observer.on.mock.calls.find(([event]) => event === 'pointerdown')[1];
    pointerDownHandler();
    jest.advanceTimersByTime(60);

    expect(HoverTooltips._hoverDebounceTimer).toBeUndefined();
    expect(HoverTooltips.currentHoveredToken).toBeNull();
    expect(HoverTooltips.visibilityIndicators.size).toBe(0);
    expect(HoverTooltips.visibilityBadges.size).toBe(0);
  });

  test('canvas pointer guard blocks pending hover badges when token pointer event is missed', async () => {
    jest.useFakeTimers();
    const observer = makeToken('observer', 0);
    const target = makeToken('target', 100);
    const addEventListener = jest.fn();
    const removeEventListener = jest.fn();
    global.canvas.app.view = {
      getBoundingClientRect: jest.fn(() => ({ left: 0, top: 0 })),
      addEventListener,
      removeEventListener,
    };
    global.canvas.tokens.controlled = [];
    global.canvas.tokens.placeables = [observer, target];
    mockGetVisibilityMap.mockReturnValue({ target: 'hidden' });

    const { HoverTooltips, initializeHoverTooltips } = await import(
      '../../../scripts/services/HoverTooltips.js'
    );

    initializeHoverTooltips();
    getHookHandler('hoverToken')(observer, true);

    const pointerDownHandler = addEventListener.mock.calls.find(
      ([event]) => event === 'pointerdown',
    )[1];
    pointerDownHandler({ button: 0 });
    jest.advanceTimersByTime(60);

    expect(HoverTooltips._pointerIsDown).toBe(true);
    expect(HoverTooltips.currentHoveredToken).toBeNull();
    expect(HoverTooltips.visibilityIndicators.size).toBe(0);
    expect(HoverTooltips.visibilityBadges.size).toBe(0);
  });

  test('passive hover over controlled token renders visibility badges', async () => {
    jest.useFakeTimers();
    const observer = makeToken('observer', 0);
    const target = makeToken('target', 100);
    observer.controlled = true;
    global.canvas.tokens.controlled = [observer];
    global.canvas.tokens.placeables = [observer, target];
    mockGetVisibilityMap.mockImplementation((token) =>
      token?.id === 'target' ? { observer: 'hidden' } : {},
    );

    const { HoverTooltips, initializeHoverTooltips } = await import(
      '../../../scripts/services/HoverTooltips.js'
    );

    initializeHoverTooltips();
    getHookHandler('hoverToken')(observer, true);
    jest.advanceTimersByTime(60);

    expect(HoverTooltips._hoverDebounceTimer).toBeUndefined();
    expect(HoverTooltips.currentHoveredToken).toBe(observer);
    expect(HoverTooltips.visibilityIndicators.size).toBe(1);
    expect(document.querySelectorAll('.pf2e-visioner-tooltip-badge.visibility-hidden')).toHaveLength(
      1,
    );
  });
});
