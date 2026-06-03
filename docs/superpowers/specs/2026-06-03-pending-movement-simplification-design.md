# Pending-Movement Simplification — Design

Date: 2026-06-03
Branch: new-architecture
Status: Approved design (pending spec review)

## Problem

Token movement currently routes through a large imperative subsystem
(`scripts/services/PendingMovement/`, ~16 files, plus pending-movement
special-cases inside the detection wrappers). It was built to fix FPS drops
during movement, but it introduced two regressions and significant complexity:

1. **Teleport (intermittent):** while a token animates a move, it sometimes
   snaps to its destination the moment a soundwave/detection state changes.
2. **Perceived jerk / over-engineering:** the system throttles perception and
   re-renders during animation, which the maintainer suspects is unnecessary.

## Findings (evidence)

Diagnosis was done live via Playwright against the running world (Silva,
7-square diagonal move into the wall-occluded area).

- **The jerk is NOT visioner's throttle.** A/B in the live world: disabling the
  rebuild throttle, setting intervals to 16ms, and narrowing the classifier all
  left the vision-polygon cadence unchanged (~15/sec with a moving light source,
  ~28–37/sec without). The cadence is bounded by Foundry's own light+vision
  wall-sweep cost, not by `PENDING_MOVEMENT_CORE_ANIMATION_VISION_*` constants.
  Conclusion: the throttle machinery is not buying smoothness and is not the
  cause of "less probing."

- **The teleport is a timing bug.** AVS persists the moving token's
  `flags.pf2e-visioner.detection` and `visibilityV2` during the move. When that
  document write lands on the token, Foundry's
  `Token##onUpdateAnimation` hits `if (options.animate === false)
  this.stopAnimation()` and the in-flight movement tween dies → snap to the
  already-committed destination. Foundry re-injects `animate: false` on the
  socket-applied update, so **no update-option on the write side prevents it**
  (verified: `animate:false` removed, `animation:{duration:0}`, `updateSource`,
  omitting `animate` — all still snap).

- **AVS is already deferred to movement-complete.** The recompute/persist chain
  is `TokenEventHandler.handleMoveToken` →
  `_finalizeCompletedMovement` → `AvsMovementInvalidationWorkflow` →
  `BatchOrchestrator.processBatch` → persist. It is *not* per-frame.

- **The root of the teleport timing bug:** `TokenEventHandler.handleMoveToken`
  awaits `activeAnimation.promise` (TokenEventHandler.js:222-224) before
  finalizing, but that promise resolves early (~547ms in telemetry) while
  Foundry's authoritative visual tween (`token.movementAnimationPromise`) is
  still running (truthy to ~585ms+). So finalize+persist fires mid-tween.

- **Visibility is applied declaratively.** `detection-wrapper-registration.js`
  wraps `DetectionMode#_canDetect` / `CanvasVisibility#testVisibility`; the
  wrappers read stored flags. This already keeps `undetected` tokens hidden
  during a move at Foundry's own cadence, independent of pending-movement.

## Goals

- Remove the over-engineered during-move visual machinery; rely on Foundry core
  LOS + the declarative `_canDetect` wrappers during the animation.
- Settle visibility and soundwave visuals at movement-end (maintainer confirmed
  this is acceptable).
- Eliminate the teleport.
- Preserve current FPS (no regression).

## Target model (guiding principle for Phases 2–3)

Maintainer's intent, verbatim: *"make the performance of visioner core like [Foundry
core] … just use core LOS polygon; when core shows soundwaves we should set state to
hidden; and unless something is undetected there's nothing we need to change; all we
need to change is if something is undetected, hide it completely from the observer and
not show the token at all."*

Concretely, the steady-state behavior we converge on:

- **Lean on core detection for performance.** Let Foundry core compute LOS / detection
  modes (sight, hearing, tremorsense) at its own optimized cadence. Do not run a
  parallel per-frame visioner computation.
- **Derive PF2e state from core's result, don't fight it:**
  - Core detects the target by sight → `observed` (or `concealed` per lighting) — leave it.
  - Core detects the target only by a non-visual sense (the "soundwave" /
    detection-filter case) → PF2e `hidden`.
  - Core does not detect the target at all → nothing to show.
- **The only hard override visioner must impose:** if a target is `undetected` for an
  observer, hide it **completely** from that observer — token not shown at all — even if
  core would reveal it. This is the `_canDetect` wrapper returning `false`.
- **Move-end settle:** these state derivations and any soundwave visuals settle at
  movement-end (not animated mid-move).

This model is the destination for Phases 2–3. The exact core→PF2e state mapping is pinned
during Phase 2 implementation; this section is the acceptance lens.

## Special cases to preserve (do NOT regress)

- **Invisible creatures:** an invisible target is `undetected` to an observer that cannot
  perceive it (hidden completely), or `hidden` if the observer has a non-visual sense in
  range (soundwave). Observers with see-invisibility / appropriate precise senses detect
  normally. Visioner's override must keep an invisible-and-undetected creature fully
  hidden even though core sight might otherwise reveal it.
- **Darkness without darkvision:** target detected by hearing/tremor shows the soundwave
  indicator, not a black circle, including on move.
- **GM-set PF2e overrides (Hide / Sneak / Seek):** an explicitly set `hidden` /
  `undetected` state must win over core's raw detection.
- **GM vision bypass and peek/cover:** unchanged; not in scope to alter.

## Non-Goals

- True mid-animation reveal/hide of tokens (the system does not actually do this
  today; it only delays/hides). Not adding it.
- Changing PF2e visibility semantics (undetected/hidden/concealed/observed).
- Touching cover/peek/GM-vision-bypass beyond removing pending-movement hooks
  that are deleted.

## What stays vs goes

Stays (do not touch):
- `auto-visibility/core` movement-completion deferral — this is the real FPS fix
  (AVS recomputes only on move-complete).
- Declarative detection wrappers (`detection-wrapper-registration.js`,
  `DetectionWrapper.js`) — keep undetected hidden during the move via stored
  state.
- Flag persistence stores (`detection-map.js`, `visibility-map.js`,
  `token-flag-map-persistence.js`).

Goes (over the phases):
- `scripts/services/PendingMovement/` during-move visual machinery: mid-move
  soundwave/detection-filter rendering, render-locks, final-visibility
  prediction, refresh-scheduler/throttling, evaluation cache, drag-intent
  soundwave priming.
- Pending-movement special-case branches inside `detection-can-detect.js`
  (lines that short-circuit on `isPendingMovementCoreAnimationBypassActive` /
  `isPendingMovementCoreAnimationPerceptionRefresh` /
  `shouldUseCoreDetectionDuringPendingMovement` /
  `targetMustStayHiddenDuringPendingMovement`).

## Design — phased

### Phase 1 — Fix the teleport (self-contained, ships alone)

Change movement finalization so AVS persists only after Foundry's *visual* move
tween fully settles.

- In `TokenEventHandler`, await the authoritative visual movement promise
  (`token.movementAnimationPromise`, v13) rather than the early-resolving
  `activeAnimation.promise`. Concretely: have `_waitForMovementAnimationToAttach`
  / the await at TokenEventHandler.js:222-224 resolve on
  `token.movementAnimationPromise` when present, falling back to the existing
  `activeAnimation.promise` for back-compat.
- No write-side option change (proven ineffective).

Acceptance:
- 4× diagonal move that triggers a soundwave: max single-frame visual jump
  stays small (~one grid step), never ~full-path snap (was ~1300px).
- FPS unchanged vs baseline (FPS harness).
- Unit test asserting finalize/persist is ordered after the visual-tween
  promise resolves (mockable token with a pending `movementAnimationPromise`).

### Phase 2 — Strip during-move visual machinery

- Stop rendering/animating soundwave (detection-filter mesh) during the move;
  remove render-locks, final-visibility prediction, and the refresh-scheduler.
- During the move: plain core behavior + declarative wrappers. Soundwaves and
  visibility settle at move-end (Phase 1 persist).

Critical risk + mitigation:
- Removing the pending-movement bypass means the `_canDetect` wrapper runs every
  frame during animation with no bypass. It MUST be cheap — read cached/stored
  state, never recompute AVS per call. Verify the wrapper path is O(1) lookups;
  add a per-frame cache if needed. Gate Phase 2 on an FPS-harness pass.

Acceptance:
- FPS during a move (with and without a moving light) ≥ current baseline.
- Undetected tokens remain hidden throughout the move (declarative wrapper).
- Soundwave appears correctly at move-end.

### Phase 3 — Delete dead code + clean wrappers

- Delete now-unused `PendingMovement/` files.
- Remove pending-movement branches from `detection-can-detect.js`, restoring the
  clean declarative form.
- Full regression pass.

Acceptance:
- No remaining imports of deleted modules.
- Full unit-test suite green.
- Regression cases below pass.

## Testing / verification

- **FPS + teleport harness (Playwright, live world):** control a token, sample
  per-frame `mesh.position`, vision-source `los` recompute count, and
  `ticker.FPS` during an animated diagonal move; report max single-frame jump,
  los/sec, FPS min/median. Used to gate each phase.
- **Unit tests:** Phase 1 finalize ordering; Phase 2 wrapper-cost / cached
  reads; Phase 3 no-dead-import + visibility-state mapping.
- **Regression cases** (from git history / memory — bugs pending-movement was
  built to fix; must still pass after strip-down):
  - Token in darkness without darkvision shows soundwave indicator on move (not
    a black circle).
  - Soundwave (detection-filter mesh) visible without requiring hover.
  - Token reveal/soundwave settles correctly at move-end (not stuck).
  - Undetected target (incl. invisible creature with no observer sense in range)
    is hidden completely — token not rendered at all for that observer — during
    and after a move.
  - Invisible creature detected by a non-visual sense (hearing/tremor) shows as
    `hidden` (soundwave), not fully visible.
  - GM-set Hide/Sneak/Seek override states win over core's raw detection.

## Open implementation notes

- Confirm `getActiveMovementAnimation` vs `token.movementAnimationPromise`
  semantics on this Foundry version during Phase 1 implementation; pin the exact
  await target and verify with telemetry.
- Phases are independently revertable; stop after any phase if needed.
