# Peek Mechanism Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a token peek around a wall corner (hold keybind + mouse) or through a door (right-click + modifier, optional per-door DC roll) so the controlling client gains a real directional cone of Foundry sight, and Visioner's AVS recomputes that token's visibility from the peek origin.

**Architecture:** A single per-client `PeekRegistry` singleton holds active peeks (`tokenId → {origin, direction, fov, ignoredWallIds, ts}`). The client `PeekManager` writes the registry for the local user, drives local vision rendering via `PeekVisionSourceController`, and emits the peek to the GM over socketlib. The GM client's socket handler writes the same registry and asks AVS to recompute the peeking token. AVS reads the registry: `PositionManager` substitutes the peek origin, `VisionAnalyzer` excludes the door wall and applies the cone. Nothing mutates the token document; teardown is idempotent and the GM entry auto-expires.

**Tech Stack:** Foundry VTT module (ES modules), PF2e system, socketlib, libWrapper, Jest + jsdom. Project rules: tests required, no code comments, user-facing text via i18n keys (`lang/*.json`), no mixing test and production code, small focused functions.

**Reference:** Spec at `docs/superpowers/specs/2026-05-30-peek-mechanism-design.md`. Model client-viz lifecycle on `scripts/cover/CoverVisualization.js`; model keybinding hold pattern on the `showAutoCoverOverlay` case in `scripts/settings.js`.

**Test command convention:** `npx jest <testfile> -t "<name>"` for one test; `npx jest <testfile>` for a file. jsdom env, `tests/setup.js` auto-loaded, `createMockToken` / `createMockWall` globals available.

---

## File Structure

New files (all under `scripts/services/Peek/`, one responsibility each):

- `PeekRegistry.js` — singleton state of active peeks; pure data + stale pruning. No Foundry deps.
- `peek-geometry.js` — pure geometry: corner-origin clamp, door-origin derivation, cone containment. No Foundry deps.
- `PeekManager.js` — per-client lifecycle: start/update/end, hook wiring, one-peek-per-token, calls renderer + socket.
- `PeekVisionSourceController.js` — client-only Foundry vision rendering: apply/clear peek vision source + local door-edge ignore.
- `peek-door-dc.js` — read a door's Peek DC flag and roll the PF2e check; pure-ish (rolling isolated behind a seam).

Modified files:

- `scripts/visibility/auto-visibility/core/PositionManager.js` — top-priority peek origin in `getTokenPosition`.
- `scripts/visibility/auto-visibility/VisionAnalyzer.js` — exclude peek `ignoredWallIds`; apply cone filter to the observer.
- `scripts/services/socket.js` — `PeekUpdate` / `PeekEnd` channels + GM handlers.
- `scripts/settings.js` — register `holdPeek` keybinding (corner) and door peek wiring.
- `scripts/constants.js` — `KEYBINDINGS.holdPeek` entry; `DEFAULT_SETTINGS.peekModifierKey` if needed.
- `scripts/hooks/ui.js` — inject "Peek DC" input into the wall/door config (`renderWallConfig`).
- `scripts/main.js` — instantiate `PeekManager` at init (like `CoverVisualization`).
- `lang/en.json` (and `cn/fr/pl`) — i18n keys for keybinding, setting, chat messages.

Test files (mirror under `tests/unit/services/peek/`):

- `peek-registry.test.js`, `peek-geometry.test.js`, `peek-manager.test.js`,
  `peek-position-override.test.js`, `peek-vision-analyzer.test.js`,
  `peek-socket.test.js`, `peek-door-dc.test.js`.

---

## Phase 1 — Pure core (registry + geometry)

### Task 1: PeekRegistry singleton

**Files:**
- Create: `scripts/services/Peek/PeekRegistry.js`
- Test: `tests/unit/services/peek/peek-registry.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
import '../../../setup.js';
import { PeekRegistry } from '../../../../scripts/services/Peek/PeekRegistry.js';

describe('PeekRegistry', () => {
  let reg;
  beforeEach(() => { reg = new PeekRegistry(); });

  test('set/get/has/clear round-trip', () => {
    reg.set('t1', { origin: { x: 1, y: 2 }, direction: 0, fov: 90, ignoredWallIds: ['w1'] }, 1000);
    expect(reg.has('t1')).toBe(true);
    expect(reg.get('t1').origin).toEqual({ x: 1, y: 2 });
    expect(reg.get('t1').ignoredWallIds).toEqual(['w1']);
    reg.clear('t1');
    expect(reg.has('t1')).toBe(false);
    expect(reg.get('t1')).toBeNull();
  });

  test('set stamps ts from provided now', () => {
    reg.set('t1', { origin: { x: 0, y: 0 }, direction: 0, fov: 90, ignoredWallIds: [] }, 5000);
    expect(reg.get('t1').ts).toBe(5000);
  });

  test('pruneStale removes entries older than ttl', () => {
    reg.set('old', { origin: { x: 0, y: 0 }, direction: 0, fov: 90, ignoredWallIds: [] }, 1000);
    reg.set('fresh', { origin: { x: 0, y: 0 }, direction: 0, fov: 90, ignoredWallIds: [] }, 1900);
    reg.pruneStale(1000, 2000);
    expect(reg.has('old')).toBe(false);
    expect(reg.has('fresh')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/services/peek/peek-registry.test.js`
Expected: FAIL — cannot find module `PeekRegistry.js`.

- [ ] **Step 3: Write minimal implementation**

```javascript
export class PeekRegistry {
  constructor() {
    this._peeks = new Map();
  }

  set(tokenId, data, now) {
    this._peeks.set(tokenId, {
      origin: data.origin,
      direction: data.direction,
      fov: data.fov,
      ignoredWallIds: Array.isArray(data.ignoredWallIds) ? data.ignoredWallIds : [],
      ts: now,
    });
  }

  get(tokenId) {
    return this._peeks.get(tokenId) ?? null;
  }

  has(tokenId) {
    return this._peeks.has(tokenId);
  }

  clear(tokenId) {
    this._peeks.delete(tokenId);
  }

  clearAll() {
    this._peeks.clear();
  }

  ids() {
    return Array.from(this._peeks.keys());
  }

  pruneStale(ttlMs, now) {
    for (const [id, entry] of this._peeks) {
      if (now - entry.ts > ttlMs) this._peeks.delete(id);
    }
  }
}

export const peekRegistry = new PeekRegistry();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/services/peek/peek-registry.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/services/Peek/PeekRegistry.js tests/unit/services/peek/peek-registry.test.js
git commit -m "feat(peek): add PeekRegistry singleton for active peek state"
```

---

### Task 2: Peek geometry — cone containment

**Files:**
- Create: `scripts/services/Peek/peek-geometry.js`
- Test: `tests/unit/services/peek/peek-geometry.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
import '../../../setup.js';
import { isPointInCone } from '../../../../scripts/services/Peek/peek-geometry.js';

describe('isPointInCone', () => {
  const origin = { x: 0, y: 0 };

  test('point straight ahead within fov is inside', () => {
    expect(isPointInCone(origin, 0, 90, { x: 100, y: 0 })).toBe(true);
  });

  test('point within half-fov edge is inside', () => {
    expect(isPointInCone(origin, 0, 90, { x: 100, y: 90 })).toBe(true);
  });

  test('point behind is outside', () => {
    expect(isPointInCone(origin, 0, 90, { x: -100, y: 0 })).toBe(false);
  });

  test('point just outside half-fov is outside', () => {
    expect(isPointInCone(origin, 0, 60, { x: 10, y: 100 })).toBe(false);
  });

  test('origin-coincident point is inside (degenerate)', () => {
    expect(isPointInCone(origin, 0, 90, { x: 0, y: 0 })).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/services/peek/peek-geometry.test.js -t isPointInCone`
Expected: FAIL — `isPointInCone` is not a function.

- [ ] **Step 3: Write minimal implementation**

```javascript
export function isPointInCone(origin, direction, fov, point) {
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  if (dx === 0 && dy === 0) return true;
  const angleTo = Math.atan2(dy, dx);
  const dir = typeof direction === 'number' ? direction : Math.atan2(direction.y, direction.x);
  let delta = Math.abs(normalizeAngle(angleTo - dir));
  return delta <= toRadians(fov) / 2 + 1e-9;
}

function normalizeAngle(a) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

function toRadians(deg) {
  return (deg * Math.PI) / 180;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/services/peek/peek-geometry.test.js -t isPointInCone`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/services/Peek/peek-geometry.js tests/unit/services/peek/peek-geometry.test.js
git commit -m "feat(peek): add cone containment geometry helper"
```

---

### Task 3: Peek geometry — corner origin clamp

**Files:**
- Modify: `scripts/services/Peek/peek-geometry.js`
- Test: `tests/unit/services/peek/peek-geometry.test.js`

`clampCornerPeek` clamps the mouse point into the token footprint expanded by `band`, snaps the origin to the nearest footprint corner toward the mouse, and sets `direction` = origin→mouse, `fov` from input.

- [ ] **Step 1: Write the failing test**

```javascript
import { clampCornerPeek } from '../../../../scripts/services/Peek/peek-geometry.js';

describe('clampCornerPeek', () => {
  const footprint = { x: 0, y: 0, width: 100, height: 100 };

  test('mouse far to the right snaps origin to a right-edge corner', () => {
    const out = clampCornerPeek({ footprint, gridSize: 100, mouse: { x: 500, y: 50 }, band: 50, fov: 90 });
    expect(out.origin.x).toBeGreaterThanOrEqual(100);
    expect(out.origin.x).toBeLessThanOrEqual(150);
    expect(out.fov).toBe(90);
    expect(out.direction).toBeCloseTo(0, 5);
  });

  test('mouse inside expanded band is used directly as origin', () => {
    const out = clampCornerPeek({ footprint, gridSize: 100, mouse: { x: 120, y: 50 }, band: 50, fov: 90 });
    expect(out.origin).toEqual({ x: 120, y: 50 });
  });

  test('mouse to the lower-left snaps toward the lower-left corner', () => {
    const out = clampCornerPeek({ footprint, gridSize: 100, mouse: { x: -500, y: 600 }, band: 50, fov: 90 });
    expect(out.origin.x).toBeLessThanOrEqual(0);
    expect(out.origin.y).toBeGreaterThanOrEqual(100);
  });

  test('preserves elevation passed through footprint', () => {
    const out = clampCornerPeek({ footprint: { ...footprint, elevation: 30 }, gridSize: 100, mouse: { x: 500, y: 50 }, band: 50, fov: 90 });
    expect(out.origin.elevation).toBe(30);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/services/peek/peek-geometry.test.js -t clampCornerPeek`
Expected: FAIL — `clampCornerPeek` is not a function.

- [ ] **Step 3: Write minimal implementation (append to peek-geometry.js)**

```javascript
export function clampCornerPeek({ footprint, gridSize, mouse, band, fov }) {
  const expanded = {
    minX: footprint.x - band,
    minY: footprint.y - band,
    maxX: footprint.x + footprint.width + band,
    maxY: footprint.y + footprint.height + band,
  };
  const clampedX = clamp(mouse.x, expanded.minX, expanded.maxX);
  const clampedY = clamp(mouse.y, expanded.minY, expanded.maxY);
  const origin = { x: clampedX, y: clampedY };
  if (footprint.elevation !== undefined) origin.elevation = footprint.elevation;
  const direction = Math.atan2(mouse.y - origin.y, mouse.x - origin.x);
  return { origin, direction: Number.isNaN(direction) ? 0 : direction, fov };
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/services/peek/peek-geometry.test.js -t clampCornerPeek`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/services/Peek/peek-geometry.js tests/unit/services/peek/peek-geometry.test.js
git commit -m "feat(peek): add corner origin clamp helper"
```

---

### Task 4: Peek geometry — door origin derivation

**Files:**
- Modify: `scripts/services/Peek/peek-geometry.js`
- Test: `tests/unit/services/peek/peek-geometry.test.js`

`clampDoorPeek` takes the door wall endpoints `c=[x1,y1,x2,y2]` and the peeking token center, returns origin = door midpoint nudged a few px toward the side opposite the token (so the sweep originates just past the closed door), direction = perpendicular through the door pointing away from the token, `fov` from input.

- [ ] **Step 1: Write the failing test**

```javascript
import { clampDoorPeek } from '../../../../scripts/services/Peek/peek-geometry.js';

describe('clampDoorPeek', () => {
  const door = { c: [0, 0, 0, 100] };

  test('origin is near the door midpoint', () => {
    const out = clampDoorPeek({ door, tokenCenter: { x: -50, y: 50 }, nudge: 5, fov: 60 });
    expect(out.origin.y).toBeCloseTo(50, 0);
    expect(Math.abs(out.origin.x)).toBeLessThanOrEqual(6);
  });

  test('origin nudges to the far side from the token', () => {
    const out = clampDoorPeek({ door, tokenCenter: { x: -50, y: 50 }, nudge: 5, fov: 60 });
    expect(out.origin.x).toBeGreaterThan(0);
  });

  test('direction points away from the token through the door', () => {
    const out = clampDoorPeek({ door, tokenCenter: { x: -50, y: 50 }, nudge: 5, fov: 60 });
    expect(Math.cos(out.direction)).toBeGreaterThan(0);
  });

  test('fov passed through', () => {
    const out = clampDoorPeek({ door, tokenCenter: { x: -50, y: 50 }, nudge: 5, fov: 60 });
    expect(out.fov).toBe(60);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/services/peek/peek-geometry.test.js -t clampDoorPeek`
Expected: FAIL — `clampDoorPeek` is not a function.

- [ ] **Step 3: Write minimal implementation (append to peek-geometry.js)**

```javascript
export function clampDoorPeek({ door, tokenCenter, nudge, fov }) {
  const [x1, y1, x2, y2] = door.c;
  const mid = { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
  let nx = -(y2 - y1);
  let ny = x2 - x1;
  const len = Math.hypot(nx, ny) || 1;
  nx /= len;
  ny /= len;
  const toTokenX = tokenCenter.x - mid.x;
  const toTokenY = tokenCenter.y - mid.y;
  if (nx * toTokenX + ny * toTokenY > 0) {
    nx = -nx;
    ny = -ny;
  }
  const origin = { x: mid.x + nx * nudge, y: mid.y + ny * nudge };
  const direction = Math.atan2(ny, nx);
  return { origin, direction, fov };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/services/peek/peek-geometry.test.js -t clampDoorPeek`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/services/Peek/peek-geometry.js tests/unit/services/peek/peek-geometry.test.js
git commit -m "feat(peek): add door origin derivation helper"
```

---

## Phase 2 — AVS integration (reads the registry)

### Task 5: PositionManager top-priority peek origin

**Files:**
- Modify: `scripts/visibility/auto-visibility/core/PositionManager.js` (top of `getTokenPosition`, ~line 74)
- Test: `tests/unit/services/peek/peek-position-override.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
import '../../../setup.js';
import { peekRegistry } from '../../../../scripts/services/Peek/PeekRegistry.js';
import { PositionManager } from '../../../../scripts/visibility/auto-visibility/core/PositionManager.js';

describe('PositionManager peek origin override', () => {
  afterEach(() => peekRegistry.clearAll());

  test('returns peek origin when token has an active peek', () => {
    const pm = new PositionManager();
    const token = createMockToken({ id: 'peeker', x: 0, y: 0 });
    peekRegistry.set('peeker', { origin: { x: 777, y: 888, elevation: 5 }, direction: 0, fov: 90, ignoredWallIds: [] }, 1000);
    const pos = pm.getTokenPosition(token);
    expect(pos.x).toBe(777);
    expect(pos.y).toBe(888);
    expect(pos.elevation).toBe(5);
  });

  test('falls through to normal logic when no peek', () => {
    const pm = new PositionManager();
    const token = createMockToken({ id: 'normal', x: 100, y: 100, width: 1, height: 1 });
    const pos = pm.getTokenPosition(token);
    expect(pos.x).not.toBe(777);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/services/peek/peek-position-override.test.js`
Expected: FAIL — peek origin not returned (returns normal center).

- [ ] **Step 3: Add the override at the very top of `getTokenPosition`**

Locate (PositionManager.js ~line 74):

```javascript
  getTokenPosition(token) {
    const tokenId = token.document.id;
    const tokenName = token.document.name;
```

Insert immediately after `const tokenId = token.document.id;`:

```javascript
    const peek = peekRegistry.get(tokenId);
    if (peek?.origin) {
      return {
        x: peek.origin.x,
        y: peek.origin.y,
        elevation: peek.origin.elevation ?? token.document.elevation ?? 0,
      };
    }
```

Add the import at the top of the file:

```javascript
import { peekRegistry } from '../../../services/Peek/PeekRegistry.js';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/services/peek/peek-position-override.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/visibility/auto-visibility/core/PositionManager.js tests/unit/services/peek/peek-position-override.test.js
git commit -m "feat(peek): substitute peek origin in PositionManager.getTokenPosition"
```

---

### Task 6: VisionAnalyzer wall exclusion + cone filter

**Files:**
- Modify: `scripts/visibility/auto-visibility/VisionAnalyzer.js` (`hasLineOfSight`, wall list usage ~line 488-515; observer resolution ~line 289)
- Test: `tests/unit/services/peek/peek-vision-analyzer.test.js`

Two changes inside `hasLineOfSight(observer, target)`:
1. When the observer has a peek with `ignoredWallIds`, drop those walls from the cached wall list before ray checks.
2. When the observer has a peek, the target must lie inside the cone; otherwise return `false` immediately.

- [ ] **Step 1: Write the failing test**

```javascript
import '../../../setup.js';
import { peekRegistry } from '../../../../scripts/services/Peek/PeekRegistry.js';
import { VisionAnalyzer } from '../../../../scripts/visibility/auto-visibility/VisionAnalyzer.js';

describe('VisionAnalyzer peek constraints', () => {
  afterEach(() => peekRegistry.clearAll());

  function makePair() {
    const observer = createMockToken({ id: 'obs', x: 0, y: 0, width: 1, height: 1 });
    const target = createMockToken({ id: 'tgt', x: 1000, y: 0, width: 1, height: 1 });
    return { observer, target };
  }

  test('returns false when target is outside the peek cone', () => {
    const va = new VisionAnalyzer();
    const { observer, target } = makePair();
    peekRegistry.set('obs', { origin: { x: 0, y: 0 }, direction: Math.PI, fov: 60, ignoredWallIds: [] }, 1000);
    expect(va.hasLineOfSight(observer, target)).toBe(false);
  });

  test('excluded wall id is not in the wall set used for the ray', () => {
    const va = new VisionAnalyzer();
    const wall = createMockWall({ id: 'door1' });
    const all = [wall];
    const filtered = va._applyPeekWallExclusion('obs', all);
    peekRegistry.set('obs', { origin: { x: 0, y: 0 }, direction: 0, fov: 90, ignoredWallIds: ['door1'] }, 1000);
    const filtered2 = va._applyPeekWallExclusion('obs', all);
    expect(filtered).toEqual(all);
    expect(filtered2.find((w) => w.document.id === 'door1')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/services/peek/peek-vision-analyzer.test.js`
Expected: FAIL — `_applyPeekWallExclusion` undefined and cone not enforced.

- [ ] **Step 3: Implement**

Add import at top of VisionAnalyzer.js:

```javascript
import { peekRegistry } from '../../services/Peek/PeekRegistry.js';
import { isPointInCone } from '../../services/Peek/peek-geometry.js';
```

Add a small public helper (used by tests and internally):

```javascript
  _applyPeekWallExclusion(observerId, walls) {
    const peek = peekRegistry.get(observerId);
    if (!peek?.ignoredWallIds?.length) return walls;
    const ignore = new Set(peek.ignoredWallIds);
    return walls.filter((w) => !ignore.has(w.document?.id));
  }
```

Near the start of `hasLineOfSight(observer, target)` (after `observer`/`target` are validated, before geometry), add the cone gate:

```javascript
    const observerPeek = peekRegistry.get(observer?.document?.id);
    if (observerPeek?.origin) {
      const tgtCenter = { x: target.center.x, y: target.center.y };
      if (!isPointInCone(observerPeek.origin, observerPeek.direction, observerPeek.fov, tgtCenter)) {
        return false;
      }
    }
```

At the cached-walls usage (~line 488), wrap the result:

Locate:

```javascript
      const cachedWalls = this.#getCachedWalls(elevationRange);
```

Replace with:

```javascript
      const cachedWalls = this._applyPeekWallExclusion(
        observer?.document?.id,
        this.#getCachedWalls(elevationRange),
      );
```

(Apply the same wrap to any other `#getCachedWalls(` call site inside `hasLineOfSight`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/services/peek/peek-vision-analyzer.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the existing VisionAnalyzer tests to confirm no regression**

Run: `npx jest tests/unit -t "VisionAnalyzer"`
Expected: PASS (pre-existing suites unaffected). If a pre-existing test fails, do NOT edit the test — revisit the guard placement so non-peek paths are byte-for-byte unchanged.

- [ ] **Step 6: Commit**

```bash
git add scripts/visibility/auto-visibility/VisionAnalyzer.js tests/unit/services/peek/peek-vision-analyzer.test.js
git commit -m "feat(peek): apply cone gate and door-wall exclusion in VisionAnalyzer"
```

---

## Phase 3 — Client lifecycle (PeekManager)

### Task 7: PeekManager start/end with registry + injected collaborators

**Files:**
- Create: `scripts/services/Peek/PeekManager.js`
- Test: `tests/unit/services/peek/peek-manager.test.js`

`PeekManager` takes injected `{ registry, renderer, socket, recompute, now }` collaborators so it is unit-testable without Foundry. Foundry wiring (hooks, real renderer/socket) is added in later tasks. One peek per token id.

- [ ] **Step 1: Write the failing test**

```javascript
import '../../../setup.js';
import { PeekManager } from '../../../../scripts/services/Peek/PeekManager.js';
import { PeekRegistry } from '../../../../scripts/services/Peek/PeekRegistry.js';

function deps() {
  return {
    registry: new PeekRegistry(),
    renderer: { apply: jest.fn(), clear: jest.fn() },
    socket: { sendUpdate: jest.fn(), sendEnd: jest.fn() },
    recompute: jest.fn(),
    now: () => 1000,
  };
}

describe('PeekManager lifecycle', () => {
  test('startCornerPeek registers, renders, sends, recomputes', () => {
    const d = deps();
    const mgr = new PeekManager(d);
    const token = createMockToken({ id: 'peeker', x: 0, y: 0, width: 1, height: 1 });
    mgr.startCornerPeek(token, { x: 500, y: 50 });
    expect(d.registry.has('peeker')).toBe(true);
    expect(d.renderer.apply).toHaveBeenCalledTimes(1);
    expect(d.socket.sendUpdate).toHaveBeenCalledTimes(1);
    expect(d.recompute).toHaveBeenCalledWith('peeker');
  });

  test('endPeek clears registry, renderer, sends end, recomputes; idempotent', () => {
    const d = deps();
    const mgr = new PeekManager(d);
    const token = createMockToken({ id: 'peeker', x: 0, y: 0, width: 1, height: 1 });
    mgr.startCornerPeek(token, { x: 500, y: 50 });
    mgr.endPeek('peeker', 'keyup');
    expect(d.registry.has('peeker')).toBe(false);
    expect(d.renderer.clear).toHaveBeenCalledWith(token);
    expect(d.socket.sendEnd).toHaveBeenCalledWith('peeker');
    mgr.endPeek('peeker', 'keyup');
    expect(d.renderer.clear).toHaveBeenCalledTimes(1);
  });

  test('only one active peek per token', () => {
    const d = deps();
    const mgr = new PeekManager(d);
    const token = createMockToken({ id: 'peeker', x: 0, y: 0, width: 1, height: 1 });
    mgr.startCornerPeek(token, { x: 500, y: 50 });
    mgr.startCornerPeek(token, { x: 50, y: 500 });
    expect(d.registry.ids().filter((id) => id === 'peeker')).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/services/peek/peek-manager.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```javascript
import { clampCornerPeek, clampDoorPeek } from './peek-geometry.js';

const PEEK_BAND = 50;
const PEEK_FOV = 90;
const DOOR_FOV = 60;
const DOOR_NUDGE = 5;

export class PeekManager {
  constructor({ registry, renderer, socket, recompute, now }) {
    this._registry = registry;
    this._renderer = renderer;
    this._socket = socket;
    this._recompute = recompute;
    this._now = now || (() => Date.now());
    this._tokensById = new Map();
  }

  startCornerPeek(token, mouse) {
    const footprint = this._footprint(token);
    const geo = clampCornerPeek({ footprint, gridSize: footprint.width, mouse, band: PEEK_BAND, fov: PEEK_FOV });
    this._begin(token, { ...geo, ignoredWallIds: [], kind: 'corner' });
  }

  startDoorPeek(token, doorDoc) {
    const geo = clampDoorPeek({ door: doorDoc, tokenCenter: token.center, nudge: DOOR_NUDGE, fov: DOOR_FOV });
    this._begin(token, { ...geo, ignoredWallIds: [doorDoc.id], kind: 'door' });
  }

  updatePeek(tokenId, mouse) {
    const token = this._tokensById.get(tokenId);
    if (!token) return;
    const footprint = this._footprint(token);
    const geo = clampCornerPeek({ footprint, gridSize: footprint.width, mouse, band: PEEK_BAND, fov: PEEK_FOV });
    this._registry.set(tokenId, { ...geo, ignoredWallIds: [] }, this._now());
    this._renderer.apply(token, this._registry.get(tokenId));
    this._socket.sendUpdate(tokenId, this._registry.get(tokenId));
    this._recompute(tokenId);
  }

  endPeek(tokenId, reason) {
    if (!this._registry.has(tokenId)) return;
    const token = this._tokensById.get(tokenId);
    this._registry.clear(tokenId);
    this._tokensById.delete(tokenId);
    if (token) this._renderer.clear(token);
    this._socket.sendEnd(tokenId);
    this._recompute(tokenId);
  }

  getActivePeek(tokenId) {
    return this._registry.get(tokenId);
  }

  _begin(token, data) {
    const id = token.document.id;
    if (this._registry.has(id)) this.endPeek(id, 'restart');
    this._tokensById.set(id, token);
    this._registry.set(id, data, this._now());
    this._renderer.apply(token, this._registry.get(id));
    this._socket.sendUpdate(id, this._registry.get(id));
    this._recompute(id);
  }

  _footprint(token) {
    const gridSize = globalThis.canvas?.grid?.size ?? 100;
    return {
      x: token.document.x,
      y: token.document.y,
      width: (token.document.width ?? 1) * gridSize,
      height: (token.document.height ?? 1) * gridSize,
      elevation: token.document.elevation ?? 0,
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/services/peek/peek-manager.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/services/Peek/PeekManager.js tests/unit/services/peek/peek-manager.test.js
git commit -m "feat(peek): add PeekManager lifecycle with injected collaborators"
```

---

### Task 8: PeekManager Foundry hook wiring (init)

**Files:**
- Modify: `scripts/services/Peek/PeekManager.js`
- Modify: `scripts/main.js` (instantiate at init, like `CoverVisualization`)
- Test: `tests/unit/services/peek/peek-manager.test.js`

Add `init()` that registers Foundry hooks: `updateToken` → `endPeek(id,'move')` when x/y changed for a peeking token; `updateWall` → end any door peek whose `ignoredWallIds` contains that wall when `ds`/`door` changed; `canvasTearDown` → end all. Keep handlers tiny and guard against missing globals (tests run in jsdom).

- [ ] **Step 1: Write the failing test**

```javascript
import { PeekManager } from '../../../../scripts/services/Peek/PeekManager.js';
import { PeekRegistry } from '../../../../scripts/services/Peek/PeekRegistry.js';

describe('PeekManager hook reactions', () => {
  function mgrWith() {
    const d = {
      registry: new PeekRegistry(),
      renderer: { apply: jest.fn(), clear: jest.fn() },
      socket: { sendUpdate: jest.fn(), sendEnd: jest.fn() },
      recompute: jest.fn(),
      now: () => 1,
    };
    return { d, mgr: new PeekManager(d) };
  }

  test('onTokenUpdate ends peek when position changes', () => {
    const { d, mgr } = mgrWith();
    const token = createMockToken({ id: 'p', x: 0, y: 0, width: 1, height: 1 });
    mgr.startCornerPeek(token, { x: 500, y: 0 });
    mgr.onTokenUpdate({ id: 'p' }, { x: 200 });
    expect(d.registry.has('p')).toBe(false);
  });

  test('onTokenUpdate ignores non-position changes', () => {
    const { d, mgr } = mgrWith();
    const token = createMockToken({ id: 'p', x: 0, y: 0, width: 1, height: 1 });
    mgr.startCornerPeek(token, { x: 500, y: 0 });
    mgr.onTokenUpdate({ id: 'p' }, { rotation: 90 });
    expect(d.registry.has('p')).toBe(true);
  });

  test('onWallUpdate ends a door peek that ignored that wall', () => {
    const { d, mgr } = mgrWith();
    const token = createMockToken({ id: 'p', x: -50, y: 50, width: 1, height: 1 });
    mgr.startDoorPeek(token, { id: 'door9', c: [0, 0, 0, 100] });
    mgr.onWallUpdate({ id: 'door9' }, { ds: 1 });
    expect(d.registry.has('p')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/services/peek/peek-manager.test.js -t "hook reactions"`
Expected: FAIL — `onTokenUpdate` / `onWallUpdate` undefined.

- [ ] **Step 3: Implement reaction methods + init (append to PeekManager)**

```javascript
  onTokenUpdate(doc, change) {
    if (!('x' in change) && !('y' in change)) return;
    if (this._registry.has(doc.id)) this.endPeek(doc.id, 'move');
  }

  onWallUpdate(doc, change) {
    if (!('ds' in change) && !('door' in change)) return;
    for (const id of this._registry.ids()) {
      const peek = this._registry.get(id);
      if (peek?.ignoredWallIds?.includes(doc.id)) this.endPeek(id, 'door');
    }
  }

  endAll(reason) {
    for (const id of this._registry.ids()) this.endPeek(id, reason);
  }

  init() {
    if (typeof Hooks === 'undefined') return;
    Hooks.on('updateToken', (doc, change) => this.onTokenUpdate(doc, change));
    Hooks.on('updateWall', (doc, change) => this.onWallUpdate(doc, change));
    Hooks.on('canvasTearDown', () => this.endAll('teardown'));
  }
```

In `scripts/main.js`, where `CoverVisualization` is constructed, add the production wiring (concrete collaborators from later tasks; this import set is finalized in Task 11):

```javascript
import { createPeekManager } from './services/Peek/peek-bootstrap.js';
// inside the same init block that sets up CoverVisualization:
game.modules.get(MODULE_ID).api ??= {};
game.modules.get(MODULE_ID).api.peekManager = createPeekManager();
game.modules.get(MODULE_ID).api.peekManager.init();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/services/peek/peek-manager.test.js -t "hook reactions"`
Expected: PASS (3 tests). (`peek-bootstrap.js` is created in Task 11; `main.js` import will resolve then. If running the full suite before Task 11, comment the main.js import — but prefer committing tasks in order.)

- [ ] **Step 5: Commit**

```bash
git add scripts/services/Peek/PeekManager.js scripts/main.js tests/unit/services/peek/peek-manager.test.js
git commit -m "feat(peek): wire PeekManager end-conditions to Foundry hooks"
```

---

## Phase 4 — Socket (GM mirror drives authoritative AVS)

### Task 9: Socket sender throttle + payload

**Files:**
- Create: `scripts/services/Peek/peek-socket.js`
- Test: `tests/unit/services/peek/peek-socket.test.js`

`PeekSocketSender` wraps the socket service: throttles `sendUpdate` to a max rate, rounds origin coords, only sends when origin/direction changed meaningfully, and forwards `sendEnd` immediately. Uses injected `{ emit, now }`.

- [ ] **Step 1: Write the failing test**

```javascript
import '../../../setup.js';
import { PeekSocketSender } from '../../../../scripts/services/Peek/peek-socket.js';

describe('PeekSocketSender', () => {
  function make(times) {
    let i = 0;
    const emit = jest.fn();
    const sender = new PeekSocketSender({ emit, now: () => times[i++], minIntervalMs: 100 });
    return { emit, sender };
  }

  test('rounds origin coordinates in payload', () => {
    const { emit, sender } = make([0]);
    sender.sendUpdate('t', { origin: { x: 1.6, y: 2.4 }, direction: 0, fov: 90, ignoredWallIds: [] });
    expect(emit).toHaveBeenCalledWith('PeekUpdate', expect.objectContaining({ origin: { x: 2, y: 2 } }));
  });

  test('throttles updates faster than minInterval', () => {
    const { emit, sender } = make([0, 50, 50, 200]);
    const peek = { origin: { x: 0, y: 0 }, direction: 0, fov: 90, ignoredWallIds: [] };
    sender.sendUpdate('t', { ...peek, origin: { x: 0, y: 0 } });
    sender.sendUpdate('t', { ...peek, origin: { x: 10, y: 0 } });
    sender.sendUpdate('t', { ...peek, origin: { x: 20, y: 0 } });
    expect(emit).toHaveBeenCalledTimes(2);
  });

  test('sendEnd always emits immediately', () => {
    const { emit, sender } = make([0]);
    sender.sendEnd('t');
    expect(emit).toHaveBeenCalledWith('PeekEnd', { tokenId: 't', sceneId: expect.anything() });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/services/peek/peek-socket.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```javascript
export class PeekSocketSender {
  constructor({ emit, now, minIntervalMs = 100 }) {
    this._emit = emit;
    this._now = now || (() => Date.now());
    this._minIntervalMs = minIntervalMs;
    this._last = new Map();
  }

  sendUpdate(tokenId, peek) {
    const t = this._now();
    const prev = this._last.get(tokenId);
    const origin = { x: Math.round(peek.origin.x), y: Math.round(peek.origin.y) };
    if (prev && t - prev.t < this._minIntervalMs) return;
    this._last.set(tokenId, { t });
    this._emit('PeekUpdate', {
      tokenId,
      sceneId: globalThis.canvas?.scene?.id ?? null,
      origin,
      direction: peek.direction,
      fov: peek.fov,
      ignoredWallIds: peek.ignoredWallIds ?? [],
      ts: t,
    });
  }

  sendEnd(tokenId) {
    this._last.delete(tokenId);
    this._emit('PeekEnd', { tokenId, sceneId: globalThis.canvas?.scene?.id ?? null });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/services/peek/peek-socket.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/services/Peek/peek-socket.js tests/unit/services/peek/peek-socket.test.js
git commit -m "feat(peek): add throttled peek socket sender"
```

---

### Task 10: GM socket handlers register registry + recompute

**Files:**
- Modify: `scripts/services/socket.js` (add channels + handlers; register in `register()`)
- Test: `tests/unit/services/peek/peek-socket.test.js`

GM-side handlers: `peekUpdateHandler(payload)` ignores non-GM and other-scene payloads, writes the registry, prunes stale (>1s), and recomputes the peeking token. `peekEndHandler({tokenId})` clears the registry and recomputes.

- [ ] **Step 1: Write the failing test (append)**

```javascript
import { peekUpdateHandler, peekEndHandler } from '../../../../scripts/services/socket.js';
import { peekRegistry } from '../../../../scripts/services/Peek/PeekRegistry.js';

describe('GM peek socket handlers', () => {
  afterEach(() => { peekRegistry.clearAll(); global.game.user.isGM = true; });

  test('peekUpdateHandler ignores non-GM', () => {
    global.game.user.isGM = false;
    peekUpdateHandler({ tokenId: 't', sceneId: global.canvas.scene.id, origin: { x: 1, y: 2 }, direction: 0, fov: 90, ignoredWallIds: [] });
    expect(peekRegistry.has('t')).toBe(false);
  });

  test('peekUpdateHandler ignores other scenes', () => {
    global.game.user.isGM = true;
    peekUpdateHandler({ tokenId: 't', sceneId: 'OTHER', origin: { x: 1, y: 2 }, direction: 0, fov: 90, ignoredWallIds: [] });
    expect(peekRegistry.has('t')).toBe(false);
  });

  test('peekUpdateHandler stores on this scene as GM', () => {
    global.game.user.isGM = true;
    peekUpdateHandler({ tokenId: 't', sceneId: global.canvas.scene.id, origin: { x: 1, y: 2 }, direction: 0, fov: 90, ignoredWallIds: ['w'] });
    expect(peekRegistry.get('t').ignoredWallIds).toEqual(['w']);
  });

  test('peekEndHandler clears', () => {
    global.game.user.isGM = true;
    peekRegistry.set('t', { origin: { x: 0, y: 0 }, direction: 0, fov: 90, ignoredWallIds: [] }, 1);
    peekEndHandler({ tokenId: 't', sceneId: global.canvas.scene.id });
    expect(peekRegistry.has('t')).toBe(false);
  });
});
```

Confirm `tests/setup.js` exposes `global.canvas.scene.id`; if not, add `scene: { id: 'scene1' }` to the canvas mock in the test's `beforeEach`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/services/peek/peek-socket.test.js -t "GM peek socket handlers"`
Expected: FAIL — handlers not exported.

- [ ] **Step 3: Implement in socket.js**

Add channel constants near the others (~line 47):

```javascript
const PEEK_UPDATE_CHANNEL = 'PeekUpdate';
const PEEK_END_CHANNEL = 'PeekEnd';
```

Register in `register()` (after the existing `register(...)` calls):

```javascript
    this._socket.register(PEEK_UPDATE_CHANNEL, peekUpdateHandler);
    this._socket.register(PEEK_END_CHANNEL, peekEndHandler);
```

Add the handlers and a player-side emit helper:

```javascript
export function peekUpdateHandler(payload) {
  if (!game.user?.isGM) return;
  if (!payload || payload.sceneId !== canvas?.scene?.id) return;
  const now = Date.now();
  peekRegistry.set(payload.tokenId, {
    origin: payload.origin,
    direction: payload.direction,
    fov: payload.fov,
    ignoredWallIds: payload.ignoredWallIds ?? [],
  }, now);
  peekRegistry.pruneStale(1000, now);
  recalcPeekToken(payload.tokenId);
}

export function peekEndHandler(payload) {
  if (!game.user?.isGM) return;
  if (!payload || payload.sceneId !== canvas?.scene?.id) return;
  peekRegistry.clear(payload.tokenId);
  recalcPeekToken(payload.tokenId);
}

function recalcPeekToken(tokenId) {
  try {
    game.modules.get(MODULE_ID)?.api?.autoVisibility?.updateTokens?.([tokenId]);
  } catch (e) {
    if (game.settings.get(MODULE_ID, 'debug')) console.warn(`[${MODULE_ID}] peek recalc failed`, e);
  }
}

export function emitPeekUpdate(channel, data) {
  _socketService.executeAsGM(channel === 'PeekEnd' ? PEEK_END_CHANNEL : PEEK_UPDATE_CHANNEL, data);
}
```

Add the import at the top of socket.js:

```javascript
import { peekRegistry } from './Peek/PeekRegistry.js';
```

- [ ] **Step 4: Add a GM-side periodic stale pruner (auto-expire if PeekEnd is lost)**

Add an exported starter and call it once from `register()` (guarded so it only runs on the GM, only once):

```javascript
let _peekPruneTimer = null;

export function startPeekStalePruner() {
  if (_peekPruneTimer || typeof setInterval === 'undefined') return;
  _peekPruneTimer = setInterval(() => {
    if (!game.user?.isGM) return;
    const before = peekRegistry.ids();
    peekRegistry.pruneStale(1000, Date.now());
    for (const id of before) {
      if (!peekRegistry.has(id)) recalcPeekToken(id);
    }
  }, 1000);
}
```

Call `startPeekStalePruner();` at the end of `register()`. This guarantees a peek that stopped refreshing (lost `PeekEnd`) clears within ~2s and the token recomputes clean.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest tests/unit/services/peek/peek-socket.test.js -t "GM peek socket handlers"`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add scripts/services/socket.js tests/unit/services/peek/peek-socket.test.js
git commit -m "feat(peek): add GM peek socket handlers driving AVS recompute"
```

---

## Phase 5 — Client rendering + bootstrap

### Task 11: PeekVisionSourceController + bootstrap factory

**Files:**
- Create: `scripts/services/Peek/PeekVisionSourceController.js`
- Create: `scripts/services/Peek/peek-bootstrap.js`
- Test: `tests/unit/services/peek/peek-vision-source.test.js`

The controller is the Foundry-glue seam: it overrides the controlled token's vision source origin + cone for the local client and ignores the door edge locally, then restores. Heavy Foundry behavior is verified live; the unit test pins the **contract** (idempotent clear, no token-document writes, perception refresh requested).

- [ ] **Step 1: Write the failing test**

```javascript
import '../../../setup.js';
import { PeekVisionSourceController } from '../../../../scripts/services/Peek/PeekVisionSourceController.js';

describe('PeekVisionSourceController contract', () => {
  test('apply requests vision re-init and never updates token document', () => {
    const refresh = jest.fn();
    const ctrl = new PeekVisionSourceController({ refreshPerception: refresh });
    const update = jest.fn();
    const token = {
      document: { id: 't', update, x: 0, y: 0, width: 1, height: 1, elevation: 0 },
      initializeVisionSource: jest.fn(),
    };
    ctrl.apply(token, { origin: { x: 10, y: 20 }, direction: 0, fov: 90, ignoredWallIds: [] });
    expect(token.initializeVisionSource).toHaveBeenCalled();
    expect(refresh).toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  test('clear is idempotent and never updates token document', () => {
    const refresh = jest.fn();
    const ctrl = new PeekVisionSourceController({ refreshPerception: refresh });
    const update = jest.fn();
    const token = { document: { id: 't', update }, initializeVisionSource: jest.fn() };
    ctrl.clear(token);
    ctrl.clear(token);
    expect(update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/services/peek/peek-vision-source.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

`PeekVisionSourceController.js`:

```javascript
export class PeekVisionSourceController {
  constructor({ refreshPerception } = {}) {
    this._refresh = refreshPerception || defaultRefresh;
    this._overrides = new Map();
  }

  apply(token, peek) {
    const id = token.document.id;
    this._overrides.set(id, {
      origin: peek.origin,
      direction: peek.direction,
      fov: peek.fov,
      ignoredWallIds: peek.ignoredWallIds ?? [],
    });
    this._reinitialize(token);
  }

  clear(token) {
    const id = token.document.id;
    if (!this._overrides.has(id)) return;
    this._overrides.delete(id);
    this._reinitialize(token);
  }

  getOverride(tokenId) {
    return this._overrides.get(tokenId) ?? null;
  }

  _reinitialize(token) {
    try {
      token.initializeVisionSource?.();
    } catch (_) {}
    this._refresh();
  }
}

function defaultRefresh() {
  try {
    globalThis.canvas?.perception?.update?.({ initializeVision: true, refreshVision: true });
  } catch (_) {}
}
```

Live-validation note for the implementer: the actual origin/cone override is realized by wrapping the token's vision-source initialization. Register a libWrapper on `CONFIG.Token.objectClass.prototype._initializeVisionSource` (or `Token.prototype.initializeVisionSource`) that, when `controller.getOverride(this.document.id)` exists, sets the created source's `data.x/data.y` to the override origin, `data.angle = fov`, `data.rotation` from `direction`, and temporarily removes the door edge from `canvas.edges` (restore on the next non-peek init). This wrapper is registered in `peek-bootstrap.js`. Verify visually per the live checklist; do not add unit coverage for the wrapper internals.

`peek-bootstrap.js`:

```javascript
import { peekRegistry } from './PeekRegistry.js';
import { PeekManager } from './PeekManager.js';
import { PeekVisionSourceController } from './PeekVisionSourceController.js';
import { PeekSocketSender } from './peek-socket.js';
import { emitPeekUpdate } from '../socket.js';
import { MODULE_ID } from '../../constants.js';

export function createPeekManager() {
  const renderer = new PeekVisionSourceController({});
  const sender = new PeekSocketSender({ emit: (channel, data) => emitPeekUpdate(channel, data) });
  const recompute = (tokenId) => {
    try {
      game.modules.get(MODULE_ID)?.api?.autoVisibility?.updateTokens?.([tokenId]);
    } catch (_) {}
  };
  const manager = new PeekManager({
    registry: peekRegistry,
    renderer: { apply: (t, p) => renderer.apply(t, p), clear: (t) => renderer.clear(t) },
    socket: { sendUpdate: (id, p) => sender.sendUpdate(id, p), sendEnd: (id) => sender.sendEnd(id) },
    recompute,
    now: () => Date.now(),
  });
  manager._visionController = renderer;
  return manager;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/services/peek/peek-vision-source.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/services/Peek/PeekVisionSourceController.js scripts/services/Peek/peek-bootstrap.js tests/unit/services/peek/peek-vision-source.test.js
git commit -m "feat(peek): add vision source controller and bootstrap factory"
```

---

## Phase 6 — Entry points (keybinding, door, DC, config, i18n)

### Task 12: Corner peek keybinding

**Files:**
- Modify: `scripts/constants.js` (add `KEYBINDINGS.holdPeek`)
- Modify: `scripts/settings.js` (`registerKeybindings` switch case)
- Modify: `lang/en.json` (+ cn/fr/pl) — keybinding name/hint keys
- Test: live validation (keybinding registration has no pure unit seam; covered by PeekManager tests)

- [ ] **Step 1: Add the keybinding constant**

In `scripts/constants.js`, inside the `KEYBINDINGS` object (model on `holdCoverVisualization`):

```javascript
  holdPeek: {
    name: 'PF2E_VISIONER.KEYBINDINGS.HOLD_PEEK.name',
    hint: 'PF2E_VISIONER.KEYBINDINGS.HOLD_PEEK.hint',
    editable: [],
    restricted: false,
  },
```

- [ ] **Step 2: Wire onDown/onUp**

In `scripts/settings.js` `registerKeybindings()` switch (model on the `showAutoCoverOverlay` case), add:

```javascript
      case 'holdPeek':
        keybindingConfig.onDown = () => {
          const token = canvas?.tokens?.controlled?.[0];
          if (!token || canvas.tokens.controlled.length !== 1) return;
          const mgr = game.modules.get(MODULE_ID)?.api?.peekManager;
          const mouse = canvas.app?.renderer?.events?.pointer
            ? canvas.canvasCoordinatesFromClient(canvas.app.renderer.events.pointer)
            : token.center;
          mgr?.startCornerPeek(token, mouse);
          game.modules.get(MODULE_ID)._peekKeyHeld = token.document.id;
        };
        keybindingConfig.onUp = () => {
          const mgr = game.modules.get(MODULE_ID)?.api?.peekManager;
          const id = game.modules.get(MODULE_ID)._peekKeyHeld;
          if (id) mgr?.endPeek(id, 'keyup');
          game.modules.get(MODULE_ID)._peekKeyHeld = null;
        };
        break;
```

- [ ] **Step 3: Add i18n keys to lang/en.json**

Under `PF2E_VISIONER.KEYBINDINGS`:

```json
"HOLD_PEEK": {
  "name": "Hold Peek (Corner)",
  "hint": "Hold to peek a directional cone around the nearest corner toward the cursor for the selected token."
}
```

Add matching keys to `cn.json`, `fr.json`, `pl.json` (English fallback text is acceptable until localized).

- [ ] **Step 4: Mouse-follow update during hold**

In `PeekManager.init()`, add a pointer-move reaction coalesced to one update per frame, only while a corner peek is held:

```javascript
    if (typeof canvas !== 'undefined' && canvas?.stage?.on) {
      canvas.stage.on('pointermove', () => {
        const id = game.modules.get(MODULE_ID)?._peekKeyHeld;
        if (!id) return;
        if (this._raf) return;
        this._raf = requestAnimationFrame(() => {
          this._raf = null;
          const m = canvas.mousePosition ?? canvas.app?.renderer?.events?.pointer;
          if (m) this.updatePeek(id, { x: m.x, y: m.y });
        });
      });
    }
```

Add `import { MODULE_ID } from '../../constants.js';` to PeekManager.js.

- [ ] **Step 5: Verify existing tests still pass + commit**

Run: `npx jest tests/unit/services/peek`
Expected: PASS (all peek suites).

```bash
git add scripts/constants.js scripts/settings.js scripts/services/Peek/PeekManager.js lang/en.json lang/cn.json lang/fr.json lang/pl.json
git commit -m "feat(peek): add hold-to-peek corner keybinding"
```

- [ ] **Step 6: Live validation**

Start Foundry (use `Ass Gm 2` if login needed). Bind the "Hold Peek (Corner)" key. Select one token near a corner, hold the key, move the mouse: a directional sight cone should open from the nearest corner and follow the cursor; release ends it; moving the token ends it.

---

### Task 13: Door Peek DC reader + roll

**Files:**
- Create: `scripts/services/Peek/peek-door-dc.js`
- Test: `tests/unit/services/peek/peek-door-dc.test.js`

`readPeekDC(doorDoc)` returns the numeric `flags.pf2e-visioner.peekDC` or `null`. `rollPeekCheck({ token, dc, roll })` uses an injected `roll` seam returning a degree-of-success and resolves `{ success }` (success = degree >= 2). The actual PF2e roll wiring lives behind the seam and is exercised live.

- [ ] **Step 1: Write the failing test**

```javascript
import '../../../setup.js';
import { readPeekDC, rollPeekCheck } from '../../../../scripts/services/Peek/peek-door-dc.js';

describe('peek door DC', () => {
  test('readPeekDC returns numeric flag', () => {
    const door = { getFlag: (m, k) => (m === 'pf2e-visioner' && k === 'peekDC' ? 18 : undefined) };
    expect(readPeekDC(door)).toBe(18);
  });

  test('readPeekDC returns null when unset', () => {
    const door = { getFlag: () => undefined };
    expect(readPeekDC(door)).toBeNull();
  });

  test('rollPeekCheck success when degree >= 2', async () => {
    const roll = jest.fn(async () => ({ degreeOfSuccess: 2 }));
    const out = await rollPeekCheck({ token: createMockToken({ id: 't' }), dc: 15, roll });
    expect(out.success).toBe(true);
  });

  test('rollPeekCheck failure when degree < 2', async () => {
    const roll = jest.fn(async () => ({ degreeOfSuccess: 1 }));
    const out = await rollPeekCheck({ token: createMockToken({ id: 't' }), dc: 15, roll });
    expect(out.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/services/peek/peek-door-dc.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```javascript
import { MODULE_ID } from '../../constants.js';

export function readPeekDC(doorDoc) {
  const v = doorDoc?.getFlag?.(MODULE_ID, 'peekDC');
  return typeof v === 'number' ? v : null;
}

export async function rollPeekCheck({ token, dc, roll }) {
  const result = await roll({ token, dc });
  const degree = result?.degreeOfSuccess ?? 0;
  return { success: degree >= 2, degree };
}

export async function defaultPeekRoll({ token, dc }) {
  const statistic = token?.actor?.getStatistic?.('stealth') ?? token?.actor?.perception;
  const result = await statistic?.roll?.({ dc: { value: dc }, label: game.i18n.localize('PF2E_VISIONER.PEEK.CHECK_LABEL') });
  return { degreeOfSuccess: result?.degreeOfSuccess ?? 0 };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/services/peek/peek-door-dc.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Add i18n key**

`lang/en.json` under a new `PF2E_VISIONER.PEEK`:

```json
"PEEK": {
  "CHECK_LABEL": "Peek Through Door",
  "DC_FIELD_LABEL": "Peek DC",
  "FAILED": "{name} fails to peek through the door."
}
```

Add to cn/fr/pl.

- [ ] **Step 6: Commit**

```bash
git add scripts/services/Peek/peek-door-dc.js tests/unit/services/peek/peek-door-dc.test.js lang/en.json lang/cn.json lang/fr.json lang/pl.json
git commit -m "feat(peek): add door Peek DC reader and check roll"
```

---

### Task 14: Door right-click peek + DC gate

**Files:**
- Modify: `scripts/services/Peek/PeekManager.js` (add `tryStartDoorPeek(token, doorDoc)` that reads DC, rolls if present, opens on success or posts failure)
- Modify: `scripts/hooks/ui.js` or a small new hook file `scripts/services/Peek/peek-door-control.js` — bind right-click + modifier on door controls to call the manager
- Test: `tests/unit/services/peek/peek-manager.test.js` (append `tryStartDoorPeek` cases)

- [ ] **Step 1: Write the failing test (append)**

```javascript
import { readPeekDC } from '../../../../scripts/services/Peek/peek-door-dc.js';

describe('PeekManager door DC gate', () => {
  function mgrWith(extra = {}) {
    const d = {
      registry: new (require('../../../../scripts/services/Peek/PeekRegistry.js').PeekRegistry)(),
      renderer: { apply: jest.fn(), clear: jest.fn() },
      socket: { sendUpdate: jest.fn(), sendEnd: jest.fn() },
      recompute: jest.fn(),
      now: () => 1,
      ...extra,
    };
    return { d, mgr: new (require('../../../../scripts/services/Peek/PeekManager.js').PeekManager)(d) };
  }

  test('no DC -> opens immediately', async () => {
    const { d, mgr } = mgrWith({ rollPeek: jest.fn() });
    const token = createMockToken({ id: 'p', x: -50, y: 50, width: 1, height: 1 });
    const door = { id: 'd', c: [0, 0, 0, 100], getFlag: () => undefined };
    await mgr.tryStartDoorPeek(token, door);
    expect(d.registry.has('p')).toBe(true);
    expect(d.rollPeek).not.toHaveBeenCalled();
  });

  test('DC + success -> opens', async () => {
    const rollPeek = jest.fn(async () => ({ success: true }));
    const { d, mgr } = mgrWith({ rollPeek });
    const token = createMockToken({ id: 'p', x: -50, y: 50, width: 1, height: 1 });
    const door = { id: 'd', c: [0, 0, 0, 100], getFlag: (m, k) => (k === 'peekDC' ? 12 : undefined) };
    await mgr.tryStartDoorPeek(token, door);
    expect(rollPeek).toHaveBeenCalled();
    expect(d.registry.has('p')).toBe(true);
  });

  test('DC + failure -> does not open', async () => {
    const rollPeek = jest.fn(async () => ({ success: false }));
    const { d, mgr } = mgrWith({ rollPeek });
    const token = createMockToken({ id: 'p', x: -50, y: 50, width: 1, height: 1 });
    const door = { id: 'd', c: [0, 0, 0, 100], getFlag: (m, k) => (k === 'peekDC' ? 12 : undefined) };
    await mgr.tryStartDoorPeek(token, door);
    expect(d.registry.has('p')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/services/peek/peek-manager.test.js -t "door DC gate"`
Expected: FAIL — `tryStartDoorPeek` undefined.

- [ ] **Step 3: Implement**

Update `PeekManager` constructor to accept optional `rollPeek` and `readDC` seams (default-imported), then add:

```javascript
  async tryStartDoorPeek(token, doorDoc) {
    const readDC = this._readDC || ((d) => (typeof d.getFlag?.('pf2e-visioner', 'peekDC') === 'number' ? d.getFlag('pf2e-visioner', 'peekDC') : null));
    const dc = readDC(doorDoc);
    if (dc != null && this._rollPeek) {
      const { success } = await this._rollPeek({ token, dc });
      if (!success) return false;
    }
    this.startDoorPeek(token, doorDoc);
    return true;
  }
```

In the constructor add: `this._rollPeek = deps.rollPeek; this._readDC = deps.readDC;`

Wire the real seams in `peek-bootstrap.js`:

```javascript
import { readPeekDC, rollPeekCheck, defaultPeekRoll } from './peek-door-dc.js';
// in createPeekManager deps:
  readDC: readPeekDC,
  rollPeek: ({ token, dc }) => rollPeekCheck({ token, dc, roll: defaultPeekRoll }),
```

Create `scripts/services/Peek/peek-door-control.js` to bind the interaction (registered from `PeekManager.init()` or main.js):

```javascript
import { MODULE_ID } from '../../constants.js';

export function registerDoorPeekInteraction(manager) {
  if (typeof Hooks === 'undefined') return;
  Hooks.on('renderDoorControl', (control, html) => {
    const el = html?.jquery ? html[0] : html;
    if (!el) return;
    el.addEventListener('contextmenu', async (event) => {
      if (!event.shiftKey) return;
      const token = canvas?.tokens?.controlled?.[0];
      if (!token || canvas.tokens.controlled.length !== 1) return;
      const wallDoc = control.wall?.document;
      if (!wallDoc) return;
      event.preventDefault();
      event.stopPropagation();
      await manager.tryStartDoorPeek(token, wallDoc);
    });
  });
}
```

Call `registerDoorPeekInteraction(this)` inside `PeekManager.init()`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/services/peek/peek-manager.test.js -t "door DC gate"`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/services/Peek/PeekManager.js scripts/services/Peek/peek-bootstrap.js scripts/services/Peek/peek-door-control.js tests/unit/services/peek/peek-manager.test.js
git commit -m "feat(peek): add shift+right-click door peek with DC gate"
```

- [ ] **Step 6: Live validation**

In Foundry, on a closed door with no Peek DC: shift+right-click the door control while one token is selected → a slit opens through the door; opening/closing the door ends it. Set `flags.pf2e-visioner.peekDC` on the door (via Task 15 UI), repeat → a check is rolled; success opens, failure does not.

---

### Task 15: Peek DC field in wall/door config

**Files:**
- Modify: `scripts/hooks/ui.js` (`renderWallConfig` injection block ~line 2287)
- Modify: `lang/en.json` (+ cn/fr/pl) — already added `PEEK.DC_FIELD_LABEL` in Task 13
- Test: live validation (DOM-injection has no pure unit seam; the reader `readPeekDC` is already unit-tested in Task 13)

- [ ] **Step 1: Add a Peek DC number input to the Visioner wall fieldset**

In the existing `onRenderWallConfig` injection (where the `.pf2e-visioner-wall-settings` fieldset is built), add a row only when the wall is a door (`Number(app.document?.door) > 0`):

```javascript
      const isDoor = Number(app.document?.door) > 0;
      if (isDoor) {
        const current = app.document?.getFlag?.(MODULE_ID, 'peekDC');
        const row = document.createElement('div');
        row.className = 'form-group';
        row.innerHTML = `
          <label>${game.i18n.localize('PF2E_VISIONER.PEEK.DC_FIELD_LABEL')}</label>
          <input type="number" name="flags.${MODULE_ID}.peekDC" value="${current ?? ''}" step="1" min="0" />
        `;
        fs.appendChild(row);
      }
```

Foundry's WallConfig form submission persists `flags.<module>.peekDC` automatically because the input `name` is a flag path; clearing the field stores `null`.

- [ ] **Step 2: Live validation**

Open a door's wall config → a "Peek DC" number field appears in the PF2E Visioner section. Enter `15`, save, reopen → value persists. Confirm `wallDoc.getFlag('pf2e-visioner','peekDC') === 15` in the console. A non-door wall shows no Peek DC field.

- [ ] **Step 3: Commit**

```bash
git add scripts/hooks/ui.js
git commit -m "feat(peek): add Peek DC field to door wall config"
```

---

### Task 16: Full suite + final wiring check

**Files:** none new

- [ ] **Step 1: Run the whole unit suite**

Run: `npx jest tests/unit/services/peek`
Expected: PASS — all peek suites green.

- [ ] **Step 2: Run the broader suite for regressions**

Run: `npx jest tests/unit`
Expected: PASS — pre-existing suites unaffected (especially PositionManager, VisionAnalyzer, socket). If a pre-existing test fails, do not modify it; fix the integration so non-peek paths are unchanged.

- [ ] **Step 3: End-to-end live validation (spec checklist)**

In Foundry (use `Ass Gm 2` if login needed), with a player client and a GM client open:
- Corner: player holds peek key near a corner → cone follows mouse, walls clip it, ends on release and on token move.
- Door no-DC: shift+right-click closed door → slit opens through it; open/close door ends it.
- Door with DC: set Peek DC 15 → roll happens; success opens, failure posts the failure chat line and does not open.
- AVS: an enemy inside the cone becomes `observed` on the GM client with correct cover; ending the peek reverts the state. Confirm the peeking token never moved (its document x/y unchanged).

- [ ] **Step 4: Commit any final wiring fixes**

```bash
git add -A
git commit -m "test(peek): full suite green; finalize peek wiring"
```

---

## Notes for the implementer

- **Single source of truth:** the `peekRegistry` singleton is shared by `PositionManager`, `VisionAnalyzer`, the client `PeekManager`, and the GM socket handlers. Never duplicate peek state elsewhere.
- **Never write the token document.** All overrides are registry entries (data) + local vision re-init. Any code path that calls `token.document.update(...)` for peek is a bug.
- **Client vs GM:** rendering (vision source override) is local to the peeking client; AVS state writes happen only on the GM client, fed by the socket. The registry on each client only reflects peeks that client knows about.
- **i18n:** every new user-facing string uses a `PF2E_VISIONER.*` key present in `lang/en.json` (and added to cn/fr/pl). No literal strings in code.
- **No comments** in production files (project rule). Keep functions small.
- **Live-only seams:** the vision-source wrapper internals (Task 11) and DOM injections (Task 15) are validated live, not unit-tested; everything else is TDD.
