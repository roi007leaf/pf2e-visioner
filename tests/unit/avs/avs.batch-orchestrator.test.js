import '../../setup.js';

import { BatchOrchestrator } from '../../../scripts/visibility/auto-visibility/core/BatchOrchestrator.js';
import { PositionManager } from '../../../scripts/visibility/auto-visibility/core/PositionManager.js';

describe('BatchOrchestrator', () => {
  let orchestrator;
  let batchProcessor;
  let telemetryReporter;
  let exclusionManager;
  let applied;
  let visibilityMapService;
  let positionManager;

  beforeEach(() => {
    jest.useRealTimers();
    applied = [];
    batchProcessor = {
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
      })),
    };
    telemetryReporter = { start: jest.fn(), stop: jest.fn() };
    exclusionManager = { isExcludedToken: jest.fn(() => false) };
    positionManager = {
      getUpdatedTokenDoc: jest.fn(() => null),
    };
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
    });

    // seed tokens
    const t1 = createMockToken({ id: 'A', x: 0, y: 0 });
    const t2 = createMockToken({ id: 'B', x: 100, y: 0 });
    global.canvas.tokens.placeables = [t1, t2];
    global.canvas.tokens.get = jest.fn(
      (id) => global.canvas.tokens.placeables.find((token) => token.document.id === id) ?? null,
    );
    global.canvas.perception = {
      update: jest.fn(async () => {}),
    };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('processBatch starts/stop telemetry, applies deduped updates', async () => {
    const changed = new Set(['A']);
    await orchestrator.processBatch(changed);
    expect(telemetryReporter.start).toHaveBeenCalled();
    expect(telemetryReporter.stop).toHaveBeenCalled();
    expect(applied).toEqual([['A', 'B', 'hidden']]);
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
    visibilityMapService.setVisibilityMap = jest.fn(async () => {});

    await orchestrator.processBatch(new Set(['A']));

    expect(visibilityMapService.setVisibilityMap).toHaveBeenCalledWith(
      global.canvas.tokens.placeables[0],
      { B: 'observed' },
    );
  });

  test('isProcessing flag prevents reentrancy and resets after', async () => {
    const changed = new Set(['A']);
    const p = orchestrator.processBatch(changed);
    expect(orchestrator.isProcessing()).toBe(true);
    await p;
    expect(orchestrator.isProcessing()).toBe(false);
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
    expect(global.canvas.perception.update).toHaveBeenCalled();
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
    expect(global.canvas.perception.update).toHaveBeenCalled();
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
    expect(global.canvas.perception.update).toHaveBeenCalled();
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
    expect(global.canvas.perception.update).toHaveBeenCalled();
  });
});
