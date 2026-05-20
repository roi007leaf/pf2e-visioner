<claude-mem-context>
# Memory Context

# [pf2e-visioner] recent context, 2026-05-20 9:38am GMT+3

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (19,433t read) | 220,094t work | 91% savings

### May 3, 2026
S245 Fix stealth cover bonus not appearing on stealth rolls — expanded to include third discovered bug in context routing (May 3 at 9:55 AM)
S119 GM tracker dots design pivot — dots should only show users who CAN see the stealther, not users blocked by overrides (May 3 at 9:55 AM)
### May 7, 2026
S246 Fix stealth cover bonus not appearing on stealth rolls — three bugs found and fixed, Bug 3 fix verified in source but test not yet re-run (May 7 at 8:04 AM)
S258 Debugging persistent token image flash bug in pf2e-visioner FoundryVTT module — user asked what debug log was added (May 7 at 8:07 AM)
### May 11, 2026
S262 Fix PF2E Visioner runtime SyntaxError — missing 'getVisibilityStateLabelKey' export from constants.js crashing token-hud.js visibility manager (May 11 at 10:50 AM)
S266 Non-AVS performance investigation — identifying hot paths outside the AVS batch system (May 11 at 2:48 PM)
S272 Fix failing tests in pf2e-visioner FoundryVTT module — cover visualization performance test and related test failures (May 11 at 6:33 PM)
### May 12, 2026
S401 Migrate remaining globalThis.game.pf2eVisioner.suppressLightingRefresh accesses in lifecycle.js and ui.js to runtime-state.js, then add BatchProcessor.clearPersistentCaches() method with TDD (May 12 at 10:54 AM)
### May 18, 2026
S475 Improve pf2e-visioner codebase architecture (performance + coding principles) — session complete, final summary checkpoint (May 18 at 8:42 AM)
### May 20, 2026
S476 Continue pf2e-visioner architecture improvements (performance + coding principles) — spatial fallback fix and ongoing investigation of Ezren/Kobold visibility pair (May 20 at 8:06 AM)
4202 8:55a 🔵 setVisibilityMapsBatch Call Chain: BatchOrchestrator → VisibilityMapService → Store
4203 " 🔵 Existing Batch Write Return Shape Contract: { written, skipped }
4204 " 🟣 Implemented Stale Bulk Readback Repair in setVisibilityMapsBatch
4205 8:56a 🔄 BatchOrchestrator Stale Readback Fallback Logic Removed — Moved to Store Layer
4206 " 🔄 Deleted BatchOrchestrator Stale Readback Test — Responsibility Moved to Store Layer
4207 " 🔵 Stale Readback Repair Implementation Not Taking Effect Despite Patch Application
4208 " 🔵 Dead Code Bug: repairStaleVisibilityBatchReadback Lines Are Unreachable
4209 " 🔴 Fixed Dead Code: return → const result = await in setVisibilityMapsBatch
4210 8:57a 🟣 Stale Readback Repair Feature Fully Shipped and Verified
4211 " 🟣 Full Test Suite Green: 3624 Tests Pass After Stale Readback Repair Refactor
4212 " 🔵 HoverTooltips.js Architecture: Singleton Class Wrapping a Large Functional API
4213 8:58a 🔵 HoverTooltips Dynamic Import Pattern Avoids Circular Dependencies
4214 " 🔄 Removed refreshCurrentHoverIndicators and Its BatchOrchestrator Caller
4215 " 🔄 refreshCurrentHoverIndicators Removal Fully Verified
4216 " 🔄 Full Suite Green After HoverTooltips Cleanup: 3624 Tests Pass
4217 8:59a 🔄 Session Complete: BatchOrchestrator Simplified by 64 Lines, Store Layer Gains Repair Capability
4218 " 🔵 TokenEventHandler Movement Pipeline: Dual Hook Strategy with Animation Await
4219 " 🔵 BatchOrchestrator Pipeline: Policy/Workflow Decomposition Pattern
4220 9:00a 🟣 TDD: New Test for Movement Session Recreation When Moving Flag Survives Cleanup
4221 9:01a 🔵 Confirmed Bug: Movement Stop Timer Fires With No Session When Moving Flag Survives Cleanup
4222 " 🔵 Precise Bug Location: notifyTokenMovementStart Skips Session Creation When Already Moving
4223 " 🟣 Second TDD Test: Movement Stop Timer Should Drain Tokens Even When Session Disappears Mid-Flight
4224 " 🔵 Both Movement Session Tests Fail (RED): Two Distinct Orphaned Session Paths Confirmed
4225 " 🔴 Fixed Orphaned Movement Session: notifyTokenMovementStart Now Recreates Missing Sessions
4226 9:02a 🔴 Movement Session Orphan Bug Fixed: Both Tests GREEN
4227 " 🔴 Movement Session Fix Verified: 57 Tests Pass, Lint Clean
4228 " 🔴 Full Suite Green: 3626 Tests Pass After Movement Session Orphan Fix
4229 " 🔄 Movement Session Fix Incremental Diff: BatchOrchestrator.js +24 -11 Lines
4256 9:17a ⚖️ Detection Must Not Preserve Stale Undetected/Concealed State After Observed Visibility
4258 9:18a 🟣 CONTEXT.md Created for PF2E Visioner Domain Language
4261 9:21a ⚖️ Observed State Must Track Detection Source (Which Sense)
4262 9:23a ✅ CONTEXT.md Updated with "Boring Observed" Concept and Persistence Rules
4268 9:28a 🔵 TDD Skill Loaded for pf2e-visioner Batch/Visibility Work
4269 " 🔵 pf2e-visioner Visibility Map V2: Structured Perception Profiles Replace Legacy String Flags
4270 " 🔵 VisibilityCalculator.calculateVisibilityBetweenTokens Architecture
4271 9:29a 🔵 token-flag-map-persistence.js: Generic Multi-Pass Token Flag Batch Writer
4272 " 🟣 TDD Red Phase: New perception-state.js Store with Compaction Logic
4273 9:30a 🟣 New perception-state.js Store: Unified Perception + Detection Flag Writer with Compaction
4274 9:31a 🔴 perception-state.js: Detection Map Over-Deletion Fixed — Preserve Existing Sense When No New Sense
4275 " 🔄 visibility-map.js Refactored to Delegate to perception-state.js
4276 " 🔄 visibility-map.js: Removed Duplicate isDefaultProfile and normalizePerceptionProfileMap Implementations
4277 " 🔵 visibility-map.js Refactor Incomplete: Local Implementations Still Reference Removed Imports
4278 9:32a 🔄 visibility-map.js: Batch Write Infrastructure Fully Delegated to perception-state.js
4279 9:33a 🔵 visibility-map.js Still Has Broken Call Sites After Patch: getRawPerceptionProfileMap and setPerceptionProfileFlag Deleted But Still Referenced
4280 " 🔵 visibility-map.js Still Has Two More Broken Call Sites: setPerceptionProfileFlag and isDefaultProfile
4281 " 🔴 visibility-map.js Broken Call Sites Fixed: All 78 Store Tests Now Pass
4282 " 🟣 perception-state.js Refactor Validated: 6 AVS Test Suites Green (59 Tests)
4283 9:34a ✅ Refactor Complete: visibility-map.js Net -192 Lines; Lint and Git Check Clean
4284 " 🟣 perception-state.js Extraction: Full 417-Suite Test Run Passes — 3625 Tests Green
4285 " 🔵 Git Status Reveals perception-state.js Work Is Part of Larger Branch with AVS Core Changes

Access 220k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>
