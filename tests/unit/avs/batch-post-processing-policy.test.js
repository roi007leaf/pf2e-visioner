import {
  buildBatchPostProcessingPlan,
  shouldSuppressVisibilityMapRender,
} from '../../../scripts/visibility/auto-visibility/core/BatchPostProcessingPolicy.js';

function update(visibility) {
  return { observer: { document: { id: 'A' } }, target: { document: { id: 'B' } }, visibility };
}

describe('BatchPostProcessingPolicy', () => {
  test('suppresses visibility map rendering only for door-triggered batches', () => {
    expect(shouldSuppressVisibilityMapRender({ reason: 'door-state-change' })).toBe(true);
    expect(shouldSuppressVisibilityMapRender({ reason: 'lighting-refresh' })).toBe(false);
    expect(shouldSuppressVisibilityMapRender(null)).toBe(false);
  });

  test('builds normal post-processing plan for applied visibility updates', () => {
    const updates = [update('hidden'), update('observed')];

    expect(
      buildBatchPostProcessingPlan({
        updates,
        uniqueUpdateCount: 2,
        postBatchPerceptionSuppression: null,
      }),
    ).toEqual({
      hasVisibilityUpdates: true,
      shouldSyncEffects: true,
      effectUpdates: updates,
      shouldRefreshPerception: true,
      shouldMarkPerceptionRefreshed: false,
    });
  });

  test('limits door-triggered effect sync to reveal updates and refreshes once', () => {
    const updates = [update('hidden'), update('observed'), update('concealed')];
    const suppression = { reason: 'door-state-change', perceptionRefreshed: false };

    expect(
      buildBatchPostProcessingPlan({
        updates,
        uniqueUpdateCount: 3,
        postBatchPerceptionSuppression: suppression,
      }),
    ).toEqual({
      hasVisibilityUpdates: true,
      shouldSyncEffects: true,
      effectUpdates: [updates[1], updates[2]],
      shouldRefreshPerception: true,
      shouldMarkPerceptionRefreshed: true,
    });
  });

  test('does not refresh again for an already refreshed door-triggered suppression', () => {
    const updates = [update('observed')];

    expect(
      buildBatchPostProcessingPlan({
        updates,
        uniqueUpdateCount: 1,
        postBatchPerceptionSuppression: {
          reason: 'door-state-change',
          perceptionRefreshed: true,
        },
      }),
    ).toEqual({
      hasVisibilityUpdates: true,
      shouldSyncEffects: true,
      effectUpdates: updates,
      shouldRefreshPerception: false,
      shouldMarkPerceptionRefreshed: false,
    });
  });

  test('skips effect sync and perception refresh when no updates were applied', () => {
    expect(
      buildBatchPostProcessingPlan({
        updates: [update('observed')],
        uniqueUpdateCount: 0,
        postBatchPerceptionSuppression: null,
      }),
    ).toEqual({
      hasVisibilityUpdates: false,
      shouldSyncEffects: false,
      effectUpdates: [],
      shouldRefreshPerception: false,
      shouldMarkPerceptionRefreshed: false,
    });
  });
});
