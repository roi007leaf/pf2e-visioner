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
    this._minCx = this._minCy = Infinity;
    this._maxCx = this._maxCy = -Infinity;
  }

  build(tokens, getPosByToken) {
    this._cells.clear();
    this._minCx = this._minCy = Infinity;
    this._maxCx = this._maxCy = -Infinity;
    const cs = this._cellSize;
    for (const t of tokens || []) {
      const id = t?.document?.id;
      if (!id) continue;
      const p = getPosByToken(t);
      if (!p) continue;
      const cx = Math.floor(p.x / cs);
      const cy = Math.floor(p.y / cs);
      if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue;
      this._minCx = Math.min(this._minCx, cx);
      this._minCy = Math.min(this._minCy, cy);
      this._maxCx = Math.max(this._maxCx, cx);
      this._maxCy = Math.max(this._maxCy, cy);
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
    // Visibility ranges can dwarf the occupied scene. Empty outer cells cannot
    // contribute candidates, so bound work by the indexed extent.
    const minCx = Math.max(this._minCx, Math.floor(rect.x / cs));
    const minCy = Math.max(this._minCy, Math.floor(rect.y / cs));
    const maxCx = Math.min(this._maxCx, Math.floor((rect.x + rect.width) / cs));
    const maxCy = Math.min(this._maxCy, Math.floor((rect.y + rect.height) / cs));

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
