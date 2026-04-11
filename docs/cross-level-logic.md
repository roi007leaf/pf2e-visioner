## Cross-Level Visibility Logic for Foundry v14 Native Levels

### Architecture Overview

When tokens are on different v14 native levels, pf2e-visioner uses a specialized code path for both LOS (line of sight) and sound blocking. The key challenge: 2D geometric ray casting cannot accurately handle cross-level visibility because walls on different floors project into the same 2D plane.

### Key Detection: Is This Cross-Level?

In `VisionAnalyzer.hasLineOfSight()`:
```js
const hasSceneLevels = (canvas?.scene?.levels?.size ?? 0) > 0;
const observerLevelId = observer?.document?.level || '';
const targetLevelId = target?.document?.level || '';
const crossLevel = hasSceneLevels && observerLevelId !== targetLevelId;
```

### Cross-Level LOS (Sight)

**Method:** `VisionAnalyzer.#testCrossLevelWallBlock(originPos, targetPos, levelId, 'sight')`

- Only checks walls on the **observer's** level (each floor's wall config controls what tokens on that floor can see)
- Uses `canvas.scene.walls` (all 1072+ walls, view-independent) NOT `canvas.walls.placeables` (filtered by current view, changes when switching levels!)
- Skips global/untagged walls (empty `levels` Set) — only walls explicitly assigned to the observer's level are checked
- Uses bounding-box pre-filter + cached level-filtered wall list for performance
- Returns symmetric results regardless of which level the GM is viewing

**Why:** `canvas.walls.placeables` only contains walls for the currently viewed level. This caused results to flip when switching level views.

### Cross-Level Sound Blocking

**Method:** `VisionAnalyzer.isSoundBlocked()` → `#testCrossLevelWallBlock(center, center, obsLvl, 'sound')`

Same approach as sight — observer-level walls only, `canvas.scene.walls`, skip global walls.

**Why:** The v14 `CONFIG.Canvas.polygonBackends.sound.testCollision` API requires a vision source, which is null for NPC tokens during batch processing.

### Wall Level Assignment in v14

- Each wall in v14 can have a `levels` Set containing level IDs it belongs to
- Walls with empty `levels` Set are "global" (appear on all levels)
- Different walls at the same coordinates can exist on different levels with different configs (e.g., floor 1 wall blocks sight+sound, floor 2 wall at same position blocks nothing)
- `wall.document.levels` is static (doesn't change with view), confirmed via `_source.levels` comparison

### Cache Strategy

- `#crossLevelWallCache` / `#crossLevelWallCacheKey`: Pre-filters `canvas.scene.walls` to only level-assigned walls matching a given level ID
- Cleared via `clearCache()` which is called on wall create/update/delete hooks
- Wall create/update/delete hooks in `registration.js` also trigger `_triggerFullAvsRecalculation()` (with 200ms delay for updateWall to let Foundry process the change first)

### What We Tried That Didn't Work

1. **v14 `CONFIG.Canvas.polygonBackends.sight.testCollision`**: Depends on `observer.vision` (null for NPCs during batch) and produces asymmetric results per direction based on viewing perspective
2. **`canvas.visibility.testVisibility`**: Canvas-view-dependent, not observer-level-dependent
3. **`canvas.scene.testSurfaceCollision`**: Full ray always hits the floor surface between levels
4. **Vision polygon for cross-level**: Level-specific, doesn't include other levels
5. **Geometric sampling with merged level walls**: Too many walls in 2D projection block everything
6. **`canvas.walls.placeables` iteration**: Only contains walls for currently viewed level!

### Detection Wrapper Integration

`DetectionWrapper.canDetectWrapper()` is NOT modified for cross-level — visioner stays in full control for all token pairs. The AVS calculates the correct state, and the detection wrapper applies it.

### PF2e System Fix (Scene.view)

Separate from visioner: the PF2e system's `ScenePF2e.view()` method was patched in `pf2e.mjs` to pass `options` to `super.view(options)` and add early return for `this.isView`. This fixes the v14 Scene Levels view-switching bug (foundryvtt/pf2e#21966).

### Test Files

- `tests/unit/visibility/cross-level-los-blocking.test.js` — 8 tests covering cross-level LOS, sound, and adapter behavior
- `tests/unit/services/levels-integration-v14.test.js` — 18 tests for LevelsIntegration v14 native levels
- Tests use `canvas.scene.walls = [wallDoc]` (not placeables wrapper) to match `canvas.scene.walls` iteration

### Pre-existing Test Issue

`avs.batch-processor.test.js` has 1 failing test (`pairsSkippedLOS > 0`) unrelated to cross-level changes.
