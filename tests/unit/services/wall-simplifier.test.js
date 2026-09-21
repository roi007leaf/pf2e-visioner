import {
  buildWallChains,
  isSimplifiableWall,
  planWallSimplification,
  simplifyChainPoints,
  wallSignature,
} from '../../../scripts/services/Walls/wall-simplifier.js';

let nextId = 1;
function wall(c, extra = {}) {
  const id = `w${nextId++}`;
  const source = { _id: id, c, sight: 20, light: 20, sound: 20, move: 20, door: 0, ds: 0, dir: 0, flags: {}, ...extra };
  return { id, ...source, toObject: () => ({ ...source }) };
}

function polyline(points, extra) {
  const walls = [];
  for (let i = 0; i < points.length - 1; i++) {
    walls.push(wall([...points[i], ...points[i + 1]], extra));
  }
  return walls;
}

describe('wall simplifier', () => {
  beforeEach(() => {
    nextId = 1;
  });

  test('signature ignores id and coordinates but includes every other field and flags', () => {
    const a = wall([0, 0, 10, 0], { flags: { 'pf2e-visioner': { hiddenWall: true } } });
    const b = wall([50, 50, 60, 50], { flags: { 'pf2e-visioner': { hiddenWall: true } } });
    const c = wall([0, 0, 10, 0], { flags: {} });
    const d = wall([0, 0, 10, 0], { sight: 0 });
    expect(wallSignature(a)).toBe(wallSignature(b));
    expect(wallSignature(a)).not.toBe(wallSignature(c));
    expect(wallSignature(c)).not.toBe(wallSignature(d));
  });

  test('doors and one-way walls are never simplified', () => {
    expect(isSimplifiableWall(wall([0, 0, 10, 0]))).toBe(true);
    expect(isSimplifiableWall(wall([0, 0, 10, 0], { door: 1 }))).toBe(false);
    expect(isSimplifiableWall(wall([0, 0, 10, 0], { dir: 1 }))).toBe(false);
  });

  test('chains connected same-config walls through degree-2 joints only', () => {
    const chain = polyline([[0, 0], [10, 1], [20, 0], [30, 2]]);
    const branch = wall([20, 0, 20, 50]);
    const chains = buildWallChains([...chain, branch]);
    const sizes = chains.map((c) => c.docs.length).sort((a, b) => a - b);
    expect(sizes).toEqual([1, 1, 2]);
  });

  test('a config change breaks the chain', () => {
    const a = polyline([[0, 0], [10, 1], [20, 0]]);
    const b = polyline([[20, 0], [30, 1], [40, 0]], { sight: 0 });
    const chains = buildWallChains([...a, ...b]);
    expect(chains.map((c) => c.docs.length).sort()).toEqual([2, 2]);
  });

  test('simplifyChainPoints keeps a corner beyond tolerance and drops jitter within it', () => {
    const points = [[0, 0], [10, 1], [20, 0], [30, 1], [40, 0], [40, 40]];
    expect(simplifyChainPoints(points, 2)).toEqual([[0, 0], [40, 0], [40, 40]]);
    expect(simplifyChainPoints(points, 0)).toEqual(points);
  });

  test('closed loops keep at least a triangle', () => {
    const square = [[0, 0], [50, 1], [100, 0], [100, 100], [0, 100], [0, 0]];
    const simplified = simplifyChainPoints(square, 2);
    expect(simplified[0]).toEqual([0, 0]);
    expect(simplified[simplified.length - 1]).toEqual([0, 0]);
    expect(simplified.length).toBeGreaterThanOrEqual(4);
    expect(simplified).toEqual([[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]]);
  });

  test('plan deletes the whole chain and recreates fewer segments carrying the shared config', () => {
    const flags = { 'pf2e-visioner': { coverOverride: 'greater' } };
    const chain = polyline([[0, 0], [10, 1], [20, 0], [30, 1], [40, 0]], { flags });
    const door = wall([100, 100, 120, 100], { door: 1 });
    const plan = planWallSimplification([...chain, door], { tolerance: 2 });
    expect(plan.before).toBe(5);
    expect(plan.after).toBe(2);
    expect(plan.deleteIds.sort()).toEqual(chain.map((w) => w.id).sort());
    expect(plan.creates).toEqual([
      { c: [0, 0, 40, 0], sight: 20, light: 20, sound: 20, move: 20, door: 0, ds: 0, dir: 0, flags },
    ]);
  });

  test('plan leaves chains alone when nothing can be removed', () => {
    const chain = polyline([[0, 0], [40, 0], [40, 40]]);
    const plan = planWallSimplification(chain, { tolerance: 2 });
    expect(plan.deleteIds).toEqual([]);
    expect(plan.creates).toEqual([]);
    expect(plan.after).toBe(2);
    expect(plan.unchangedChains).toBe(1);
  });

  test('tolerance 0 still merges exactly collinear segments', () => {
    const chain = polyline([[0, 0], [10, 0], [20, 0]]);
    const plan = planWallSimplification(chain, { tolerance: 0 });
    expect(plan.after).toBe(1);
  });
});
