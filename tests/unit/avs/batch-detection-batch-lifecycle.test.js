import { BatchDetectionBatchLifecycle } from '../../../scripts/visibility/auto-visibility/core/BatchDetectionBatchLifecycle.js';

describe('BatchDetectionBatchLifecycle', () => {
  test('starts detection batching once', () => {
    const start = jest.fn();
    const lifecycle = new BatchDetectionBatchLifecycle({
      start,
      flush: jest.fn(),
      discard: jest.fn(),
    });

    lifecycle.start();
    lifecycle.start();

    expect(start).toHaveBeenCalledTimes(1);
  });

  test('flushes an open detection batch and closes it', async () => {
    const flush = jest.fn(async () => {});
    const discard = jest.fn();
    const lifecycle = new BatchDetectionBatchLifecycle({
      start: jest.fn(),
      flush,
      discard,
    });

    lifecycle.start();
    await lifecycle.flush();
    lifecycle.discardIfOpen();

    expect(flush).toHaveBeenCalledTimes(1);
    expect(discard).not.toHaveBeenCalled();
  });

  test('discards an open detection batch and closes it', async () => {
    const flush = jest.fn(async () => {});
    const discard = jest.fn();
    const lifecycle = new BatchDetectionBatchLifecycle({
      start: jest.fn(),
      flush,
      discard,
    });

    lifecycle.start();
    lifecycle.discard();
    await lifecycle.flush();

    expect(discard).toHaveBeenCalledTimes(1);
    expect(flush).not.toHaveBeenCalled();
  });

  test('discardIfOpen is a no-op before start', () => {
    const discard = jest.fn();
    const lifecycle = new BatchDetectionBatchLifecycle({
      start: jest.fn(),
      flush: jest.fn(),
      discard,
    });

    lifecycle.discardIfOpen();

    expect(discard).not.toHaveBeenCalled();
  });
});
