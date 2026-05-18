import { BatchPostResultWorkflow } from '../../../scripts/visibility/auto-visibility/core/BatchPostResultWorkflow.js';

function update(visibility, targetId = visibility) {
  return {
    observer: { document: { id: 'observer' } },
    target: { document: { id: targetId } },
    visibility,
  };
}

function createWorkflow(overrides = {}) {
  const order = [];
  const workflow = new BatchPostResultWorkflow({
    applyBatchResults: jest.fn(async (_batchResult, options) => {
      order.push(`apply:${options.suppressVisibilityMapRender}`);
      return 2;
    }),
    flushDetectionBatch: jest.fn(async () => {
      order.push('flush');
    }),
    syncEphemeralEffectsForUpdates: jest.fn(async (updates) => {
      order.push(`effects:${updates.length}`);
    }),
    refreshPerceptionAfterBatch: jest.fn(async () => {
      order.push('refresh');
    }),
    setSuppressLightingRefreshAfterBatch: jest.fn((value) => {
      order.push(`suppress:${value}`);
    }),
    clearSuppressLightingRefreshAfterBatch: jest.fn(() => {
      order.push('clear-suppress');
    }),
    scheduleTask: jest.fn((task) => {
      order.push('schedule-clear');
      task();
    }),
    debug: jest.fn(),
    ...overrides,
  });

  return { workflow, order };
}

describe('BatchPostResultWorkflow', () => {
  test('applies results, flushes detection, syncs effects, refreshes perception, then schedules suppression clear', async () => {
    const updates = [update('hidden'), update('observed')];
    const { workflow, order } = createWorkflow();

    const result = await workflow.run({
      batchResult: { updates },
      postBatchPerceptionSuppression: null,
    });

    expect(result.uniqueUpdateCount).toBe(2);
    expect(order).toEqual([
      'apply:false',
      'flush',
      'effects:2',
      'refresh',
      'suppress:true',
      'schedule-clear',
      'clear-suppress',
    ]);
  });

  test('door batches suppress map render, sync only reveal updates, and mark refresh before refreshing', async () => {
    const suppression = { reason: 'door-state-change', perceptionRefreshed: false };
    const syncEphemeralEffectsForUpdates = jest.fn(async () => {});
    const refreshPerceptionAfterBatch = jest.fn(async () => {
      expect(suppression.perceptionRefreshed).toBe(true);
    });
    const applyBatchResults = jest.fn(async () => 3);
    const { workflow } = createWorkflow({
      applyBatchResults,
      syncEphemeralEffectsForUpdates,
      refreshPerceptionAfterBatch,
    });
    const updates = [update('hidden'), update('observed'), update('concealed')];

    await workflow.run({
      batchResult: { updates },
      postBatchPerceptionSuppression: suppression,
    });

    expect(applyBatchResults).toHaveBeenCalledWith(
      { updates },
      { suppressVisibilityMapRender: true },
    );
    expect(syncEphemeralEffectsForUpdates).toHaveBeenCalledWith([updates[1], updates[2]]);
    expect(refreshPerceptionAfterBatch).toHaveBeenCalledTimes(1);
    expect(suppression.perceptionRefreshed).toBe(true);
  });

  test('flushes detection and schedules suppression clear without effect or perception work when no updates apply', async () => {
    const syncEphemeralEffectsForUpdates = jest.fn(async () => {});
    const refreshPerceptionAfterBatch = jest.fn(async () => {});
    const debug = jest.fn();
    const { workflow, order } = createWorkflow({
      applyBatchResults: jest.fn(async () => 0),
      syncEphemeralEffectsForUpdates,
      refreshPerceptionAfterBatch,
      debug,
    });

    const result = await workflow.run({
      batchResult: { updates: [update('observed')] },
      postBatchPerceptionSuppression: null,
    });

    expect(result.uniqueUpdateCount).toBe(0);
    expect(syncEphemeralEffectsForUpdates).not.toHaveBeenCalled();
    expect(refreshPerceptionAfterBatch).not.toHaveBeenCalled();
    expect(debug).toHaveBeenCalledWith(
      'BatchOrchestrator: skipping perception refresh (no updates)',
    );
    expect(order).toEqual(['flush', 'suppress:true', 'schedule-clear', 'clear-suppress']);
  });

  test('uses a per-run detection flush adapter when provided', async () => {
    const constructorFlushDetectionBatch = jest.fn(async () => {});
    const runFlushDetectionBatch = jest.fn(async () => {});
    const workflow = new BatchPostResultWorkflow({
      applyBatchResults: jest.fn(async () => 0),
      flushDetectionBatch: constructorFlushDetectionBatch,
    });

    await workflow.run({
      batchResult: { updates: [] },
      flushDetectionBatch: runFlushDetectionBatch,
    });

    expect(runFlushDetectionBatch).toHaveBeenCalledTimes(1);
    expect(constructorFlushDetectionBatch).not.toHaveBeenCalled();
  });
});
