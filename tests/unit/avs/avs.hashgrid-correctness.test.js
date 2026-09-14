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

  test('large queries do not visit empty cells beyond the indexed extent, including after rebuild', () => {
    const hash = new HashGridIndex(50);
    hash.build([mkToken('a', -25, -25), mkToken('b', 25, 25)], getPos);
    const lookup = jest.spyOn(hash._cells, 'get');
    expect(hash.queryCircle(0, 0, 2000).map(p => p.id)).toEqual(['a', 'b']);
    expect(lookup.mock.calls.length).toBeLessThanOrEqual(4);
    hash.build([mkToken('c', 4000, 4000)], getPos);
    lookup.mockClear();
    expect(hash.queryCircle(0, 0, 2000)).toEqual([]);
    expect(lookup).not.toHaveBeenCalled();
    expect(hash.queryRect({ x: 4000, y: 4000, width: 0, height: 0 }).map(p => p.id)).toEqual(['c']);
    hash.build([], getPos);
    expect(hash.queryCircle(4000, 4000, 2000)).toEqual([]);
  });

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
