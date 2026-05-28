import { buildBatchResultRenderLockPlan } from './BatchResultRenderLockPolicy.js';

export class BatchResultRenderLockWorkflow {
  #getControlledObserverIds;
  #getActiveMovementTokenIds;
  #forceTokenInvisibleForObserverVisibility;
  #refreshPendingMovementTokenVisibility;

  constructor({
    getControlledObserverIds = () => [],
    getActiveMovementTokenIds = () => [],
    forceTokenInvisibleForObserverVisibility = () => {},
    refreshPendingMovementTokenVisibility = () => {},
  } = {}) {
    this.#getControlledObserverIds = getControlledObserverIds;
    this.#getActiveMovementTokenIds = getActiveMovementTokenIds;
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

    const activeMovementTokenIds = this.#getActiveMovementTokenIds();

    if (refreshTargets && plan.hasRevealRefreshWork) {
      this.#refreshPendingMovementTokenVisibility(activeMovementTokenIds, {
        coalesceFrame: true,
        ignoreObservedGrace: true,
        skipPerceptionRefresh: true,
        source: 'batch-result-reveal-refresh',
        targetTokenIds: plan.revealTargetTokenIds,
      });
    }

    if (refreshTargets && plan.hasHiddenRefreshWork) {
      this.#refreshPendingMovementTokenVisibility(activeMovementTokenIds, {
        coalesceFrame: true,
        ignoreObservedGrace: true,
        source: 'batch-result-hidden-refresh',
        targetTokenIds: plan.hiddenTargetTokenIds,
      });
    }

    return plan;
  }
}
