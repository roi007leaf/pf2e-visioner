export function buildBatchEffectSyncPlan({
  updates = [],
  isIgnoredTarget = () => false,
} = {}) {
  const syncedPairs = new Set();
  const updatesByObserver = new Map();

  for (const update of updates) {
    const observerId = update.observer?.document?.id;
    const targetId = update.target?.document?.id;

    if (!observerId || !targetId) continue;
    if (isIgnoredTarget(update.target)) continue;

    const pairKey = `${observerId}-${targetId}`;
    if (syncedPairs.has(pairKey)) continue;
    syncedPairs.add(pairKey);

    if (!updatesByObserver.has(observerId)) {
      updatesByObserver.set(observerId, { observer: update.observer, targets: [] });
    }

    updatesByObserver.get(observerId).targets.push({
      target: update.target,
      state: update.visibility,
    });
  }

  return Array.from(updatesByObserver.values());
}
