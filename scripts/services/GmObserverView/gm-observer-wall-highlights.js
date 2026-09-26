const HIGHLIGHT_NAME = 'PF2E Visioner GM Observer Wall Highlights';

let highlight = null;
let highlightScene = null;

function colorNumber(color) {
  // Foundry category colors are Color objects (boxed numbers).
  if (color && typeof color === 'object') color = color.valueOf?.();
  if (typeof color === 'number' && Number.isFinite(color)) return color;
  if (typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)) {
    return Number.parseInt(color.slice(1), 16);
  }
  return null;
}

function coreWallColor(wall) {
  const nativeColor = colorNumber(wall?._getWallColor?.());
  if (nativeColor !== null) return nativeColor;

  // Core can leave a wall's display object uninitialized while a scene draws.
  const document = wall?.document;
  const category = document?.getWallCategory?.();
  let color = colorNumber(document?.constructor?.CATEGORY_COLORS?.[category]);
  const states = globalThis.CONST?.WALL_DOOR_STATES;
  if (category === 'door' || category === 'secret') {
    const state = document.ds ?? states?.CLOSED;
    if (states && state === states.OPEN) color = category === 'door' ? 0x66cc66 : 0x7c1a9b;
    else if (states && state === states.LOCKED) color = 0xee4444;
  }
  return color ?? 0xffffbb;
}

export function clearGmObserverWallHighlights() {
  if (!highlight) return;
  highlight.parent?.removeChild?.(highlight);
  highlight.destroy?.();
  highlight = null;
  highlightScene = null;
}

export function syncGmObserverWallHighlights({ active, enabled, redraw = false } = {}) {
  const canvas = globalThis.canvas;
  const Graphics = globalThis.PIXI?.Graphics;
  const parent = canvas?.walls;
  if (!active || !enabled || !canvas?.ready || !parent || !Graphics) {
    clearGmObserverWallHighlights();
    return null;
  }

  if (highlight && (highlight.parent !== parent || highlightScene !== canvas.scene)) {
    clearGmObserverWallHighlights();
  }
  if (highlight && !redraw) return highlight;

  if (!highlight) {
    highlight = new Graphics();
    highlight.name = HIGHLIGHT_NAME;
    highlight.eventMode = 'none';
    parent.addChild(highlight);
  } else highlight.clear();
  highlightScene = canvas.scene;

  for (const wall of parent.placeables ?? []) {
    // Core already renders door controls; omit both normal and secret doors.
    if (wall?.document?.door > 0) continue;
    const c = wall?.document?.c;
    const color = coreWallColor(wall);
    if (!Array.isArray(c) || c.length !== 4 || !c.every(Number.isFinite) || color === null) {
      continue;
    }
    const [x1, y1, x2, y2] = c;
    highlight.lineStyle(6, 0x000000, 0.55);
    highlight.moveTo(x1, y1);
    highlight.lineTo(x2, y2);
    highlight.lineStyle(3, color, 0.95);
    highlight.moveTo(x1, y1);
    highlight.lineTo(x2, y2);
  }
  return highlight;
}
