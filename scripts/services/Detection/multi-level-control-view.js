import { usesCoreMultiLevelSurfaceRendering } from './current-view-hard-hide.js';

const controlViewState = (globalThis.__pf2eVisionerMultiLevelControlView ??= {
  sceneId: null,
  levelId: null,
});

export function captureMultiLevelViewBeforeControl(token) {
  if (token?.controlled || (globalThis.canvas?.tokens?.controlled?.length ?? 0) > 0) return;
  if (!usesCoreMultiLevelSurfaceRendering()) return;

  const sceneId = globalThis.canvas?.scene?.id ?? null;
  const levelId = globalThis.canvas?.level?.id ?? null;
  if (!sceneId || !levelId) return;
  if (controlViewState.sceneId === sceneId && controlViewState.levelId) return;

  controlViewState.sceneId = sceneId;
  controlViewState.levelId = levelId;
}

export function restoreMultiLevelViewAfterControl() {
  const sceneId = controlViewState.sceneId;
  const levelId = controlViewState.levelId;
  controlViewState.sceneId = null;
  controlViewState.levelId = null;

  const scene = globalThis.canvas?.scene;
  if (
    !sceneId ||
    !levelId ||
    scene?.id !== sceneId ||
    globalThis.canvas?.level?.id === levelId ||
    !usesCoreMultiLevelSurfaceRendering() ||
    typeof scene.view !== 'function'
  )
    return null;

  try {
    return scene.view({ level: levelId });
  } catch {
    return null;
  }
}
