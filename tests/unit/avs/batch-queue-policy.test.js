import {
  buildCoalesceDrainPlan,
  buildProcessBatchAdmissionPlan,
} from '../../../scripts/visibility/auto-visibility/core/BatchQueuePolicy.js';

describe('BatchQueuePolicy', () => {
  describe('buildCoalesceDrainPlan', () => {
    test('keeps pending tokens queued while movement is active', () => {
      expect(
        buildCoalesceDrainPlan({
          pendingTokens: new Set(['A']),
          isTokenMoving: true,
          processingBatch: false,
        }),
      ).toEqual({
        shouldDrain: false,
        shouldClearPending: false,
        tokens: new Set(),
        reason: 'movement-active',
      });
    });

    test('keeps pending tokens queued while another batch is active', () => {
      expect(
        buildCoalesceDrainPlan({
          pendingTokens: new Set(['A']),
          isTokenMoving: false,
          processingBatch: true,
        }),
      ).toEqual({
        shouldDrain: false,
        shouldClearPending: false,
        tokens: new Set(),
        reason: 'batch-active',
      });
    });

    test('drains a snapshot when pending tokens are ready', () => {
      const pendingTokens = new Set(['A', 'B']);
      const plan = buildCoalesceDrainPlan({
        pendingTokens,
        isTokenMoving: false,
        processingBatch: false,
      });

      pendingTokens.add('C');

      expect(plan).toEqual({
        shouldDrain: true,
        shouldClearPending: true,
        tokens: new Set(['A', 'B']),
        reason: 'ready',
      });
    });
  });

  describe('buildProcessBatchAdmissionPlan', () => {
    test('queues direct processBatch tokens while another batch is active', () => {
      const movementSession = { sessionId: 'move-1' };

      expect(
        buildProcessBatchAdmissionPlan({
          changedTokens: new Set(['A', 'B']),
          processingBatch: true,
          movementSession,
        }),
      ).toEqual({
        shouldProcess: false,
        shouldQueue: true,
        queuedTokens: new Set(['A', 'B']),
        pendingMovementSessionData: movementSession,
        reason: 'batch-active',
      });
    });

    test('skips empty batches without queueing', () => {
      expect(
        buildProcessBatchAdmissionPlan({
          changedTokens: new Set(),
          processingBatch: false,
        }),
      ).toEqual({
        shouldProcess: false,
        shouldQueue: false,
        queuedTokens: new Set(),
        pendingMovementSessionData: null,
        reason: 'empty',
      });
    });

    test('admits non-empty batches when no batch is active', () => {
      expect(
        buildProcessBatchAdmissionPlan({
          changedTokens: new Set(['A']),
          processingBatch: false,
        }),
      ).toEqual({
        shouldProcess: true,
        shouldQueue: false,
        queuedTokens: new Set(),
        pendingMovementSessionData: null,
        reason: 'ready',
      });
    });
  });
});
