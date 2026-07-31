const MODULE_ID = 'pf2e-visioner';
const PF2E_SYSTEM_ID = 'pf2e';

function getDefaultCurrentSceneId() {
  return globalThis.canvas?.scene?.id ?? null;
}

function sceneIdOf(scene) {
  return scene?.id ?? scene?._id ?? scene?.value?.id ?? scene?.value?._id ?? null;
}

async function loadDefaultAutoVisibility() {
  const { autoVisibility } = await import('../api.js');
  return autoVisibility;
}

async function clearDefaultAvsCaches() {
  const [{ SensePrecomputer }, { VisionAnalyzer }, cacheInvalidation] = await Promise.all([
    import('./SensePrecomputer.js'),
    import('../visibility/auto-visibility/VisionAnalyzer.js'),
    import('../utils/cache-invalidation.js'),
  ]);

  SensePrecomputer?.clear?.();
  VisionAnalyzer?.getInstance?.()?.clearCache?.();
  cacheInvalidation?.invalidateCaches?.(
    cacheInvalidation.CACHE_INVALIDATION_REASONS?.manualClear,
    { reason: 'scene-avs-refresh-flag-change' },
  );
}

async function clearDefaultVisionerVisibility() {
  const [soundwaves, visualEffects, perceptionRefresh] = await Promise.all([
    import('./during-move-soundwave.js'),
    import('./visual-effects.js'),
    import('../helpers/perception-refresh.js'),
  ]);
  const tokens = globalThis.canvas?.tokens?.placeables ?? [];

  soundwaves.clearDuringMoveSoundwaveState?.();
  visualEffects.clearVisionerTokenVisibilityEffects?.(tokens, { forceTokenVisible: false });
  for (const token of tokens) {
    token?.renderFlags?.set?.({
      refreshState: true,
      refreshMesh: true,
      refreshVisibility: true,
    });
    token?.refresh?.();
  }
  perceptionRefresh.scheduleCanvasPerceptionUpdate?.({
    initializeVision: true,
    refreshLighting: true,
    refreshVision: true,
  });
}

function hasChangedPath(changes, path) {
  if (!changes || typeof changes !== 'object') return false;
  const flatPath = path.join('.');
  if (Object.prototype.hasOwnProperty.call(changes, flatPath)) return true;

  let current = changes;
  for (const segment of path) {
    if (!current || typeof current !== 'object') return false;
    if (!Object.prototype.hasOwnProperty.call(current, segment)) return false;
    current = current[segment];
  }
  return true;
}

export function hasDisableAvsFlagChange(changes) {
  return (
    hasChangedPath(changes, ['flags', MODULE_ID, 'disableAVS']) ||
    hasChangedPath(changes, ['flags', MODULE_ID, '-=disableAVS'])
  );
}

export function hasSceneHearingRangeFlagChange(changes) {
  return (
    hasChangedPath(changes, ['hearingRange']) ||
    hasChangedPath(changes, ['value', 'hearingRange']) ||
    hasChangedPath(changes, ['scenes', 'value', 'hearingRange']) ||
    hasChangedPath(changes, ['flags', PF2E_SYSTEM_ID, 'hearingRange']) ||
    hasChangedPath(changes, ['flags', PF2E_SYSTEM_ID, '-=hearingRange'])
  );
}

export function hasSceneTokenVisionChange(changes) {
  return hasChangedPath(changes, ['tokenVision']);
}

export function hasSceneAvsRefreshFlagChange(changes) {
  return (
    hasDisableAvsFlagChange(changes) ||
    hasSceneHearingRangeFlagChange(changes) ||
    hasSceneTokenVisionChange(changes)
  );
}

export async function handleSceneDisableAvsRefresh(
  scene,
  changes,
  {
    getCurrentSceneId = getDefaultCurrentSceneId,
    loadAutoVisibility = loadDefaultAutoVisibility,
    clearCaches = clearDefaultAvsCaches,
    clearVisibility = clearDefaultVisionerVisibility,
    warn = console.warn,
  } = {},
) {
  try {
    if (sceneIdOf(scene) !== getCurrentSceneId()) {
      return { refreshed: false, reason: 'inactive-scene' };
    }

    if (!hasSceneAvsRefreshFlagChange(changes)) {
      return { refreshed: false, reason: 'unchanged' };
    }

    await clearCaches?.();
    if (hasSceneTokenVisionChange(changes) && scene?.tokenVision === false) {
      await clearVisibility?.();
      return { refreshed: true, reason: 'token-vision-disabled' };
    }
    const autoVisibility = await loadAutoVisibility();
    await autoVisibility?.recalculateAll?.(true);
    return { refreshed: true };
  } catch (error) {
    warn('PF2E Visioner | Failed to handle scene visibility config update:', error);
    return { refreshed: false, reason: 'error' };
  }
}
