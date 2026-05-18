<claude-mem-context>
# Memory Context

# [pf2e-visioner] recent context, 2026-05-18 8:24pm GMT+3

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (17,679t read) | 221,911t work | 92% savings

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
### May 18, 2026
S401 Migrate remaining globalThis.game.pf2eVisioner.suppressLightingRefresh accesses in lifecycle.js and ui.js to runtime-state.js, then add BatchProcessor.clearPersistentCaches() method with TDD (May 18 at 8:42 AM)
3952 7:09p 🔵 Complete BatchOrchestrator Policy Architecture — 6 Policies, Each with Dedicated Test
3953 " 🔵 BatchFinalizationPolicy Interface: Fallback Telemetry and Follow-Up Batch Planning
3954 7:10p 🟣 BatchCalculationOptionsPolicy Extraction Begun — TDD Red Phase
3955 " 🟣 BatchCalculationOptionsPolicy Created — TDD Green Phase
3956 " 🔄 BatchOrchestrator Wired to BatchCalculationOptionsPolicy
3957 " 🔄 BatchCalculationOptionsPolicy TDD Cycle Complete — 21 Tests Pass, ESLint Clean
3958 " 🔵 Complete AVS Batch Subsystem: 10 Test Suites, 66 Tests, 7 Policy Modules
3959 7:11p 🔄 BatchOrchestrator Policy Extraction Complete — 3197 Tests, 307 Suites, ESLint Clean
3960 7:13p 🔵 VisibilityStateManager Architecture — Next Refactor Candidate Under Exploration
3961 " 🔄 VisibilityStateManager Debug Stack Capture Consolidated to #debugWithStack Method
3962 7:14p 🔵 SystemStateProvider Interface — AVS System Gate and Debug Conduit
3963 " 🔵 recalculateForTokens Still Uses Inline Stack Capture — Missed in #debugWithStack Refactor
3964 " 🔴 TDD Red Phase: recalculateForTokens Debug Bypass Added to Test
3965 7:15p 🔴 TDD Red Confirmed: recalculateForTokens Fires Debug Calls Regardless of Debug Mode
3966 " 🔴 Red Phase Narrowed: Test Assertion Scoped to VSM:recalculateForTokens
3967 " 🔴 recalculateForTokens Fixed to Use #debugWithStack
3968 " 🔴 recalculateForTokens Debug Fix — TDD Green, Both Tests Pass
3969 " 🔴 Positive Debug Test Added for recalculateForTokens
3970 7:16p 🔵 Full Working Tree Scope: 100+ Files Changed Across Major pf2e-visioner Refactor
3971 " 🔴 Full Suite Passes After VisibilityStateManager Debug Fix — 3198 Tests
3972 7:17p 🔵 pf2e-visioner Project Has HANDOVER.md (109KB) and AGENTS.md (6.3KB) Documentation
3973 " 🔵 AvsInvalidationCoordinator Has #shouldProcessEvents() Guard Called 24+ Times
3974 7:18p 🟣 getVisibilityBatchProcessDecision Extraction Begun — TDD Red Phase
3975 7:59p 🔵 improve-codebase-architecture Skill Loaded for pf2e-visioner
3976 " 🔵 BatchOrchestrator Finalization Logic Extracted to BatchFinalizationPolicy
3977 8:00p 🟣 TDD Red Phase: BatchFinalizationWorkflow Test Written Before Implementation
3978 " 🔵 BatchFinalizationWorkflow TDD Red Phase Confirmed
3979 " 🟣 BatchFinalizationWorkflow Implementation Created (TDD Green Phase)
3980 " 🟣 BatchFinalizationWorkflow Tests Pass — TDD Green Phase Complete
3981 8:01p 🔄 BatchOrchestrator Finally-Block Replaced with BatchFinalizationWorkflow
3982 " 🔄 Full AVS Test Suite Green After BatchOrchestrator Refactor
3983 8:02p 🔵 BatchOrchestrator Ongoing Large-Scale Refactor: Many Policies and Workflows Already Extracted
3984 " 🔴 Test Failure: seek-deferred-partition Stale File-Content Assertion After BatchFinalizationWorkflow Extraction
3985 " 🔴 seek-deferred-partition Test Updated to Track batchComplete Hook Through BatchFinalizationWorkflow
3986 " 🔴 seek-deferred-partition Test Fix Verified: 16/16 Pass, ESLint Clean
3987 " 🟣 BatchFinalizationWorkflow Refactor Complete: 3236/3236 Tests Pass
3988 8:03p 🔵 Pre-Commit State: Two New Files Untracked, Two Modified Files Staged
3989 8:05p 🔵 BatchOrchestrator.processBatch Instantiates Four Workflow/Lifecycle Objects Inline
3990 8:06p 🟣 TDD Red: BatchPostResultWorkflow Per-Run flushDetectionBatch Override Test Added
3991 " 🟣 TDD Red: BatchWorkflowFactory Test Defines Interface for Injected Workflow Orchestration
3992 " 🔵 TDD Red Confirmed for Both BatchWorkflowFactory and Per-Run flushDetectionBatch Override
3993 8:07p 🟣 BatchPostResultWorkflow.run() Gains Per-Run flushDetectionBatch Override
3994 " 🟣 BatchWorkflowFactory and createDefaultBatchWorkflowFactory Implemented
3995 " 🟣 BatchWorkflowFactory and Per-Run Flush Override TDD Green Phase Complete
3996 8:08p 🔄 BatchOrchestrator Imports Consolidated: Four Workflow Imports Replaced by createDefaultBatchWorkflowFactory
3997 " 🔄 BatchOrchestrator Constructor Now Builds workflowFactory with All Adapter Wiring
3998 " 🔄 BatchOrchestrator.processBatch Fully Wired to WorkflowFactory — Inline Instantiations Removed
3999 " 🔴 seek-deferred-partition Stale Again: BatchFinalizationWorkflow No Longer Imported by BatchOrchestrator
4000 8:09p 🔴 seek-deferred-partition Assertion Updated for Three-Level Hook Indirection — All 52 Tests Pass
4001 8:11p 🔄 BatchWorkflowFactory Refactor Complete: 3238/3238 Tests Pass, ESLint Clean

Access 222k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>
