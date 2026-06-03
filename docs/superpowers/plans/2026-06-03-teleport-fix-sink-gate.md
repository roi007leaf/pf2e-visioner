# Teleport Fix via Sink-Level Gate (Phase 2a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop a moving token from teleporting to its destination when AVS persists a visibility/detection/cover flag mid-animation, by making the existing token-write deferral guard recognize Foundry v13's visual movement tween.

**Architecture:** Visibility and detection persistence already `await waitForTokenDocumentUpdateSafe(token)` before writing (`visibility-profile-flag-persistence.js:270`, `token-flag-map-persistence.js:123/168`). That guard polls `shouldDeferTokenDocumentUpdate(token)` until the token settles, then the write proceeds (so deferred writes are NOT dropped — they resume after the tween, bounded by the guard's built-in 3000ms timeout). The guard is v13-blind: `isTokenActivelyAnimating` only checks `token._animation` (empty in v13) and the render/document delta is 0 in v13 (`token.x` getter returns `document.x`). Fixing the guard to also check `token.movementAnimationPromise` makes every guard-aware persist path defer until the visual move completes. Cover persistence bypasses the guard, so it gets the await added too.

**Tech Stack:** Foundry VTT v13 module (ES modules), Jest unit tests, Playwright MCP for live verification.

---

## File Structure

- Modify: `scripts/stores/document-update-guard.js` — `isTokenActivelyAnimating` recognizes `movementAnimationPromise` (central fix; flows into `shouldDeferTokenDocumentUpdate` → `waitForTokenDocumentUpdateSafe`).
- Modify: `scripts/stores/cover-map.js` — `setCoverMap` awaits `waitForTokenDocumentUpdateSafe(token)` before writing (the one persist path that bypasses the guard).
- Create: `tests/unit/stores/document-update-guard.test.js` — unit tests for the v13 detection.
- Create: `tests/unit/stores/cover-map-defer.test.js` — unit test that `setCoverMap` defers via the guard.

Why this is enough (covers all confirmed teleport paths):
- visibilityV2 writes → `setPerceptionProfileFlag` awaits the guard (line 270). ✓
- detection writes → `flushDetectionBatch`/`persistDetectionMap` pass `waitForToken: waitForTokenDocumentUpdateSafe`, awaited in `applyTokenFlagUpdatePasses`/`setTokenFlagMap`. ✓
- the ~600ms culprit (`AvsMovementInvalidationWorkflow.#scheduleFinalVisibilityReconciliation` → `setVisibilityBetween`) routes through `setPerceptionProfileFlag`, so it inherits the guard. ✓
- cover writes → fixed by Task 2. ✓

---

## Task 1: Make the write-deferral guard recognize v13 movement tween

**Files:**
- Modify: `scripts/stores/document-update-guard.js:5-11`
- Create: `tests/unit/stores/document-update-guard.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/stores/document-update-guard.test.js`:

```js
import '../../setup.js';
import {
  isTokenActivelyAnimating,
  shouldDeferTokenDocumentUpdate,
} from '../../../scripts/stores/document-update-guard.js';

describe('document-update-guard - v13 movement tween detection', () => {
  test('isTokenActivelyAnimating is true when only movementAnimationPromise is set (v13)', () => {
    const token = {
      object: {
        _animation: null,
        x: 100,
        y: 100,
        movementAnimationPromise: new Promise(() => {}),
      },
      x: 100,
      y: 100,
    };
    expect(isTokenActivelyAnimating(token)).toBe(true);
  });

  test('isTokenActivelyAnimating is false when no animation and no movement promise', () => {
    const token = { object: { _animation: null, x: 100, y: 100 }, x: 100, y: 100 };
    expect(isTokenActivelyAnimating(token)).toBe(false);
  });

  test('shouldDeferTokenDocumentUpdate defers during a v13 tween even when render==document position', () => {
    // v13: token.x (render) equals document.x (destination) during the tween,
    // so the render/document delta is 0; only movementAnimationPromise signals motion.
    const token = {
      object: {
        _animation: null,
        x: 500,
        y: 500,
        movementAnimationPromise: new Promise(() => {}),
      },
      x: 500,
      y: 500,
    };
    expect(shouldDeferTokenDocumentUpdate(token)).toBe(true);
  });

  test('shouldDeferTokenDocumentUpdate does not defer a settled token', () => {
    const token = { object: { _animation: null, x: 500, y: 500 }, x: 500, y: 500 };
    expect(shouldDeferTokenDocumentUpdate(token)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest tests/unit/stores/document-update-guard.test.js`
Expected: the two "v13" tests FAIL — `isTokenActivelyAnimating` currently returns `false` for a token with only `movementAnimationPromise`, so `shouldDeferTokenDocumentUpdate` returns `false`. The two "settled/no-animation" tests pass.

- [ ] **Step 3: Make the guard v13-aware**

In `scripts/stores/document-update-guard.js`, replace:

```js
export function isTokenActivelyAnimating(token) {
  const renderableToken = getRenderableToken(token);
  const animation = renderableToken?._animation;
  if (!animation) return false;
  if (animation.state === 'completed') return false;
  return !!(animation.promise || animation.active || animation.state !== undefined);
}
```

with:

```js
export function isTokenActivelyAnimating(token) {
  const renderableToken = getRenderableToken(token);
  const movementPromise = renderableToken?.movementAnimationPromise;
  if (movementPromise && typeof movementPromise.then === 'function') return true;
  const animation = renderableToken?._animation;
  if (!animation) return false;
  if (animation.state === 'completed') return false;
  return !!(animation.promise || animation.active || animation.state !== undefined);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest tests/unit/stores/document-update-guard.test.js`
Expected: all 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/stores/document-update-guard.js tests/unit/stores/document-update-guard.test.js
git commit -m "fix(avs): defer token flag writes during v13 movement tween (movementAnimationPromise)"
```
End the message with: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## Task 2: Route cover-map persistence through the deferral guard

**Files:**
- Modify: `scripts/stores/cover-map.js`
- Create: `tests/unit/stores/cover-map-defer.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/stores/cover-map-defer.test.js`:

```js
import '../../setup.js';

const waitForTokenDocumentUpdateSafe = jest.fn(() => Promise.resolve());
jest.mock('../../../scripts/stores/document-update-guard.js', () => ({
  waitForTokenDocumentUpdateSafe: (...args) => waitForTokenDocumentUpdateSafe(...args),
}));

import { setCoverMap } from '../../../scripts/stores/cover-map.js';

describe('cover-map - defers writes during movement', () => {
  beforeEach(() => {
    waitForTokenDocumentUpdateSafe.mockClear();
    global.game = { ...(global.game || {}), user: { isGM: true } };
  });

  test('setCoverMap awaits the movement guard before writing the flag', async () => {
    const order = [];
    waitForTokenDocumentUpdateSafe.mockImplementation(async () => { order.push('guard'); });
    const token = {
      document: {
        id: 'tok-1',
        getFlag: jest.fn(() => ({})),
        update: jest.fn(async () => { order.push('update'); }),
        unsetFlag: jest.fn(async () => { order.push('unset'); }),
      },
    };

    await setCoverMap(token, { 'target-1': 'standard' });

    expect(waitForTokenDocumentUpdateSafe).toHaveBeenCalledWith(token);
    expect(order[0]).toBe('guard');
    expect(order).toContain('update');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest tests/unit/stores/cover-map-defer.test.js`
Expected: FAIL — `setCoverMap` does not call `waitForTokenDocumentUpdateSafe`, so the `toHaveBeenCalledWith` assertion fails (and `order[0]` is `'update'`, not `'guard'`).

- [ ] **Step 3: Add the import and the await**

In `scripts/stores/cover-map.js`, add the import after the existing `MODULE_ID` import (line 5):

```js
import { waitForTokenDocumentUpdateSafe } from './document-update-guard.js';
```

Then in `setCoverMap`, add the guard await immediately after the GM check and before computing the write (i.e. right after `if (!game.user.isGM) return;`):

```js
  await waitForTokenDocumentUpdateSafe(token);
```

So the top of `setCoverMap` reads:

```js
export async function setCoverMap(token, coverMap) {
  if (!token?.document) return;
  // Only GMs can update token documents
  if (!game.user.isGM) return;

  await waitForTokenDocumentUpdateSafe(token);

  const normalizedCoverMap = coverMap && typeof coverMap === 'object' ? coverMap : {};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest tests/unit/stores/cover-map-defer.test.js`
Expected: PASS.

- [ ] **Step 5: Run the full stores + avs + services suites for regressions**

Run: `npx jest tests/unit/stores tests/unit/avs tests/unit/services`
Expected: PASS except the SAME 3 pre-existing unrelated failures (`batch-result-render-lock-workflow.test.js` ×2, `pending-movement-current-view-soundwave.test.js` ×1). No NEW failures. If a new failure appears, investigate (do not modify unrelated tests to pass).

- [ ] **Step 6: Commit**

```bash
git add scripts/stores/cover-map.js tests/unit/stores/cover-map-defer.test.js
git commit -m "fix(cover): defer cover-map writes during movement via document-update guard"
```
End the message with: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## Task 3: Live verification (Playwright, running world) — CONTROLLER ONLY

Done by the controller (holds the browser session); not a subagent task. Requires the running world (https://127.0.0.1:30000, world "Kingmaker", GM "Ass Gm", pw `123`). Reload the page first (Foundry doesn't cache-bust ES modules). Bring the tab to the foreground (background tabs throttle rAF to ~1Hz and corrupt the measurement).

- [ ] **Step 1: Confirm the fixed code is served** — fetch `/modules/pf2e-visioner/scripts/stores/document-update-guard.js?b=<ts>` and assert it contains `movementAnimationPromise`.

- [ ] **Step 2: Run the teleport harness 5×** (Silva `RGHWciZ6V1BY7KwD`, +1400/+1400 diagonal, `animate:true`). For each run record: `tweenMs` (await `silva.movementAnimationPromise`), `stopAnimDuringTween` (hook `Token.prototype.stopAnimation`, count calls where `this.movementAnimationPromise` is truthy), `maxJumpPx` (max per-frame `mesh.position` delta), `soundwaveSeen`, `fpsMed`.

Expected after fix: every run `stopAnimDuringTween === 0`, `maxJumpPx` small (≈ one grid step), `tweenMs` ≈ the full ~1600–1700ms (not cut to ~600ms), `soundwaveSeen: true` (state still settles at move-end), `fpsMed` comparable to baseline. Restore Silva to {4000,2400} afterward.

- [ ] **Step 3: (Optional) Confirm visibility settles at move-end** — after a move that should reveal/hear a creature, verify the soundwave/visibility appears within a short time after the tween completes.

---

## Self-Review

- **Spec coverage:** Implements the spec's "gate AVS persistence at the sink" intent (the decisive teleport fix folded into Phase 2). Stripping of during-move machinery (spec Phase 2/3) is out of scope for this plan — separate follow-on plans.
- **Placeholder scan:** none; all steps have concrete code/commands.
- **Type/name consistency:** `isTokenActivelyAnimating`, `shouldDeferTokenDocumentUpdate`, `waitForTokenDocumentUpdateSafe`, `getRenderableToken`, `setCoverMap` all match existing symbols. `waitForTokenDocumentUpdateSafe` is exported from `document-update-guard.js` (already imported by detection-map/visibility-map/visibility-profile-flag-persistence).
- **Back-compat:** additive; tokens without `movementAnimationPromise` behave exactly as before. The guard's existing 3000ms timeout prevents any hang if a promise never clears.
- **Re-flush:** automatic — guard-aware persist paths `await` the guard then write; no dropped writes, no separate re-flush wiring.

## Pre-commit hook note

The husky pre-commit hook runs `eslint .`; `output/` is already lint-ignored (committed `9543bea`). If a commit is blocked by lint in files you did NOT edit, stop and report — do not use `--no-verify` or edit unrelated files.
