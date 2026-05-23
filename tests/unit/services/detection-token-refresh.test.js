import '../../setup.js';

import {
  clearPendingTokenMovementPosition,
  setPendingTokenMovementPosition,
} from '../../../scripts/services/PendingMovement/pending-token-movement.js';
import { forcePendingMovementTokenInvisible } from '../../../scripts/services/PendingMovement/pending-movement-render-lock.js';
import { wrapTokenRefreshVisibility } from '../../../scripts/services/Detection/detection-token-refresh.js';
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

describe('detection token refresh wrapper', () => {
  let originalCanvas;

  beforeEach(() => {
    originalCanvas = global.canvas;
  });

  afterEach(() => {
    clearPendingTokenMovementPosition('observer');
    global.canvas = originalCanvas;
  });

  test('preserves hidden soundwave token refresh during pending movement', () => {
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    const soundwaveFilter = { id: 'soundwave-filter' };
    target.detectionFilter = soundwaveFilter;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: new Map([['observer', { active: true, object: observer }]]),
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
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);
    let filterAfterClear = undefined;
    const wrapped = jest.fn(() => {
      target.detectionFilter = null;
      filterAfterClear = target.detectionFilter;
      return 'wrapped-result';
    });

    const result = wrapTokenRefreshVisibility.call(target, wrapped);

    expect(result).toBe('wrapped-result');
    expect(wrapped).toHaveBeenCalledTimes(1);
    expect(filterAfterClear).toBe(soundwaveFilter);
    expect(target.detectionFilter).toBe(soundwaveFilter);
  });

  test('preserves hidden soundwave state without forcing token refresh visible', () => {
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    const soundwaveFilter = { id: 'soundwave-filter' };
    const baseFilter = { id: 'base-filter' };
    target.detectionFilter = soundwaveFilter;
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    target.mesh = { visible: true, renderable: true, alpha: 1, filters: [baseFilter] };
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: new Map([['observer', { active: true, object: observer }]]),
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
        placeables: [observer, target],
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);
    const wrapped = jest.fn(() => {
      target.detectionFilter = null;
      target.mesh.filters = [];
      return false;
    });

    const result = wrapTokenRefreshVisibility.call(target, wrapped);

    expect(result).toBe(false);
    expect(wrapped).toHaveBeenCalledTimes(1);
    expect(target.detectionFilter).toBe(soundwaveFilter);
    expect(target.detectionFilterMesh).toMatchObject({
      visible: true,
      renderable: true,
      alpha: 1,
    });
    expect(target.mesh.filters).not.toContain(soundwaveFilter);
  });

  test('primes hidden soundwave mesh before token refresh when stored hidden target has no filter', () => {
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.detectionFilterMesh = { visible: false, renderable: false, alpha: 0 };
    const coreSoundwaveFilter = { id: 'core-soundwave-filter' };
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
      expect(target.detectionFilterMesh).toMatchObject({
        visible: true,
        renderable: true,
        alpha: 1,
      });
      expect(target.visible).toBe(true);
      expect(target.renderable).toBe(true);
      expect(target.mesh).toMatchObject({ visible: true, renderable: true, alpha: 1 });
      target.detectionFilter = coreSoundwaveFilter;
      return 'wrapped-result';
    });

    const result = wrapTokenRefreshVisibility.call(target, wrapped);

    expect(result).toBe('wrapped-result');
    expect(wrapped).toHaveBeenCalledTimes(1);
    expect(target.detectionFilterMesh).toMatchObject({
      visible: true,
      renderable: true,
      alpha: 1,
    });
    expect(target.detectionFilter).toBe(coreSoundwaveFilter);
  });

  test('primes hidden soundwave mesh when stale filter property has no visual mesh', () => {
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.detectionFilter = { id: 'stale-soundwave-filter' };
    target.detectionFilterMesh = { visible: false, renderable: false, alpha: 0 };
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
      expect(target.detectionFilterMesh).toMatchObject({
        visible: true,
        renderable: true,
        alpha: 1,
      });
      return 'wrapped-result';
    });

    const result = wrapTokenRefreshVisibility.call(target, wrapped);

    expect(result).toBe('wrapped-result');
    expect(wrapped).toHaveBeenCalledTimes(1);
    expect(target.detectionFilterMesh).toMatchObject({
      visible: true,
      renderable: true,
      alpha: 1,
    });
  });

  test('does not restore stale mesh-off state after priming hidden soundwave mesh', () => {
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.detectionFilter = { id: 'stale-soundwave-filter' };
    const writes = [];
    const meshState = { visible: false, renderable: false, alpha: 0 };
    target.detectionFilterMesh = {};
    for (const property of ['visible', 'renderable', 'alpha']) {
      Object.defineProperty(target.detectionFilterMesh, property, {
        configurable: true,
        enumerable: true,
        get: () => meshState[property],
        set: (next) => {
          writes.push({ property, next });
          meshState[property] = next;
        },
      });
    }
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
    const wrapped = jest.fn(() => 'wrapped-result');

    expect(wrapTokenRefreshVisibility.call(target, wrapped)).toBe('wrapped-result');

    expect(writes).toEqual([
      { property: 'visible', next: true },
      { property: 'renderable', next: true },
      { property: 'alpha', next: 1 },
    ]);
    expect(target.detectionFilterMesh).toMatchObject({
      visible: true,
      renderable: true,
      alpha: 1,
    });
  });

  test('lets core clear hidden soundwave token refresh when final movement is observed', () => {
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.detectionFilter = { id: 'soundwave-filter' };
    target.mesh = { visible: true, renderable: true, alpha: 1 };
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

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer], {
      finalVisibilityStatesByTargetId: { target: 'observed' },
    });
    observer._animation = { state: 'running', promise: Promise.resolve() };
    const wrapped = jest.fn(() => {
      target.detectionFilter = null;
      return 'wrapped-result';
    });

    const result = wrapTokenRefreshVisibility.call(target, wrapped);

    expect(result).toBe('wrapped-result');
    expect(wrapped).toHaveBeenCalledTimes(1);
    expect(target.detectionFilter).toBeNull();
  });

  test('suppresses soundwave filters for observed targets during token refresh', () => {
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'observed' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.detectionFilter = { id: 'stale-soundwave-filter' };
    target.mesh = { visible: true, renderable: true, alpha: 1 };
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
      target.detectionFilter = { id: 'core-soundwave-filter' };
      return 'wrapped-result';
    });

    const result = wrapTokenRefreshVisibility.call(target, wrapped);

    expect(result).toBe('wrapped-result');
    expect(wrapped).toHaveBeenCalledTimes(1);
    expect(target.detectionFilter).toBeNull();
  });

  test('does not force visible when observed soundwave suppression wraps refresh false', () => {
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'observed' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.detectionFilter = { id: 'stale-soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    target.mesh = { visible: true, renderable: true, alpha: 1 };
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

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer], {
      finalVisibilityStatesByTargetId: { target: 'observed' },
    });
    const wrapped = jest.fn(() => false);

    const result = wrapTokenRefreshVisibility.call(target, wrapped);

    expect(result).toBe(false);
    expect(wrapped).toHaveBeenCalledTimes(1);
    expect(target.detectionFilter).toBeNull();
    expect(target.detectionFilterMesh).toMatchObject({
      visible: false,
      renderable: false,
      alpha: 0,
    });
  });

  test('does not restore captured hidden soundwave when current observed state suppresses it', () => {
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'observed' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.detectionFilter = { id: 'stale-hidden-soundwave-filter' };
    target.mesh = { visible: true, renderable: true, alpha: 1 };
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

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer], {
      finalVisibilityStatesByTargetId: { target: 'hidden' },
    });
    const wrapped = jest.fn(() => {
      target.detectionFilter = { id: 'core-soundwave-filter' };
      return 'wrapped-result';
    });

    const result = wrapTokenRefreshVisibility.call(target, wrapped);

    expect(result).toBe('wrapped-result');
    expect(wrapped).toHaveBeenCalledTimes(1);
    expect(target.detectionFilter).toBeNull();
  });

  test('preserves hidden soundwave during pending final observed movement while sight wall still blocks', () => {
    global.canvas.walls.placeables = [
      createMockWall({ id: 'wall', c: [100, 0, 100, 200], sight: 1, sound: 0 }),
    ];
    const observer = createMockToken({
      id: 'observer',
      x: 0,
      y: 0,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    const soundwaveFilter = { id: 'soundwave-filter' };
    target.detectionFilter = soundwaveFilter;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
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

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer], {
      finalVisibilityStatesByTargetId: { target: 'observed' },
    });
    const wrapped = jest.fn(() => {
      target.detectionFilter = null;
      return 'wrapped-result';
    });

    const result = wrapTokenRefreshVisibility.call(target, wrapped);

    expect(result).toBe('wrapped-result');
    expect(wrapped).toHaveBeenCalledTimes(1);
    expect(target.detectionFilter).toBe(soundwaveFilter);
  });

  test('clears stale hidden soundwave when current movement LOS leaves sight wall', () => {
    global.canvas.walls.placeables = [
      createMockWall({ id: 'wall', c: [100, 0, 100, 200], sight: 1, sound: 0 }),
    ];
    const observer = createMockToken({
      id: 'observer',
      x: 0,
      y: 0,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({
      id: 'target',
      x: 4,
      y: 0,
      visible: true,
    });
    target.detectionFilter = { id: 'stale-hidden-soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    target.mesh = { visible: true, renderable: true, alpha: 1 };
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

    setPendingTokenMovementPosition(observer.document, { x: 150, y: 0 }, [observer], {
      finalVisibilityStatesByTargetId: { target: 'observed' },
    });
    observer.x = 150;
    observer.center = { x: 175, y: 25 };
    const wrapped = jest.fn(() => {
      target.detectionFilter = { id: 'core-soundwave-filter' };
      target.detectionFilterMesh.visible = true;
      target.detectionFilterMesh.renderable = true;
      target.detectionFilterMesh.alpha = 1;
      return 'wrapped-result';
    });

    const result = wrapTokenRefreshVisibility.call(target, wrapped);

    expect(result).toBe('wrapped-result');
    expect(wrapped).toHaveBeenCalledTimes(1);
    expect(target.detectionFilter).toBeNull();
    expect(target.detectionFilterMesh).toMatchObject({
      visible: false,
      renderable: false,
      alpha: 0,
    });
  });

  test('chains hidden soundwave token refresh during controlled drag preview and lets core clear filter', () => {
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    observer.controlled = true;
    const target = createMockToken({ id: 'target', visible: true });
    target.detectionFilter = { id: 'soundwave-filter' };
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: new Map([['observer', { active: true, object: observer }]]),
        lightSources: new Map(),
      },
      tokens: {
        _draggedToken: observer,
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        placeables: [observer, target],
      },
    };
    const wrapped = jest.fn(() => {
      target.detectionFilter = null;
      return 'wrapped-result';
    });

    const result = wrapTokenRefreshVisibility.call(target, wrapped);

    expect(result).toBe('wrapped-result');
    expect(wrapped).toHaveBeenCalledTimes(1);
    expect(target.detectionFilter).toBeNull();
  });

  test('preserves hidden soundwave filter after movement when vision sources are unavailable', () => {
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    observer.controlled = true;
    const target = createMockToken({ id: 'target', visible: true });
    const soundwaveFilter = { id: 'soundwave-filter' };
    target.detectionFilter = soundwaveFilter;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
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
    const wrapped = jest.fn(() => {
      target.detectionFilter = null;
      return 'wrapped-result';
    });

    const result = wrapTokenRefreshVisibility.call(target, wrapped);

    expect(result).toBe('wrapped-result');
    expect(wrapped).toHaveBeenCalledTimes(1);
    expect(target.detectionFilter).toBe(soundwaveFilter);
  });

  test('preserves hidden soundwave filter after controlled observer context is gone', () => {
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    const soundwaveFilter = { id: 'soundwave-filter' };
    target.detectionFilter = soundwaveFilter;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
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
      return 'wrapped-result';
    });

    const result = wrapTokenRefreshVisibility.call(target, wrapped);

    expect(result).toBe('wrapped-result');
    expect(wrapped).toHaveBeenCalledTimes(1);
    expect(target.detectionFilter).toBe(soundwaveFilter);
  });

  test('lets core clear stale hidden soundwave filter while final pending state is observed', () => {
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.detectionFilter = { id: 'soundwave-filter' };
    target.mesh = { visible: true, renderable: true, alpha: 1 };
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

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer], {
      finalVisibilityStatesByTargetId: { target: 'observed' },
    });
    const wrapped = jest.fn(() => {
      target.detectionFilter = null;
      return 'wrapped-result';
    });

    const result = wrapTokenRefreshVisibility.call(target, wrapped);

    expect(result).toBe('wrapped-result');
    expect(wrapped).toHaveBeenCalledTimes(1);
    expect(target.detectionFilter).toBeNull();
  });

  test('preserves hidden soundwave filter during core-owned pending movement when sources are unavailable', () => {
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    observer.controlled = true;
    const target = createMockToken({ id: 'target', visible: true });
    const soundwaveFilter = { id: 'soundwave-filter' };
    target.detectionFilter = soundwaveFilter;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
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

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer], {
      finalVisibilityStatesByTargetId: { target: 'hidden' },
    });
    const wrapped = jest.fn(() => {
      target.detectionFilter = null;
      return 'wrapped-result';
    });

    const result = wrapTokenRefreshVisibility.call(target, wrapped);

    expect(result).toBe('wrapped-result');
    expect(wrapped).toHaveBeenCalledTimes(1);
    expect(target.detectionFilter).toBe(soundwaveFilter);
  });

  test('suppresses transient soundwave filter while core-visible stale undetected target refreshes', () => {
    const observer = createMockToken({
      id: 'observer',
      x: 0,
      y: 0,
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    let filterSeenDuringWrapped = undefined;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.detectionFilterMesh = { visible: false, renderable: true, alpha: 1 };
    target.document.getVisibilityTestPoints = jest.fn(() => [{ x: 175, y: 25 }]);
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
      visibility: {
        testVisibility: jest.fn(() => true),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer], {
      finalVisibilityStatesByTargetId: { target: 'observed' },
    });
    observer.x = 50;
    observer.document.x = 50;
    const wrapped = jest.fn(() => {
      target.detectionFilter = { id: 'soundwave-filter' };
      target.detectionFilterMesh.visible = true;
      target.detectionFilterMesh.renderable = true;
      filterSeenDuringWrapped = target.detectionFilter;
      return 'wrapped-result';
    });

    const result = wrapTokenRefreshVisibility.call(target, wrapped);

    expect(result).toBe('wrapped-result');
    expect(wrapped).toHaveBeenCalledTimes(1);
    expect(filterSeenDuringWrapped).toBeNull();
    expect(target.detectionFilter).toBeNull();
    expect(target.detectionFilterMesh).toMatchObject({
      visible: false,
      renderable: false,
      alpha: 0,
    });
  });

  test('keeps core-hidden rendering when final undetected movement loses LOS', () => {
    const observer = createMockToken({
      id: 'observer',
      x: 0,
      y: 0,
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
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

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer]);
    forcePendingMovementTokenInvisible(target);

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer], {
      finalVisibilityStatesByTargetId: { target: 'undetected' },
    });
    const wrapped = jest.fn(() => {
      target.visible = false;
      target.renderable = false;
      target.mesh.visible = false;
      target.mesh.renderable = false;
      target.mesh.alpha = 0;
      return 'wrapped-result';
    });

    const result = wrapTokenRefreshVisibility.call(target, wrapped);

    expect(result).toBe('wrapped-result');
    expect(wrapped).toHaveBeenCalledTimes(1);
    expect(target.visible).toBe(false);
    expect(target.renderable).toBe(false);
    expect(target.mesh).toMatchObject({ visible: false, renderable: false, alpha: 0 });
  });

  test('runs normal token refresh without pending movement filter preservation', () => {
    const target = createMockToken({ id: 'target', visible: true });
    const wrapped = jest.fn(() => {
      target.visible = false;
    });

    wrapTokenRefreshVisibility.call(target, wrapped);

    expect(wrapped).toHaveBeenCalledTimes(1);
    expect(target.visible).toBe(false);
  });
});
