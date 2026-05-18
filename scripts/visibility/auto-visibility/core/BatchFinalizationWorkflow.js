import {
  buildFallbackTelemetryPayload,
  buildFollowUpBatchPlan,
} from './BatchFinalizationPolicy.js';

export class BatchFinalizationWorkflow {
  #stopTelemetry;
  #setProcessingBatch;
  #callHook;
  #scheduleTask;
  #processBatch;
  #clearPendingTokens;
  #clearPendingMovementSessionData;

  constructor({
    stopTelemetry = () => {},
    setProcessingBatch = () => {},
    callHook = () => {},
    scheduleTask = (task) => setTimeout(task, 0),
    processBatch = () => {},
    clearPendingTokens = () => {},
    clearPendingMovementSessionData = () => {},
  } = {}) {
    this.#stopTelemetry = stopTelemetry;
    this.#setProcessingBatch = setProcessingBatch;
    this.#callHook = callHook;
    this.#scheduleTask = scheduleTask;
    this.#processBatch = processBatch;
    this.#clearPendingTokens = clearPendingTokens;
    this.#clearPendingMovementSessionData = clearPendingMovementSessionData;
  }

  run({
    telemetryStopped = false,
    fallbackTelemetryContext = {},
    changedTokens = new Set(),
    pendingTokens = new Set(),
    isTokenMoving = false,
    pendingMovementSessionData = null,
  } = {}) {
    let fallbackTelemetryStopped = false;

    if (!telemetryStopped) {
      try {
        this.#stopTelemetry(buildFallbackTelemetryPayload(fallbackTelemetryContext));
        fallbackTelemetryStopped = true;
      } catch {
        /* noop */
      }
    }

    this.#setProcessingBatch(false);

    try {
      this.#callHook('pf2e-visioner.batchComplete', changedTokens);
    } catch {
      /* noop */
    }

    let followUpScheduled = false;
    try {
      const followUpPlan = buildFollowUpBatchPlan({
        pendingTokens,
        isTokenMoving,
        pendingMovementSessionData,
      });

      if (followUpPlan.shouldSchedule) {
        this.#clearPendingTokens();
        this.#clearPendingMovementSessionData();
        followUpScheduled = true;
        this.#scheduleTask(() => {
          this.#processBatch(followUpPlan.tokens, followUpPlan.options);
          if (followUpPlan.shouldCallMovementComplete) {
            this.#callHook('pf2e-visioner.tokenMovementComplete', followUpPlan.tokens);
          }
        });
      }
    } catch {
      /* noop */
    }

    return { fallbackTelemetryStopped, followUpScheduled };
  }
}
