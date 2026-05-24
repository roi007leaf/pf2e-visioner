<claude-mem-context>
# Memory Context

# [pf2e-visioner] recent context, 2026-05-24 11:41am GMT+3

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (20,857t read) | 226,926t work | 91% savings

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
S476 Continue pf2e-visioner architecture improvements (performance + coding principles) — spatial fallback fix and ongoing investigation of Ezren/Kobold visibility pair (May 20 at 7:58 AM)
S490 Implement canonical perception profile-driven tooltip sense badges in pf2e-visioner FoundryVTT module ("do it") (May 20 at 8:06 AM)
S508 Diagnose regression of "hidden flash bug" in pf2e-visioner pending token movement system (May 20 at 11:30 AM)
### May 24, 2026
4952 10:53a ⚖️ Performance Optimization Initiative for PendingMovement Service
4953 10:54a 🔵 Performance Analytics Infrastructure in PendingMovement and AVS Services
4954 " 🔵 Performance Counter Tests Are Tightly Coupled — Removal Requires Test Updates
4955 10:55a 🟣 New `enableMovementPerformanceDiagnostics` Runtime Flag Added to Gate Performance Counters
4956 " 🟣 Performance Counters Default to OFF — Diagnostics Flag Required to Enable Collection
4957 " 🟣 Public API Method `debugMovementPerformanceDiagnostics` Added to `autoVisibility` Facade
4958 " 🟣 Runtime Flag Functions for Movement Performance Diagnostics Implemented in `runtime-state.js`
4959 10:56a 🔄 Performance Counter Increments in `pending-token-movement.js` Gated Behind Diagnostics Flag
4960 " 🟣 Performance Diagnostics Flag Implementation Complete — All 8 Tests Pass
4961 " ✅ Lint and Full Test Suite Pass Clean After Diagnostics Flag Implementation
4962 " ✅ Full Test Suite Passes After Performance Diagnostics Feature — 3881 Tests, 433 Suites, Zero Failures
4971 11:13a ⚖️ Proposed Load-Time Migration to Eliminate legacyVisibilityToProfile
4973 " 🔵 Legacy Visibility Migration Infrastructure Already Exists in pf2e-visioner
4976 11:14a 🔵 visibilityV2 Migration Full Implementation Details Confirmed
4982 11:15a 🔵 Dual-Layer Visibility API: Legacy String Surface Over Profile Internals
4985 " 🔵 party-token-state.js Writes Legacy visibility Flag Directly in Patches
4988 " 🔵 search-exploration-service.js tokenIsHiddenByVisionerToAnyPC Reads Stale Legacy Flag
4990 11:16a 🟣 Test-Driven: Adding setPerceptionProfile/getPerceptionProfile to Public autoVisibility API
4991 " 🟣 Profile-Native API Methods Added to Pf2eVisionerApi
4992 " 🟣 Profile-Native Methods Wired into autoVisibility Facade and Tests Pass
4993 " 🔵 party-token-state.js: Primary Restore Uses setVisibilityMap() But Observer Restore Writes Legacy Flag
4994 11:17a 🔴 Fixed party-token-state.js Observer Restore Writing Legacy visibility Flag
4997 " 🔴 Fixed Two More Legacy visibility Flag Reads/Writes
4999 " 🔵 Legacy visibility Flag Now Only Appears in Migration and Intentional Deletion Paths
5001 " 🔄 Removed Legacy visibility Flag Deletions from api.js Cleanup Paths
5002 11:18a 🔄 Legacy v1 visibility Flag Fully Removed from Runtime Code
5005 " 🔵 autoVisibility.setPerceptionProfile Test Regression: Returns false in Full Suite Run
5007 " 🔴 Fixed Test Isolation: autoVisibility Facade Suite Now Resets game.user.isGM
5009 " 🔵 game.user Nulled by api.avs-cleanup.test.js — Deeper Test Isolation Issue
5011 11:19a 🔵 Facade Test Still Failing — debugMovementPerformanceDiagnostics Sets global.game={} Within Same Suite
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

Access 227k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>
