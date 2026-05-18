import { BatchDetectionBatchLifecycle } from './BatchDetectionBatchLifecycle.js';
import { BatchFinalizationWorkflow } from './BatchFinalizationWorkflow.js';
import { BatchOverrideValidationWorkflow } from './BatchOverrideValidationWorkflow.js';
import { BatchPostResultWorkflow } from './BatchPostResultWorkflow.js';
import { BatchSuccessTelemetryWorkflow } from './BatchSuccessTelemetryWorkflow.js';

export class BatchWorkflowFactory {
  #createDetectionBatchLifecycle;
  #overrideValidationWorkflow;
  #postResultWorkflow;
  #successTelemetryWorkflow;
  #finalizationWorkflow;

  constructor({
    createDetectionBatchLifecycle = () => new BatchDetectionBatchLifecycle(),
    overrideValidationWorkflow = new BatchOverrideValidationWorkflow(),
    postResultWorkflow = new BatchPostResultWorkflow(),
    successTelemetryWorkflow = new BatchSuccessTelemetryWorkflow(),
    finalizationWorkflow = new BatchFinalizationWorkflow(),
  } = {}) {
    this.#createDetectionBatchLifecycle = createDetectionBatchLifecycle;
    this.#overrideValidationWorkflow = overrideValidationWorkflow;
    this.#postResultWorkflow = postResultWorkflow;
    this.#successTelemetryWorkflow = successTelemetryWorkflow;
    this.#finalizationWorkflow = finalizationWorkflow;
  }

  createDetectionBatchLifecycle() {
    return this.#createDetectionBatchLifecycle();
  }

  runOverrideValidationBeforeResultApplication() {
    return this.#overrideValidationWorkflow.runBeforeResultApplication();
  }

  runPostResults(context) {
    return this.#postResultWorkflow.run(context);
  }

  reportSuccessTelemetry(context) {
    return this.#successTelemetryWorkflow.report(context);
  }

  runFinalization(context) {
    return this.#finalizationWorkflow.run(context);
  }
}

export function createDefaultBatchWorkflowFactory({
  startDetectionBatch = () => {},
  flushDetectionBatch = async () => {},
  discardDetectionBatch = () => {},
  getLastMovedTokenId = () => null,
  overrideValidationManager = null,
  warn = () => {},
  applyBatchResults = async () => 0,
  syncEphemeralEffectsForUpdates = async () => {},
  refreshPerceptionAfterBatch = async () => {},
  setSuppressLightingRefreshAfterBatch = () => {},
  clearSuppressLightingRefreshAfterBatch = () => {},
  schedulePostResultTask = (task) => task(),
  debug = () => {},
  stopTelemetry = () => {},
  getClientId = () => undefined,
  getClientName = () => undefined,
  getViewportFilteringEnabled = () => false,
  hasDarknessSources = () => false,
  getDebugMode = () => false,
  setProcessingBatch = () => {},
  callHook = () => {},
  scheduleFinalizationTask = (task) => setTimeout(task, 0),
  processBatch = () => {},
  clearPendingTokens = () => {},
  clearPendingMovementSessionData = () => {},
} = {}) {
  return new BatchWorkflowFactory({
    createDetectionBatchLifecycle: () =>
      new BatchDetectionBatchLifecycle({
        start: startDetectionBatch,
        flush: flushDetectionBatch,
        discard: discardDetectionBatch,
      }),
    overrideValidationWorkflow: new BatchOverrideValidationWorkflow({
      getLastMovedTokenId,
      overrideValidationManager,
      warn,
    }),
    postResultWorkflow: new BatchPostResultWorkflow({
      applyBatchResults,
      syncEphemeralEffectsForUpdates,
      refreshPerceptionAfterBatch,
      setSuppressLightingRefreshAfterBatch,
      clearSuppressLightingRefreshAfterBatch,
      scheduleTask: schedulePostResultTask,
      debug,
    }),
    successTelemetryWorkflow: new BatchSuccessTelemetryWorkflow({
      stopTelemetry,
      getClientId,
      getClientName,
      getViewportFilteringEnabled,
      hasDarknessSources,
      getDebugMode,
    }),
    finalizationWorkflow: new BatchFinalizationWorkflow({
      stopTelemetry,
      setProcessingBatch,
      callHook,
      scheduleTask: scheduleFinalizationTask,
      processBatch,
      clearPendingTokens,
      clearPendingMovementSessionData,
    }),
  });
}
