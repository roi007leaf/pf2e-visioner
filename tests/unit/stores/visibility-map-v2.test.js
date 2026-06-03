import {
  getPerceptionProfileBetween,
  getPerceptionProfileMap,
  getVisibilityBetween,
  getVisibilityMap,
  setVisibilityMap,
  setVisibilityMapsBatch,
  setPerceptionProfileBetween,
  setVisibilityBetween,
} from '../../../scripts/stores/visibility-map.js';
import { clearPendingPerceptionProfileWrites } from '../../../scripts/stores/visibility-profile-flag-persistence.js';
import {
  clearPendingTokenMovementPosition,
  setPendingTokenMovementPosition,
} from '../../../scripts/services/PendingMovement/pending-token-movement.js';
import {
  currentPendingMovementSightLineSeesTarget,
  shouldSuppressPendingMovementDetectionFilterVisuals,
  withSuppressedPendingMovementDetectionFilterVisuals,
} from '../../../scripts/services/PendingMovement/pending-movement-render-lock.js';

describe('Visibility Map V2 profile storage', () => {
  let observer;
  let target;

  beforeEach(() => {
    observer = global.createMockToken({ id: 'observer' });
    target = global.createMockToken({ id: 'target' });
    global.game.user.isGM = true;
  });

  afterEach(() => {
    clearPendingTokenMovementPosition('observer');
    clearPendingPerceptionProfileWrites();
  });

  test('setVisibilityBetween writes concealed only as observed plus concealment in visibilityV2', async () => {
    await setVisibilityBetween(observer, target, 'concealed', { skipEphemeralUpdate: true });

    expect(observer.document.setFlag).not.toHaveBeenCalledWith(
      'pf2e-visioner',
      'visibility',
      expect.anything(),
    );
    expect(observer.document.setFlag).toHaveBeenCalledWith(
      'pf2e-visioner',
      'visibilityV2',
      {
        target: expect.objectContaining({
          detectionState: 'observed',
          hasConcealment: true,
          coverState: 'none',
          detectionSense: null,
          awarenessState: null,
        }),
      },
    );
  });

  test('runtime readers ignore legacy visibility maps after v2 migration support', () => {
    observer.document.getFlag.mockImplementation((moduleId, key) => {
      if (moduleId !== 'pf2e-visioner') return null;
      if (key === 'visibility') return { target: 'concealed' };
      return null;
    });

    expect(getPerceptionProfileBetween(observer, target)).toMatchObject({
      detectionState: 'observed',
      hasConcealment: false,
    });
    expect(getVisibilityBetween(observer, target)).toBe('observed');
  });

  test('getVisibilityBetween serializes visibilityV2 profiles for legacy callers', () => {
    observer.document.getFlag.mockImplementation((moduleId, key) => {
      if (moduleId !== 'pf2e-visioner') return null;
      if (key === 'visibilityV2') {
        return {
          target: {
            detectionState: 'observed',
            hasConcealment: true,
          },
        };
      }
      return {};
    });

    expect(getVisibilityBetween(observer, target)).toBe('concealed');
  });

  test('getVisibilityBetween reads only the requested visibilityV2 profile', () => {
    const requestedProfile = jest.fn(() => ({
      detectionState: 'hidden',
      hasConcealment: false,
    }));
    const unrelatedProfile = jest.fn(() => ({
      detectionState: 'undetected',
      hasConcealment: false,
    }));
    const visibilityV2 = {};
    Object.defineProperties(visibilityV2, {
      target: { enumerable: true, get: requestedProfile },
      unrelated: { enumerable: true, get: unrelatedProfile },
    });

    observer.document.getFlag.mockImplementation((moduleId, key) => {
      if (moduleId !== 'pf2e-visioner') return null;
      if (key === 'visibilityV2') return visibilityV2;
      return {};
    });

    expect(getVisibilityBetween(observer, target)).toBe('hidden');
    expect(requestedProfile).toHaveBeenCalledTimes(1);
    expect(unrelatedProfile).not.toHaveBeenCalled();
  });

  test('setPerceptionProfileBetween preserves concealment beside hidden detection', async () => {
    await setPerceptionProfileBetween(observer, target, {
      detectionState: 'hidden',
      hasConcealment: true,
    });

    expect(observer.document.setFlag).toHaveBeenCalledWith(
      'pf2e-visioner',
      'visibilityV2',
      {
        target: expect.objectContaining({
          detectionState: 'hidden',
          hasConcealment: true,
        }),
      },
    );
    expect(getPerceptionProfileBetween(observer, target)).toMatchObject({
      detectionState: 'hidden',
      hasConcealment: true,
    });
    expect(getVisibilityBetween(observer, target)).toBe('hidden');
  });

  test('setVisibilityBetween ignores unknown legacy states instead of persisting legacy data', async () => {
    await setVisibilityBetween(observer, target, 'invalid-state', { skipEphemeralUpdate: true });

    expect(observer.document.setFlag).not.toHaveBeenCalledWith(
      'pf2e-visioner',
      'visibility',
      expect.anything(),
    );
    expect(getVisibilityBetween(observer, target)).toBe('observed');
    expect(getPerceptionProfileMap(observer)).toEqual({});
  });

  test('setVisibilityMapsBatch persists multiple observer maps through scene bulk updates', async () => {
    const observerB = global.createMockToken({ id: 'observer-b' });
    const originalUpdateEmbeddedDocuments = global.canvas.scene.updateEmbeddedDocuments;
    global.canvas.scene.updateEmbeddedDocuments = jest.fn().mockResolvedValue([]);

    await setVisibilityMapsBatch([
      { token: observer, visibilityMap: { target: 'hidden' } },
      { token: observerB, visibilityMap: { target: 'concealed' } },
    ]);

    expect(global.canvas.scene.updateEmbeddedDocuments).toHaveBeenCalledWith(
      'Token',
      [
        {
          _id: 'observer',
          'flags.pf2e-visioner.visibilityV2': {
            target: expect.objectContaining({ detectionState: 'hidden' }),
          },
        },
        {
          _id: 'observer-b',
          'flags.pf2e-visioner.visibilityV2': {
            target: expect.objectContaining({
              detectionState: 'observed',
              hasConcealment: true,
            }),
          },
        },
      ],
      { diff: false, render: false, animate: false },
    );

    global.canvas.scene.updateEmbeddedDocuments = originalUpdateEmbeddedDocuments;
  });

  test('setVisibilityMapsBatch removes observed entries without clearing the whole visibilityV2 map', async () => {
    observer = global.createMockToken({ id: 'observer' });
    const forcedDeletion = foundry.data.operators.ForcedDeletion;
    const flags = {
      'pf2e-visioner': {
        visibilityV2: {
          keep: {
            detectionState: 'undetected',
            hasConcealment: false,
            coverState: 'none',
            detectionSense: null,
            awarenessState: null,
          },
          remove: {
            detectionState: 'hidden',
            hasConcealment: false,
            coverState: 'none',
            detectionSense: null,
            awarenessState: null,
          },
        },
      },
    };
    observer.document.getFlag.mockImplementation((moduleId, key) => flags[moduleId]?.[key] ?? null);

    const originalUpdateEmbeddedDocuments = global.canvas.scene.updateEmbeddedDocuments;
    global.canvas.scene.updateEmbeddedDocuments = jest.fn(async (_documentName, updates) => {
      for (const update of updates) {
        const patch = update['flags.pf2e-visioner.visibilityV2'];
        if (!patch) continue;

        const current = flags['pf2e-visioner'].visibilityV2 ?? {};
        for (const [key, value] of Object.entries(patch)) {
          if (value === forcedDeletion) {
            delete current[key];
          } else if (key.startsWith('-=')) {
            delete current[key.slice(2)];
          } else {
            current[key] = value;
          }
        }
        flags['pf2e-visioner'].visibilityV2 = current;
      }
      return [];
    });

    try {
      const result = await setVisibilityMapsBatch([
        { token: observer, visibilityMap: { keep: 'undetected' } },
      ]);

      expect(result).toEqual(expect.objectContaining({ repaired: 0 }));
      expect(global.canvas.scene.updateEmbeddedDocuments).toHaveBeenCalledTimes(1);
      expect(global.canvas.scene.updateEmbeddedDocuments).toHaveBeenCalledWith(
        'Token',
        [
          {
            _id: 'observer',
            'flags.pf2e-visioner.visibilityV2': {
              keep: expect.objectContaining({ detectionState: 'undetected' }),
              remove: forcedDeletion,
            },
          },
        ],
        { diff: false, render: false, animate: false },
      );
      expect(global.canvas.scene.updateEmbeddedDocuments.mock.calls[0][1][0])
        .not.toHaveProperty('flags.pf2e-visioner.-=visibilityV2');
      expect(global.canvas.scene.updateEmbeddedDocuments.mock.calls[0][1][0]['flags.pf2e-visioner.visibilityV2'])
        .not.toHaveProperty('-=remove');
      expect(getVisibilityMap(observer)).toEqual({ keep: 'undetected' });
    } finally {
      global.canvas.scene.updateEmbeddedDocuments = originalUpdateEmbeddedDocuments;
    }
  });

  test('setVisibilityMapsBatch defers stale readback repair while pending write overlay is active', async () => {
    observer = global.createMockToken({
      id: 'observer',
      flags: {
        'pf2e-visioner': {
          visibilityV2: {
            target: {
              detectionState: 'undetected',
              hasConcealment: false,
              coverState: 'none',
              detectionSense: null,
              awarenessState: null,
            },
          },
        },
      },
    });
    const originalUpdateEmbeddedDocuments = global.canvas.scene.updateEmbeddedDocuments;
    global.canvas.scene.updateEmbeddedDocuments = jest.fn().mockResolvedValue([]);

    try {
      const result = await setVisibilityMapsBatch([
        { token: observer, visibilityMap: { target: 'observed' } },
      ]);

      expect(result).toEqual(expect.objectContaining({ repaired: 0 }));
      expect(global.canvas.scene.updateEmbeddedDocuments).toHaveBeenCalledWith(
        'Token',
        [
          {
            _id: 'observer',
            'flags.pf2e-visioner.visibilityV2': foundry.data.operators.ForcedDeletion,
          },
        ],
        { diff: false, render: false, animate: false },
      );
      expect(observer.document.unsetFlag).not.toHaveBeenCalled();
      expect(getVisibilityBetween(observer, target)).toBe('observed');
    } finally {
      global.canvas.scene.updateEmbeddedDocuments = originalUpdateEmbeddedDocuments;
    }
  });

  test('setVisibilityMapsBatch clears observed target soundwave visuals immediately', async () => {
    const flags = {
      'pf2e-visioner': {
        visibilityV2: {
          target: {
            detectionState: 'hidden',
            hasConcealment: false,
            coverState: 'none',
            detectionSense: null,
            awarenessState: null,
          },
        },
      },
    };
    observer.document.getFlag.mockImplementation((moduleId, key) => flags[moduleId]?.[key] ?? null);
    target.detectionFilter = { id: 'stale-soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    target._pvHiddenEcho = { visible: true };
    const originalTokens = global.canvas.tokens;
    const originalUpdateEmbeddedDocuments = global.canvas.scene.updateEmbeddedDocuments;
    global.canvas.tokens = {
      ...global.canvas.tokens,
      get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
      placeables: [observer, target],
    };
    global.canvas.scene.updateEmbeddedDocuments = jest.fn(async (_documentName, updates) => {
      expect(target.detectionFilter).toBeNull();
      expect(target.detectionFilterMesh).toMatchObject({
        visible: false,
        renderable: false,
        alpha: 0,
      });
      expect(target._pvHiddenEcho.visible).toBe(false);
      expect(shouldSuppressPendingMovementDetectionFilterVisuals(target)).toBe(true);
      withSuppressedPendingMovementDetectionFilterVisuals(target, () => {
        target.detectionFilter = { id: 'core-readded-soundwave-filter' };
        target.detectionFilterMesh.visible = true;
        target.detectionFilterMesh.renderable = true;
        target.detectionFilterMesh.alpha = 1;
      });
      expect(target.detectionFilter).toBeNull();
      expect(target.detectionFilterMesh).toMatchObject({
        visible: false,
        renderable: false,
        alpha: 0,
      });
      for (const update of updates) {
        const nextMap = update['flags.pf2e-visioner.visibilityV2'];
        if (nextMap) flags['pf2e-visioner'].visibilityV2 = nextMap;
      }
      return [];
    });

    try {
      await setVisibilityMapsBatch(
        [{ token: observer, visibilityMap: { target: 'observed' } }],
        { preserveObserved: true },
      );

      expect(target.detectionFilter).toBeNull();
      expect(target.detectionFilterMesh).toMatchObject({
        visible: false,
        renderable: false,
        alpha: 0,
      });
      expect(target._pvHiddenEcho).toBeNull();
    } finally {
      global.canvas.tokens = originalTokens;
      global.canvas.scene.updateEmbeddedDocuments = originalUpdateEmbeddedDocuments;
    }
  });

  test('setVisibilityMapsBatch does not clear observed target soundwave during drag preview', async () => {
    const flags = {
      'pf2e-visioner': {
        visibilityV2: {
          target: {
            detectionState: 'hidden',
            hasConcealment: false,
            coverState: 'none',
            detectionSense: null,
            awarenessState: null,
          },
        },
      },
    };
    observer.document.getFlag.mockImplementation((moduleId, key) => flags[moduleId]?.[key] ?? null);
    target.detectionFilter = { id: 'stale-soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    target._pvHiddenEcho = { visible: true };
    const originalTokens = global.canvas.tokens;
    const originalUpdateEmbeddedDocuments = global.canvas.scene.updateEmbeddedDocuments;
    global.canvas.tokens = {
      ...global.canvas.tokens,
      _draggedToken: observer,
      controlled: [observer],
      get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
      placeables: [observer, target],
    };
    global.canvas.scene.updateEmbeddedDocuments = jest.fn(async (_documentName, updates) => {
      expect(target.detectionFilter).toEqual({ id: 'stale-soundwave-filter' });
      expect(target.detectionFilterMesh).toMatchObject({
        visible: true,
        renderable: true,
        alpha: 1,
      });
      expect(target._pvHiddenEcho.visible).toBe(true);
      for (const update of updates) {
        const nextMap = update['flags.pf2e-visioner.visibilityV2'];
        if (nextMap) flags['pf2e-visioner'].visibilityV2 = nextMap;
      }
      return [];
    });

    try {
      await setVisibilityMapsBatch(
        [{ token: observer, visibilityMap: { target: 'observed' } }],
        { preserveObserved: true },
      );

      expect(target.detectionFilter).toEqual({ id: 'stale-soundwave-filter' });
      expect(target.detectionFilterMesh).toMatchObject({
        visible: true,
        renderable: true,
        alpha: 1,
      });
      expect(target._pvHiddenEcho.visible).toBe(true);
    } finally {
      global.canvas.tokens = originalTokens;
      global.canvas.scene.updateEmbeddedDocuments = originalUpdateEmbeddedDocuments;
    }
  });

  test('scheduled observed soundwave clears do not run during drag preview', async () => {
    jest.useFakeTimers();
    const flags = {
      'pf2e-visioner': {
        visibilityV2: {
          target: {
            detectionState: 'hidden',
            hasConcealment: false,
            coverState: 'none',
            detectionSense: null,
            awarenessState: null,
          },
        },
      },
    };
    observer.document.getFlag.mockImplementation((moduleId, key) => flags[moduleId]?.[key] ?? null);
    target.detectionFilter = { id: 'stale-soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    const originalTokens = global.canvas.tokens;
    const originalUpdateEmbeddedDocuments = global.canvas.scene.updateEmbeddedDocuments;
    global.canvas.tokens = {
      ...global.canvas.tokens,
      _draggedToken: null,
      controlled: [observer],
      get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
      placeables: [observer, target],
    };
    global.canvas.scene.updateEmbeddedDocuments = jest.fn(async (_documentName, updates) => {
      for (const update of updates) {
        const nextMap = update['flags.pf2e-visioner.visibilityV2'];
        if (nextMap) flags['pf2e-visioner'].visibilityV2 = nextMap;
      }
      return [];
    });

    try {
      await setVisibilityMapsBatch(
        [{ token: observer, visibilityMap: { target: 'observed' } }],
        { preserveObserved: true },
      );
      target.detectionFilter = { id: 'core-readded-soundwave-filter' };
      target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
      global.canvas.tokens._draggedToken = observer;

      jest.advanceTimersByTime(2500);
      await Promise.resolve();

      expect(target.detectionFilter).toEqual({ id: 'core-readded-soundwave-filter' });
      expect(target.detectionFilterMesh).toMatchObject({
        visible: true,
        renderable: true,
        alpha: 1,
      });
    } finally {
      global.canvas.tokens = originalTokens;
      global.canvas.scene.updateEmbeddedDocuments = originalUpdateEmbeddedDocuments;
      jest.useRealTimers();
    }
  });

  test('setVisibilityMapsBatch does not clear observed soundwaves for non-controlled observers', async () => {
    const observerFlags = {
      'pf2e-visioner': {
        visibilityV2: {
          target: {
            detectionState: 'hidden',
            hasConcealment: false,
            coverState: 'none',
            detectionSense: null,
            awarenessState: null,
          },
        },
      },
    };
    const controlledObserver = global.createMockToken({
      id: 'controlled-observer',
      flags: {
        'pf2e-visioner': {
          visibilityV2: {
            target: {
              detectionState: 'hidden',
              hasConcealment: false,
              coverState: 'none',
              detectionSense: null,
              awarenessState: null,
            },
          },
        },
      },
    });
    observer.document.getFlag.mockImplementation(
      (moduleId, key) => observerFlags[moduleId]?.[key] ?? null,
    );
    target.detectionFilter = { id: 'controlled-soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    const originalTokens = global.canvas.tokens;
    const originalUpdateEmbeddedDocuments = global.canvas.scene.updateEmbeddedDocuments;
    global.canvas.tokens = {
      ...global.canvas.tokens,
      controlled: [controlledObserver],
      get: jest.fn((id) =>
        id === 'observer'
          ? observer
          : id === 'controlled-observer'
            ? controlledObserver
            : id === 'target'
              ? target
              : null,
      ),
      placeables: [observer, controlledObserver, target],
    };
    global.canvas.scene.updateEmbeddedDocuments = jest.fn(async (_documentName, updates) => {
      for (const update of updates) {
        const nextMap = update['flags.pf2e-visioner.visibilityV2'];
        if (nextMap) observerFlags['pf2e-visioner'].visibilityV2 = nextMap;
      }
      return [];
    });

    try {
      await setVisibilityMapsBatch(
        [{ token: observer, visibilityMap: { target: 'observed' } }],
        { preserveObserved: true },
      );

      expect(target.detectionFilter).toEqual({ id: 'controlled-soundwave-filter' });
      expect(target.detectionFilterMesh).toMatchObject({
        visible: true,
        renderable: true,
        alpha: 1,
      });
      expect(shouldSuppressPendingMovementDetectionFilterVisuals(target)).toBe(false);
    } finally {
      global.canvas.tokens = originalTokens;
      global.canvas.scene.updateEmbeddedDocuments = originalUpdateEmbeddedDocuments;
    }
  });

  test('hidden visual retry clears stale soundwave when current sight is clear', async () => {
    jest.useFakeTimers();
    observer.document.getFlag.mockImplementation((moduleId, key) => {
      if (moduleId !== 'pf2e-visioner') return null;
      if (key === 'visibilityV2') return {};
      return null;
    });
    target.detectionFilter = { id: 'stale-hidden-soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    const originalTokens = global.canvas.tokens;
    const originalEffects = global.canvas.effects;
    global.canvas = {
      ...global.canvas,
      walls: { placeables: [] },
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
        ...global.canvas.tokens,
        controlled: [observer],
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        placeables: [observer, target],
      },
    };

    try {
      await setVisibilityMap(observer, { target: 'hidden' });
      jest.advanceTimersByTime(150);

      expect(currentPendingMovementSightLineSeesTarget(observer, target)).toBe(true);
      expect(target.detectionFilter).toBeNull();
      expect(target.detectionFilterMesh).toMatchObject({
        visible: false,
        renderable: false,
        alpha: 0,
      });
    } finally {
      global.canvas.tokens = originalTokens;
      global.canvas.effects = originalEffects;
      jest.useRealTimers();
    }
  });

  test('stale hidden visual retry does not restore soundwave after observed write', async () => {
    jest.useFakeTimers();
    const flags = {
      'pf2e-visioner': {
        visibilityV2: {},
      },
    };
    observer.document.getFlag.mockImplementation((moduleId, key) => flags[moduleId]?.[key] ?? null);
    target.detectionFilter = null;
    let observedWriteCommitted = false;
    const meshState = { visible: false, renderable: false, alpha: 0 };
    const visibleWritesAfterObserved = [];
    target.detectionFilterMesh = {
      get visible() {
        return meshState.visible;
      },
      set visible(value) {
        if (observedWriteCommitted && value === true) visibleWritesAfterObserved.push(value);
        meshState.visible = value;
      },
      get renderable() {
        return meshState.renderable;
      },
      set renderable(value) {
        meshState.renderable = value;
      },
      get alpha() {
        return meshState.alpha;
      },
      set alpha(value) {
        meshState.alpha = value;
      },
    };
    const originalTokens = global.canvas.tokens;
    const originalUpdateEmbeddedDocuments = global.canvas.scene.updateEmbeddedDocuments;
    global.canvas.tokens = {
      ...global.canvas.tokens,
      controlled: [observer],
      get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
      placeables: [observer, target],
    };
    global.canvas.scene.updateEmbeddedDocuments = jest.fn(async (_documentName, updates) => {
      for (const update of updates) {
        const nextMap = update['flags.pf2e-visioner.visibilityV2'];
        if (nextMap) flags['pf2e-visioner'].visibilityV2 = nextMap;
      }
      return [];
    });

    try {
      await setVisibilityMapsBatch([{ token: observer, visibilityMap: { target: 'hidden' } }]);
      expect(target.detectionFilterMesh).toMatchObject({
        visible: true,
        renderable: true,
        alpha: 1,
      });

      await setVisibilityMapsBatch(
        [{ token: observer, visibilityMap: { target: 'observed' } }],
        { preserveObserved: true },
      );
      observedWriteCommitted = true;
      target.detectionFilter = null;
      target.detectionFilterMesh.visible = false;
      target.detectionFilterMesh.renderable = false;
      target.detectionFilterMesh.alpha = 0;

      jest.advanceTimersByTime(2500);
      await Promise.resolve();

      expect(getVisibilityBetween(observer, target)).toBe('observed');
      expect(visibleWritesAfterObserved).toEqual([]);
      expect(target.detectionFilter).toBeNull();
      expect(target.detectionFilterMesh).toMatchObject({
        visible: false,
        renderable: false,
        alpha: 0,
      });
    } finally {
      global.canvas.tokens = originalTokens;
      global.canvas.scene.updateEmbeddedDocuments = originalUpdateEmbeddedDocuments;
      jest.useRealTimers();
    }
  });

  test('setVisibilityMapsBatch does not clear soundwaves for non-view observers during pending movement', async () => {
    const movingObserver = global.createMockToken({ id: 'moving-observer' });
    const otherObserverFlags = {
      'pf2e-visioner': {
        visibilityV2: {
          target: {
            detectionState: 'hidden',
            hasConcealment: false,
            coverState: 'none',
            detectionSense: null,
            awarenessState: null,
          },
        },
      },
    };
    observer.document.getFlag.mockImplementation(
      (moduleId, key) => otherObserverFlags[moduleId]?.[key] ?? null,
    );
    target.detectionFilter = { id: 'moving-view-soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    const originalTokens = global.canvas.tokens;
    const originalUpdateEmbeddedDocuments = global.canvas.scene.updateEmbeddedDocuments;
    global.canvas.tokens = {
      ...global.canvas.tokens,
      controlled: [],
      _draggedToken: null,
      get: jest.fn((id) =>
        id === 'observer'
          ? observer
          : id === 'moving-observer'
            ? movingObserver
            : id === 'target'
              ? target
              : null,
      ),
      placeables: [observer, movingObserver, target],
    };
    global.canvas.scene.updateEmbeddedDocuments = jest.fn(async (_documentName, updates) => {
      for (const update of updates) {
        const nextMap = update['flags.pf2e-visioner.visibilityV2'];
        if (nextMap) otherObserverFlags['pf2e-visioner'].visibilityV2 = nextMap;
      }
      return [];
    });

    try {
      setPendingTokenMovementPosition(
        movingObserver.document,
        { x: 100, y: 0 },
        [movingObserver],
      );

      await setVisibilityMapsBatch(
        [{ token: observer, visibilityMap: { target: 'observed' } }],
        { preserveObserved: true },
      );

      expect(target.detectionFilter).toEqual({ id: 'moving-view-soundwave-filter' });
      expect(target.detectionFilterMesh).toMatchObject({
        visible: true,
        renderable: true,
        alpha: 1,
      });
    } finally {
      clearPendingTokenMovementPosition('moving-observer');
      global.canvas.tokens = originalTokens;
      global.canvas.scene.updateEmbeddedDocuments = originalUpdateEmbeddedDocuments;
    }
  });

  test('setVisibilityMapsBatch keeps hidden soundwaves during pending observed write when current LOS is blocked', async () => {
    target = global.createMockToken({ id: 'target', x: 3, y: 0 });
    const flags = {
      'pf2e-visioner': {
        visibilityV2: {
          target: {
            detectionState: 'hidden',
            hasConcealment: false,
            coverState: 'none',
            detectionSense: null,
            awarenessState: null,
          },
        },
      },
    };
    observer.document.getFlag.mockImplementation((moduleId, key) => flags[moduleId]?.[key] ?? null);
    target.document.getVisibilityTestPoints = jest.fn(() => [{ x: 100, y: 100 }]);
    target.detectionFilter = { id: 'stable-soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    const originalTokens = global.canvas.tokens;
    const originalEffects = global.canvas.effects;
    const originalWalls = global.canvas.walls;
    const originalUpdateEmbeddedDocuments = global.canvas.scene.updateEmbeddedDocuments;
    global.canvas.tokens = {
      ...global.canvas.tokens,
      _draggedToken: observer,
      controlled: [observer],
      get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
      placeables: [observer, target],
    };
    global.canvas.effects = {
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
    };
    global.canvas.walls = {
      placeables: [
        global.createMockWall({
          id: 'blocking-wall',
          c: [50, 0, 50, 150],
          sight: 1,
        }),
      ],
    };
    global.canvas.scene.updateEmbeddedDocuments = jest.fn(async (_documentName, updates) => {
      expect(target.detectionFilter).toEqual({ id: 'stable-soundwave-filter' });
      expect(target.detectionFilterMesh).toMatchObject({
        visible: true,
        renderable: true,
        alpha: 1,
      });
      for (const update of updates) {
        const nextMap = update['flags.pf2e-visioner.visibilityV2'];
        if (nextMap) flags['pf2e-visioner'].visibilityV2 = nextMap;
      }
      return [];
    });

    try {
      setPendingTokenMovementPosition(observer.document, { x: 10, y: 0 }, [observer]);
      expect(currentPendingMovementSightLineSeesTarget(observer, target)).toBe(false);

      await setVisibilityMapsBatch(
        [{ token: observer, visibilityMap: { target: 'observed' } }],
        { preserveObserved: true },
      );

      expect(target.detectionFilter).toEqual({ id: 'stable-soundwave-filter' });
      expect(target.detectionFilterMesh).toMatchObject({
        visible: true,
        renderable: true,
        alpha: 1,
      });
    } finally {
      global.canvas.tokens = originalTokens;
      global.canvas.effects = originalEffects;
      global.canvas.walls = originalWalls;
      global.canvas.scene.updateEmbeddedDocuments = originalUpdateEmbeddedDocuments;
    }
  });

  test('setVisibilityMapsBatch refreshes hidden target visuals without hiding token surfaces', async () => {
    const flags = {
      'pf2e-visioner': {
        visibilityV2: {},
      },
    };
    observer.document.getFlag.mockImplementation((moduleId, key) => flags[moduleId]?.[key] ?? null);
    target.renderable = true;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.detectionFilterMesh = { visible: false, renderable: false, alpha: 0 };
    target.document.getVisibilityTestPoints = jest.fn(() => [{ x: 10, y: 20 }]);
    target.refresh = jest.fn();
    const coreFilter = { id: 'core-soundwave-filter' };
    const originalVisibility = global.canvas.visibility;
    const originalTokens = global.canvas.tokens;
    const originalUpdateEmbeddedDocuments = global.canvas.scene.updateEmbeddedDocuments;
    global.canvas.visibility = {
      ...originalVisibility,
      testVisibility: jest.fn((_points, { object }) => {
        object.visible = true;
        object.renderable = true;
        object.mesh.visible = true;
        object.mesh.renderable = true;
        object.mesh.alpha = 1;
        object.detectionFilterMesh.visible = true;
        object.detectionFilterMesh.renderable = true;
        object.detectionFilterMesh.alpha = 1;
        object.detectionFilter = coreFilter;
        return true;
      }),
    };
    global.canvas.tokens = {
      ...global.canvas.tokens,
      get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
      placeables: [observer, target],
    };
    global.canvas.scene.updateEmbeddedDocuments = jest.fn(async (_documentName, updates) => {
      expect(target.detectionFilterMesh).toMatchObject({
        visible: true,
        renderable: true,
        alpha: 1,
      });
      expect(target.detectionFilter).toBe(coreFilter);
      for (const update of updates) {
        const nextMap = update['flags.pf2e-visioner.visibilityV2'];
        if (nextMap) flags['pf2e-visioner'].visibilityV2 = nextMap;
      }
      return [];
    });

    try {
      await setVisibilityMapsBatch([{ token: observer, visibilityMap: { target: 'hidden' } }]);

      expect(global.canvas.visibility.testVisibility).toHaveBeenCalledWith(
        [{ x: 10, y: 20 }],
        { object: target },
      );
      expect(target.refresh).not.toHaveBeenCalled();
      expect(target.visible).toBe(true);
      expect(target.renderable).toBe(true);
      expect(target.mesh).toMatchObject({ visible: true, renderable: true, alpha: 1 });
      expect(target.detectionFilterMesh).toMatchObject({
        visible: true,
        renderable: true,
        alpha: 1,
      });
      expect(target.detectionFilter).toBe(coreFilter);
    } finally {
      global.canvas.visibility = originalVisibility;
      global.canvas.tokens = originalTokens;
      global.canvas.scene.updateEmbeddedDocuments = originalUpdateEmbeddedDocuments;
    }
  });

  test('setVisibilityMapsBatch primes hidden mesh when core only sets filter property before write', async () => {
    const flags = {
      'pf2e-visioner': {
        visibilityV2: {},
      },
    };
    observer.document.getFlag.mockImplementation((moduleId, key) => flags[moduleId]?.[key] ?? null);
    target.detectionFilterMesh = { visible: false, renderable: false, alpha: 0 };
    target.document.getVisibilityTestPoints = jest.fn(() => [{ x: 10, y: 20 }]);
    target.refresh = jest.fn();
    const coreFilter = { id: 'core-soundwave-filter' };
    const originalVisibility = global.canvas.visibility;
    const originalTokens = global.canvas.tokens;
    const originalUpdateEmbeddedDocuments = global.canvas.scene.updateEmbeddedDocuments;
    global.canvas.visibility = {
      ...originalVisibility,
      testVisibility: jest.fn((_points, { object }) => {
        object.detectionFilter = coreFilter;
        return true;
      }),
    };
    global.canvas.tokens = {
      ...global.canvas.tokens,
      get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
      placeables: [observer, target],
    };
    global.canvas.scene.updateEmbeddedDocuments = jest.fn(async (_documentName, updates) => {
      expect(target.detectionFilter).toBe(coreFilter);
      expect(target.detectionFilterMesh).toMatchObject({
        visible: true,
        renderable: true,
        alpha: 1,
      });
      for (const update of updates) {
        const nextMap = update['flags.pf2e-visioner.visibilityV2'];
        if (nextMap) flags['pf2e-visioner'].visibilityV2 = nextMap;
      }
      return [];
    });

    try {
      await setVisibilityMapsBatch([{ token: observer, visibilityMap: { target: 'hidden' } }]);

      expect(target.detectionFilter).toBe(coreFilter);
      expect(target.detectionFilterMesh).toMatchObject({
        visible: true,
        renderable: true,
        alpha: 1,
      });
      expect(target.refresh).toHaveBeenCalledTimes(1);
    } finally {
      global.canvas.visibility = originalVisibility;
      global.canvas.tokens = originalTokens;
      global.canvas.scene.updateEmbeddedDocuments = originalUpdateEmbeddedDocuments;
    }
  });

  test('setVisibilityMapsBatch does not refresh hidden target token during active pending movement', async () => {
    const flags = {
      'pf2e-visioner': {
        visibilityV2: {},
      },
    };
    observer.document.getFlag.mockImplementation((moduleId, key) => flags[moduleId]?.[key] ?? null);
    target.detectionFilterMesh = { visible: false, renderable: false, alpha: 0 };
    target.document.getVisibilityTestPoints = jest.fn(() => [{ x: 10, y: 20 }]);
    target.refresh = jest.fn();
    const coreFilter = { id: 'core-soundwave-filter' };
    const originalVisibility = global.canvas.visibility;
    const originalTokens = global.canvas.tokens;
    const originalUpdateEmbeddedDocuments = global.canvas.scene.updateEmbeddedDocuments;
    global.canvas.visibility = {
      ...originalVisibility,
      testVisibility: jest.fn((_points, { object }) => {
        object.detectionFilter = coreFilter;
        return true;
      }),
    };
    global.canvas.tokens = {
      ...global.canvas.tokens,
      get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
      placeables: [observer, target],
    };
    global.canvas.scene.updateEmbeddedDocuments = jest.fn(async (_documentName, updates) => {
      for (const update of updates) {
        const nextMap = update['flags.pf2e-visioner.visibilityV2'];
        if (nextMap) flags['pf2e-visioner'].visibilityV2 = nextMap;
      }
      return [];
    });

    try {
      setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer]);
      await setVisibilityMapsBatch([{ token: observer, visibilityMap: { target: 'hidden' } }]);

      expect(global.canvas.visibility.testVisibility).toHaveBeenCalledWith(
        [{ x: 10, y: 20 }],
        { object: target },
      );
      expect(target.detectionFilter).toBe(coreFilter);
      expect(target.detectionFilterMesh).toMatchObject({
        visible: true,
        renderable: true,
        alpha: 1,
      });
      expect(target.refresh).not.toHaveBeenCalled();
    } finally {
      clearPendingTokenMovementPosition('observer');
      global.canvas.visibility = originalVisibility;
      global.canvas.tokens = originalTokens;
      global.canvas.scene.updateEmbeddedDocuments = originalUpdateEmbeddedDocuments;
    }
  });

  test('setVisibilityMapsBatch does not refresh a moving token when another observer marks it hidden', async () => {
    const flags = {
      'pf2e-visioner': {
        visibilityV2: {},
      },
    };
    observer.document.getFlag.mockImplementation((moduleId, key) => flags[moduleId]?.[key] ?? null);
    target.detectionFilterMesh = { visible: false, renderable: false, alpha: 0 };
    target.document.getVisibilityTestPoints = jest.fn(() => [{ x: 10, y: 20 }]);
    target.refresh = jest.fn();
    const coreFilter = { id: 'core-soundwave-filter' };
    const originalVisibility = global.canvas.visibility;
    const originalTokens = global.canvas.tokens;
    const originalUpdateEmbeddedDocuments = global.canvas.scene.updateEmbeddedDocuments;
    global.canvas.visibility = {
      ...originalVisibility,
      testVisibility: jest.fn((_points, { object }) => {
        object.detectionFilter = coreFilter;
        return true;
      }),
    };
    global.canvas.tokens = {
      ...global.canvas.tokens,
      get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
      placeables: [observer, target],
    };
    global.canvas.scene.updateEmbeddedDocuments = jest.fn(async (_documentName, updates) => {
      for (const update of updates) {
        const nextMap = update['flags.pf2e-visioner.visibilityV2'];
        if (nextMap) flags['pf2e-visioner'].visibilityV2 = nextMap;
      }
      return [];
    });

    try {
      setPendingTokenMovementPosition(target.document, { x: 100, y: 0 }, [target]);
      await setVisibilityMapsBatch([{ token: observer, visibilityMap: { target: 'hidden' } }]);

      expect(global.canvas.visibility.testVisibility).toHaveBeenCalledWith(
        [{ x: 10, y: 20 }],
        { object: target },
      );
      expect(target.detectionFilter).toBe(coreFilter);
      expect(target.detectionFilterMesh).toMatchObject({
        visible: true,
        renderable: true,
        alpha: 1,
      });
      expect(target.refresh).not.toHaveBeenCalled();
    } finally {
      clearPendingTokenMovementPosition('target');
      global.canvas.visibility = originalVisibility;
      global.canvas.tokens = originalTokens;
      global.canvas.scene.updateEmbeddedDocuments = originalUpdateEmbeddedDocuments;
    }
  });

  test('setVisibilityMap clears observed target soundwave visuals immediately', async () => {
    const flags = {
      'pf2e-visioner': {
        visibilityV2: {
          target: {
            detectionState: 'hidden',
            hasConcealment: false,
            coverState: 'none',
            detectionSense: null,
            awarenessState: null,
          },
        },
      },
    };
    observer.document.getFlag.mockImplementation((moduleId, key) => flags[moduleId]?.[key] ?? null);
    observer.document.setFlag.mockImplementation((_moduleId, key, value) => {
      flags['pf2e-visioner'][key] = value;
      return Promise.resolve(true);
    });
    target.detectionFilter = { id: 'stale-soundwave-filter' };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    const originalTokens = global.canvas.tokens;
    global.canvas.tokens = {
      ...global.canvas.tokens,
      get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
      placeables: [observer, target],
    };

    try {
      await setVisibilityMap(observer, { target: 'observed' }, { preserveObserved: true });

      expect(target.detectionFilter).toBeNull();
      expect(target.detectionFilterMesh).toMatchObject({
        visible: false,
        renderable: false,
        alpha: 0,
      });
    } finally {
      global.canvas.tokens = originalTokens;
    }
  });

  test('setVisibilityMap primes hidden target visuals before refresh fallback', async () => {
    const flags = {
      'pf2e-visioner': {
        visibilityV2: {},
      },
    };
    observer.document.getFlag.mockImplementation((moduleId, key) => flags[moduleId]?.[key] ?? null);
    observer.document.setFlag.mockImplementation((_moduleId, key, value) => {
      flags['pf2e-visioner'][key] = value;
      return Promise.resolve(true);
    });
    target.detectionFilterMesh = { visible: false, renderable: false, alpha: 0 };
    target.refresh = jest.fn();
    const originalVisibility = global.canvas.visibility;
    const originalTokens = global.canvas.tokens;
    global.canvas.visibility = { ...originalVisibility, testVisibility: undefined };
    global.canvas.tokens = {
      ...global.canvas.tokens,
      get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
      placeables: [observer, target],
    };

    try {
      await setVisibilityMap(observer, { target: 'hidden' });

      expect(target.refresh).toHaveBeenCalledTimes(1);
      expect(target.detectionFilterMesh).toMatchObject({
        visible: true,
        renderable: true,
        alpha: 1,
      });
    } finally {
      global.canvas.visibility = originalVisibility;
      global.canvas.tokens = originalTokens;
    }
  });

  test('setVisibilityBetween primes hidden target visuals immediately', async () => {
    const flags = {
      'pf2e-visioner': {
        visibilityV2: {},
      },
    };
    observer.document.getFlag.mockImplementation((moduleId, key) => flags[moduleId]?.[key] ?? null);
    observer.document.setFlag.mockImplementation((_moduleId, key, value) => {
      flags['pf2e-visioner'][key] = value;
      return Promise.resolve(true);
    });
    target.detectionFilterMesh = { visible: false, renderable: false, alpha: 0 };
    target.refresh = jest.fn();
    const originalVisibility = global.canvas.visibility;
    const originalTokens = global.canvas.tokens;
    global.canvas.visibility = { ...originalVisibility, testVisibility: undefined };
    global.canvas.tokens = {
      ...global.canvas.tokens,
      get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
      placeables: [observer, target],
    };

    try {
      await setVisibilityBetween(observer, target, 'hidden', { skipEphemeralUpdate: true });

      expect(target.refresh).toHaveBeenCalledTimes(1);
      expect(target.detectionFilterMesh).toMatchObject({
        visible: true,
        renderable: true,
        alpha: 1,
      });
    } finally {
      global.canvas.visibility = originalVisibility;
      global.canvas.tokens = originalTokens;
    }
  });
});
