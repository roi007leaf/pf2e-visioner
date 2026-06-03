import '../../setup.js';

import { createPendingMovementFinalVisibilityController } from '../../../scripts/services/PendingMovement/pending-movement-final-visibility.js';
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

describe('pending movement final visibility prediction', () => {
  let originalCanvas;

  beforeEach(() => {
    originalCanvas = global.canvas;
    global.canvas = {
      ...global.canvas,
      grid: { size: 50 },
      scene: { grid: { distance: 5 } },
      walls: { placeables: [] },
    };
  });

  afterEach(() => {
    jest.useRealTimers();
    global.canvas = originalCanvas;
  });

  test('cheaply predicts observed targets become hidden when final LOS is blocked but sound remains open', () => {
    const observer = createMockToken({
      id: 'observer',
      x: 0,
      y: 0,
      flags: visibilityV2Flags({ target: 'observed' }),
    });
    const target = createMockToken({ id: 'target', x: 6, y: 0 });
    observer.document.object = observer;
    target.document.object = target;

    const controller = createPendingMovementFinalVisibilityController({
      getPlaceableTokens: () => [observer, target],
      getStoredVisibilityState: (source, candidate) =>
        source?.id === 'observer' && candidate?.id === 'target' ? 'observed' : 'observed',
      hasLineOfSightToSampledToken: () => false,
    });

    const prediction = controller.predictCheapFinalVisibilityStates(observer.document, {
      x: 100,
      y: 0,
    });

    expect(prediction.finalVisibilityStatesByTargetId.get('target')).toBe('hidden');
  });

  test('cheap final prediction skips sound wall geometry when scene has no sound-blocking walls', () => {
    let geometryReads = 0;
    global.canvas.walls.placeables = Array.from({ length: 1000 }, (_, index) => ({
      document: {
        id: `sight-wall-${index}`,
        get c() {
          geometryReads += 1;
          return [10000 + index, 0, 10000 + index, 100];
        },
        sight: 20,
        sound: 0,
        door: 0,
        ds: 0,
      },
    }));
    const observer = createMockToken({
      id: 'observer',
      x: 0,
      y: 0,
      flags: visibilityV2Flags({ target: 'observed' }),
    });
    const target = createMockToken({ id: 'target', x: 6, y: 0 });
    observer.document.object = observer;
    target.document.object = target;

    const controller = createPendingMovementFinalVisibilityController({
      getPlaceableTokens: () => [observer, target],
      getStoredVisibilityState: (source, candidate) =>
        source?.id === 'observer' && candidate?.id === 'target' ? 'observed' : 'observed',
      hasLineOfSightToSampledToken: () => false,
    });

    const prediction = controller.predictCheapFinalVisibilityStates(observer.document, {
      x: 100,
      y: 0,
    });

    expect(prediction.finalVisibilityStatesByTargetId.get('target')).toBe('hidden');
    expect(geometryReads).toBe(0);
  });

  test('cheaply predicts observed targets become undetected when final LOS and sound are blocked', () => {
    const observer = createMockToken({
      id: 'observer',
      x: 0,
      y: 0,
      flags: visibilityV2Flags({ target: 'observed' }),
    });
    const target = createMockToken({ id: 'target', x: 6, y: 0 });
    observer.document.object = observer;
    target.document.object = target;
    global.canvas.walls.placeables = [
      {
        document: {
          id: 'sound-wall',
          c: [180, -100, 180, 100],
          sight: 1,
          sound: 20,
          door: 0,
          ds: 0,
        },
      },
    ];

    const controller = createPendingMovementFinalVisibilityController({
      getPlaceableTokens: () => [observer, target],
      getStoredVisibilityState: (source, candidate) =>
        source?.id === 'observer' && candidate?.id === 'target' ? 'observed' : 'observed',
      hasLineOfSightToSampledToken: () => false,
    });

    const prediction = controller.predictCheapFinalVisibilityStates(observer.document, {
      x: 100,
      y: 0,
    });

    expect(prediction.finalVisibilityStatesByTargetId.get('target')).toBe('undetected');
  });

  test('targets final prediction completion refresh to affected token ids', async () => {
    const entry = {
      serial: 7,
      finalVisibilityStatesByTargetId: new Map(),
      finalVisibilityStatesByObserverId: new Map(),
    };
    const refreshTokenVisibility = jest.fn();
    const controller = createPendingMovementFinalVisibilityController({
      getEntry: (tokenId) => (tokenId === 'observer' ? entry : null),
      getRefreshTargetIds: () => ['target'],
      predictionDelayMs: 0,
      refreshTokenVisibility,
    });

    controller.scheduleFinalVisibilityPrediction(
      'observer',
      7,
      { id: 'observer' },
      { x: 100, y: 0 },
      {
        predictFinalVisibility: () =>
          Promise.resolve({
            finalVisibilityStatesByTargetId: new Map([['target', 'hidden']]),
            finalVisibilityStatesByObserverId: new Map([['other-observer', 'observed']]),
          }),
      },
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.resolve();
    await Promise.resolve();

    expect(refreshTokenVisibility).toHaveBeenCalledWith(['observer'], {
      ignoreObservedGrace: true,
      source: 'final-visibility-prediction',
      targetTokenIds: ['target'],
    });
  });

  test('defers final prediction while movement visual is unsettled', async () => {
    jest.useFakeTimers();
    const entry = {
      serial: 7,
      finalVisibilityStatesByTargetId: new Map(),
      finalVisibilityStatesByObserverId: new Map(),
    };
    let deferPrediction = true;
    const predictFinalVisibility = jest.fn(() =>
      Promise.resolve({
        finalVisibilityStatesByTargetId: new Map([['target', 'hidden']]),
      }),
    );
    const refreshTokenVisibility = jest.fn();
    const controller = createPendingMovementFinalVisibilityController({
      getEntry: (tokenId) => (tokenId === 'observer' ? entry : null),
      getRefreshTargetIds: () => ['target'],
      predictionDelayMs: 10,
      finalPredictionRetryDelayMs: 25,
      shouldDeferFinalVisibilityPrediction: () => deferPrediction,
      refreshTokenVisibility,
    });

    controller.scheduleFinalVisibilityPrediction(
      'observer',
      7,
      { id: 'observer' },
      { x: 100, y: 0 },
      { predictFinalVisibility },
    );

    jest.advanceTimersByTime(10);
    await Promise.resolve();
    expect(predictFinalVisibility).not.toHaveBeenCalled();
    expect(entry.finalVisibilityPredictionPending).toBe(true);

    deferPrediction = false;
    jest.advanceTimersByTime(25);
    for (let i = 0; i < 8; i += 1) {
      await Promise.resolve();
    }

    expect(predictFinalVisibility).toHaveBeenCalledTimes(1);
    expect(entry.finalVisibilityPredictionPending).toBe(false);
    expect(refreshTokenVisibility).toHaveBeenCalledWith(['observer'], {
      ignoreObservedGrace: true,
      source: 'final-visibility-prediction',
      targetTokenIds: ['target'],
    });
  });

  test('batches incremental final prediction refreshes while full prediction continues', async () => {
    jest.useFakeTimers();
    const observer = createMockToken({ id: 'observer' });
    const firstTarget = createMockToken({ id: 'first-target' });
    const secondTarget = createMockToken({ id: 'second-target' });
    const slowTarget = createMockToken({ id: 'slow-target' });
    const entry = {
      serial: 7,
      finalVisibilityStatesByTargetId: new Map(),
      finalVisibilityStatesByObserverId: new Map(),
    };
    let releaseSlow;
    const slowPrediction = new Promise((resolve) => {
      releaseSlow = () => resolve(null);
    });
    const refreshTokenVisibility = jest.fn();
    const controller = createPendingMovementFinalVisibilityController({
      getEntry: (tokenId) => (tokenId === 'observer' ? entry : null),
      getPlaceableTokens: () => [observer, firstTarget, secondTarget, slowTarget],
      getStoredVisibilityState: (_source, target) =>
        target?.id === 'first-target' || target?.id === 'second-target'
          ? 'undetected'
          : 'observed',
      getRefreshTargetIds: () => ['first-target', 'second-target'],
      predictionDelayMs: 0,
      incrementalRefreshDelayMs: 25,
      refreshTokenVisibility,
    });

    controller.scheduleFinalVisibilityPrediction(
      'observer',
      7,
      observer.document,
      { x: 100, y: 0 },
      {
        predictFinalVisibility: true,
        calculateFinalVisibility: (_observerArg, targetArg) => {
          if (targetArg?.id === 'first-target') return Promise.resolve('hidden');
          if (targetArg?.id === 'second-target') return Promise.resolve('hidden');
          if (targetArg?.id === 'slow-target') return slowPrediction;
          return Promise.resolve(null);
        },
      },
    );

    jest.advanceTimersByTime(0);
    for (let i = 0; i < 8; i += 1) {
      await Promise.resolve();
    }
    jest.advanceTimersByTime(25);

    expect(refreshTokenVisibility).toHaveBeenCalledTimes(1);
    expect(refreshTokenVisibility).toHaveBeenCalledWith(['observer'], {
      ignoreObservedGrace: true,
      skipPerceptionRefresh: true,
      source: 'final-visibility-incremental',
      targetTokenIds: ['first-target', 'second-target'],
    });

    releaseSlow();
    await slowPrediction;
  });
});
