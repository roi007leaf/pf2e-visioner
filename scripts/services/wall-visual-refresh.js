function getDefaultControlledTokens() {
  return globalThis.canvas?.tokens?.controlled || [];
}

function getDefaultRemainingWallCount() {
  return globalThis.canvas?.walls?.placeables?.length || 0;
}

async function loadDefaultVisualEffects() {
  return import('./visual-effects.js');
}

async function loadDefaultOptimizedVisualEffects() {
  return import('./optimized-visual-effects.js');
}

export function getControlledWallVisualObserverId(controlledTokens = getDefaultControlledTokens()) {
  return controlledTokens?.[0]?.id || null;
}

export async function refreshWallVisualsForObserverId(
  observerId,
  {
    loadVisualEffects = loadDefaultVisualEffects,
  } = {},
) {
  const { updateWallVisuals } = await loadVisualEffects();
  await updateWallVisuals(observerId ?? null);
  return { observerId: observerId ?? null };
}

export async function refreshWallVisualsForControlledToken({
  getControlledTokens = getDefaultControlledTokens,
  loadVisualEffects = loadDefaultVisualEffects,
} = {}) {
  const observerId = getControlledWallVisualObserverId(getControlledTokens());
  return refreshWallVisualsForObserverId(observerId, { loadVisualEffects });
}

export async function refreshOptimizedWallVisualsForObserverId(
  observerId,
  {
    loadVisualEffects = loadDefaultOptimizedVisualEffects,
  } = {},
) {
  return refreshWallVisualsForObserverId(observerId, { loadVisualEffects });
}

export async function cleanupDeletedWallVisualsAndRefresh(
  wallDocument,
  {
    getRemainingWallCount = getDefaultRemainingWallCount,
    getControlledTokens = getDefaultControlledTokens,
    loadVisualEffects = loadDefaultVisualEffects,
  } = {},
) {
  const { cleanupDeletedWallVisuals, cleanupAllWallIndicators, updateWallVisuals } =
    await loadVisualEffects();

  await cleanupDeletedWallVisuals(wallDocument);

  const remainingWalls = getRemainingWallCount();
  if (remainingWalls <= 2) {
    await cleanupAllWallIndicators();
  }

  const observerId = getControlledWallVisualObserverId(getControlledTokens());
  await updateWallVisuals(observerId);

  return {
    observerId,
    massCleanup: remainingWalls <= 2,
  };
}
