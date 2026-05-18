const MODULE_ID = 'pf2e-visioner';

function getDefaultCurrentSceneId() {
  return globalThis.canvas?.scene?.id ?? null;
}

async function loadDefaultAutoVisibility() {
  const { autoVisibility } = await import('../api.js');
  return autoVisibility;
}

export function hasDisableAvsFlagChange(changes) {
  return changes?.flags?.[MODULE_ID]?.disableAVS !== undefined;
}

export async function handleSceneDisableAvsRefresh(
  scene,
  changes,
  {
    getCurrentSceneId = getDefaultCurrentSceneId,
    loadAutoVisibility = loadDefaultAutoVisibility,
    warn = console.warn,
  } = {},
) {
  try {
    if (scene?.id !== getCurrentSceneId()) {
      return { refreshed: false, reason: 'inactive-scene' };
    }

    if (!hasDisableAvsFlagChange(changes)) {
      return { refreshed: false, reason: 'unchanged' };
    }

    const autoVisibility = await loadAutoVisibility();
    await autoVisibility?.recalculateAll?.(true);
    return { refreshed: true };
  } catch (error) {
    warn('PF2E Visioner | Failed to handle scene update for disableAVS:', error);
    return { refreshed: false, reason: 'error' };
  }
}
