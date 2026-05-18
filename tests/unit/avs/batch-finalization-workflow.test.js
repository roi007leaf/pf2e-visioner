import { BatchFinalizationWorkflow } from '../../../scripts/visibility/auto-visibility/core/BatchFinalizationWorkflow.js';

function createWorkflow(overrides = {}) {
  const order = [];
  const workflow = new BatchFinalizationWorkflow({
    stopTelemetry: jest.fn((payload) => {
      order.push(`telemetry:${payload.changedAtStartCount}`);
    }),
    setProcessingBatch: jest.fn((value) => {
      order.push(`processing:${value}`);
    }),
    callHook: jest.fn((hookName, payload) => {
      order.push(`hook:${hookName}:${payload instanceof Set ? Array.from(payload).join(',') : ''}`);
    }),
    scheduleTask: jest.fn((task) => {
      order.push('schedule');
      task();
    }),
    processBatch: jest.fn((tokens, options) => {
      order.push(`process:${Array.from(tokens).join(',')}:${options?.movementSession?.sessionId ?? ''}`);
    }),
    clearPendingTokens: jest.fn(() => {
      order.push('clear-pending');
    }),
    clearPendingMovementSessionData: jest.fn(() => {
      order.push('clear-session');
    }),
    ...overrides,
  });

  return { workflow, order };
}

describe('BatchFinalizationWorkflow', () => {
  test('stops fallback telemetry, resets processing, fires completion hook, and schedules follow-up', () => {
    const pendingTokens = new Set(['B', 'A']);
    const pendingMovementSessionData = { sessionId: 'move-1' };
    const clearPendingTokens = jest.fn(() => {
      pendingTokens.clear();
    });
    const clearPendingMovementSessionData = jest.fn();
    const { workflow, order } = createWorkflow({
      clearPendingTokens,
      clearPendingMovementSessionData,
    });

    const result = workflow.run({
      telemetryStopped: false,
      fallbackTelemetryContext: {
        batchId: 'batch-1',
        clientId: 'user-1',
        clientName: 'GM',
        visibleChangedTokens: new Set(['A']),
        changedTokens: new Set(['A', 'B']),
        allTokensCount: 4,
      },
      changedTokens: new Set(['A']),
      pendingTokens,
      isTokenMoving: false,
      pendingMovementSessionData,
    });

    expect(result.followUpScheduled).toBe(true);
    expect(clearPendingTokens).toHaveBeenCalledTimes(1);
    expect(clearPendingMovementSessionData).toHaveBeenCalledTimes(1);
    expect(pendingTokens.size).toBe(0);
    expect(order).toEqual([
      'telemetry:1',
      'processing:false',
      'hook:pf2e-visioner.batchComplete:A',
      'schedule',
      'process:B,A:move-1',
      'hook:pf2e-visioner.tokenMovementComplete:B,A',
    ]);
  });

  test('does not stop telemetry again when normal telemetry already stopped', () => {
    const stopTelemetry = jest.fn();
    const { workflow, order } = createWorkflow({ stopTelemetry });

    const result = workflow.run({
      telemetryStopped: true,
      changedTokens: new Set(['A']),
      pendingTokens: new Set(),
    });

    expect(result.fallbackTelemetryStopped).toBe(false);
    expect(stopTelemetry).not.toHaveBeenCalled();
    expect(order).toEqual(['processing:false', 'hook:pf2e-visioner.batchComplete:A']);
  });

  test('leaves pending movement tokens queued while movement is still active', () => {
    const pendingTokens = new Set(['A']);
    const clearPendingTokens = jest.fn();
    const clearPendingMovementSessionData = jest.fn();
    const processBatch = jest.fn();
    const { workflow } = createWorkflow({
      clearPendingTokens,
      clearPendingMovementSessionData,
      processBatch,
    });

    const result = workflow.run({
      telemetryStopped: true,
      changedTokens: new Set(['A']),
      pendingTokens,
      isTokenMoving: true,
      pendingMovementSessionData: { sessionId: 'move-1' },
    });

    expect(result.followUpScheduled).toBe(false);
    expect(clearPendingTokens).not.toHaveBeenCalled();
    expect(clearPendingMovementSessionData).not.toHaveBeenCalled();
    expect(processBatch).not.toHaveBeenCalled();
    expect(Array.from(pendingTokens)).toEqual(['A']);
  });
});
