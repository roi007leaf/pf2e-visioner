import { BatchDetectionBatchLifecycle } from './BatchDetectionBatchLifecycle.js';
import { BatchFinalizationWorkflow } from './BatchFinalizationWorkflow.js';
import { BatchOverrideValidationWorkflow } from './BatchOverrideValidationWorkflow.js';
import { BatchPostResultWorkflow } from './BatchPostResultWorkflow.js';
import { BatchResultRenderLockWorkflow } from './BatchResultRenderLockWorkflow.js';
import { BatchSuccessTelemetryWorkflow } from './BatchSuccessTelemetryWorkflow.js';
import {
  forceTokenInvisibleForObserverVisibility as defaultForceTokenInvisibleForObserverVisibility,
  refreshPendingMovementTokenVisibility as defaultRefreshPendingMovementTokenVisibility,
} from '../../../services/PendingMovement/pending-movement-render-lock.js';

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

  runOverrideValidationBeforeResultApplication(context = {}) {
    return this.#overrideValidationWorkflow.runBeforeResultApplication(context);
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
  startDetectionBatch = () => { },
  flushDetectionBatch = async () => { },
  discardDetectionBatch = () => { },
  getLastMovedTokenId = () => null,
  overrideValidationManager = null,
  warn = () => { },
  applyBatchResults = async () => 0,
  applyBatchResultRenderLock = null,
  getControlledObserverIds = () =>
    (globalThis.canvas?.tokens?.controlled || [])
      .map((token) => token?.document?.id)
      .filter(Boolean),
  forceTokenInvisibleForObserverVisibility =
  defaultForceTokenInvisibleForObserverVisibility,
  refreshPendingMovementTokenVisibility = defaultRefreshPendingMovementTokenVisibility,
  syncEphemeralEffectsForUpdates = async () => { },
  refreshPerceptionAfterBatch = async () => { },
  setSuppressLightingRefreshAfterBatch = () => { },
  clearSuppressLightingRefreshAfterBatch = () => { },
  schedulePostResultTask = (task) => task(),
  debug = () => { },
  stopTelemetry = () => { },
  getClientId = () => undefined,
  getClientName = () => undefined,
  getViewportFilteringEnabled = () => false,
  hasDarknessSources = () => false,
  getDebugMode = () => false,
  setProcessingBatch = () => { },
  callHook = () => { },
  scheduleFinalizationTask = (task) => setTimeout(task, 0),
  processBatch = () => { },
  clearPendingTokens = () => { },
  clearPendingMovementSessionData = () => { },
} = {}) {
  const renderLockWorkflow = new BatchResultRenderLockWorkflow({
    getControlledObserverIds,
    forceTokenInvisibleForObserverVisibility,
    refreshPendingMovementTokenVisibility,
  });
  const runBatchResultRenderLock =
    applyBatchResultRenderLock ||
    ((updates, options = {}) => renderLockWorkflow.run({ updates, ...options }));

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
      applyBatchResultRenderLock: runBatchResultRenderLock,
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
