import { BatchResultRenderLockWorkflow } from '../../../scripts/visibility/auto-visibility/core/BatchResultRenderLockWorkflow.js';

function update({
  observerId = 'observer',
  targetId = 'target',
  visibility = 'hidden',
} = {}) {
  return {
    observer: { document: { id: observerId } },
    target: { document: { id: targetId } },
    visibility,
  };
}

describe('BatchResultRenderLockWorkflow', () => {
  test('forces controlled observer locks and runs target-limited pending movement refreshes', () => {
    const forceTokenInvisibleForObserverVisibility = jest.fn();
    const refreshPendingMovementTokenVisibility = jest.fn();
    const hidden = update({
      observerId: 'controlled',
      targetId: 'hidden-target',
      visibility: 'undetected',
    });
    const duplicateHidden = update({
      observerId: 'other',
      targetId: 'hidden-target',
      visibility: 'hidden',
    });
    const revealed = update({
      observerId: 'other',
      targetId: 'revealed-target',
      visibility: 'observed',
    });
    const workflow = new BatchResultRenderLockWorkflow({
      getControlledObserverIds: () => ['controlled'],
      forceTokenInvisibleForObserverVisibility,
      refreshPendingMovementTokenVisibility,
    });

    const plan = workflow.run({ updates: [hidden, duplicateHidden, revealed] });

    expect(forceTokenInvisibleForObserverVisibility).toHaveBeenCalledTimes(1);
    expect(forceTokenInvisibleForObserverVisibility).toHaveBeenCalledWith(
      hidden.observer,
      hidden.target,
      'undetected',
    );
    expect(refreshPendingMovementTokenVisibility).toHaveBeenNthCalledWith(1, [], {
      coalesceFrame: true,
      ignoreObservedGrace: true,
      skipPerceptionRefresh: true,
      source: 'batch-result-reveal-refresh',
      targetTokenIds: ['revealed-target'],
    });
    expect(refreshPendingMovementTokenVisibility).toHaveBeenNthCalledWith(2, [], {
      coalesceFrame: true,
      ignoreObservedGrace: true,
      source: 'batch-result-hidden-refresh',
      targetTokenIds: ['hidden-target'],
    });
    expect(plan.hasWork).toBe(true);
  });

  test('skips adapters when updates have no render-lock work', () => {
    const forceTokenInvisibleForObserverVisibility = jest.fn();
    const refreshPendingMovementTokenVisibility = jest.fn();
    const workflow = new BatchResultRenderLockWorkflow({
      getControlledObserverIds: () => [],
      forceTokenInvisibleForObserverVisibility,
      refreshPendingMovementTokenVisibility,
    });

    const plan = workflow.run({
      updates: [update({ visibility: 'visible' })],
    });

    expect(forceTokenInvisibleForObserverVisibility).not.toHaveBeenCalled();
    expect(refreshPendingMovementTokenVisibility).not.toHaveBeenCalled();
    expect(plan.hasWork).toBe(false);
  });
});
