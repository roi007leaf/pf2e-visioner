import '../../setup.js';

import {
  clearPendingTokenMovementPosition,
  refreshPendingMovementTokenVisibility,
  schedulePendingTokenMovementCompletion,
  setPendingTokenMovementPosition,
  targetQualifiesForLiveImpreciseSoundwave,
} from '../../../scripts/services/PendingMovement/pending-token-movement.js';
import { flushScheduledCanvasPerceptionUpdate } from '../../../scripts/helpers/perception-refresh.js';
import { forcePendingMovementTokenInvisible } from '../../../scripts/services/PendingMovement/pending-movement-render-lock.js';
import { wrapTokenRefreshVisibility } from '../../../scripts/services/Detection/detection-token-refresh.js';
import { VisionAnalyzer } from '../../../scripts/visibility/auto-visibility/VisionAnalyzer.js';
import { legacyVisibilityToProfile } from '../../../scripts/visibility/perception-profile.js';
import { FeatsHandler } from '../../../scripts/chat/services/FeatsHandler.js';

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
    global.game.settings.set('pf2e', 'gmVision', false);
    global.game.settings.set('pf2e-visioner', 'autoVisibilityEnabled', false);
  });

  afterEach(() => {
    clearPendingTokenMovementPosition('observer');
    global.game.settings.set('pf2e', 'gmVision', false);
    global.game.settings.set('pf2e-visioner', 'autoVisibilityEnabled', false);
    global.canvas = originalCanvas;
  });

  test('restores render-hidden token when current-view guard drops during refresh', () => {
    const flags = visibilityV2Flags({ target: 'undetected' });
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags,
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.renderable = true;
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

    forcePendingMovementTokenInvisible(target);
    expect(target.visible).toBe(false);
    expect(target.renderable).toBe(false);
    expect(target.mesh.visible).toBe(false);
    expect(target.mesh.renderable).toBe(false);
    expect(target.mesh.alpha).toBe(0);

    const wrapped = jest.fn(() => {
      flags['pf2e-visioner'].visibilityV2.target = legacyVisibilityToProfile('observed');
      return 'wrapped-result';
    });

    const result = wrapTokenRefreshVisibility.call(target, wrapped);

    expect(result).toBe('wrapped-result');
    expect(wrapped).toHaveBeenCalledTimes(1);
    expect(target.visible).toBe(true);
    expect(target.renderable).toBe(true);
    expect(target.mesh.visible).toBe(true);
    expect(target.mesh.renderable).toBe(true);
    expect(target.mesh.alpha).toBe(1);
  });

  test('does not hard-hide GM-visible Foundry-hidden token during refresh', () => {
    global.game.user.isGM = true;
    const observer = createMockToken({ id: 'observer', controlled: true });
    const target = createMockToken({ id: 'target', hidden: true, visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 0.5 };
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

    const wrapped = jest.fn(() => 'wrapped-result');

    const result = wrapTokenRefreshVisibility.call(target, wrapped);

    expect(result).toBe('wrapped-result');
    expect(wrapped).toHaveBeenCalledTimes(1);
    expect(target.visible).toBe(true);
    expect(target.renderable).toBe(true);
    expect(target.mesh).toMatchObject({ visible: true, renderable: true, alpha: 0.5 });
  });

  test('GM Vision bypass restores existing AVS render lock before token refresh', () => {
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

    forcePendingMovementTokenInvisible(target);
    expect(target.visible).toBe(false);

    const wrapped = jest.fn(() => 'wrapped-result');
    const result = wrapTokenRefreshVisibility.call(target, wrapped);

    expect(result).toBe('wrapped-result');
    expect(wrapped).toHaveBeenCalledTimes(1);
    expect(target.visible).toBe(true);
    expect(target.renderable).toBe(true);
    expect(target.mesh).toMatchObject({ visible: true, renderable: true, alpha: 1 });
  });

  test('uses core-only visibility refresh during movement bypass outside perception', () => {
    jest.useFakeTimers();

    const observer = createMockToken({ id: 'observer', controlled: true });
    observer.document.object = observer;
    const target = createMockToken({ id: 'target', visible: true });
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: new Map(),
        lightSources: new Map(),
      },
      tokens: {
        controlled: [observer],
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer],
      },
    };
    const wrapped = jest.fn(() => 'wrapped-result');

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer]);
    expect(schedulePendingTokenMovementCompletion(observer.document)).toBe(true);

    expect(wrapTokenRefreshVisibility.call(target, wrapped)).toBe('wrapped-result');
    expect(wrapTokenRefreshVisibility.call(target, wrapped)).toBe('wrapped-result');
    expect(wrapped).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });

  test('throttles unaffected token visibility refresh inside core movement perception', () => {
    jest.useFakeTimers();

    const observer = createMockToken({ id: 'observer', controlled: true });
    observer.document.object = observer;
    const target = createMockToken({ id: 'target', visible: true });
    const wrapped = jest.fn(() => 'wrapped-result');
    const perceptionUpdate = jest.fn(() => {
      expect(wrapTokenRefreshVisibility.call(target, wrapped)).toBe('wrapped-result');
      expect(wrapTokenRefreshVisibility.call(target, wrapped)).toBe(true);
    });
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: new Map(),
        lightSources: new Map(),
      },
      tokens: {
        controlled: [observer],
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
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
      refreshLighting: true,
      refreshVision: true,
    });
    expect(wrapped).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(22);

    expect(wrapTokenRefreshVisibility.call(target, wrapped)).toBe('wrapped-result');
    expect(wrapped).toHaveBeenCalledTimes(2);

    jest.useRealTimers();
  });

  test('does not throttle active vision-source refresh during core movement animation', () => {
    jest.useFakeTimers();

    const observer = createMockToken({ id: 'observer', controlled: true });
    observer.document.object = observer;
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: new Map([['observer', { active: true, object: observer }]]),
        lightSources: new Map(),
      },
      tokens: {
        controlled: [observer],
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        placeables: [observer],
      },
    };
    const wrapped = jest.fn(() => 'wrapped-result');

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer]);
    expect(schedulePendingTokenMovementCompletion(observer.document)).toBe(true);

    expect(wrapTokenRefreshVisibility.call(observer, wrapped)).toBe('wrapped-result');
    expect(wrapTokenRefreshVisibility.call(observer, wrapped)).toBe('wrapped-result');
    expect(wrapped).toHaveBeenCalledTimes(2);

    jest.useRealTimers();
  });

  test('throttles handled non-render-locked targets inside core movement perception', () => {
    jest.useFakeTimers();

    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    observer.document.object = observer;
    const target = createMockToken({ id: 'target', visible: true });
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
    const wrapped = jest.fn(() => 'wrapped-result');
    global.canvas.perception = {
      update: jest.fn(() => {
        expect(wrapTokenRefreshVisibility.call(target, wrapped)).toBe('wrapped-result');
        expect(wrapTokenRefreshVisibility.call(target, wrapped)).toBe(true);
      }),
    };

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer]);
    expect(schedulePendingTokenMovementCompletion(observer.document)).toBe(true);
    global.canvas.perception.update({
      initializeVisionModes: false,
      refreshLighting: true,
      refreshVision: true,
    });
    expect(wrapped).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(22);

    expect(wrapTokenRefreshVisibility.call(target, wrapped)).toBe('wrapped-result');
    expect(wrapped).toHaveBeenCalledTimes(2);

    jest.useRealTimers();
  });

  test('re-hides invisible undetected target on active-movement fast refresh path', () => {
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({
      id: 'target',
      visible: false,
      actor: {
        hasCondition: jest.fn((slug) => slug === 'invisible'),
        system: { conditions: { invisible: { active: true } } },
      },
    });
    target.renderable = false;
    target.mesh = { visible: false, renderable: false, alpha: 0 };
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

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer]);
    const wrapped = jest.fn(() => {
      target.visible = true;
      target.renderable = true;
      target.mesh.visible = true;
      target.mesh.renderable = true;
      target.mesh.alpha = 1;
      return 'wrapped-result';
    });

    const result = wrapTokenRefreshVisibility.call(target, wrapped);

    expect(result).toBe('wrapped-result');
    expect(wrapped).toHaveBeenCalledTimes(1);
    expect(target.visible).toBe(false);
    expect(target.renderable).toBe(false);
    expect(target.mesh.visible).toBe(false);
    expect(target.mesh.renderable).toBe(false);
    expect(target.mesh.alpha).toBe(0);
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

  test('preserves pending observer soundwave when control state is temporarily empty', () => {
    const visionSpy = jest.spyOn(VisionAnalyzer, 'getInstance').mockReturnValue({
      getVisionCapabilities: jest.fn(() => ({ hasVision: true })),
      getSensingCapabilities: jest.fn(() => ({ imprecise: { tremorsense: 30 }, precise: {} })),
    });
    try {
      global.canvas.walls.placeables = [
        createMockWall({ id: 'wall', c: [50, 0, 50, 100], sight: 1, sound: 1 }),
      ];
      const observer = createMockToken({
        id: 'observer',
        flags: visibilityV2Flags({ target: 'undetected' }),
      });
      observer.center = { x: 25, y: 25 };
      const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
      target.center = { x: 75, y: 25 };
      const soundwaveFilter = { id: 'soundwave-filter' };
      target.detectionFilter = soundwaveFilter;
      target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
      target.mesh = { visible: true, renderable: true, alpha: 1 };
      global.canvas = {
        ...global.canvas,
        grid: { size: 50 },
        scene: { ...global.canvas.scene, grid: { distance: 5 } },
        effects: {
          visionSources: new Map(),
          lightSources: new Map(),
        },
        tokens: {
          _draggedToken: null,
          controlled: [],
          get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
          placeables: [observer, target],
        },
      };

      expect(
        setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer], {
          finalVisibilityStatesByTargetId: { target: 'undetected' },
        }),
      ).toBe(true);
      expect(targetQualifiesForLiveImpreciseSoundwave(target)).toBe(true);
      const wrapped = jest.fn(() => {
        target.detectionFilter = null;
        target.detectionFilterMesh.visible = false;
        target.detectionFilterMesh.renderable = false;
        target.detectionFilterMesh.alpha = 0;
        return 'wrapped-result';
      });

      const result = wrapTokenRefreshVisibility.call(target, wrapped);

      expect(result).toBe('wrapped-result');
      expect(wrapped).toHaveBeenCalledTimes(1);
      expect(target.detectionFilter).toBe(soundwaveFilter);
      expect(target.detectionFilterMesh).toMatchObject({
        visible: true,
        renderable: true,
        alpha: 1,
      });
      expect(target.mesh).toMatchObject({
        visible: true,
        renderable: true,
        alpha: 1,
      });
    } finally {
      visionSpy.mockRestore();
    }
  });

  test('keeps observed precise tremorsense target rendered when sight drops at movement start', () => {
    const visionSpy = jest.spyOn(VisionAnalyzer, 'getInstance').mockReturnValue({
      getVisionCapabilities: jest.fn(() => ({ hasVision: true })),
      getSensingCapabilities: jest.fn(() => ({ imprecise: {}, precise: { tremorsense: 30 } })),
    });
    try {
      const observer = createMockToken({
        id: 'observer',
        controlled: true,
        flags: visibilityV2Flags({ target: 'observed' }),
      });
      observer.center = { x: 25, y: 25 };
      const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
      target.center = { x: 75, y: 25 };
      target.renderable = true;
      target.mesh = { visible: true, renderable: true, alpha: 1 };
      target.detectionFilter = null;
      target.detectionFilterMesh = { visible: false, renderable: false, alpha: 0 };
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
                los: { contains: jest.fn(() => false) },
                shape: { contains: jest.fn(() => false) },
              },
            ],
          ]),
          lightSources: new Map(),
        },
        tokens: {
          _draggedToken: null,
          controlled: [observer],
          get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
          placeables: [observer, target],
        },
      };

      expect(
        setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer], {
          finalVisibilityStatesByTargetId: { target: 'observed' },
        }),
      ).toBe(true);
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
      expect(target.visible).toBe(true);
      expect(target.renderable).toBe(true);
      expect(target.mesh).toMatchObject({
        visible: true,
        renderable: true,
        alpha: 1,
      });
      expect(target.detectionFilter).toBeNull();
      expect(target.detectionFilterMesh).toMatchObject({
        visible: false,
        renderable: false,
        alpha: 0,
      });
    } finally {
      visionSpy.mockRestore();
    }
  });

  test('keeps precise nonvisual replacement rendered when current-view initial state was undetected', () => {
    const visionSpy = jest.spyOn(VisionAnalyzer, 'getInstance').mockReturnValue({
      getVisionCapabilities: jest.fn(() => ({ hasVision: true })),
      getSensingCapabilities: jest.fn(() => ({ imprecise: {}, precise: { tremorsense: 30 } })),
    });
    const replacementSpy = jest
      .spyOn(FeatsHandler, 'getVisibilityReplacement')
      .mockImplementation((observerToken, targetToken, currentVisibility) =>
        observerToken?.id === 'observer' &&
        targetToken?.id === 'target' &&
        currentVisibility === 'undetected'
          ? { state: 'observed', source: 'precise-tremorsense' }
          : null,
      );
    try {
      const observer = createMockToken({
        id: 'observer',
        controlled: true,
        flags: visibilityV2Flags({ target: 'undetected' }),
      });
      observer.center = { x: 25, y: 25 };
      const target = createMockToken({ id: 'target', x: 3, y: 0, visible: true });
      target.center = { x: 75, y: 25 };
      target.renderable = true;
      target.mesh = { visible: true, renderable: true, alpha: 1 };
      target.detectionFilter = null;
      target.detectionFilterMesh = { visible: false, renderable: false, alpha: 0 };
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
                los: { contains: jest.fn(() => false) },
                shape: { contains: jest.fn(() => false) },
              },
            ],
          ]),
          lightSources: new Map(),
        },
        tokens: {
          _draggedToken: null,
          controlled: [observer],
          get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
          placeables: [observer, target],
        },
      };

      expect(setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer])).toBe(
        true,
      );
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
      expect(target.visible).toBe(true);
      expect(target.renderable).toBe(true);
      expect(target.mesh).toMatchObject({
        visible: true,
        renderable: true,
        alpha: 1,
      });
      expect(target.detectionFilter).toBeNull();
      expect(target.detectionFilterMesh).toMatchObject({
        visible: false,
        renderable: false,
        alpha: 0,
      });
    } finally {
      replacementSpy.mockRestore();
      visionSpy.mockRestore();
    }
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

  test('clears primed hidden soundwave mesh when core does not recreate filter', () => {
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.detectionFilter = null;
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
    expect(target.detectionFilter).toBeNull();
    expect(target.detectionFilterMesh).toMatchObject({
      visible: false,
      renderable: false,
      alpha: 0,
    });
  });

  test('hard-hides hidden loot token and clears soundwave visuals during token refresh', () => {
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({
      id: 'target',
      actor: createMockActor({ type: 'loot' }),
      visible: true,
    });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.detectionFilter = { id: 'soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
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
      target.visible = true;
      target.renderable = true;
      target.mesh.visible = true;
      target.mesh.renderable = true;
      target.mesh.alpha = 1;
      target.detectionFilter = { id: 'core-soundwave-filter' };
      target.detectionFilterMesh.visible = true;
      target.detectionFilterMesh.renderable = true;
      target.detectionFilterMesh.alpha = 1;
      return 'wrapped-result';
    });

    const result = wrapTokenRefreshVisibility.call(target, wrapped);

    expect(result).toBe('wrapped-result');
    expect(wrapped).toHaveBeenCalledTimes(1);
    expect(target).toMatchObject({
      visible: false,
      renderable: false,
      detectionFilter: null,
      mesh: { visible: false, renderable: false, alpha: 0 },
      detectionFilterMesh: { visible: false, renderable: false, alpha: 0 },
    });
  });

  test('clears mesh-only detection visual after observed token refresh', () => {
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'observed' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.detectionFilter = null;
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
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
    const wrapped = jest.fn(() => 'wrapped-result');

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

  test('clears core-added detection filter on fast refresh for concealed target', () => {
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'concealed' }),
    });
    const target = createMockToken({ id: 'target', visible: true });
    target.detectionFilter = null;
    target.detectionFilterMesh = { visible: false, renderable: false, alpha: 0 };
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
    const coreFilter = { id: 'core-outline-filter' };
    const wrapped = jest.fn(() => {
      target.detectionFilter = coreFilter;
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

  test('coalesces delayed visibility perception updates for pending movement refreshed tokens', () => {
    const observer = createMockToken({ id: 'observer' });
    const target = createMockToken({ id: 'target', visible: true });
    target.refresh = jest.fn();
    const perceptionUpdate = jest.fn();
    global.canvas = {
      ...global.canvas,
      perception: { update: perceptionUpdate },
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        placeables: [observer, target],
      },
    };

    refreshPendingMovementTokenVisibility('observer', { skipPerceptionRefresh: true });
    const wrapped = jest.fn(() => {
      global.canvas.perception.update({ refreshVision: true });
      global.canvas.perception.update({ refreshLighting: true });
      return 'wrapped-result';
    });

    expect(wrapTokenRefreshVisibility.call(target, wrapped)).toBe('wrapped-result');

    expect(perceptionUpdate).not.toHaveBeenCalled();

    flushScheduledCanvasPerceptionUpdate();

    expect(perceptionUpdate).toHaveBeenCalledTimes(1);
    expect(perceptionUpdate).toHaveBeenCalledWith({
      refreshVision: true,
      refreshLighting: true,
    });
  });
});
