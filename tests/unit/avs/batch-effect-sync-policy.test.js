import { buildBatchEffectSyncPlan } from '../../../scripts/visibility/auto-visibility/core/BatchEffectSyncPolicy.js';

function token(id, extras = {}) {
  return {
    actor: {},
    document: { id },
    ...extras,
  };
}

function update(observer, target, visibility) {
  return { observer, target, visibility };
}

describe('BatchEffectSyncPolicy', () => {
  test('groups effect sync targets by observer', () => {
    const observerA = token('A');
    const observerB = token('B');
    const targetC = token('C');
    const targetD = token('D');

    const plan = buildBatchEffectSyncPlan({
      updates: [
        update(observerA, targetC, 'hidden'),
        update(observerA, targetD, 'observed'),
        update(observerB, targetC, 'concealed'),
      ],
    });

    expect(plan).toEqual([
      {
        observer: observerA,
        targets: [
          { target: targetC, state: 'hidden' },
          { target: targetD, state: 'observed' },
        ],
      },
      {
        observer: observerB,
        targets: [{ target: targetC, state: 'concealed' }],
      },
    ]);
  });

  test('skips invalid pairs, ignored targets, and duplicate observer-target pairs', () => {
    const observerA = token('A');
    const targetB = token('B');
    const ignoredTarget = token('ignored');

    const plan = buildBatchEffectSyncPlan({
      updates: [
        update(observerA, null, 'hidden'),
        update(null, targetB, 'hidden'),
        update(observerA, ignoredTarget, 'hidden'),
        update(observerA, targetB, 'hidden'),
        update(observerA, targetB, 'observed'),
      ],
      isIgnoredTarget: (target) => target === ignoredTarget,
    });

    expect(plan).toEqual([
      {
        observer: observerA,
        targets: [{ target: targetB, state: 'hidden' }],
      },
    ]);
  });

  test('carries profile metadata into effect sync targets', () => {
    const observerA = token('A');
    const targetB = token('B');
    const profileMetadata = {
      visibilityReplacementSource: 'blind-fight-adjacent',
      visibilityReplacementOriginalState: 'undetected',
    };

    const plan = buildBatchEffectSyncPlan({
      updates: [{ ...update(observerA, targetB, 'hidden'), profileMetadata }],
    });

    expect(plan).toEqual([
      {
        observer: observerA,
        targets: [{ target: targetB, state: 'hidden', profileMetadata }],
      },
    ]);
  });
});
