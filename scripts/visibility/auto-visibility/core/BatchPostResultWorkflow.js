import {
  buildBatchPostProcessingPlan,
  shouldSuppressVisibilityMapRender,
} from './BatchPostProcessingPolicy.js';

export class BatchPostResultWorkflow {
  #applyBatchResults;
  #flushDetectionBatch;
  #syncEphemeralEffectsForUpdates;
  #refreshPerceptionAfterBatch;
  #setSuppressLightingRefreshAfterBatch;
  #clearSuppressLightingRefreshAfterBatch;
  #scheduleTask;
  #debug;

  constructor({
    applyBatchResults = async () => 0,
    flushDetectionBatch = async () => {},
    syncEphemeralEffectsForUpdates = async () => {},
    refreshPerceptionAfterBatch = async () => {},
    setSuppressLightingRefreshAfterBatch = () => {},
    clearSuppressLightingRefreshAfterBatch = () => {},
    scheduleTask = (task) => task(),
    debug = () => {},
  } = {}) {
    this.#applyBatchResults = applyBatchResults;
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
    postBatchPerceptionSuppression = null,
    flushDetectionBatch = this.#flushDetectionBatch,
  } = {}) {
    const uniqueUpdateCount = await this.#applyBatchResults(batchResult, {
      suppressVisibilityMapRender: shouldSuppressVisibilityMapRender(
        postBatchPerceptionSuppression,
      ),
    });

    await flushDetectionBatch();

    const postProcessingPlan = buildBatchPostProcessingPlan({
      updates: batchResult.updates,
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
        await this.#refreshPerceptionAfterBatch();
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
