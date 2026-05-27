import {
  buildVisibilityMapApplicationPlan,
  dedupeBatchUpdates,
} from '../../../scripts/visibility/auto-visibility/core/BatchResultApplicationPolicy.js';

function observer(id) {
  return { document: { id } };
}

function target(id, overrideData = null) {
  return {
    document: {
      id,
      getFlag: jest.fn(() => overrideData),
    },
  };
}

describe('BatchResultApplicationPolicy', () => {
  test('dedupes updates by observer-target pair and keeps the latest update', () => {
    const observerA = observer('A');
    const targetB = target('B');
    const first = { observer: observerA, target: targetB, visibility: 'hidden' };
    const second = { observer: observerA, target: targetB, visibility: 'observed' };

    expect(dedupeBatchUpdates([first, second])).toEqual([second]);
  });

  test('builds dirty observer maps for visibility changes', () => {
    const observerA = observer('A');
    const targetB = target('B');
    const recordExplicitVisiblePair = jest.fn(() => false);

    const plan = buildVisibilityMapApplicationPlan({
      updates: [{ observer: observerA, target: targetB, visibility: 'observed' }],
      getVisibilityMap: jest.fn(() => ({ B: 'hidden' })),
      recordExplicitVisiblePair,
      overrideMatchesVisibility: jest.fn(() => true),
      moduleId: 'pf2e-visioner',
    });

    expect(plan.uniqueUpdateCount).toBe(1);
    expect(plan.dirtyObservers).toEqual([observerA]);
    expect(plan.observerMaps.get(observerA)).toEqual({ B: 'observed' });
    expect(plan.appliedUpdates).toEqual([expect.objectContaining({ visibility: 'observed' })]);
    expect(recordExplicitVisiblePair).toHaveBeenCalledTimes(1);
  });

  test('persists observed updates when document map still has stale non-observed state', () => {
    const observerA = observer('A');
    const targetB = target('B');
    const recordExplicitVisiblePair = jest.fn(() => false);

    const plan = buildVisibilityMapApplicationPlan({
      updates: [{ observer: observerA, target: targetB, visibility: 'observed' }],
      getVisibilityMap: jest.fn(() => ({})),
      getStoredVisibilityMap: jest.fn(() => ({ B: 'undetected' })),
      recordExplicitVisiblePair,
      overrideMatchesVisibility: jest.fn(() => true),
      moduleId: 'pf2e-visioner',
    });

    expect(plan.uniqueUpdateCount).toBe(1);
    expect(plan.dirtyObservers).toEqual([observerA]);
    expect(plan.observerMaps.get(observerA)).toEqual({ B: 'observed' });
    expect(plan.appliedUpdates).toEqual([expect.objectContaining({ visibility: 'observed' })]);
  });

  test('skips force-ephemeral-only updates and active override mismatches', () => {
    const observerA = observer('A');
    const targetB = target('B', { visibility: 'hidden' });
    const recordExplicitVisiblePair = jest.fn(() => false);

    const plan = buildVisibilityMapApplicationPlan({
      updates: [
        {
          observer: observerA,
          target: target('ephemeral'),
          visibility: 'hidden',
          forceEphemeralOnly: true,
        },
        { observer: observerA, target: targetB, visibility: 'observed' },
      ],
      getVisibilityMap: jest.fn(() => ({ B: 'hidden' })),
      recordExplicitVisiblePair,
      overrideMatchesVisibility: jest.fn(() => false),
      moduleId: 'pf2e-visioner',
    });

    expect(plan.uniqueUpdateCount).toBe(0);
    expect(plan.dirtyObservers).toEqual([]);
    expect(plan.appliedUpdates).toEqual([]);
    expect(recordExplicitVisiblePair).not.toHaveBeenCalled();
  });

  test('counts detection-sync-only explicit pair changes without dirtying maps', () => {
    const observerA = observer('A');
    const targetB = target('B');

    const plan = buildVisibilityMapApplicationPlan({
      updates: [
        {
          observer: observerA,
          target: targetB,
          visibility: 'observed',
          forceDetectionSyncOnly: true,
          explicitVisiblePair: true,
        },
      ],
      getVisibilityMap: jest.fn(() => ({ B: 'hidden' })),
      recordExplicitVisiblePair: jest.fn(() => true),
      overrideMatchesVisibility: jest.fn(() => true),
      moduleId: 'pf2e-visioner',
    });

    expect(plan.uniqueUpdateCount).toBe(1);
    expect(plan.dirtyObservers).toEqual([]);
    expect(plan.observerMaps.size).toBe(0);
    expect(plan.appliedUpdates).toEqual([
      expect.objectContaining({ visibility: 'observed', forceDetectionSyncOnly: true }),
    ]);
  });

  test('resolves visibility against current map before persisting movement updates', () => {
    const observerA = observer('A');
    const targetB = target('B');
    const recordExplicitVisiblePair = jest.fn(() => false);
    const resolveVisibilityForUpdate = jest.fn(() => 'hidden');

    const plan = buildVisibilityMapApplicationPlan({
      updates: [{ observer: observerA, target: targetB, visibility: 'observed' }],
      getVisibilityMap: jest.fn(() => ({ B: 'hidden' })),
      recordExplicitVisiblePair,
      resolveVisibilityForUpdate,
      overrideMatchesVisibility: jest.fn(() => true),
      moduleId: 'pf2e-visioner',
    });

    expect(resolveVisibilityForUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ visibility: 'observed' }),
      'hidden',
    );
    expect(recordExplicitVisiblePair).toHaveBeenCalledWith(
      expect.objectContaining({ visibility: 'hidden' }),
    );
    expect(plan.uniqueUpdateCount).toBe(0);
    expect(plan.dirtyObservers).toEqual([]);
    expect(plan.observerMaps.get(observerA)).toEqual({ B: 'hidden' });
    expect(plan.appliedUpdates).toEqual([]);
  });

  test('persists visible state when a pending movement resolver vetoes hidden', () => {
    const observerA = observer('A');
    const targetB = target('B');
    const recordExplicitVisiblePair = jest.fn(() => false);
    const resolveVisibilityForUpdate = jest.fn(() => 'concealed');

    const plan = buildVisibilityMapApplicationPlan({
      updates: [{ observer: observerA, target: targetB, visibility: 'hidden' }],
      getVisibilityMap: jest.fn(() => ({ B: 'concealed' })),
      getStoredVisibilityMap: jest.fn(() => ({ B: 'concealed' })),
      recordExplicitVisiblePair,
      resolveVisibilityForUpdate,
      overrideMatchesVisibility: jest.fn(() => true),
      moduleId: 'pf2e-visioner',
    });

    expect(plan.uniqueUpdateCount).toBe(1);
    expect(plan.dirtyObservers).toEqual([observerA]);
    expect(plan.observerMaps.get(observerA)).toEqual({ B: 'concealed' });
    expect(plan.appliedUpdates).toEqual([expect.objectContaining({ visibility: 'concealed' })]);
  });
});
