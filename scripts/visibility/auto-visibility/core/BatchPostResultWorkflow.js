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
  #nowProvider;

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
    nowProvider = () => globalThis.performance?.now?.() ?? Date.now(),
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
    this.#nowProvider = nowProvider;
  }

  async run({
    batchResult = {},
    postBatchPerceptionSuppression = null,
    flushDetectionBatch = this.#flushDetectionBatch,
  } = {}) {
    const timings = {
      preRenderLock: 0,
      resultApplication: 0,
      detectionFlush: 0,
      postRenderLock: 0,
      effectSync: 0,
      perceptionRefresh: 0,
    };
    const measure = async (stage, operation) => {
      const startedAt = this.#nowProvider();
      const result = await operation();
      timings[stage] += this.#nowProvider() - startedAt;
      return result;
    };

    if (batchResult.updates?.length > 0) {
      await measure('preRenderLock', () =>
        this.#applyBatchResultRenderLock(batchResult.updates, {
          forceVisibility: true,
          refreshTargets: false,
        }),
      );
    }

    const uniqueUpdateCount = await measure('resultApplication', () =>
      this.#applyBatchResults(batchResult, {
        suppressVisibilityMapRender: shouldSuppressVisibilityMapRender(
          postBatchPerceptionSuppression,
        ),
      }),
    );
    const appliedUpdates = batchResult.appliedUpdates ?? batchResult.updates;

    await measure('detectionFlush', () => flushDetectionBatch());

    if (appliedUpdates?.length > 0) {
      await measure('postRenderLock', () =>
        this.#applyBatchResultRenderLock(appliedUpdates, {
          forceVisibility: false,
          refreshTargets: true,
        }),
      );
    }

    const postProcessingPlan = buildBatchPostProcessingPlan({
      updates: appliedUpdates,
      uniqueUpdateCount,
      postBatchPerceptionSuppression,
    });

    if (postProcessingPlan.hasVisibilityUpdates) {
      if (postProcessingPlan.shouldSyncEffects) {
        await measure('effectSync', () =>
          this.#syncEphemeralEffectsForUpdates(postProcessingPlan.effectUpdates),
        );
      }

      if (postProcessingPlan.shouldRefreshPerception) {
        if (postProcessingPlan.shouldMarkPerceptionRefreshed) {
          postBatchPerceptionSuppression.perceptionRefreshed = true;
        }
        await measure('perceptionRefresh', () => this.#refreshPerceptionAfterBatch());
      }
    } else {
      this.#debug('BatchOrchestrator: skipping perception refresh (no updates)');
    }

    this.#setSuppressLightingRefreshAfterBatch(true);
    this.#scheduleTask(() => {
      this.#clearSuppressLightingRefreshAfterBatch();
    });

    return { uniqueUpdateCount, postProcessingPlan, timings };
  }
}
