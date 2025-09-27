// Optional micro-benchmark; not part of the Jest run.
import { HashGridIndex } from '../../scripts/visibility/auto-visibility/core/HashGridIndex.js';
import { SpatialBatchIndex } from '../../scripts/visibility/auto-visibility/core/SpatialBatchIndex.js';

function mkToken(id, x, y) { return { document: { id }, x, y }; }
function getPos(t) { return { x: t.x, y: t.y }; }

function time(label, fn) {
  const t0 = performance.now();
  const res = fn();
  const t1 = performance.now();
  console.log(`${label}: ${(t1 - t0).toFixed(2)}ms`);
  return res;
}

export function runHashGridBench() {
  const tokens = [];
  let id = 1;
  const N = 2000; // synthetic
  for (let i = 0; i < N; i++) {
    const x = Math.random() * 5000;
    const y = Math.random() * 5000;
    tokens.push(mkToken(String(id++), x, y));
  }

  const quad = new SpatialBatchIndex({ x: 0, y: 0, width: 5000, height: 5000 });
  time('quadtree build', () => quad.build(tokens, getPos));

  const hash = new HashGridIndex(100);
  time('hashgrid build', () => hash.build(tokens, getPos));

  const queries = Array.from({ length: 100 }, () => ({
    rect: { x: Math.random() * 4800, y: Math.random() * 4800, width: 200, height: 200 },
    circle: { cx: Math.random() * 5000, cy: Math.random() * 5000, r: 150 },
  }));

  time('quadtree rect queries', () => queries.forEach(q => quad.queryRect(q.rect)));
  time('hashgrid rect queries', () => queries.forEach(q => hash.queryRect(q.rect)));
  time('quadtree circle queries', () => queries.forEach(q => quad.queryCircle(q.circle.cx, q.circle.cy, q.circle.r)));
  time('hashgrid circle queries', () => queries.forEach(q => hash.queryCircle(q.circle.cx, q.circle.cy, q.circle.r)));
}
