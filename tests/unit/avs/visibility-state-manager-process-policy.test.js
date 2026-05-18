import { getVisibilityBatchProcessDecision } from '../../../scripts/visibility/auto-visibility/core/VisibilityStateManager.js';

describe('getVisibilityBatchProcessDecision', () => {
  test('waits without clearing when processing is already running', () => {
    const decision = getVisibilityBatchProcessDecision({
      processingBatch: true,
      changedTokenCount: 2,
      hasBatchProcessor: true,
      systemStateProvider: {
        isEnabled: jest.fn(() => true),
        shouldProcessEvents: jest.fn(() => true),
      },
    });

    expect(decision).toEqual({
      shouldProcess: false,
      shouldClearChanges: false,
      reason: 'already-processing',
    });
  });

  test('waits without clearing when there are no changed tokens', () => {
    const decision = getVisibilityBatchProcessDecision({
      processingBatch: false,
      changedTokenCount: 0,
      hasBatchProcessor: true,
      systemStateProvider: {
        isEnabled: jest.fn(() => true),
        shouldProcessEvents: jest.fn(() => true),
      },
    });

    expect(decision).toEqual({
      shouldProcess: false,
      shouldClearChanges: false,
      reason: 'no-changes',
    });
  });

  test('waits without clearing when no batch processor is available yet', () => {
    const decision = getVisibilityBatchProcessDecision({
      processingBatch: false,
      changedTokenCount: 2,
      hasBatchProcessor: false,
      systemStateProvider: {
        isEnabled: jest.fn(() => true),
        shouldProcessEvents: jest.fn(() => true),
      },
    });

    expect(decision).toEqual({
      shouldProcess: false,
      shouldClearChanges: false,
      reason: 'missing-batch-processor',
    });
  });

  test('clears stale changes when AVS is disabled', () => {
    const decision = getVisibilityBatchProcessDecision({
      processingBatch: false,
      changedTokenCount: 2,
      hasBatchProcessor: true,
      systemStateProvider: {
        isEnabled: jest.fn(() => false),
        shouldProcessEvents: jest.fn(() => true),
      },
    });

    expect(decision).toEqual({
      shouldProcess: false,
      shouldClearChanges: true,
      reason: 'avs-disabled',
    });
  });

  test('clears stale changes when AVS should not process events', () => {
    const decision = getVisibilityBatchProcessDecision({
      processingBatch: false,
      changedTokenCount: 2,
      hasBatchProcessor: true,
      systemStateProvider: {
        isEnabled: jest.fn(() => true),
        shouldProcessEvents: jest.fn(() => false),
      },
    });

    expect(decision).toEqual({
      shouldProcess: false,
      shouldClearChanges: true,
      reason: 'events-paused',
    });
  });

  test('processes when the batch is ready and AVS accepts events', () => {
    const decision = getVisibilityBatchProcessDecision({
      processingBatch: false,
      changedTokenCount: 2,
      hasBatchProcessor: true,
      systemStateProvider: {
        isEnabled: jest.fn(() => true),
        shouldProcessEvents: jest.fn(() => true),
      },
    });

    expect(decision).toEqual({
      shouldProcess: true,
      shouldClearChanges: false,
      reason: 'ready',
    });
  });
});
