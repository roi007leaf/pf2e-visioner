import { VisibilityStateManager } from '../../../scripts/visibility/auto-visibility/core/VisibilityStateManager.js';

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('VisibilityStateManager queued changes', () => {
  test('processes tokens marked while another batch is in flight in a follow-up batch', async () => {
    const firstBatch = createDeferred();
    const batchProcessor = jest.fn((changedTokens) => {
      if (batchProcessor.mock.calls.length === 1) {
        return firstBatch.promise;
      }
      return Promise.resolve(changedTokens);
    });
    const manager = new VisibilityStateManager({
      batchProcessor,
      systemStateProvider: {
        debug: jest.fn(),
        isDebugMode: jest.fn(() => false),
        isEnabled: jest.fn(() => true),
        shouldProcessEvents: jest.fn(() => true),
      },
    });

    manager.markTokenChangedImmediate('A');
    expect(batchProcessor).toHaveBeenCalledTimes(1);

    manager.markTokenChangedImmediate('B');

    expect(batchProcessor).toHaveBeenCalledTimes(1);
    expect(Array.from(batchProcessor.mock.calls[0][0])).toEqual(['A']);

    firstBatch.resolve();
    await flushPromises();

    expect(batchProcessor).toHaveBeenCalledTimes(2);
    expect(Array.from(batchProcessor.mock.calls[1][0])).toEqual(['B']);
    expect(manager.getChangedTokens()).toEqual(new Set());
  });

  test('keeps active and queued token ids pending after a batch failure without auto-retrying', async () => {
    const firstBatch = createDeferred();
    const batchProcessor = jest.fn(() => firstBatch.promise);
    const manager = new VisibilityStateManager({
      batchProcessor,
      systemStateProvider: {
        debug: jest.fn(),
        isDebugMode: jest.fn(() => false),
        isEnabled: jest.fn(() => true),
        shouldProcessEvents: jest.fn(() => true),
      },
    });
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      manager.markTokenChangedImmediate('A');
      manager.markTokenChangedImmediate('B');

      firstBatch.reject(new Error('boom'));
      await flushPromises();

      expect(batchProcessor).toHaveBeenCalledTimes(1);
      expect(manager.getChangedTokens()).toEqual(new Set(['A', 'B']));
    } finally {
      consoleError.mockRestore();
    }
  });
});
