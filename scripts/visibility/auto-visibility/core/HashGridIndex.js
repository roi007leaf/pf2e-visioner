/**
 * HashGridIndex
 * Uniform spatial hash grid for fast token center queries.
 * API-compatible with SpatialBatchIndex: build, queryRect, queryCircle.
 */
export class HashGridIndex {
  constructor(cellSize) {
    const gs = canvas?.grid?.size || 100;
    this._cellSize = Math.max(16, Math.floor(cellSize || gs));
    this._cells = new Map(); // key: `${cx},${cy}` -> Array<{id, token, x, y}>
  }

  build(tokens, getPosByToken) {
    this._cells.clear();
    const cs = this._cellSize;
    for (const t of tokens || []) {
      const id = t?.document?.id;
      if (!id) continue;
      const p = getPosByToken(t);
      if (!p) continue;
      const cx = Math.floor(p.x / cs);
      const cy = Math.floor(p.y / cs);
      const key = `${cx},${cy}`;
      let arr = this._cells.get(key);
      if (!arr) this._cells.set(key, (arr = []));
      arr.push({ id, token: t, x: p.x, y: p.y });
    }
  }

  queryRect(rect) {
    const out = [];
    if (!rect) return out;
    const cs = this._cellSize;
    const minCx = Math.floor(rect.x / cs);
    const minCy = Math.floor(rect.y / cs);
    const maxCx = Math.floor((rect.x + rect.width) / cs);
    const maxCy = Math.floor((rect.y + rect.height) / cs);

    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const key = `${cx},${cy}`;
        const arr = this._cells.get(key);
        if (!arr) continue;
        for (const pt of arr) {
          if (pt.x >= rect.x && pt.y >= rect.y && pt.x <= rect.x + rect.width && pt.y <= rect.y + rect.height) {
            out.push(pt);
          }
        }
      }
    }
    return out;
  }

  queryCircle(cx, cy, r) {
    const rect = { x: cx - r, y: cy - r, width: r * 2, height: r * 2 };
    const candidates = this.queryRect(rect);
    const r2 = r * r;
    return candidates.filter((pt) => {
      const dx = pt.x - cx;
      const dy = pt.y - cy;
      return dx * dx + dy * dy <= r2;
    });
  }
}
