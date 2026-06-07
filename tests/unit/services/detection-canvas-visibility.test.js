import '../../setup.js';

import {
  clearPendingTokenMovementPosition,
  forceTokenInvisibleForObserverVisibility,
  schedulePendingTokenMovementCompletion,
  setPendingTokenMovementPosition,
  shouldHandlePendingMovementCanvasVisibilityForToken,
  shouldTemporarilyForceTokenInvisible,
} from '../../../scripts/services/PendingMovement/pending-token-movement.js';
import {
  getPendingMovementBlockedDetectionSources,
  shouldUseCoreDetectionDuringPendingMovement,
} from '../../../scripts/services/PendingMovement/pending-movement-detection-gate.js';
import { wrapCanvasVisibilityTest } from '../../../scripts/services/Detection/detection-canvas-visibility.js';
import { createCanDetectVisibilityWrapper } from '../../../scripts/services/Detection/detection-can-detect.js';
import { testDetectionModeVisibility } from '../../../scripts/services/Detection/detection-mode-visibility.js';
import { legacyVisibilityToProfile } from '../../../scripts/visibility/perception-profile.js';

function visibilityV2Flags(map) {
  return {
    'pf2e-visioner': {
      visibilityV2: Object.fromEntries(
        Object.entries(map).map(([targetId, state]) => [targetId, legacyVisibilityToProfile(state)]),
      ),
    },
  };
}

function hiddenSoundwaveChromeSurfaces(token) {
  return [
    token?.voidMesh,
    token?.border,
    token?.nameplate,
    token?.bars,
    token?.tooltip,
    token?.levelIndicator,
    token?.effects,
    token?.targetArrows,
    token?.targetPips,
    token?.turnMarker,
    token?.turnMarker?.mesh,
    token?.ring,
    token?.ring?.mesh,
    token?.ring?.subject,
  ].filter((surface) => surface && 'visible' in surface);
}

function attachHiddenSoundwaveChrome(token) {
  token.voidMesh = { visible: true };
  token.border = { visible: true };
  token.nameplate = { visible: true };
  token.bars = { visible: true };
  token.tooltip = { visible: true };
  token.levelIndicator = { visible: true };
  token.effects = { visible: true };
  token.targetArrows = { visible: true };
  token.targetPips = { visible: true };
  token.turnMarker = { visible: true, mesh: { visible: true } };
  token.ring = { visible: true, mesh: { visible: true }, subject: { visible: true } };
}

function setHiddenSoundwaveChromeVisible(token, visible) {
  for (const surface of hiddenSoundwaveChromeSurfaces(token)) {
    surface.visible = visible;
  }
}

function expectHiddenSoundwaveChromeHidden(token) {
  for (const surface of hiddenSoundwaveChromeSurfaces(token)) {
    expect(surface.visible).toBe(false);
  }
}

describe('canvas visibility wrapper', () => {
  let originalCanvas;

  beforeEach(() => {
    originalCanvas = global.canvas;
    global.game.settings.set('pf2e', 'gmVision', false);
    global.game.settings.set('pf2e-visioner', 'autoVisibilityEnabled', false);
  });

  afterEach(() => {
    clearPendingTokenMovementPosition('observer');
    global.game.settings.set('pf2e', 'gmVision', false);
    global.game.settings.set('pf2e-visioner', 'autoVisibilityEnabled', false);
    global.canvas = originalCanvas;
  });

  test('uses fast path for tokens unrelated to pending movement visibility work', () => {
    const observer = createMockToken({ id: 'observer' });
    const target = createMockToken({ id: 'target', visible: true });
    global.canvas = {
      ...global.canvas,
      effects: {
        get visionSources() {
          throw new Error('pending movement wrapper should not inspect detection sources');
        },
        lightSources: new Map(),
      },
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        placeables: [observer, target],
      },
    };
    const wrapped = jest.fn(() => true);

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer]);

    expect(shouldHandlePendingMovementCanvasVisibilityForToken(target)).toBe(false);
    expect(wrapCanvasVisibilityTest(wrapped, [{ x: 0, y: 0 }], { object: target })).toBe(true);
    expect(wrapped).toHaveBeenCalledTimes(1);
  });

  test('uses fast path for unrelated detection-filter tokens during pending movement', () => {
    const observer = createMockToken({ id: 'observer' });
    const target = createMockToken({
      id: 'target',
      flags: visibilityV2Flags({ observer: 'observed' }),
      visible: true,
    });
    target.detectionFilter = { id: 'unrelated-soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      effects: {
        get visionSources() {
          throw new Error('unrelated detection-filter token should not inspect detection sources');
        },
        lightSources: new Map(),
      },
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        placeables: [observer, target],
      },
    };
    const wrapped = jest.fn(() => true);

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer]);

    expect(wrapCanvasVisibilityTest(wrapped, [{ x: 0, y: 0 }], { object: target })).toBe(true);
    expect(wrapped).toHaveBeenCalledTimes(1);
  });

  test('restores detection filter visuals when stale undetected movement rejects core visibility result', () => {
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', visible: false });
    target.detectionFilterMesh = { visible: false, renderable: false, alpha: 0 };
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: new Map([['observer', { active: true, object: observer }]]),
        lightSources: new Map(),
      },
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        placeables: [observer, target],
      },
    };
    const wrapped = jest.fn(() => {
      target.detectionFilter = { id: 'core-soundwave-filter' };
      target.detectionFilterMesh.visible = true;
      target.detectionFilterMesh.renderable = true;
      target.detectionFilterMesh.alpha = 1;
      return true;
    });

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer]);

    expect(wrapCanvasVisibilityTest(wrapped, [{ x: 0, y: 0 }], { object: target })).toBe(false);
    expect(wrapped).toHaveBeenCalledTimes(1);
    expect(target.detectionFilter).toBeUndefined();
    expect(target.detectionFilterMesh).toMatchObject({
      visible: false,
      renderable: false,
      alpha: 0,
    });
  });

  test('GM Vision bypass keeps core canvas visibility result', () => {
    global.game.user.isGM = true;
    global.game.settings.set('pf2e-visioner', 'autoVisibilityEnabled', true);
    global.game.settings.set('pf2e', 'gmVision', true);
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', visible: false });
    target.detectionFilterMesh = { visible: false, renderable: false, alpha: 0 };
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: new Map([['observer', { active: true, object: observer }]]),
        lightSources: new Map(),
      },
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        placeables: [observer, target],
      },
    };
    const wrapped = jest.fn(() => {
      target.detectionFilter = { id: 'core-soundwave-filter' };
      target.detectionFilterMesh.visible = true;
      target.detectionFilterMesh.renderable = true;
      target.detectionFilterMesh.alpha = 1;
      return true;
    });

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer]);

    expect(wrapCanvasVisibilityTest(wrapped, [{ x: 0, y: 0 }], { object: target })).toBe(true);
    expect(wrapped).toHaveBeenCalledTimes(1);
    expect(target.detectionFilter).toEqual({ id: 'core-soundwave-filter' });
    expect(target.detectionFilterMesh).toMatchObject({
      visible: true,
      renderable: true,
      alpha: 1,
    });
  });

  test('GM Vision bypass keeps core can-detect result', () => {
    global.game.user.isGM = true;
    global.game.settings.set('pf2e-visioner', 'autoVisibilityEnabled', true);
    global.game.settings.set('pf2e', 'gmVision', true);
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target' });
    global.canvas = {
      ...global.canvas,
      tokens: {
        controlled: [observer],
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        placeables: [observer, target],
      },
    };
    const wrapped = jest.fn(() => true);
    const wrapper = createCanDetectVisibilityWrapper(2);

    expect(wrapper.call({ id: 'basicSight' }, wrapped, { object: observer }, target)).toBe(true);
    expect(wrapped).toHaveBeenCalledTimes(1);
  });

  test('core animation bypass keeps core can-detect result for hidden override targets', () => {
    jest.useFakeTimers();
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    observer.document.object = observer;
    const target = createMockToken({ id: 'target' });
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: new Map(),
        lightSources: new Map(),
      },
      tokens: {
        controlled: [observer],
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        placeables: [observer, target],
      },
    };
    const wrapped = jest.fn(() => true);
    const wrapper = createCanDetectVisibilityWrapper(2);

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer]);
    expect(schedulePendingTokenMovementCompletion(observer.document)).toBe(true);

    expect(wrapper.call({ id: 'basicSight' }, wrapped, { object: observer }, target)).toBe(true);
    expect(wrapped).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  test('GM Vision bypass keeps core detection-mode visibility result', () => {
    global.game.user.isGM = true;
    global.game.settings.set('pf2e-visioner', 'autoVisibilityEnabled', true);
    global.game.settings.set('pf2e', 'gmVision', true);
    const observer = createMockToken({ id: 'observer' });
    const target = createMockToken({ id: 'target' });
    target.document.getFlag = jest.fn((moduleId, key) =>
      moduleId === 'pf2e-visioner' && key === 'sneak-active' ? true : null,
    );
    const detectionMode = {
      id: 'basicSight',
      _canDetect: jest.fn(() => true),
      _testPoint: jest.fn(() => true),
    };

    expect(
      testDetectionModeVisibility.call(detectionMode, { object: observer }, { id: 'basicSight', enabled: true }, {
        object: target,
        tests: [{ x: 0, y: 0 }],
      }),
    ).toBe(true);
    expect(detectionMode._testPoint).toHaveBeenCalledTimes(1);
  });

  test('lets final undetected movement use the current core visibility result', () => {
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'observed' }),
    });
    const target = createMockToken({ id: 'target', visible: false });
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: new Map([['observer', { active: true, object: observer }]]),
        lightSources: new Map(),
      },
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        placeables: [observer, target],
      },
    };
    const wrapped = jest.fn(() => false);

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer], {
      finalVisibilityStatesByTargetId: { target: 'undetected' },
    });

    expect(wrapCanvasVisibilityTest(wrapped, [{ x: 0, y: 0 }], { object: target })).toBe(false);
    expect(wrapped).toHaveBeenCalledTimes(1);
  });

  test('bypasses Visioner canvas wrapper while probing core visibility for render-hidden movement', () => {
    const observer = createMockToken({
      id: 'observer',
      x: 100,
      y: 0,
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    observer._animation = { state: 'running', promise: Promise.resolve() };
    const target = createMockToken({ id: 'target', visible: false });
    target.document.getVisibilityTestPoints = jest.fn(() => [{ x: 125, y: 25 }]);
    target.renderable = false;
    target.mesh = { visible: false, renderable: false, alpha: 0 };

    const wrapped = jest.fn(() => true);
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: new Map([['observer', { active: true, object: observer }]]),
        lightSources: new Map(),
      },
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        controlled: [observer],
        placeables: [observer, target],
      },
      visibility: {
        testVisibility: (points, options) => wrapCanvasVisibilityTest(wrapped, points, options),
      },
    };

    forceTokenInvisibleForObserverVisibility(observer, target, 'undetected');
    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer]);

    expect(shouldTemporarilyForceTokenInvisible(target)).toBe(false);
    expect(wrapped).toHaveBeenCalledTimes(1);
  });

  test('suppresses soundwave filters from core visibility when Visioner state is observed', () => {
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'observed' }),
    });
    const target = createMockToken({ id: 'target', x: 4, visible: true });
    target.detectionFilter = { id: 'stale-soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: new Map(),
        lightSources: new Map(),
      },
      tokens: {
        controlled: [],
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        placeables: [observer, target],
      },
    };
    const wrapped = jest.fn(() => {
      expect(target.detectionFilter).toBeNull();
      expect(target.detectionFilterMesh).toMatchObject({
        visible: false,
        renderable: false,
        alpha: 0,
      });
      target.detectionFilter = { id: 'core-soundwave-filter' };
      target.detectionFilterMesh.visible = true;
      target.detectionFilterMesh.renderable = true;
      target.detectionFilterMesh.alpha = 1;
      return true;
    });

    const result = wrapCanvasVisibilityTest(wrapped, [{ x: 0, y: 0 }], { object: target });
    expect(wrapped).toHaveBeenCalledTimes(1);
    expect(result).toBe(true);
    expect(target.detectionFilter).toBeNull();
    expect(target.detectionFilterMesh).toMatchObject({
      visible: false,
      renderable: false,
      alpha: 0,
    });
  });

  test('preserves hidden soundwave filters during core visibility success', () => {
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', x: 4, visible: true });
    const soundwaveFilter = { id: 'soundwave-filter' };
    target.detectionFilter = soundwaveFilter;
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: new Map(),
        lightSources: new Map(),
      },
      tokens: {
        controlled: [],
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        placeables: [observer, target],
      },
    };
    const wrapped = jest.fn(() => {
      target.detectionFilter = null;
      return true;
    });

    expect(wrapCanvasVisibilityTest(wrapped, [{ x: 0, y: 0 }], { object: target })).toBe(true);
    expect(wrapped).toHaveBeenCalledTimes(1);
    expect(target.detectionFilter).toBe(soundwaveFilter);
  });

  test('keeps core hidden soundwave filter when mesh visual is already active', () => {
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: new Map(),
        lightSources: new Map(),
      },
      tokens: {
        controlled: [],
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        placeables: [observer, target],
      },
    };
    const wrapped = jest.fn(() => {
      target.detectionFilter = { id: 'core-soundwave-filter' };
      target.detectionFilterMesh.visible = true;
      target.detectionFilterMesh.renderable = true;
      target.detectionFilterMesh.alpha = 1;
      return true;
    });

    expect(wrapCanvasVisibilityTest(wrapped, [{ x: 0, y: 0 }], { object: target })).toBe(true);
    expect(wrapped).toHaveBeenCalledTimes(1);
    expect(target.detectionFilter).toEqual({ id: 'core-soundwave-filter' });
    expect(target.detectionFilterMesh).toMatchObject({
      visible: true,
      renderable: true,
      alpha: 1,
    });
  });

  test('forces canvas visibility for selected hidden soundwave targets outside core LOS', () => {
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({
      id: 'target',
      actor: createMockActor({ type: 'npc' }),
      visible: false,
    });
    target.renderable = false;
    target.mesh = { visible: false, renderable: false, alpha: 0 };
    const soundwaveFilter = { id: 'soundwave-filter' };
    target.detectionFilter = soundwaveFilter;
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    attachHiddenSoundwaveChrome(target);
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: new Map([['observer', { active: true, object: observer }]]),
        lightSources: new Map(),
      },
      tokens: {
        controlled: [observer],
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        placeables: [observer, target],
      },
    };
    const wrapped = jest.fn(() => {
      target.detectionFilter = null;
      target.detectionFilterMesh.visible = false;
      target.detectionFilterMesh.renderable = false;
      target.detectionFilterMesh.alpha = 0;
      target.renderable = false;
      target.mesh.visible = false;
      target.mesh.renderable = false;
      target.mesh.alpha = 0;
      setHiddenSoundwaveChromeVisible(target, true);
      return false;
    });

    expect(wrapCanvasVisibilityTest(wrapped, [{ x: 0, y: 0 }], { object: target })).toBe(true);
    expect(wrapped).toHaveBeenCalledTimes(1);
    expect(target.visible).toBe(true);
    expect(target.renderable).toBe(true);
    expect(target.mesh).toMatchObject({
      visible: true,
      renderable: true,
      alpha: 1,
    });
    expect(target.detectionFilter).toBe(soundwaveFilter);
    expect(target.detectionFilterMesh).toMatchObject({
      visible: true,
      renderable: true,
      alpha: 1,
    });
    expectHiddenSoundwaveChromeHidden(target);
  });

  test('forces canvas visibility for selected hidden soundwave targets during pending movement', () => {
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({
      id: 'target',
      actor: createMockActor({ type: 'npc' }),
      visible: false,
    });
    target.renderable = false;
    target.mesh = { visible: false, renderable: false, alpha: 0 };
    const soundwaveFilter = { id: 'soundwave-filter' };
    target.detectionFilter = soundwaveFilter;
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    attachHiddenSoundwaveChrome(target);
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: new Map([['observer', { active: true, object: observer }]]),
        lightSources: new Map(),
      },
      tokens: {
        controlled: [observer],
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        placeables: [observer, target],
      },
    };
    const wrapped = jest.fn(() => {
      target.detectionFilter = null;
      target.detectionFilterMesh.visible = false;
      target.detectionFilterMesh.renderable = false;
      target.detectionFilterMesh.alpha = 0;
      target.visible = false;
      target.renderable = false;
      target.mesh.visible = false;
      target.mesh.renderable = false;
      target.mesh.alpha = 0;
      setHiddenSoundwaveChromeVisible(target, true);
      return false;
    });

    forceTokenInvisibleForObserverVisibility(observer, target, 'hidden');
    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer], {
      finalVisibilityStatesByTargetId: { target: 'hidden' },
    });

    expect(wrapCanvasVisibilityTest(wrapped, [{ x: 0, y: 0 }], { object: target })).toBe(true);
    expect(wrapped).toHaveBeenCalledTimes(1);
    expect(target.visible).toBe(true);
    expect(target.renderable).toBe(true);
    expect(target.mesh).toMatchObject({
      visible: true,
      renderable: true,
      alpha: 1,
    });
    expect(target.detectionFilter).toBe(soundwaveFilter);
    expect(target.detectionFilterMesh).toMatchObject({
      visible: true,
      renderable: true,
      alpha: 1,
    });
    expectHiddenSoundwaveChromeHidden(target);
  });

  test('forces canvas visibility for selected hidden soundwave targets during core animation bypass', () => {
    jest.useFakeTimers();
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    observer.document.object = observer;
    const target = createMockToken({
      id: 'target',
      actor: createMockActor({ type: 'npc' }),
      visible: false,
    });
    target.renderable = false;
    target.mesh = { visible: false, renderable: false, alpha: 0 };
    const soundwaveFilter = { id: 'soundwave-filter' };
    target.detectionFilter = soundwaveFilter;
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    attachHiddenSoundwaveChrome(target);
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: new Map([['observer', { active: true, object: observer }]]),
        lightSources: new Map(),
      },
      perception: {
        update: jest.fn(),
      },
      tokens: {
        controlled: [observer],
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        placeables: [observer, target],
      },
    };
    const wrapped = jest.fn(() => {
      target.detectionFilter = null;
      target.detectionFilterMesh.visible = false;
      target.detectionFilterMesh.renderable = false;
      target.detectionFilterMesh.alpha = 0;
      target.visible = false;
      target.renderable = false;
      target.mesh.visible = false;
      target.mesh.renderable = false;
      target.mesh.alpha = 0;
      setHiddenSoundwaveChromeVisible(target, true);
      return false;
    });

    forceTokenInvisibleForObserverVisibility(observer, target, 'hidden');
    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer], {
      finalVisibilityStatesByTargetId: { target: 'hidden' },
    });
    expect(schedulePendingTokenMovementCompletion(observer.document)).toBe(true);

    expect(wrapCanvasVisibilityTest(wrapped, [{ x: 0, y: 0 }], { object: target })).toBe(true);
    expect(wrapped).toHaveBeenCalledTimes(1);
    expect(target.visible).toBe(true);
    expect(target.renderable).toBe(true);
    expect(target.mesh).toMatchObject({
      visible: true,
      renderable: true,
      alpha: 1,
    });
    expect(target.detectionFilter).toBe(soundwaveFilter);
    expect(target.detectionFilterMesh).toMatchObject({
      visible: true,
      renderable: true,
      alpha: 1,
    });
    expectHiddenSoundwaveChromeHidden(target);
    jest.useRealTimers();
  });

  test('keeps invisible tint when forcing hidden soundwave canvas visibility', () => {
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({
      id: 'target',
      actor: createMockActor({
        type: 'npc',
        hasCondition: jest.fn((slug) => slug === 'invisible'),
        system: { conditions: { invisible: { active: true } } },
      }),
      visible: false,
    });
    target.renderable = false;
    target.mesh = { visible: false, renderable: false, alpha: 0 };
    const soundwaveFilter = { id: 'soundwave-filter' };
    target.detectionFilter = soundwaveFilter;
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    attachHiddenSoundwaveChrome(target);
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: new Map([['observer', { active: true, object: observer }]]),
        lightSources: new Map(),
      },
      tokens: {
        controlled: [observer],
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        placeables: [observer, target],
      },
    };
    const wrapped = jest.fn(() => {
      target.detectionFilter = null;
      target.detectionFilterMesh.visible = false;
      target.detectionFilterMesh.renderable = false;
      target.detectionFilterMesh.alpha = 0;
      target.visible = false;
      target.renderable = false;
      target.mesh.visible = false;
      target.mesh.renderable = false;
      target.mesh.alpha = 1;
      setHiddenSoundwaveChromeVisible(target, true);
      return false;
    });

    expect(wrapCanvasVisibilityTest(wrapped, [{ x: 0, y: 0 }], { object: target })).toBe(true);
    expect(target.visible).toBe(true);
    expect(target.renderable).toBe(true);
    expect(target.mesh).toMatchObject({
      visible: true,
      renderable: true,
      alpha: 0.5,
    });
    expect(target.detectionFilter).toBe(soundwaveFilter);
    expect(target.detectionFilterMesh).toMatchObject({
      visible: true,
      renderable: true,
      alpha: 1,
    });
    expectHiddenSoundwaveChromeHidden(target);
  });

  test('does not force canvas visibility for selected hidden loot targets', () => {
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({
      id: 'target',
      actor: createMockActor({ type: 'loot' }),
      visible: false,
    });
    target.detectionFilter = { id: 'soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: new Map([['observer', { active: true, object: observer }]]),
        lightSources: new Map(),
      },
      tokens: {
        controlled: [observer],
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        placeables: [observer, target],
      },
    };
    const wrapped = jest.fn(() => false);

    expect(wrapCanvasVisibilityTest(wrapped, [{ x: 0, y: 0 }], { object: target })).toBe(false);
    expect(wrapped).toHaveBeenCalledTimes(1);
  });

  test('suppresses soundwave for unselected observer while current state is observed even if pending final state is hidden', () => {
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'observed' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.detectionFilterMesh = { visible: false, renderable: false, alpha: 0 };
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: new Map([['observer', { active: true, object: observer }]]),
        lightSources: new Map(),
      },
      tokens: {
        controlled: [],
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        placeables: [observer, target],
      },
    };
    const wrapped = jest.fn(() => {
      target.detectionFilter = { id: 'early-soundwave-filter' };
      target.detectionFilterMesh.visible = true;
      target.detectionFilterMesh.renderable = true;
      target.detectionFilterMesh.alpha = 1;
      return true;
    });

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer], {
      finalVisibilityStatesByTargetId: { target: 'hidden' },
    });

    expect(wrapCanvasVisibilityTest(wrapped, [{ x: 0, y: 0 }], { object: target })).toBe(true);
    expect(wrapped).toHaveBeenCalledTimes(1);
    expect(target.detectionFilter).toBeNull();
    expect(target.detectionFilterMesh).toMatchObject({
      visible: false,
      renderable: false,
      alpha: 0,
    });
  });

  test('keeps core soundwave for selected observed target once pending movement LOS is blocked', () => {
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'observed' }),
    });
    const target = createMockToken({ id: 'target', x: 4, visible: true });
    target.document.getVisibilityTestPoints = jest.fn(() => [{ x: 125, y: 25 }]);
    target.detectionFilterMesh = { visible: false, renderable: false, alpha: 0 };
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
        controlled: [observer],
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        placeables: [observer, target],
      },
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
    };
    const wrapped = jest.fn(() => {
      target.detectionFilter = { id: 'core-soundwave-filter' };
      target.detectionFilterMesh.visible = true;
      target.detectionFilterMesh.renderable = true;
      target.detectionFilterMesh.alpha = 1;
      return true;
    });

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer], {
      finalVisibilityStatesByTargetId: { target: 'hidden' },
    });
    observer._animation = { state: 'running', promise: Promise.resolve() };

    expect(shouldUseCoreDetectionDuringPendingMovement(observer, target)).toBe(true);
    expect(getPendingMovementBlockedDetectionSources(target)).toEqual([]);
    const result = wrapCanvasVisibilityTest(wrapped, [{ x: 0, y: 0 }], { object: target });
    expect(wrapped).toHaveBeenCalledTimes(1);
    expect(result).toBe(true);
    expect(target.detectionFilter).toEqual({ id: 'core-soundwave-filter' });
    expect(target.detectionFilterMesh).toMatchObject({
      visible: true,
      renderable: true,
      alpha: 1,
    });
  });
});
