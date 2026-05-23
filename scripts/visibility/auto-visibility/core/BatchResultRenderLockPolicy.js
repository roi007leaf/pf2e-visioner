const REVEALED_VISIBILITY_STATES = new Set(['observed', 'concealed']);
const HIDDEN_VISIBILITY_STATES = new Set(['hidden', 'undetected', 'unnoticed']);

function toIdSet(ids = []) {
  if (ids instanceof Set) return ids;
  return new Set((Array.isArray(ids) ? ids : [ids]).filter(Boolean));
}

function pushUniqueId(id, seenIds, targetIds) {
  if (!id || seenIds.has(id)) return;
  seenIds.add(id);
  targetIds.push(id);
}

export function buildBatchResultRenderLockPlan({
  updates = [],
  controlledObserverIds = [],
} = {}) {
  const controlledIds = toIdSet(controlledObserverIds);
  const forceVisibilityUpdates = [];
  const revealTargetTokenIds = [];
  const hiddenTargetTokenIds = [];
  const seenRevealTargetIds = new Set();
  const seenHiddenTargetIds = new Set();

  for (const update of updates || []) {
    const observerId = update?.observer?.document?.id;
    if (observerId && controlledIds.has(observerId)) {
      forceVisibilityUpdates.push(update);
    }

    const targetId = update?.target?.document?.id;
    if (REVEALED_VISIBILITY_STATES.has(update?.visibility)) {
      pushUniqueId(targetId, seenRevealTargetIds, revealTargetTokenIds);
    } else if (HIDDEN_VISIBILITY_STATES.has(update?.visibility)) {
      pushUniqueId(targetId, seenHiddenTargetIds, hiddenTargetTokenIds);
    }
  }

  const hasForceVisibilityWork = forceVisibilityUpdates.length > 0;
  const hasRevealRefreshWork = revealTargetTokenIds.length > 0;
  const hasHiddenRefreshWork = hiddenTargetTokenIds.length > 0;

  return {
    forceVisibilityUpdates,
    revealTargetTokenIds,
    hiddenTargetTokenIds,
    hasForceVisibilityWork,
    hasRevealRefreshWork,
    hasHiddenRefreshWork,
    hasWork: hasForceVisibilityWork || hasRevealRefreshWork || hasHiddenRefreshWork,
  };
}
