import { buildBatchResultRenderLockPlan } from '../../../scripts/visibility/auto-visibility/core/BatchResultRenderLockPolicy.js';

function update({
  observerId = 'observer',
  targetId = 'target',
  visibility = 'hidden',
} = {}) {
  return {
    observer: { document: { id: observerId } },
    target: { document: { id: targetId } },
    visibility,
  };
}

describe('BatchResultRenderLockPolicy', () => {
  test('plans only controlled-observer force work and dedupes target refresh work', () => {
    const controlledHidden = update({ observerId: 'controlled', targetId: 'hidden-target', visibility: 'hidden' });
    const uncontrolledHidden = update({ observerId: 'other', targetId: 'hidden-target', visibility: 'undetected' });
    const revealed = update({ observerId: 'other', targetId: 'revealed-target', visibility: 'observed' });
    const duplicateReveal = update({ observerId: 'controlled', targetId: 'revealed-target', visibility: 'concealed' });
    const ignored = update({ observerId: 'controlled', targetId: 'ignored-target', visibility: 'visible' });

    expect(
      buildBatchResultRenderLockPlan({
        updates: [controlledHidden, uncontrolledHidden, revealed, duplicateReveal, ignored],
        controlledObserverIds: ['controlled'],
      }),
    ).toEqual({
      forceVisibilityUpdates: [controlledHidden, duplicateReveal, ignored],
      revealTargetTokenIds: ['revealed-target'],
      hiddenTargetTokenIds: ['hidden-target'],
      hasForceVisibilityWork: true,
      hasRevealRefreshWork: true,
      hasHiddenRefreshWork: true,
      hasWork: true,
    });
  });

  test('returns empty plan when updates cannot affect render locks', () => {
    expect(
      buildBatchResultRenderLockPlan({
        updates: [update({ visibility: 'visible' })],
        controlledObserverIds: [],
      }),
    ).toEqual({
      forceVisibilityUpdates: [],
      revealTargetTokenIds: [],
      hiddenTargetTokenIds: [],
      hasForceVisibilityWork: false,
      hasRevealRefreshWork: false,
      hasHiddenRefreshWork: false,
      hasWork: false,
    });
  });
});
