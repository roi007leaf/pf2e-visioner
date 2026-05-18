import { BatchWorkflowFactory } from '../../../scripts/visibility/auto-visibility/core/BatchWorkflowFactory.js';

describe('BatchWorkflowFactory', () => {
  test('delegates each orchestration phase to injected workflow adapters', async () => {
    const firstDetectionLifecycle = { start: jest.fn() };
    const secondDetectionLifecycle = { start: jest.fn() };
    const createDetectionBatchLifecycle = jest
      .fn()
      .mockReturnValueOnce(firstDetectionLifecycle)
      .mockReturnValueOnce(secondDetectionLifecycle);
    const overrideValidationWorkflow = {
      runBeforeResultApplication: jest.fn(async () => ({ queued: true, tokenId: 'mover' })),
    };
    const postResultWorkflow = {
      run: jest.fn(async () => ({ uniqueUpdateCount: 2 })),
    };
    const successTelemetryWorkflow = {
      report: jest.fn(() => ({ batchId: 'batch-1' })),
    };
    const finalizationWorkflow = {
      run: jest.fn(() => ({ followUpScheduled: false })),
    };
    const factory = new BatchWorkflowFactory({
      createDetectionBatchLifecycle,
      overrideValidationWorkflow,
      postResultWorkflow,
      successTelemetryWorkflow,
      finalizationWorkflow,
    });

    expect(factory.createDetectionBatchLifecycle()).toBe(firstDetectionLifecycle);
    expect(factory.createDetectionBatchLifecycle()).toBe(secondDetectionLifecycle);
    expect(createDetectionBatchLifecycle).toHaveBeenCalledTimes(2);

    await expect(factory.runOverrideValidationBeforeResultApplication()).resolves.toEqual({
      queued: true,
      tokenId: 'mover',
    });

    const postContext = {
      batchResult: { updates: [] },
      flushDetectionBatch: jest.fn(),
    };
    await expect(factory.runPostResults(postContext)).resolves.toEqual({
      uniqueUpdateCount: 2,
    });
    expect(postResultWorkflow.run).toHaveBeenCalledWith(postContext);

    const successTelemetryContext = { batchId: 'batch-1' };
    expect(factory.reportSuccessTelemetry(successTelemetryContext)).toEqual({ batchId: 'batch-1' });
    expect(successTelemetryWorkflow.report).toHaveBeenCalledWith(successTelemetryContext);

    const finalizationContext = { telemetryStopped: true };
    expect(factory.runFinalization(finalizationContext)).toEqual({ followUpScheduled: false });
    expect(finalizationWorkflow.run).toHaveBeenCalledWith(finalizationContext);
  });
});
