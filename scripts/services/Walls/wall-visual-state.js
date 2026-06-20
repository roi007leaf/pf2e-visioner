export function resolveControlledWallObserver({ observerId = null, tokensLayer } = {}) {
  let observer = null;
  try {
    if (observerId) observer = tokensLayer?.get?.(observerId) || null;
    if (!observer) observer = tokensLayer?.controlled?.[0] || null;
  } catch (_) {
    observer = null;
  }

  const controlledTokens = tokensLayer?.controlled || [];
  if (observer && !controlledTokens.includes(observer)) {
    return { observer, allowed: false };
  }

  return { observer, allowed: true };
}

export function resolveStrictControlledWallObserver({ observerId = null, tokensLayer } = {}) {
  try {
    const controlledToken = tokensLayer?.controlled?.[0] || null;
    if (!observerId) return controlledToken;

    const providedToken = tokensLayer?.get?.(observerId) || null;
    return controlledToken && providedToken?.id === controlledToken.id ? providedToken : null;
  } catch (_) {
    return null;
  }
}

export function controlledTokenCanSeeWall(controlledToken, wallId, user, moduleId) {
  try {
    if (!controlledToken?.document?.testUserPermission?.(user, 'OWNER')) return false;
    const tokenWallFlags = controlledToken.document?.getFlag?.(moduleId, 'walls') || {};
    return tokenWallFlags[wallId] === 'observed';
  } catch (_) {
    return false;
  }
}

export function getWallMapForObserver(observer, moduleId) {
  try {
    return observer?.document?.getFlag?.(moduleId, 'walls') || {};
  } catch (_) {
    return {};
  }
}

export function getObservedWallIds(wallMap) {
  return new Set(
    Object.entries(wallMap || {})
      .filter(([, state]) => state === 'observed')
      .map(([id]) => id),
  );
}

export function expandObservedWallIds({ observedWallIds, walls, getConnectedWallDocsBySourceId }) {
  const expanded = new Set(observedWallIds || []);
  if (typeof getConnectedWallDocsBySourceId !== 'function') return expanded;

  for (const wall of walls || []) {
    const id = wall?.document?.id;
    if (!id || !observedWallIds.has(id)) continue;
    const connectedDocs = getConnectedWallDocsBySourceId(id) || [];
    for (const doc of connectedDocs) {
      if (doc?.id) expanded.add(doc.id);
    }
  }

  return expanded;
}

export function isHiddenWallDocument(document, moduleId) {
  try {
    return !!document?.getFlag?.(moduleId, 'hiddenWall');
  } catch (_) {
    return false;
  }
}

export function buildOriginalSightRestoreUpdate(document, moduleId) {
  try {
    const originalSight = document?.getFlag?.(moduleId, 'originalSight');
    if (originalSight === undefined || originalSight === null || document.sight === originalSight) {
      return null;
    }

    return {
      _id: document.id,
      sight: originalSight,
      [`flags.${moduleId}.originalSight`]: null,
    };
  } catch (_) {
    return null;
  }
}

export function getHiddenIndicatorHalf(scene, moduleId, fallback = 10) {
  try {
    const flagValue = Number(scene?.getFlag?.(moduleId, 'hiddenIndicatorHalf'));
    return Number.isFinite(flagValue) && flagValue > 0 ? flagValue : fallback;
  } catch (_) {
    return fallback;
  }
}
