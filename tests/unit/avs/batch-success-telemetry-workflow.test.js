import { BatchSuccessTelemetryWorkflow } from '../../../scripts/visibility/auto-visibility/core/BatchSuccessTelemetryWorkflow.js';

describe('BatchSuccessTelemetryWorkflow', () => {
  test('stops telemetry with a success payload built from runtime adapters and batch context', () => {
    const stopTelemetry = jest.fn();
    const timings = { batchProcessing: 10 };
    const movementSession = { sessionId: 'move-1' };
    const workflow = new BatchSuccessTelemetryWorkflow({
      stopTelemetry,
      getClientId: () => 'user-1',
      getClientName: () => 'GM',
      getViewportFilteringEnabled: () => true,
      hasDarknessSources: () => false,
      getDebugMode: () => true,
    });

    const payload = workflow.report({
      batchId: 'batch-1',
      batchStartTime: 1,
      batchEndTime: 7,
      changedTokens: new Set(['A', 'B']),
      allTokens: [{ id: 'A' }, { id: 'B' }, { id: 'C' }],
      batchResult: {
        processedTokens: 2,
        breakdown: { visGlobalHits: 1 },
        precomputeStats: { observerUsed: 3 },
      },
      precomputeStats: { observerUsed: 1 },
      uniqueUpdateCount: 4,
      timings,
      movementSession,
    });

    expect(stopTelemetry).toHaveBeenCalledWith({
      batchId: 'batch-1',
      clientId: 'user-1',
      clientName: 'GM',
      batchStartTime: 1,
      batchEndTime: 7,
      changedAtStartCount: 2,
      allTokensCount: 3,
      viewportFilteringEnabled: true,
      hasDarknessSources: false,
      processedTokens: 2,
      uniqueUpdateCount: 4,
      breakdown: { visGlobalHits: 1 },
      precomputeStats: { observerUsed: 3 },
      debugMode: true,
      timings,
      movementSession,
    });
    expect(payload).toEqual(stopTelemetry.mock.calls[0][0]);
  });
});
