import test from 'node:test';
import assert from 'node:assert/strict';
import { retainedGrowth } from './performance-lifecycle-workflows.mjs';

test('retained growth rejects sustained heap, DOM, or listener leaks independently', () => {
  const base = { heap: 100000000, nodes: 10000, listeners: 1000 };
  for (const [key, growth] of [['heap', 40 * 1024 * 1024], ['nodes', 600], ['listeners', 150]]) {
    assert.equal(retainedGrowth([base, ...Array.from({ length: 3 }, () => ({ ...base, [key]: base[key] + growth }))]).passed, false);
  }
  assert.equal(retainedGrowth([base, base, base, { ...base, heap: 200000000 }]).passed, true);
});
test('retained growth requires enough valid post-GC samples', () => {
  assert.throws(() => retainedGrowth([]));
  assert.throws(() => retainedGrowth(Array(4).fill({ heap: NaN, nodes: 1, listeners: 1 })));
});
