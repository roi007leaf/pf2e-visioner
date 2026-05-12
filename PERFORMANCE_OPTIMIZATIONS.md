# Performance Optimization Handoff

Date: 2026-05-12

This document is a handoff for the 8.2.5 performance pass. It is written for a future coding session that needs to understand what changed, why it changed, how it was verified, and what should be handled carefully if more performance work continues.

## Short Version

We optimized the expensive paths that showed up during large-scene AVS and interaction testing:

- AVS full recalculations with many tokens no longer redo unnecessary pair work or throw away useful global caches for non-movement batches.
- AVS override validation no longer pays repeated dynamic import costs in hot loops.
- Lighting precomputation now stops forcing fresh full-scene lighting after one successful forced recompute.
- Non-AVS interaction paths now avoid accumulating drag listeners, repeated hover visibility map reads, unnecessary visual-effect imports, and repeated cover-overlay token occupancy checks.

Measured headless Foundry results on a 47-token Aldori Manor Hall scene:

- Forced AVS recalculation: about `4.17s` before, then warm runs around `178-185ms`.
- First forced AVS pass after cold setup: about `1030ms`.
- AVS override validation, 20 checks: about `4306ms` before, then about `39ms`.
- Warm single override checks: about `2-8ms`.

Final verification after this pass:

- `rtk npm test`: `253` suites passed, `2655` tests passed.
- `rtk npm run lint`: passed.

## Changed Files

Core AVS performance:

- `scripts/visibility/auto-visibility/core/BatchProcessor.js`
- `scripts/visibility/auto-visibility/core/BatchOrchestrator.js`
- `scripts/visibility/auto-visibility/core/LightingPrecomputer.js`
- `scripts/visibility/auto-visibility/core/OverrideValidationManager.js`

Non-AVS interaction performance:

- `scripts/hooks/lifecycle.js`
- `scripts/hooks/registration.js`
- `scripts/services/HoverTooltips.js`
- `scripts/cover/CoverVisualization.js`

Tests added or updated:

- `tests/unit/avs/avs.batch-processor.test.js`
- `tests/unit/avs/avs.batch-orchestrator.test.js`
- `tests/unit/avs/avs.lighting-precomputer.test.js`
- `tests/unit/hooks/fallback-hud-button-performance.test.js`
- `tests/unit/hooks/refresh-token-controlled-guard.test.js`
- `tests/unit/services/hover-tooltips-unnoticed.test.js`
- `tests/unit/cover/cover-visualization-performance.test.js`

Release notes:

- `CHANGELOG.md`
- `module.json` was already bumped to `8.2.5` for this performance patch.

## AVS Batch Performance

### Problem

Large AVS recalculations were doing too much repeated work. In scenes with many tokens, full recalculation was spending time on:

- duplicate bidirectional token-pair processing,
- eager LOS calculations that were not always needed,
- repeated viewport token-set work inside loops,
- hot dynamic imports during batch execution,
- global cache clearing even when token geometry had not changed.

This made forced AVS batches on the 47-token test scene take about `4.17s` before the optimization pass.

### What Changed

In `BatchProcessor.js`:

- Duplicate unordered token pairs are skipped when both tokens are part of the same changed-token batch.
- Directional LOS work is computed lazily where possible instead of eagerly calculating every pair up front.
- Viewport token-id filtering work was moved out of repeated inner loops.
- Hot imports for supporting batch modules were moved out of per-batch/per-loop paths.

In `BatchOrchestrator.js`:

- Persistent global visibility and LOS caches are preserved for non-movement batches.
- Global caches are cleared for movement batches, because movement changes geometry and can make cached LOS or visibility stale.
- Detection batch imports were hoisted so repeated processing does not pay dynamic import overhead.

### Why This Is Safe

The key behavioral boundary is movement. Non-movement batches can reuse global LOS/visibility cache entries because token geometry has not changed. Movement batches still clear those caches, preserving correctness when relative positions, walls, or sight geometry matter.

### Tests

Relevant coverage:

- `tests/unit/avs/avs.batch-processor.test.js`
- `tests/unit/avs/avs.batch-orchestrator.test.js`

The tests check that duplicate bidirectional processing is avoided and that global cache clearing is scoped to movement batches instead of happening for every batch.

## Lighting Precomputation

### Problem

After certain forced lighting refreshes, the lighting precomputer could stay in forced-fresh mode for a short period. That caused rapid follow-up batches to recompute lighting for every token even after a successful fresh full recomputation had already happened.

### What Changed

In `LightingPrecomputer.js`:

- `LightingCalculator` import was hoisted out of the hot path.
- The forced-fresh state is consumed after one successful full recomputation.
- Follow-up batches can reuse the newly fresh cache instead of repeating full lighting work.

### Why This Is Safe

The forced-fresh request still causes a full fresh recompute. The change only prevents the same request from continuing to force fresh full-scene work after the cache has already been rebuilt successfully.

### Tests

Relevant coverage:

- `tests/unit/avs/avs.lighting-precomputer.test.js`

## AVS Override Validation

### Problem

Override validation was paying repeated dynamic import costs for modules used in each check. On a 20-check validation run this produced a multi-second stall, measured at about `4306ms`.

### What Changed

In `OverrideValidationManager.js`:

- Dynamic imports for visibility calculation, cover detection, and vision analysis are prewarmed and reused.
- The validation path no longer imports these modules repeatedly inside hot loops.
- Optional debug performance probes were added behind `options.debugPerformance`.

### Measured Impact

On the headless Foundry test scene:

- 20 override checks dropped from about `4306ms` to about `39ms`.
- Warm single checks were around `2-8ms`.

### Why This Is Safe

The same modules and APIs are used. The change is about when module references are loaded and reused, not what calculations return.

## Fallback HUD Button Drag Listeners

### Problem

The fallback floating HUD button path could add document-level drag listeners across repeated token selections. Listener buildup is a classic interaction-path performance leak: it may not show in a single action, but it can degrade sessions over time.

### What Changed

In `scripts/hooks/lifecycle.js`:

- `setupFallbackHUDButton` was exported for focused testing.
- A shared `fallbackHudButtonState` now owns document-level drag listener state.
- The fallback HUD button uses one shared `mousemove` / `mouseup` listener pair instead of accumulating new document listeners.

### Tests

Relevant coverage:

- `tests/unit/hooks/fallback-hud-button-performance.test.js`

The test verifies repeated control-token setup does not accumulate document drag listeners.

## Hover Tooltip Visibility Map Reads

### Problem

Observer-mode hover tooltips were reading the same observer visibility map once per visible target. In scenes with many tokens, hovering could repeatedly fetch identical data for the same observer.

### What Changed

In `scripts/services/HoverTooltips.js`:

- Observer-mode `showVisibilityIndicators` and `showVisibilityIndicatorsForToken` now read `getVisibilityMap(observer)` once per hover.
- The cached map is reused while rendering badges for all visible target tokens for that observer.

### Why This Is Safe

The visibility map belongs to the hovered observer and is stable for the duration of rendering that hover overlay. Target-mode paths were not collapsed the same way because each observer can legitimately have a different visibility map.

### Tests

Relevant coverage:

- `tests/unit/services/hover-tooltips-unnoticed.test.js`

The regression test verifies observer-mode hover reads the observer visibility map only once.

## Refresh Token Hook Import Guard

### Problem

The `refreshToken` hook could import visual-effect helpers before knowing whether the refreshed token was actually relevant to Visioner's controlled-token visual refresh path.

### What Changed

In `scripts/hooks/registration.js`:

- Added/exported `getMatchingControlledTokenForRefresh(token, controlledTokens)`.
- The hook now checks whether the refreshed token matches a controlled token before importing `visual-effects.js`.
- Unrelated token refreshes skip the visual-effect helper import entirely.

### Why This Is Safe

The visual update path only matters for controlled-token matching. The guard preserves that behavior while avoiding work for unrelated token refreshes.

### Tests

Relevant coverage:

- `tests/unit/hooks/refresh-token-controlled-guard.test.js`

## Cover Visualization Occupancy Checks

### Problem

The cover visualization overlay samples many grid positions. For each sampled grid square, the old path walked every token on the scene and could call `getVisibilityBetween(selectedToken, token)`.

In crowded scenes, this multiplies quickly:

```text
sampled grid squares * scene tokens * visibility lookups
```

This was a strong non-AVS candidate because it runs during an interactive key-held overlay.

### What Changed

In `scripts/cover/CoverVisualization.js`:

- `CoverVisualization` is now exported so focused unit tests can instantiate it.
- Added `buildPositionOccupancyBlockers(selectedToken, canvas)`.
- The overlay builds a blocking-token rectangle list once per overlay.
- `isPositionOccupied(...)` can now consume that precomputed blocker list.
- Per-grid-square occupancy checks now compare against cached blocker rectangles instead of walking every token and rechecking visibility for each sampled square.

### Behavior Preserved

The precompute keeps the old filtering behavior:

- selected token is ignored,
- loot and hazard actors do not block,
- Foundry-hidden tokens do not block,
- `undetected` tokens from the selected token's perspective do not block,
- tiny creatures can still share squares with other tiny creatures.

### Tests

Relevant coverage:

- `tests/unit/cover/cover-visualization-performance.test.js`

The test verifies blocker precomputation filters correctly and that repeated `isPositionOccupied` calls using the precomputed blockers do not call `getVisibilityBetween` again.

## Changelog Entry

The current changelog entry for `8.2.5` describes:

- AVS large-scene batch performance improvements.
- AVS override validation performance improvements.
- Non-AVS interaction overhead reductions.
- Cover visualization occupancy precomputation.

## Verification Commands

Commands run after the optimization pass:

```bash
rtk npm test
rtk npm run lint
```

Passing result:

- `253` Jest suites passed.
- `2655` Jest tests passed.
- ESLint passed.

## Git State Caveat

During this session there were unrelated Foundry pack database/log changes in `packs/pf2e-visioner-macros/` and an unrelated `AGENTS.md` modification in the working tree. Those are not part of the performance work and should not be reverted or edited unless explicitly requested.

## Revert Method

There is no single commit hash recorded in this document, so the safest rollback method is file-scoped. Do not use `git reset --hard` in this workspace unless the owner explicitly asks for it, because there may be unrelated local Foundry data and user edits.

### Revert The Whole Performance Pass

If the full performance pass needs to be backed out, revert only the source, test, changelog, and module metadata files that belong to this pass:

```bash
git restore \
  scripts/visibility/auto-visibility/core/BatchProcessor.js \
  scripts/visibility/auto-visibility/core/BatchOrchestrator.js \
  scripts/visibility/auto-visibility/core/LightingPrecomputer.js \
  scripts/visibility/auto-visibility/core/OverrideValidationManager.js \
  scripts/hooks/lifecycle.js \
  scripts/hooks/registration.js \
  scripts/services/HoverTooltips.js \
  scripts/cover/CoverVisualization.js \
  CHANGELOG.md \
  module.json

rm -f \
  tests/unit/hooks/fallback-hud-button-performance.test.js \
  tests/unit/hooks/refresh-token-controlled-guard.test.js \
  tests/unit/cover/cover-visualization-performance.test.js
```

Then inspect whether these tests were newly created or only modified before removing them:

```bash
git status --short tests/unit/avs/avs.batch-processor.test.js \
  tests/unit/avs/avs.batch-orchestrator.test.js \
  tests/unit/avs/avs.lighting-precomputer.test.js \
  tests/unit/services/hover-tooltips-unnoticed.test.js
```

If they existed before the performance pass, prefer `git restore <file>` instead of deleting them.

Do not include these unrelated files in a performance rollback:

```text
AGENTS.md
packs/pf2e-visioner-macros/*
PERFORMANCE_OPTIMIZATIONS.md
```

### Revert Individual Optimizations

Use this when only one optimization is suspected of causing trouble.

AVS batch cache/pair/import changes:

```bash
git restore \
  scripts/visibility/auto-visibility/core/BatchProcessor.js \
  scripts/visibility/auto-visibility/core/BatchOrchestrator.js
```

Lighting forced-fresh behavior:

```bash
git restore scripts/visibility/auto-visibility/core/LightingPrecomputer.js
```

Override validation import prewarming:

```bash
git restore scripts/visibility/auto-visibility/core/OverrideValidationManager.js
```

Fallback HUD drag listener optimization:

```bash
git restore scripts/hooks/lifecycle.js
rm -f tests/unit/hooks/fallback-hud-button-performance.test.js
```

Refresh-token import guard:

```bash
git restore scripts/hooks/registration.js
rm -f tests/unit/hooks/refresh-token-controlled-guard.test.js
```

Hover tooltip observer-map caching:

```bash
git restore scripts/services/HoverTooltips.js
git restore tests/unit/services/hover-tooltips-unnoticed.test.js
```

Cover visualization occupancy precompute:

```bash
git restore scripts/cover/CoverVisualization.js
rm -f tests/unit/cover/cover-visualization-performance.test.js
```

### Verify After Revert

After any rollback, run:

```bash
rtk npm test
rtk npm run lint
```

If the rollback targets AVS behavior specifically, also recheck the headless Foundry large-token scenario because the unit suite verifies correctness but not the real-world latency numbers.

## What Not To Undo

Future sessions should be careful with these points:

- Do not restore unconditional global cache clearing for every AVS batch. Non-movement cache reuse is intentional.
- Do not move dynamic imports back into hot loops unless there is a real startup or circular-dependency reason.
- Do not make lighting forced-fresh stay active after a successful full recompute.
- Do not reintroduce per-token-control document drag listeners for the fallback HUD button.
- Do not change observer-mode hover rendering back to one `getVisibilityMap(observer)` call per target.
- Do not make `refreshToken` import visual-effect helpers before checking controlled-token relevance.
- Do not make cover visualization occupancy scan all scene tokens for every sampled grid square.

## Remaining Performance Candidates

The low-risk wins found during this pass are mostly handled. Further work should start with profiling because the remaining candidates have higher behavioral risk.

Potential next targets:

- Auto-cover detection internals, especially repeated wall and token sampling.
- Visual-effect wall scans during hidden-wall and deleted-wall cleanup paths.
- Hover tooltip target-mode paths, but only with care because each observer can need its own visibility map.
- Cover visualization cover-level calculation itself, where `autoCoverSystem.detectCoverBetweenTokens` still runs for every sampled visible grid square.

Do not treat Foundry pack/database churn as module runtime performance work unless a specific pack operation is shown to affect runtime behavior.
