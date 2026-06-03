import '../../setup.js';

import { BatchOrchestrator } from '../../../scripts/visibility/auto-visibility/core/BatchOrchestrator.js';
import { PositionManager } from '../../../scripts/visibility/auto-visibility/core/PositionManager.js';
import {
  discardDetectionBatch,
  setDetectionMap,
} from '../../../scripts/stores/detection-map.js';
import {
  clearPendingTokenMovementPosition,
  completePendingTokenMovement,
  setPendingTokenMovementPosition,
} from '../../../scripts/services/PendingMovement/pending-token-movement.js';
import { legacyVisibilityToProfile } from '../../../scripts/visibility/perception-profile.js';

function visibilityV2Flags(map) {
  return {
    'pf2e-visioner': {
      visibilityV2: Object.fromEntries(
        Object.entries(map).map(([targetId, state]) => [
          targetId,
          legacyVisibilityToProfile(state),
        ]),
      ),
    },
  };
}

function emptyBatchResult() {
  return {
    updates: [],
    breakdown: { visGlobalHits: 0, visGlobalMisses: 0, losGlobalHits: 0, losGlobalMisses: 0 },
    processedTokens: 1,
    precomputeStats: { observerUsed: 0, observerMiss: 0, targetUsed: 0, targetMiss: 0 },
  };
}

async function flushPromises(times = 5) {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
}

describe('BatchOrchestrator', () => {
  let orchestrator;
  let batchProcessor;
  let telemetryReporter;
  let exclusionManager;
  let applied;
  let visibilityMapService;
  let positionManager;
  let nowProvider;
  let nowMs;

  beforeEach(() => {
    jest.useRealTimers();
    applied = [];
    batchProcessor = {
      globalVisibilityCache: { clear: jest.fn() },
      globalLosCache: { clear: jest.fn() },
      process: jest.fn(async () => ({
        updates: [
          // duplicate pair should be deduped
          {
            observer: global.canvas.tokens.placeables[0],
            target: global.canvas.tokens.placeables[1],
            visibility: 'hidden',
          },
          {
            observer: global.canvas.tokens.placeables[0],
            target: global.canvas.tokens.placeables[1],
            visibility: 'hidden',
          },
        ],
        breakdown: { visGlobalHits: 0, visGlobalMisses: 1, losGlobalHits: 0, losGlobalMisses: 1 },
        processedTokens: 1,
        precomputeStats: { observerUsed: 0, observerMiss: 1, targetUsed: 0, targetMiss: 1 },
        detailedTimings: {
          cacheBuilding: 1,
          lightingPrecompute: 2,
          mainProcessingLoop: 3,
          spatialFiltering: 4,
          losCalculations: 5,
          visibilityCalculations: 6,
          cacheOperations: 7,
          updateCollection: 8,
        },
      })),
    };
    telemetryReporter = { start: jest.fn(), stop: jest.fn() };
    exclusionManager = { isExcludedToken: jest.fn(() => false) };
    positionManager = {
      getUpdatedTokenDoc: jest.fn(() => null),
    };
    nowMs = 0;
    nowProvider = jest.fn(() => {
      nowMs += 5;
      return nowMs;
    });
    visibilityMapService = {
      setVisibilityBetween: (o, t, v) => applied.push([o?.document?.id, t?.document?.id, v]),
      getVisibilityMap: () => ({}),
      setVisibilityMap: async (token, visMap) => {
        for (const [targetId, state] of Object.entries(visMap)) {
          applied.push([token?.document?.id, targetId, state]);
        }
      },
    };
    orchestrator = new BatchOrchestrator({
      batchProcessor,
      telemetryReporter,
      exclusionManager,
      positionManager,
      visibilityMapService,
      moduleId: 'pf2e-visioner',
      nowProvider,
    });

    // seed tokens
    const t1 = createMockToken({ id: 'A', x: 0, y: 0 });
    const t2 = createMockToken({ id: 'B', x: 100, y: 0 });
    global.canvas.tokens.placeables = [t1, t2];
    global.canvas.tokens.get = jest.fn(
      (id) => global.canvas.tokens.placeables.find((token) => token.document.id === id) ?? null,
    );
    global.canvas.perception = {
      update: jest.fn(async () => { }),
    };
  });

  afterEach(() => {
    jest.useRealTimers();
    clearPendingTokenMovementPosition('A');
    global.canvas.tokens._draggedToken = null;
    global.canvas.walls.placeables = [];
  });

  test('processBatch starts/stop telemetry, applies deduped updates', async () => {
    const changed = new Set(['A']);
    await orchestrator.processBatch(changed);
    expect(telemetryReporter.start).toHaveBeenCalled();
    expect(telemetryReporter.stop).toHaveBeenCalled();
    expect(applied).toEqual([['A', 'B', 'hidden']]);
  });

  test('defers batch processing while pending movement service is active', async () => {
    const [observer] = global.canvas.tokens.placeables;
    const movementRecorded = setPendingTokenMovementPosition(
      observer.document,
      { x: 100, y: 0 },
      [observer],
      { userId: global.game.user.id },
    );
    expect(movementRecorded).toBe(true);

    await orchestrator.processBatch(new Set(['A']));

    expect(batchProcessor.process).not.toHaveBeenCalled();

    completePendingTokenMovement(observer.document.id);
    orchestrator.notifyTokenMovementComplete();
    await flushPromises();

    expect(batchProcessor.process).toHaveBeenCalledTimes(1);
  });

  test('applies hidden to observed update after movement has settled even when current sight helper is blocked', () => {
    const [observer, target] = global.canvas.tokens.placeables;
    global.canvas.walls.placeables = [
      createMockWall({ id: 'wall', c: [75, -100, 75, 100], sight: 1 }),
    ];

    expect(
      orchestrator._resolvePendingMovementVisibilityUpdate(
        { observer, target, visibility: 'observed' },
        'hidden',
      ),
    ).toBe('observed');
  });

  test('preserves hidden during active pending movement when current sight is still blocked', () => {
    const [observer, target] = global.canvas.tokens.placeables;
    global.canvas.walls.placeables = [
      createMockWall({ id: 'wall', c: [75, -100, 75, 100], sight: 1 }),
    ];
    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer]);

    expect(
      orchestrator._resolvePendingMovementVisibilityUpdate(
        { observer, target, visibility: 'observed' },
        'hidden',
      ),
    ).toBe('hidden');
  });

  test('preserves visible state during active pending movement when current sight still sees target', () => {
    const [observer, target] = global.canvas.tokens.placeables;
    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer]);

    expect(
      orchestrator._resolvePendingMovementVisibilityUpdate(
        { observer, target, visibility: 'hidden' },
        'concealed',
      ),
    ).toBe('concealed');
  });

  test('applies hidden during active pending movement once current sight is blocked', () => {
    const [observer, target] = global.canvas.tokens.placeables;
    global.canvas.walls.placeables = [
      createMockWall({ id: 'wall', c: [75, -100, 75, 100], sight: 1 }),
    ];
    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer]);

    expect(
      orchestrator._resolvePendingMovementVisibilityUpdate(
        { observer, target, visibility: 'hidden' },
        'concealed',
      ),
    ).toBe('hidden');
  });

  test('preserves hidden during recent completed movement when stale explicit LOS update says observed', () => {
    const observer = createMockToken({
      id: 'A',
      x: 0,
      y: 0,
      flags: visibilityV2Flags({ B: 'hidden' }),
    });
    const target = createMockToken({ id: 'B', x: 100, y: 0 });
    global.canvas.tokens.placeables = [observer, target];
    global.canvas.tokens.get = jest.fn(
      (id) => global.canvas.tokens.placeables.find((token) => token.document.id === id) ?? null,
    );
    global.canvas.walls.placeables = [
      createMockWall({ id: 'wall', c: [75, -100, 75, 100], sight: 1 }),
    ];
    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer], {
      finalVisibilityStatesByTargetId: { B: 'hidden' },
    });
    completePendingTokenMovement(observer.document.id);

    expect(
      orchestrator._resolvePendingMovementVisibilityUpdate(
        { observer, target, visibility: 'observed', explicitVisiblePair: true },
        'hidden',
      ),
    ).toBe('hidden');
  });

  test('processBatch reports batch timestamps and stage timings', async () => {
    await orchestrator.processBatch(new Set(['A']));

    expect(telemetryReporter.stop).toHaveBeenCalledWith(
      expect.objectContaining({
        batchStartTime: expect.any(Number),
        batchEndTime: expect.any(Number),
        timings: expect.objectContaining({
          tokenPrep: expect.any(Number),
          lightingPrecompute: expect.any(Number),
          calcOptionsPrep: expect.any(Number),
          batchProcessing: expect.any(Number),
          resultApplication: expect.any(Number),
          detailedBatchTimings: expect.objectContaining({
            cacheBuilding: 1,
            lightingPrecompute: 2,
            mainProcessingLoop: 3,
            spatialFiltering: 4,
            losCalculations: 5,
            visibilityCalculations: 6,
            cacheOperations: 7,
            updateCollection: 8,
          }),
        }),
      }),
    );
  });

  test('processBatch preserves global caches for non-movement batches', async () => {
    await orchestrator.processBatch(new Set(['A']));

    expect(batchProcessor.globalVisibilityCache.clear).not.toHaveBeenCalled();
    expect(batchProcessor.globalLosCache.clear).not.toHaveBeenCalled();
  });

  test('processBatch clears global caches for movement batches', async () => {
    await orchestrator.processBatch(new Set(['A']), { movementSession: { sessionId: 'move-1' } });

    expect(batchProcessor.globalVisibilityCache.clear).toHaveBeenCalledTimes(1);
    expect(batchProcessor.globalLosCache.clear).toHaveBeenCalledTimes(1);
  });

  test('processBatch uses latest duplicate visibility update for same observer-target pair', async () => {
    batchProcessor.process.mockResolvedValueOnce({
      updates: [
        {
          observer: global.canvas.tokens.placeables[0],
          target: global.canvas.tokens.placeables[1],
          visibility: 'undetected',
        },
        {
          observer: global.canvas.tokens.placeables[0],
          target: global.canvas.tokens.placeables[1],
          visibility: 'observed',
        },
      ],
      breakdown: { visGlobalHits: 0, visGlobalMisses: 1, losGlobalHits: 0, losGlobalMisses: 1 },
      processedTokens: 1,
      precomputeStats: { observerUsed: 0, observerMiss: 1, targetUsed: 0, targetMiss: 1 },
    });
    visibilityMapService.getVisibilityMap = jest.fn(() => ({ B: 'undetected' }));
    visibilityMapService.setVisibilityMap = jest.fn(async () => { });

    await orchestrator.processBatch(new Set(['A']));

    expect(visibilityMapService.setVisibilityMap).toHaveBeenCalledWith(
      global.canvas.tokens.placeables[0],
      { B: 'observed' },
    );
  });

  test('fresh current calculation vetoes stale hidden to observed batch update', async () => {
    const [observer, target] = global.canvas.tokens.placeables;
    batchProcessor.process.mockResolvedValueOnce({
      updates: [
        {
          observer,
          target,
          visibility: 'observed',
          explicitVisiblePair: true,
          isMovementBatch: true,
        },
      ],
      breakdown: { visGlobalHits: 0, visGlobalMisses: 1, losGlobalHits: 0, losGlobalMisses: 1 },
      processedTokens: 1,
      precomputeStats: { observerUsed: 0, observerMiss: 1, targetUsed: 0, targetMiss: 1 },
    });
    const calculateVisibility = jest.fn(async () => 'hidden');
    orchestrator.optimizedVisibilityCalculator = { calculateVisibility };
    visibilityMapService.getVisibilityMap = jest.fn(() => ({ B: 'hidden' }));
    visibilityMapService.setVisibilityMap = jest.fn(async () => { });

    await orchestrator.processBatch(new Set(['A']), { movementSession: { sessionId: 'move-1' } });

    expect(calculateVisibility).toHaveBeenCalledWith(
      observer,
      target,
      expect.objectContaining({
        isMovementBatch: true,
        skipCache: true,
        skipPrecomputedLOS: true,
      }),
    );
    expect(visibilityMapService.setVisibilityMap).not.toHaveBeenCalled();
  });

  test('isProcessing flag prevents reentrancy and resets after', async () => {
    const changed = new Set(['A']);
    const p = orchestrator.processBatch(changed);
    expect(orchestrator.isProcessing()).toBe(true);
    await p;
    expect(orchestrator.isProcessing()).toBe(false);
  });

  test('processBatch drops stale results when movement starts while batch is running', async () => {
    jest.useFakeTimers();
    orchestrator._syncEphemeralEffectsForUpdates = jest.fn(async () => { });
    orchestrator._precomputeLighting = jest.fn(async () => ({
      precomputedLights: null,
      precomputeStats: { observerUsed: 0, observerMiss: 0, targetUsed: 0, targetMiss: 0 },
    }));

    let resolveFirstBatch;
    batchProcessor.process
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirstBatch = resolve;
          }),
      )
      .mockResolvedValueOnce({
        updates: [
          {
            observer: global.canvas.tokens.placeables[0],
            target: global.canvas.tokens.placeables[1],
            visibility: 'concealed',
          },
        ],
        breakdown: { visGlobalHits: 0, visGlobalMisses: 1, losGlobalHits: 0, losGlobalMisses: 1 },
        processedTokens: 1,
        precomputeStats: { observerUsed: 0, observerMiss: 1, targetUsed: 0, targetMiss: 1 },
      });

    const firstBatch = orchestrator.processBatch(new Set(['A']));
    await flushPromises();

    expect(batchProcessor.process).toHaveBeenCalledTimes(1);

    orchestrator.notifyTokenMovementStart();
    resolveFirstBatch({
      updates: [
        {
          observer: global.canvas.tokens.placeables[0],
          target: global.canvas.tokens.placeables[1],
          visibility: 'hidden',
        },
      ],
      breakdown: { visGlobalHits: 0, visGlobalMisses: 1, losGlobalHits: 0, losGlobalMisses: 1 },
      processedTokens: 1,
      precomputeStats: { observerUsed: 0, observerMiss: 1, targetUsed: 0, targetMiss: 1 },
    });

    await firstBatch;

    expect(applied).toEqual([]);
    expect(global.canvas.perception.update).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(250);
    await Promise.resolve();

    expect(batchProcessor.process).toHaveBeenCalledTimes(2);
    expect(applied).toEqual([['A', 'B', 'concealed']]);
  });

  test('movement stop keeps pending movement tokens when an older batch is still running', async () => {
    jest.useFakeTimers();
    orchestrator._syncEphemeralEffectsForUpdates = jest.fn(async () => { });
    orchestrator._precomputeLighting = jest.fn(async () => ({
      precomputedLights: null,
      precomputeStats: { observerUsed: 0, observerMiss: 0, targetUsed: 0, targetMiss: 0 },
    }));

    let resolveFirstBatch;
    batchProcessor.process
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirstBatch = resolve;
          }),
      )
      .mockResolvedValueOnce({
        updates: [],
        breakdown: { visGlobalHits: 0, visGlobalMisses: 0, losGlobalHits: 0, losGlobalMisses: 0 },
        processedTokens: 1,
        precomputeStats: { observerUsed: 0, observerMiss: 0, targetUsed: 0, targetMiss: 0 },
      });

    const firstBatch = orchestrator.processBatch(new Set(['A']));
    await Promise.resolve();
    await Promise.resolve();

    orchestrator.notifyTokenMovementStart();
    orchestrator.enqueueTokens(new Set(['B']));

    await jest.advanceTimersByTimeAsync(250);

    expect(batchProcessor.process).toHaveBeenCalledTimes(1);

    resolveFirstBatch({
      updates: [],
      breakdown: { visGlobalHits: 0, visGlobalMisses: 0, losGlobalHits: 0, losGlobalMisses: 0 },
      processedTokens: 1,
      precomputeStats: { observerUsed: 0, observerMiss: 0, targetUsed: 0, targetMiss: 0 },
    });
    await firstBatch;
    await jest.advanceTimersByTimeAsync(0);
    await Promise.resolve();

    expect(batchProcessor.process).toHaveBeenCalledTimes(2);
    expect(Array.from(batchProcessor.process.mock.calls[1][1])).toEqual(['B', 'A']);
    expect(batchProcessor.process.mock.calls[1][2]).toEqual(
      expect.objectContaining({ skipPrecomputedLOS: true, skipViewportFilter: true }),
    );
  });

  test('movement complete drains pending movement tokens without waiting for stop timer', async () => {
    jest.useFakeTimers();
    orchestrator._syncEphemeralEffectsForUpdates = jest.fn(async () => { });
    orchestrator._precomputeLighting = jest.fn(async () => ({
      precomputedLights: null,
      precomputeStats: { observerUsed: 0, observerMiss: 0, targetUsed: 0, targetMiss: 0 },
    }));
    batchProcessor.process.mockResolvedValue(emptyBatchResult());

    orchestrator.notifyTokenMovementStart();
    orchestrator.enqueueTokens(new Set(['A']));
    orchestrator.notifyTokenMovementComplete();

    await flushPromises();

    expect(batchProcessor.process).toHaveBeenCalledTimes(1);
    expect(batchProcessor.process.mock.calls[0][2]).toEqual(
      expect.objectContaining({ skipPrecomputedLOS: true, skipViewportFilter: true }),
    );

    await jest.advanceTimersByTimeAsync(250);
    await flushPromises();

    expect(batchProcessor.process).toHaveBeenCalledTimes(1);
  });

  test('movement start recreates missing session when moving flag survived cleanup', async () => {
    jest.useFakeTimers();
    const consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => { });
    orchestrator._syncEphemeralEffectsForUpdates = jest.fn(async () => { });
    orchestrator._precomputeLighting = jest.fn(async () => ({
      precomputedLights: null,
      precomputeStats: { observerUsed: 0, observerMiss: 0, targetUsed: 0, targetMiss: 0 },
    }));
    orchestrator._isTokenMoving = true;
    orchestrator._movementSession = null;

    try {
      orchestrator.enqueueTokens(new Set(['A']));
      orchestrator.notifyTokenMovementStart();

      expect(orchestrator._movementSession).toEqual(
        expect.objectContaining({
          positionUpdates: 1,
          tokensAccumulated: expect.any(Set),
          sessionId: expect.stringContaining('movement-'),
        }),
      );

      await jest.advanceTimersByTimeAsync(250);
      await Promise.resolve();

      expect(consoleWarn).not.toHaveBeenCalled();
      expect(batchProcessor.process).toHaveBeenCalledTimes(1);
    } finally {
      consoleWarn.mockRestore();
    }
  });

  test('tracks suppressed lighting refreshes during active movement', () => {
    orchestrator.notifyTokenMovementStart();

    expect(orchestrator.recordMovementLightingRefreshSuppressed()).toBe(true);
    expect(orchestrator.recordMovementLightingRefreshSuppressed()).toBe(true);

    expect(orchestrator.getMovementPerformanceSnapshot()).toEqual(
      expect.objectContaining({
        active: true,
        currentSession: expect.objectContaining({
          suppressedLightingRefreshes: 2,
        }),
        totals: expect.objectContaining({
          suppressedLightingRefreshes: 2,
        }),
      }),
    );
  });

  test('movement stop waits while remembered moving token render position is unsettled', async () => {
    jest.useFakeTimers();
    orchestrator._syncEphemeralEffectsForUpdates = jest.fn(async () => { });
    orchestrator._precomputeLighting = jest.fn(async () => ({
      precomputedLights: null,
      precomputeStats: { observerUsed: 0, observerMiss: 0, targetUsed: 0, targetMiss: 0 },
    }));
    batchProcessor.process.mockResolvedValue(emptyBatchResult());

    const mover = global.canvas.tokens.placeables[0];
    mover.x = 0;
    mover.y = 0;
    mover.document.x = 100;
    mover.document.y = 0;

    orchestrator.notifyTokenMovementStart('A');
    orchestrator.enqueueTokens(new Set(['A']));

    await jest.advanceTimersByTimeAsync(250);
    await flushPromises();

    expect(batchProcessor.process).not.toHaveBeenCalled();
    expect(orchestrator._isTokenMoving).toBe(true);

    mover.x = 100;
    mover.y = 0;

    await jest.advanceTimersByTimeAsync(250);
    await flushPromises();

    expect(batchProcessor.process).toHaveBeenCalledTimes(1);
  });

  test('movement stop drains pending tokens without warning when session disappeared', async () => {
    jest.useFakeTimers();
    const consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => { });
    orchestrator._syncEphemeralEffectsForUpdates = jest.fn(async () => { });
    orchestrator._precomputeLighting = jest.fn(async () => ({
      precomputedLights: null,
      precomputeStats: { observerUsed: 0, observerMiss: 0, targetUsed: 0, targetMiss: 0 },
    }));

    try {
      orchestrator.notifyTokenMovementStart();
      orchestrator.enqueueTokens(new Set(['A']));
      orchestrator._movementSession = null;

      await jest.advanceTimersByTimeAsync(250);
      await Promise.resolve();

      expect(consoleWarn).not.toHaveBeenCalled();
      expect(batchProcessor.process).toHaveBeenCalledTimes(1);
      expect(batchProcessor.process.mock.calls[0][2]).toEqual(
        expect.objectContaining({ skipPrecomputedLOS: true, skipViewportFilter: true }),
      );
    } finally {
      consoleWarn.mockRestore();
    }
  });

  test('enqueue during a scheduled follow-up batch stays pending for the next follow-up', async () => {
    jest.useFakeTimers();
    global.canvas.tokens.placeables.push(createMockToken({ id: 'C', x: 200, y: 0 }));
    orchestrator._syncEphemeralEffectsForUpdates = jest.fn(async () => { });
    orchestrator._precomputeLighting = jest.fn(async () => ({
      precomputedLights: null,
      precomputeStats: { observerUsed: 0, observerMiss: 0, targetUsed: 0, targetMiss: 0 },
    }));

    let resolveFirstBatch;
    let resolveFollowUpBatch;
    batchProcessor.process
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirstBatch = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFollowUpBatch = resolve;
          }),
      )
      .mockResolvedValueOnce(emptyBatchResult());

    const firstBatch = orchestrator.processBatch(new Set(['A']));
    await Promise.resolve();
    await Promise.resolve();

    orchestrator.enqueueTokens(new Set(['B']));

    resolveFirstBatch(emptyBatchResult());
    await firstBatch;

    orchestrator.enqueueTokens(new Set(['C']));
    await jest.advanceTimersByTimeAsync(0);
    await flushPromises();

    expect(batchProcessor.process).toHaveBeenCalledTimes(2);
    expect(Array.from(batchProcessor.process.mock.calls[1][1])).toEqual(['B']);
    expect(Array.from(orchestrator._pendingTokens)).toEqual(['C']);

    resolveFollowUpBatch(emptyBatchResult());
    await flushPromises();
    await jest.advanceTimersByTimeAsync(0);
    await flushPromises();
    await jest.advanceTimersByTimeAsync(0);
    await flushPromises();

    expect(batchProcessor.process).toHaveBeenCalledTimes(3);
    expect(Array.from(batchProcessor.process.mock.calls[2][1])).toEqual(['C']);
  });

  test('direct processBatch call during an active batch is queued for a follow-up batch', async () => {
    jest.useFakeTimers();
    global.canvas.tokens.placeables.push(createMockToken({ id: 'C', x: 200, y: 0 }));
    orchestrator._syncEphemeralEffectsForUpdates = jest.fn(async () => { });
    orchestrator._precomputeLighting = jest.fn(async () => ({
      precomputedLights: null,
      precomputeStats: { observerUsed: 0, observerMiss: 0, targetUsed: 0, targetMiss: 0 },
    }));

    let resolveFirstBatch;
    batchProcessor.process
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirstBatch = resolve;
          }),
      )
      .mockResolvedValueOnce(emptyBatchResult());

    const firstBatch = orchestrator.processBatch(new Set(['A']));
    await flushPromises();

    await orchestrator.processBatch(new Set(['C']));

    expect(batchProcessor.process).toHaveBeenCalledTimes(1);

    resolveFirstBatch(emptyBatchResult());
    await firstBatch;
    await flushPromises();
    await jest.advanceTimersByTimeAsync(0);
    await flushPromises();

    expect(batchProcessor.process).toHaveBeenCalledTimes(2);
    expect(Array.from(batchProcessor.process.mock.calls[1][1])).toEqual(['C']);
  });

  test('_applyBatchResults awaits visibility map persistence', async () => {
    const deferred = {};
    visibilityMapService.setVisibilityMap = jest.fn(
      () =>
        new Promise((resolve) => {
          deferred.resolve = resolve;
        }),
    );

    const applyPromise = orchestrator._applyBatchResults({
      updates: [
        {
          observer: global.canvas.tokens.placeables[0],
          target: global.canvas.tokens.placeables[1],
          visibility: 'hidden',
        },
      ],
    });

    await Promise.resolve();

    expect(visibilityMapService.setVisibilityMap).toHaveBeenCalledTimes(1);

    let settled = false;
    applyPromise.then(() => {
      settled = true;
    });

    await Promise.resolve();
    expect(settled).toBe(false);

    deferred.resolve();
    await applyPromise;

    expect(settled).toBe(true);
  });

  test('_applyBatchResults leaves render-lock side effects to post-result workflow', async () => {
    const observer = global.canvas.tokens.placeables[0];
    const target = global.canvas.tokens.placeables[1];
    global.canvas.tokens.controlled = [observer];
    target.renderable = true;

    await orchestrator._applyBatchResults({
      updates: [
        {
          observer,
          target,
          visibility: 'undetected',
        },
      ],
    });

    expect(target.renderable).toBe(true);
    expect(target.visible).toBe(true);
  });

  test('_applyBatchResults skips dragged preview token updates before movement commit', async () => {
    const observer = global.canvas.tokens.placeables[0];
    const target = global.canvas.tokens.placeables[1];
    global.canvas.tokens._draggedToken = observer;
    visibilityMapService.setVisibilityMap = jest.fn(async () => { });

    const batchResult = {
      updates: [{ observer, target, visibility: 'hidden' }],
    };
    const count = await orchestrator._applyBatchResults(batchResult);

    expect(count).toBe(0);
    expect(batchResult.appliedUpdates).toEqual([]);
    expect(visibilityMapService.setVisibilityMap).not.toHaveBeenCalled();
  });

  test('_applyBatchResults records door detection sync without map write', async () => {
    global.game.pf2eVisioner = {};
    visibilityMapService.setVisibilityMap = jest.fn(async () => { });

    const count = await orchestrator._applyBatchResults(
      {
        updates: [
          {
            observer: global.canvas.tokens.placeables[0],
            target: global.canvas.tokens.placeables[1],
            visibility: 'observed',
            forceDetectionSyncOnly: true,
            explicitVisiblePair: true,
          },
        ],
      },
      { suppressVisibilityMapRender: true },
    );

    expect(count).toBe(1);
    expect(visibilityMapService.setVisibilityMap).not.toHaveBeenCalled();
    expect([...global.game.pf2eVisioner.explicitlyVisiblePairs]).toEqual(
      expect.arrayContaining([expect.stringContaining('A->B')]),
    );
  });

  test('_applyBatchResults holds hidden during pending movement when current sight is blocked', async () => {
    global.game.pf2eVisioner = {};
    const observer = createMockToken({ id: 'A', x: 0, y: 0 });
    const target = createMockToken({ id: 'B', x: 3, y: 0 });
    global.canvas.tokens.placeables = [observer, target];
    global.canvas.tokens.controlled = [observer];
    global.canvas.walls.placeables = [
      createMockWall({ id: 'sight-wall', c: [100, 0, 100, 100], sight: 1, sound: 0 }),
    ];
    visibilityMapService.getVisibilityMap = jest.fn(() => ({ B: 'hidden' }));
    visibilityMapService.setVisibilityMap = jest.fn(async () => { });

    expect(setPendingTokenMovementPosition(observer.document, { x: 1, y: 0 }, [observer])).toBe(
      true,
    );

    const count = await orchestrator._applyBatchResults({
      updates: [{ observer, target, visibility: 'observed' }],
    });

    expect(count).toBe(0);
    expect(visibilityMapService.setVisibilityMap).not.toHaveBeenCalled();
  });

  test('_applyBatchResults applies observed after movement work clears even when stale current sight is blocked', async () => {
    global.game.pf2eVisioner = {};
    const observer = createMockToken({ id: 'A', x: 0, y: 0 });
    const target = createMockToken({ id: 'B', x: 3, y: 0 });
    global.canvas.tokens.placeables = [observer, target];
    global.canvas.tokens.controlled = [observer];
    global.canvas.walls.placeables = [
      createMockWall({ id: 'sight-wall', c: [100, 0, 100, 100], sight: 1, sound: 0 }),
    ];
    visibilityMapService.getVisibilityMap = jest.fn(() => ({ B: 'hidden' }));
    visibilityMapService.setVisibilityMap = jest.fn(async () => { });

    const count = await orchestrator._applyBatchResults({
      updates: [{ observer, target, visibility: 'observed' }],
    });

    expect(count).toBe(1);
    expect(visibilityMapService.setVisibilityMap).toHaveBeenCalledWith(observer, { B: 'observed' });
  });

  test('_applyBatchResults skips stale movement observed update from prior square', async () => {
    global.game.pf2eVisioner = {};
    const observer = createMockToken({ id: 'A', x: 200, y: 0 });
    const target = createMockToken({ id: 'B', x: 600, y: 0 });
    global.canvas.tokens.placeables = [observer, target];
    visibilityMapService.getVisibilityMap = jest.fn(() => ({ B: 'hidden' }));
    visibilityMapService.setVisibilityMap = jest.fn(async () => { });
    positionManager.getTokenPosition = jest.fn((token) => ({
      x: token.document.x + 100,
      y: token.document.y + 100,
      elevation: token.document.elevation || 0,
    }));

    const count = await orchestrator._applyBatchResults({
      updates: [
        {
          observer,
          target,
          visibility: 'observed',
          explicitVisiblePair: true,
          isMovementBatch: true,
          observerPosition: { x: 100, y: 100, elevation: 0 },
          targetPosition: { x: 700, y: 100, elevation: 0 },
        },
      ],
    });

    expect(count).toBe(0);
    expect(visibilityMapService.setVisibilityMap).not.toHaveBeenCalled();
  });

  test('_applyBatchResults applies observed during pending movement when current sight sees target', async () => {
    global.game.pf2eVisioner = {};
    const observer = createMockToken({ id: 'A', x: 0, y: 0 });
    const target = createMockToken({ id: 'B', x: 1, y: 0 });
    global.canvas.tokens.placeables = [observer, target];
    global.canvas.tokens.controlled = [observer];
    visibilityMapService.getVisibilityMap = jest.fn(() => ({ B: 'hidden' }));
    visibilityMapService.setVisibilityMap = jest.fn(async () => { });

    expect(setPendingTokenMovementPosition(observer.document, { x: 1, y: 0 }, [observer])).toBe(
      true,
    );

    const count = await orchestrator._applyBatchResults({
      updates: [{ observer, target, visibility: 'observed' }],
    });

    expect(count).toBe(1);
    expect(visibilityMapService.setVisibilityMap).toHaveBeenCalledWith(observer, { B: 'observed' });
  });

  test('_applyBatchResults keeps visible state while pending movement current sight still sees target', async () => {
    global.game.pf2eVisioner = {};
    const observer = createMockToken({ id: 'A', x: 0, y: 0 });
    const target = createMockToken({ id: 'B', x: 100, y: 0 });
    global.canvas.tokens.placeables = [observer, target];
    global.canvas.tokens.controlled = [observer];
    visibilityMapService.getVisibilityMap = jest.fn(() => ({ B: 'concealed' }));
    visibilityMapService.setVisibilityMap = jest.fn(async () => { });

    expect(setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer])).toBe(
      true,
    );

    const batchResult = {
      updates: [{ observer, target, visibility: 'hidden' }],
    };
    const count = await orchestrator._applyBatchResults(batchResult);

    expect(count).toBe(1);
    expect(batchResult.appliedUpdates).toEqual([
      expect.objectContaining({ observer, target, visibility: 'concealed' }),
    ]);
    expect(visibilityMapService.setVisibilityMap).toHaveBeenCalledWith(observer, {
      B: 'concealed',
    });
  });

  test('_applyBatchResults applies hidden when pending movement current sight is blocked', async () => {
    global.game.pf2eVisioner = {};
    const observer = createMockToken({ id: 'A', x: 0, y: 0 });
    const target = createMockToken({ id: 'B', x: 3, y: 0 });
    global.canvas.tokens.placeables = [observer, target];
    global.canvas.tokens.controlled = [observer];
    global.canvas.walls.placeables = [
      createMockWall({ id: 'sight-wall', c: [100, 0, 100, 100], sight: 1, sound: 0 }),
    ];
    visibilityMapService.getVisibilityMap = jest.fn(() => ({ B: 'concealed' }));
    visibilityMapService.setVisibilityMap = jest.fn(async () => { });

    expect(setPendingTokenMovementPosition(observer.document, { x: 1, y: 0 }, [observer])).toBe(
      true,
    );

    const count = await orchestrator._applyBatchResults({
      updates: [{ observer, target, visibility: 'hidden' }],
    });

    expect(count).toBe(1);
    expect(visibilityMapService.setVisibilityMap).toHaveBeenCalledWith(observer, { B: 'hidden' });
  });

  test('processBatch refreshes perception after ephemeral effect sync', async () => {
    const order = [];
    orchestrator._syncEphemeralEffectsForUpdates = jest.fn(async () => {
      order.push('effects');
    });
    global.canvas.perception.update.mockImplementation(async (options = {}) => {
      if (options.refreshOcclusion) order.push('post-perception');
    });

    await orchestrator.processBatch(new Set(['A']));

    expect(order).toEqual(['effects', 'post-perception']);
  });

  test('defers non-movement post-batch perception refresh while pending movement is active', async () => {
    const [observer] = global.canvas.tokens.placeables;
    orchestrator._performPostBatchPerceptionRefresh = jest.fn(async () => {});

    expect(
      setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer], {
        userId: global.game.user.id,
      }),
    ).toBe(true);

    await orchestrator._refreshPerceptionAfterBatch({ isMovementBatch: false });

    expect(orchestrator._performPostBatchPerceptionRefresh).not.toHaveBeenCalled();
    expect(orchestrator._pendingPostMovementPerceptionRefresh).toBe(true);

    completePendingTokenMovement(observer.document.id);
    const flushed = orchestrator._flushDeferredPostMovementPerceptionRefresh();

    expect(flushed).toBe(true);
    expect(orchestrator._performPostBatchPerceptionRefresh).toHaveBeenCalledTimes(1);
    expect(orchestrator._pendingPostMovementPerceptionRefresh).toBe(false);
  });

  test('processBatch does not refresh perception when no visibility updates are applied', async () => {
    batchProcessor.process.mockResolvedValueOnce({
      updates: [],
      breakdown: { visGlobalHits: 0, visGlobalMisses: 0, losGlobalHits: 0, losGlobalMisses: 0 },
      processedTokens: 1,
      precomputeStats: { observerUsed: 0, observerMiss: 0, targetUsed: 0, targetMiss: 0 },
    });

    await orchestrator.processBatch(new Set(['A']));

    expect(global.canvas.perception.update).not.toHaveBeenCalled();
  });

  test('processBatch closes detection batch mode when result application fails', async () => {
    const observer = createMockToken({ id: 'detection-observer' });
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => { });
    orchestrator._precomputeLighting = jest.fn(async () => ({
      precomputedLights: null,
      precomputeStats: { observerUsed: 0, observerMiss: 0, targetUsed: 0, targetMiss: 0 },
    }));
    orchestrator._applyBatchResults = jest.fn(async () => {
      throw new Error('apply failed');
    });

    try {
      await orchestrator.processBatch(new Set(['A']));

      await setDetectionMap(observer, {
        target: { sense: 'hearing', isPrecise: false },
      });

      expect(observer.document.update).toHaveBeenCalledWith(
        {
          'flags.pf2e-visioner.detection': {
            target: { sense: 'hearing', isPrecise: false },
          },
        },
        { render: false, animate: false },
      );
    } finally {
      discardDetectionBatch();
      consoleError.mockRestore();
    }
  });

  test('processBatch skips when viewport filtering excludes all changed tokens', async () => {
    orchestrator.viewportFilterService = {
      isClientAwareFilteringEnabled: jest.fn(() => true),
      getViewportTokenIdSet: jest.fn(() => new Set()),
    };

    await orchestrator.processBatch(new Set(['A']));

    expect(batchProcessor.process).not.toHaveBeenCalled();
    expect(global.canvas.perception.update).not.toHaveBeenCalled();
  });

  test('processBatch ignores stale lastMovedTokenId for non-movement batches', async () => {
    global.game.pf2eVisioner = { lastMovedTokenId: 'stale-token' };
    orchestrator.viewportFilterService = {
      isClientAwareFilteringEnabled: jest.fn(() => true),
      getViewportTokenIdSet: jest.fn(() => new Set(['B'])),
    };

    await orchestrator.processBatch(new Set(['A']));

    expect(batchProcessor.process).not.toHaveBeenCalled();
    expect(global.canvas.perception.update).not.toHaveBeenCalled();
  });

  test('processBatch ignores matching lastMovedTokenId without active movement session', async () => {
    global.game.pf2eVisioner = { lastMovedTokenId: 'A' };
    orchestrator.viewportFilterService = {
      isClientAwareFilteringEnabled: jest.fn(() => true),
      getViewportTokenIdSet: jest.fn(() => new Set(['B'])),
    };

    await orchestrator.processBatch(new Set(['A']));

    expect(batchProcessor.process).not.toHaveBeenCalled();
    expect(global.canvas.perception.update).not.toHaveBeenCalled();
  });

  test('processBatch defers while changed token is still animating', async () => {
    jest.useFakeTimers();

    let resolveAnimation;
    const animationPromise = new Promise((resolve) => {
      resolveAnimation = resolve;
    });

    global.canvas.tokens.placeables[0]._animation = {
      state: 'running',
      promise: animationPromise,
    };

    const changed = new Set(['A']);
    const firstPass = orchestrator.processBatch(changed);
    await firstPass;

    expect(batchProcessor.process).not.toHaveBeenCalled();
    expect(global.canvas.perception.update).not.toHaveBeenCalled();
    expect(orchestrator._isTokenMoving).toBe(true);

    global.canvas.tokens.placeables[0]._animation.state = 'completed';
    resolveAnimation();
    await animationPromise;

    await jest.advanceTimersByTimeAsync(250);

    expect(batchProcessor.process).toHaveBeenCalledTimes(1);
  });

  test('processBatch defers while changed token render position is still desynced from document position', async () => {
    jest.useFakeTimers();

    global.canvas.tokens.placeables[0]._animation = null;
    global.canvas.tokens.placeables[0]._dragHandle = null;
    global.canvas.tokens.placeables[0].x = 2200;
    global.canvas.tokens.placeables[0].y = 2400;
    global.canvas.tokens.placeables[0].document.x = 2000;
    global.canvas.tokens.placeables[0].document.y = 4200;

    const changed = new Set(['A']);
    await orchestrator.processBatch(changed);

    expect(batchProcessor.process).not.toHaveBeenCalled();
    expect(global.canvas.perception.update).not.toHaveBeenCalled();
    expect(orchestrator._isTokenMoving).toBe(true);

    global.canvas.tokens.placeables[0].x = 2000;
    global.canvas.tokens.placeables[0].y = 4200;

    await jest.advanceTimersByTimeAsync(250);

    expect(batchProcessor.process).toHaveBeenCalledTimes(1);
  });

  test('processBatch defers while changed token has a pending destination differing from current position', async () => {
    jest.useFakeTimers();

    global.canvas.tokens.placeables[0]._animation = null;
    global.canvas.tokens.placeables[0]._dragHandle = null;
    global.canvas.tokens.placeables[0].x = 2000;
    global.canvas.tokens.placeables[0].y = 4200;
    global.canvas.tokens.placeables[0].document.x = 2000;
    global.canvas.tokens.placeables[0].document.y = 4200;

    positionManager.getUpdatedTokenDoc.mockImplementation((id) => {
      if (id !== 'A') return null;
      return {
        id: 'A',
        x: 2000,
        y: 2200,
        width: 1,
        height: 1,
      };
    });

    const changed = new Set(['A']);
    await orchestrator.processBatch(changed);

    expect(batchProcessor.process).not.toHaveBeenCalled();
    expect(global.canvas.perception.update).not.toHaveBeenCalled();
    expect(orchestrator._isTokenMoving).toBe(true);

    global.canvas.tokens.placeables[0].x = 2000;
    global.canvas.tokens.placeables[0].y = 2200;
    global.canvas.tokens.placeables[0].document.x = 2000;
    global.canvas.tokens.placeables[0].document.y = 2200;
    positionManager.getUpdatedTokenDoc.mockReturnValue({
      id: 'A',
      x: 2000,
      y: 2200,
      width: 1,
      height: 1,
    });

    await jest.advanceTimersByTimeAsync(250);

    expect(batchProcessor.process).toHaveBeenCalledTimes(1);
  });

  test('processBatch defers with a real PositionManager storing a pending destination', async () => {
    jest.useFakeTimers();

    const realPositionManager = new PositionManager({ debug: jest.fn() });
    orchestrator.positionManager = realPositionManager;

    global.canvas.tokens.placeables[0]._animation = null;
    global.canvas.tokens.placeables[0]._dragHandle = null;
    global.canvas.tokens.placeables[0].x = 2000;
    global.canvas.tokens.placeables[0].y = 2200;
    global.canvas.tokens.placeables[0].document.x = 2000;
    global.canvas.tokens.placeables[0].document.y = 2200;

    realPositionManager.storeUpdatedTokenDoc('A', {
      id: 'A',
      x: 2000,
      y: 4600,
      width: 1,
      height: 1,
    });

    const changed = new Set(['A']);
    await orchestrator.processBatch(changed);

    expect(batchProcessor.process).not.toHaveBeenCalled();
    expect(global.canvas.perception.update).not.toHaveBeenCalled();
    expect(orchestrator._isTokenMoving).toBe(true);

    global.canvas.tokens.placeables[0].x = 2000;
    global.canvas.tokens.placeables[0].y = 4600;
    global.canvas.tokens.placeables[0].document.x = 2000;
    global.canvas.tokens.placeables[0].document.y = 4600;

    await jest.advanceTimersByTimeAsync(250);

    expect(batchProcessor.process).toHaveBeenCalledTimes(1);
  });
});
