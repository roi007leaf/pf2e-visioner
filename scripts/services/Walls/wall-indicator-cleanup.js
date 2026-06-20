const DEFAULT_DESTROY_OPTIONS = { children: true, texture: true, baseTexture: true };

export function getWallIndicatorLayers(canvasRef = globalThis.canvas) {
  return [
    canvasRef?.effects?.foreground,
    canvasRef?.effects,
    canvasRef?.walls,
    canvasRef?.interface,
    canvasRef?.stage,
  ].filter(Boolean);
}

export function displayObjectBelongsToWall(displayObject, wallId) {
  return (
    displayObject?._pvWallId === wallId ||
    displayObject?._wallDocumentId === wallId ||
    displayObject?._associatedWallId === wallId
  );
}

export function isWallIndicatorDisplayObject(displayObject, PIXIRef = globalThis.PIXI) {
  return !!(
    displayObject?._pvWallId ||
    displayObject?._wallDocumentId ||
    displayObject?._associatedWallId ||
    displayObject?._pvIndicatorType === 'wall' ||
    displayObject?.name?.includes?.('wall-indicator') ||
    (displayObject?._tooltip && displayObject?._coverText) ||
    (PIXIRef?.Text &&
      displayObject instanceof PIXIRef.Text &&
      displayObject.style?.stroke === 0x000000 &&
      displayObject.style?.strokeThickness >= 3)
  );
}

export function removeDisplayObject(
  displayObject,
  { destroyOptions = DEFAULT_DESTROY_OPTIONS } = {},
) {
  try {
    displayObject?.parent?.removeChild?.(displayObject);
    displayObject?.destroy?.(destroyOptions);
    return true;
  } catch (_) {
    return false;
  }
}

export function removeMatchingDisplayObjects(container, predicate) {
  if (!container?.children) return 0;

  let removed = 0;
  const toRemove = [];
  for (const child of container.children) {
    try {
      if (predicate(child)) toRemove.push(child);
      if (child.children?.length > 0) removed += removeMatchingDisplayObjects(child, predicate);
    } catch (_) {}
  }

  for (const displayObject of toRemove) {
    if (removeDisplayObject(displayObject)) removed += 1;
  }

  return removed;
}

export function removeWallIndicatorsForWall(canvasRef, wallId) {
  let removed = 0;
  for (const layer of getWallIndicatorLayers(canvasRef)) {
    removed += removeMatchingDisplayObjects(layer, (child) =>
      displayObjectBelongsToWall(child, wallId),
    );
  }
  return removed;
}

export function removeAllWallIndicatorDisplayObjects(
  canvasRef = globalThis.canvas,
  PIXIRef = globalThis.PIXI,
) {
  let removed = 0;
  for (const layer of getWallIndicatorLayers(canvasRef)) {
    removed += removeMatchingDisplayObjects(layer, (child) =>
      isWallIndicatorDisplayObject(child, PIXIRef),
    );
  }
  return removed;
}

export function cleanupDeletedWallReferences(walls, wallId) {
  for (const wall of walls || []) {
    try {
      cleanupWallHiddenIndicatorReferences(wall, (displayObject) =>
        displayObjectBelongsToWall(displayObject, wallId),
      );

      if (wall._pvAnimationActive && (wall.id === wallId || wall.document?.id === wallId)) {
        wall._pvAnimationActive = false;
      }
    } catch (_) {}
  }
}

export function cleanupWallHiddenIndicatorReferences(wall, shouldRemove = () => true) {
  if (!wall) return;

  if (wall._pvHiddenIndicator && shouldRemove(wall._pvHiddenIndicator)) {
    removeDisplayObject(wall._pvHiddenIndicator);
    wall._pvHiddenIndicator = null;
  }

  if (Array.isArray(wall._pvSeeThroughMasks)) {
    wall._pvSeeThroughMasks = wall._pvSeeThroughMasks.filter((mask) => {
      if (!shouldRemove(mask)) return true;
      removeDisplayObject(mask);
      return false;
    });
  }
}

export function cleanupAllWallReferences(walls) {
  for (const wall of walls || []) {
    try {
      cleanupWallHiddenIndicatorReferences(wall);

      if (wall._pvCoverIcon) {
        removeDisplayObject(wall._pvCoverIcon);
        delete wall._pvCoverIcon;
      }

      if (wall._pvIdLabel) {
        removeDisplayObject(wall._pvIdLabel);
        delete wall._pvIdLabel;
      }

      if (wall._pvAnimationActive) wall._pvAnimationActive = false;
    } catch (_) {}
  }
}

export function buildTokenWallFlagCleanupUpdates(tokens, wallId, moduleId) {
  const updates = [];
  for (const token of tokens || []) {
    try {
      const wallMap = token.document?.getFlag?.(moduleId, 'walls') || {};
      if (!wallMap[wallId]) continue;

      const nextWallMap = { ...wallMap };
      delete nextWallMap[wallId];
      updates.push({
        _id: token.id,
        [`flags.${moduleId}.walls`]: nextWallMap,
      });
    } catch (_) {}
  }
  return updates;
}

export function refreshCanvasEffects(canvasRef = globalThis.canvas) {
  try {
    canvasRef?.perception?.update?.({
      refreshLighting: false,
      refreshVision: false,
      refreshOcclusion: false,
      refreshEffects: true,
    });
  } catch (_) {}
}
