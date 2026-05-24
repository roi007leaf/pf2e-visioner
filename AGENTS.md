<claude-mem-context>
# Memory Context

# [pf2e-visioner] recent context, 2026-05-24 1:17pm GMT+3

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (19,835t read) | 279,305t work | 93% savings

### May 7, 2026
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
S476 Continue pf2e-visioner architecture improvements (performance + coding principles) — spatial fallback fix and ongoing investigation of Ezren/Kobold visibility pair (May 20 at 7:58 AM)
S490 Implement canonical perception profile-driven tooltip sense badges in pf2e-visioner FoundryVTT module ("do it") (May 20 at 8:06 AM)
S508 Diagnose regression of "hidden flash bug" in pf2e-visioner pending token movement system (May 20 at 9:44 AM)
### May 24, 2026
5012 11:20a 🔵 legacyVisibilityToProfile Remains a Legitimate Runtime Conversion Utility
5013 " 🔵 Root Cause Identified: setPerceptionProfile Test Fails Due to applyVisibilitySideEffects Dynamic Import
5014 11:21a 🔴 Made updateTokenVisuals Non-Fatal in setPerceptionProfile/setPerceptionProfileMap API Methods
5015 " 🔴 All API Test Suites Pass: Profile API and Cleanup Tests Green Together
5016 " 🟣 Legacy v1 Visibility Removal Complete: All 5 Key Test Suites Pass — 66/66 Green
5017 " 🔵 Git Status: Legacy Visibility Removal Changes Span 5 Files; getVisibilityMap Retained for Reads in party-token-state
5023 11:31a 🔵 Visibility V2 Migration Runs on Module Ready via setTimeout in lifecycle.js
5026 " 🔵 Visibility V2 Migration Test Suite Defines Exact Legacy-to-Profile Mappings
5027 11:32a 🔵 Visibility V2 Migration Runs Silently — No Progress Bar or User Notifications
5028 " 🟣 New Test Added for Migration Progress Reporting and GM Notification
5029 " 🔵 New Progress Test Fails Red — Implementation Not Yet Added to Migration Function
5030 " 🟣 Migration Progress Reporting and GM Notification Implemented in visibility-v2-migration.js
5031 " 🟣 Visibility V2 Migration Progress Reporting — All 6 Tests Pass (TDD Green)
5033 11:33a 🟣 Full Test Suite Passes After Migration Progress Feature — 433 Suites, 3883 Tests, 0 Failures
5036 11:37a 🔵 Visibility V2 Migration Scope Includes Both v13 and v14
5037 11:38a 🔴 Migration Progress Notification Switched from SceneNavigation to ui.notifications
5038 " 🔵 Migration Source Code Not Yet Updated to Match New Progress Notification Pattern
5039 " 🟣 Visibility-V2 Migration Implements ui.notifications Progress Object Pattern
5040 " 🔴 All 6 Visibility-V2 Migration Tests Now Pass
5042 11:39a ✅ Full pf2e-visioner Test Suite Passes After Migration Refactor (433 suites, 3883 tests)
5043 11:41a 🔵 Perception Profile and Visibility Map Architecture — Core Data Model
5044 " 🔵 pf2e-visioner Public API Surface and Module Registration
5045 11:42a 🔵 Module Version Discrepancy: package.json 6.1.0 vs module.json 8.3.0
5046 " 🔵 AVS Override Flag Storage Pattern and API Data Architecture
5047 " 🟣 Created docs/api-definition.md with Full TypeScript-Style API Type Definitions
5048 " ✅ docs/api-definition.md Added and Lint+Tests Pass Clean
5063 12:06p 🔵 Performance Audit Scope: AVS Override, Actions, and Chat Handlers
5064 " 🔵 Core Audit Target Files Have No Uncommitted Changes
5065 " 🔵 visibilityV2 and AVS Override Flag Architecture Mapped
5066 12:07p 🔵 AvsOverrideManager: Action-Specific Override API and Internal Architecture
5067 " 🔵 AvsOverrideManager Override Directionality Policy: One-Way vs Symmetric by Source
5068 " 🔵 isDefaultPerceptionProfile Used to Suppress No-Op Flag Writes in visibility-map.js
5070 " 🔵 visibility-profile-flag-persistence.js: Flag Layer Architecture and Default Profile Check
5072 12:08p 🟣 Added Tests: setPerceptionProfile AVS Override Behavior for Manual vs Automatic Updates
5073 " 🔵 Test Failure: setPerceptionProfile Does Not Create AVS Override Flags for Manual Updates
5074 " 🔴 api.js: Added profileToManualOverrideChange Helper to Bridge v2 Profile → AVS Override Gap
5075 " 🔴 setPerceptionProfile and setPerceptionProfileMap Now Create AVS Override Flags for Manual Updates
5076 " 🔴 All 14 Tests Pass: setPerceptionProfile AVS Override Fix Verified
5077 12:09p ✅ API Docs Updated: setPerceptionProfile AVS Override Behavior Now Documented
5079 " 🔴 Full Integration Test Pass: 180 Tests Green Across All Action and AVS Suites
5081 " 🔴 Full Test Suite: All Tests Pass After AVS Override Fix
5084 " 🔴 Complete Test Suite: 3885/3885 Tests Pass Across 433 Suites
5086 12:10p ✅ Final Changeset for setPerceptionProfile AVS Override Fix
5114 12:55p 🔵 FPS Drop Investigation Initiated for Token Movement
5116 12:56p 🔵 Pre-existing Playwright Performance Tracing Tool Found
5117 " 🔵 pf2e-visioner AVS Override Validation Architecture on Token Movement
5118 12:57p 🔵 Performance Trace Baseline: 845 refreshToken Calls for 2 Token Moves
5119 " 🔵 NODE_PATH Does Not Work for ESM Import Resolution
5120 12:58p 🔵 OverrideValidationManager Is Not the FPS Bottleneck — Override Validation Is Fast
5121 " 🔵 Correct Runtime Path to OverrideValidationManager Identified
S630 FPS drop investigation during token movement in pf2e-visioner FoundryVTT module — using Playwright + systematic debugging to identify whether token lights or walls are the cause (May 24 at 1:16 PM)
**Investigated**: - Read the systematic-debugging skill methodology
    - Explored the full AVS (Auto Visibility System) codebase: OverrideValidationManager, OverrideValidationIndicator, TokenEventHandler, AvsMovementInvalidationWorkflow, BatchOrchestrator, AvsInvalidationCoordinator
    - Discovered pre-existing performance tool at tools/perf/trace-token-movement.mjs (defaults to "Ass Gm" login, token "Ezren", 3 scenarios)
    - Ran baseline Playwright perf trace (normal scenario): 845 refreshToken fires, 14 lightingRefresh, 4 avsBatchComplete for 2 token moves
    - Attempted inline ESM Playwright script — failed because NODE_PATH is ignored by ESM resolver; createRequire workaround required
    - Instrumented OverrideValidationManager methods live in browser to measure override validation cost
    - Walked the window.pf2eVisioner object tree to find correct runtime path to OverrideValidationManager

**Learned**: - 845 refreshToken hook fires for 2 token moves is the direct FPS cause — roughly 400+ per move
    - OverrideValidationManager is NOT the bottleneck: validateOverridesForToken runs only twice total, each completing in ~1ms
    - The override validation pipeline (queue → validate → show indicator) costs ~2ms total across both moves
    - 12 of 14 lighting refreshes were suppressed by the pending movement system — lighting is a minor contributor
    - All pendingMovement metrics are zero — the pending movement visual refresh subsystem is inactive
    - Correct runtime path: window.pf2eVisioner.services.autoVisibilitySystem.orchestrator.overrideValidationManager
    - The public api.autoVisibility only exposes getMovementPerformanceSnapshot and debugPendingMovementVisualRefresh
    - First instrumentation run got managerAvailable: false because the access path was missing .orchestrator suffix
    - NODE_PATH works for CJS require() but is ignored by Node.js ESM import resolution (Node v22.13.1)

**Completed**: - Installed playwright@1.56.1 at /tmp/pv-playwright/node_modules
    - Ran baseline perf trace via existing tools/perf/trace-token-movement.mjs — artifacts saved to artifacts/perf-traces/
    - Confirmed override validation pipeline is fast and not the bottleneck
    - Identified correct browser-side object path to OverrideValidationManager for future instrumentation

**Next Steps**: The 845 refreshToken calls remain unexplained — the source must be elsewhere in the rendering pipeline. Active work is attempting to locate what triggers the mass token refreshes: likely AVS batch completion causing a full-canvas perception/vision update that re-renders every token. Need to instrument the Hooks.callAll('refreshToken') call sites or profile which FoundryVTT subsystem (canvas.perception.update, lighting recalculation, or AVS batch apply) is responsible. A previous browser session (60280) appears to still be running or hung — may need to restart with a focused probe targeting the refreshToken source.


Access 279k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>
