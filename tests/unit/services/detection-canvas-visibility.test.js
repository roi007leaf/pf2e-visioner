import '../../setup.js';

import {
  clearPendingTokenMovementPosition,
  forceTokenInvisibleForObserverVisibility,
  setPendingTokenMovementPosition,
  shouldTemporarilyForceTokenInvisible,
} from '../../../scripts/services/PendingMovement/pending-token-movement.js';
import {
  getPendingMovementBlockedDetectionSources,
  shouldUseCoreDetectionDuringPendingMovement,
} from '../../../scripts/services/PendingMovement/pending-movement-detection-gate.js';
import { wrapCanvasVisibilityTest } from '../../../scripts/services/Detection/detection-canvas-visibility.js';
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

describe('canvas visibility wrapper', () => {
  let originalCanvas;

  beforeEach(() => {
    originalCanvas = global.canvas;
  });

  afterEach(() => {
    clearPendingTokenMovementPosition('observer');
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
