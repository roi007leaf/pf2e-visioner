import { HashGridIndex } from '../../../scripts/visibility/auto-visibility/core/HashGridIndex.js';
import { SpatialBatchIndex } from '../../../scripts/visibility/auto-visibility/core/SpatialBatchIndex.js';

describe('HashGridIndex vs SpatialBatchIndex correctness', () => {
  function mkToken(id, x, y) {
    return {
      document: { id },
      x,
      y,
    };
  }
  function getPos(t) { return { x: t.x, y: t.y }; }

  test('queryRect and queryCircle return same ids', () => {
    const tokens = [];
    // 10x10 grid of 100 tokens, spaced 50px apart
    let id = 1;
    for (let i = 0; i < 10; i++) {
      for (let j = 0; j < 10; j++) {
        tokens.push(mkToken(String(id++), i * 50, j * 50));
      }
    }

    const quad = new SpatialBatchIndex({ x: 0, y: 0, width: 500, height: 500 });
    quad.build(tokens, getPos);

    const hash = new HashGridIndex(50);
    hash.build(tokens, getPos);

    const rect = { x: 75, y: 75, width: 200, height: 150 };
    const a = new Set(quad.queryRect(rect).map(p => p.id));
    const b = new Set(hash.queryRect(rect).map(p => p.id));
    expect([...a].sort()).toEqual([...b].sort());

    const cx = 225, cy = 225, r = 140;
    const ac = new Set(quad.queryCircle(cx, cy, r).map(p => p.id));
    const bc = new Set(hash.queryCircle(cx, cy, r).map(p => p.id));
    expect([...ac].sort()).toEqual([...bc].sort());
  });
});
