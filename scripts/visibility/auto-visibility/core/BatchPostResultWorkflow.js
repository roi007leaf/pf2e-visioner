import {
  buildBatchPostProcessingPlan,
  shouldSuppressVisibilityMapRender,
} from './BatchPostProcessingPolicy.js';

export class BatchPostResultWorkflow {
  #applyBatchResults;
  #applyBatchResultRenderLock;
  #flushDetectionBatch;
  #syncEphemeralEffectsForUpdates;
  #refreshPerceptionAfterBatch;
  #setSuppressLightingRefreshAfterBatch;
  #clearSuppressLightingRefreshAfterBatch;
  #scheduleTask;
  #debug;

  constructor({
    applyBatchResults = async () => 0,
    applyBatchResultRenderLock = async () => {},
    flushDetectionBatch = async () => {},
    syncEphemeralEffectsForUpdates = async () => {},
    refreshPerceptionAfterBatch = async () => {},
    setSuppressLightingRefreshAfterBatch = () => {},
    clearSuppressLightingRefreshAfterBatch = () => {},
    scheduleTask = (task) => task(),
    debug = () => {},
  } = {}) {
    this.#applyBatchResults = applyBatchResults;
    this.#applyBatchResultRenderLock = applyBatchResultRenderLock;
    this.#flushDetectionBatch = flushDetectionBatch;
    this.#syncEphemeralEffectsForUpdates = syncEphemeralEffectsForUpdates;
    this.#refreshPerceptionAfterBatch = refreshPerceptionAfterBatch;
    this.#setSuppressLightingRefreshAfterBatch = setSuppressLightingRefreshAfterBatch;
    this.#clearSuppressLightingRefreshAfterBatch = clearSuppressLightingRefreshAfterBatch;
    this.#scheduleTask = scheduleTask;
    this.#debug = debug;
  }

  async run({
    batchResult = {},
    isMovementBatch = false,
    postBatchPerceptionSuppression = null,
    flushDetectionBatch = this.#flushDetectionBatch,
  } = {}) {
    if (batchResult.updates?.length > 0) {
      await this.#applyBatchResultRenderLock(batchResult.updates, {
        forceVisibility: true,
        refreshTargets: false,
      });
    }

    const uniqueUpdateCount = await this.#applyBatchResults(batchResult, {
      suppressVisibilityMapRender:
        isMovementBatch ||
        shouldSuppressVisibilityMapRender(postBatchPerceptionSuppression),
    });
    const appliedUpdates = batchResult.appliedUpdates ?? batchResult.updates;

    await flushDetectionBatch();

    if (appliedUpdates?.length > 0) {
      await this.#applyBatchResultRenderLock(appliedUpdates, {
        forceVisibility: false,
        refreshTargets: true,
      });
    }

    const postProcessingPlan = buildBatchPostProcessingPlan({
      isMovementBatch,
      updates: appliedUpdates,
      uniqueUpdateCount,
      postBatchPerceptionSuppression,
    });

    if (postProcessingPlan.hasVisibilityUpdates) {
      if (postProcessingPlan.shouldSyncEffects) {
        await this.#syncEphemeralEffectsForUpdates(postProcessingPlan.effectUpdates);
      }

      if (postProcessingPlan.shouldRefreshPerception) {
        if (postProcessingPlan.shouldMarkPerceptionRefreshed) {
          postBatchPerceptionSuppression.perceptionRefreshed = true;
        }
        await this.#refreshPerceptionAfterBatch({ isMovementBatch });
      }
    } else {
      this.#debug('BatchOrchestrator: skipping perception refresh (no updates)');
    }

    this.#setSuppressLightingRefreshAfterBatch(true);
    this.#scheduleTask(() => {
      this.#clearSuppressLightingRefreshAfterBatch();
    });

    return { uniqueUpdateCount, postProcessingPlan };
  }
}
