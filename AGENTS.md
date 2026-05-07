<claude-mem-context>
# Memory Context

# [pf2e-visioner] recent context, 2026-05-07 2:11pm GMT+3

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (17,664t read) | 269,587t work | 93% savings

### May 3, 2026
S245 Fix stealth cover bonus not appearing on stealth rolls — expanded to include third discovered bug in context routing (May 3 at 9:55 AM)
S119 GM tracker dots design pivot — dots should only show users who CAN see the stealther, not users blocked by overrides (May 3 at 9:55 AM)
### May 7, 2026
S246 Fix stealth cover bonus not appearing on stealth rolls — three bugs found and fixed, Bug 3 fix verified in source but test not yet re-run (May 7 at 8:07 AM)
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
1479 1:51p ✅ Patch Version Increment with Changelog for Cover System
1480 " 🔵 pf2e-visioner Module Manifest Snapshot
1481 " 🔵 pf2e-visioner CHANGELOG.md Structure and History
1482 " ✅ module.json Patch Version Bumped to 8.1.13
1483 1:52p 🟣 pf2e-visioner 8.1.13 Released: Prone Take Cover and Cover Effect Visibility
1491 2:00p 🟣 Attack Trait Actions Remove Prone Take Cover Effect
1492 2:01p 🔵 take-cover-expiration-service.js: Current Attack Roll Detection Logic
1493 " 🔵 AutoCoverHooks._isAttackContext Has Broader Attack Detection Than Expiration Service
1494 " 🔵 Existing Expiration Tests Cover Roll Types Only, Not Attack-Trait Actions
1495 " 🟣 TDD: Failing Test Added for Attack-Trait Action Expiry
1496 " 🟣 Expiration Service Refactored to Detect Any Attack-Trait Action
1497 " 🔴 Prone Take Cover Now Expires on Any Attack-Trait Action (All Tests Pass)
1498 2:02p 🟣 Attack-Trait Expiry Change Passes Full Chat Test Suite and Lint
1499 " 🟣 Full Test Suite Passes After Attack-Trait Expiry Feature (2538 Tests, 233 Suites)
1500 2:06p 🔵 autoCover Object Shape Used Across Sneak and Hide Actions
1501 " 🔵 cover-bonus-btn Greater Cover CSS Uses Wrong Fallback Color (#4caf50 = Green, Not Red)
1502 2:07p 🔴 TDD: Failing Test Added for Greater Cover Bonus Button Wrong Fallback Color
1503 " 🔴 Greater Cover Bonus Button Test Hardened to Avoid False Positive
1504 " 🔴 Confirmed: Greater Cover Bonus Button Uses #4caf50 (Green) Fallback in CSS Rule
1505 " 🔴 Greater Cover Bonus Button Fallback Color Fixed to #f44336 (Red)
1506 " 🔴 Greater Cover Bonus Button Color Fix Verified and All Layout Tests Pass
1507 2:08p 🔴 Greater Cover Bonus Button Color Fix Shipped to v8.1.13 Changelog
1508 2:09p 🔴 Prone Take Cover Always Bypasses Dialog, Even With Regular Cover Outcomes Present

Access 270k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>