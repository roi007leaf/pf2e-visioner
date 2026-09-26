import '../../setup.js';

import {
  buildControlledTokenHighlightRequests,
  buildMovedTokenHighlightRequests,
  buildSystemHiddenIndicatorDecision,
  getSystemHiddenIndicatorCandidates,
  getSystemHiddenSenseContext,
  observerHasPerceptionSense,
  getSystemHiddenTokenDistance,
  getMatchingControlledTokenForRefresh,
  refreshSystemHiddenHighlightsForControlledTokens,
  refreshSystemHiddenHighlightsForMovedToken,
  refreshSystemHiddenHighlightsForRenderedToken,
  removeSystemHiddenIndicatorsForObservedTargets,
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

test.each(['scent', 'lifesense', 'thoughtsense', 'echolocation'])(
  '%s presence marker respects target region suppression and elevation', (sense) => {
    const previousScene = canvas.scene;
    const observer = { center: { x: 50, y: 50 }, document: { elevation: 0 },
      distanceTo: () => 25,
      actor: { system: { perception: { senses: [{ type: sense, range: 30 }] } } } };
    const token = { visible: false, center: { x: 150, y: 50 }, document: { elevation: 20 } };
    canvas.scene = { regions: [{
      testPoint: (point, elevation) => point.x >= 100 && elevation >= 20,
      behaviors: [{ type: 'pf2e-visioner.Pf2eVisionerSenseSuppression',
        system: { enabled: true, senses: new Set([sense]), affectsTarget: true } }],
    }] };
    const decide = () => buildSystemHiddenIndicatorDecision({ observer, token,
      getDetectionBetween: () => ({ sense, isPrecise: sense === 'echolocation' }),
      canLifesenseDetect: () => true, canThoughtsenseDetect: () => true,
      isSoundBlocked: () => false, isScentBlocked: () => false });
    try {
      expect(decide().shouldShowIndicator).toBe(false);
      token.document.elevation = 0;
      expect(decide().shouldShowIndicator).toBe(true);
      token.document.elevation = 20;
      canvas.scene.regions[0].behaviors[0].disabled = true;
      expect(decide().shouldShowIndicator).toBe(true);
    } finally { canvas.scene = previousScene; }
  },
);

test('observer suppression uses movement override and leaves other senses available', () => {
  const previousScene = canvas.scene;
  const observer = { center: { x: 50, y: 50 }, document: { x: 0, y: 0, elevation: 20 },
    distanceTo: () => 20,
    actor: { system: { perception: { senses: [{ type: 'scent', range: 30 }] } } } };
  const token = { visible: false, center: { x: 50, y: 50 }, document: { elevation: 0 } };
  canvas.scene = { regions: [{ testPoint: (p, e) => p.x >= 100 && e >= 20,
    behaviors: [{ type: 'pf2e-visioner.Pf2eVisionerSenseSuppression',
      system: { senses: new Set(['scent']), affectsObserver: true, affectsTarget: false } }],
  }] };
  const decide = (positionOverride) => buildSystemHiddenIndicatorDecision({ observer, token,
    positionOverride, grid: { size: 100 }, isScentBlocked: () => false });
  try {
    expect(decide(null).shouldShowScentIndicator).toBe(true);
    expect(decide({ x: 100, y: 0 }).shouldShowScentIndicator).toBe(false);
    expect(decide({ x: 100, y: 0, elevation: 0 }).shouldShowScentIndicator).toBe(true);
    canvas.scene.regions[0].behaviors[0].system.senses = new Set(['lifesense']);
    expect(decide({ x: 100, y: 0 }).shouldShowScentIndicator).toBe(true);
  } finally { canvas.scene = previousScene; }
});

test.each([
  [{ type: 'SCENT' }],
  { contents: [{ slug: 'scent' }] },
  new Map([['scent', { id: 'scent' }]]),
  new Set([{ type: 'scent' }]),
  { scent: { type: 'scent' } },
])('sense presence lookup supports native collection shape %#', (senses) => {
  expect(observerHasPerceptionSense({ actor: { perception: { senses } } }, 'scent')).toBe(true);
});

test('sense presence lookup reads live entries without copying unrelated sense fields', () => {
  const sense = { type: 'darkvision' };
  Object.defineProperty(sense, 'unrelated', { enumerable: true, get: () => { throw Error('Do not copy senses for a presence query'); } });
  const observer = { actor: { system: { perception: { senses: [sense] } } } };
  expect(observerHasPerceptionSense(observer, 'scent')).toBe(false);
  sense.type = 'scent';
  expect(observerHasPerceptionSense(observer, 'scent')).toBe(true);
  observer.actor.system.perception.senses.length = 0;
  expect(observerHasPerceptionSense(observer, 'scent')).toBe(false);
});

test.each(['lifesense', 'thoughtsense'])('%s marker survives a visible-token refresh without hearing', (sense) => {
  const observer = { document: { x: 0, y: 0, width: 1, height: 1 },
    actor: { system: { perception: { senses: [{ type: sense, range: 30 }] } }, hasCondition: () => true } };
  const target = { visible: true, renderable: true, document: { x: 100, y: 0, width: 1, height: 1 },
    actor: { system: { traits: { value: [] } } } };
  const decision = buildSystemHiddenIndicatorDecision({ observer, token: target,
    grid: { size: 100, distance: 5, measurePath: () => ({ distance: 1 }) },
    getVisibilityState: () => 'hidden', getDetectionBetween: () => ({ sense, isPrecise: false }),
    isSoundBlocked: () => false, canLifesenseDetect: () => true, canThoughtsenseDetect: () => true });
  expect(decision).toMatchObject({ shouldShowIndicator: true, indicatorMode: sense });
});

test('scent marker does not self-latch after detection changes to hearing', () => {
  const observer = {
    document: { x: 0, y: 0, width: 1, height: 1 },
    actor: {
      system: { perception: { senses: [{ type: 'scent', range: 30 }] } },
      hasCondition: () => false,
    },
  };
  const target = {
    visible: false,
    renderable: false,
    document: { x: 100, y: 0, width: 1, height: 1, hidden: false },
    actor: { system: { traits: { value: [] } } },
    _pvPresenceOnlyRenderSuppression: { mode: 'scent', observerId: 'observer' },
  };

  const decision = buildSystemHiddenIndicatorDecision({
    observer,
    token: target,
    grid: { size: 100, distance: 5, measurePath: () => ({ distance: 1 }) },
    getVisibilityState: () => 'hidden',
    getDetectionBetween: () => ({ sense: 'hearing', isPrecise: false }),
    isScentBlocked: () => false,
  });

  expect(decision.shouldShowScentIndicator).toBe(false);
  expect(decision.shouldShowIndicator).toBe(false);
});

test.each(['scent', 'lifesense', 'thoughtsense'])('%s marker is not replaced by stale hearing while deafened', sense => {
  const observer = { distanceTo: () => 25, document: {},
    actor: { system: { perception: { senses: [{ type: sense, range: 30 }] } },
      hasCondition: condition => condition === 'deafened' } };
  const target = { visible: false, renderable: false, document: {},
    actor: { system: { traits: { value: [] } } },
    _pvPresenceOnlyRenderSuppression: { mode: sense, observerId: 'observer' } };
  const decision = buildSystemHiddenIndicatorDecision({ observer, token: target,
    getVisibilityState: () => 'hidden', getDetectionBetween: () => ({ sense: 'hearing', isPrecise: false }),
    canLifesenseDetect: () => true, canThoughtsenseDetect: () => true,
    isSoundBlocked: () => true, isScentBlocked: () => false });
  expect(decision).toMatchObject({ shouldShowIndicator: true, indicatorMode: sense });
});

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
    ).toBe(false);

    expect(
      shouldEvaluateSystemHiddenIndicators(
        getSystemHiddenSenseContext({
          actor: {
            system: { perception: { senses: [{ type: 'scent', range: 30 }] } },
            hasCondition: jest.fn((slug) => slug === 'deafened'),
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

  test('builds scent indicator decision for a deafened observer with no darkvision in the dark', () => {
    const observer = {
      document: { id: 'observer', x: 0, y: 0, width: 1, height: 1 },
      actor: {
        system: { perception: { senses: [{ type: 'scent', range: 30 }] } },
        hasCondition: jest.fn((slug) => slug === 'deafened'),
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
      }),
    ).toMatchObject({
      shouldShowIndicator: true,
      indicatorMode: 'scent',
      shouldShowScentIndicator: true,
      distanceInFeet: 25,
    });
  });

  test('replaces an AVS scent silhouette with a presence marker and clears it after visual reveal', () => {
    const observer = {
      actor: { system: { perception: { senses: [{ type: 'scent', range: 60 }] } } },
      distanceTo: () => 30,
    };
    const token = { visible: true, renderable: true, actor: { system: { traits: { value: [] } } } };
    const options = {
      observer, token,
      getVisibilityState: () => 'hidden',
      getDetectionBetween: () => ({ sense: 'scent', isPrecise: false }),
      isScentBlocked: () => false,
    };
    expect(buildSystemHiddenIndicatorDecision(options)).toMatchObject({
      shouldShowScentIndicator: true, indicatorMode: 'scent',
    });
    expect(buildSystemHiddenIndicatorDecision({ ...options, isScentBlocked: () => true }).shouldShowScentIndicator).toBe(false);
    token.visible = false;
    token.renderable = false;
    expect(buildSystemHiddenIndicatorDecision({ ...options, getVisibilityState: () => 'observed' }).shouldShowScentIndicator).toBe(false);
  });

  test('blocks every special-sense indicator for a Foundry-hidden target viewed by a player', () => {
    const observer = {
      document: { id: 'observer', x: 0, y: 0, width: 1, height: 1 },
      actor: {
        system: {
          perception: {
            senses: [
              { type: 'lifesense', range: 60 },
              { type: 'thoughtsense', range: 60 },
              { type: 'echolocation', acuity: 'precise', range: 60 },
              { type: 'scent', range: 60 },
            ],
          },
        },
        hasCondition: jest.fn((slug) => slug === 'blinded' || slug === 'deafened'),
      },
    };
    const target = {
      visible: false,
      renderable: false,
      document: { id: 'target', hidden: true, x: 250, y: 0, width: 1, height: 1 },
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
        getVisibilityState: jest.fn(() => 'hidden'),
        getDetectionBetween: jest.fn(() => ({
          sense: 'echolocation',
          isPrecise: true,
        })),
        isSoundBlocked: jest.fn(() => true),
        canLifesenseDetect: jest.fn(() => true),
        canThoughtsenseDetect: jest.fn(() => true),
        canScentDetect: jest.fn(() => true),
      }),
    ).toMatchObject({
      shouldShowIndicator: false,
      shouldShowLifesenseIndicator: false,
      shouldShowScentIndicator: false,
      shouldShowThoughtsenseIndicator: false,
      shouldShowEcholocationIndicator: false,
      shouldShowBlindDeafIndicator: false,
    });
  });

  test('blocks Foundry-hidden special-sense decisions in a GM observer perspective', () => {
    const observer = {
      document: { id: 'observer', x: 0, y: 0, width: 1, height: 1 },
      actor: {
        system: { perception: { senses: [{ type: 'scent', range: 30 }] } },
        hasCondition: jest.fn(() => false),
      },
    };
    const target = {
      visible: false,
      renderable: false,
      document: { id: 'target', hidden: true, x: 250, y: 0, width: 1, height: 1 },
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
      }),
    ).toMatchObject({
      shouldShowIndicator: false,
      shouldShowScentIndicator: false,
    });
  });

  test('does not build scent indicator when the target is outside scent range', () => {
    const observer = {
      document: { id: 'observer', x: 0, y: 0, width: 1, height: 1 },
      actor: {
        system: { perception: { senses: [{ type: 'scent', range: 10 }] } },
        hasCondition: jest.fn((slug) => slug === 'deafened'),
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
      }),
    ).toMatchObject({
      shouldShowIndicator: false,
      shouldShowScentIndicator: false,
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

  test('blinded and deafened do not add a border to a Hidden target', () => {
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
      shouldShowIndicator: false,
      shouldShowBlindDeafIndicator: false,
    });
  });

  function thoughtsenseObserver() {
    return {
      document: { id: 'observer', x: 0, y: 0, width: 1, height: 1 },
      distanceTo: jest.fn(() => 25),
      actor: {
        system: { perception: { senses: [{ type: 'thoughtsense', range: 60 }] } },
        hasCondition: jest.fn(() => false),
      },
    };
  }

  function thoughtsenseTarget({ visible = false } = {}) {
    return {
      visible,
      renderable: visible,
      document: { id: 'target', x: 250, y: 0, width: 1, height: 1 },
      actor: { system: { traits: { value: [] } } },
    };
  }

  test('builds presence-only thoughtsense indicator for a sound-blocked thoughtsensed target even when GM-visible', () => {
    const observer = thoughtsenseObserver();
    const target = thoughtsenseTarget({ visible: true });
    const isSoundBlocked = jest.fn(() => true);

    expect(
      buildSystemHiddenIndicatorDecision({
        observer,
        token: target,
        senseContext: getSystemHiddenSenseContext(observer),
        getVisibilityState: jest.fn(() => 'hidden'),
        isSoundBlocked,
        canThoughtsenseDetect: jest.fn(() => true),
      }),
    ).toMatchObject({
      shouldShowIndicator: true,
      indicatorMode: 'thoughtsense',
      shouldShowThoughtsenseIndicator: true,
    });
    expect(isSoundBlocked).toHaveBeenCalledWith(observer, target);
  });

  test('builds thoughtsense indicator for a system-hidden sound-blocked thoughtsensed target', () => {
    const observer = thoughtsenseObserver();
    const target = thoughtsenseTarget({ visible: false });

    expect(
      buildSystemHiddenIndicatorDecision({
        observer,
        token: target,
        senseContext: getSystemHiddenSenseContext(observer),
        isSoundBlocked: jest.fn(() => true),
        canThoughtsenseDetect: jest.fn(() => true),
      }),
    ).toMatchObject({
      shouldShowIndicator: true,
      indicatorMode: 'thoughtsense',
      shouldShowThoughtsenseIndicator: true,
    });
  });

  test('does not build thoughtsense indicator for an audible thoughtsensed target (soundwave wins)', () => {
    const observer = thoughtsenseObserver();
    const target = thoughtsenseTarget({ visible: false });

    expect(
      buildSystemHiddenIndicatorDecision({
        observer,
        token: target,
        senseContext: getSystemHiddenSenseContext(observer),
        getVisibilityState: jest.fn(() => 'hidden'),
        isSoundBlocked: jest.fn(() => false),
        canThoughtsenseDetect: jest.fn(() => true),
      }),
    ).toMatchObject({
      shouldShowIndicator: false,
      shouldShowThoughtsenseIndicator: false,
    });
  });

  test('does not build thoughtsense indicator for an observed target', () => {
    const observer = thoughtsenseObserver();
    const target = thoughtsenseTarget({ visible: true });

    expect(
      buildSystemHiddenIndicatorDecision({
        observer,
        token: target,
        senseContext: getSystemHiddenSenseContext(observer),
        getVisibilityState: jest.fn(() => 'observed'),
        isSoundBlocked: jest.fn(() => true),
        canThoughtsenseDetect: jest.fn(() => true),
      }),
    ).toMatchObject({
      shouldShowIndicator: false,
      shouldShowThoughtsenseIndicator: false,
    });
  });

  test('does not build thoughtsense indicator when the observer lacks thoughtsense', () => {
    const observer = {
      document: { id: 'observer', x: 0, y: 0, width: 1, height: 1 },
      distanceTo: jest.fn(() => 25),
      actor: {
        system: { perception: { senses: [{ type: 'lifesense', range: 60 }] } },
        hasCondition: jest.fn(() => false),
      },
    };
    const target = thoughtsenseTarget({ visible: false });

    expect(
      buildSystemHiddenIndicatorDecision({
        observer,
        token: target,
        senseContext: getSystemHiddenSenseContext(observer),
        getVisibilityState: jest.fn(() => 'hidden'),
        isSoundBlocked: jest.fn(() => true),
        canThoughtsenseDetect: jest.fn(() => true),
      }),
    ).toMatchObject({
      shouldShowThoughtsenseIndicator: false,
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

  test('keeps token art hidden while a scent marker hands off to hearing', async () => {
    const { updateSystemHiddenTokenHighlights } = await import(
      '../../../scripts/services/visual-effects.js'
    );

    const existingIndicator = {
      _pvObserverId: 'observer',
      _pvIndicatorMode: 'scent',
      destroy: jest.fn(),
      parent: { removeChild: jest.fn() },
    };
    const observer = global.createMockToken({ id: 'observer' });
    observer.actor.system.perception = { senses: [{ type: 'scent', range: 60 }] };
    observer.actor.hasCondition = jest.fn(() => false);
    observer.distanceTo = jest.fn(() => 30);
    observer.document.getFlag.mockImplementation((_module, key) => {
      if (key === 'visibilityV2') {
        return { target: { detectionState: 'hidden', detectionSense: 'hearing' } };
      }
      if (key === 'detection') return { target: { sense: 'hearing', isPrecise: false } };
      return null;
    });
    const hiddenTarget = global.createMockToken({ id: 'target' });
    hiddenTarget.visible = false;
    hiddenTarget.renderable = false;
    hiddenTarget.mesh = { visible: false, renderable: false, alpha: 0 };
    hiddenTarget.detectionFilter = { id: 'hearing-filter' };
    hiddenTarget.detectionFilterMesh = { visible: false, renderable: false, alpha: 0 };
    hiddenTarget._pvSystemHiddenIndicator = existingIndicator;
    hiddenTarget._pvPresenceOnlyRenderSuppression = {
      mode: 'scent',
      observerId: 'observer',
      expiresAt: Number.POSITIVE_INFINITY,
    };

    global.canvas.tokens.placeables = [observer, hiddenTarget];
    global.canvas.tokens.get = jest.fn((id) => (id === 'observer' ? observer : hiddenTarget));

    await updateSystemHiddenTokenHighlights('observer');

    expect(existingIndicator.destroy).toHaveBeenCalledTimes(1);
    expect(hiddenTarget._pvSystemHiddenIndicator).toBeNull();
    expect(hiddenTarget.visible).toBe(true);
    expect(hiddenTarget.renderable).toBe(true);
    expect(hiddenTarget.mesh).toMatchObject({ visible: false, renderable: false, alpha: 1 });
    expect(hiddenTarget.detectionFilter).toEqual({ id: 'hearing-filter' });
    expect(hiddenTarget.detectionFilterMesh).toMatchObject({
      visible: true,
      renderable: true,
      alpha: 1,
    });
  });

  test('removes a stale special-sense indicator when a GM target becomes Foundry hidden', async () => {
    const { updateSystemHiddenTokenHighlights } = await import(
      '../../../scripts/services/visual-effects.js'
    );

    global.game.user.isGM = true;
    const parent = { removeChild: jest.fn() };
    const existingIndicator = {
      _pvObserverId: 'observer',
      _pvIndicatorMode: 'scent',
      parent,
      destroy: jest.fn(),
    };
    const observer = {
      id: 'observer',
      document: { id: 'observer', x: 0, y: 0, width: 1, height: 1 },
      actor: {
        type: 'character',
        system: { perception: { senses: [{ type: 'scent', range: 60 }] } },
        hasCondition: jest.fn(() => false),
      },
      distanceTo: jest.fn(() => 30),
    };
    const hiddenTarget = {
      id: 'target',
      document: { id: 'target', hidden: true, x: 100, y: 0, width: 1, height: 1 },
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

    expect(parent.removeChild).toHaveBeenCalledWith(existingIndicator);
    expect(existingIndicator.destroy).toHaveBeenCalledTimes(1);
    expect(hiddenTarget._pvSystemHiddenIndicator).toBeNull();
  });

  test('GM Vision removes existing Visioner token indicators and restores normal rendering', async () => {
    const { updateSystemHiddenTokenHighlights } = await import(
      '../../../scripts/services/visual-effects.js'
    );

    global.canvas.ready = false;
    global.game.user.isGM = true;
    global.pf2eVisionerTestState.settings.pf2e = { gmVision: true };

    const parent = { removeChild: jest.fn() };
    const indicator = {
      _pvObserverId: 'observer',
      _pvIndicatorMode: 'lifesense',
      parent,
      destroy: jest.fn(),
    };
    const hiddenEcho = {
      parent,
      destroy: jest.fn(),
    };
    const target = {
      id: 'target',
      document: { id: 'target', hidden: false },
      visible: false,
      renderable: false,
      mesh: { visible: false, renderable: false, alpha: 0 },
      _pvCurrentViewHardHidden: true,
      _pvSystemHiddenIndicator: indicator,
      _pvHiddenEcho: hiddenEcho,
    };
    global.canvas.tokens.placeables = [target];

    await updateSystemHiddenTokenHighlights('observer');

    expect(indicator.destroy).toHaveBeenCalledTimes(1);
    expect(hiddenEcho.destroy).toHaveBeenCalledTimes(1);
    expect(target._pvSystemHiddenIndicator).toBeNull();
    expect(target._pvHiddenEcho).toBeNull();
    expect(target._pvCurrentViewHardHidden).toBe(false);
    expect(target.visible).toBe(true);
    expect(target.renderable).toBe(true);
    expect(target.mesh).toMatchObject({ visible: true, renderable: true, alpha: 1 });
  });

  test('AVS off with GM Vision off preserves manual Visioner hard-hide rendering', async () => {
    const { updateSystemHiddenTokenHighlights } = await import(
      '../../../scripts/services/visual-effects.js'
    );

    global.canvas.ready = false;
    global.game.user.isGM = true;
    global.pf2eVisionerTestState.settings['pf2e-visioner'].autoVisibilityEnabled = false;
    global.pf2eVisionerTestState.settings.pf2e = { gmVision: false };

    const target = {
      id: 'target',
      document: { id: 'target', hidden: false },
      visible: false,
      renderable: false,
      mesh: { visible: false, renderable: false, alpha: 0 },
      _pvCurrentViewHardHidden: true,
    };
    global.canvas.tokens.placeables = [target];

    await updateSystemHiddenTokenHighlights('observer');

    expect(target._pvCurrentViewHardHidden).toBe(true);
    expect(target.visible).toBe(false);
    expect(target.renderable).toBe(false);
    expect(target.mesh).toMatchObject({ visible: false, renderable: false, alpha: 0 });
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

describe('removeSystemHiddenIndicatorsForObservedTargets', () => {
  test('removes the indicator when its observer now observes the target', async () => {
    const removeSystemHiddenIndicator = jest.fn();
    const observer = { document: { id: 'observer' } };
    const target = {
      document: { id: 'target' },
      _pvSystemHiddenIndicator: { _pvObserverId: 'observer' },
    };

    const result = await removeSystemHiddenIndicatorsForObservedTargets({
      getTokens: () => [observer, target],
      getObserverById: (id) => (id === 'observer' ? observer : null),
      getVisibilityState: () => 'observed',
      loadVisualEffects: async () => ({ removeSystemHiddenIndicator }),
    });

    expect(removeSystemHiddenIndicator).toHaveBeenCalledWith(target, { forceTokenVisible: true });
    expect(result).toEqual({ removed: 1 });
  });

  test('keeps the indicator while the target stays hidden', async () => {
    const removeSystemHiddenIndicator = jest.fn();
    const observer = { document: { id: 'observer' } };
    const target = {
      document: { id: 'target' },
      _pvSystemHiddenIndicator: { _pvObserverId: 'observer' },
    };

    const result = await removeSystemHiddenIndicatorsForObservedTargets({
      getTokens: () => [observer, target],
      getObserverById: (id) => (id === 'observer' ? observer : null),
      getVisibilityState: () => 'hidden',
      loadVisualEffects: async () => ({ removeSystemHiddenIndicator }),
    });

    expect(removeSystemHiddenIndicator).not.toHaveBeenCalled();
    expect(result).toEqual({ removed: 0 });
  });

  test('ignores tokens without a system-hidden indicator', async () => {
    const removeSystemHiddenIndicator = jest.fn();
    const getVisibilityState = jest.fn(() => 'observed');

    const result = await removeSystemHiddenIndicatorsForObservedTargets({
      getTokens: () => [{ document: { id: 'plain' } }],
      getObserverById: () => ({ document: { id: 'observer' } }),
      getVisibilityState,
      loadVisualEffects: async () => ({ removeSystemHiddenIndicator }),
    });

    expect(getVisibilityState).not.toHaveBeenCalled();
    expect(removeSystemHiddenIndicator).not.toHaveBeenCalled();
    expect(result).toEqual({ removed: 0 });
  });
});
