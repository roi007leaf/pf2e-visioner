const controlViewState = (globalThis.__pf2eVisionerMultiLevelControlView ??= {
  sceneId: null,
  levelId: null,
  controlledSceneId: null,
  controlledLevelId: null,
});
controlViewState.controlledSceneId ??= null;
controlViewState.controlledLevelId ??= null;

export function usesCoreMultiLevelSurfaceRendering() {
  const scene = globalThis.canvas?.scene;
  return !!(
    (scene?.levels?.size ?? 0) > 1 &&
    typeof scene.getSurfaces === 'function' &&
    typeof scene.testSurfaceCollision === 'function'
  );
}

function tokenLevelId(token) {
  return token?.document?._source?.level ?? token?.document?.level ?? null;
}

function tokenMovementElevation(token) {
  try {
    const elevation = token?.document?.getMovementOrigin?.()?.elevation;
    if (Number.isFinite(Number(elevation))) return Number(elevation);
  } catch {
    /* fall through to document elevation */
  }
  const elevation = token?.document?.elevation ?? token?.elevation;
  return Number.isFinite(Number(elevation)) ? Number(elevation) : null;
}

function tokenOcclusionPoints(token, elevation) {
  try {
    const points = Array.from(token?.document?.getOcclusionTestPoints?.() ?? []);
    if (points.length) return points;
  } catch {
    /* fall through to token center */
  }
  const center = token?.center;
  return center ? [{ x: center.x, y: center.y, elevation }] : [];
}

function tokenIsCulledForLevel(token, levelId) {
  if (!token || !levelId || tokenLevelId(token) === levelId) return false;

  if (globalThis.canvas?.level?.id === levelId && typeof token._testCulled === 'function') {
    try {
      return !!token._testCulled();
    } catch {
      /* fall through to the equivalent level-specific Core test */
    }
  }

  const scene = globalThis.canvas?.scene;
  const level = scene?.levels?.get?.(levelId);
  const tokenElevation = tokenMovementElevation(token);
  const bottom = Number(level?.elevation?.bottom);
  const top = Number(level?.elevation?.top);
  if (!level || tokenElevation === null || !Number.isFinite(bottom) || !Number.isFinite(top)) {
    return true;
  }

  let minElevation;
  let maxElevation;
  if (tokenElevation < bottom) {
    minElevation = Math.nextUp?.(tokenElevation) ?? tokenElevation + Number.EPSILON;
    maxElevation = bottom;
  } else if (tokenElevation >= top) {
    minElevation = top;
    maxElevation = tokenElevation;
  } else {
    return false;
  }

  let surfaces;
  try {
    surfaces = scene.getSurfaces({ level: levelId, culling: true });
  } catch {
    return true;
  }
  if (!Array.isArray(surfaces)) return true;

  const relevantSurfaceTrees = [];
  for (const surface of surfaces) {
    const elevation = Number(surface?.elevation);
    if (!Number.isFinite(elevation)) continue;
    if (elevation > maxElevation) break;
    if (elevation < minElevation) continue;
    const polygonTree = surface?.region?.polygonTree;
    if (!polygonTree?.testPoint) continue;
    if (
      token.bounds &&
      typeof polygonTree.bounds?.intersects === 'function' &&
      !polygonTree.bounds.intersects(token.bounds)
    ) {
      continue;
    }
    relevantSurfaceTrees.push(polygonTree);
  }
  if (!relevantSurfaceTrees.length) return false;

  const points = tokenOcclusionPoints(token, tokenElevation);
  if (!points.length) return true;
  return points.every((point) => relevantSurfaceTrees.some((tree) => tree.testPoint(point)));
}

export function tokenIsOutsideControlledLevelCullingSurface(token) {
  const scene = globalThis.canvas?.scene;
  const controlledLevelId = controlViewState.controlledLevelId;
  const levelId = tokenLevelId(token);
  if (
    !scene ||
    (globalThis.canvas?.tokens?.controlled?.length ?? 0) === 0 ||
    controlViewState.controlledSceneId !== (scene.id ?? null) ||
    !controlledLevelId ||
    !levelId ||
    levelId === controlledLevelId
  ) {
    return false;
  }
  return !tokenIsCulledForLevel(token, controlledLevelId);
}

function tokenRenderSurfaces(token) {
  const surfaces = [
    token,
    token?.mesh,
    token?.detectionFilterMesh,
    token?.effects,
    token?.nameplate,
    token?.bars,
    token?.tooltip,
    token?.levelIndicator,
    token?.targetArrows,
    token?.targetPips,
    token?.turnMarker,
    token?.turnMarker?.mesh,
  ];
  return [...new Set(surfaces.filter(Boolean))];
}

function hideTransitionSurfaces(entries) {
  for (const entry of entries) {
    if (entry.hasVisible) entry.surface.visible = false;
    if (entry.hasRenderable) entry.surface.renderable = false;
  }
}

export function suppressOtherLevelTokenRenderingBeforeControl(token, options = {}) {
  if (options?.releaseOthers === false || !usesCoreMultiLevelSurfaceRendering()) return null;

  const scene = globalThis.canvas?.scene;
  const targetLevelId = tokenLevelId(token);
  if (!scene || !targetLevelId || !scene.levels?.has?.(targetLevelId)) return null;

  const previousControlledSceneId = controlViewState.controlledSceneId;
  const previousControlledLevelId = controlViewState.controlledLevelId;
  controlViewState.controlledSceneId = scene.id ?? null;
  controlViewState.controlledLevelId = targetLevelId;

  const entries = [];
  for (const other of globalThis.canvas?.tokens?.placeables ?? []) {
    const otherLevelId = tokenLevelId(other);
    if (
      other === token ||
      !otherLevelId ||
      otherLevelId === targetLevelId ||
      !tokenIsCulledForLevel(other, targetLevelId)
    )
      continue;
    for (const surface of tokenRenderSurfaces(other)) {
      const hasVisible = 'visible' in surface;
      const hasRenderable = 'renderable' in surface;
      if (!hasVisible && !hasRenderable) continue;
      entries.push({
        surface,
        hasVisible,
        hasRenderable,
        visible: surface.visible,
        renderable: surface.renderable,
      });
    }
  }

  hideTransitionSurfaces(entries);
  return {
    entries,
    targetLevelId,
    previousControlledSceneId,
    previousControlledLevelId,
  };
}

export function enforceControlledLevelTokenRendering(token) {
  const scene = globalThis.canvas?.scene;
  if (
    !scene ||
    (globalThis.canvas?.tokens?.controlled?.length ?? 0) === 0 ||
    controlViewState.controlledSceneId !== (scene.id ?? null) ||
    !controlViewState.controlledLevelId
  ) {
    return false;
  }

  const levelId = tokenLevelId(token);
  if (
    !levelId ||
    levelId === controlViewState.controlledLevelId ||
    !tokenIsCulledForLevel(token, controlViewState.controlledLevelId)
  )
    return false;

  const entries = tokenRenderSurfaces(token).map((surface) => ({
    surface,
    hasVisible: 'visible' in surface,
    hasRenderable: 'renderable' in surface,
  }));
  hideTransitionSurfaces(entries);
  return true;
}

export function reassertOtherLevelTokenRenderingSuppression(transition) {
  if (!transition?.entries?.length) return false;
  hideTransitionSurfaces(transition.entries);
  return true;
}

export function wrapMultiLevelDragPreviewInitializeSources(wrapped, ...args) {
  const result = wrapped(...args);
  const original = this?._original;
  if (
    this?._previewType !== 'dragging' ||
    !original?.controlled ||
    !usesCoreMultiLevelSurfaceRendering()
  ) {
    return result;
  }

  try {
    // Core gives a drag clone the same source id as its original token. Initializing that clone
    // replaces the active vision source and exposes a no-source frame while multi-level textures
    // are recomputed. Keep the clone's LOS object for drag prediction, but keep the stable original
    // source registered until Core commits the drop and initializes it at the new position.
    if (original.vision && original._isVisionSource?.()) original.vision.add?.();
  } catch {
    /* keep Core's drag-preview source when the original cannot be restored */
  }
  return result;
}

export function restoreOtherLevelTokenRenderingSuppression(transition) {
  if (!transition) return false;
  controlViewState.controlledSceneId = transition.previousControlledSceneId ?? null;
  controlViewState.controlledLevelId = transition.previousControlledLevelId ?? null;
  if (!transition.entries?.length) return false;
  for (const entry of transition.entries) {
    if (entry.hasVisible) entry.surface.visible = entry.visible;
    if (entry.hasRenderable) entry.surface.renderable = entry.renderable;
  }
  return true;
}

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
  controlViewState.controlledSceneId = null;
  controlViewState.controlledLevelId = null;

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
