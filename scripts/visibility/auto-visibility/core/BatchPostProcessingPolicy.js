export function shouldSuppressVisibilityMapRender(postBatchPerceptionSuppression = null) {
  return postBatchPerceptionSuppression?.reason === 'door-state-change';
}

function getDoorRevealEffectUpdates(updates = []) {
  return updates.filter(
    (update) => update?.visibility === 'observed' || update?.visibility === 'concealed',
  );
}

export function buildBatchPostProcessingPlan({
  isMovementBatch = false,
  updates = [],
  uniqueUpdateCount = 0,
  postBatchPerceptionSuppression = null,
} = {}) {
  const hasVisibilityUpdates = uniqueUpdateCount > 0;
  const isDoorTriggeredBatch = shouldSuppressVisibilityMapRender(postBatchPerceptionSuppression);

  if (!hasVisibilityUpdates) {
    return {
      hasVisibilityUpdates: false,
      shouldSyncEffects: false,
      effectUpdates: [],
      shouldRefreshPerception: false,
      shouldMarkPerceptionRefreshed: false,
    };
  }

  const effectUpdates = isDoorTriggeredBatch ? getDoorRevealEffectUpdates(updates) : updates;
  const shouldRefreshPerception =
    !isMovementBatch &&
    (!isDoorTriggeredBatch || postBatchPerceptionSuppression?.perceptionRefreshed !== true);

  return {
    hasVisibilityUpdates: true,
    shouldSyncEffects: effectUpdates.length > 0,
    effectUpdates,
    shouldRefreshPerception,
    shouldMarkPerceptionRefreshed: isDoorTriggeredBatch && shouldRefreshPerception,
  };
}
