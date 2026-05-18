import { BatchOverrideValidationWorkflow } from '../../../scripts/visibility/auto-visibility/core/BatchOverrideValidationWorkflow.js';

describe('BatchOverrideValidationWorkflow', () => {
  test('queues the last moved token and awaits queued validation processing', async () => {
    const deferred = {};
    const overrideValidationManager = {
      queueOverrideValidation: jest.fn(),
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

    expect(overrideValidationManager.queueOverrideValidation).toHaveBeenCalledWith('mover');
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

  test('warns and resolves when validation processing fails', async () => {
    const error = new Error('validation failed');
    const warn = jest.fn();
    const overrideValidationManager = {
      queueOverrideValidation: jest.fn(),
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
