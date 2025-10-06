/**
 * SpatialBatchIndex
 * A lightweight per-batch quadtree for token centers.
 * - Build once per batch from tokens and a position provider
 * - queryRect: axis-aligned rectangle search
 * - queryCircle: coarse AABB followed by precise circle distance filter
 */
export class SpatialBatchIndex {
  constructor(bounds) {
    // If bounds omitted, use full canvas area
    const w = canvas?.dimensions?.width || (canvas?.scene?.width || 10000);
    const h = canvas?.dimensions?.height || (canvas?.scene?.height || 10000);
    this._bounds = bounds || { x: 0, y: 0, width: w, height: h };
    this._root = this._createNode(this._bounds, 0);
    this._maxDepth = 8;
    this._capacity = 8; // max points per node before split
  }

  build(tokens, getPosByToken) {
    this._root = this._createNode(this._bounds, 0);
    for (const t of tokens || []) {
      const id = t?.document?.id;
      if (!id) continue;
      const p = getPosByToken(t);
      if (!p) continue;
      this._insert(this._root, { id, token: t, x: p.x, y: p.y });
    }
  }

  queryRect(rect) {
    const out = [];
    this._queryRect(this._root, rect, out);
    return out;
  }

  queryCircle(cx, cy, r) {
    // Coarse: query bounding rect, then filter by radius
    const rect = { x: cx - r, y: cy - r, width: r * 2, height: r * 2 };
    const candidates = this.queryRect(rect);
    const r2 = r * r;
    return candidates.filter((pt) => {
      const dx = pt.x - cx;
      const dy = pt.y - cy;
      return dx * dx + dy * dy <= r2;
    });
  }

  // internals
  _createNode(bounds, depth) {
    return { bounds, depth, points: [], children: null };
  }

  _split(node) {
    const { x, y, width, height } = node.bounds;
    const hw = width / 2;
    const hh = height / 2;
    node.children = [
      this._createNode({ x, y, width: hw, height: hh }, node.depth + 1),
      this._createNode({ x: x + hw, y, width: hw, height: hh }, node.depth + 1),
      this._createNode({ x, y: y + hh, width: hw, height: hh }, node.depth + 1),
      this._createNode({ x: x + hw, y: y + hh, width: hw, height: hh }, node.depth + 1),
    ];
    // Re-distribute points
    for (const pt of node.points) {
      this._insertIntoChildren(node, pt);
    }
    node.points.length = 0;
  }

  _insert(node, pt) {
    if (!this._rectContains(node.bounds, pt.x, pt.y)) return false;
    if (!node.children) {
      node.points.push(pt);
      if (node.points.length > this._capacity && node.depth < this._maxDepth) {
        this._split(node);
      }
      return true;
    }
    return this._insertIntoChildren(node, pt);
  }

  _insertIntoChildren(node, pt) {
    for (const child of node.children) {
      if (this._rectContains(child.bounds, pt.x, pt.y)) {
        return this._insert(child, pt);
      }
    }
    // If for some reason none contain (edge precision), keep at parent
    node.points.push(pt);
    return true;
  }

  _queryRect(node, rect, out) {
    if (!this._rectIntersects(node.bounds, rect)) return;
    if (node.children) {
      for (const child of node.children) this._queryRect(child, rect, out);
    }
    for (const pt of node.points) {
      if (this._rectContains(rect, pt.x, pt.y)) out.push(pt);
    }
  }

  _rectContains(rect, x, y) {
    return x >= rect.x && y >= rect.y && x <= rect.x + rect.width && y <= rect.y + rect.height;
  }

  _rectIntersects(a, b) {
    return !(
      a.x + a.width < b.x ||
      a.x > b.x + b.width ||
      a.y + a.height < b.y ||
      a.y > b.y + b.height
    );
  }
}
