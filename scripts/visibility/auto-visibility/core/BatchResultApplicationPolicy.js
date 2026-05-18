export function dedupeBatchUpdates(updates = []) {
  const uniqueUpdatesByKey = new Map();

  for (const update of updates) {
    const key = `${update.observer?.document?.id}-${update.target?.document?.id}`;
    uniqueUpdatesByKey.set(key, update);
  }

  return Array.from(uniqueUpdatesByKey.values());
}

function shouldApplyUpdate({
  update,
  moduleId,
  overrideMatchesVisibility,
} = {}) {
  if (update?.forceEphemeralOnly) return false;

  try {
    const observerId = update.observer?.document?.id;
    const targetDocument = update.target?.document;
    if (observerId && targetDocument?.getFlag) {
      const flagKey = `avs-override-from-${observerId}`;
      const overrideData = targetDocument.getFlag(moduleId, flagKey);
      if (overrideData && !overrideMatchesVisibility(overrideData, update.visibility)) {
        return false;
      }
    }
  } catch {
    return true;
  }

  return true;
}

export function buildBatchResultApplicationPlan({
  updates = [],
  getVisibilityMap = () => ({}),
  recordExplicitVisiblePair = () => false,
  overrideMatchesVisibility = null,
  overrideMatchesVisibilityFn = null,
  moduleId = 'pf2e-visioner',
} = {}) {
  let uniqueUpdateCount = 0;
  const observerMaps = new Map();
  const dirtyObserverSet = new Set();
  const matchesOverrideVisibility =
    overrideMatchesVisibilityFn || overrideMatchesVisibility || (() => true);

  for (const update of dedupeBatchUpdates(updates)) {
    if (
      !shouldApplyUpdate({
        update,
        moduleId,
        overrideMatchesVisibility: matchesOverrideVisibility,
      })
    ) {
      continue;
    }

    const observer = update.observer;
    const targetId = update.target?.document?.id;
    if (!observer?.document?.id || !targetId) continue;

    const explicitPairChanged = recordExplicitVisiblePair(update);
    if (update.forceDetectionSyncOnly) {
      if (explicitPairChanged) uniqueUpdateCount++;
      continue;
    }

    if (!observerMaps.has(observer)) {
      observerMaps.set(observer, { ...getVisibilityMap(observer) });
    }

    const visibilityMap = observerMaps.get(observer);
    const from = visibilityMap[targetId] ?? 'observed';
    if (from !== update.visibility) {
      visibilityMap[targetId] = update.visibility;
      dirtyObserverSet.add(observer);
      uniqueUpdateCount++;
    } else if (explicitPairChanged) {
      uniqueUpdateCount++;
    }
  }

  return {
    uniqueUpdateCount,
    observerMaps,
    dirtyObservers: Array.from(dirtyObserverSet),
  };
}

export const buildVisibilityMapApplicationPlan = buildBatchResultApplicationPlan;
