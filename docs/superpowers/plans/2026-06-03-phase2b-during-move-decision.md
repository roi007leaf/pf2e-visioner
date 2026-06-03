# Phase 2b: Reduce During-Move Soundwave/Sight-Line Decision Cost

Date: 2026-06-03
Status: Plan (profile-backed). Recommended for a fresh, focused session.

## Problem (the LOS jank)

Moving any token is visibly janky in LOS. Reliable measurement (frame pacing, median of 5 runs): visioner roughly **doubles** the number of >20ms frame-hitches during a move (~31 vs ~14 with AVS off). FPS is otherwise fine; the suppression already prevents big spikes — the cost is many small hitches spread through every move.

## Root cause (V8 CPU profile of one ~1.7s move, captured via CDP Profiler)

Visioner's **per-frame during-move soundwave/sight-line decision computation** dominates (~326ms over the move):

Position-DEPENDENT (recompute every frame because the token moves) — ~135ms:
- `lineIntersectsWallDocument` (pending-token-movement.js:1242) — 82ms
- `currentPendingMovementSightLineSeesTargetUncached` (pending-token-movement.js:1015) — 53ms

Position-INDEPENDENT (recomputed every frame uselessly; invariant during a move) — ~118ms:
- `actorHasConditionSlug` (sense-distance.js:20) — 70ms
- `getActiveSceneHearingRange` (scene-hearing-range.js:55) — 48ms

Plus: `scan` (pending-movement-detection-filter-visuals.js:114) 39ms, `observerHasUsableSight` (pending-movement-observer-senses.js:157) 22ms, `hiddenSoundwaveShouldSurviveSightBlockedSoundOpen` 15ms, etc.

These run to drive the during-move soundwave / detection-filter visual decisions for current-view observers, via the token-refresh path (`wrapTokenRefreshVisibility`) and the current-view soundwave controller. The declarative `_canDetect` wrapper itself is cheap (~0.2%) — it reads stored state; it is NOT the cost and should stay.

Note: `currentPendingMovementSightLineSeesTarget` is already cached per-evaluation-scope (`cachePendingMovementEvaluation('currentSightLine', observerTargetEvaluationKey(...))`, line 1067-1075) — but the scope resets each refresh, so it recomputes every frame as the position changes.

## Target (maintainer-approved model)

During a move, **rely on Foundry core LOS for visuals**; do NOT recompute visioner's soundwave/sight-line decisions per frame. Keep `undetected` hidden via the declarative `_canDetect` wrapper (stored state, cheap). **Settle** visioner's soundwave/visibility state at move-end (already the case for AVS persistence). Preserve the special cases in
docs/superpowers/specs/2026-06-03-pending-movement-simplification-design.md (invisible creatures, darkness/soundwave, GM overrides, peek/cover).

## The blocker to fix FIRST: a correctness harness

The existing 4168 unit tests check single fixed positions; **none exercise a multi-frame move**, so they cannot catch a stale-visibility regression introduced by throttling/quantizing the during-move decision. Live frame-measurement is too noisy to gate on. Therefore, before optimizing:

**Task 0 — build a cross-frame movement correctness harness** (unit or integration):
- Simulate a multi-step move (a sequence of observer positions along a route).
- At each step, compare the throttled/optimized decision (sight-line-sees-target, soundwave on/off, undetected-hidden) against a fresh full recompute.
- Assert they match within the allowed move-end-settle tolerance (e.g., decisions may lag by at most one quantization cell / TTL window, and MUST converge at move-end).
- This harness is the gate for every optimization below.

## Optimization increments (each gated by Task 0 harness + full suite + live frame-hitch median)

1. **Position-independent caches (safe, ~118ms / 36%).**
   - `getActiveSceneHearingRange`: cache by scene object (WeakMap), invalidate on `updateScene`. Add a fast path that reads the active scene first and returns before scanning all scenes.
   - `actorHasConditionSlug`: cache by actor object (WeakMap) keyed by slug, invalidated by a module-level generation counter bumped on `createItem`/`deleteItem`/`updateItem`. (Verify against the harness + the deafened-detection-wrapper tests — those mutate `hasCondition` mocks, so confirm no stale reads within a test.)

2. **Position-quantized cross-frame cache for the sight-line decision (~135ms).**
   - Add a cross-frame cache for `currentPendingMovementSightLineSeesTarget` keyed by `(observerId, targetId, round(observerX/cell), round(observerY/cell))` during active pending movement — recompute only when the observer crosses a coarse cell, reuse within a cell. `lineIntersectsWallDocument` is skipped on hits (it's called by the sight-line path).
   - Choose the cell size to balance smoothness (cache hits) vs accuracy (decision lag). Validate lag/convergence with the harness.

3. **Or (cleaner, bigger): skip the during-move decision entirely.**
   - During active pending movement, do not run the soundwave/sight-line decision recompute in the token-refresh path; let core drive the detection filter, keep `_canDetect` for undetected-hiding, and recompute visioner soundwave/visibility once at move-end. This removes essentially all 326ms. Higher regression risk (the soundwave/reveal special cases) — gate hard on the harness + the deafened/detection/pending-movement test suites + live special-case checks (darkness soundwave, invisible creature, GM Hide/Sneak).

## What is already done (context)

- Teleport fixed (sink-gate: `document-update-guard.js` v13 `movementAnimationPromise` awareness + cover-map await). Live-verified.
- Full suite green (4168). Architecture + detection-filter + soundwave-DI test failures fixed.
- Do NOT re-tune `PENDING_MOVEMENT_CORE_ANIMATION_VISION_*` throttle constants — proven not to affect this. Do NOT remove the rAF refresh loop (load-bearing) or the perception suppression (FPS-protective) wholesale — A/B showed those trade FPS/smoothness.
