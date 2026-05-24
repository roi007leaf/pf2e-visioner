<claude-mem-context>
# Memory Context

# [pf2e-visioner] recent context, 2026-05-24 4:04pm GMT+3

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (22,298t read) | 299,740t work | 93% savings

### May 12, 2026
S401 Migrate remaining globalThis.game.pf2eVisioner.suppressLightingRefresh accesses in lifecycle.js and ui.js to runtime-state.js, then add BatchProcessor.clearPersistentCaches() method with TDD (May 12 at 10:54 AM)
### May 18, 2026
S475 Improve pf2e-visioner codebase architecture (performance + coding principles) — session complete, final summary checkpoint (May 18 at 8:42 AM)
### May 20, 2026
S476 Continue pf2e-visioner architecture improvements (performance + coding principles) — spatial fallback fix and ongoing investigation of Ezren/Kobold visibility pair (May 20 at 7:58 AM)
S490 Implement canonical perception profile-driven tooltip sense badges in pf2e-visioner FoundryVTT module ("do it") (May 20 at 8:06 AM)
S508 Diagnose regression of "hidden flash bug" in pf2e-visioner pending token movement system (May 20 at 9:44 AM)
S630 FPS drop investigation during token movement in pf2e-visioner FoundryVTT module — using Playwright + systematic debugging to identify whether token lights or walls are the cause (May 20 at 11:30 AM)
### May 24, 2026
S631 FPS drop investigation during token movement in pf2e-visioner — Playwright-based profiling to identify whether token lights or walls cause the performance regression (May 24 at 1:16 PM)
S632 FPS drop investigation during token movement in pf2e-visioner — Playwright-based profiling to identify whether token lights or walls cause the performance regression (May 24 at 1:17 PM)
S645 FPS drop investigation during token movement — debugging visibility/invisibility system with Playwright as Assistant GM (May 24 at 1:17 PM)
5149 1:28p 🔵 `isMovementVisibilityBatch` Requires `movementSession` — 3 of 5 Movement-Window Batches Fire Without It
5151 " 🔵 `movementSession` Only Attached to Post-Movement Flush Batch — At Most 1 Movement-Batch Per Move
5152 " 🔵 `_reapplyRuleElementsAfterMovement` Awaited Before Each `tokenMovementCompleted` Invalidation
5153 1:29p 🟣 TDD: Debounced `processQueuedValidations` Coalescing Added to `AvsMovementInvalidationWorkflow`
5154 " 🔴 Debounced `#scheduleOverrideValidationProcessing` Replaces Immediate `processQueuedValidations` Call
5155 " 🔴 Full Test Suite Green: Both Optimizations Verified — 43/43 Tests Pass
5159 1:31p 🔵 Combined Fix Benchmark: `coreProcess` Calls Cut 57% (7→3) but Per-Call Cost Shows High Variance
5161 " 🔴 Full Suite: 1 Test Failure in `avs.invalidation-coordinator.test.js` — Debounce Not Reflected in Coordinator Test
5163 " 🔴 All 3887 Tests Now Pass — Final Downstream Test Fixed for Debounce Timer Behavior
5164 1:32p 🔴 Full Suite Clean: 433 Suites / 3887 Tests Pass After All FPS Fix Changes
5169 1:40p 🔵 FPS Drop Investigation Initiated for Token Movement
5171 " 🔵 pf2e-visioner Token Refresh Pipeline Architecture Mapped
5173 1:41p 🔵 Root Cause of Past Token Movement FPS Drops: Excessive updateWallVisuals Calls
5174 " 🔵 handleTokenRefreshed Has Four Exit Guards; refreshTokenVisibility Can Fire Up to 8 Times Per Move
5175 1:42p 🔵 system-hidden-token-highlights.js: Sequential Async updateSystemHiddenTokenHighlights Calls Per Movement
5176 " 🔴 handleTokenRefreshed De-async'd to Avoid Microtask Overhead on Every Animation Frame
5177 " 🔴 Test Updated for Synchronous Throttled Path After handleTokenRefreshed De-async
5178 1:43p 🔵 Playwright Performance Trace Tool Exists with Three Built-in Scenarios
5180 " 🔵 Baseline Perf Trace: 844 refreshToken Events in 3.76s for Single Token Move
5181 1:44p 🔵 Pending Movement Render-Lock Captures 13+ Token Surfaces for Invisible State Management
5182 " 🔵 Trace Tool Uses Animated Position Updates Not Drag — Explains Zero Pending Movement Stats
5183 1:45p 🔵 6 refreshToken Hooks Registered in Live Session — Ct.invalidate() Fires on Every Single One
5184 1:46p 🔵 Per-Hook Profiling Identifies Elevation Grid Module as Biggest Sync Cost, Not pf2e-visioner
5185 1:47p 🔵 updateSystemHiddenTokenHighlights Skips Expensive Per-Token Work When Observer Has No Special Senses
5188 1:48p 🔴 updateSystemHiddenTokenHighlights Optimized to Skip Token Iteration on Common No-Op Paths
5190 " 🔴 All 37 Tests Pass After Both Optimizations
5192 1:49p 🔵 Post-Optimization Profiler Run Confirms pf2e-visioner Hook Remains Cheap; Elevation Grid Still Dominant
5193 1:52p ✅ Full Test Suite Passes After FPS Optimization Changes — 3888 Tests, 433 Suites
5195 1:55p 🔵 FPS Drop Investigation on Token Movement Initiated
5196 1:58p 🔵 Playwright FPS Profiling Script Launched for Token Movement Investigation
5197 " 🔵 Playwright Profiling Results: Token Lights NOT Cause of FPS Drop — Visibility Refresh Volume Is Primary Suspect
5198 1:59p 🔵 Prior FPS Investigation Round Already Completed — New Session Re-Investigating Recurring Drop
5199 " 🔵 pf2e-visioner Wraps Token._refreshVisibility via libWrapper — Adds Pending Movement Detection Filter Logic on Every Call
5200 2:00p 🔵 wrapTokenRefreshVisibility "Should*" Predicates Use Decision Cache — capturePendingMovementDetectionFilterState Has Early Exits
5201 2:01p 🔵 A/B Test: pf2e-visioner _refreshVisibility Wrapper Adds ~9% Per-Call Overhead — Not the Primary FPS Bottleneck
5202 2:03p 🔵 Root Cause Found: canvas.visibility.testVisibility Called 4166 Times Per Move — 3380ms CPU in 3.7s
5203 " 🔵 wrapCanvasVisibilityTest Has Fast-Exit: Only Does Detection Work When getPendingMovementBlockedDetectionSources Returns Entries
5204 2:05p 🔵 A/B Test: pf2e-visioner testVisibility Wrapper Adds ~18% Per-Call Overhead (~600ms Total Per Move)
5205 " 🔵 ConditionManager.recordVisibilityBeforeInvisibility Uses getVisibilityMap(token), Not Per-Pair getVisibility Calls
5206 " 🔄 ConditionManager.recordVisibilityBeforeInvisibility Refactored to Use Per-Pair api.getVisibility
5207 " ✅ Full Test Suite Passes After ConditionManager Refactor — 3889 Tests, 433 Suites
5208 2:06p 🔵 Git State: ConditionManager Refactor Is Staged But Not Yet Committed — Prior FPS Fixes Already Committed to main
5209 3:47p 🔵 FPS Drop Investigation Initiated for Token Movement
S646 FPS drop during token movement — ongoing investigation into visibility/invalidation pipeline (May 24 at 3:49 PM)
5218 4:01p 🔵 StatelessVisibilityCalculator.js Visual Detection Logic Traced
5219 " 🔵 calculateVisibility Top-Level Decision Tree Mapped
5220 " 🔵 Invisibility Flag Schema Stores Per-Observer Pre-Invisibility State
5223 " 🟣 Test Added: Duplicate Invisible Handler Must Not Overwrite Established States
5224 4:02p 🔴 ConditionManager: Duplicate Invisible Handler Overwrote previousState with Live API Value
5225 " ✅ All 111 Visibility Tests Pass and Lint Clean After ConditionManager Fix
5226 " ✅ Full pf2e-visioner Test Suite Passes: 3890 Tests Across 433 Suites

Access 300k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>
