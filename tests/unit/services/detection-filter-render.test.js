import '../../setup.js';

import { wrapTokenRenderDetectionFilter } from '../../../scripts/services/Detection/detection-filter-render.js';
import {
  clearPendingTokenMovementPosition,
  completePendingTokenMovement,
  primePendingControlledTokenDragIntent,
  releasePendingControlledTokenDragIntent,
  setPendingTokenMovementPosition,
  targetIsRenderHiddenForCurrentViewObserver,
} from '../../../scripts/services/PendingMovement/pending-token-movement.js';
import { VisionAnalyzer } from '../../../scripts/visibility/auto-visibility/VisionAnalyzer.js';
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

describe('detection filter render wrapper', () => {
  let originalCanvas;

  beforeEach(() => {
    originalCanvas = global.canvas;
    global.game.settings.set('pf2e', 'gmVision', false);
    global.game.settings.set('pf2e-visioner', 'autoVisibilityEnabled', false);
  });

  afterEach(() => {
    clearPendingTokenMovementPosition('observer');
    releasePendingControlledTokenDragIntent(null, { delayMs: 0 });
    global.game.settings.set('pf2e', 'gmVision', false);
    global.game.settings.set('pf2e-visioner', 'autoVisibilityEnabled', false);
    global.canvas = originalCanvas;
  });

  test('keeps core-painted soundwave for undetected target mid-move within imprecise range', () => {
    const visionSpy = jest.spyOn(VisionAnalyzer, 'getInstance').mockReturnValue({
      getVisionCapabilities: jest.fn(() => ({ hasVision: true })),
      getSensingCapabilities: jest.fn(() => ({ imprecise: { scent: 30 }, precise: {} })),
    });
    try {
      global.canvas.walls.placeables = [];
      const observer = createMockToken({
        id: 'observer',
        controlled: true,
        flags: visibilityV2Flags({ target: 'undetected' }),
      });
      observer._animation = { active: true };
      observer.center = { x: 25, y: 25 };
      const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
      target.center = { x: 50, y: 25 };
      target.mesh = { visible: true, renderable: true, alpha: 1 };
      target.detectionFilter = null;
      target.detectionFilterMesh = null;
      global.canvas = {
        ...global.canvas,
        grid: { size: 50 },
        scene: { ...global.canvas.scene, grid: { distance: 5 } },
        effects: { visionSources: new Map(), lightSources: new Map() },
        tokens: {
          get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
          controlled: [observer],
          placeables: [observer, target],
        },
      };
      setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer], {
        finalVisibilityStatesByTargetId: { target: 'undetected' },
      });

      const wrapped = jest.fn(() => {
        target.detectionFilter = { id: 'native-scent-soundwave-filter' };
        target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
        return 'rendered';
      });

      expect(wrapTokenRenderDetectionFilter.call(target, wrapped)).toBe('rendered');
      expect(target.detectionFilter).toEqual({ id: 'native-scent-soundwave-filter' });
      expect(target.detectionFilterMesh).toMatchObject({
        visible: true,
        renderable: true,
        alpha: 1,
      });
      expect(target.mesh.alpha).toBe(1);
    } finally {
      visionSpy.mockRestore();
    }
  });

  test('clears core-readded soundwave once live polygon sees blocking-state target mid-move', () => {
    const visionSpy = jest.spyOn(VisionAnalyzer, 'getInstance').mockReturnValue({
      getVisionCapabilities: jest.fn(() => ({ hasVision: true })),
      getSensingCapabilities: jest.fn(() => ({ imprecise: { scent: 30 }, precise: {} })),
    });
    try {
      global.canvas.walls.placeables = [];
      const observer = createMockToken({
        id: 'observer',
        controlled: true,
        flags: visibilityV2Flags({ target: 'hidden' }),
      });
      observer._animation = { active: true };
      observer.center = { x: 25, y: 25 };
      const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
      target.center = { x: 50, y: 25 };
      target.document.getVisibilityTestPoints = jest.fn(() => [{ x: 50, y: 25 }]);
      target.mesh = { visible: true, renderable: true, alpha: 1 };
      target.detectionFilter = { id: 'core-readded-soundwave-filter' };
      target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
      const losContains = jest.fn(() => true);
      global.canvas = {
        ...global.canvas,
        grid: { size: 50 },
        scene: { ...global.canvas.scene, grid: { distance: 5 } },
        effects: {
          visionSources: new Map([
            [
              'observer',
              {
                active: true,
                object: observer,
                los: { contains: losContains },
                shape: { contains: losContains },
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

      const wrapped = jest.fn(() => 'rendered');

      expect(wrapTokenRenderDetectionFilter.call(target, wrapped)).toBe('rendered');
      expect(target.detectionFilter).toBeNull();
      expect(target.detectionFilterMesh).toMatchObject({ visible: false, alpha: 0 });
      expect(target.mesh.alpha).toBe(1);
    } finally {
      visionSpy.mockRestore();
    }
  });

  test('chains render while suppressing hidden soundwave once pending observer sight line is clear', () => {
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
    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer]);

    const wrapped = jest.fn(() => {
      expect(target.detectionFilter).toMatchObject({ enabled: false });
      expect(target.detectionFilterMesh).toMatchObject({
        visible: false,
        renderable: false,
        alpha: 0,
      });
      return 'rendered';
    });

    expect(wrapTokenRenderDetectionFilter.call(target, wrapped, 'renderer')).toBe('rendered');
    expect(wrapped).toHaveBeenCalledWith('renderer');
    expect(target.detectionFilter).toBeNull();
    expect(target.detectionFilterMesh).toMatchObject({
      visible: false,
      renderable: false,
      alpha: 0,
    });
  });

  test('does not let render-hidden detection filter render pulse token tint white', () => {
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    const tintWrites = [];
    let currentTint = 0;
    target.mesh = {};
    Object.defineProperty(target.mesh, 'tint', {
      configurable: true,
      enumerable: true,
      get() {
        return currentTint;
      },
      set(next) {
        tintWrites.push(next);
        currentTint = next;
      },
    });
    target.detectionFilter = { id: 'soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    const wrapped = jest.fn(() => {
      expect(target.detectionFilterMesh.visible).toBe(false);
      target.mesh.tint = 0xffffff;
      return 'rendered';
    });

    expect(targetIsRenderHiddenForCurrentViewObserver(target)).toBe(true);
    expect(wrapTokenRenderDetectionFilter.call(target, wrapped, 'renderer')).toBe('rendered');
    expect(wrapped).toHaveBeenCalledWith('renderer');
    expect(target.mesh.tint).toBe(0);
    expect(tintWrites).not.toContain(0xffffff);
    expect(target.detectionFilterMesh).toMatchObject({
      visible: false,
      renderable: false,
      alpha: 0,
    });
  });

  test('primes hidden soundwave mesh before render when stale filter property has no visual mesh', () => {
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.detectionFilter = { id: 'stale-soundwave-filter' };
    target.detectionFilterMesh = { visible: false, renderable: false, alpha: 0 };
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    const wrapped = jest.fn(() => {
      expect(target.detectionFilterMesh).toMatchObject({
        visible: true,
        renderable: true,
        alpha: 1,
      });
      return 'rendered';
    });

    expect(wrapTokenRenderDetectionFilter.call(target, wrapped, 'renderer')).toBe('rendered');
    expect(wrapped).toHaveBeenCalledWith('renderer');
    expect(target.detectionFilterMesh).toMatchObject({
      visible: true,
      renderable: true,
      alpha: 1,
    });
  });

  test('keeps hidden soundwave animation running while current view stays wall-blocked', () => {
    global.canvas.walls.placeables = [
      createMockWall({ id: 'wall', c: [100, 0, 100, 200], sight: 1, sound: 0 }),
    ];
    const observer = createMockToken({
      id: 'observer',
      x: 0,
      y: 0,
      controlled: true,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.detectionFilter = { id: 'soundwave-filter', animated: true };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: new Map(),
        lightSources: new Map(),
      },
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };
    setPendingTokenMovementPosition(observer.document, { x: 50, y: 0 }, [observer]);

    const wrapped = jest.fn(() => {
      expect(target.detectionFilter.animated).toBe(true);
      return 'rendered';
    });

    expect(wrapTokenRenderDetectionFilter.call(target, wrapped, 'renderer')).toBe('rendered');
    expect(wrapped).toHaveBeenCalledWith('renderer');
    expect(target.detectionFilter.animated).toBe(true);
  });

  test('suppresses stale soundwave during post-completion sight-line grace', () => {
    global.canvas.walls.placeables = [
      createMockWall({ id: 'wall', c: [100, 0, 100, 200], sight: 1, sound: 0 }),
    ];
    const observer = createMockToken({
      id: 'observer',
      x: 0,
      y: 0,
      controlled: true,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.detectionFilter = { id: 'soundwave-filter', animated: true };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: new Map(),
        lightSources: new Map(),
      },
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };
    setPendingTokenMovementPosition(observer.document, { x: 50, y: 0 }, [observer]);

    wrapTokenRenderDetectionFilter.call(target, jest.fn(() => 'rendered'), 'renderer');
    expect(target.detectionFilter.animated).toBe(true);

    completePendingTokenMovement('observer');
    global.canvas.tokens._draggedToken = null;

    const wrapped = jest.fn(() => {
      expect(target.detectionFilter).toBeNull();
      expect(target.detectionFilterMesh).toMatchObject({
        visible: false,
        renderable: false,
        alpha: 0,
      });
      return 'rendered';
    });

    expect(wrapTokenRenderDetectionFilter.call(target, wrapped, 'renderer')).toBe('rendered');
    expect(target.detectionFilter).toBeNull();
    expect(target.detectionFilterMesh).toMatchObject({
      visible: false,
      renderable: false,
      alpha: 0,
    });
  });

  test('clears core-added detection filter during post-completion sight-line grace', () => {
    global.canvas.walls.placeables = [
      createMockWall({ id: 'wall', c: [100, 0, 100, 200], sight: 1, sound: 0 }),
    ];
    const observer = createMockToken({
      id: 'observer',
      x: 0,
      y: 0,
      controlled: true,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: new Map([['observer', { active: true, object: observer }]]),
        lightSources: new Map(),
      },
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: observer,
        controlled: [observer],
        placeables: [observer, target],
      },
    };
    setPendingTokenMovementPosition(observer.document, { x: 50, y: 0 }, [observer]);
    completePendingTokenMovement('observer');
    global.canvas.tokens._draggedToken = null;

    const wrapped = jest.fn(() => {
      target.detectionFilter = { id: 'core-added-outline' };
      target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
      return 'rendered';
    });

    expect(wrapTokenRenderDetectionFilter.call(target, wrapped, 'renderer')).toBe('rendered');
    expect(wrapped).toHaveBeenCalledWith('renderer');
    expect(target.detectionFilter).toBeNull();
    expect(target.detectionFilterMesh).toMatchObject({
      visible: false,
      renderable: false,
      alpha: 0,
    });
  });

  test('suppresses core detection filter render for concealed current-view target after movement completion', () => {
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'concealed' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.detectionFilter = { id: 'core-outline-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: new Map(),
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
    completePendingTokenMovement('observer');
    global.canvas.tokens._draggedToken = null;

    const wrapped = jest.fn(() => {
      expect(target.detectionFilter).toMatchObject({ enabled: false });
      expect(target.detectionFilterMesh).toMatchObject({
        visible: false,
        renderable: false,
        alpha: 0,
      });
      expect(target.mesh).toMatchObject({
        visible: false,
        renderable: false,
        alpha: 0,
      });
      return 'rendered';
    });

    expect(wrapTokenRenderDetectionFilter.call(target, wrapped, 'renderer')).toBe('rendered');
    expect(wrapped).toHaveBeenCalledWith('renderer');
    expect(target.detectionFilter).toBeNull();
    expect(target.detectionFilterMesh).toMatchObject({
      visible: false,
      renderable: false,
      alpha: 0,
    });
    expect(target.mesh).toMatchObject({
      visible: true,
      renderable: true,
      alpha: 1,
    });
  });

  test('does not stabilize selected hidden soundwave animation without pending movement work', () => {
    global.canvas.walls.placeables = [
      createMockWall({ id: 'wall', c: [100, 0, 100, 200], sight: 1, sound: 0 }),
    ];
    const observer = createMockToken({
      id: 'observer',
      x: 0,
      y: 0,
      controlled: true,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.detectionFilter = { id: 'soundwave-filter', animated: true };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: new Map(),
        lightSources: new Map(),
      },
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: null,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    const wrapped = jest.fn(() => {
      expect(target.detectionFilter.animated).toBe(true);
      return 'rendered';
    });

    expect(wrapTokenRenderDetectionFilter.call(target, wrapped, 'renderer')).toBe('rendered');
    expect(wrapped).toHaveBeenCalledWith('renderer');
    expect(target.detectionFilter.animated).toBe(true);
  });

  test('keeps the primary sprite and soundwave ring for a selected observer hidden target', () => {
    global.canvas.walls.placeables = [
      createMockWall({ id: 'wall', c: [100, 0, 100, 200], sight: 1, sound: 0 }),
    ];
    const observer = createMockToken({
      id: 'observer',
      x: 0,
      y: 0,
      controlled: true,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.detectionFilter = { id: 'soundwave-filter', animated: true };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: new Map(),
        lightSources: new Map(),
      },
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: null,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    const wrapped = jest.fn(() => 'rendered');
    expect(wrapTokenRenderDetectionFilter.call(target, wrapped, 'renderer')).toBe('rendered');
    expect(wrapped).toHaveBeenCalledWith('renderer');
    expect(target.mesh.alpha).toBe(1);
    expect(target.detectionFilterMesh).toMatchObject({ visible: true });
  });

  test('keeps hidden soundwave animation running during pre-drag controlled-token intent', () => {
    global.canvas.walls.placeables = [
      createMockWall({ id: 'wall', c: [100, 0, 100, 200], sight: 1, sound: 0 }),
    ];
    const observer = createMockToken({
      id: 'observer',
      x: 0,
      y: 0,
      controlled: true,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.detectionFilter = { id: 'soundwave-filter', animated: true };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: new Map(),
        lightSources: new Map(),
      },
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: null,
        controlled: [observer],
        placeables: [observer, target],
      },
    };

    primePendingControlledTokenDragIntent(observer);

    const wrapped = jest.fn(() => {
      expect(target.detectionFilter.animated).toBe(true);
      return 'rendered';
    });

    expect(wrapTokenRenderDetectionFilter.call(target, wrapped, 'renderer')).toBe('rendered');
    expect(wrapped).toHaveBeenCalledWith('renderer');
    expect(target.detectionFilter.animated).toBe(true);
  });

  test('keeps hidden soundwave shader phase live during pre-drag controlled-token intent', () => {
    global.canvas.walls.placeables = [
      createMockWall({ id: 'wall', c: [100, 0, 100, 200], sight: 1, sound: 0 }),
    ];
    const observer = createMockToken({
      id: 'observer',
      x: 0,
      y: 0,
      controlled: true,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    const originalApply = jest.fn(function originalApply(filterManager, input, output, clear) {
      this.uniforms.time = global.canvas.app.ticker.lastTime;
      return filterManager.applyFilter(this, input, output, clear);
    });
    target.detectionFilter = {
      id: 'soundwave-filter',
      animated: true,
      thickness: 2,
      uniforms: {
        time: 1234,
        thickness: [0, 0],
        wave: true,
      },
      apply: originalApply,
    };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      app: { ticker: { lastTime: 9999 } },
      stage: { scale: { x: 0.5 } },
      photosensitiveMode: false,
      effects: {
        visionSources: new Map(),
        lightSources: new Map(),
      },
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: null,
        controlled: [observer],
        placeables: [observer, target],
      },
    };
    const originalOscillation = Math.oscillation;
    Math.oscillation = jest.fn(() => 1);

    try {
      primePendingControlledTokenDragIntent(observer);

      const filterManager = { applyFilter: jest.fn() };
      const input = { _frame: { width: 100, height: 200 } };
      const wrapped = jest.fn(() => {
        target.detectionFilter.apply(filterManager, input, 'output', true);
        return 'rendered';
      });

      expect(wrapTokenRenderDetectionFilter.call(target, wrapped, 'renderer')).toBe('rendered');
      expect(filterManager.applyFilter).toHaveBeenCalledWith(
        target.detectionFilter,
        input,
        'output',
        true,
      );
      expect(originalApply).toHaveBeenCalledTimes(1);
      expect(target.detectionFilter.uniforms.time).toBe(9999);
      expect(target.detectionFilter.uniforms.thickness).toEqual([0, 0]);
      expect(target.detectionFilter.animated).toBe(true);
      expect(target.detectionFilter.apply).toBe(originalApply);
    } finally {
      if (originalOscillation) Math.oscillation = originalOscillation;
      else delete Math.oscillation;
    }
  });

  test('keeps hidden soundwave shader phase live while current observer animation is active', () => {
    global.canvas.walls.placeables = [
      createMockWall({ id: 'wall', c: [100, 0, 100, 200], sight: 1, sound: 0 }),
    ];
    const observer = createMockToken({
      id: 'observer',
      x: 0,
      y: 0,
      controlled: true,
      animationContexts: new Map([['movement', {}]]),
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.detectionFilter = {
      id: 'soundwave-filter',
      animated: true,
      thickness: 2,
      uniforms: {
        time: 2222,
        thickness: [0, 0],
        wave: true,
      },
      apply: jest.fn(function originalApply(filterManager, input, output, clear) {
        this.uniforms.time = global.canvas.app.ticker.lastTime;
        return filterManager.applyFilter(this, input, output, clear);
      }),
    };
    const originalApply = target.detectionFilter.apply;
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      app: { ticker: { lastTime: 9999 } },
      stage: { scale: { x: 0.5 } },
      photosensitiveMode: false,
      effects: {
        visionSources: new Map(),
        lightSources: new Map(),
      },
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        _draggedToken: null,
        controlled: [observer],
        placeables: [observer, target],
      },
    };
    const originalOscillation = Math.oscillation;
    Math.oscillation = jest.fn(() => 1);

    try {
      const filterManager = { applyFilter: jest.fn() };
      const input = { _frame: { width: 100, height: 200 } };
      const wrapped = jest.fn(() => {
        target.detectionFilter.apply(filterManager, input, 'output', true);
        return 'rendered';
      });

      expect(wrapTokenRenderDetectionFilter.call(target, wrapped, 'renderer')).toBe('rendered');
      expect(originalApply).toHaveBeenCalledTimes(1);
      expect(target.detectionFilter.uniforms.time).toBe(9999);
      expect(target.detectionFilter.apply).toBe(originalApply);
    } finally {
      if (originalOscillation) Math.oscillation = originalOscillation;
      else delete Math.oscillation;
    }
  });

  test('suppresses stale soundwave render when no observer is selected', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      x: 0,
      y: 0,
      controlled: true,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
    target.detectionFilter = { id: 'soundwave-filter', animated: true };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: new Map(),
        lightSources: new Map(),
      },
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        controlled: [],
        placeables: [observer, target],
      },
    };

    const wrapped = jest.fn(() => {
      expect(target.detectionFilter).toMatchObject({ enabled: false });
      expect(target.detectionFilterMesh).toMatchObject({
        visible: false,
        renderable: false,
        alpha: 0,
      });
      return 'rendered';
    });

    expect(wrapTokenRenderDetectionFilter.call(target, wrapped, 'renderer')).toBe('rendered');
    expect(wrapped).toHaveBeenCalledWith('renderer');
    expect(target.detectionFilter).toBeNull();
    expect(target.detectionFilterMesh).toMatchObject({
      visible: false,
      renderable: false,
      alpha: 0,
    });
  });

  test('GM Vision bypass leaves detection filter rendering to core', () => {
    global.game.user.isGM = true;
    global.game.settings.set('pf2e-visioner', 'autoVisibilityEnabled', true);
    global.game.settings.set('pf2e', 'gmVision', true);
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.detectionFilter = { id: 'core-soundwave-filter', animated: true };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: new Map(),
        lightSources: new Map(),
      },
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        controlled: [],
        placeables: [observer, target],
      },
    };

    const wrapped = jest.fn(() => {
      expect(target.detectionFilter).toMatchObject({ id: 'core-soundwave-filter' });
      expect(target.detectionFilterMesh).toMatchObject({
        visible: true,
        renderable: true,
        alpha: 1,
      });
      return 'rendered';
    });

    expect(wrapTokenRenderDetectionFilter.call(target, wrapped, 'renderer')).toBe('rendered');
    expect(wrapped).toHaveBeenCalledWith('renderer');
    expect(target.detectionFilter).toMatchObject({ id: 'core-soundwave-filter' });
    expect(target.detectionFilterMesh).toMatchObject({
      visible: true,
      renderable: true,
      alpha: 1,
    });
  });
});
