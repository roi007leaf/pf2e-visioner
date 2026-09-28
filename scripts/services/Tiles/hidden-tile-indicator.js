const COLOR = 0x9b59b6;
const OPACITY = 0.28;

function copyPoint(target, source) {
  target?.set?.(source?.x ?? 0, source?.y ?? 0);
}

function createSprite(pixi, texture) {
  try {
    return new pixi.Sprite({ texture });
  } catch {
    return new pixi.Sprite(texture);
  }
}

function syncSpriteTransform(sprite, mesh, position) {
  copyPoint(sprite.position, position);
  copyPoint(sprite.anchor, mesh.anchor);
  copyPoint(sprite.pivot, mesh.pivot);
  copyPoint(sprite.skew, mesh.skew);
  copyPoint(sprite.scale, mesh.scale);
  sprite.rotation = mesh.rotation ?? 0;
  sprite.visible = true;
  sprite.renderable = true;
}

export function removeHiddenTileIndicator(tile) {
  const indicator = tile?._pvHiddenTileIndicator;
  if (!indicator) return false;
  const outline = indicator._pvOutline;
  outline?.parent?.removeChild?.(outline);
  outline?.filters?.forEach(filter => filter.destroy?.());
  outline?.destroy?.();
  indicator.parent?.removeChild?.(indicator);
  indicator.filters?.forEach(filter => filter.destroy?.());
  indicator.destroy?.();
  delete tile._pvHiddenTileIndicator;
  return true;
}

export function refreshHiddenTileIndicator(tile, {
  show = false,
  pixi = globalThis.PIXI,
  parent,
  outlineFilterClass = globalThis.foundry?.canvas?.rendering?.filters?.OutlineOverlayFilter,
} = {}) {
  const mesh = tile?.mesh;
  const overlayParent = parent ?? globalThis.canvas?.effects?.foreground ?? globalThis.canvas?.effects ?? mesh?.parent;
  if (!show || !mesh?.texture || !overlayParent?.addChild || !pixi?.Sprite) {
    removeHiddenTileIndicator(tile);
    return null;
  }

  let indicator = tile._pvHiddenTileIndicator;
  if (!indicator || indicator.parent !== overlayParent) {
    removeHiddenTileIndicator(tile);
    indicator = createSprite(pixi, mesh.texture);
    indicator.eventMode = 'none';
    indicator._pvTileId = tile.document.id;
    if (pixi.filters?.ColorMatrixFilter) {
      const filter = new pixi.filters.ColorMatrixFilter();
      filter.matrix = [
        0, 0, 0, 0, ((COLOR >> 16) & 0xff) / 255,
        0, 0, 0, 0, ((COLOR >> 8) & 0xff) / 255,
        0, 0, 0, 0, (COLOR & 0xff) / 255,
        0, 0, 0, 1, 0,
      ];
      indicator.filters = [filter];
    }
    overlayParent.addChild(indicator);
    if (outlineFilterClass?.create) {
      const outline = createSprite(pixi, mesh.texture);
      const filter = outlineFilterClass.create({
        outlineColor: [((COLOR >> 16) & 0xff) / 255, ((COLOR >> 8) & 0xff) / 255,
          (COLOR & 0xff) / 255, 1],
        knockout: true,
        wave: false,
      });
      filter.animated = false;
      filter.thickness = 3;
      outline.filters = [filter];
      outline.eventMode = 'none';
      outline._pvTileId = tile.document.id;
      overlayParent.addChild(outline);
      indicator._pvOutline = outline;
    }
    tile._pvHiddenTileIndicator = indicator;
  }

  indicator.texture = mesh.texture;
  const position = overlayParent !== mesh.parent && overlayParent.toLocal && mesh.parent
    ? overlayParent.toLocal(mesh.position, mesh.parent)
    : mesh.position;
  syncSpriteTransform(indicator, mesh, position);
  indicator.tint = indicator.filters?.length ? 0xffffff : COLOR;
  indicator.alpha = OPACITY;
  indicator.zIndex = 1000;
  const outline = indicator._pvOutline;
  if (outline) {
    outline.texture = mesh.texture;
    syncSpriteTransform(outline, mesh, position);
    outline.tint = 0xffffff;
    outline.alpha = 1;
    outline.zIndex = 1001;
  }
  return indicator;
}
