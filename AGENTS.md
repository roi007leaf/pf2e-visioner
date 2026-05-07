<claude-mem-context>
# Memory Context

# [pf2e-visioner] recent context, 2026-05-07 1:51pm GMT+3

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (20,245t read) | 242,519t work | 92% savings

### May 3, 2026
S245 Fix stealth cover bonus not appearing on stealth rolls — expanded to include third discovered bug in context routing (May 3 at 9:55 AM)
S119 GM tracker dots design pivot — dots should only show users who CAN see the stealther, not users blocked by overrides (May 3 at 9:55 AM)
### May 7, 2026
S246 Fix stealth cover bonus not appearing on stealth rolls — three bugs found and fixed, Bug 3 fix verified in source but test not yet re-run (May 7 at 8:07 AM)
1402 12:04p 🟣 Full Test Suite Passes: 2514 Tests Across 230 Suites After Prone+Ranged Cover Refactor
1403 " 🔵 Full Branch Changeset Spans 13 Files Including TakeCoverAction and TakeCoverPreviewDialog
1404 12:05p 🔵 Two-Tier Cover Update Architecture: setCoverBetween vs batchUpdateCoverEffects Callers
1405 " 🔵 cover-map.js setCoverBetween Calls batchUpdateCoverEffects Even on No-Change, Tracks Cover Source
1406 " 🔵 Design Refinement: Prone+Ranged Upgrade Rule Should Only Apply to Take Cover Action, Not All Standard Cover
1407 " 🔴 Prone+Ranged Upgrade Rule Gated Behind options.takeCover in CoverStateManager
1408 " 🟣 CoverStateManager Tests Green: 19/19 Pass With Take Cover-Scoped Prone+Ranged Upgrade
1409 12:06p 🟣 takeCover Flag Propagated Through TakeCoverAction → setCoverBetween → batchUpdateCoverEffects
1410 " 🟣 batchUpdateCoverEffects Uses takeCoverObserverKeys Set to Scope Prone+Ranged Upgrade Per Observer
1411 " 🔵 cover-array-selector-bug.test.js Lacks Expected Anchor for New Test Insertion
1412 12:07p 🟣 25 Tests Pass Across batchUpdateCoverEffects and CoverStateManager Suites With takeCover Scoping
1413 " 🟣 Test Added to Verify TakeCoverActionHandler Passes takeCover: true to setCoverBetween
1414 " 🟣 All 7 Cover-Related Test Suites Pass: 130 Tests Green With Full takeCover Flag Implementation
1415 12:08p 🟣 Prone+Ranged Cover Upgrade Feature Complete: 2518 Tests Pass, 15 Files Changed
1426 12:10p 🔵 TakeCoverAction analyzeOutcome Logic: Cover Upgrade Rules and Prone Handling
1429 12:11p 🟣 New TakeCoverAction Design: Prone Actors With No Detected Cover Get takeCoverProneRangedOnly Flag Instead of Standard Cover
1430 " 🟣 takeCoverProneRangedOnly Mode Implemented in TakeCoverAction
1432 " 🔴 Test Updated to Expect takeCoverProneRangedOnly: false in Standard Cover setCoverBetween Call
1433 " 🟣 takeCoverProneRangedOnly Propagated Through cover-map.js to batchUpdateCoverEffects
1435 12:12p 🟣 getTakeCoverProneRangedOnlyRule Added to batch.js for Prone+Ranged Cover Without Standard Cover
1437 " 🟣 batchUpdateCoverEffects Handles takeCoverProneRangedOnly Aggregate Effects as Separate Effect Track
1439 " 🟣 createTakeCoverProneRangedOnlyAggregate Factory Function Added to batch.js
1440 " 🟣 Integration Test Added for Prone Take Cover With No Cover Baseline Creating Separate Prone-Ranged-Only Effect
1443 12:13p 🟣 60 Tests Pass Across 4 Core Cover Suites Including New Prone Take Cover With No Baseline Test
1444 " 🟣 TakeCoverPreviewDialog Updated to Show Prone+Ranged-Only Cover Outcomes in UI
1445 " 🟣 62 Tests Pass Including TakeCoverPreviewDialog; ESLint Clean After Full prone+Ranged Feature
1449 " 🟣 Complete Feature: 2519 Tests Pass Across 230 Suites — Full Prone+Ranged Cover System Implemented
1455 12:20p 🔵 cover-map.js setCoverBetween Implementation Details
1456 " 🔵 TakeCoverAction Orientation: Observer = Subject Row, Target = Actor Taking Cover
1457 " 🔵 batchUpdateCoverEffects Manages PF2E Rule Elements as Aggregate Cover Items
1458 " 🔵 Cover Store Imports batchUpdateCoverEffects from ephemeral.js Not batch.js Directly
1459 12:21p 🔴 Cover Map 'none' State Now Deletes Key Instead of Setting to 'none'
1460 " ✅ Full Test Suite Passes After cover-map.js 'none' Key Deletion Fix
1461 12:22p 🔵 RuleElementCoverService Governs Rule-Element-Based Cover Blocking and Override Logic
1462 12:23p 🔵 CoverDetector Integrates RuleElementCoverService in Blocker Filtering Loop
1463 " 🔵 pf2e-visioner Token Flag Namespace Inventory
1464 " 🔵 RuleElementCoverService Has No Dedicated Unit Tests
1465 " 🔵 Rule-Element Test Pattern: Mock SourceTracker and setCoverBetween, Use getFlag/setFlag Stubs
1466 12:24p 🔵 TDD Red Phase: canTokenProvideCoverToTarget Emits console.warn on undefined document
1468 " 🔴 RuleElementCoverService Hardened Against Missing document/getFlag and Null Blocker
1469 " 🟣 RuleElementCoverService Now Has Unit Test Coverage — Full Suite at 231/2520
1470 12:25p 🔄 RuleElementCoverService Return Statement Indentation Cleaned Up
1471 12:26p 🟣 Second TDD Test Added for getCoverFromRuleElements with Missing document
1472 " 🔴 getCoverFromRuleElements Also Hardened Against Missing target.document
1473 " 🟣 RuleElementCoverService Fully Hardened and Tested — Suite at 231/2521
1474 12:27p 🔵 Prone Detection Uses Four-Path Fallback Pattern Across the Codebase
1475 " 🔵 BaseAction.apply() Pipeline and Condition Hook Architecture
1476 12:29p 🔵 Take Cover Feature Full Architecture Map
1477 " 🔵 Take Cover Apply/Preview Wiring in event-binder.js and apply-service.js
1478 12:30p 🔵 batch.js Post-Write Pipeline and Aggregate Effect Item Structure

Access 243k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>