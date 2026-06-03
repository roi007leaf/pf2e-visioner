> **SUPERSEDED (2026-06-03):** The `movementAnimationPromise`-gating approach below
> was implemented, reviewed, and live-tested — but proved insufficient (the mid-tween
> AVS persist reaches the moving token via additional trigger paths + a timing race).
> All patches were reverted (commit `5516da2`). The teleport is now folded into the
> Phase 2 simplification, fixed at the persistence **sink** (skip flag writes to any
> token with a pending `movementAnimationPromise`, re-flush on resolve). Kept for record.

# Teleport Fix (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop a moving token from teleporting to its destination when AVS persists a visibility/detection flag mid-animation, by deferring movement finalization until Foundry v13's visual movement tween (`token.movementAnimationPromise`) settles.

**Architecture:** `TokenEventHandler` already has a "defer finalize until visual settle" path, but it detects the in-flight animation via the v11/v12 `token._animation`/`token.animation` API and via `visualPositionReached(token)`, which reads `token.x`/`token.y`. In Foundry v13 `token.x` is a getter returning `document.x` — already the destination during animation — so the gate reports "arrived" immediately and finalization (and the AVS persist it triggers) fires mid-tween. That document write makes Foundry's `#onUpdateAnimation` call `stopAnimation()` → snap. Fix: also gate the defer decision and the settle-wait on `token.movementAnimationPromise` (the v13 authoritative visual-tween promise).

**Tech Stack:** Foundry VTT v13 module (ES modules), Jest unit tests (`tests/unit`, `tests/setup.js`), Playwright MCP for live verification.

---

## File Structure

- Modify: `scripts/visibility/auto-visibility/core/TokenEventHandler.js`
  - Add module-local helper `getMovementAnimationPromise(token)` (next to `getActiveMovementAnimation`, ~line 28-33).
  - `_shouldDeferFinalizeUntilVisualSettled` (~line 417-423): defer when a v13 movement tween promise is pending.
  - `_waitForMovementVisualToSettle` (~line 379-415): await the v13 movement tween promise inside the settle loop.
- Test: `tests/unit/avs/avs.token-event-handler-animation.test.js`
  - Add one test reproducing the v13 case (token doc already at destination, movement tween still pending).

No other files change in Phase 1. The fix is intentionally additive and back-compatible: when `token.movementAnimationPromise` is absent (v11/v12, or unit mocks that don't set it), behavior is unchanged.

---

## Task 1: Failing test — defer finalize while v13 movement tween is pending

**Files:**
- Test: `tests/unit/avs/avs.token-event-handler-animation.test.js` (append inside the existing `describe` block, before its closing `});` at the end of file)

- [ ] **Step 1: Write the failing test**

Append this test as the last test in the existing `describe('TokenEventHandler - animation detection on position change', ...)` block (immediately before the final `});`):

```js
  test('final move defers while v13 movement tween is pending even though token doc is already at destination', async () => {
    jest.useFakeTimers();
    const invalidationCoordinator = { invalidate: jest.fn(() => true) };
    handler = new TokenEventHandler(
      systemState,
      visibilityState,
      spatialAnalyzer,
      exclusionManager,
      overrideValidationManager,
      positionManager,
      cacheManager,
      batchOrchestrator,
      invalidationCoordinator,
    );

    let resolveMovement;
    const movementAnimationPromise = new Promise((resolve) => {
      resolveMovement = resolve;
    });

    // v13: token.x/token.y are the document (destination) coords during animation,
    // while the visual tween is still represented by movementAnimationPromise.
    const tokenDoc = makeTokenDoc({
      object: {
        x: 100,
        y: 100,
        _animation: null,
        _dragHandle: null,
        movementAnimationPromise,
        actor: { id: 'actor-1', items: [] },
      },
    });
    global.canvas.tokens.get = jest.fn(() => ({ document: tokenDoc }));

    const result = await handler._finalizeCompletedMovement(
      tokenDoc,
      { x: 100, y: 100 },
      { options: {}, userId: 'user-1' },
    );

    expect(result).toBe(false);
    await jest.advanceTimersByTimeAsync(300);
    expect(invalidationCoordinator.invalidate).not.toHaveBeenCalled();

    // Visual tween completes.
    tokenDoc.object.movementAnimationPromise = null;
    resolveMovement();
    await movementAnimationPromise;
    await jest.advanceTimersByTimeAsync(50);
    for (let i = 0; i < 8; i += 1) {
      await Promise.resolve();
    }

    expect(invalidationCoordinator.invalidate).toHaveBeenCalledWith({
      reason: 'token-movement-completed',
      document: tokenDoc,
      changeData: { x: 100, y: 100 },
      options: {},
      userId: 'user-1',
    });

    jest.useRealTimers();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest tests/unit/avs/avs.token-event-handler-animation.test.js -t "v13 movement tween is pending"`

Expected: FAIL. With current code, `_shouldDeferFinalizeUntilVisualSettled` calls `visualPositionReached(token, {x:100,y:100})`; since `token.x===100` and `token.y===100`, it returns `true`, so the method returns `false` (no defer). `_finalizeCompletedMovement` therefore returns `true` (not `false`) and calls `invalidate` immediately — failing both the `expect(result).toBe(false)` and the `expect(...).not.toHaveBeenCalled()` assertions.

- [ ] **Step 3: Commit the failing test**

```bash
git add tests/unit/avs/avs.token-event-handler-animation.test.js
git commit -m "test(avs): reproduce mid-tween finalize teleport (v13 movementAnimationPromise)"
```

(If the pre-commit hook fails on UNRELATED files under `output/playwright/*.mjs`, see "Pre-commit hook note" at the end of this plan before committing.)

---

## Task 2: Add the v13 movement-tween helper and gate the defer decision

**Files:**
- Modify: `scripts/visibility/auto-visibility/core/TokenEventHandler.js`

- [ ] **Step 1: Add the helper next to `getActiveMovementAnimation`**

Find (around line 28-33):

```js
function getActiveMovementAnimation(token) {
  if (!token) return null;
  if (movementAnimationIsRunning(token._animation)) return token._animation;
  if (movementAnimationIsRunning(token.animation)) return token.animation;
  return null;
}
```

Insert immediately AFTER that function:

```js
function getMovementAnimationPromise(token) {
  const promise = token?.movementAnimationPromise;
  return promise && typeof promise.then === 'function' ? promise : null;
}
```

- [ ] **Step 2: Gate `_shouldDeferFinalizeUntilVisualSettled` on the v13 tween**

Find (around line 417-423):

```js
  _shouldDeferFinalizeUntilVisualSettled(tokenDoc, movementChanges, context = {}) {
    if (context?.allowUnsettledFinalize) return false;
    if (context?.options?.animate === false || context?.options?.animation === false) return false;
    const token = tokenDoc?.object;
    if (!token) return false;
    return !visualPositionReached(token, movementChanges);
  }
```

Replace with (adds the `getMovementAnimationPromise` check after the existing guards):

```js
  _shouldDeferFinalizeUntilVisualSettled(tokenDoc, movementChanges, context = {}) {
    if (context?.allowUnsettledFinalize) return false;
    if (context?.options?.animate === false || context?.options?.animation === false) return false;
    const token = tokenDoc?.object;
    if (!token) return false;
    if (getMovementAnimationPromise(token)) return true;
    return !visualPositionReached(token, movementChanges);
  }
```

Note: the `allowUnsettledFinalize` short-circuit (line 1) ensures the second finalize call made from the defer loop (`_deferPositionUpdateUntilAnimationSettles` passes `allowUnsettledFinalize: true`) does NOT re-defer, so finalization completes after the tween settles.

- [ ] **Step 3: Run the new test (expect still failing on the wait, but no longer finalizing early)**

Run: `npx jest tests/unit/avs/avs.token-event-handler-animation.test.js -t "v13 movement tween is pending"`

Expected: the `expect(result).toBe(false)` and `not.toHaveBeenCalled()` assertions now PASS, but the final `toHaveBeenCalledWith` may still FAIL because the settle loop does not yet await `movementAnimationPromise` (it relies on `_animation`, which is null here, so it polls until `visualPositionReached` is true). `visualPositionReached` is already true (token at 100,100), so it may actually pass here — but Task 3 makes the wait correct and deterministic regardless. Proceed to Task 3.

---

## Task 3: Await the v13 movement tween inside the settle loop

**Files:**
- Modify: `scripts/visibility/auto-visibility/core/TokenEventHandler.js`

- [ ] **Step 1: Await `movementAnimationPromise` in `_waitForMovementVisualToSettle`**

Find (around line 387-402), the top of the `while` loop:

```js
    while (Date.now() - startedAt < MOVEMENT_VISUAL_SETTLE_MAX_MS) {
      const token = tokenDoc?.object || canvas.tokens?.get(tokenDoc?.id)?.document?.object;
      activeAnimation = getActiveMovementAnimation(token);
      if (
        activeAnimation?.promise &&
        activeAnimation.state !== 'completed' &&
        !watchedAnimationPromises.has(activeAnimation.promise)
      ) {
        watchedAnimationPromises.add(activeAnimation.promise);
        try {
          await activeAnimation.promise;
        } catch {
          /* ignore animation errors */
        }
        continue;
      }
```

Replace with (adds the v13 tween-await block immediately after `const token = ...`):

```js
    while (Date.now() - startedAt < MOVEMENT_VISUAL_SETTLE_MAX_MS) {
      const token = tokenDoc?.object || canvas.tokens?.get(tokenDoc?.id)?.document?.object;

      const movementAnimationPromise = getMovementAnimationPromise(token);
      if (movementAnimationPromise && !watchedAnimationPromises.has(movementAnimationPromise)) {
        watchedAnimationPromises.add(movementAnimationPromise);
        try {
          await movementAnimationPromise;
        } catch {
          /* ignore animation errors */
        }
        continue;
      }

      activeAnimation = getActiveMovementAnimation(token);
      if (
        activeAnimation?.promise &&
        activeAnimation.state !== 'completed' &&
        !watchedAnimationPromises.has(activeAnimation.promise)
      ) {
        watchedAnimationPromises.add(activeAnimation.promise);
        try {
          await activeAnimation.promise;
        } catch {
          /* ignore animation errors */
        }
        continue;
      }
```

- [ ] **Step 2: Run the new test to verify it passes**

Run: `npx jest tests/unit/avs/avs.token-event-handler-animation.test.js -t "v13 movement tween is pending"`

Expected: PASS. The settle loop now awaits `movementAnimationPromise`; once the test resolves it and clears `tokenDoc.object.movementAnimationPromise`, the loop re-checks, `visualPositionReached` is true (token at 100,100), settle returns true, and the deferred finalize invokes `invalidate` with `reason: 'token-movement-completed'`.

- [ ] **Step 3: Run the full animation test file to verify no regressions**

Run: `npx jest tests/unit/avs/avs.token-event-handler-animation.test.js`

Expected: PASS — all existing tests (which set `_animation`/`animation` and never set `movementAnimationPromise`) are unaffected because `getMovementAnimationPromise` returns `null` for them.

- [ ] **Step 4: Run the broader AVS + services unit suites**

Run: `npx jest tests/unit/avs tests/unit/services`

Expected: PASS. If any test fails, do NOT modify the test to pass — investigate the implementation change.

- [ ] **Step 5: Commit the fix**

```bash
git add scripts/visibility/auto-visibility/core/TokenEventHandler.js
git commit -m "fix(avs): defer movement finalize until v13 movementAnimationPromise settles"
```

---

## Task 4: Live verification (Playwright, running world)

This confirms the real-world teleport is gone and FPS is unaffected. Requires the running Foundry world (https://127.0.0.1:30000, world "Kingmaker", GM user "Ass Gm", password `123`). Reload the page first so the new code loads (Foundry does not cache-bust ES modules — a full page reload is required).

- [ ] **Step 1: Reload and confirm the fixed code is served**

In the page console (or via Playwright `browser_evaluate`):

```js
await fetch('/scripts/foundry.mjs'); // warm
const t = await fetch('/modules/pf2e-visioner/scripts/visibility/auto-visibility/core/TokenEventHandler.js?b=' + Date.now()).then(r => r.text());
return { hasFix: t.includes('getMovementAnimationPromise') };
```

Expected: `{ hasFix: true }`. If false, hard-reload the page.

- [ ] **Step 2: Run the teleport harness 4× (Silva, 7-square diagonal into the occluded area)**

```js
async () => {
  const ID = 'RGHWciZ6V1BY7KwD';                 // Silva
  const silva = canvas.tokens.get(ID);
  const s = { x: 4000, y: 2400 };
  const runs = [];
  for (let run = 0; run < 4; run++) {
    await silva.document.update({ x: s.x, y: s.y }, { animate: false });
    await silva.control({ releaseOthers: true });
    await new Promise(r => setTimeout(r, 450));
    const samples = []; let running = true; const t0 = performance.now(); let filterSeen = false;
    const tick = () => {
      if (!running) return;
      const m = silva.mesh;
      samples.push({ vx: m ? Math.round(m.position.x) : 0, vy: m ? Math.round(m.position.y) : 0, fps: canvas.app.ticker.FPS });
      if (!filterSeen && canvas.tokens.placeables.some(t => t.id !== ID && (t.detectionFilter || (t.detectionFilterMesh && (t.detectionFilterMesh.visible || t.detectionFilterMesh.renderable))))) filterSeen = true;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    await silva.document.update({ x: s.x + 1400, y: s.y + 1400 }, { animate: true });
    await new Promise(r => setTimeout(r, 2400));
    running = false;
    let maxJump = 0;
    for (let i = 1; i < samples.length; i++) maxJump = Math.max(maxJump, Math.hypot(samples[i].vx - samples[i-1].vx, samples[i].vy - samples[i-1].vy));
    const fps = samples.map(x => x.fps).filter(Boolean).sort((a,b)=>a-b);
    runs.push({ run, maxJumpPx: Math.round(maxJump), soundwaveSeen: filterSeen, fpsMin: +fps[0]?.toFixed(1), fpsMed: +fps[Math.floor(fps.length/2)]?.toFixed(1) });
  }
  await silva.document.update({ x: s.x, y: s.y }, { animate: false });
  return { runs };
}
```

Expected: every run `maxJumpPx` is small (roughly one grid step, ≤ ~200px), NOT ~1300px. `soundwaveSeen: true` confirms the state-change path still fires. `fpsMed` comparable to baseline (~80+ on this machine; do not regress).

- [ ] **Step 2b: Restore Silva** (the harness already moves it back to {4000,2400}; confirm `silva.document.x===4000`).

---

## Self-Review

- **Spec coverage:** Implements spec Phase 1 ("delay AVS persist until visual tween settles" via `token.movementAnimationPromise`). Phases 2-3 are out of scope for this plan (separate plans).
- **Placeholder scan:** No TBD/TODO; all steps contain concrete code/commands.
- **Type/name consistency:** `getMovementAnimationPromise` defined in Task 2 Step 1, used in Task 2 Step 2 and Task 3 Step 1. `_shouldDeferFinalizeUntilVisualSettled`, `_waitForMovementVisualToSettle`, `_deferPositionUpdateUntilAnimationSettles`, `visualPositionReached`, `getActiveMovementAnimation`, `MOVEMENT_VISUAL_SETTLE_MAX_MS`, `watchedAnimationPromises` all match existing symbols in TokenEventHandler.js.
- **Back-compat:** Additive; no behavior change when `movementAnimationPromise` is absent. Existing tests unaffected.

## Pre-commit hook note

The repo's husky pre-commit hook runs `eslint .` across the whole tree. There are PRE-EXISTING lint errors in `output/playwright/*.mjs` (e.g. `'CanvasAnimation' is not defined`) that are unrelated to this change and will block commits. Do NOT fix those files as part of this plan and do NOT use `--no-verify` without the maintainer's go-ahead. If commits are blocked, ask the maintainer how they want to handle it (options: add `output/playwright/` to `.eslintignore`, or allow `--no-verify` for these commits).
