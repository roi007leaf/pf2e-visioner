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
        ignoreObservedGrace: true,
        skipPerceptionRefresh: true,
        targetTokenIds: plan.revealTargetTokenIds,
      });
    }

    if (refreshTargets && plan.hasHiddenRefreshWork) {
      this.#refreshPendingMovementTokenVisibility([], {
        ignoreObservedGrace: true,
        targetTokenIds: plan.hiddenTargetTokenIds,
      });
    }

    return plan;
  }
}
