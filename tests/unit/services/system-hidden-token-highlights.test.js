import '../../setup.js';

import {
  buildControlledTokenHighlightRequests,
  buildMovedTokenHighlightRequests,
  buildSystemHiddenIndicatorDecision,
  getSystemHiddenIndicatorCandidates,
  getSystemHiddenSenseContext,
  getSystemHiddenTokenDistance,
  getMatchingControlledTokenForRefresh,
  refreshSystemHiddenHighlightsForControlledTokens,
  refreshSystemHiddenHighlightsForMovedToken,
  refreshSystemHiddenHighlightsForRenderedToken,
  resolveSystemHiddenObserver,
  shouldEvaluateSystemHiddenIndicators,
} from '../../../scripts/services/system-hidden-token-highlights.js';

function makeToken(id) {
  return {
    document: {
      id,
    },
  };
}

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

describe('system-hidden token highlight service', () => {
  test('resolves explicit observer before controlled fallback', () => {
    const explicitObserver = { id: 'explicit' };
    const controlledObserver = { id: 'controlled' };
    const tokensLayer = {
      controlled: [controlledObserver],
      get: jest.fn((id) => (id === 'explicit' ? explicitObserver : null)),
    };

    expect(resolveSystemHiddenObserver({ observerId: 'explicit', tokensLayer })).toBe(
      explicitObserver,
    );
  });

  test('respects controlled fallback option for system-hidden observer resolution', () => {
    const controlledObserver = { id: 'controlled' };
    const tokensLayer = {
      controlled: [controlledObserver],
      get: jest.fn(() => null),
    };

    expect(resolveSystemHiddenObserver({ observerId: 'missing', tokensLayer })).toBe(
      controlledObserver,
    );
    expect(
      resolveSystemHiddenObserver({
        observerId: 'missing',
        tokensLayer,
        allowControlledFallback: false,
      }),
    ).toBeNull();
  });

  test('filters system-hidden indicator candidates to creature actors other than observer', () => {
    const observer = { id: 'observer', actor: { type: 'character' } };
    const character = { id: 'character', actor: { type: 'character' } };
    const npc = { id: 'npc', actor: { type: 'npc' } };
    const hazard = { id: 'hazard', actor: { type: 'hazard' } };
    const loot = { id: 'loot', actor: { type: 'loot' } };
    const noActor = { id: 'no-actor' };

    expect(
      getSystemHiddenIndicatorCandidates(
        [observer, character, npc, hazard, loot, noActor],
        observer,
      ),
    ).toEqual([character, npc]);
  });

  test('builds position override requests for controlled tokens when a token moves', () => {
    const movedTokenDoc = { id: 'moved', x: 100, y: 200 };
    const controlledTokens = [makeToken('moved'), makeToken('other')];

    expect(buildMovedTokenHighlightRequests(movedTokenDoc, { x: 150 }, controlledTokens)).toEqual([
      {
        tokenId: 'moved',
        positionOverride: { x: 150, y: 200 },
      },
      {
        tokenId: 'other',
        positionOverride: null,
      },
    ]);
  });

  test('does not build requests for non-position token updates', () => {
    expect(
      buildMovedTokenHighlightRequests({ id: 'moved', x: 100, y: 200 }, { name: 'New' }, [
        makeToken('moved'),
      ]),
    ).toEqual([]);
  });

  test('builds controlled token highlight requests', () => {
    expect(
      buildControlledTokenHighlightRequests([
        makeToken('observer-a'),
        { document: {} },
        makeToken('observer-b'),
      ]),
    ).toEqual(['observer-a', 'observer-b']);
  });

  test('refreshes controlled token highlights for movement with one visual-effects import', async () => {
    const updateSystemHiddenTokenHighlights = jest.fn().mockResolvedValue(undefined);

    const result = await refreshSystemHiddenHighlightsForMovedToken(
      { id: 'moved', x: 100, y: 200 },
      { y: 250 },
      {
        getControlledTokens: () => [makeToken('moved'), makeToken('other')],
        loadVisualEffects: jest.fn(async () => ({ updateSystemHiddenTokenHighlights })),
      },
    );

    expect(updateSystemHiddenTokenHighlights).toHaveBeenCalledWith('moved', { x: 100, y: 250 });
    expect(updateSystemHiddenTokenHighlights).toHaveBeenCalledWith('other', null);
    expect(result.refreshed).toBe(2);
  });

  test('refreshes controlled token highlights after batch completion', async () => {
    const updateSystemHiddenTokenHighlights = jest.fn().mockResolvedValue(undefined);
    const loadVisualEffects = jest.fn(async () => ({ updateSystemHiddenTokenHighlights }));

    const result = await refreshSystemHiddenHighlightsForControlledTokens({
      getControlledTokens: () => [makeToken('observer-a'), makeToken('observer-b')],
      loadVisualEffects,
    });

    expect(loadVisualEffects).toHaveBeenCalledTimes(1);
    expect(updateSystemHiddenTokenHighlights).toHaveBeenCalledWith('observer-a');
    expect(updateSystemHiddenTokenHighlights).toHaveBeenCalledWith('observer-b');
    expect(result.refreshed).toBe(2);
  });

  test('matches refreshToken events by document id before importing visual effects', () => {
    const controlled = [makeToken('A'), makeToken('B')];

    expect(getMatchingControlledTokenForRefresh({ document: { id: 'C' } }, controlled)).toBeNull();
    expect(getMatchingControlledTokenForRefresh({ document: { id: 'B' } }, controlled)).toBe(
      controlled[1],
    );
  });

  test('refreshes only the matching controlled token for refreshToken', async () => {
    const updateSystemHiddenTokenHighlights = jest.fn().mockResolvedValue(undefined);
    const loadVisualEffects = jest.fn(async () => ({ updateSystemHiddenTokenHighlights }));

    const result = await refreshSystemHiddenHighlightsForRenderedToken(
      { document: { id: 'B' } },
      {
        getControlledTokens: () => [makeToken('A'), makeToken('B')],
        loadVisualEffects,
      },
    );

    expect(loadVisualEffects).toHaveBeenCalledTimes(1);
    expect(updateSystemHiddenTokenHighlights).toHaveBeenCalledWith('B');
    expect(result.refreshed).toBe(true);
  });

  test('does not import visual effects when refreshToken has no matching controlled token', async () => {
    const loadVisualEffects = jest.fn();

    const result = await refreshSystemHiddenHighlightsForRenderedToken(
      { document: { id: 'C' } },
      {
        getControlledTokens: () => [makeToken('A')],
        loadVisualEffects,
      },
    );

    expect(loadVisualEffects).not.toHaveBeenCalled();
    expect(result.refreshed).toBe(false);
  });

  test('detects whether an observer needs system-hidden indicator evaluation', () => {
    expect(
      shouldEvaluateSystemHiddenIndicators(
        getSystemHiddenSenseContext({
          actor: {
            system: { perception: { senses: [] } },
            hasCondition: jest.fn(() => false),
          },
        }),
      ),
    ).toBe(false);

    expect(
      shouldEvaluateSystemHiddenIndicators(
        getSystemHiddenSenseContext({
          actor: {
            system: { perception: { senses: [{ type: 'lifesense', range: 30 }] } },
            hasCondition: jest.fn(() => false),
          },
        }),
      ),
    ).toBe(true);

    expect(
      shouldEvaluateSystemHiddenIndicators(
        getSystemHiddenSenseContext({
          actor: {
            system: { perception: { senses: [] } },
            perception: { senses: [{ type: 'echolocation', acuity: 'precise', range: 40 }] },
            hasCondition: jest.fn(() => false),
          },
        }),
      ),
    ).toBe(true);

    expect(
      shouldEvaluateSystemHiddenIndicators(
        getSystemHiddenSenseContext({
          actor: {
            system: { perception: { senses: [] } },
            hasCondition: jest.fn((slug) => slug === 'blinded' || slug === 'deafened'),
          },
        }),
      ),
    ).toBe(true);
  });

  test('builds lifesense indicator decision from hidden state, traits, and range', () => {
    const observer = {
      document: { id: 'observer', x: 0, y: 0, width: 1, height: 1 },
      actor: {
        system: { perception: { senses: [{ type: 'lifesense', range: 30 }] } },
        hasCondition: jest.fn(() => false),
      },
    };
    const target = {
      visible: false,
      renderable: false,
      document: { id: 'target', x: 250, y: 0, width: 1, height: 1 },
      actor: { system: { traits: { value: [] } } },
    };
    const grid = {
      size: 50,
      distance: 5,
      measurePath: jest.fn(() => ({ distance: 5 })),
    };

    expect(
      buildSystemHiddenIndicatorDecision({
        observer,
        token: target,
        senseContext: getSystemHiddenSenseContext(observer),
        grid,
        canLifesenseDetect: jest.fn(() => true),
      }),
    ).toMatchObject({
      shouldShowIndicator: true,
      indicatorMode: 'lifesense',
      shouldShowLifesenseIndicator: true,
      distanceInFeet: 25,
    });
  });

  test('builds echolocation indicator decision from stored precise detection', () => {
    const observer = {
      document: { id: 'observer', x: 0, y: 0, width: 1, height: 1 },
      distanceTo: jest.fn(() => 35),
      actor: {
        perception: {
          senses: [{ type: 'echolocation', acuity: 'precise', range: 40 }],
        },
        system: { perception: { senses: [] } },
        hasCondition: jest.fn(() => false),
      },
    };
    const target = {
      visible: false,
      renderable: false,
      document: { id: 'target', x: 1000, y: 0, width: 1, height: 1 },
      actor: { system: { traits: { value: ['construct'] } } },
    };
    const grid = {
      size: 50,
      distance: 5,
      measurePath: jest.fn(() => ({ distance: 100 })),
    };

    expect(
      buildSystemHiddenIndicatorDecision({
        observer,
        token: target,
        senseContext: getSystemHiddenSenseContext(observer),
        grid,
        getDetectionBetween: jest.fn(() => ({ sense: 'echolocation', isPrecise: true })),
      }),
    ).toMatchObject({
      shouldShowIndicator: true,
      indicatorMode: 'echolocation',
      shouldShowEcholocationIndicator: true,
      distanceInFeet: 35,
    });
    expect(observer.distanceTo).toHaveBeenCalledWith(target);
  });

  test('does not build echolocation indicator without stored echolocation detection', () => {
    const observer = {
      document: { id: 'observer', x: 0, y: 0, width: 1, height: 1 },
      actor: {
        system: {
          perception: {
            senses: [{ type: 'echolocation', acuity: 'precise', range: 40 }],
          },
        },
        hasCondition: jest.fn(() => false),
      },
    };
    const target = {
      visible: false,
      renderable: false,
      document: { id: 'target', x: 250, y: 0, width: 1, height: 1 },
      actor: { system: { traits: { value: [] } } },
    };

    expect(
      buildSystemHiddenIndicatorDecision({
        observer,
        token: target,
        senseContext: getSystemHiddenSenseContext(observer),
        grid: {
          size: 50,
          distance: 5,
          measurePath: jest.fn(() => ({ distance: 5 })),
        },
        getDetectionBetween: jest.fn(() => null),
      }),
    ).toMatchObject({
      shouldShowIndicator: false,
      shouldShowEcholocationIndicator: false,
    });
  });

  test('does not build echolocation indicator through sound-blocking walls', () => {
    const observer = {
      document: { id: 'observer', x: 0, y: 0, width: 1, height: 1 },
      distanceTo: jest.fn(() => 25),
      actor: {
        system: {
          perception: {
            senses: [{ type: 'echolocation', acuity: 'precise', range: 40 }],
          },
        },
        hasCondition: jest.fn(() => false),
      },
    };
    const target = {
      visible: false,
      renderable: false,
      document: { id: 'target', x: 250, y: 0, width: 1, height: 1 },
      actor: { system: { traits: { value: [] } } },
    };
    const isSoundBlocked = jest.fn(() => true);

    expect(
      buildSystemHiddenIndicatorDecision({
        observer,
        token: target,
        senseContext: getSystemHiddenSenseContext(observer),
        getDetectionBetween: jest.fn(() => ({ sense: 'echolocation', isPrecise: true })),
        isSoundBlocked,
      }),
    ).toMatchObject({
      shouldShowIndicator: false,
      shouldShowEcholocationIndicator: false,
    });
    expect(isSoundBlocked).toHaveBeenCalledWith(observer, target);
  });

  test('uses position override when measuring system-hidden indicator distance', () => {
    const observer = {
      document: { x: 0, y: 0, width: 1, height: 1 },
    };
    const target = {
      document: { x: 100, y: 0, width: 1, height: 1 },
    };
    const grid = {
      size: 50,
      distance: 5,
      measurePath: jest.fn(() => ({ distance: 2 })),
    };

    const distance = getSystemHiddenTokenDistance(observer, target, { x: 50, y: 0 }, grid);

    expect(distance).toBe(10);
    expect(grid.measurePath).toHaveBeenCalledWith([
      { x: 75, y: 25 },
      { x: 125, y: 25 },
    ]);
  });

  test('builds blind-deaf indicator decision from stored visibility state', () => {
    const observer = {
      document: { id: 'observer', x: 0, y: 0, width: 1, height: 1 },
      actor: {
        system: { perception: { senses: [] } },
        hasCondition: jest.fn((slug) => slug === 'blinded' || slug === 'deafened'),
      },
    };
    const target = {
      visible: true,
      renderable: true,
      document: { id: 'target', x: 0, y: 0, width: 1, height: 1 },
      actor: { system: { traits: { value: [] } } },
    };

    expect(
      buildSystemHiddenIndicatorDecision({
        observer,
        token: target,
        senseContext: getSystemHiddenSenseContext(observer),
        getVisibilityState: jest.fn(() => 'hidden'),
      }),
    ).toMatchObject({
      shouldShowIndicator: true,
      indicatorMode: 'blind-deaf',
      shouldShowBlindDeafIndicator: true,
    });
  });
});

describe('system-hidden indicator render lifecycle', () => {
  beforeEach(() => {
    global.pf2eVisionerTestState = {
      settings: {
        'pf2e-visioner': {
          autoVisibilityEnabled: true,
        },
      },
    };
    global.canvas.interface = { addChild: jest.fn() };
    global.canvas.grid = {
      ...global.canvas.grid,
      size: 50,
      distance: 5,
    };
  });

  test('keeps an existing matching indicator instead of tearing down and recreating it', async () => {
    const { updateSystemHiddenTokenHighlights } = await import(
      '../../../scripts/services/visual-effects.js'
    );

    const existingIndicator = {
      _pvObserverId: 'observer',
      _pvIndicatorMode: 'lifesense',
      _pvAnimationFrameId: jest.fn(),
      destroy: jest.fn(),
      parent: { removeChild: jest.fn() },
    };
    const observer = {
      id: 'observer',
      document: { id: 'observer', x: 0, y: 0, width: 1, height: 1 },
      actor: {
        type: 'character',
        system: { perception: { senses: [{ type: 'lifesense', range: 60 }] } },
        hasCondition: jest.fn(() => false),
      },
      distanceTo: jest.fn(() => 30),
    };
    const hiddenTarget = {
      id: 'target',
      document: { id: 'target', x: 100, y: 0, width: 1, height: 1 },
      actor: {
        type: 'character',
        system: { traits: { value: [] } },
      },
      visible: false,
      renderable: false,
      _pvSystemHiddenIndicator: existingIndicator,
    };

    global.canvas.tokens.placeables = [observer, hiddenTarget];
    global.canvas.tokens.get = jest.fn((id) => (id === 'observer' ? observer : hiddenTarget));

    await updateSystemHiddenTokenHighlights('observer');

    expect(existingIndicator.destroy).not.toHaveBeenCalled();
    expect(existingIndicator.parent.removeChild).not.toHaveBeenCalled();
    expect(existingIndicator._pvAnimationFrameId).not.toHaveBeenCalled();
    expect(global.canvas.interface.addChild).not.toHaveBeenCalled();
    expect(hiddenTarget._pvSystemHiddenIndicator).toBe(existingIndicator);
  });

  test('shares one hook set across multiple rendered system-hidden indicators', async () => {
    const { removeSystemHiddenIndicator, updateSystemHiddenTokenHighlights } = await import(
      '../../../scripts/services/visual-effects.js'
    );

    global.PIXI = makePixiMock();
    global.Hooks.on.mockImplementation(
      (eventName) => `${eventName}-${global.Hooks.on.mock.calls.length}`,
    );

    const parentLayer = {
      addChild: jest.fn((child) => {
        child.parent = parentLayer;
      }),
      removeChild: jest.fn((child) => {
        if (child.parent === parentLayer) child.parent = null;
      }),
    };
    global.canvas.interface = parentLayer;

    const observer = {
      id: 'observer',
      document: { id: 'observer', x: 0, y: 0, width: 1, height: 1 },
      actor: {
        type: 'character',
        system: { perception: { senses: [{ type: 'lifesense', range: 60 }] } },
        hasCondition: jest.fn(() => false),
      },
      distanceTo: jest.fn(() => 30),
    };
    const targetA = {
      id: 'target-a',
      document: { id: 'target-a', x: 100, y: 0, width: 1, height: 1 },
      actor: {
        type: 'character',
        system: { traits: { value: [] } },
      },
      visible: false,
      renderable: false,
    };
    const targetB = {
      id: 'target-b',
      document: { id: 'target-b', x: 200, y: 0, width: 1, height: 1 },
      actor: {
        type: 'character',
        system: { traits: { value: [] } },
      },
      visible: false,
      renderable: false,
    };
    const tokensById = new Map([
      ['observer', observer],
      ['target-a', targetA],
      ['target-b', targetB],
    ]);

    global.canvas.tokens.placeables = [observer, targetA, targetB];
    global.canvas.tokens.get = jest.fn((id) => tokensById.get(id) ?? null);

    try {
      await updateSystemHiddenTokenHighlights('observer');

      expect(targetA._pvSystemHiddenIndicator).toBeTruthy();
      expect(targetB._pvSystemHiddenIndicator).toBeTruthy();
      expect(parentLayer.addChild).toHaveBeenCalledTimes(2);
      expect(
        global.Hooks.on.mock.calls.filter(([eventName]) => eventName === 'targetToken'),
      ).toHaveLength(1);
      expect(
        global.Hooks.on.mock.calls.filter(
          ([eventName]) => eventName === 'pf2e-visioner:visibilityFactorsOverlay',
        ),
      ).toHaveLength(1);
      expect(
        global.Hooks.on.mock.calls.filter(([eventName]) => eventName === 'canvasPan'),
      ).toHaveLength(1);
      expect(
        global.Hooks.on.mock.calls.filter(([eventName]) => eventName === 'canvasReady'),
      ).toHaveLength(1);
      expect(
        global.Hooks.on.mock.calls.filter(([eventName]) => eventName === 'canvasTearDown'),
      ).toHaveLength(1);
      expect(targetA._pvSystemHiddenIndicator._pvTargetHookId).toBeUndefined();
      expect(targetB._pvSystemHiddenIndicator._pvCanvasPanHook).toBeUndefined();
    } finally {
      removeSystemHiddenIndicator(targetA);
      removeSystemHiddenIndicator(targetB);
    }
  });

  test('cleanup cancels pending scheduled animation and removes hook registrations', async () => {
    const { removeSystemHiddenIndicator } = await import(
      '../../../scripts/services/visual-effects.js'
    );

    const cancelAnimation = jest.fn();
    const token = {
      _pvSystemHiddenIndicator: {
        _pvAnimationFrameId: cancelAnimation,
        _pvTargetHookId: 'target-hook',
        _pvFactorsOverlayHook: 'factor-hook',
        _pvCanvasPanHook: 'pan-hook',
        _pvCanvasReadyHook: 'ready-hook',
        _pvCanvasTearDownHook: 'tear-hook',
        _pvFactorsBadgeEl: { remove: jest.fn() },
        _pvFactorsTooltipEl: { remove: jest.fn() },
        parent: { removeChild: jest.fn() },
        destroy: jest.fn(),
      },
    };
    const indicator = token._pvSystemHiddenIndicator;

    expect(removeSystemHiddenIndicator(token)).toBe(true);

    expect(cancelAnimation).toHaveBeenCalledTimes(1);
    expect(global.Hooks.off).toHaveBeenCalledWith('targetToken', 'target-hook');
    expect(global.Hooks.off).toHaveBeenCalledWith(
      'pf2e-visioner:visibilityFactorsOverlay',
      'factor-hook',
    );
    expect(global.Hooks.off).toHaveBeenCalledWith('canvasPan', 'pan-hook');
    expect(global.Hooks.off).toHaveBeenCalledWith('canvasReady', 'ready-hook');
    expect(global.Hooks.off).toHaveBeenCalledWith('canvasTearDown', 'tear-hook');
    expect(indicator.parent.removeChild).toHaveBeenCalledWith(indicator);
    expect(indicator.destroy).toHaveBeenCalledWith({
      children: false,
      texture: false,
      baseTexture: false,
    });
    expect(token._pvSystemHiddenIndicator).toBeNull();
  });
});
