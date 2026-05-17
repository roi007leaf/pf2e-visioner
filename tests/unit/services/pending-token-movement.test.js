import '../../setup.js';

import {
  clearPendingTokenMovementPosition,
  completePendingTokenMovement,
  getPendingMovementBlockedDetectionSources,
  refreshPendingMovementTokenVisibility,
  restorePendingMovementTokenRendering,
  schedulePendingTokenMovementCompletion,
  setPendingTokenMovementPosition,
  shouldTemporarilyBlockHiddenDetection,
  shouldTemporarilyForceTokenInvisible,
} from '../../../scripts/services/pending-token-movement.js';

describe('pending token movement hidden detection guard', () => {
  let originalCanvas;

  beforeEach(() => {
    originalCanvas = global.canvas;
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
    global.game.user.id = undefined;
    global.game.user.isGM = true;
    global.canvas = originalCanvas;
  });

  test('does not guard hidden detection without a pending controlled-token movement', () => {
    const observer = createMockToken({ id: 'observer', x: 0, y: 0 });
    const target = createMockToken({ id: 'target', x: 3, y: 0 });

    expect(shouldTemporarilyBlockHiddenDetection(observer, target, 'hidden')).toBe(false);
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

  test('suppresses pending moving source for Visioner-hidden targets even without wall blockage', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      x: 0,
      y: 0,
      flags: {
        'pf2e-visioner': {
          visibility: {
            target: 'hidden',
          },
        },
      },
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0 });
    const source = { active: true, object: observer, suppression: {} };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);

    expect(
      getPendingMovementBlockedDetectionSources(target, {
        visionSources: [source],
        lightSources: [],
      }),
    ).toEqual([source]);
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
    global.canvas = {
      ...global.canvas,
      tokens: {
        placeables: [observer, target, other],
      },
      perception: {
        update: jest.fn(),
      },
    };

    refreshPendingMovementTokenVisibility('observer');

    expect(observer.refresh).not.toHaveBeenCalled();
    expect(target.refresh).toHaveBeenCalledTimes(1);
    expect(other.refresh).toHaveBeenCalledTimes(1);
    expect(global.canvas.perception.update).toHaveBeenCalledWith({
      refreshVision: true,
      refreshOcclusion: true,
    });
  });

  test('immediately hides Visioner-hidden loot before scheduled token refresh applies', () => {
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
    expect(target.mesh.visible).toBe(false);
    expect(target.detectionFilter).toBeNull();
    expect(target.refresh).toHaveBeenCalledTimes(1);
  });

  test('does not force Visioner-hidden NPC tokens invisible', () => {
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

  test('forces Visioner-undetected NPC tokens invisible', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: {
        'pf2e-visioner': {
          visibility: {
            target: 'undetected',
          },
        },
      },
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
    expect(target.refresh).toHaveBeenCalledTimes(1);
    expect(shouldTemporarilyForceTokenInvisible(target)).toBe(true);
  });

  test('restores observed token rendering when pending movement expires', () => {
    jest.useFakeTimers();

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

    expect(target.renderable).toBe(false);
    expect(target.mesh.renderable).toBe(false);

    jest.advanceTimersByTime(2500);

    expect(target.renderable).toBe(true);
    expect(target.mesh.renderable).toBe(true);
    expect(target.mesh.alpha).toBe(1);
    expect(target.nameplate.visible).toBe(true);
  });

  test('keeps wall-blocked token hidden when LOS probe flickers visible during active movement', () => {
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
        testVisibility: jest.fn().mockReturnValueOnce(false).mockReturnValue(true),
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

    refreshPendingMovementTokenVisibility('observer');

    expect(target.renderable).toBe(false);
    expect(target.mesh.renderable).toBe(false);
    expect(target.mesh.alpha).toBe(0);
    expect(target.nameplate.visible).toBe(false);
    expect(global.canvas.visibility.testVisibility).toHaveBeenCalledTimes(2);

    expect(completePendingTokenMovement('observer')).toBe(true);
    expect(target.renderable).toBe(true);
    expect(target.mesh.renderable).toBe(true);
    expect(target.mesh.alpha).toBe(1);
    expect(target.nameplate.visible).toBe(true);
  });

  test('restores observed token rendering after movement animation completes', async () => {
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
    expect(target.renderable).toBe(false);

    jest.advanceTimersByTime(0);
    expect(target.renderable).toBe(false);

    resolveAnimation();
    await animationPromise;
    await Promise.resolve();

    expect(target.renderable).toBe(true);
    expect(target.mesh.renderable).toBe(true);
    expect(target.mesh.alpha).toBe(1);
    expect(target.nameplate.visible).toBe(true);
  });

  test('waits briefly for Foundry animation to appear before completing movement', async () => {
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
    expect(target.renderable).toBe(false);

    jest.advanceTimersByTime(25);
    observer._animation = { state: 'running', promise: animationPromise };

    jest.advanceTimersByTime(25);
    expect(target.renderable).toBe(false);

    resolveAnimation();
    await animationPromise;
    await Promise.resolve();

    expect(target.renderable).toBe(true);
    expect(target.mesh.renderable).toBe(true);
    expect(target.mesh.alpha).toBe(1);
    expect(target.nameplate.visible).toBe(true);
  });

  test('keeps token rendering hidden when player animation appears after first completion check', async () => {
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
    expect(target.renderable).toBe(false);
    expect(target.mesh.renderable).toBe(false);

    resolveAnimation();
    await animationPromise;
    await Promise.resolve();

    expect(target.renderable).toBe(true);
    expect(target.mesh.renderable).toBe(true);
    expect(target.mesh.alpha).toBe(1);
    expect(target.nameplate.visible).toBe(true);
  });

  test('movement completion restores token when final visibility becomes observed during grace', () => {
    jest.useFakeTimers();

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
    observer.document.getFlag.mockReturnValue({ target: 'observed' });

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
      flags: {
        'pf2e-visioner': {
          visibility: {
            target: 'hidden',
          },
        },
      },
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

    observer.document.getFlag.mockReturnValue({ target: 'observed' });
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

  test('keeps undetected targets invisible even when pending position can see them', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: {
        'pf2e-visioner': {
          visibility: {
            target: 'undetected',
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

  test('does not restore undetected token rendering when pending position can see it', () => {
    global.canvas.walls.placeables = [];
    const observer = createMockToken({
      id: 'observer',
      flags: {
        'pf2e-visioner': {
          visibility: {
            target: 'undetected',
          },
        },
      },
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
      flags: {
        'pf2e-visioner': {
          visibility: {
            target: 'undetected',
          },
        },
      },
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

  test('hides alternate token render surfaces while pending hidden visibility is active', () => {
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
    target.effects = { visible: true };
    target.targetArrows = { visible: true };
    target.targetPips = { visible: true };
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
    expect(target.turnMarker.visible).toBe(false);
    expect(target.turnMarker.mesh.visible).toBe(false);
    expect(target.detectionFilter).toBeNull();

    clearPendingTokenMovementPosition('observer');
    observer.document.getFlag.mockReturnValue({ target: 'observed' });
    jest.advanceTimersByTime(1001);
    refreshPendingMovementTokenVisibility([]);

    expect(target.renderable).toBe(true);
    expect(target.mesh.renderable).toBe(true);
    expect(target.mesh.alpha).toBe(1);
    expect(target.nameplate.visible).toBe(true);
    expect(target.effects.visible).toBe(true);
    expect(target.targetArrows.visible).toBe(true);
    expect(target.targetPips.visible).toBe(true);
    expect(target.turnMarker.visible).toBe(true);
    expect(target.turnMarker.mesh.visible).toBe(true);
  });

  test('does not restore token rendering while remembered observer still has target hidden', () => {
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

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);
    refreshPendingMovementTokenVisibility('observer');
    clearPendingTokenMovementPosition('observer');
    jest.advanceTimersByTime(1001);

    expect(restorePendingMovementTokenRendering(target)).toBe(false);
    expect(target.renderable).toBe(false);
    expect(target.mesh.renderable).toBe(false);
    expect(target.mesh.alpha).toBe(0);
    expect(target.nameplate.visible).toBe(false);
  });

  test('does not restore token rendering while hidden pending visibility is still active', () => {
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

  test('does not restore hidden token rendering during a transient observer lookup gap', () => {
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

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);
    refreshPendingMovementTokenVisibility('observer');
    clearPendingTokenMovementPosition('observer');
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

  test('does not restore hidden token rendering from a remembered hidden force decision', () => {
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

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);
    expect(shouldTemporarilyForceTokenInvisible(target)).toBe(true);
    target._pf2eVisionerPendingRenderState = {
      tokenRenderable: true,
      meshRenderable: true,
      meshAlpha: 1,
      surfaceVisibility: [{ name: 'nameplate', surface: target.nameplate, visible: true }],
    };
    clearPendingTokenMovementPosition('observer');
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

  test('does not clear remembered hidden rendering during a later wall-only force check', () => {
    jest.useFakeTimers();

    const observer = createMockToken({
      id: 'observer',
      x: 0,
      y: 0,
      flags: {
        'pf2e-visioner': {
          visibility: {
            target: 'hidden',
          },
        },
      },
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

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);
    expect(shouldTemporarilyForceTokenInvisible(target)).toBe(true);
    target._pf2eVisionerPendingRenderState = {
      tokenRenderable: true,
      meshRenderable: true,
      meshAlpha: 1,
      surfaceVisibility: [{ name: 'nameplate', surface: target.nameplate, visible: true }],
    };
    clearPendingTokenMovementPosition('observer');
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

  test('does not restore hidden token rendering when observer state briefly reads observed', () => {
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

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);
    expect(shouldTemporarilyForceTokenInvisible(target)).toBe(true);
    target._pf2eVisionerPendingRenderState = {
      tokenRenderable: true,
      meshRenderable: true,
      meshAlpha: 1,
      surfaceVisibility: [{ name: 'nameplate', surface: target.nameplate, visible: true }],
    };
    clearPendingTokenMovementPosition('observer');
    observer.document.getFlag.mockReturnValue({ target: 'observed' });

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

  test('restores observed token rendering while other pending movement is active', () => {
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

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);
    refreshPendingMovementTokenVisibility('observer');
    observer.document.getFlag.mockReturnValue({ target: 'observed' });
    jest.advanceTimersByTime(1001);

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

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);
    refreshPendingMovementTokenVisibility('observer');
    clearPendingTokenMovementPosition('observer');
    observer.document.getFlag.mockReturnValue({ target: 'observed' });
    jest.advanceTimersByTime(1001);

    expect(restorePendingMovementTokenRendering(target)).toBe(true);
    expect(target.renderable).toBe(true);
    expect(target.mesh.renderable).toBe(true);
    expect(target.mesh.alpha).toBe(1);
    expect(target.nameplate.visible).toBe(true);
  });

  test('does not restore token rendering while controlled observer still has target hidden', () => {
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
        controlled: [observer],
        placeables: [observer, target],
      },
      perception: {
        update: jest.fn(),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);
    refreshPendingMovementTokenVisibility('observer');
    clearPendingTokenMovementPosition('observer');
    jest.advanceTimersByTime(300);

    expect(restorePendingMovementTokenRendering(target)).toBe(false);
    expect(target.renderable).toBe(false);
    expect(target.mesh.renderable).toBe(false);
    expect(target.mesh.alpha).toBe(0);
    expect(target.nameplate.visible).toBe(false);
  });

  test('restores hidden render lock when observer perspective is intentionally cleared', () => {
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
        controlled: [],
        placeables: [observer, target],
      },
      perception: {
        update: jest.fn(),
      },
    };

    setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);
    refreshPendingMovementTokenVisibility('observer');
    clearPendingTokenMovementPosition('observer');

    expect(restorePendingMovementTokenRendering(target)).toBe(false);
    expect(restorePendingMovementTokenRendering(target, { ignoreObserverLocks: true })).toBe(true);
    expect(target.visible).toBe(true);
    expect(target.renderable).toBe(true);
    expect(target.mesh.visible).toBe(true);
    expect(target.mesh.renderable).toBe(true);
    expect(target.mesh.alpha).toBe(1);
    expect(target.nameplate.visible).toBe(true);
  });
});
