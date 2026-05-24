import { buildBatchResultRenderLockPlan } from './BatchResultRenderLockPolicy.js';

export class BatchResultRenderLockWorkflow {
  #getControlledObserverIds;
  #forceTokenInvisibleForObserverVisibility;
  #refreshPendingMovementTokenVisibility;

  constructor({
    getControlledObserverIds = () => [],
    forceTokenInvisibleForObserverVisibility = () => {},
    refreshPendingMovementTokenVisibility = () => {},
  } = {}) {
    this.#getControlledObserverIds = getControlledObserverIds;
    this.#forceTokenInvisibleForObserverVisibility = forceTokenInvisibleForObserverVisibility;
    this.#refreshPendingMovementTokenVisibility = refreshPendingMovementTokenVisibility;
  }

  run({ updates = [], forceVisibility = true, refreshTargets = true } = {}) {
    const plan = buildBatchResultRenderLockPlan({
      updates,
      controlledObserverIds: this.#getControlledObserverIds(),
    });

    if (forceVisibility) {
      for (const update of plan.forceVisibilityUpdates) {
        this.#forceTokenInvisibleForObserverVisibility(
          update.observer,
          update.target,
          update.visibility,
        );
      }
    }

    if (refreshTargets && plan.hasRevealRefreshWork) {
      this.#refreshPendingMovementTokenVisibility([], {
        coalesceFrame: true,
        ignoreObservedGrace: true,
        skipPerceptionRefresh: true,
        source: 'batch-result-reveal-refresh',
        targetTokenIds: plan.revealTargetTokenIds,
      });
    }

    if (refreshTargets && plan.hasHiddenRefreshWork) {
      this.#refreshPendingMovementTokenVisibility([], {
        coalesceFrame: true,
        ignoreObservedGrace: true,
        source: 'batch-result-hidden-refresh',
        targetTokenIds: plan.hiddenTargetTokenIds,
      });
    }

    return plan;
  }
}
