import { peekRegistry } from './PeekRegistry.js';

export class PeekGmOverlay {
  constructor() {
    this._graphics = new Map();
  }

  _layer() {
    return globalThis.canvas?.interface ?? null;
  }

  render() {
    try {
      const layer = this._layer();
      if (!layer) return;
      const ownId = globalThis.game?.user?.id;
      const isGM = !!globalThis.game?.user?.isGM;
      const live = new Set();
      for (const id of peekRegistry.ids()) {
        const peek = peekRegistry.get(id);
        if (!peek?.origin) continue;
        const isOwn = !peek.userId || peek.userId === ownId;
        if (isGM && isOwn) continue;
        if (!isGM && !isOwn) continue;
        live.add(id);
        this._draw(layer, id, peek);
      }
      for (const id of [...this._graphics.keys()]) {
        if (!live.has(id)) this._remove(id);
      }
    } catch (_) {}
  }

  _draw(layer, id, peek) {
    let g = this._graphics.get(id);
    if (!g) {
      g = new PIXI.Graphics();
      layer.addChild(g);
      this._graphics.set(id, g);
    }
    g.clear();
    const color = this._color(peek.userColor);
    if (Array.isArray(peek.points) && peek.points.length >= 6) {
      g.beginFill(color, 0.15);
      g.lineStyle(2, color, 0.6);
      g.drawPolygon(peek.points);
      g.endFill();
    }
    g.beginFill(color, 0.9);
    g.lineStyle(1, 0x000000, 0.8);
    g.drawCircle(peek.origin.x, peek.origin.y, 6);
    g.endFill();
  }

  _color(userColor) {
    try {
      if (typeof userColor === 'number') return userColor;
      if (typeof userColor === 'string') return Number(PIXI.utils.string2hex ? PIXI.utils.string2hex(userColor) : parseInt(userColor.replace('#', '0x')));
    } catch (_) {}
    return 0xff9800;
  }

  _remove(id) {
    const g = this._graphics.get(id);
    if (g) {
      try { g.parent?.removeChild(g); g.destroy(); } catch (_) {}
      this._graphics.delete(id);
    }
  }

  clearAll() {
    for (const id of [...this._graphics.keys()]) this._remove(id);
  }
}

export const peekGmOverlay = new PeekGmOverlay();
