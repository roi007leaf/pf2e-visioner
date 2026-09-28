import {
  refreshHiddenTileIndicator,
  removeHiddenTileIndicator,
} from '../../../scripts/services/Tiles/hidden-tile-indicator.js';

function point() {
  return { set: jest.fn() };
}

function sprite() {
  return {
    position: point(),
    anchor: point(),
    pivot: point(),
    skew: point(),
    scale: point(),
    destroy: jest.fn(),
  };
}

function parentObject() {
  return {
    addChild: jest.fn(function addChild(child) { child.parent = this; }),
    removeChild: jest.fn(function removeChild(child) { child.parent = null; }),
  };
}

test('observed tile tint follows drawn mesh and its transparent image perimeter', () => {
  const parent = parentObject();
  const texture = { id: 'transparent-cutout' };
  const mesh = {
    parent,
    texture,
    position: { x: 123, y: 234 },
    anchor: { x: 0.5, y: 0.5 },
    pivot: { x: 1, y: 2 },
    skew: { x: 0, y: 0 },
    scale: { x: 1.5, y: 2 },
    rotation: 0.4,
    zIndex: 10,
    elevation: 25,
    sortLayer: 500,
    sort: 2,
  };
  const pixi = { Sprite: jest.fn(sprite) };
  const tile = { document: { id: 'tile-1', x: 10, y: 20, width: 40, height: 20 }, mesh };
  const tint = refreshHiddenTileIndicator(tile, { show: true, pixi });

  expect(pixi.Sprite).toHaveBeenCalledWith({ texture });
  expect(parent.addChild).toHaveBeenCalledWith(tint);
  expect(tint.position.set).toHaveBeenCalledWith(123, 234);
  expect(tint.anchor.set).toHaveBeenCalledWith(0.5, 0.5);
  expect(tint.pivot.set).toHaveBeenCalledWith(1, 2);
  expect(tint.scale.set).toHaveBeenCalledWith(1.5, 2);
  expect(tint.rotation).toBe(0.4);
  expect(tint.tint).toBe(0x9b59b6);
  expect(tint.alpha).toBeCloseTo(0.28);
  expect(tint.zIndex).toBe(1000);
  expect(tint.texture).toBe(texture);
  expect(tint.drawPolygon).toBeUndefined();

  mesh.position.x = 321;
  mesh.texture = { id: 'changed-art' };
  expect(refreshHiddenTileIndicator(tile, { show: true, pixi })).toBe(tint);
  expect(tint.position.set).toHaveBeenLastCalledWith(321, 234);
  expect(tint.texture).toBe(mesh.texture);
  expect(pixi.Sprite).toHaveBeenCalledTimes(1);

  expect(removeHiddenTileIndicator(tile)).toBe(true);
  expect(parent.removeChild).toHaveBeenCalledWith(tint);
  expect(tint.destroy).toHaveBeenCalled();
  expect(tile._pvHiddenTileIndicator).toBeUndefined();
});

test('hidden tile removes its tint', () => {
  const parent = parentObject();
  const tile = {
    document: { id: 'tile-1' },
    mesh: { parent, texture: { id: 'art' } },
  };
  const pixi = { Sprite: jest.fn(sprite) };
  const tint = refreshHiddenTileIndicator(tile, { show: true, pixi });
  expect(refreshHiddenTileIndicator(tile, { show: false, pixi })).toBeNull();
  expect(parent.removeChild).toHaveBeenCalledWith(tint);
});

test('tint renders above primary tile cache at matching scene position', () => {
  const meshParent = parentObject();
  const overlayParent = parentObject();
  overlayParent.toLocal = jest.fn(({ x, y }, from) => {
    expect(from).toBe(meshParent);
    return { x: x + 8, y: y - 12 };
  });
  const tile = {
    document: { id: 'tile-1' },
    mesh: {
      parent: meshParent,
      texture: { id: 'cutout' },
      position: { x: 123, y: 234 },
      scale: { x: 1, y: 1 },
    },
  };
  const pixi = { Sprite: jest.fn(sprite) };
  const originalEffects = canvas.effects;
  try {
    canvas.effects = { foreground: overlayParent };
    const tint = refreshHiddenTileIndicator(tile, { show: true, pixi });
    expect(overlayParent.addChild).toHaveBeenCalledWith(tint);
    expect(meshParent.addChild).not.toHaveBeenCalled();
    expect(tint.position.set).toHaveBeenCalledWith(131, 222);
  } finally {
    canvas.effects = originalEffects;
  }
});

test('purple silhouette replaces RGB while preserving texture alpha', () => {
  const parent = parentObject();
  const filter = { destroy: jest.fn() };
  const pixi = {
    Sprite: jest.fn(sprite),
    filters: { ColorMatrixFilter: jest.fn(() => filter) },
  };
  const tile = {
    document: { id: 'tile-1' },
    mesh: { parent, texture: { id: 'cutout' }, position: { x: 0, y: 0 } },
  };
  const tint = refreshHiddenTileIndicator(tile, { show: true, pixi });
  expect(tint.filters).toEqual([filter]);
  expect(filter.matrix).toEqual([
    0, 0, 0, 0, 0x9b / 255,
    0, 0, 0, 0, 0x59 / 255,
    0, 0, 0, 0, 0xb6 / 255,
    0, 0, 0, 1, 0,
  ]);
  expect(tint.tint).toBe(0xffffff);
  removeHiddenTileIndicator(tile);
  expect(filter.destroy).toHaveBeenCalled();
});

test('outline follows same texture edge and transform as purple fill', () => {
  const parent = parentObject();
  const texture = { id: 'cutout' };
  const mesh = {
    parent,
    texture,
    position: { x: 15, y: 27 },
    anchor: { x: 0.5, y: 0.5 },
    scale: { x: 2, y: 1 },
    rotation: 0.2,
  };
  const filter = { destroy: jest.fn() };
  const outlineFilterClass = { create: jest.fn(() => filter) };
  const tile = { document: { id: 'tile-1' }, mesh };
  const pixi = { Sprite: jest.fn(sprite) };

  const fill = refreshHiddenTileIndicator(tile, { show: true, pixi, outlineFilterClass });
  const outline = fill._pvOutline;
  expect(outline).toBeDefined();
  expect(outlineFilterClass.create).toHaveBeenCalledWith({
    outlineColor: [0x9b / 255, 0x59 / 255, 0xb6 / 255, 1],
    knockout: true,
    wave: false,
  });
  expect(filter.thickness).toBe(3);
  expect(outline.texture).toBe(texture);
  expect(outline.position.set).toHaveBeenCalledWith(15, 27);
  expect(outline.anchor.set).toHaveBeenCalledWith(0.5, 0.5);
  expect(outline.scale.set).toHaveBeenCalledWith(2, 1);
  expect(outline.rotation).toBe(0.2);
  expect(outline.alpha).toBe(1);
  expect(parent.addChild).toHaveBeenCalledWith(outline);

  mesh.position.x = 30;
  refreshHiddenTileIndicator(tile, { show: true, pixi, outlineFilterClass });
  expect(outline.position.set).toHaveBeenLastCalledWith(30, 27);
  expect(outlineFilterClass.create).toHaveBeenCalledTimes(1);

  removeHiddenTileIndicator(tile);
  expect(parent.removeChild).toHaveBeenCalledWith(outline);
  expect(outline.destroy).toHaveBeenCalled();
  expect(filter.destroy).toHaveBeenCalled();
});
