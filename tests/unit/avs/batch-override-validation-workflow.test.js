import { BatchOverrideValidationWorkflow } from '../../../scripts/visibility/auto-visibility/core/BatchOverrideValidationWorkflow.js';

describe('BatchOverrideValidationWorkflow', () => {
  test('does not treat stale movement memory as movement during a selection recalculation', async () => {
    const overrideValidationManager = {
      queueOverrideValidation: jest.fn(),
      processQueuedValidations: jest.fn(),
    };
    const workflow = new BatchOverrideValidationWorkflow({
      getLastMovedTokenId: () => 'previously-moved-token',
      isTokenMovementActive: () => false,
      overrideValidationManager,
    });

    await expect(
      workflow.runBeforeResultApplication({ isMovementBatch: false }),
    ).resolves.toEqual({
      queued: false,
      tokenId: 'previously-moved-token',
      skipped: 'non-movement-batch',
    });
    expect(overrideValidationManager.queueOverrideValidation).not.toHaveBeenCalled();
    expect(overrideValidationManager.processQueuedValidations).not.toHaveBeenCalled();
  });

  test('awaits validation already queued by the movement workflow', async () => {
    const deferred = {};
    const overrideValidationManager = {
      hasQueuedValidation: jest.fn(() => true),
      processQueuedValidations: jest.fn(
        () =>
          new Promise((resolve) => {
            deferred.resolve = resolve;
          }),
      ),
    };
    const workflow = new BatchOverrideValidationWorkflow({
      getLastMovedTokenId: () => 'mover',
      overrideValidationManager,
      warn: jest.fn(),
    });

    let settled = false;
    const runPromise = workflow.runBeforeResultApplication().then((result) => {
      settled = true;
      return result;
    });
    await Promise.resolve();

    expect(overrideValidationManager.hasQueuedValidation).toHaveBeenCalledWith('mover');
    expect(overrideValidationManager.processQueuedValidations).toHaveBeenCalledTimes(1);
    expect(settled).toBe(false);

    deferred.resolve();
    await expect(runPromise).resolves.toEqual({ queued: true, tokenId: 'mover' });
    expect(settled).toBe(true);
  });

  test('skips validation when there is no last moved token or manager', async () => {
    const overrideValidationManager = {
      queueOverrideValidation: jest.fn(),
      processQueuedValidations: jest.fn(),
    };

    await expect(
      new BatchOverrideValidationWorkflow({
        getLastMovedTokenId: () => null,
        overrideValidationManager,
      }).runBeforeResultApplication(),
    ).resolves.toEqual({ queued: false, tokenId: null });

    await expect(
      new BatchOverrideValidationWorkflow({
        getLastMovedTokenId: () => 'mover',
        overrideValidationManager: null,
      }).runBeforeResultApplication(),
    ).resolves.toEqual({ queued: false, tokenId: 'mover' });

    expect(overrideValidationManager.queueOverrideValidation).not.toHaveBeenCalled();
    expect(overrideValidationManager.processQueuedValidations).not.toHaveBeenCalled();
  });

  test('skips validation during movement batches', async () => {
    const overrideValidationManager = {
      queueOverrideValidation: jest.fn(),
      processQueuedValidations: jest.fn(),
    };

    await expect(
      new BatchOverrideValidationWorkflow({
        getLastMovedTokenId: () => 'mover',
        overrideValidationManager,
      }).runBeforeResultApplication({ isMovementBatch: true }),
    ).resolves.toEqual({
      queued: false,
      tokenId: 'mover',
      skipped: 'movement-batch',
    });

    expect(overrideValidationManager.queueOverrideValidation).not.toHaveBeenCalled();
    expect(overrideValidationManager.processQueuedValidations).not.toHaveBeenCalled();
  });

  test('skips validation while token movement is still active', async () => {
    const overrideValidationManager = {
      queueOverrideValidation: jest.fn(),
      processQueuedValidations: jest.fn(),
    };

    await expect(
      new BatchOverrideValidationWorkflow({
        getLastMovedTokenId: () => 'mover',
        isTokenMovementActive: () => true,
        overrideValidationManager,
      }).runBeforeResultApplication(),
    ).resolves.toEqual({
      queued: false,
      tokenId: 'mover',
      skipped: 'active-movement',
    });

    expect(overrideValidationManager.queueOverrideValidation).not.toHaveBeenCalled();
    expect(overrideValidationManager.processQueuedValidations).not.toHaveBeenCalled();
  });

  test('warns and resolves when validation processing fails', async () => {
    const error = new Error('validation failed');
    const warn = jest.fn();
    const overrideValidationManager = {
      hasQueuedValidation: jest.fn(() => true),
      processQueuedValidations: jest.fn(async () => {
        throw error;
      }),
    };

    await expect(
      new BatchOverrideValidationWorkflow({
        getLastMovedTokenId: () => 'mover',
        overrideValidationManager,
        warn,
      }).runBeforeResultApplication(),
    ).resolves.toEqual({ queued: false, tokenId: 'mover', error });

    expect(warn).toHaveBeenCalledWith(
      'PF2E Visioner | Error processing override validation in batch:',
      error,
    );
  });
});
