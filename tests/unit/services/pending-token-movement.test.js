import '../../setup.js';

import { flushScheduledCanvasPerceptionUpdate } from '../../../scripts/helpers/perception-refresh.js';
import { rememberPendingPerceptionProfileWrite } from '../../../scripts/stores/visibility-profile-flag-persistence.js';
import { legacyVisibilityToProfile } from '../../../scripts/visibility/perception-profile.js';
import { LightingCalculator } from '../../../scripts/visibility/auto-visibility/LightingCalculator.js';
import { VisionAnalyzer } from '../../../scripts/visibility/auto-visibility/VisionAnalyzer.js';
import {
  clearPendingTokenMovementPosition,
  completePendingTokenMovement,
  getControlledObserverDetectionVisualTargetIds,
  getPendingMovementBlockContext,
  getPendingMovementPerformanceSnapshot,
  getPendingMovementRefreshTargetIds,
  getPendingTokenMovementPosition,
  primePendingControlledTokenDragIntent,
  refreshPendingControlledTokenDragIntent,
  releasePendingControlledTokenDragIntent,
  resetPendingMovementPerformanceCounters,
  schedulePendingTokenMovementCompletion,
  setPendingTokenMovementPosition,
  targetIsRenderHiddenForCurrentViewObserver,
  targetMustStayHiddenDuringPendingMovement,
} from '../../../scripts/services/PendingMovement/pending-token-movement.js';
import {
  getPendingMovementBlockedDetectionSources,
  shouldUseCoreDetectionDuringPendingMovement,
  shouldTemporarilyBlockHiddenDetection,
} from '../../../scripts/services/PendingMovement/pending-movement-detection-gate.js';
import { currentPendingMovementSightLineSeesTarget } from '../../../scripts/services/PendingMovement/pending-movement-sight-line.js';
import { withPendingMovementEvaluationCache } from '../../../scripts/services/PendingMovement/pending-movement-evaluation-cache.js';
import { lineIntersectsLimitedWall } from '../../../scripts/services/PendingMovement/pending-movement-wall-blocking.js';
import {
  scheduleAnimationRenderRefreshes,
  schedulePostCompletionRenderRefreshes,
} from '../../../scripts/services/PendingMovement/pending-movement-refresh-scheduler.js';
import {
  clearMovementPerformanceDiagnosticsEnabled,
  setMovementPerformanceDiagnosticsEnabled,
} from '../../../scripts/services/runtime-state.js';
import {
  clearNoObserverDetectionFilterVisuals,
  capturePendingMovementDetectionFilterState,
  forcePendingMovementTokenInvisible,
  forceTokenInvisibleForObserverVisibility,
  refreshPendingMovementTokenVisibility,
  restorePendingMovementDetectionFilterState,
  restorePendingMovementTokenRendering,
  shouldSuppressPendingMovementDetectionFilterVisuals,
  shouldTemporarilyForceTokenInvisible,
  suppressPendingMovementDetectionFilterVisualsForObservedTransition,
} from '../../../scripts/services/PendingMovement/pending-movement-render-lock.js';
import { primeSelectAllTokenVisibilityBypassFromKeyboard } from '../../../scripts/services/Detection/select-all-token-visibility-bypass.js';

function visibilityV2Map(map) {
  return Object.fromEntries(
    Object.entries(map).map(([targetId, state]) => [targetId, legacyVisibilityToProfile(state)]),
  );
}

function visibilityV2Flags(map) {
  return {
    'pf2e-visioner': {
      visibilityV2: visibilityV2Map(map),
    },
  };
}

const WALL_SENSE_TYPES = {
  NONE: 0,
  LIMITED: 10,
  NORMAL: 20,
  PROXIMITY: 30,
  DISTANCE: 40,
};

describe('pending token movement hidden detection guard', () => {
  let originalCanvas;
  let originalConst;

  beforeEach(() => {
    originalCanvas = global.canvas;
    originalConst = global.CONST;
    global.game.settings.set('pf2e', 'gmVision', false);
    global.game.settings.set('pf2e-visioner', 'autoVisibilityEnabled', false);
    global.canvas = {
      ...global.canvas,
      grid: { size: 50 },
      walls: {
        placeables: [
          {
            document: {
              id: 'wall',
              c: [100, 0, 100, 200],
              sight: 1,
              door: 0,
              ds: 0,
            },
          },
        ],
      },
    };
  });

  afterEach(() => {
    jest.useRealTimers();
    clearPendingTokenMovementPosition('observer');
    clearMovementPerformanceDiagnosticsEnabled();
    releasePendingControlledTokenDragIntent(null, { delayMs: 0 });
    global.game.user.id = undefined;
    global.game.user.isGM = true;
    global.game.settings.set('pf2e', 'gmVision', false);
    global.game.settings.set('pf2e-visioner', 'autoVisibilityEnabled', false);
    global.canvas = originalCanvas;
    if (originalConst === undefined) delete global.CONST;
    else global.CONST = originalConst;
  });

  test('does not guard hidden detection without a pending controlled-token movement', () => {
    const observer = createMockToken({ id: 'observer', x: 0, y: 0 });
    const target = createMockToken({ id: 'target', x: 3, y: 0 });

    expect(shouldTemporarilyBlockHiddenDetection(observer, target, 'hidden')).toBe(false);
  });

  test('collects hidden targets for controlled observer selection refresh', () => {
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({
        hiddenTarget: 'hidden',
        undetectedTarget: 'undetected',
        observedTarget: 'observed',
      }),
    });
    const hiddenTarget = createMockToken({ id: 'hiddenTarget' });
    const undetectedTarget = createMockToken({ id: 'undetectedTarget' });
    const observedTarget = createMockToken({ id: 'observedTarget' });
    global.canvas.tokens = {
      get: jest.fn((id) =>
        id === 'observer'
          ? observer
          : id === 'hiddenTarget'
            ? hiddenTarget
            : id === 'undetectedTarget'
              ? undetectedTarget
              : id === 'observedTarget'
                ? observedTarget
                : null,
      ),
      controlled: [observer],
      placeables: [observer, hiddenTarget, undetectedTarget, observedTarget],
    };

    expect(getControlledObserverDetectionVisualTargetIds(observer)).toEqual([
      'hiddenTarget',
      'undetectedTarget',
    ]);
  });

  test('does not let an unrelated active source render-hide the current GM view', () => {
    const hiddenObserver = createMockToken({
      id: 'hidden-observer',
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const currentObserver = createMockToken({
      id: 'current-observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'observed' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: new Map([
          ['hidden-observer', { active: true, object: hiddenObserver }],
        ]),
        lightSources: new Map(),
      },
      tokens: {
        get: jest.fn((id) =>
          id === 'hidden-observer'
            ? hiddenObserver
            : id === 'current-observer'
              ? currentObserver
              : id === 'target'
                ? target
                : null,
        ),
        controlled: [currentObserver],
        placeables: [hiddenObserver, currentObserver, target],
      },
    };

    expect(targetIsRenderHiddenForCurrentViewObserver(target)).toBe(false);
  });

  test('render-hides only from the dragged or controlled observer perspective', () => {
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    expect(targetIsRenderHiddenForCurrentViewObserver(target)).toBe(true);
  });

  test('GM Vision bypasses AVS render hiding for controlled observer view', () => {
    global.game.user.isGM = true;
    global.game.settings.set('pf2e-visioner', 'autoVisibilityEnabled', true);
    global.game.settings.set('pf2e', 'gmVision', true);
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer]);

    expect(targetIsRenderHiddenForCurrentViewObserver(target)).toBe(false);
    expect(targetMustStayHiddenDuringPendingMovement(target)).toBe(false);
    expect(shouldTemporarilyForceTokenInvisible(target)).toBe(false);
    expect(forceTokenInvisibleForObserverVisibility(observer, target, 'undetected')).toBe(false);
    expect(target.visible).toBe(true);
    expect(target.renderable).toBe(true);
    expect(target.mesh).toMatchObject({ visible: true, renderable: true, alpha: 1 });
  });

  test('keeps GM-visible Foundry-hidden token under core rendering', () => {
    global.game.user.isGM = true;
    const observer = createMockToken({ id: 'observer', controlled: true });
    const target = createMockToken({ id: 'target', hidden: true, visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 0.5 };
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer]);

    expect(targetIsRenderHiddenForCurrentViewObserver(target)).toBe(false);
    expect(targetMustStayHiddenDuringPendingMovement(target)).toBe(false);
    expect(shouldTemporarilyForceTokenInvisible(target)).toBe(false);
    expect(target.visible).toBe(true);
    expect(target.renderable).toBe(true);
    expect(target.mesh).toMatchObject({ visible: true, renderable: true, alpha: 0.5 });
  });

  test('keeps Foundry-hidden token render-hidden for player clients', () => {
    global.game.user.isGM = false;
    const observer = createMockToken({ id: 'observer', controlled: true });
    const target = createMockToken({ id: 'target', hidden: true, visible: false });
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer]);

    expect(targetIsRenderHiddenForCurrentViewObserver(target)).toBe(true);
    expect(targetMustStayHiddenDuringPendingMovement(target)).toBe(true);
    expect(shouldTemporarilyForceTokenInvisible(target)).toBe(true);
  });

  test('does not render-hide from controlled observer during select-all visibility bypass', () => {
    jest.useFakeTimers();
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    global.canvas = {
      ...global.canvas,
      activeLayer: null,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        controlled: [observer],
        placeables: [observer, target],
      },
    };
    global.canvas.activeLayer = global.canvas.tokens;

    expect(
      primeSelectAllTokenVisibilityBypassFromKeyboard({
        ctrlKey: true,
        key: 'a',
        target: document.body,
      }),
    ).toBe(true);

    expect(targetIsRenderHiddenForCurrentViewObserver(target)).toBe(false);

    jest.advanceTimersByTime(100);
  });

  test('does not render-hide from controlled observer during multi-token selection', () => {
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const selectedTarget = createMockToken({ id: 'selected-target', controlled: true });
    const target = createMockToken({ id: 'target', visible: true });
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) =>
          id === 'observer' ? observer : id === 'selected-target' ? selectedTarget : target,
        ),
        controlled: [observer, selectedTarget],
        placeables: [observer, selectedTarget, target],
      },
    };

    expect(targetIsRenderHiddenForCurrentViewObserver(target)).toBe(false);
  });

  test('keeps render-hidden target locked until current core polygon reaches predicted observed target', () => {
    let currentCorePolygonContainsTarget = false;
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: new Map([
          [
            'observer',
            {
              active: true,
              object: observer,
              los: { contains: jest.fn(() => currentCorePolygonContainsTarget) },
              shape: { contains: jest.fn(() => currentCorePolygonContainsTarget) },
            },
          ],
        ]),
        lightSources: new Map(),
      },
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer], {
      finalVisibilityStatesByTargetId: { target: 'observed' },
    });

    expect(targetIsRenderHiddenForCurrentViewObserver(target)).toBe(true);

    currentCorePolygonContainsTarget = true;

    expect(targetIsRenderHiddenForCurrentViewObserver(target)).toBe(false);
  });

  test('uses current core polygon for active drag reveal before final prediction exists', () => {
    let currentCorePolygonContainsTarget = false;
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: new Map([
          [
            'observer',
            {
              active: true,
              object: observer,
              los: { contains: jest.fn(() => currentCorePolygonContainsTarget) },
              shape: { contains: jest.fn(() => currentCorePolygonContainsTarget) },
            },
          ],
        ]),
        lightSources: new Map(),
      },
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    expect(targetIsRenderHiddenForCurrentViewObserver(target)).toBe(true);

    currentCorePolygonContainsTarget = true;

    expect(targetIsRenderHiddenForCurrentViewObserver(target)).toBe(false);
  });

  test('keeps post-completion observed render visible while flag write is still pending', () => {
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: new Map([
          [
            'observer',
            {
              active: true,
              object: observer,
              los: { contains: jest.fn(() => true) },
              shape: { contains: jest.fn(() => true) },
            },
          ],
        ]),
        lightSources: new Map(),
      },
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer], {
      finalVisibilityStatesByTargetId: { target: 'observed' },
    });
    completePendingTokenMovement(observer.document);

    expect(targetIsRenderHiddenForCurrentViewObserver(target)).toBe(false);
  });

  test('keeps observed target visible until current core polygon loses predicted undetected target', () => {
    let currentCorePolygonContainsTarget = true;
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'observed' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: new Map([
          [
            'observer',
            {
              active: true,
              object: observer,
              los: { contains: jest.fn(() => currentCorePolygonContainsTarget) },
              shape: { contains: jest.fn(() => currentCorePolygonContainsTarget) },
            },
          ],
        ]),
        lightSources: new Map(),
      },
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer], {
      finalVisibilityStatesByTargetId: { target: 'undetected' },
    });

    expect(targetIsRenderHiddenForCurrentViewObserver(target)).toBe(false);

    currentCorePolygonContainsTarget = false;

    expect(targetIsRenderHiddenForCurrentViewObserver(target)).toBe(true);
  });

  test('keeps concealed target from gaining hidden soundwave until current core polygon loses it', () => {
    let currentCorePolygonContainsTarget = true;
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'concealed' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: new Map([
          [
            'observer',
            {
              active: true,
              object: observer,
              los: { contains: jest.fn(() => currentCorePolygonContainsTarget) },
              shape: { contains: jest.fn(() => currentCorePolygonContainsTarget) },
            },
          ],
        ]),
        lightSources: new Map(),
      },
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer], {
      finalVisibilityStatesByTargetId: { target: 'hidden' },
    });

    expect(getPendingMovementBlockContext(observer, target).visibilityState).toBe('concealed');
    expect(shouldSuppressPendingMovementDetectionFilterVisuals(target)).toBe(true);

    currentCorePolygonContainsTarget = false;

    expect(getPendingMovementBlockContext(observer, target).visibilityState).toBe('hidden');
  });

  test('keeps movement-start observed state when live flags flip to final undetected early', () => {
    let currentCorePolygonContainsTarget = true;
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'observed' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: new Map([
          [
            'observer',
            {
              active: true,
              object: observer,
              los: { contains: jest.fn(() => currentCorePolygonContainsTarget) },
              shape: { contains: jest.fn(() => currentCorePolygonContainsTarget) },
            },
          ],
        ]),
        lightSources: new Map(),
      },
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer], {
      finalVisibilityStatesByTargetId: { target: 'undetected' },
    });
    observer.document.flags = visibilityV2Flags({ target: 'undetected' })['pf2e-visioner'];
    observer.document.getFlag.mockImplementation((moduleId, key) => {
      if (moduleId !== 'pf2e-visioner') return null;
      return observer.document.flags?.[key] ?? null;
    });

    expect(targetIsRenderHiddenForCurrentViewObserver(target)).toBe(false);

    currentCorePolygonContainsTarget = false;

    expect(targetIsRenderHiddenForCurrentViewObserver(target)).toBe(true);
  });

  test('preserves first movement-start visibility across repeated drag position updates', () => {
    let currentCorePolygonContainsTarget = true;
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'observed' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: new Map([
          [
            'observer',
            {
              active: true,
              object: observer,
              los: { contains: jest.fn(() => currentCorePolygonContainsTarget) },
              shape: { contains: jest.fn(() => currentCorePolygonContainsTarget) },
            },
          ],
        ]),
        lightSources: new Map(),
      },
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer], {
      finalVisibilityStatesByTargetId: { target: 'undetected' },
    });
    observer.document.flags = visibilityV2Flags({ target: 'undetected' })['pf2e-visioner'];

    setPendingTokenMovementPosition(observer.document, { x: 150, y: 0 }, [observer], {
      finalVisibilityStatesByTargetId: { target: 'undetected' },
    });

    expect(targetIsRenderHiddenForCurrentViewObserver(target)).toBe(false);

    currentCorePolygonContainsTarget = false;

    expect(targetIsRenderHiddenForCurrentViewObserver(target)).toBe(true);
  });

  test('keeps recent observed state when fast reverse starts before flag writes settle', () => {
    let currentCorePolygonContainsTarget = true;
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: new Map([
          [
            'observer',
            {
              active: true,
              object: observer,
              los: { contains: jest.fn(() => currentCorePolygonContainsTarget) },
              shape: { contains: jest.fn(() => currentCorePolygonContainsTarget) },
            },
          ],
        ]),
        lightSources: new Map(),
      },
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer], {
      finalVisibilityStatesByTargetId: { target: 'observed' },
    });
    completePendingTokenMovement(observer.document);
    observer.document.flags = visibilityV2Flags({ target: 'undetected' })['pf2e-visioner'];
    observer.document.getFlag.mockImplementation((moduleId, key) => {
      if (moduleId !== 'pf2e-visioner') return null;
      return observer.document.flags?.[key] ?? null;
    });

    setPendingTokenMovementPosition(observer.document, { x: 200, y: 0 }, [observer], {
      finalVisibilityStatesByTargetId: { target: 'undetected' },
    });

    expect(targetIsRenderHiddenForCurrentViewObserver(target)).toBe(false);

    currentCorePolygonContainsTarget = false;

    expect(targetIsRenderHiddenForCurrentViewObserver(target)).toBe(true);
  });

  test('does not render-hide an already visible target until current core polygon loses it', () => {
    let currentCorePolygonContainsTarget = true;
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.visible = true;
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: new Map([
          [
            'observer',
            {
              active: true,
              object: observer,
              los: { contains: jest.fn(() => currentCorePolygonContainsTarget) },
              shape: { contains: jest.fn(() => currentCorePolygonContainsTarget) },
            },
          ],
        ]),
        lightSources: new Map(),
      },
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer], {
      finalVisibilityStatesByTargetId: { target: 'undetected' },
    });

    expect(targetIsRenderHiddenForCurrentViewObserver(target)).toBe(false);

    currentCorePolygonContainsTarget = false;

    expect(targetIsRenderHiddenForCurrentViewObserver(target)).toBe(true);
  });

  test('treats currently core-visible stale undetected target as observed for block context', () => {
    let currentCorePolygonContainsTarget = true;
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: new Map([
          [
            'observer',
            {
              active: true,
              object: observer,
              los: { contains: jest.fn(() => currentCorePolygonContainsTarget) },
              shape: { contains: jest.fn(() => currentCorePolygonContainsTarget) },
            },
          ],
        ]),
        lightSources: new Map(),
      },
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer], {
      finalVisibilityStatesByTargetId: { target: 'undetected' },
    });
    observer.x = 50;
    observer.y = 0;

    expect(targetIsRenderHiddenForCurrentViewObserver(target)).toBe(false);

    const context = getPendingMovementBlockContext(observer, target);
    expect(context.visibilityState).toBe('observed');
    expect(context.renderHiddenByVisioner).toBe(false);
    expect(shouldTemporarilyForceTokenInvisible(target)).toBe(false);

    currentCorePolygonContainsTarget = false;

    expect(targetIsRenderHiddenForCurrentViewObserver(target)).toBe(true);
  });

  test('keeps controlled drag intent core-visible target observed during mouse-up handoff', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: new Map([
          [
            'observer',
            {
              active: true,
              object: observer,
              los: { contains: jest.fn(() => true) },
              shape: { contains: jest.fn(() => true) },
            },
          ],
        ]),
        lightSources: new Map(),
      },
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    primePendingControlledTokenDragIntent(observer);
    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer], {
      finalVisibilityStatesByTargetId: { target: 'undetected' },
    });

    const context = getPendingMovementBlockContext(observer, target);
    expect(context.visibilityState).toBe('observed');
    expect(targetIsRenderHiddenForCurrentViewObserver(target)).toBe(false);
    expect(shouldTemporarilyForceTokenInvisible(target)).toBe(false);
  });

  test('preserves hidden soundwave visuals through pending visibilityV2 write overlay', () => {
    const observer = createMockToken({ id: 'observer' });
    const target = createMockToken({ id: 'target', controlled: false });
    observer.document.getFlag.mockImplementation((moduleId, key) => {
      if (moduleId === 'pf2e-visioner' && key === 'visibilityV2') return {};
      return null;
    });
    target.detectionFilter = { id: 'soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas.tokens = {
      ...global.canvas.tokens,
      placeables: [observer, target],
    };

    rememberPendingPerceptionProfileWrite(observer, visibilityV2Map({ target: 'hidden' }));

    expect(capturePendingMovementDetectionFilterState(target)).toEqual({
      hadDetectionFilter: true,
      detectionFilter: { id: 'soundwave-filter' },
      detectionFilterMesh: expect.objectContaining({
        visible: true,
        renderable: true,
        alpha: 1,
      }),
    });
  });

  test('guards hidden detection when pending movement crosses a sight-blocking wall', () => {
    const observer = createMockToken({ id: 'observer', x: 0, y: 0 });
    const target = createMockToken({ id: 'target', x: 3, y: 0 });
    const tokenDoc = {
      id: 'observer',
      x: 0,
      y: 0,
    };

    setPendingTokenMovementPosition(tokenDoc, { x: 0, y: 0 }, [observer]);

    expect(shouldTemporarilyBlockHiddenDetection(observer, target, 'hidden')).toBe(true);
  });

  test('guards hidden detection when document already reached destination but token visual is still at start', () => {
    const observer = createMockToken({ id: 'observer', x: 0, y: 0 });
    observer.document.object = observer;
    observer.document.x = 150;
    observer.document.y = 0;
    observer.x = 0;
    observer.y = 0;
    const target = createMockToken({ id: 'target', x: 3, y: 0 });

    setPendingTokenMovementPosition(observer.document, { x: 150, y: 0 }, [observer]);

    expect(shouldTemporarilyBlockHiddenDetection(observer, target, 'hidden')).toBe(true);
  });

  test('guards hidden detection when a waypoint crosses a wall even if the final point is clear', () => {
    const observer = createMockToken({ id: 'observer', x: 3, y: 3 });
    const target = createMockToken({ id: 'target', x: 3, y: 0 });

    setPendingTokenMovementPosition(
      observer.document,
      { x: 150, y: 50 },
      [observer],
      {
        waypoints: [{ x: 0, y: 0 }],
      },
    );

    expect(shouldTemporarilyBlockHiddenDetection(observer, target, 'hidden')).toBe(true);
  });

  test('caps route point checks for long waypoint movement', () => {
    let sightReads = 0;
    global.canvas.walls.placeables = [
      {
        document: {
          id: 'far-wall',
          c: [10000, 0, 10000, 100],
          get sight() {
            sightReads += 1;
            return 1;
          },
          door: 0,
          ds: 0,
        },
      },
    ];
    const observer = createMockToken({ id: 'observer', x: 0, y: 5 });
    const target = createMockToken({ id: 'target', x: 0, y: 0 });
    const waypoints = Array.from({ length: 120 }, (_, index) => ({
      x: (index + 1) * 50,
      y: 250,
    }));

    setPendingTokenMovementPosition(
      observer.document,
      { x: 6100, y: 250 },
      [observer],
      { waypoints },
    );

    expect(shouldTemporarilyBlockHiddenDetection(observer, target, 'hidden')).toBe(false);
    expect(sightReads).toBeLessThanOrEqual(96);
  });

  test('reuses route wall-block result across repeated checks for unchanged movement', () => {
    let sightReads = 0;
    global.canvas.walls.placeables = [
      {
        document: {
          id: 'open-sight-wall',
          c: [100, -10000, 100, 10000],
          get sight() {
            sightReads += 1;
            return 0;
          },
          door: 0,
          ds: 0,
        },
      },
    ];
    const observer = createMockToken({ id: 'observer', x: 0, y: 5 });
    const target = createMockToken({ id: 'target', x: 0, y: 0 });
    const waypoints = Array.from({ length: 120 }, (_, index) => ({
      x: (index + 1) * 50,
      y: 250,
    }));

    setPendingTokenMovementPosition(
      observer.document,
      { x: 6100, y: 250 },
      [observer],
      { waypoints },
    );

    expect(shouldTemporarilyBlockHiddenDetection(observer, target, 'hidden')).toBe(false);
    const firstReadCount = sightReads;
    expect(firstReadCount).toBeGreaterThan(0);

    expect(shouldTemporarilyBlockHiddenDetection(observer, target, 'hidden')).toBe(false);
    expect(sightReads).toBe(firstReadCount);
  });

  test('does not rescan wall geometry after cached route wall-block result', () => {
    let geometryReads = 0;
    global.canvas.walls.placeables = Array.from({ length: 1000 }, (_, index) => ({
      document: {
        id: `wall-${index}`,
        get c() {
          geometryReads += 1;
          return [10000 + index, 0, 10000 + index, 100];
        },
        sight: 1,
        sound: 1,
        door: 0,
        ds: 0,
      },
    }));
    const observer = createMockToken({ id: 'observer', x: 0, y: 5 });
    const target = createMockToken({ id: 'target', x: 0, y: 0 });
    const waypoints = Array.from({ length: 120 }, (_, index) => ({
      x: (index + 1) * 50,
      y: 250,
    }));

    setPendingTokenMovementPosition(
      observer.document,
      { x: 6100, y: 250 },
      [observer],
      { waypoints },
    );

    expect(shouldTemporarilyBlockHiddenDetection(observer, target, 'hidden')).toBe(false);
    const firstGeometryReadCount = geometryReads;
    expect(firstGeometryReadCount).toBeGreaterThan(0);

    expect(shouldTemporarilyBlockHiddenDetection(observer, target, 'hidden')).toBe(false);
    expect(geometryReads).toBe(firstGeometryReadCount);
  });

  test('does not rescan sound wall geometry after cached wall-blocked context', () => {
    let geometryReads = 0;
    global.canvas.walls.placeables = Array.from({ length: 1000 }, (_, index) => ({
      document: {
        id: `wall-${index}`,
        get c() {
          geometryReads += 1;
          return index === 0 ? [100, 0, 100, 200] : [10000 + index, 0, 10000 + index, 100];
        },
        sight: 1,
        sound: 0,
        door: 0,
        ds: 0,
      },
    }));
    const observer = createMockToken({ id: 'observer', x: 0, y: 0 });
    const target = createMockToken({ id: 'target', x: 3, y: 0 });

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);

    const context = getPendingMovementBlockContext(observer, target);
    expect(context.wallBlocked).toBe(true);
    expect(context.wallDetectionBlocked).toBe(false);
    const firstGeometryReadCount = geometryReads;
    expect(firstGeometryReadCount).toBeGreaterThan(0);

    const cachedContext = getPendingMovementBlockContext(observer, target);
    expect(cachedContext.wallBlocked).toBe(true);
    expect(cachedContext.wallDetectionBlocked).toBe(false);
    expect(geometryReads).toBe(firstGeometryReadCount);
  });

  test('caps total route point checks across simultaneous movement', () => {
    let sightReads = 0;
    global.canvas.walls.placeables = [
      {
        document: {
          id: 'far-wall',
          c: [10000, 0, 10000, 100],
          get sight() {
            sightReads += 1;
            return 1;
          },
          door: 0,
          ds: 0,
        },
      },
    ];
    const target = createMockToken({ id: 'target', x: 0, y: 0 });
    const observers = Array.from({ length: 4 }, (_, index) =>
      createMockToken({ id: `observer-${index}`, x: 0, y: index + 5 }),
    );
    const waypoints = Array.from({ length: 120 }, (_, index) => ({
      x: (index + 1) * 50,
      y: 250,
    }));

    try {
      for (const observer of observers) {
        setPendingTokenMovementPosition(
          observer.document,
          { x: 6100, y: observer.document.y * 50 },
          [observer],
          { waypoints },
        );
      }

      expect(
        getPendingMovementBlockedDetectionSources(target, {
          visionSources: observers.map((observer) => ({ active: true, object: observer })),
          lightSources: [],
        }),
      ).toEqual([]);
      expect(sightReads).toBeLessThanOrEqual(256);
    } finally {
      for (const observer of observers) {
        clearPendingTokenMovementPosition(observer.id);
      }
    }
  });

  test('treats active LOS polygon as observed through the first limited sight wall', () => {
    global.CONST = {
      ...(global.CONST || {}),
      WALL_SENSE_TYPES,
      EDGE_SENSE_TYPES: WALL_SENSE_TYPES,
    };
    global.canvas.walls.placeables = [
      createMockWall({
        id: 'terrain-wall',
        c: [100, 0, 100, 200],
        sight: WALL_SENSE_TYPES.LIMITED,
        sound: WALL_SENSE_TYPES.NONE,
      }),
    ];
    const observer = createMockToken({ id: 'observer', x: 0, y: 0 });
    const target = createMockToken({ id: 'target', x: 3, y: 0 });
    target.document.getVisibilityTestPoints = jest.fn(() => [{ x: 175, y: 25 }]);
    global.canvas.effects = {
      visionSources: [
        {
          active: true,
          object: observer,
          los: { contains: jest.fn(() => true) },
        },
      ],
      lightSources: [],
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);

    expect(currentPendingMovementSightLineSeesTarget(observer, target)).toBe(true);
  });

  test('reuses current sight-line evaluation inside one pending movement cache scope', () => {
    global.canvas.walls.placeables = [
      createMockWall({
        id: 'sight-wall',
        c: [100, -50, 100, 100],
        sight: WALL_SENSE_TYPES.NORMAL,
      }),
    ];
    const observer = createMockToken({ id: 'observer', x: 0, y: 0 });
    const target = createMockToken({ id: 'target', x: 3, y: 0 });
    const los = { contains: jest.fn(() => true) };
    target.document.getVisibilityTestPoints = jest.fn(() => [target.center]);
    global.canvas.effects = {
      visionSources: [
        {
          active: true,
          object: observer,
          los,
        },
      ],
      lightSources: [],
    };

    withPendingMovementEvaluationCache(() => {
      expect(currentPendingMovementSightLineSeesTarget(observer, target)).toBe(true);
      expect(currentPendingMovementSightLineSeesTarget(observer, target)).toBe(true);
    });

    expect(target.document.getVisibilityTestPoints).toHaveBeenCalledTimes(1);

    los.contains.mockReturnValue(false);
    target.document.getVisibilityTestPoints = jest.fn(() => [target.center]);

    expect(currentPendingMovementSightLineSeesTarget(observer, target)).toBe(false);
    expect(target.document.getVisibilityTestPoints).toHaveBeenCalledTimes(1);
  });

  test('treats core LOS polygon miss as unseen during pending movement', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.detectionFilter = { id: 'soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: [
          {
            active: true,
            object: observer,
            los: { contains: jest.fn(() => false) },
            shape: { contains: jest.fn(() => false) },
          },
        ],
        lightSources: [],
      },
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer]);

    expect(currentPendingMovementSightLineSeesTarget(observer, target)).toBe(false);
    expect(shouldSuppressPendingMovementDetectionFilterVisuals(target)).toBe(false);
  });

  test('reuses active sight source lookup for one observer across targets in one cache scope', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({ id: 'observer', x: 0, y: 0 });
    const firstTarget = createMockToken({ id: 'first-target', x: 3, y: 0 });
    const secondTarget = createMockToken({ id: 'second-target', x: 4, y: 0 });
    let sourceIterations = 0;
    global.canvas.effects = {
      visionSources: {
        *[Symbol.iterator]() {
          sourceIterations += 1;
          yield {
            active: true,
            object: observer,
            los: { contains: jest.fn(() => true) },
          };
        },
      },
      lightSources: [],
    };

    withPendingMovementEvaluationCache(() => {
      expect(currentPendingMovementSightLineSeesTarget(observer, firstTarget)).toBe(true);
      expect(currentPendingMovementSightLineSeesTarget(observer, secondTarget)).toBe(true);
    });

    expect(sourceIterations).toBe(1);

    expect(currentPendingMovementSightLineSeesTarget(observer, firstTarget)).toBe(true);
    expect(sourceIterations).toBe(2);
  });

  test('reuses source-list conversion inside one pending movement cache scope', () => {
    const observer = createMockToken({ id: 'observer', x: 0, y: 0 });
    const target = createMockToken({ id: 'target', x: 3, y: 0 });
    let sourceIterations = 0;
    const visionSources = {
      *[Symbol.iterator]() {
        sourceIterations += 1;
        yield { active: true, object: observer };
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);

    withPendingMovementEvaluationCache(() => {
      expect(
        getPendingMovementBlockedDetectionSources(target, {
          visionSources,
          lightSources: [],
        }),
      ).toHaveLength(1);
      expect(
        getPendingMovementBlockedDetectionSources(target, {
          visionSources,
          lightSources: [],
        }),
      ).toHaveLength(1);
    });

    expect(sourceIterations).toBe(1);
  });

  test('does not treat active LOS polygon as observed through a second limited sight wall', () => {
    global.CONST = {
      ...(global.CONST || {}),
      WALL_SENSE_TYPES,
      EDGE_SENSE_TYPES: WALL_SENSE_TYPES,
    };
    global.canvas.walls.placeables = [
      createMockWall({
        id: 'near-terrain-wall',
        c: [100, 0, 100, 200],
        sight: WALL_SENSE_TYPES.LIMITED,
        sound: WALL_SENSE_TYPES.NONE,
      }),
      createMockWall({
        id: 'far-terrain-wall',
        c: [200, 0, 200, 200],
        sight: WALL_SENSE_TYPES.LIMITED,
        sound: WALL_SENSE_TYPES.NONE,
      }),
    ];
    const observer = createMockToken({ id: 'observer', x: 0, y: 0 });
    const target = createMockToken({ id: 'target', x: 5, y: 0 });
    target.document.getVisibilityTestPoints = jest.fn(() => [{ x: 275, y: 25 }]);
    global.canvas.effects = {
      visionSources: [
        {
          active: true,
          object: observer,
          los: { contains: jest.fn(() => true) },
        },
      ],
      lightSources: [],
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);

    expect(currentPendingMovementSightLineSeesTarget(observer, target)).toBe(false);
  });

  test('allows active LOS polygon through proximity sight walls inside threshold', () => {
    global.CONST = {
      ...(global.CONST || {}),
      WALL_SENSE_TYPES,
      EDGE_SENSE_TYPES: WALL_SENSE_TYPES,
    };
    global.canvas.scene.grid.distance = 5;
    global.canvas.walls.placeables = [
      {
        document: {
          id: 'proximity-wall',
          c: [50, 0, 50, 200],
          sight: WALL_SENSE_TYPES.PROXIMITY,
          sound: WALL_SENSE_TYPES.NONE,
          threshold: { sight: 3 },
          door: 0,
          ds: 0,
        },
      },
    ];
    const observer = createMockToken({ id: 'observer', x: 0, y: 0 });
    const target = createMockToken({ id: 'target', x: 2, y: 0 });
    target.document.getVisibilityTestPoints = jest.fn(() => [{ x: 125, y: 25 }]);
    global.canvas.effects = {
      visionSources: [
        {
          active: true,
          object: observer,
          los: { contains: jest.fn(() => true) },
        },
      ],
      lightSources: [],
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);

    expect(currentPendingMovementSightLineSeesTarget(observer, target)).toBe(true);
  });

  test('blocks active LOS polygon through proximity sight walls outside threshold', () => {
    global.CONST = {
      ...(global.CONST || {}),
      WALL_SENSE_TYPES,
      EDGE_SENSE_TYPES: WALL_SENSE_TYPES,
    };
    global.canvas.scene.grid.distance = 5;
    global.canvas.walls.placeables = [
      {
        document: {
          id: 'proximity-wall',
          c: [100, 0, 100, 200],
          sight: WALL_SENSE_TYPES.PROXIMITY,
          sound: WALL_SENSE_TYPES.NONE,
          threshold: { sight: 1 },
          door: 0,
          ds: 0,
        },
      },
    ];
    const observer = createMockToken({ id: 'observer', x: 0, y: 0 });
    const target = createMockToken({ id: 'target', x: 3, y: 0 });
    target.document.getVisibilityTestPoints = jest.fn(() => [{ x: 175, y: 25 }]);
    global.canvas.effects = {
      visionSources: [
        {
          active: true,
          object: observer,
          los: { contains: jest.fn(() => true) },
        },
      ],
      lightSources: [],
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);

    expect(currentPendingMovementSightLineSeesTarget(observer, target)).toBe(false);
  });

  test('does not block hearing through limited sound walls during final movement prediction', () => {
    global.CONST = {
      ...(global.CONST || {}),
      WALL_SENSE_TYPES,
      EDGE_SENSE_TYPES: WALL_SENSE_TYPES,
    };
    global.canvas.walls.placeables = [
      createMockWall({
        id: 'limited-sound-wall',
        c: [100, 0, 100, 200],
        sight: WALL_SENSE_TYPES.NORMAL,
        sound: WALL_SENSE_TYPES.LIMITED,
      }),
    ];
    const observer = createMockToken({
      id: 'observer',
      x: 0,
      y: 0,
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    observer._animation = { state: 'running', promise: Promise.resolve() };
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer], {
      predictFinalVisibility: () => new Promise(() => { }),
    });

    expect(shouldUseCoreDetectionDuringPendingMovement(observer, target)).toBe(true);
    expect(shouldTemporarilyForceTokenInvisible(target)).toBe(false);
  });

  test('limits pending movement hearing from the pending observer position', () => {
    global.CONST = {
      ...(global.CONST || {}),
      WALL_SENSE_TYPES,
      EDGE_SENSE_TYPES: WALL_SENSE_TYPES,
    };
    global.canvas.scene = {
      ...(global.canvas.scene || {}),
      id: 'active-scene',
      grid: { distance: 5 },
      flags: { pf2e: { hearingRange: 10 } },
    };
    global.canvas.walls.placeables = [
      createMockWall({
        id: 'sight-wall-open-sound',
        c: [0, -100, 0, 200],
        sight: WALL_SENSE_TYPES.NORMAL,
        sound: WALL_SENSE_TYPES.NONE,
      }),
    ];
    const observer = createMockToken({
      id: 'observer',
      x: 0,
      y: 0,
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', x: 2, y: 0, visible: true });
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: -150, y: 0 }, [observer], {
      predictFinalVisibility: () => new Promise(() => { }),
    });

    const context = getPendingMovementBlockContext(observer, target);

    expect(context.wallBlocked).toBe(true);
    expect(context.soundBlocked).toBe(true);
    expect(context.wallDetectionBlocked).toBe(true);
  });

  test('keeps hidden soundwave visible while dragging past limited sound but blocked sight', () => {
    global.CONST = {
      ...(global.CONST || {}),
      WALL_SENSE_TYPES,
      EDGE_SENSE_TYPES: WALL_SENSE_TYPES,
    };
    global.canvas.walls.placeables = [
      createMockWall({
        id: 'limited-sight-sound-wall',
        c: [100, 0, 100, 200],
        sight: WALL_SENSE_TYPES.LIMITED,
        sound: WALL_SENSE_TYPES.LIMITED,
      }),
      createMockWall({
        id: 'normal-sight-open-sound-wall',
        c: [200, 0, 200, 200],
        sight: WALL_SENSE_TYPES.NORMAL,
        sound: WALL_SENSE_TYPES.NONE,
      }),
    ];
    const observer = createMockToken({
      id: 'observer',
      x: 0,
      y: 0,
      controlled: true,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', x: 5, y: 0, visible: true });
    target.detectionFilter = { id: 'limited-wall-soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: [
          {
            active: true,
            object: observer,
            los: { contains: jest.fn(() => false) },
          },
        ],
        lightSources: [],
      },
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: null,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    primePendingControlledTokenDragIntent(observer, { refreshDelayMs: 0 });

    expect(currentPendingMovementSightLineSeesTarget(observer, target)).toBe(false);
    expect(shouldTemporarilyForceTokenInvisible(target)).toBe(false);
  });

  test('keeps Visioner-hidden soundwave visible during drag even when wall blocks sound', () => {
    global.CONST = {
      ...(global.CONST || {}),
      WALL_SENSE_TYPES,
      EDGE_SENSE_TYPES: WALL_SENSE_TYPES,
    };
    global.canvas.walls.placeables = [
      createMockWall({
        id: 'near-limited-sight-sound-wall',
        c: [100, 0, 100, 200],
        sight: WALL_SENSE_TYPES.LIMITED,
        sound: WALL_SENSE_TYPES.LIMITED,
      }),
      createMockWall({
        id: 'far-limited-sight-sound-wall',
        c: [200, 0, 200, 200],
        sight: WALL_SENSE_TYPES.LIMITED,
        sound: WALL_SENSE_TYPES.LIMITED,
      }),
    ];
    const observer = createMockToken({
      id: 'observer',
      x: 0,
      y: 0,
      controlled: true,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', x: 5, y: 0, visible: true });
    target.detectionFilter = { id: 'blocked-sound-hidden-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: [
          {
            active: true,
            object: observer,
            los: { contains: jest.fn(() => false) },
          },
        ],
        lightSources: [],
      },
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    primePendingControlledTokenDragIntent(observer, { refreshDelayMs: 0 });

    expect(currentPendingMovementSightLineSeesTarget(observer, target)).toBe(false);
    expect(shouldTemporarilyForceTokenInvisible(target)).toBe(false);
  });

  test('keeps hidden soundwave when limited wall LOS polygon contains target during drag', () => {
    global.CONST = {
      ...(global.CONST || {}),
      WALL_SENSE_TYPES,
      EDGE_SENSE_TYPES: WALL_SENSE_TYPES,
    };
    global.canvas.walls.placeables = [
      createMockWall({
        id: 'limited-sight-sound-wall',
        c: [100, 0, 100, 200],
        sight: WALL_SENSE_TYPES.LIMITED,
        sound: WALL_SENSE_TYPES.LIMITED,
      }),
    ];
    const observer = createMockToken({
      id: 'observer',
      x: 0,
      y: 0,
      controlled: true,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.detectionFilter = { id: 'limited-wall-soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: [
          {
            active: true,
            object: observer,
            los: { contains: jest.fn(() => true) },
          },
        ],
        lightSources: [],
      },
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    primePendingControlledTokenDragIntent(observer, { refreshDelayMs: 0 });

    expect(lineIntersectsLimitedWall(observer.center, target.center, 'sight')).toBe(true);
    expect(currentPendingMovementSightLineSeesTarget(observer, target)).toBe(true);
    expect(shouldSuppressPendingMovementDetectionFilterVisuals(target)).toBe(false);
    expect(shouldTemporarilyForceTokenInvisible(target)).toBe(false);
  });

  test('guards hidden detection for a controlled token drag preview source', () => {
    const original = createMockToken({ id: 'observer', x: 3, y: 3 });
    const preview = {
      ...createMockToken({ id: 'observer-preview', x: 0, y: 0 }),
      isPreview: true,
      _previewType: 'drag',
      _original: original,
    };
    const target = createMockToken({ id: 'target', x: 3, y: 0 });
    global.canvas = {
      ...global.canvas,
      tokens: {
        controlled: [original],
      },
    };

    expect(shouldTemporarilyBlockHiddenDetection(preview, target, 'hidden')).toBe(true);
  });

  test('uses core LOS for controlled drag preview before final movement prediction exists', () => {
    global.canvas.walls.placeables = [];
    const original = createMockToken({
      id: 'observer',
      x: 0,
      y: 0,
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const preview = {
      ...createMockToken({ id: 'observer-preview', x: 1, y: 0 }),
      isPreview: true,
      _previewType: 'drag',
      _original: original,
    };
    const target = createMockToken({ id: 'target', x: 3, y: 0 });
    global.canvas = {
      ...global.canvas,
      tokens: {
        controlled: [original],
        get: jest.fn((id) => (id === 'observer' ? original : null)),
        placeables: [original, target],
      },
    };

    expect(shouldUseCoreDetectionDuringPendingMovement(preview, target)).toBe(true);
    expect(shouldTemporarilyBlockHiddenDetection(preview, target, 'hidden')).toBe(false);
  });

  test('refreshes target visibility during committed movement animation', () => {
    jest.useFakeTimers();

    global.canvas.walls.placeables = [];
    const original = createMockToken({
      id: 'observer',
      x: 0,
      y: 0,
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    original.controlled = true;
    const target = createMockToken({ id: 'target', x: 3, y: 0 });
    target.refresh = jest.fn();
    global.canvas = {
      ...global.canvas,
      tokens: {
        controlled: [original],
        get: jest.fn((id) => (id === 'observer' ? original : id === 'target' ? target : null)),
        placeables: [original, target],
        _draggedToken: original,
      },
      effects: {
        visionSources: new Map([['observer', { active: true, object: original }]]),
        lightSources: new Map(),
      },
    };

    setPendingTokenMovementPosition(original.document, { x: 100, y: 0 }, [original], {
      predictFinalVisibility: () => new Promise(() => { }),
    });
    schedulePendingTokenMovementCompletion(original.document);
    jest.advanceTimersByTime(250);

    expect(target.refresh).toHaveBeenCalled();
  });

  test('publishes prioritized final visibility predictions before the full scene finishes', async () => {
    jest.useFakeTimers();
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      x: 0,
      y: 0,
      flags: visibilityV2Flags({ target: 'undetected', other: 'observed' }),
    });
    const other = createMockToken({ id: 'other', x: 5, y: 0 });
    const target = createMockToken({ id: 'target', x: 3, y: 0 });
    target.refresh = jest.fn();

    let releaseOther;
    const slowOtherPrediction = new Promise((resolve) => {
      releaseOther = () => resolve('observed');
    });
    const calculateFinalVisibility = jest.fn((observerArg, targetArg) => {
      if (targetArg?.document?.id === 'target') return Promise.resolve('hidden');
      if (targetArg?.document?.id === 'other') return slowOtherPrediction;
      return Promise.resolve('observed');
    });

    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) =>
          id === 'observer' ? observer : id === 'target' ? target : id === 'other' ? other : null,
        ),
        placeables: [observer, other, target],
      },
      effects: {
        visionSources: new Map([['observer', { active: true, object: observer }]]),
        lightSources: new Map(),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer], {
      predictFinalVisibility: true,
      calculateFinalVisibility,
    });

    await Promise.resolve();

    expect(calculateFinalVisibility).not.toHaveBeenCalled();

    jest.advanceTimersByTime(250);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(calculateFinalVisibility.mock.calls[0][1].document.id).toBe('target');
    expect(target.refresh).not.toHaveBeenCalled();
    expect(target.visible).toBe(false);

    releaseOther();
    await slowOtherPrediction;
  });

  test('does not guard observed targets or non-controlled movement', () => {
    const observer = createMockToken({ id: 'observer', x: 0, y: 0 });
    const target = createMockToken({ id: 'target', x: 3, y: 0 });
    const tokenDoc = {
      id: 'observer',
      x: 0,
      y: 0,
    };

    expect(setPendingTokenMovementPosition(tokenDoc, { x: 0, y: 0 }, [])).toBe(false);
    expect(shouldTemporarilyBlockHiddenDetection(observer, target, 'hidden')).toBe(false);

    setPendingTokenMovementPosition(tokenDoc, { x: 0, y: 0 }, [observer]);

    expect(shouldTemporarilyBlockHiddenDetection(observer, target, 'observed')).toBe(false);
    expect(shouldTemporarilyBlockHiddenDetection(observer, target, 'concealed')).toBe(false);
  });

  test('keeps guarding through a normal movement animation window', () => {
    jest.useFakeTimers();

    const observer = createMockToken({ id: 'observer', x: 0, y: 0 });
    const target = createMockToken({ id: 'target', x: 3, y: 0 });
    const tokenDoc = {
      id: 'observer',
      x: 0,
      y: 0,
    };

    setPendingTokenMovementPosition(tokenDoc, { x: 0, y: 0 }, [observer]);
    jest.advanceTimersByTime(1000);

    expect(shouldTemporarilyBlockHiddenDetection(observer, target, 'hidden')).toBe(true);
  });

  test('does not suppress pending moving source for Visioner-hidden targets without wall blockage', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      x: 0,
      y: 0,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0 });
    const source = { active: true, object: observer, suppression: {} };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);

    expect(
      getPendingMovementBlockedDetectionSources(target, {
        visionSources: [source],
        lightSources: [],
      }),
    ).toEqual([]);
  });

  test('does not suppress pending moving source for observed targets without wall blockage', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({ id: 'observer', x: 0, y: 0 });
    const target = createMockToken({ id: 'target', x: 3, y: 0 });
    const source = { active: true, object: observer, suppression: {} };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);

    expect(
      getPendingMovementBlockedDetectionSources(target, {
        visionSources: [source],
        lightSources: [],
      }),
    ).toEqual([]);
  });

  test('stores pending movement for current player-owned token even when not locally controlled', () => {
    global.game.user.id = 'player';
    global.game.user.isGM = false;

    const observer = createMockToken({ id: 'observer', x: 0, y: 0 });
    observer.document.testUserPermission = jest.fn((user, permission) => {
      return user?.id === 'player' && permission === 'OWNER';
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0 });

    expect(
      setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [], {
        userId: 'player',
      }),
    ).toBe(true);

    expect(shouldTemporarilyBlockHiddenDetection(observer, target, 'hidden')).toBe(true);
  });

  test('stores pending movement for current GM token move even when not locally controlled', () => {
    global.game.user.id = 'gm';
    global.game.user.isGM = true;

    const observer = createMockToken({ id: 'observer', x: 0, y: 0 });
    const target = createMockToken({ id: 'target', x: 3, y: 0 });

    expect(
      setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [], {
        userId: 'gm',
      }),
    ).toBe(true);

    expect(shouldTemporarilyBlockHiddenDetection(observer, target, 'hidden')).toBe(true);
  });

  test('does not store pending movement for another user movement echoed to GM client', () => {
    global.game.user.id = 'gm';
    global.game.user.isGM = true;

    const observer = createMockToken({ id: 'observer', x: 0, y: 0 });
    const target = createMockToken({ id: 'target', x: 3, y: 0 });

    expect(
      setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [], {
        userId: 'player',
      }),
    ).toBe(false);

    expect(shouldTemporarilyBlockHiddenDetection(observer, target, 'hidden')).toBe(false);
  });

  test('suppresses pending moving source for Foundry-hidden targets', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({ id: 'observer', x: 0, y: 0 });
    const target = createMockToken({ id: 'target', x: 3, y: 0, hidden: true });
    const source = { active: true, object: observer, suppression: {} };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);

    expect(
      getPendingMovementBlockedDetectionSources(target, {
        visionSources: [source],
        lightSources: [],
      }),
    ).toEqual([source]);
  });

  test('refreshes other token visuals after pending movement is stored', () => {
    const observer = { id: 'observer', document: { id: 'observer' }, refresh: jest.fn() };
    const target = { id: 'target', document: { id: 'target' }, refresh: jest.fn() };
    const other = { id: 'other', document: { id: 'other' }, refresh: jest.fn() };
    const perceptionUpdate = jest.fn();
    global.canvas = {
      ...global.canvas,
      tokens: {
        placeables: [observer, target, other],
      },
      perception: {
        update: perceptionUpdate,
      },
    };

    refreshPendingMovementTokenVisibility('observer');
    flushScheduledCanvasPerceptionUpdate();

    expect(observer.refresh).not.toHaveBeenCalled();
    expect(target.refresh).toHaveBeenCalledTimes(1);
    expect(other.refresh).toHaveBeenCalledTimes(1);
    expect(perceptionUpdate).toHaveBeenCalledWith({
      refreshVision: true,
      refreshOcclusion: true,
    });
  });

  test('coalesces perception updates emitted by pending movement token refreshes', () => {
    const observer = { id: 'observer', document: { id: 'observer' }, refresh: jest.fn() };
    const target = {
      id: 'target',
      document: { id: 'target' },
      refresh: jest.fn(() => {
        global.canvas.perception.update({ refreshVision: true });
      }),
    };
    const other = {
      id: 'other',
      document: { id: 'other' },
      refresh: jest.fn(() => {
        global.canvas.perception.update({ refreshLighting: true });
      }),
    };
    const perceptionUpdate = jest.fn();
    global.canvas = {
      ...global.canvas,
      tokens: {
        placeables: [observer, target, other],
      },
      perception: {
        update: perceptionUpdate,
      },
    };

    refreshPendingMovementTokenVisibility('observer');

    expect(perceptionUpdate).not.toHaveBeenCalled();

    flushScheduledCanvasPerceptionUpdate();

    expect(perceptionUpdate).toHaveBeenCalledTimes(1);
    expect(perceptionUpdate).toHaveBeenCalledWith({
      refreshLighting: true,
      refreshVision: true,
      refreshOcclusion: true,
    });
  });

  test('hard-hides Visioner-hidden loot during movement refresh', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', actorType: 'loot', visible: true });
    target.mesh = { visible: true };
    target.detectionFilter = { id: 'native-filter' };
    target.refresh = jest.fn();
    global.canvas = {
      ...global.canvas,
      tokens: {
        placeables: [observer, target],
      },
      perception: {
        update: jest.fn(),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);
    refreshPendingMovementTokenVisibility('observer');

    expect(target.visible).toBe(false);
    expect(target.renderable).toBe(false);
    expect(target.mesh.visible).toBe(false);
    expect(target.detectionFilter).toBeNull();
    expect(target.refresh).not.toHaveBeenCalled();
    expect(shouldTemporarilyForceTokenInvisible(target)).toBe(true);
  });

  test('does not force Visioner-hidden NPC tokens invisible during movement refresh', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', actorType: 'npc', visible: true });
    target.mesh = { visible: true };
    target.refresh = jest.fn();
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      perception: {
        update: jest.fn(),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);
    refreshPendingMovementTokenVisibility('observer');

    expect(target.visible).toBe(true);
    expect(target.mesh.visible).toBe(true);
    expect(target.refresh).toHaveBeenCalledTimes(1);
    expect(shouldTemporarilyForceTokenInvisible(target)).toBe(false);
  });

  test('does not force invisible Visioner-hidden targets invisible during movement refresh', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({
      id: 'target',
      actorType: 'npc',
      visible: true,
      actor: {
        hasCondition: jest.fn((slug) => slug === 'invisible'),
        system: { conditions: { invisible: { active: true } } },
      },
    });
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.refresh = jest.fn();
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        controlled: [observer],
        placeables: [observer, target],
      },
      perception: {
        update: jest.fn(),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);
    refreshPendingMovementTokenVisibility('observer');

    expect(target.visible).toBe(true);
    expect(target.mesh.visible).toBe(true);
    expect(target.refresh).toHaveBeenCalledTimes(1);
    expect(shouldTemporarilyForceTokenInvisible(target)).toBe(false);
  });

  test('keeps Visioner-undetected NPC tokens render-locked during movement refresh', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', actorType: 'npc', visible: true });
    target.mesh = { visible: true };
    target.refresh = jest.fn();
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      perception: {
        update: jest.fn(),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);
    refreshPendingMovementTokenVisibility('observer');

    expect(target.visible).toBe(false);
    expect(target.mesh.visible).toBe(false);
    expect(target.refresh).not.toHaveBeenCalled();
    expect(shouldTemporarilyForceTokenInvisible(target)).toBe(true);
  });

  test('keeps wall-blocked token rendering core-owned while pending movement expires', () => {
    jest.useFakeTimers();

    const observer = createMockToken({ id: 'observer', x: 0, y: 0 });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.nameplate = { visible: false };
    target.bars = { visible: false };
    target.tooltip = { visible: false };
    target.effects = { visible: false };
    target.levelIndicator = { visible: false };
    target.targetPips = { visible: false };
    target.document.getVisibilityTestPoints = jest.fn(() => [{ x: 175, y: 25 }]);
    target.refresh = jest.fn();
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      effects: {
        visionSources: [{ active: true, object: observer }],
        lightSources: [],
      },
      visibility: {
        testVisibility: jest.fn(() => false),
      },
      perception: {
        update: jest.fn(),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);
    refreshPendingMovementTokenVisibility('observer');

    expect(target.renderable).toBe(true);
    expect(target.mesh.renderable).toBe(true);

    jest.advanceTimersByTime(2500);

    expect(target.renderable).toBe(true);
    expect(target.mesh.renderable).toBe(true);
    expect(target.mesh.alpha).toBe(1);
    expect(target.nameplate.visible).toBe(false);
    expect(target.effects.visible).toBe(false);
    expect(target.levelIndicator.visible).toBe(false);
  });

  test('lets core decide wall-blocked token rendering during active movement', () => {
    const observer = createMockToken({ id: 'observer', x: 0, y: 0 });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.nameplate = { visible: false };
    target.bars = { visible: false };
    target.tooltip = { visible: false };
    target.effects = { visible: false };
    target.levelIndicator = { visible: false };
    target.targetPips = { visible: false };
    target.document.getVisibilityTestPoints = jest.fn(() => [{ x: 175, y: 25 }]);
    target.refresh = jest.fn();
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      effects: {
        visionSources: [{ active: true, object: observer }],
        lightSources: [],
      },
      visibility: {
        testVisibility: jest.fn().mockReturnValueOnce(false).mockReturnValue(true),
      },
      perception: {
        update: jest.fn(),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);
    refreshPendingMovementTokenVisibility('observer');

    expect(target.renderable).toBe(true);
    expect(target.mesh.renderable).toBe(true);
    expect(target.mesh.alpha).toBe(1);
    expect(target.nameplate.visible).toBe(false);
    expect(target.effects.visible).toBe(false);
    expect(target.levelIndicator.visible).toBe(false);

    refreshPendingMovementTokenVisibility('observer');

    expect(target.renderable).toBe(true);
    expect(target.mesh.renderable).toBe(true);
    expect(target.mesh.alpha).toBe(1);
    expect(target.nameplate.visible).toBe(false);
    expect(target.effects.visible).toBe(false);
    expect(target.levelIndicator.visible).toBe(false);
    expect(global.canvas.visibility.testVisibility).not.toHaveBeenCalled();

    expect(completePendingTokenMovement('observer')).toBe(true);
    expect(target.renderable).toBe(true);
    expect(target.mesh.renderable).toBe(true);
    expect(target.mesh.alpha).toBe(1);
    expect(target.nameplate.visible).toBe(false);
    expect(target.effects.visible).toBe(false);
    expect(target.levelIndicator.visible).toBe(false);
  });

  test('keeps rendering core-owned until movement animation completes', async () => {
    jest.useFakeTimers();

    let resolveAnimation;
    const animationPromise = new Promise((resolve) => {
      resolveAnimation = resolve;
    });
    const observer = createMockToken({ id: 'observer', x: 0, y: 0 });
    observer._animation = { state: 'running', promise: animationPromise };
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.nameplate = { visible: true };
    target.document.getVisibilityTestPoints = jest.fn(() => [{ x: 175, y: 25 }]);
    target.refresh = jest.fn();
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      effects: {
        visionSources: [{ active: true, object: observer }],
        lightSources: [],
      },
      visibility: {
        testVisibility: jest.fn(() => false),
      },
      perception: {
        update: jest.fn(),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);
    refreshPendingMovementTokenVisibility('observer');

    expect(schedulePendingTokenMovementCompletion(observer.document)).toBe(true);
    expect(target.renderable).toBe(true);

    jest.advanceTimersByTime(0);
    expect(target.renderable).toBe(true);

    resolveAnimation();
    await animationPromise;
    await Promise.resolve();

    expect(target.renderable).toBe(true);
    expect(target.mesh.renderable).toBe(true);
    expect(target.mesh.alpha).toBe(1);
    expect(target.nameplate.visible).toBe(true);
  });

  test('waits briefly for Foundry animation without render-locking token visuals', async () => {
    jest.useFakeTimers();

    let resolveAnimation;
    const animationPromise = new Promise((resolve) => {
      resolveAnimation = resolve;
    });
    const observer = createMockToken({ id: 'observer', x: 0, y: 0 });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.nameplate = { visible: true };
    target.document.getVisibilityTestPoints = jest.fn(() => [{ x: 175, y: 25 }]);
    target.refresh = jest.fn();
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      effects: {
        visionSources: [{ active: true, object: observer }],
        lightSources: [],
      },
      visibility: {
        testVisibility: jest.fn(() => false),
      },
      perception: {
        update: jest.fn(),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);
    refreshPendingMovementTokenVisibility('observer');

    expect(schedulePendingTokenMovementCompletion(observer.document)).toBe(true);
    expect(target.renderable).toBe(true);

    jest.advanceTimersByTime(25);
    observer._animation = { state: 'running', promise: animationPromise };

    jest.advanceTimersByTime(25);
    expect(target.renderable).toBe(true);

    resolveAnimation();
    await animationPromise;
    await Promise.resolve();

    expect(target.renderable).toBe(true);
    expect(target.mesh.renderable).toBe(true);
    expect(target.mesh.alpha).toBe(1);
    expect(target.nameplate.visible).toBe(true);
  });

  test('keeps token rendering core-owned when player animation appears after first completion check', async () => {
    jest.useFakeTimers();

    let resolveAnimation;
    const animationPromise = new Promise((resolve) => {
      resolveAnimation = resolve;
    });
    const observer = createMockToken({ id: 'observer', x: 0, y: 0 });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.nameplate = { visible: true };
    target.document.getVisibilityTestPoints = jest.fn(() => [{ x: 175, y: 25 }]);
    target.refresh = jest.fn();
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      effects: {
        visionSources: [{ active: true, object: observer }],
        lightSources: [],
      },
      visibility: {
        testVisibility: jest.fn(() => false),
      },
      perception: {
        update: jest.fn(),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);
    refreshPendingMovementTokenVisibility('observer');

    expect(schedulePendingTokenMovementCompletion(observer.document)).toBe(true);
    setTimeout(() => {
      observer._animation = { state: 'running', promise: animationPromise };
    }, 75);

    jest.advanceTimersByTime(100);
    expect(target.renderable).toBe(true);
    expect(target.mesh.renderable).toBe(true);

    resolveAnimation();
    await animationPromise;
    await Promise.resolve();

    expect(target.renderable).toBe(true);
    expect(target.mesh.renderable).toBe(true);
    expect(target.mesh.alpha).toBe(1);
    expect(target.nameplate.visible).toBe(true);
  });

  test('keeps pending movement active until token visual position reaches destination without animation handle', () => {
    jest.useFakeTimers();

    const observer = createMockToken({ id: 'observer', x: 0, y: 0 });
    observer.document.object = observer;
    const target = createMockToken({ id: 'target', x: 3, y: 0 });
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 300, y: 0 }, [observer]);
    expect(schedulePendingTokenMovementCompletion(observer.document)).toBe(true);

    jest.advanceTimersByTime(350);

    expect(getPendingTokenMovementPosition('observer')).toEqual({ x: 300, y: 0 });

    observer.x = 300;
    observer.y = 0;
    jest.advanceTimersByTime(60);

    expect(getPendingTokenMovementPosition('observer')).toBeNull();
  });

  test('movement completion restores token when final visibility becomes observed during grace', () => {
    jest.useFakeTimers();

    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', actorType: 'loot', visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.nameplate = { visible: true };
    target.refresh = jest.fn();
    const perceptionUpdate = jest.fn();
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      perception: {
        update: jest.fn(),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);
    refreshPendingMovementTokenVisibility('observer');
    observer.document.getFlag.mockReturnValue(visibilityV2Map({ target: 'observed' }));

    expect(completePendingTokenMovement('observer')).toBe(true);
    expect(target.renderable).toBe(true);
    expect(target.mesh.renderable).toBe(true);
    expect(target.mesh.alpha).toBe(1);
    expect(target.nameplate.visible).toBe(true);
  });

  test('post-completion refresh restores token when player-side visibility settles late', () => {
    jest.useFakeTimers();

    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', actorType: 'loot', visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.nameplate = { visible: true };
    target.refresh = jest.fn();
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      perception: {
        update: jest.fn(),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);
    refreshPendingMovementTokenVisibility('observer');

    expect(completePendingTokenMovement('observer')).toBe(true);
    expect(target.renderable).toBe(false);
    expect(target.mesh.renderable).toBe(false);

    observer.document.getFlag.mockReturnValue(visibilityV2Map({ target: 'observed' }));
    jest.advanceTimersByTime(100);

    expect(target.renderable).toBe(true);
    expect(target.mesh.renderable).toBe(true);
    expect(target.mesh.alpha).toBe(1);
    expect(target.nameplate.visible).toBe(true);
  });

  test('does not run stale post-completion refresh after the same token starts moving again', () => {
    jest.useFakeTimers();

    global.canvas.walls.placeables = [];
    const observer = createMockToken({ id: 'observer', x: 0, y: 0 });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.refresh = jest.fn();
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      perception: {
        update: jest.fn(),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);
    expect(completePendingTokenMovement('observer')).toBe(true);
    target.refresh.mockClear();

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer]);
    jest.advanceTimersByTime(100);

    expect(target.refresh).not.toHaveBeenCalled();
  });

  test('keeps undetected targets render-locked during pending movement even when LOS can see them', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.document.getVisibilityTestPoints = jest.fn(() => [{ x: 175, y: 25 }]);
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      visibility: {
        testVisibility: jest.fn(() => true),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);

    expect(shouldTemporarilyForceTokenInvisible(target)).toBe(true);
    expect(global.canvas.visibility.testVisibility).not.toHaveBeenCalled();
  });

  test('uses core LOS during pending movement when final visibility is hidden, not undetected', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    observer._animation = { state: 'running', promise: Promise.resolve() };
    const target = createMockToken({ id: 'target', visible: true });
    target.document.getVisibilityTestPoints = jest.fn(() => [{ x: 175, y: 25 }]);
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      visibility: {
        testVisibility: jest.fn(() => true),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer], {
      finalVisibilityStatesByTargetId: { target: 'hidden' },
    });

    expect(shouldUseCoreDetectionDuringPendingMovement(observer, target)).toBe(true);
    expect(shouldTemporarilyForceTokenInvisible(target)).toBe(false);
  });

  test('reveals undetected target mid-animation via geometric LOS when sight polygon is stale', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    observer._animation = { state: 'running', promise: Promise.resolve() };
    const target = createMockToken({ id: 'target', x: 200, y: 0, visible: true });
    target.document.getVisibilityTestPoints = jest.fn(() => [{ x: 225, y: 25 }]);
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        placeables: [observer, target],
      },
      visibility: {
        testVisibility: jest.fn(() => false),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer], {
      finalVisibilityStatesByTargetId: { target: 'observed' },
    });

    expect(shouldTemporarilyForceTokenInvisible(target)).toBe(false);
  });

  test('keeps render lock until core movement source can own LOS', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.document.getVisibilityTestPoints = jest.fn(() => [{ x: 175, y: 25 }]);
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      visibility: {
        testVisibility: jest.fn(() => true),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer], {
      finalVisibilityStatesByTargetId: { target: 'hidden' },
    });

    expect(shouldUseCoreDetectionDuringPendingMovement(observer, target)).toBe(false);
    expect(shouldTemporarilyForceTokenInvisible(target)).toBe(true);

    observer._animation = { state: 'running', promise: Promise.resolve() };

    expect(shouldUseCoreDetectionDuringPendingMovement(observer, target)).toBe(true);
    expect(shouldTemporarilyForceTokenInvisible(target)).toBe(false);
  });

  test('uses core LOS once committed movement visually leaves its start position', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      x: 0,
      y: 0,
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.document.getVisibilityTestPoints = jest.fn(() => [{ x: 175, y: 25 }]);
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      visibility: {
        testVisibility: jest.fn(() => true),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer], {
      finalVisibilityStatesByTargetId: { target: 'hidden' },
    });

    observer.x = 50;
    observer.document.x = 50;

    expect(shouldUseCoreDetectionDuringPendingMovement(observer, target)).toBe(true);
    expect(shouldTemporarilyForceTokenInvisible(target)).toBe(false);
  });

  test('probes current core LOS for stale undetected once committed movement leaves start', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      x: 0,
      y: 0,
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.document.getVisibilityTestPoints = jest.fn(() => [{ x: 175, y: 25 }]);
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      visibility: {
        testVisibility: jest.fn(() => true),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer]);

    observer.x = 50;
    observer.document.x = 50;

    expect(shouldTemporarilyForceTokenInvisible(target)).toBe(false);
    expect(global.canvas.visibility.testVisibility).toHaveBeenCalled();
  });

  test('keeps invisible undetected target render-locked even when committed observer movement has LOS', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      x: 0,
      y: 0,
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({
      id: 'target',
      visible: true,
      actor: {
        hasCondition: jest.fn((slug) => slug === 'invisible'),
        system: { conditions: { invisible: { active: true } } },
      },
    });
    target.document.getVisibilityTestPoints = jest.fn(() => [{ x: 175, y: 25 }]);
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        placeables: [observer, target],
      },
      visibility: {
        testVisibility: jest.fn(() => true),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer]);

    observer.x = 50;
    observer.document.x = 50;

    expect(shouldTemporarilyForceTokenInvisible(target)).toBe(true);
    expect(global.canvas.visibility.testVisibility).not.toHaveBeenCalled();
  });

  test('does not leave soundwave visuals behind from current core LOS probe', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      x: 0,
      y: 0,
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.detectionFilterMesh = { visible: false, renderable: false, alpha: 0 };
    target.document.getVisibilityTestPoints = jest.fn(() => [{ x: 175, y: 25 }]);
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      visibility: {
        testVisibility: jest.fn(() => {
          target.detectionFilter = { id: 'probe-soundwave-filter' };
          target.detectionFilterMesh.visible = true;
          target.detectionFilterMesh.renderable = true;
          target.detectionFilterMesh.alpha = 1;
          return true;
        }),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer]);

    observer.x = 50;
    observer.document.x = 50;

    expect(shouldTemporarilyForceTokenInvisible(target)).toBe(false);
    expect(target.detectionFilter).toBeNull();
    expect(target.detectionFilterMesh).toMatchObject({
      visible: false,
      renderable: false,
      alpha: 0,
    });
  });

  test('keeps core-visible stale undetected rendered during post-completion grace', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      x: 0,
      y: 0,
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.nameplate = { visible: false };
    target.bars = { visible: false };
    target.tooltip = { visible: false };
    target.effects = { visible: false };
    target.levelIndicator = { visible: false };
    target.targetPips = { visible: false };
    target.document.getVisibilityTestPoints = jest.fn(() => [{ x: 175, y: 25 }]);
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      effects: {
        visionSources: [{ active: true, object: observer, shape: { contains: jest.fn(() => true) } }],
        lightSources: [],
      },
      visibility: {
        testVisibility: jest.fn(() => true),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer]);
    observer.x = 50;
    observer.document.x = 50;

    expect(shouldTemporarilyForceTokenInvisible(target)).toBe(false);
    expect(target.nameplate.visible).toBe(false);
    expect(target.bars.visible).toBe(false);
    expect(target.tooltip.visible).toBe(false);
    expect(target.effects.visible).toBe(false);
    expect(target.levelIndicator.visible).toBe(false);
    expect(target.targetPips.visible).toBe(false);
    clearPendingTokenMovementPosition('observer');

    target.visible = false;
    target.renderable = true;
    target.mesh.visible = false;
    target.mesh.renderable = true;
    target.mesh.alpha = 1;

    expect(restorePendingMovementTokenRendering(target)).toBe(true);
    expect(target.visible).toBe(true);
    expect(target.renderable).toBe(true);
    expect(target.mesh.visible).toBe(true);
    expect(target.mesh.renderable).toBe(true);
    expect(target.mesh.alpha).toBe(1);
    expect(target.nameplate.visible).toBe(false);
    expect(target.bars.visible).toBe(false);
    expect(target.tooltip.visible).toBe(false);
    expect(target.effects.visible).toBe(false);
    expect(target.levelIndicator.visible).toBe(false);
    expect(target.targetPips.visible).toBe(false);
  });

  test('clears stale soundwave visuals during core-visible grace reveal', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      x: 0,
      y: 0,
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    const hiddenEcho = {
      visible: true,
      parent: { removeChild: jest.fn() },
      destroy: jest.fn(),
    };
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.detectionFilter = { id: 'soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    target._pvHiddenEcho = hiddenEcho;
    target.document.getVisibilityTestPoints = jest.fn(() => [{ x: 175, y: 25 }]);
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      effects: {
        visionSources: [{ active: true, object: observer }],
        lightSources: [],
      },
      visibility: {
        testVisibility: jest.fn(() => true),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer]);
    observer.x = 50;
    observer.document.x = 50;

    expect(shouldTemporarilyForceTokenInvisible(target)).toBe(false);
    clearPendingTokenMovementPosition('observer');

    target.visible = false;
    target.mesh.visible = false;

    expect(restorePendingMovementTokenRendering(target)).toBe(true);
    expect(target.visible).toBe(true);
    expect(target.mesh.visible).toBe(true);
    expect(target.detectionFilter).toBeNull();
    expect(target.detectionFilterMesh).toMatchObject({
      visible: false,
      renderable: false,
      alpha: 0,
    });
    expect(target._pvHiddenEcho).toBeNull();
    expect(hiddenEcho.parent.removeChild).toHaveBeenCalledWith(hiddenEcho);
    expect(hiddenEcho.destroy).toHaveBeenCalled();
  });

  test('does not restore captured soundwave mesh when hidden render lock yields to core LOS', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      x: 0,
      y: 0,
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    target.document.getVisibilityTestPoints = jest.fn(() => [{ x: 175, y: 25 }]);
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      effects: {
        visionSources: [{ active: true, object: observer }],
        lightSources: [],
      },
      visibility: {
        testVisibility: jest.fn(() => true),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer]);
    forcePendingMovementTokenInvisible(target);
    observer.x = 50;
    observer.document.x = 50;

    expect(shouldTemporarilyForceTokenInvisible(target)).toBe(false);
    expect(restorePendingMovementTokenRendering(target)).toBe(true);
    expect(target.visible).toBe(true);
    expect(target.mesh.visible).toBe(true);
    expect(target.detectionFilter).toBeNull();
    expect(target.detectionFilterMesh).toMatchObject({
      visible: false,
      renderable: false,
      alpha: 0,
    });
  });

  test('keeps predicted core-owned reveal rendered after pending movement clears', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      x: 0,
      y: 0,
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.document.getVisibilityTestPoints = jest.fn(() => [{ x: 175, y: 25 }]);
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      effects: {
        visionSources: [{ active: true, object: observer }],
        lightSources: [],
      },
      visibility: {
        testVisibility: jest.fn(() => true),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer], {
      finalVisibilityStatesByTargetId: { target: 'observed' },
    });
    observer.x = 50;
    observer.document.x = 50;

    expect(shouldTemporarilyForceTokenInvisible(target)).toBe(false);
    clearPendingTokenMovementPosition('observer');

    target.visible = false;
    target.mesh.visible = false;

    expect(restorePendingMovementTokenRendering(target)).toBe(true);
    expect(target.visible).toBe(true);
    expect(target.mesh.visible).toBe(true);
  });

  test('keeps stale undetected locked when final visibility remains undetected', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    observer._animation = { state: 'running', promise: Promise.resolve() };
    const target = createMockToken({ id: 'target', visible: true });
    target.document.getVisibilityTestPoints = jest.fn(() => [{ x: 175, y: 25 }]);
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      visibility: {
        testVisibility: jest.fn(() => true),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer], {
      finalVisibilityStatesByTargetId: { target: 'undetected' },
    });

    expect(shouldUseCoreDetectionDuringPendingMovement(observer, target)).toBe(false);
    expect(shouldTemporarilyForceTokenInvisible(target)).toBe(true);
    expect(global.canvas.visibility.testVisibility).not.toHaveBeenCalled();
  });

  test('uses core LOS while final visibility prediction is pending during active movement', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    observer._animation = { state: 'running', promise: Promise.resolve() };
    const target = createMockToken({ id: 'target', visible: true });
    target.document.getVisibilityTestPoints = jest.fn(() => [{ x: 175, y: 25 }]);
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      visibility: {
        testVisibility: jest.fn(() => true),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer], {
      predictFinalVisibility: () => new Promise(() => { }),
    });

    expect(shouldUseCoreDetectionDuringPendingMovement(observer, target)).toBe(true);
    expect(shouldTemporarilyForceTokenInvisible(target)).toBe(false);
  });

  test('precomputes final clear LOS so stale undetected can reveal during movement', () => {
    global.canvas.walls.placeables = [
      createMockWall({ id: 'wall', c: [100, 0, 100, 200], sight: 1, sound: 20 }),
    ];
    const observer = createMockToken({
      id: 'observer',
      x: 0,
      y: 0,
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    observer._animation = { state: 'running', promise: Promise.resolve() };
    const target = createMockToken({ id: 'target', x: 4, y: 0, visible: true });
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 150, y: 0 }, [observer], {
      predictFinalVisibility: () => new Promise(() => { }),
    });

    expect(shouldUseCoreDetectionDuringPendingMovement(observer, target)).toBe(true);
    expect(shouldTemporarilyForceTokenInvisible(target)).toBe(false);
  });

  test('precomputes final hearing detection as hidden during movement', () => {
    global.canvas.walls.placeables = [
      createMockWall({ id: 'wall', c: [100, 0, 100, 200], sight: 1, sound: 0 }),
    ];
    const observer = createMockToken({
      id: 'observer',
      x: 0,
      y: 0,
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    observer._animation = { state: 'running', promise: Promise.resolve() };
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer], {
      predictFinalVisibility: () => new Promise(() => { }),
    });

    expect(shouldUseCoreDetectionDuringPendingMovement(observer, target)).toBe(true);
    expect(shouldTemporarilyForceTokenInvisible(target)).toBe(false);
  });

  test('keeps hidden soundwave when only Visioner edge rays clear a core-blocked target', () => {
    global.canvas.walls.placeables = [
      createMockWall({ id: 'wall', c: [50, 0, 50, 40], sight: 1, sound: 0 }),
    ];
    const observer = createMockToken({
      id: 'observer',
      x: 100,
      y: 50,
      center: { x: 125, y: 75 },
      controlled: true,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({
      id: 'target',
      x: 0,
      y: 0,
      center: { x: 25, y: 25 },
      visible: true,
    });
    target.detectionFilter = { id: 'stale-soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 50 }, [observer], {
      predictFinalVisibility: () => new Promise(() => { }),
    });

    expect(shouldSuppressPendingMovementDetectionFilterVisuals(target)).toBe(false);
  });

  test('keeps stale undetected locked when final sight and sound are blocked', () => {
    global.canvas.walls.placeables = [
      createMockWall({ id: 'wall', c: [100, 0, 100, 200], sight: 1, sound: 20 }),
    ];
    const observer = createMockToken({
      id: 'observer',
      x: 0,
      y: 0,
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    observer._animation = { state: 'running', promise: Promise.resolve() };
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer], {
      predictFinalVisibility: () => new Promise(() => { }),
    });

    expect(shouldUseCoreDetectionDuringPendingMovement(observer, target)).toBe(false);
    expect(shouldTemporarilyForceTokenInvisible(target)).toBe(true);
  });

  test('keeps stale undetected locked when deafened observer only has sound path', () => {
    global.canvas.walls.placeables = [
      createMockWall({ id: 'wall', c: [100, 0, 100, 200], sight: 1, sound: 0 }),
    ];
    const observer = createMockToken({
      id: 'observer',
      x: 0,
      y: 0,
      actor: {
        hasCondition: jest.fn((slug) => slug === 'deafened'),
      },
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    observer._animation = { state: 'running', promise: Promise.resolve() };
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer], {
      predictFinalVisibility: () => new Promise(() => { }),
    });

    expect(shouldUseCoreDetectionDuringPendingMovement(observer, target)).toBe(false);
    expect(shouldTemporarilyForceTokenInvisible(target)).toBe(true);
  });

  test('keeps stale undetected locked while final visibility prediction waits for core movement', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.document.getVisibilityTestPoints = jest.fn(() => [{ x: 175, y: 25 }]);
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      visibility: {
        testVisibility: jest.fn(() => true),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer], {
      predictFinalVisibility: () => new Promise(() => { }),
    });

    expect(shouldUseCoreDetectionDuringPendingMovement(observer, target)).toBe(false);
    expect(shouldTemporarilyForceTokenInvisible(target)).toBe(true);
  });

  test('uses core LOS from movement start when final visibility is undetected', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'observed' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.document.getVisibilityTestPoints = jest.fn(() => [{ x: 175, y: 25 }]);
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      visibility: {
        testVisibility: jest.fn(() => true),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer], {
      finalVisibilityStatesByTargetId: { target: 'undetected' },
    });

    expect(shouldUseCoreDetectionDuringPendingMovement(observer, target)).toBe(true);
    expect(shouldTemporarilyForceTokenInvisible(target)).toBe(false);
    expect(global.canvas.visibility.testVisibility).not.toHaveBeenCalled();
  });

  test('keeps v2 undetected targets render-locked during pending movement even when LOS can see them', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: {
        'pf2e-visioner': {
          visibilityV2: {
            target: {
              detectionState: 'undetected',
              hasConcealment: false,
              coverState: 'none',
            },
          },
        },
      },
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.document.getVisibilityTestPoints = jest.fn(() => [{ x: 175, y: 25 }]);
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      visibility: {
        testVisibility: jest.fn(() => true),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);

    expect(shouldTemporarilyForceTokenInvisible(target)).toBe(true);
    expect(global.canvas.visibility.testVisibility).not.toHaveBeenCalled();
  });

  test('keeps undetected token render-locked when pending position can see it', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.document.getVisibilityTestPoints = jest.fn(() => [{ x: 175, y: 25 }]);
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.nameplate = { visible: true };
    target.refresh = jest.fn();
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      effects: {
        visionSources: [{ active: true, object: observer }],
        lightSources: [],
      },
      visibility: {
        testVisibility: jest.fn(() => true),
      },
      perception: {
        update: jest.fn(),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);
    refreshPendingMovementTokenVisibility('observer');

    expect(target.renderable).toBe(false);
    expect(target.mesh.renderable).toBe(false);
    expect(target.mesh.alpha).toBe(0);
    expect(target.nameplate.visible).toBe(false);

    expect(restorePendingMovementTokenRendering(target)).toBe(false);
    expect(target.renderable).toBe(false);
    expect(target.mesh.renderable).toBe(false);
    expect(target.mesh.alpha).toBe(0);
    expect(target.nameplate.visible).toBe(false);
  });

  test('keeps undetected token hidden when token refresh redraws it visible', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', actorType: 'npc', visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.nameplate = { visible: true };
    target.refresh = jest.fn(() => {
      expect(target.renderable).toBe(false);
      expect(target.mesh.renderable).toBe(false);
      expect(target.mesh.alpha).toBe(0);
      expect(target.nameplate.visible).toBe(false);
      target.visible = true;
      target.renderable = true;
      target.mesh.visible = true;
      target.mesh.renderable = true;
      target.mesh.alpha = 1;
      target.nameplate.visible = true;
    });
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      perception: {
        update: jest.fn(),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);
    refreshPendingMovementTokenVisibility('observer');

    expect(target.renderable).toBe(false);
    expect(target.mesh.renderable).toBe(false);
    expect(target.mesh.alpha).toBe(0);
    expect(target.nameplate.visible).toBe(false);
  });

  test('hides alternate token render surfaces while pending undetected visibility is active', () => {
    jest.useFakeTimers();

    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.nameplate = { visible: true };
    target.effects = { visible: true };
    target.targetArrows = { visible: true };
    target.targetPips = { visible: true };
    target.ruler = { visible: true };
    target.turnMarker = { visible: true, mesh: { visible: true } };
    target.detectionFilter = { id: 'native-filter' };
    target.refresh = jest.fn();
    global.canvas = {
      ...global.canvas,
      tokens: {
        placeables: [observer, target],
      },
      perception: {
        update: jest.fn(),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);
    refreshPendingMovementTokenVisibility('observer');

    expect(target.visible).toBe(false);
    expect(target.renderable).toBe(false);
    expect(target.mesh).toMatchObject({ visible: false, renderable: false, alpha: 0 });
    expect(target.nameplate.visible).toBe(false);
    expect(target.effects.visible).toBe(false);
    expect(target.targetArrows.visible).toBe(false);
    expect(target.targetPips.visible).toBe(false);
    expect(target.ruler.visible).toBe(true);
    expect(target.turnMarker.visible).toBe(false);
    expect(target.turnMarker.mesh.visible).toBe(false);
    expect(target.detectionFilter).toBeNull();

    clearPendingTokenMovementPosition('observer');
    observer.document.getFlag.mockReturnValue(visibilityV2Map({ target: 'observed' }));
    jest.advanceTimersByTime(1001);
    refreshPendingMovementTokenVisibility([]);

    expect(target.renderable).toBe(true);
    expect(target.mesh.renderable).toBe(true);
    expect(target.mesh.alpha).toBe(1);
    expect(target.nameplate.visible).toBe(true);
    expect(target.effects.visible).toBe(true);
    expect(target.targetArrows.visible).toBe(true);
    expect(target.targetPips.visible).toBe(true);
    expect(target.ruler.visible).toBe(true);
    expect(target.turnMarker.visible).toBe(true);
    expect(target.turnMarker.mesh.visible).toBe(true);
  });

  test('does not restore token rendering while remembered observer still has target undetected', () => {
    jest.useFakeTimers();

    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.nameplate = { visible: true };
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      perception: {
        update: jest.fn(),
      },
    };

    expect(forceTokenInvisibleForObserverVisibility(observer, target, 'undetected')).toBe(true);
    jest.advanceTimersByTime(1001);

    expect(restorePendingMovementTokenRendering(target)).toBe(false);
    expect(target.renderable).toBe(false);
    expect(target.mesh.renderable).toBe(false);
    expect(target.mesh.alpha).toBe(0);
    expect(target.nameplate.visible).toBe(false);
  });

  test('does not restore token rendering while undetected pending visibility is active', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.nameplate = { visible: true };
    target.refresh = jest.fn();
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      perception: {
        update: jest.fn(),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);
    refreshPendingMovementTokenVisibility('observer');

    expect(target.renderable).toBe(false);
    expect(target.mesh.renderable).toBe(false);
    expect(target.mesh.alpha).toBe(0);
    expect(target.nameplate.visible).toBe(false);

    expect(restorePendingMovementTokenRendering(target)).toBe(false);
    expect(target.renderable).toBe(false);
    expect(target.mesh.renderable).toBe(false);
    expect(target.mesh.alpha).toBe(0);
    expect(target.nameplate.visible).toBe(false);
  });

  test('does not restore selected-observer undetected target after control refresh', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', actorType: 'npc', visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.nameplate = { visible: true };
    target.refresh = jest.fn(() => {
      target.visible = true;
      target.renderable = true;
      target.mesh.visible = true;
      target.mesh.renderable = true;
      target.mesh.alpha = 1;
      target.nameplate.visible = true;
    });
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        controlled: [observer],
        placeables: [observer, target],
      },
      perception: {
        update: jest.fn(),
      },
    };

    expect(targetIsRenderHiddenForCurrentViewObserver(target)).toBe(true);

    refreshPendingMovementTokenVisibility([], {
      source: 'control-token-session',
      skipPerceptionRefresh: true,
      targetTokenIds: ['target'],
    });

    expect(target.visible).toBe(false);
    expect(target.renderable).toBe(false);
    expect(target.mesh.visible).toBe(false);
    expect(target.mesh.renderable).toBe(false);
    expect(target.mesh.alpha).toBe(0);
    expect(target.nameplate.visible).toBe(false);
  });

  test('can limit pending movement visibility refresh to specific target tokens', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'undetected', unrelated: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    const unrelated = createMockToken({ id: 'unrelated', visible: true });
    for (const token of [target, unrelated]) {
      token.renderable = true;
      token.mesh = { visible: true, renderable: true, alpha: 1 };
      token.nameplate = { visible: true };
      token.refresh = jest.fn();
    }
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target, unrelated],
      },
      perception: {
        update: jest.fn(),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);
    refreshPendingMovementTokenVisibility('observer', {
      source: 'unit-targeted',
      targetTokenIds: ['target'],
    });

    expect(target.renderable).toBe(false);
    expect(target.refresh).not.toHaveBeenCalled();
    expect(unrelated.renderable).toBe(true);
    expect(unrelated.refresh).not.toHaveBeenCalled();
  });

  test('does not collect pending movement refresh performance counters by default', () => {
    resetPendingMovementPerformanceCounters();
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'undetected', unrelated: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    const unrelated = createMockToken({ id: 'unrelated', visible: true });
    for (const token of [target, unrelated]) {
      token.renderable = true;
      token.mesh = { visible: true, renderable: true, alpha: 1 };
      token.nameplate = { visible: true };
      token.refresh = jest.fn();
    }
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target, unrelated],
      },
      perception: {
        update: jest.fn(),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);
    refreshPendingMovementTokenVisibility('observer', {
      source: 'unit-targeted',
      targetTokenIds: ['target'],
    });

    expect(target.refresh).not.toHaveBeenCalled();
    expect(getPendingMovementPerformanceSnapshot()).toEqual({
      refreshCalls: 0,
      targetedRefreshCalls: 0,
      fullSceneRefreshCalls: 0,
      suppressedRefreshCalls: 0,
      tokensScanned: 0,
      tokensRefreshed: 0,
      bySource: {},
    });
  });

  test('tracks pending movement refresh performance counters when diagnostics are enabled', () => {
    setMovementPerformanceDiagnosticsEnabled(true);
    resetPendingMovementPerformanceCounters();
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'observed' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    const unrelated = createMockToken({ id: 'unrelated', visible: true });
    for (const token of [target, unrelated]) {
      token.refresh = jest.fn();
      token.renderable = true;
      token.mesh = { visible: true, renderable: true, alpha: 1 };
    }
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target, unrelated],
      },
      perception: {
        update: jest.fn(),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);
    refreshPendingMovementTokenVisibility('observer', {
      source: 'unit-targeted',
      targetTokenIds: ['target'],
    });

    expect(getPendingMovementPerformanceSnapshot()).toEqual(
      expect.objectContaining({
        refreshCalls: 1,
        targetedRefreshCalls: 1,
        fullSceneRefreshCalls: 0,
        tokensScanned: 1,
        tokensRefreshed: 1,
        bySource: {
          'unit-targeted': expect.objectContaining({
            refreshCalls: 1,
            targetedRefreshCalls: 1,
            tokensScanned: 1,
            tokensRefreshed: 1,
          }),
        },
      }),
    );
  });

  test('coalesces pending movement visual refreshes into one animation frame', () => {
    jest.useFakeTimers();
    setMovementPerformanceDiagnosticsEnabled(true);
    const originalRequestAnimationFrame = global.requestAnimationFrame;
    const originalCancelAnimationFrame = global.cancelAnimationFrame;
    global.requestAnimationFrame = jest.fn((callback) => setTimeout(callback, 16));
    global.cancelAnimationFrame = jest.fn((id) => clearTimeout(id));
    resetPendingMovementPerformanceCounters();
    global.canvas.walls.placeables = [];
    const target = createMockToken({ id: 'target', visible: true });
    const unrelated = createMockToken({ id: 'unrelated', visible: true });
    for (const token of [target, unrelated]) {
      token.refresh = jest.fn();
      token.renderable = true;
      token.mesh = { visible: true, renderable: true, alpha: 1 };
      token.nameplate = { visible: true };
    }
    global.canvas = {
      ...global.canvas,
      tokens: {
        placeables: [target, unrelated],
      },
      perception: {
        update: jest.fn(),
      },
    };

    refreshPendingMovementTokenVisibility([], {
      coalesceFrame: true,
      source: 'unit-coalesced-a',
      targetTokenIds: ['target'],
    });
    refreshPendingMovementTokenVisibility([], {
      coalesceFrame: true,
      source: 'unit-coalesced-b',
      targetTokenIds: ['unrelated'],
    });

    expect(target.refresh).not.toHaveBeenCalled();
    expect(unrelated.refresh).not.toHaveBeenCalled();

    jest.advanceTimersByTime(16);

    expect(target.refresh).toHaveBeenCalledTimes(1);
    expect(unrelated.refresh).toHaveBeenCalledTimes(1);
    expect(getPendingMovementPerformanceSnapshot()).toEqual(
      expect.objectContaining({
        refreshCalls: 1,
        targetedRefreshCalls: 1,
        tokensScanned: 2,
        tokensRefreshed: 2,
      }),
    );

    global.requestAnimationFrame = originalRequestAnimationFrame;
    global.cancelAnimationFrame = originalCancelAnimationFrame;
  });

  test('skips token refresh when pending movement visual state is unchanged', () => {
    setMovementPerformanceDiagnosticsEnabled(true);
    resetPendingMovementPerformanceCounters();
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'observed' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.nameplate = { visible: true };
    target.refresh = jest.fn();
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        placeables: [observer, target],
      },
      perception: {
        update: jest.fn(),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);
    refreshPendingMovementTokenVisibility(['observer'], {
      skipPerceptionRefresh: true,
      targetTokenIds: ['target'],
    });
    refreshPendingMovementTokenVisibility(['observer'], {
      skipPerceptionRefresh: true,
      targetTokenIds: ['target'],
    });

    expect(target.refresh).toHaveBeenCalledTimes(1);
    expect(getPendingMovementPerformanceSnapshot()).toEqual(
      expect.objectContaining({
        refreshCalls: 2,
        tokensScanned: 2,
        tokensRefreshed: 1,
      }),
    );
  });

  test('does not refresh twice only because native soundwave filter appears', () => {
    setMovementPerformanceDiagnosticsEnabled(true);
    resetPendingMovementPerformanceCounters();
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.nameplate = { visible: true };
    target.detectionFilter = null;
    target.refresh = jest.fn(() => {
      target.detectionFilter = { id: 'native-soundwave' };
    });
    const perceptionUpdate = jest.fn();
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        controlled: [observer],
        placeables: [observer, target],
      },
      perception: {
        update: perceptionUpdate,
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);
    refreshPendingMovementTokenVisibility(['observer'], {
      skipPerceptionRefresh: true,
      targetTokenIds: ['target'],
    });
    refreshPendingMovementTokenVisibility(['observer'], {
      skipPerceptionRefresh: true,
      targetTokenIds: ['target'],
    });

    expect(target.refresh).toHaveBeenCalledTimes(1);
    expect(getPendingMovementPerformanceSnapshot()).toEqual(
      expect.objectContaining({
        refreshCalls: 2,
        tokensScanned: 2,
        tokensRefreshed: 1,
      }),
    );
  });

  test('keeps primed hidden soundwave mesh during pending movement refresh', () => {
    global.canvas.walls.placeables = [
      createMockWall({
        id: 'sight-wall',
        c: [100, -50, 100, 100],
        sight: WALL_SENSE_TYPES.NORMAL,
      }),
    ];
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.detectionFilter = { id: 'native-soundwave' };
    target.detectionFilterMesh = { visible: false, renderable: false, alpha: 0 };
    target.refresh = jest.fn();
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        controlled: [observer],
        placeables: [observer, target],
      },
      perception: {
        update: jest.fn(),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);
    refreshPendingMovementTokenVisibility(['observer'], {
      skipPerceptionRefresh: true,
      targetTokenIds: ['target'],
    });

    expect(target.refresh).toHaveBeenCalledTimes(1);
    expect(target.detectionFilter).toEqual({ id: 'native-soundwave' });
    expect(target.detectionFilterMesh).toMatchObject({
      visible: true,
      renderable: true,
      alpha: 1,
    });
  });

  test('debug suppression skips pending movement visual refresh work', async () => {
    const runtimeState = await import('../../../scripts/services/runtime-state.js');
    setMovementPerformanceDiagnosticsEnabled(true);
    runtimeState.setSuppressPendingMovementVisualRefresh(true);
    resetPendingMovementPerformanceCounters();
    const target = createMockToken({ id: 'target', visible: true });
    target.refresh = jest.fn();
    global.canvas = {
      ...global.canvas,
      tokens: {
        placeables: [target],
      },
      perception: {
        update: jest.fn(),
      },
    };

    refreshPendingMovementTokenVisibility([], {
      source: 'unit-suppressed',
      targetTokenIds: ['target'],
    });

    expect(target.refresh).not.toHaveBeenCalled();
    expect(global.canvas.perception.update).not.toHaveBeenCalled();
    expect(getPendingMovementPerformanceSnapshot()).toEqual(
      expect.objectContaining({
        refreshCalls: 1,
        suppressedRefreshCalls: 1,
        tokensScanned: 0,
        tokensRefreshed: 0,
      }),
    );

    runtimeState.clearSuppressPendingMovementVisualRefresh();
  });

  test('completion refresh only scans pending movement affected targets', () => {
    jest.useFakeTimers();

    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'undetected', unrelated: 'observed' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    const unrelated = createMockToken({ id: 'unrelated', visible: true });
    for (const token of [target, unrelated]) {
      token.renderable = true;
      token.mesh = { visible: true, renderable: true, alpha: 1 };
      token.nameplate = { visible: true };
      token.refresh = jest.fn();
    }
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target, unrelated],
      },
      perception: {
        update: jest.fn(),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);

    expect(completePendingTokenMovement('observer')).toBe(true);
    expect(target.refresh).toHaveBeenCalledTimes(1);
    expect(unrelated.refresh).not.toHaveBeenCalled();
  });

  test('keeps completed movement target ids available for AVS batch-complete refresh', () => {
    jest.useFakeTimers();

    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'undetected', unrelated: 'observed' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    const unrelated = createMockToken({ id: 'unrelated', visible: true });
    for (const token of [target, unrelated]) {
      token.renderable = true;
      token.mesh = { visible: true, renderable: true, alpha: 1 };
      token.nameplate = { visible: true };
      token.refresh = jest.fn();
    }
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target, unrelated],
      },
      perception: {
        update: jest.fn(),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);
    expect(completePendingTokenMovement('observer')).toBe(true);

    expect(getPendingMovementRefreshTargetIds()).toEqual(['target']);
  });

  test('post-completion refresh targets pending movement affected tokens', () => {
    jest.useFakeTimers();

    const refreshTokenVisibility = jest.fn();
    schedulePostCompletionRenderRefreshes('observer', 1, {
      hasActivePendingMovementForObserver: () => false,
      hasRenderWork: () => true,
      getTargetTokenIds: () => ['target'],
      refreshTokenVisibility,
    });

    jest.advanceTimersByTime(100);

    expect(refreshTokenVisibility).toHaveBeenCalledWith([], {
      ignoreObservedGrace: true,
      skipPerceptionRefresh: true,
      source: 'post-completion-refresh',
      targetTokenIds: ['target'],
    });
  });

  test('post-completion refresh uses light cadence unless full cadence is requested', () => {
    jest.useFakeTimers();

    const refreshTokenVisibility = jest.fn();
    schedulePostCompletionRenderRefreshes('observer', 1, {
      hasActivePendingMovementForObserver: () => false,
      hasRenderWork: () => true,
      getTargetTokenIds: () => ['target'],
      refreshTokenVisibility,
    });

    jest.advanceTimersByTime(1200);

    expect(refreshTokenVisibility).toHaveBeenCalledTimes(1);
  });

  test('post-completion refresh keeps full cadence for sensitive visual work', () => {
    jest.useFakeTimers();

    const refreshTokenVisibility = jest.fn();
    schedulePostCompletionRenderRefreshes('observer', 1, {
      hasActivePendingMovementForObserver: () => false,
      hasRenderWork: () => true,
      getTargetTokenIds: () => ['target'],
      shouldUseFullPostCompletionRefreshCadence: () => true,
      refreshTokenVisibility,
    });

    jest.advanceTimersByTime(1200);

    expect(refreshTokenVisibility).toHaveBeenCalledTimes(1);
  });

  test('animation refresh uses light cadence unless full cadence is requested', () => {
    jest.useFakeTimers();

    const refreshTokenVisibility = jest.fn();
    scheduleAnimationRenderRefreshes('observer', 1, {
      getEntry: () => ({ serial: 1 }),
      getTargetTokenIds: () => ['target'],
      refreshTokenVisibility,
    });

    jest.advanceTimersByTime(500);

    expect(refreshTokenVisibility).toHaveBeenCalledTimes(1);
  });

  test('animation refresh keeps bounded full cadence for sensitive visual work', () => {
    jest.useFakeTimers();

    const refreshTokenVisibility = jest.fn();
    scheduleAnimationRenderRefreshes('observer', 1, {
      getEntry: () => ({ serial: 1 }),
      getTargetTokenIds: () => ['target'],
      shouldUseFullAnimationRefreshCadence: () => true,
      refreshTokenVisibility,
    });

    jest.advanceTimersByTime(500);

    expect(refreshTokenVisibility).toHaveBeenCalledTimes(2);
  });


  test('can refresh pending movement token visuals without refreshing perception', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.nameplate = { visible: true };
    target.refresh = jest.fn();
    const perceptionUpdate = jest.fn();
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      perception: {
        update: perceptionUpdate,
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);
    refreshPendingMovementTokenVisibility('observer', { skipPerceptionRefresh: true });

    expect(target.renderable).toBe(false);
    expect(target.refresh).not.toHaveBeenCalled();
    expect(perceptionUpdate).not.toHaveBeenCalled();
  });

  test('suppresses occlusion-only perception churn during pending movement window', () => {
    jest.useFakeTimers();
    const perceptionUpdate = jest.fn();
    const observer = createMockToken({ id: 'observer', controlled: true });
    global.canvas = {
      ...global.canvas,
      tokens: {
        controlled: [observer],
        placeables: [observer],
      },
      perception: {
        update: perceptionUpdate,
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer]);
    global.canvas.perception.update({ refreshOcclusion: true });
    global.canvas.perception.update({ refreshVision: true });

    expect(perceptionUpdate).toHaveBeenCalledTimes(1);
    expect(perceptionUpdate).toHaveBeenCalledWith({ refreshVision: true });
  });

  test('keeps vision-bearing perception updates during pending movement window', () => {
    jest.useFakeTimers();
    const perceptionUpdate = jest.fn();
    const observer = createMockToken({ id: 'observer', controlled: true });
    global.canvas = {
      ...global.canvas,
      tokens: {
        controlled: [observer],
        placeables: [observer],
      },
      perception: {
        update: perceptionUpdate,
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer]);
    global.canvas.perception.update({ refreshVision: true, refreshOcclusion: true });
    global.canvas.perception.update({
      initializeVisionModes: false,
      refreshVision: true,
      refreshOcclusion: true,
    });
    global.canvas.perception.update({
      refreshVision: true,
      refreshSounds: true,
      refreshOcclusion: true,
    });

    expect(perceptionUpdate).toHaveBeenCalledTimes(3);
    expect(perceptionUpdate).toHaveBeenNthCalledWith(1, {
      refreshVision: true,
      refreshOcclusion: true,
    });
    expect(perceptionUpdate).toHaveBeenNthCalledWith(2, {
      initializeVisionModes: false,
      refreshVision: true,
      refreshOcclusion: true,
    });
    expect(perceptionUpdate).toHaveBeenCalledWith({
      refreshVision: true,
      refreshSounds: true,
      refreshOcclusion: true,
    });
  });

  test('renews occlusion-only suppression when committed movement animation starts', () => {
    jest.useFakeTimers();
    const perceptionUpdate = jest.fn();
    const observer = createMockToken({ id: 'observer', controlled: true });
    observer.document.object = observer;
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        controlled: [observer],
        placeables: [observer],
      },
      perception: {
        update: perceptionUpdate,
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer]);
    jest.advanceTimersByTime(2600);
    expect(global.canvas.perception.update).toBe(perceptionUpdate);

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer]);
    jest.advanceTimersByTime(1300);
    expect(schedulePendingTokenMovementCompletion(observer.document)).toBe(true);
    global.canvas.perception.update({ refreshOcclusion: true });
    global.canvas.perception.update({ refreshVision: true });

    expect(perceptionUpdate).toHaveBeenCalledTimes(1);
    expect(perceptionUpdate).toHaveBeenCalledWith({ refreshVision: true });
    jest.advanceTimersByTime(2600);
    expect(global.canvas.perception.update).toBe(perceptionUpdate);
    global.canvas.perception.update({ refreshVision: true });
    expect(perceptionUpdate).toHaveBeenCalledTimes(2);
    expect(perceptionUpdate).toHaveBeenLastCalledWith({ refreshVision: true });
  });

  test('keeps committed movement vision perception during core animation bypass', () => {
    jest.useFakeTimers();
    const perceptionUpdate = jest.fn();
    const observer = createMockToken({ id: 'observer', controlled: true });
    observer.document.object = observer;
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        controlled: [observer],
        placeables: [observer],
      },
      perception: {
        update: perceptionUpdate,
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer]);
    expect(schedulePendingTokenMovementCompletion(observer.document)).toBe(true);
    global.canvas.perception.update({
      initializeVisionModes: false,
      refreshVision: true,
      refreshLighting: true,
    });
    global.canvas.perception.update({
      refreshVision: true,
      refreshSounds: true,
      refreshOcclusion: true,
    });
    global.canvas.perception.update({
      refreshSounds: true,
      refreshOcclusionMask: true,
      refreshOcclusionStates: true,
    });

    expect(perceptionUpdate).toHaveBeenCalledTimes(3);
    expect(perceptionUpdate).toHaveBeenNthCalledWith(1, {
      initializeVisionModes: false,
      refreshVision: true,
      refreshLighting: true,
    });
    expect(perceptionUpdate).toHaveBeenNthCalledWith(2, {
      refreshVision: true,
      refreshSounds: true,
      refreshOcclusion: true,
    });
    expect(perceptionUpdate).toHaveBeenNthCalledWith(3, {
      refreshSounds: true,
      refreshOcclusionMask: true,
      refreshOcclusionStates: true,
    });
    jest.advanceTimersByTime(2600);
    expect(global.canvas.perception.update).toBe(perceptionUpdate);
    global.canvas.perception.update({
      refreshSounds: true,
      refreshOcclusionMask: true,
      refreshOcclusionStates: true,
    });
    expect(perceptionUpdate).toHaveBeenCalledTimes(4);
    expect(perceptionUpdate).toHaveBeenLastCalledWith({
      refreshSounds: true,
      refreshOcclusionMask: true,
      refreshOcclusionStates: true,
    });
  });

  test('refreshes movement vision mask without full visibility restriction during core animation', () => {
    jest.useFakeTimers();
    const renderFlags = new Set();
    renderFlags.set = function setRenderFlags(flags) {
      for (const [key, value] of Object.entries(flags ?? {})) {
        if (value !== true) continue;
        this.add(key);
        if (key === 'refreshVision') {
          this.add('refreshVisionSources');
          this.add('refreshOcclusionMask');
        }
        if (key === 'refreshLighting') {
          this.add('refreshLightSources');
        }
      }
      return this;
    };
    renderFlags.clear = function clearRenderFlags() {
      const flags = {};
      for (const flag of this) flags[flag] = true;
      Set.prototype.clear.call(this);
      return flags;
    };
    const perceptionUpdate = jest.fn((flags) => renderFlags.set(flags));
    const applyRenderFlags = jest.fn();
    const observer = createMockToken({ id: 'observer', controlled: true });
    observer.document.object = observer;
    global.canvas = {
      ...global.canvas,
      effects: {
        lightSources: new Map(),
        refreshLightSources: jest.fn(),
        refreshLighting: jest.fn(),
        refreshVisionSources: jest.fn(),
        visionSources: [{ active: true, object: observer }],
      },
      masks: {
        occlusion: {
          _updateOcclusionMask: jest.fn(),
          _updateOccludedObjects: jest.fn(),
          _updateOccludedSurfaces: jest.fn(),
          _updateOccludableTokens: jest.fn(),
        },
      },
      perception: {
        applyRenderFlags,
        renderFlags,
        update: perceptionUpdate,
      },
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        controlled: [observer],
        placeables: [observer],
      },
      visibility: {
        initialized: true,
        refresh: jest.fn(),
        refreshVisibility: jest.fn(),
        restrictVisibility: jest.fn(),
        tokenVision: true,
        visible: false,
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer]);
    expect(schedulePendingTokenMovementCompletion(observer.document)).toBe(true);

    global.canvas.perception.update({
      initializeVisionModes: false,
      refreshLighting: true,
      refreshVision: true,
    });
    global.canvas.perception.applyRenderFlags();

    expect(applyRenderFlags).not.toHaveBeenCalled();
    expect(global.canvas.effects.refreshLightSources).toHaveBeenCalledTimes(1);
    expect(global.canvas.effects.refreshLighting).toHaveBeenCalledTimes(1);
    expect(global.canvas.effects.refreshVisionSources).toHaveBeenCalledTimes(1);
    expect(global.canvas.visibility.refreshVisibility).toHaveBeenCalledTimes(1);
    expect(global.canvas.visibility.restrictVisibility).not.toHaveBeenCalled();
    expect(global.canvas.visibility.visible).toBe(true);
  });

  test('keeps committed movement vision mask updating on animation frames', () => {
    jest.useFakeTimers();
    const originalRequestAnimationFrame = global.requestAnimationFrame;
    const originalCancelAnimationFrame = global.cancelAnimationFrame;

    const observer = createMockToken({ id: 'observer', controlled: true, x: 0, y: 0 });
    observer.document.object = observer;
    observer.x = 0;
    observer.y = 0;
    global.requestAnimationFrame = jest.fn((callback) =>
      setTimeout(() => {
        observer.x = Math.min(100, observer.x + 25);
        observer.center = { x: observer.x + 25, y: 25 };
        callback(Date.now());
      }, 16),
    );
    global.cancelAnimationFrame = jest.fn((id) => clearTimeout(id));

    global.canvas = {
      ...global.canvas,
      effects: {
        lightSources: new Map(),
        refreshLightSources: jest.fn(),
        refreshLighting: jest.fn(),
        refreshVisionSources: jest.fn(),
        visionSources: [{ active: true, object: observer }],
      },
      masks: {
        occlusion: {
          _updateOcclusionMask: jest.fn(),
        },
      },
      perception: {
        applyRenderFlags: jest.fn(),
        renderFlags: new Set(),
        update: jest.fn(),
      },
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        controlled: [observer],
        placeables: [observer],
      },
      visibility: {
        initialized: true,
        refresh: jest.fn(),
        refreshVisibility: jest.fn(),
        restrictVisibility: jest.fn(),
        tokenVision: true,
        visible: false,
      },
    };

    try {
      setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer]);
      expect(schedulePendingTokenMovementCompletion(observer.document)).toBe(true);

      jest.advanceTimersByTime(80);

      expect(global.canvas.effects.refreshVisionSources).not.toHaveBeenCalled();
      expect(global.canvas.visibility.refreshVisibility).toHaveBeenCalledTimes(4);
      expect(global.canvas.visibility.restrictVisibility).not.toHaveBeenCalled();
      expect(global.canvas.effects.refreshLightSources).not.toHaveBeenCalled();
      expect(global.canvas.effects.refreshLighting).not.toHaveBeenCalled();
    } finally {
      global.requestAnimationFrame = originalRequestAnimationFrame;
      global.cancelAnimationFrame = originalCancelAnimationFrame;
    }
  });

  test('does not restore undetected token rendering during a transient observer lookup gap', () => {
    jest.useFakeTimers();

    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.nameplate = { visible: true };
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      perception: {
        update: jest.fn(),
      },
    };

    expect(forceTokenInvisibleForObserverVisibility(observer, target, 'undetected')).toBe(true);
    global.canvas.tokens.get = jest.fn(() => null);
    global.canvas.tokens.placeables = [target];

    expect(restorePendingMovementTokenRendering(target)).toBe(false);
    expect(target.renderable).toBe(false);
    expect(target.mesh.renderable).toBe(false);
    expect(target.mesh.alpha).toBe(0);
    expect(target.nameplate.visible).toBe(false);

    jest.advanceTimersByTime(1001);

    expect(restorePendingMovementTokenRendering(target)).toBe(true);
    expect(target.renderable).toBe(true);
    expect(target.mesh.renderable).toBe(true);
    expect(target.mesh.alpha).toBe(1);
    expect(target.nameplate.visible).toBe(true);
  });

  test('does not restore undetected token rendering from a remembered force decision', () => {
    jest.useFakeTimers();

    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', visible: false });
    target.renderable = false;
    target.mesh = { visible: false, renderable: false, alpha: 0 };
    target.nameplate = { visible: false };
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      perception: {
        update: jest.fn(),
      },
    };

    expect(forceTokenInvisibleForObserverVisibility(observer, target, 'undetected')).toBe(true);
    target._pf2eVisionerPendingRenderState = {
      tokenRenderable: true,
      meshRenderable: true,
      meshAlpha: 1,
      surfaceVisibility: [{ name: 'nameplate', surface: target.nameplate, visible: true }],
    };
    global.canvas.tokens.get = jest.fn(() => null);
    global.canvas.tokens.placeables = [target];

    expect(restorePendingMovementTokenRendering(target)).toBe(false);
    expect(target.renderable).toBe(false);
    expect(target.mesh.renderable).toBe(false);
    expect(target.mesh.alpha).toBe(0);
    expect(target.nameplate.visible).toBe(false);

    jest.advanceTimersByTime(1001);

    expect(restorePendingMovementTokenRendering(target)).toBe(true);
    expect(target.renderable).toBe(true);
    expect(target.mesh.renderable).toBe(true);
    expect(target.mesh.alpha).toBe(1);
    expect(target.nameplate.visible).toBe(true);
  });

  test('does not clear remembered undetected rendering during a later wall-only force check', () => {
    jest.useFakeTimers();

    const observer = createMockToken({
      id: 'observer',
      x: 0,
      y: 0,
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const other = createMockToken({ id: 'other', x: 0, y: 0 });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: false });
    target.document.getVisibilityTestPoints = jest.fn(() => [{ x: 175, y: 25 }]);
    target.renderable = false;
    target.mesh = { visible: false, renderable: false, alpha: 0 };
    target.nameplate = { visible: false };
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => {
          if (id === 'observer') return observer;
          if (id === 'other') return other;
          return null;
        }),
        placeables: [observer, other, target],
      },
      effects: {
        visionSources: [{ active: true, object: other }],
        lightSources: [],
      },
      visibility: {
        testVisibility: jest.fn(() => true),
      },
      perception: {
        update: jest.fn(),
      },
    };

    expect(forceTokenInvisibleForObserverVisibility(observer, target, 'undetected')).toBe(true);
    target._pf2eVisionerPendingRenderState = {
      tokenRenderable: true,
      meshRenderable: true,
      meshAlpha: 1,
      surfaceVisibility: [{ name: 'nameplate', surface: target.nameplate, visible: true }],
    };
    setPendingTokenMovementPosition(other.document, { x: 0, y: 0 }, [other]);
    expect(shouldTemporarilyForceTokenInvisible(target)).toBe(false);
    clearPendingTokenMovementPosition('other');
    global.canvas.tokens.get = jest.fn(() => null);
    global.canvas.tokens.placeables = [target];
    global.canvas.effects.visionSources = [];

    expect(restorePendingMovementTokenRendering(target)).toBe(false);
    expect(target.renderable).toBe(false);
    expect(target.mesh.renderable).toBe(false);
    expect(target.mesh.alpha).toBe(0);
    expect(target.nameplate.visible).toBe(false);
  });

  test('restores undetected token rendering immediately when observer state becomes observed', () => {
    jest.useFakeTimers();

    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', visible: false });
    target.renderable = false;
    target.mesh = { visible: false, renderable: false, alpha: 0 };
    target.nameplate = { visible: false };
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      perception: {
        update: jest.fn(),
      },
    };

    expect(forceTokenInvisibleForObserverVisibility(observer, target, 'undetected')).toBe(true);
    target._pf2eVisionerPendingRenderState = {
      tokenRenderable: true,
      meshRenderable: true,
      meshAlpha: 1,
      surfaceVisibility: [{ name: 'nameplate', surface: target.nameplate, visible: true }],
    };
    observer.document.getFlag.mockReturnValue(visibilityV2Map({ target: 'observed' }));

    expect(restorePendingMovementTokenRendering(target)).toBe(true);
    expect(target.renderable).toBe(true);
    expect(target.mesh.renderable).toBe(true);
    expect(target.mesh.alpha).toBe(1);
    expect(target.nameplate.visible).toBe(true);
  });

  test('restores observed token rendering while other pending movement is active', () => {
    jest.useFakeTimers();

    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.nameplate = { visible: true };
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      perception: {
        update: jest.fn(),
      },
    };

    expect(forceTokenInvisibleForObserverVisibility(observer, target, 'undetected')).toBe(true);
    observer.document.getFlag.mockReturnValue(visibilityV2Map({ target: 'observed' }));

    expect(restorePendingMovementTokenRendering(target)).toBe(true);
    expect(target.renderable).toBe(true);
    expect(target.mesh.renderable).toBe(true);
    expect(target.mesh.alpha).toBe(1);
    expect(target.nameplate.visible).toBe(true);
  });

  test('restoring observed token rendering preserves hidden level and target-pip chrome', () => {
    jest.useFakeTimers();

    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.levelIndicator = { visible: false };
    target.targetPips = { visible: false };
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      perception: {
        update: jest.fn(),
      },
    };

    expect(forceTokenInvisibleForObserverVisibility(observer, target, 'undetected')).toBe(true);
    observer.document.getFlag.mockReturnValue(visibilityV2Map({ target: 'observed' }));

    expect(restorePendingMovementTokenRendering(target)).toBe(true);
    expect(target.renderable).toBe(true);
    expect(target.mesh.renderable).toBe(true);
    expect(target.levelIndicator.visible).toBe(false);
    expect(target.targetPips.visible).toBe(false);
  });

  test('hides transient level indicator chrome after refreshing observed pending target', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'observed' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.levelIndicator = { visible: false };
    target.refresh = jest.fn(() => {
      target.levelIndicator.visible = true;
    });
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        controlled: [observer],
        placeables: [observer, target],
      },
      perception: {
        update: jest.fn(),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);
    refreshPendingMovementTokenVisibility('observer', {
      skipPerceptionRefresh: true,
      targetTokenIds: ['target'],
    });

    expect(target.refresh).toHaveBeenCalledTimes(1);
    expect(target.levelIndicator.visible).toBe(false);
  });

  test('restores concealed observed token rendering immediately after Visioner-hidden movement upgrade', () => {
    jest.useFakeTimers();

    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.nameplate = { visible: true };
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      perception: {
        update: jest.fn(),
      },
    };

    expect(forceTokenInvisibleForObserverVisibility(observer, target, 'undetected')).toBe(true);
    observer.document.getFlag.mockReturnValue({
      target: {
        detectionState: 'observed',
        hasConcealment: true,
      },
    });

    expect(restorePendingMovementTokenRendering(target)).toBe(true);
    expect(target.renderable).toBe(true);
    expect(target.mesh.renderable).toBe(true);
    expect(target.mesh.alpha).toBe(1);
    expect(target.nameplate.visible).toBe(true);
  });

  test('restores token rendering after pending movement clears and target becomes observed', () => {
    jest.useFakeTimers();

    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.nameplate = { visible: true };
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      perception: {
        update: jest.fn(),
      },
    };

    expect(forceTokenInvisibleForObserverVisibility(observer, target, 'undetected')).toBe(true);
    observer.document.getFlag.mockReturnValue(visibilityV2Map({ target: 'observed' }));

    expect(restorePendingMovementTokenRendering(target)).toBe(true);
    expect(target.renderable).toBe(true);
    expect(target.mesh.renderable).toBe(true);
    expect(target.mesh.alpha).toBe(1);
    expect(target.nameplate.visible).toBe(true);
  });

  test('does not keep render lock from stale legacy hidden when canonical state is observed', () => {
    jest.useFakeTimers();

    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: {
        'pf2e-visioner': {
          visibility: {
            target: 'hidden',
          },
        },
      },
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.nameplate = { visible: true };
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer, target],
      },
      perception: {
        update: jest.fn(),
      },
    };

    expect(forceTokenInvisibleForObserverVisibility(observer, target, 'undetected')).toBe(true);
    expect(restorePendingMovementTokenRendering(target, { ignoreObservedGrace: true })).toBe(true);
    expect(target.renderable).toBe(true);
    expect(target.mesh.renderable).toBe(true);
    expect(target.mesh.alpha).toBe(1);
    expect(target.nameplate.visible).toBe(true);
  });

  test('does not restore token rendering while controlled observer still has target undetected', () => {
    jest.useFakeTimers();

    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.nameplate = { visible: true };
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        controlled: [observer],
        placeables: [observer, target],
      },
      perception: {
        update: jest.fn(),
      },
    };

    expect(forceTokenInvisibleForObserverVisibility(observer, target, 'undetected')).toBe(true);
    jest.advanceTimersByTime(300);

    expect(restorePendingMovementTokenRendering(target)).toBe(false);
    expect(target.renderable).toBe(false);
    expect(target.mesh.renderable).toBe(false);
    expect(target.mesh.alpha).toBe(0);
    expect(target.nameplate.visible).toBe(false);
  });

  test('does not wait for detection filter when controlled observer state settles back to hidden', () => {
    jest.useFakeTimers();

    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.nameplate = { visible: true };
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        controlled: [observer],
        placeables: [observer, target],
      },
      perception: {
        update: jest.fn(),
      },
    };

    observer.document.getFlag.mockImplementation((moduleId, key) => {
      if (moduleId !== 'pf2e-visioner') return null;
      if (key === 'visibilityV2') return visibilityV2Map({ target: 'hidden' });
      return {};
    });
    expect(forceTokenInvisibleForObserverVisibility(observer, target, 'hidden')).toBe(false);

    expect(restorePendingMovementTokenRendering(target)).toBe(false);
    expect(target.visible).toBe(true);
    expect(target.renderable).toBe(true);
    expect(target.mesh.visible).toBe(true);
    expect(target.mesh.renderable).toBe(true);
    expect(target.mesh.alpha).toBe(1);
    expect(target.nameplate.visible).toBe(true);

    target.detectionFilter = { id: 'soundwave-filter' };

    expect(restorePendingMovementTokenRendering(target)).toBe(false);
    expect(target.visible).toBe(true);
    expect(target.renderable).toBe(true);
    expect(target.mesh.visible).toBe(true);
    expect(target.mesh.renderable).toBe(true);
    expect(target.mesh.alpha).toBe(1);
    expect(target.nameplate.visible).toBe(true);
  });

  test('keeps newly hidden target visible before detection filter is ready', () => {
    jest.useFakeTimers();

    const observer = createMockToken({ id: 'observer' });
    const target = createMockToken({ id: 'target', visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.nameplate = { visible: true };
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        controlled: [observer],
        placeables: [observer, target],
      },
      perception: {
        update: jest.fn(),
      },
    };

    expect(forceTokenInvisibleForObserverVisibility(observer, target, 'hidden')).toBe(false);
    expect(target.visible).toBe(true);
    expect(target.renderable).toBe(true);
    expect(target.mesh.visible).toBe(true);
    expect(target.mesh.renderable).toBe(true);
    expect(target.mesh.alpha).toBe(1);
    expect(target.nameplate.visible).toBe(true);
    expect(restorePendingMovementTokenRendering(target)).toBe(false);
    expect(restorePendingMovementTokenRendering(target, { ignoreObserverLocks: true })).toBe(false);

    target.detectionFilter = { id: 'soundwave-filter' };

    expect(restorePendingMovementTokenRendering(target)).toBe(false);
    expect(target.visible).toBe(true);
    expect(target.renderable).toBe(true);
    expect(target.mesh.visible).toBe(true);
    expect(target.mesh.renderable).toBe(true);
    expect(target.nameplate.visible).toBe(true);
  });

  test('does not force newly hidden target invisible while stale stored state is undetected', () => {
    const observer = createMockToken({
      id: 'observer',
      flags: {
        'pf2e-visioner': {
          visibilityV2: {
            target: {
              detectionState: 'undetected',
              hasConcealment: false,
              coverState: 'none',
            },
          },
        },
      },
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.nameplate = { visible: true };
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        controlled: [observer],
        placeables: [observer, target],
      },
      perception: {
        update: jest.fn(),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);

    expect(forceTokenInvisibleForObserverVisibility(observer, target, 'hidden')).toBe(false);
    expect(target.visible).toBe(true);
    expect(target.renderable).toBe(true);
    expect(target.mesh.visible).toBe(true);
    expect(target.mesh.renderable).toBe(true);
    expect(target.mesh.alpha).toBe(1);
    expect(target.nameplate.visible).toBe(true);
  });

  test('does not create filter-pending hidden lock before undetected render lock', () => {
    jest.useFakeTimers();

    const observer = createMockToken({ id: 'observer', x: 0, y: 0 });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.nameplate = { visible: true };
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        controlled: [observer],
        placeables: [observer, target],
      },
      perception: {
        update: jest.fn(),
      },
    };

    expect(forceTokenInvisibleForObserverVisibility(observer, target, 'hidden')).toBe(false);
    expect(target.visible).toBe(true);
    expect(target.renderable).toBe(true);
    expect(target.mesh.visible).toBe(true);
    expect(target.mesh.renderable).toBe(true);
    expect(target.mesh.alpha).toBe(1);

    expect(forceTokenInvisibleForObserverVisibility(observer, target, 'undetected')).toBe(true);
    expect(target.visible).toBe(false);
    expect(target.renderable).toBe(false);
    expect(target.mesh.visible).toBe(false);
    expect(target.mesh.renderable).toBe(false);
    expect(target.mesh.alpha).toBe(0);
  });

  test('keeps newly hidden target renderable while detection filter is missing', () => {
    jest.useFakeTimers();

    const observer = createMockToken({ id: 'observer' });
    const target = createMockToken({ id: 'target', visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.nameplate = { visible: true };
    target.refresh = jest.fn(() => {
      target.visible = true;
      target.renderable = true;
      target.mesh.visible = true;
      target.mesh.renderable = true;
      target.mesh.alpha = 1;
      target.nameplate.visible = true;
    });
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        controlled: [observer],
        placeables: [observer, target],
      },
      perception: {
        update: jest.fn(),
      },
    };

    expect(forceTokenInvisibleForObserverVisibility(observer, target, 'hidden')).toBe(false);

    refreshPendingMovementTokenVisibility([], { targetTokenIds: ['target'] });

    expect(target.visible).toBe(true);
    expect(target.renderable).toBe(true);
    expect(target.mesh.visible).toBe(true);
    expect(target.mesh.renderable).toBe(true);
    expect(target.mesh.alpha).toBe(1);

    target.detectionFilter = { id: 'soundwave-filter' };
    refreshPendingMovementTokenVisibility([], { targetTokenIds: ['target'] });

    expect(target.visible).toBe(true);
    expect(target.renderable).toBe(true);
    expect(target.mesh.visible).toBe(true);
  });

  test('skips token refresh for already render-hidden locked targets', () => {
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.nameplate = { visible: true };
    target.refresh = jest.fn(() => {
      target.visible = true;
      target.renderable = true;
      target.mesh.visible = true;
      target.mesh.renderable = true;
      target.mesh.alpha = 1;
      target.nameplate.visible = true;
    });
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        controlled: [observer],
        placeables: [observer, target],
      },
      perception: {
        update: jest.fn(),
      },
    };

    expect(forceTokenInvisibleForObserverVisibility(observer, target, 'undetected')).toBe(true);

    refreshPendingMovementTokenVisibility([], { targetTokenIds: ['target'] });

    expect(target.refresh).not.toHaveBeenCalled();
    expect(target.visible).toBe(false);
    expect(target.renderable).toBe(false);
    expect(target.mesh.visible).toBe(false);
    expect(target.mesh.renderable).toBe(false);
    expect(target.mesh.alpha).toBe(0);
  });

  test('does not delete hidden detection filter without render lock', () => {
    jest.useFakeTimers();

    const observer = createMockToken({ id: 'observer' });
    const target = createMockToken({ id: 'target', visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        controlled: [observer],
        placeables: [observer, target],
      },
      perception: {
        update: jest.fn(),
      },
    };

    expect(forceTokenInvisibleForObserverVisibility(observer, target, 'hidden')).toBe(false);

    const detectionFilterState = capturePendingMovementDetectionFilterState(target, {
      hasDetectionWork: true,
    });
    const soundwaveFilter = { id: 'soundwave-filter' };
    target.detectionFilter = soundwaveFilter;

    expect(restorePendingMovementTokenRendering(target)).toBe(false);
    restorePendingMovementDetectionFilterState(target, detectionFilterState);

    expect(target.detectionFilter).toBe(soundwaveFilter);
  });

  test('suppresses hidden soundwave while controlled pending observer has current sight line without final prediction', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    const soundwaveFilter = { id: 'stale-soundwave-filter' };
    target.detectionFilter = soundwaveFilter;
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer]);

    expect(currentPendingMovementSightLineSeesTarget(observer, target)).toBe(true);
    expect(shouldSuppressPendingMovementDetectionFilterVisuals(target)).toBe(true);
    expect(capturePendingMovementDetectionFilterState(target, { hasDetectionWork: true })).toBeNull();

    refreshPendingMovementTokenVisibility(['observer'], {
      skipPerceptionRefresh: true,
      targetTokenIds: ['target'],
    });

    expect(target.detectionFilter).toBe(soundwaveFilter);
    expect(target.detectionFilterMesh).toMatchObject({
      visible: true,
      renderable: true,
      alpha: 1,
    });
  });

  test('keeps completed movement sight-line grace until AVS reveal catches up', () => {
    jest.useFakeTimers();
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.detectionFilter = { id: 'stale-soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        controlled: [observer],
        placeables: [observer, target],
      },
      perception: {
        update: jest.fn(),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer], {
      finalVisibilityStatesByTargetId: { target: 'concealed' },
    });

    jest.advanceTimersByTime(1100);
    expect(completePendingTokenMovement('observer')).toBe(true);

    expect(shouldSuppressPendingMovementDetectionFilterVisuals(target)).toBe(true);
  });

  test('does not scan wall geometry for current sight-line soundwave suppression without limited walls', () => {
    let geometryReads = 0;
    global.canvas.walls.placeables = Array.from({ length: 1000 }, (_, index) => ({
      document: {
        id: `normal-wall-${index}`,
        get c() {
          geometryReads += 1;
          return [10000 + index, 0, 10000 + index, 100];
        },
        sight: WALL_SENSE_TYPES.NORMAL,
        sound: WALL_SENSE_TYPES.NORMAL,
        door: 0,
        ds: 0,
      },
    }));
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.detectionFilter = { id: 'stale-soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: [
          {
            active: true,
            object: observer,
            los: { contains: jest.fn(() => true) },
          },
        ],
        lightSources: [],
      },
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer], {
      finalVisibilityStatesByTargetId: { target: 'undetected' },
    });

    expect(shouldSuppressPendingMovementDetectionFilterVisuals(target)).toBe(true);
    expect(geometryReads).toBe(0);
  });

  test('keeps hidden soundwave during drag before pending movement entry exists', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.detectionFilter = { id: 'stale-soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    expect(shouldSuppressPendingMovementDetectionFilterVisuals(target)).toBe(false);
    expect(capturePendingMovementDetectionFilterState(target, { hasDetectionWork: true })).not.toBeNull();
  });

  test('prefers live dragged observer position over stale canvas token position', () => {
    const staleObserver = createMockToken({
      id: 'observer',
      x: 0,
      y: 0,
      controlled: true,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const draggedObserver = createMockToken({
      id: 'observer',
      x: 200,
      y: 0,
      controlled: true,
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.detectionFilter = { id: 'stale-soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      walls: {
        placeables: [
          {
            document: {
              id: 'wall',
              c: [100, 0, 100, 200],
              sight: 1,
              door: 0,
              ds: 0,
            },
          },
        ],
      },
      tokens: {
        get: jest.fn((id) =>
          id === 'observer' ? staleObserver : id === 'target' ? target : null,
        ),
        _draggedToken: draggedObserver,
        controlled: [staleObserver],
        placeables: [staleObserver, target],
      },
    };

    setPendingTokenMovementPosition(staleObserver.document, { x: 200, y: 0 }, [staleObserver]);

    expect(shouldSuppressPendingMovementDetectionFilterVisuals(target)).toBe(true);
  });

  test('uses active core LOS source before fallback wall geometry', () => {
    const observer = createMockToken({
      id: 'observer',
      x: 0,
      y: 0,
      controlled: true,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.detectionFilter = { id: 'stale-soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: new Map([
          [
            'observer',
            {
              active: true,
              object: observer,
              los: { contains: jest.fn(() => true) },
            },
          ],
        ]),
        lightSources: new Map(),
      },
      walls: {
        placeables: [
          {
            document: {
              id: 'wall',
              c: [100, 0, 100, 200],
              sight: 1,
              door: 0,
              ds: 0,
            },
          },
        ],
      },
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer], {
      finalVisibilityStatesByTargetId: { target: 'undetected' },
    });

    expect(shouldSuppressPendingMovementDetectionFilterVisuals(target)).toBe(true);
  });

  test('does not override active LOS polygon miss with moving token geometry', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      x: 0,
      y: 0,
      controlled: true,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.detectionFilter = { id: 'stale-soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: new Map([
          [
            'observer',
            {
              active: true,
              object: observer,
              los: { contains: jest.fn(() => false) },
            },
          ],
        ]),
        lightSources: new Map(),
      },
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer], {
      finalVisibilityStatesByTargetId: { target: 'undetected' },
    });

    expect(shouldSuppressPendingMovementDetectionFilterVisuals(target)).toBe(false);
  });

  test('does not use Visioner edge samples to override a core LOS polygon miss', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.document.getVisibilityTestPoints = jest.fn(() => [target.center]);
    target.detectionFilter = { id: 'soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: new Map([
          [
            'observer',
            {
              active: true,
              object: observer,
              los: { contains: jest.fn((x) => x < target.center.x) },
              shape: { contains: jest.fn((x) => x < target.center.x) },
            },
          ],
        ]),
        lightSources: new Map(),
      },
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    expect(currentPendingMovementSightLineSeesTarget(observer, target)).toBe(false);
    expect(shouldSuppressPendingMovementDetectionFilterVisuals(target)).toBe(false);
  });

  test('restores core-visible undetected render lock without token refresh stall', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      x: 100,
      y: 0,
      controlled: true,
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    observer._animation = { state: 'running', promise: Promise.resolve() };
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.levelIndicator = { visible: false };
    target.targetPips = { visible: false };
    target.refresh = jest.fn();
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: new Map([
          [
            'observer',
            {
              active: true,
              object: observer,
              los: { contains: jest.fn(() => false) },
            },
          ],
        ]),
        lightSources: new Map(),
      },
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    expect(forceTokenInvisibleForObserverVisibility(observer, target, 'undetected')).toBe(true);
    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer], {
      finalVisibilityStatesByTargetId: { target: 'observed' },
    });
    refreshPendingMovementTokenVisibility(['observer'], {
      skipPerceptionRefresh: true,
      targetTokenIds: ['target'],
    });

    expect(target.refresh).not.toHaveBeenCalled();
    expect(target.visible).toBe(true);
    expect(target.renderable).toBe(true);
    expect(target.mesh.visible).toBe(true);
    expect(target.mesh.renderable).toBe(true);
    expect(target._pf2eVisionerPendingRenderState).toBeUndefined();

  });

  test('keeps invisible undetected render lock during core-visible observer movement refresh', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      x: 100,
      y: 0,
      controlled: true,
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    observer._animation = { state: 'running', promise: Promise.resolve() };
    const target = createMockToken({
      id: 'target',
      x: 3,
      y: 0,
      visible: true,
      actor: {
        hasCondition: jest.fn((slug) => slug === 'invisible'),
        system: { conditions: { invisible: { active: true } } },
      },
    });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.refresh = jest.fn();
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: new Map([
          [
            'observer',
            {
              active: true,
              object: observer,
              los: { contains: jest.fn(() => true) },
              shape: { contains: jest.fn(() => true) },
            },
          ],
        ]),
        lightSources: new Map(),
      },
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
      visibility: {
        testVisibility: jest.fn(() => true),
      },
    };

    expect(forceTokenInvisibleForObserverVisibility(observer, target, 'undetected')).toBe(true);
    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer], {
      finalVisibilityStatesByTargetId: { target: 'observed' },
    });
    refreshPendingMovementTokenVisibility(['observer'], {
      skipPerceptionRefresh: true,
      targetTokenIds: ['target'],
    });

    expect(target.refresh).not.toHaveBeenCalled();
    expect(target.visible).toBe(false);
    expect(target.renderable).toBe(false);
    expect(target.mesh.visible).toBe(false);
    expect(target.mesh.renderable).toBe(false);
    expect(target._pf2eVisionerPendingRenderState).toBeDefined();
  });

  test('keeps core-owned undetected render lock without token refresh while current LOS is blocked', () => {
    global.canvas.walls.placeables = [
      createMockWall({ id: 'wall', c: [100, 0, 100, 200], sight: 1, sound: 0 }),
    ];
    const observer = createMockToken({
      id: 'observer',
      x: 0,
      y: 0,
      controlled: true,
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    observer._animation = { state: 'running', promise: Promise.resolve() };
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.refresh = jest.fn();
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: new Map([
          [
            'observer',
            {
              active: true,
              object: observer,
              los: { contains: jest.fn(() => false) },
            },
          ],
        ]),
        lightSources: new Map(),
      },
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    expect(forceTokenInvisibleForObserverVisibility(observer, target, 'undetected')).toBe(true);
    setPendingTokenMovementPosition(observer.document, { x: 150, y: 0 }, [observer], {
      finalVisibilityStatesByTargetId: { target: 'observed' },
    });
    refreshPendingMovementTokenVisibility(['observer'], {
      skipPerceptionRefresh: true,
      targetTokenIds: ['target'],
    });

    expect(target.refresh).not.toHaveBeenCalled();
    expect(target.visible).toBe(false);
    expect(target.renderable).toBe(false);
    expect(target.mesh.visible).toBe(false);
    expect(target.mesh.renderable).toBe(false);
    expect(target._pf2eVisionerPendingRenderState).toBeDefined();
  });

  test('suppresses hidden soundwave when zero-sight observer has active vision source containing target', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      vision: { enabled: true, range: 0, angle: 360 },
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.detectionFilter = { id: 'stale-soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: new Map([
          [
            'observer',
            {
              active: true,
              object: observer,
              los: { contains: jest.fn(() => true) },
            },
          ],
        ]),
        lightSources: new Map(),
      },
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer], {
      finalVisibilityStatesByTargetId: { target: 'undetected' },
    });

    expect(shouldSuppressPendingMovementDetectionFilterVisuals(target)).toBe(true);
  });

  test('keeps hidden soundwave when zero-sight observer light source overlaps target', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      vision: { enabled: true, range: 0, angle: 360 },
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.detectionFilter = { id: 'soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: new Map(),
        lightSources: new Map([
          [
            'observer-light',
            {
              active: true,
              object: observer,
              los: { contains: jest.fn(() => true) },
              shape: { contains: jest.fn(() => true) },
            },
          ],
        ]),
      },
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer], {
      finalVisibilityStatesByTargetId: { target: 'undetected' },
    });

    expect(currentPendingMovementSightLineSeesTarget(observer, target)).toBe(false);
    expect(shouldSuppressPendingMovementDetectionFilterVisuals(target)).toBe(false);
    expect(capturePendingMovementDetectionFilterState(target, { hasDetectionWork: true })).not.toBeNull();
  });

  test('keeps hidden soundwave from current sight line when final state is still hidden', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.detectionFilter = { id: 'stale-soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer], {
      finalVisibilityStatesByTargetId: { target: 'hidden' },
    });

    expect(shouldSuppressPendingMovementDetectionFilterVisuals(target)).toBe(false);
    expect(capturePendingMovementDetectionFilterState(target, { hasDetectionWork: true })).not.toBeNull();
  });

  test('uses current sight line for hidden soundwave even when final movement state is undetected', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.detectionFilter = { id: 'soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer], {
      finalVisibilityStatesByTargetId: { target: 'undetected' },
    });

    expect(shouldSuppressPendingMovementDetectionFilterVisuals(target)).toBe(true);
  });

  test('keeps clear-sight hidden soundwave suppression briefly after movement completes', () => {
    jest.useFakeTimers();
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.detectionFilter = { id: 'stale-soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer], {
      finalVisibilityStatesByTargetId: { target: 'undetected' },
    });
    expect(shouldSuppressPendingMovementDetectionFilterVisuals(target)).toBe(true);

    expect(completePendingTokenMovement('observer')).toBe(true);
    global.canvas.tokens._draggedToken = null;

    expect(shouldSuppressPendingMovementDetectionFilterVisuals(target)).toBe(true);

    jest.advanceTimersByTime(2001);

    expect(shouldSuppressPendingMovementDetectionFilterVisuals(target)).toBe(false);
  });

  test('drops clear-sight grace when current hidden sight line becomes wall-blocked', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.detectionFilter = { id: 'soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer], {
      finalVisibilityStatesByTargetId: { target: 'undetected' },
    });
    expect(shouldSuppressPendingMovementDetectionFilterVisuals(target)).toBe(true);

    global.canvas.walls.placeables = [
      createMockWall({ id: 'wall', c: [100, 0, 100, 200], sight: 1, sound: 0 }),
    ];

    expect(shouldSuppressPendingMovementDetectionFilterVisuals(target)).toBe(false);
  });

  test('keeps hidden soundwave despite observed-transition suppression when current sight is blocked', () => {
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.detectionFilter = { id: 'soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };
    suppressPendingMovementDetectionFilterVisualsForObservedTransition(target, {
      durationMs: 1000,
    });

    expect(shouldSuppressPendingMovementDetectionFilterVisuals(target)).toBe(false);
  });

  test('suppresses stale soundwave when current controlled observer sees target as observed', () => {
    const staleObserver = createMockToken({
      id: 'stale-observer',
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const currentObserver = createMockToken({
      id: 'current-observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'observed' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.detectionFilter = { id: 'stale-soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: new Map([
          [
            'current-observer',
            {
              active: true,
              object: currentObserver,
              los: { contains: jest.fn(() => true) },
            },
          ],
        ]),
        lightSources: new Map(),
      },
      tokens: {
        get: jest.fn((id) =>
          id === 'stale-observer'
            ? staleObserver
            : id === 'current-observer'
              ? currentObserver
              : id === 'target'
                ? target
                : null,
        ),
        _draggedToken: null,
        controlled: [currentObserver],
        placeables: [staleObserver, currentObserver, target],
      },
    };

    expect(shouldSuppressPendingMovementDetectionFilterVisuals(target)).toBe(true);
  });

  test('clears stale soundwave visuals when no observer is selected', () => {
    const target = createMockToken({ id: 'target', visible: true });
    target.detectionFilter = { id: 'stale-soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'target' ? target : null)),
        controlled: [],
        placeables: [target],
      },
    };

    expect(clearNoObserverDetectionFilterVisuals()).toBe(1);
    expect(target.detectionFilter).toBeNull();
    expect(target.detectionFilterMesh).toMatchObject({
      visible: false,
      renderable: false,
      alpha: 0,
    });
  });

  test('keeps soundwave visuals while an observer is selected', () => {
    const observer = createMockToken({ id: 'observer', controlled: true });
    const target = createMockToken({ id: 'target', visible: true });
    target.detectionFilter = { id: 'soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) =>
          id === 'observer' ? observer : id === 'target' ? target : null,
        ),
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    expect(clearNoObserverDetectionFilterVisuals()).toBe(0);
    expect(target.detectionFilter).toEqual({ id: 'soundwave-filter' });
    expect(target.detectionFilterMesh).toMatchObject({
      visible: true,
      renderable: true,
      alpha: 1,
    });
  });

  test('keeps core soundwave while observed state waits for wall-blocked movement update', () => {
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'observed' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.detectionFilter = { id: 'core-soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };
    suppressPendingMovementDetectionFilterVisualsForObservedTransition(target, {
      durationMs: 1000,
    });

    expect(shouldSuppressPendingMovementDetectionFilterVisuals(target)).toBe(false);
  });

  test('keeps core soundwave after movement completes while observed state waits for hidden write', () => {
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'observed' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.detectionFilter = { id: 'core-soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    target.refresh = jest.fn();
    global.canvas = {
      ...global.canvas,
      walls: {
        placeables: [
          {
            document: {
              id: 'sight-wall',
              c: [100, -100, 100, 100],
              sight: 1,
              sound: 0,
              door: 0,
              ds: 0,
            },
          },
        ],
      },
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: null,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer], {
      finalVisibilityStatesByTargetId: { target: 'hidden' },
    });
    completePendingTokenMovement('observer');

    expect(target.detectionFilter).toEqual({ id: 'core-soundwave-filter' });
    expect(target.detectionFilterMesh).toMatchObject({
      visible: true,
      renderable: true,
      alpha: 1,
    });
  });

  test('lets core render soundwave when observed target leaves current sight line before state update', () => {
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'observed' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.detectionFilter = null;
    target.detectionFilterMesh = { visible: false, renderable: false, alpha: 0 };
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };
    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);

    expect(shouldSuppressPendingMovementDetectionFilterVisuals(target)).toBe(false);
  });

  test('refreshes targets during controlled drag intent so core LOS can add soundwaves before movement end', () => {
    jest.useFakeTimers();
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'observed' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.detectionFilter = null;
    target.detectionFilterMesh = { visible: false, renderable: false, alpha: 0 };
    target.refresh = jest.fn(() => {
      target.detectionFilter = { id: 'core-soundwave-filter' };
      target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    });
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: null,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    primePendingControlledTokenDragIntent(observer);
    jest.advanceTimersByTime(100);

    expect(target.refresh).toHaveBeenCalled();
    expect(target.detectionFilter).toEqual({ id: 'core-soundwave-filter' });
    expect(target.detectionFilterMesh).toMatchObject({
      visible: true,
      renderable: true,
      alpha: 1,
    });
  });

  test('refreshes observed targets immediately when current LOS still contains them but darkness blocks sight', () => {
    jest.useFakeTimers();
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'observed' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.detectionFilter = null;
    target.detectionFilterMesh = { visible: false, renderable: false, alpha: 0 };
    target.refresh = jest.fn(() => {
      target.detectionFilter = { id: 'darkness-soundwave-filter' };
      target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    });

    const lightingSpy = jest.spyOn(LightingCalculator, 'getInstance').mockReturnValue({
      getLightLevelAt: jest.fn((position, token) => ({
        level: token?.id === 'target' ? 'darkness' : 'bright',
      })),
    });
    const visionSpy = jest.spyOn(VisionAnalyzer, 'getInstance').mockReturnValue({
      getVisionCapabilities: jest.fn(() => ({
        hasVision: true,
        hasDarkvision: false,
        hasLowLightVision: false,
        hasGreaterDarkvision: false,
      })),
    });

    try {
      global.canvas = {
        ...global.canvas,
        effects: {
          visionSources: new Map([
            [
              'observer',
              {
                active: true,
                object: observer,
                los: { contains: jest.fn(() => true) },
                shape: { contains: jest.fn(() => true) },
              },
            ],
          ]),
          lightSources: new Map(),
        },
        tokens: {
          get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
          _draggedToken: observer,
          controlled: [observer],
          placeables: [observer, target],
        },
      };

      expect(currentPendingMovementSightLineSeesTarget(observer, target)).toBe(false);

      primePendingControlledTokenDragIntent(observer);
      jest.advanceTimersByTime(100);

      expect(target.refresh).toHaveBeenCalled();
      expect(target.detectionFilter).toEqual({ id: 'darkness-soundwave-filter' });
    } finally {
      lightingSpy.mockRestore();
      visionSpy.mockRestore();
    }
  });

  test('refreshes observed targets as soon as moving observer LOS becomes blocked', () => {
    jest.useFakeTimers();
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'observed' }),
    });
    observer.document.object = observer;
    const target = createMockToken({ id: 'target', x: 0, y: 0, visible: true });
    target.detectionFilter = null;
    target.detectionFilterMesh = { visible: false, renderable: false, alpha: 0 };
    target.refresh = jest.fn(() => {
      target.detectionFilter = { id: 'core-soundwave-filter' };
      target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    });

    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: new Map([
          [
            'observer',
            {
              active: true,
              object: observer,
              los: { contains: jest.fn(() => false) },
              shape: { contains: jest.fn(() => false) },
            },
          ],
        ]),
        lightSources: new Map(),
      },
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer]);
    observer.x = 100;
    observer.center = { x: 125, y: 25 };
    observer.getCenterPoint.mockReturnValue(observer.center);
    observer.document.x = 100;
    expect(schedulePendingTokenMovementCompletion(observer.document)).toBe(true);

    jest.advanceTimersByTime(50);

    expect(target.refresh).toHaveBeenCalled();
    expect(target.detectionFilter).toEqual({ id: 'core-soundwave-filter' });
  });

  test('starts observed-to-hidden refresh cadence from pending movement preupdate', () => {
    jest.useFakeTimers();
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'observed' }),
    });
    observer.document.object = observer;
    const target = createMockToken({ id: 'target', x: 0, y: 0, visible: true });
    target.refresh = jest.fn(() => {
      target.detectionFilter = { id: 'core-soundwave-filter' };
    });
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: new Map([
          [
            'observer',
            {
              active: true,
              object: observer,
              los: { contains: jest.fn(() => false) },
              shape: { contains: jest.fn(() => false) },
            },
          ],
        ]),
        lightSources: new Map(),
      },
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer]);
    observer.x = 100;
    observer.center = { x: 125, y: 25 };
    observer.getCenterPoint.mockReturnValue(observer.center);
    observer.document.x = 100;
    jest.advanceTimersByTime(50);

    expect(target.refresh).toHaveBeenCalled();
    expect(target.detectionFilter).toEqual({ id: 'core-soundwave-filter' });
  });

  test('hides undetected targets during pre-drag controlled intent without refreshing them', () => {
    jest.useFakeTimers();
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.refresh = jest.fn();
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: null,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    primePendingControlledTokenDragIntent(observer);
    jest.advanceTimersByTime(500);

    expect(target.refresh).not.toHaveBeenCalled();
    expect(target.visible).toBe(false);
    expect(target.renderable).toBe(false);
    expect(target.mesh).toMatchObject({
      visible: false,
      renderable: false,
      alpha: 0,
    });
  });

  test('keeps wall-blocked undetected target hidden during held controlled drag refreshes', () => {
    jest.useFakeTimers();
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.refresh = jest.fn(() => {
      target.visible = true;
      target.renderable = true;
      target.mesh.visible = true;
      target.mesh.renderable = true;
      target.mesh.alpha = 1;
    });
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: new Map([
          [
            'observer',
            {
              active: true,
              object: observer,
              los: { contains: jest.fn(() => false) },
              shape: { contains: jest.fn(() => false) },
            },
          ],
        ]),
        lightSources: new Map(),
      },
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    primePendingControlledTokenDragIntent(observer);
    jest.advanceTimersByTime(50);

    expect(target.refresh).not.toHaveBeenCalled();
    expect(target.visible).toBe(false);
    expect(target.renderable).toBe(false);
    expect(target.mesh).toMatchObject({
      visible: false,
      renderable: false,
      alpha: 0,
    });
  });

  test('reveals non-invisible undetected target during held drag when current LOS sees it', () => {
    global.canvas.walls.placeables = [
      createMockWall({ id: 'wall', c: [100, 0, 100, 200], sight: 1, sound: 0 }),
    ];
    let currentLosContainsTarget = true;
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: new Map([
          [
            'observer',
            {
              active: true,
              object: observer,
              los: { contains: jest.fn(() => currentLosContainsTarget) },
              shape: { contains: jest.fn(() => currentLosContainsTarget) },
            },
          ],
        ]),
        lightSources: new Map(),
      },
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    expect(forceTokenInvisibleForObserverVisibility(observer, target, 'undetected')).toBe(true);
    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer], {
      finalVisibilityStatesByTargetId: { target: 'undetected' },
    });
    expect(target.visible).toBe(false);

    currentLosContainsTarget = false;
    expect(shouldTemporarilyForceTokenInvisible(target)).toBe(true);

    currentLosContainsTarget = true;
    expect(currentPendingMovementSightLineSeesTarget(observer, target)).toBe(true);
    expect(shouldUseCoreDetectionDuringPendingMovement(observer, target)).toBe(true);
    expect(shouldTemporarilyForceTokenInvisible(target)).toBe(false);

    refreshPendingMovementTokenVisibility(['observer'], {
      skipPerceptionRefresh: true,
      targetTokenIds: ['target'],
    });

    expect(target.visible).toBe(true);
    expect(target.renderable).toBe(true);
    expect(target.mesh).toMatchObject({
      visible: true,
      renderable: true,
      alpha: 1,
    });
  });

  test('refreshes non-invisible undetected target when controlled drag LOS changes after timer burst', () => {
    jest.useFakeTimers();
    global.canvas.walls.placeables = [
      createMockWall({ id: 'wall', c: [100, 0, 100, 200], sight: 1, sound: 0 }),
    ];
    let currentLosContainsTarget = false;
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.refresh = jest.fn();
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: new Map([
          [
            'observer',
            {
              active: true,
              object: observer,
              los: { contains: jest.fn(() => currentLosContainsTarget) },
              shape: { contains: jest.fn(() => currentLosContainsTarget) },
            },
          ],
        ]),
        lightSources: new Map(),
      },
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    expect(forceTokenInvisibleForObserverVisibility(observer, target, 'undetected')).toBe(true);
    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer], {
      finalVisibilityStatesByTargetId: { target: 'undetected' },
    });
    primePendingControlledTokenDragIntent(observer);
    jest.advanceTimersByTime(1000);

    expect(target.visible).toBe(false);
    expect(target.refresh).not.toHaveBeenCalled();

    currentLosContainsTarget = true;

    expect(
      refreshPendingControlledTokenDragIntent(observer, { includeRenderHiddenTargets: true }),
    ).toBe(true);
    expect(target.visible).toBe(true);
    expect(target.renderable).toBe(true);
    expect(target.mesh).toMatchObject({
      visible: true,
      renderable: true,
      alpha: 1,
    });
  });

  test('skips observed targets already inside current LOS during controlled drag intent refreshes', () => {
    jest.useFakeTimers();
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'observed' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.refresh = jest.fn();
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: new Map([
          [
            'observer',
            {
              active: true,
              object: observer,
              los: { contains: jest.fn(() => true) },
              shape: { contains: jest.fn(() => true) },
            },
          ],
        ]),
        lightSources: new Map(),
      },
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    expect(currentPendingMovementSightLineSeesTarget(observer, target)).toBe(true);

    primePendingControlledTokenDragIntent(observer);
    jest.advanceTimersByTime(500);

    expect(target.refresh).not.toHaveBeenCalled();
  });

  test('clears observed soundwave target once current LOS contains it', () => {
    jest.useFakeTimers();
    global.canvas.walls.placeables = [];
    let currentLosContainsTarget = false;
    const observer = createMockToken({
      id: 'observer-los-change',
      controlled: true,
      flags: visibilityV2Flags({ 'target-los-change': 'observed' }),
    });
    const target = createMockToken({ id: 'target-los-change', x: 3, y: 0, visible: true });
    target.detectionFilter = { id: 'soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    target.refresh = jest.fn();
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: new Map([
          [
            'observer-los-change',
            {
              active: true,
              object: observer,
              los: { contains: jest.fn(() => currentLosContainsTarget) },
              shape: { contains: jest.fn(() => currentLosContainsTarget) },
            },
          ],
        ]),
        lightSources: new Map(),
      },
      tokens: {
        get: jest.fn((id) =>
          id === 'observer-los-change' ? observer : id === 'target-los-change' ? target : null,
        ),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    expect(target.detectionFilter).toEqual({ id: 'soundwave-filter' });
    primePendingControlledTokenDragIntent(observer);
    jest.advanceTimersByTime(16);
    expect(target.detectionFilter).toEqual({ id: 'soundwave-filter' });

    jest.advanceTimersByTime(34);
    expect(target.detectionFilter).toEqual({ id: 'soundwave-filter' });

    currentLosContainsTarget = true;
    jest.advanceTimersByTime(34);
    expect(target.detectionFilter).toBeNull();
  });

  test('keeps hidden soundwave while controlled pending observer sight line remains wall-blocked', () => {
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.detectionFilter = { id: 'soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer]);

    expect(shouldSuppressPendingMovementDetectionFilterVisuals(target)).toBe(false);
    expect(capturePendingMovementDetectionFilterState(target, { hasDetectionWork: true })).not.toBeNull();
  });

  test('keeps hidden soundwave while blinded moving observer light overlaps target', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      actor: {
        hasCondition: jest.fn((slug) => slug === 'blinded'),
      },
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.detectionFilter = { id: 'soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: [],
        lightSources: [
          {
            active: true,
            object: observer,
            los: { contains: jest.fn(() => true) },
            shape: { contains: jest.fn(() => true) },
          },
        ],
      },
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer]);

    expect(currentPendingMovementSightLineSeesTarget(observer, target)).toBe(false);
    expect(shouldSuppressPendingMovementDetectionFilterVisuals(target)).toBe(false);
    expect(capturePendingMovementDetectionFilterState(target, { hasDetectionWork: true })).not.toBeNull();
  });

  test('refreshes wall-blocked hidden soundwave targets without freezing animation', () => {
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    const soundwaveFilter = { id: 'soundwave-filter', animated: true };
    target.detectionFilter = soundwaveFilter;
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    const perceptionUpdate = jest.fn();
    target.refresh = jest.fn(() => {
      global.canvas.perception.update({ refreshOcclusion: true });
      global.canvas.perception.update({ refreshVision: true });
      target.detectionFilter = { id: 'recomputed-soundwave-filter', animated: true };
    });
    global.canvas = {
      ...global.canvas,
      perception: { update: perceptionUpdate },
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer]);
    refreshPendingMovementTokenVisibility(['observer'], { skipPerceptionRefresh: true });
    flushScheduledCanvasPerceptionUpdate();

    expect(target.refresh).toHaveBeenCalledTimes(1);
    expect(perceptionUpdate).not.toHaveBeenCalled();
    expect(target.detectionFilter).not.toBe(soundwaveFilter);
    expect(target.detectionFilter).toMatchObject({ id: 'recomputed-soundwave-filter' });
    expect(target.detectionFilter.animated).toBe(true);
  });

  test('clears stale soundwave when pending final observed target enters current sight line', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.detectionFilter = { id: 'stale-soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    target.refresh = jest.fn();
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer], {
      finalVisibilityStatesByTargetId: { target: 'observed' },
    });
    refreshPendingMovementTokenVisibility(['observer'], { skipPerceptionRefresh: true });

    expect(target.refresh).not.toHaveBeenCalled();
    expect(target.detectionFilter).toBeNull();
    expect(target.detectionFilterMesh).toMatchObject({
      visible: false,
      renderable: false,
      alpha: 0,
    });
  });

  test('clears observed soundwave then recreates animated hidden soundwave when returning behind same wall', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.detectionFilter = { id: 'stale-soundwave-filter', animated: true };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    target.refresh = jest.fn(() => {
      target.detectionFilter = {
        id: 'returned-hidden-soundwave-filter',
        animated: true,
        uniforms: { wave: true },
      };
      target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    });
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer], {
      finalVisibilityStatesByTargetId: { target: 'observed' },
    });
    refreshPendingMovementTokenVisibility(['observer'], { skipPerceptionRefresh: true });

    expect(target.refresh).not.toHaveBeenCalled();
    expect(target.detectionFilter).toBeNull();
    expect(target.detectionFilterMesh).toMatchObject({
      visible: false,
      renderable: false,
      alpha: 0,
    });

    global.canvas.walls.placeables = [
      createMockWall({ id: 'wall', c: [100, 0, 100, 200], sight: 1, sound: 0 }),
    ];
    observer.document.update({ flags: visibilityV2Flags({ target: 'hidden' }) });
    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer], {
      finalVisibilityStatesByTargetId: { target: 'hidden' },
    });
    refreshPendingMovementTokenVisibility(['observer'], { skipPerceptionRefresh: true });

    expect(target.refresh).toHaveBeenCalledTimes(1);
    expect(target.detectionFilter).toMatchObject({
      id: 'returned-hidden-soundwave-filter',
      animated: true,
      uniforms: { wave: true },
    });
    expect(target.detectionFilterMesh).toMatchObject({
      visible: true,
      renderable: true,
      alpha: 1,
    });
  });

  test('keeps pending final observed soundwave while current sight line remains blocked', () => {
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const soundwaveFilter = { id: 'wall-blocked-soundwave-filter' };
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.detectionFilter = soundwaveFilter;
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    target.refresh = jest.fn();
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer], {
      finalVisibilityStatesByTargetId: { target: 'observed' },
    });
    refreshPendingMovementTokenVisibility(['observer'], { skipPerceptionRefresh: true });

    expect(target.detectionFilter).toBe(soundwaveFilter);
    expect(target.detectionFilterMesh).toMatchObject({
      visible: true,
      renderable: true,
      alpha: 1,
    });
  });

  test('clears pending final observed soundwave once moving observer reaches destination', () => {
    global.canvas.walls.placeables = [
      createMockWall({ id: 'wall', c: [100, 0, 100, 200], sight: 1, sound: 0 }),
    ];
    const observer = createMockToken({
      id: 'observer',
      x: 100,
      y: 0,
      controlled: true,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.detectionFilter = { id: 'stale-soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    target.refresh = jest.fn();
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer], {
      finalVisibilityStatesByTargetId: { target: 'observed' },
    });
    refreshPendingMovementTokenVisibility(['observer'], { skipPerceptionRefresh: true });

    expect(target.refresh).not.toHaveBeenCalled();
    expect(target.detectionFilter).toBeNull();
    expect(target.detectionFilterMesh).toMatchObject({
      visible: false,
      renderable: false,
      alpha: 0,
    });
  });

  test('clears stale current-view observed soundwave after movement settles even when sight line helper is blocked', () => {
    global.canvas.walls.placeables = [
      createMockWall({ id: 'wall', c: [100, 0, 100, 200], sight: 1, sound: 0 }),
    ];
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'observed' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.detectionFilter = { id: 'stale-soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    target.refresh = jest.fn();
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: null,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    refreshPendingMovementTokenVisibility([], {
      skipPerceptionRefresh: true,
      targetTokenIds: ['target'],
    });

    expect(target.refresh).not.toHaveBeenCalled();
    expect(target.detectionFilter).toBeNull();
    expect(target.detectionFilterMesh).toMatchObject({
      visible: false,
      renderable: false,
      alpha: 0,
    });
  });

  test('clears predicted observed soundwave as pending movement completes before map write settles', () => {
    global.canvas.walls.placeables = [
      createMockWall({ id: 'wall', c: [100, 0, 100, 200], sight: 1, sound: 0 }),
    ];
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.detectionFilter = { id: 'stale-soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: null,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer], {
      finalVisibilityStatesByTargetId: { target: 'observed' },
    });
    completePendingTokenMovement('observer');

    expect(target.detectionFilter).toBeNull();
    expect(target.detectionFilterMesh).toMatchObject({
      visible: false,
      renderable: false,
      alpha: 0,
    });
  });

  test('keeps token refresh when hidden soundwave target is no longer wall-blocked', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.detectionFilter = { id: 'soundwave-filter', animated: true };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    target.refresh = jest.fn();
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer]);
    refreshPendingMovementTokenVisibility(['observer'], { skipPerceptionRefresh: true });

    expect(target.refresh).toHaveBeenCalledTimes(1);
  });

  test('does not suppress undetected soundwave while current sight line remains blocked', () => {
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.detectionFilter = { id: 'soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: new Map([
          [
            'observer',
            {
              active: true,
              object: observer,
              los: { contains: jest.fn(() => false) },
              shape: { contains: jest.fn(() => false) },
            },
          ],
        ]),
        lightSources: new Map(),
      },
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer]);

    expect(shouldSuppressPendingMovementDetectionFilterVisuals(target)).toBe(false);
  });

  test('keeps native soundwave filter recomputed from stale hidden mesh-only state', () => {
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.detectionFilter = null;
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    const soundwaveFilter = { id: 'native-soundwave-filter' };
    target.refresh = jest.fn(() => {
      target.detectionFilter = soundwaveFilter;
      target.detectionFilterMesh.visible = true;
      target.detectionFilterMesh.renderable = true;
      target.detectionFilterMesh.alpha = 1;
    });
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        controlled: [observer],
        placeables: [observer, target],
      },
      perception: {
        update: jest.fn(),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer]);
    refreshPendingMovementTokenVisibility('observer');

    expect(target.refresh).toHaveBeenCalledTimes(1);
    expect(target.detectionFilter).toBe(soundwaveFilter);
    expect(target.detectionFilterMesh).toMatchObject({
      visible: true,
      renderable: true,
      alpha: 1,
    });
  });

  test('does not render-lock newly hidden target when detection filter already exists', () => {
    const observer = createMockToken({ id: 'observer' });
    const target = createMockToken({ id: 'target', visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.detectionFilter = { id: 'soundwave-filter' };
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    expect(forceTokenInvisibleForObserverVisibility(observer, target, 'hidden')).toBe(false);
    expect(target.visible).toBe(true);
    expect(target.renderable).toBe(true);
    expect(target.mesh.visible).toBe(true);
  });

  test('render-locks hidden loot and hazard tokens instead of keeping soundwave rendering', () => {
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({
        loot: 'hidden',
        hazard: 'hidden',
        npc: 'hidden',
      }),
    });
    const loot = createMockToken({
      id: 'loot',
      actor: createMockActor({ type: 'loot' }),
      visible: true,
    });
    const hazard = createMockToken({
      id: 'hazard',
      actor: createMockActor({ type: 'hazard' }),
      visible: true,
    });
    const npc = createMockToken({
      id: 'npc',
      actor: createMockActor({ type: 'npc' }),
      visible: true,
    });
    for (const token of [loot, hazard, npc]) {
      token.renderable = true;
      token.mesh = { visible: true, renderable: true, alpha: 1 };
      token.detectionFilter = { id: `${token.id}-soundwave` };
    }
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) =>
          id === 'observer'
            ? observer
            : id === 'loot'
              ? loot
              : id === 'hazard'
                ? hazard
                : id === 'npc'
                  ? npc
                  : null,
        ),
        controlled: [observer],
        placeables: [observer, loot, hazard, npc],
      },
    };

    expect(targetIsRenderHiddenForCurrentViewObserver(loot)).toBe(true);
    expect(targetIsRenderHiddenForCurrentViewObserver(hazard)).toBe(true);
    expect(targetIsRenderHiddenForCurrentViewObserver(npc)).toBe(false);

    expect(forceTokenInvisibleForObserverVisibility(observer, loot, 'hidden')).toBe(true);
    expect(forceTokenInvisibleForObserverVisibility(observer, hazard, 'hidden')).toBe(true);
    expect(forceTokenInvisibleForObserverVisibility(observer, npc, 'hidden')).toBe(false);
    expect(loot).toMatchObject({
      visible: false,
      renderable: false,
      detectionFilter: null,
      mesh: { visible: false, renderable: false, alpha: 0 },
    });
    expect(hazard).toMatchObject({
      visible: false,
      renderable: false,
      detectionFilter: null,
      mesh: { visible: false, renderable: false, alpha: 0 },
    });
    expect(npc.visible).toBe(true);
  });

  test('restores undetected render lock when observer perspective is intentionally cleared', () => {
    jest.useFakeTimers();

    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.nameplate = { visible: true };
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        controlled: [],
        placeables: [observer, target],
      },
      perception: {
        update: jest.fn(),
      },
    };

    expect(forceTokenInvisibleForObserverVisibility(observer, target, 'undetected')).toBe(true);

    expect(restorePendingMovementTokenRendering(target)).toBe(false);
    expect(restorePendingMovementTokenRendering(target, { ignoreObserverLocks: true })).toBe(true);
    expect(target.visible).toBe(true);
    expect(target.renderable).toBe(true);
    expect(target.mesh.visible).toBe(true);
    expect(target.mesh.renderable).toBe(true);
    expect(target.mesh.alpha).toBe(1);
    expect(target.nameplate.visible).toBe(true);
  });

  test('keeps AVS-override hidden state during pending movement with full LOS', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({
      id: 'target',
      x: 3,
      y: 0,
      visible: true,
      flags: {
        'pf2e-visioner': {
          'avs-override-from-observer': { state: 'hidden', source: 'manual_action' },
        },
      },
    });
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: new Map([
          [
            'observer',
            {
              active: true,
              object: observer,
              los: { contains: jest.fn(() => true) },
              shape: { contains: jest.fn(() => true) },
            },
          ],
        ]),
        lightSources: new Map(),
      },
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer], {
      finalVisibilityStatesByTargetId: { target: 'observed' },
    });

    const context = getPendingMovementBlockContext(observer, target);
    expect(context.visibilityState).toBe('hidden');
  });

  test('keeps AVS-override undetected target render-locked during pending movement with full LOS', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({
      id: 'target',
      x: 3,
      y: 0,
      visible: true,
      flags: {
        'pf2e-visioner': {
          'avs-override-from-observer': { state: 'undetected', source: 'manual_action' },
        },
      },
    });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: new Map([
          [
            'observer',
            {
              active: true,
              object: observer,
              los: { contains: jest.fn(() => true) },
              shape: { contains: jest.fn(() => true) },
            },
          ],
        ]),
        lightSources: new Map(),
      },
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer], {
      finalVisibilityStatesByTargetId: { target: 'observed' },
    });

    expect(targetIsRenderHiddenForCurrentViewObserver(target)).toBe(true);
  });
});
