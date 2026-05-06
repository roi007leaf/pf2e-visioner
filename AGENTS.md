<claude-mem-context>
# Memory Context

# [pf2e-visioner] recent context, 2026-05-06 11:36am GMT+3

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (22,103t read) | 3,050,706t work | 99% savings

### May 3, 2026
S119 GM tracker dots design pivot — dots should only show users who CAN see the stealther, not users blocked by overrides (May 3 at 9:55 AM)
### May 6, 2026
1142 10:11a 🔵 hide-action.js and HideAction.js have divergent semantics beyond import paths — behavioral differences confirmed
1145 10:13a 🔵 Task 6 Code Review Re-Verification Scope — pf2e-visioner
1146 10:14a 🔴 Task 6 Prior Findings All Verified Fixed
1147 " 🔵 SneakPreviewDialog Prerequisite Logic Unified via perception-profile.js Helpers
1148 " 🔵 Divergence: HideAction.js Missing FeatsHandler.upgradeCoverForCreature Call
1149 " 🟣 New Tests Cover All Three Prior Findings in Task 6
1150 10:15a 🔵 Task 6 Test Suite: 71/71 Pass — All Three Target Files Green
1151 " 🔵 Confirmed Remaining Divergences: HideAction.js vs hide-action.js (New Findings)
1152 10:16a 🔵 Task 6 Hide Action Code Quality Re-Review (pf2e-visioner)
1153 10:18a 🔄 Hide Action Mirroring: Prerequisite Logic Unified via perception-profile.js
1154 " 🔵 Remaining Divergence: outcomeToChange/entriesToRevertChanges Between Hide Files
1155 " 🔄 SneakPreviewDialog: Extracted sneakStartPositionQualifies and sneakEndPositionQualifies
1156 " 🔄 DualSystemIntegration._combineSystemStates Simplified to Pass-Through
1157 " 🟣 Task 6 Regression Tests Added for Hide/Sneak Alignment
1158 " 🔵 perception-profile.js: canAttemptHideOrRemainHidden Semantics
1159 10:19a 🔵 Task 6 Test Suite: 73/73 Passing After Hide Alignment
1160 " 🔵 Concealment Detection Model Plan: Architecture and Design Decisions
1161 10:20a 🔵 VISIBILITY_STATES Option Builders: All Sites Requiring Task 7 Filter
1162 10:21a 🟣 TDD RED: New Test Added for Task 7 Scope/Manual Metadata
1163 " 🟣 Task 7: scope/manual Metadata Added to VISIBILITY_STATES + getManualVisibilityStateEntries Helper
1164 " 🟣 Task 7: Option Builder Filters Applied to context.js and QuickPanel.js
1165 10:22a 🟣 Task 7: TDD GREEN — All 135 Tests Passing After Option Builder Filters
1166 " 🟣 Task 7 Complete: Full Verification — 413 Tests Passing, Diff Confirmed
1167 " ✅ Task 7 Final Verification: Lint Clean, Changed Files Confirmed
1168 10:23a 🔵 Task 7 VISIBILITY_STATES metadata verified in constants.js
1169 " 🔵 Generic manual option builders in context.js and QuickPanel.js both filter unnoticed correctly
1170 10:24a 🔵 Full git diff reveals all Task 7 changes across 5 files
1171 " 🔵 VisibilityRegionBehavior.js uses Object.keys(VISIBILITY_STATES) for schema choices — includes unnoticed
1172 " 🔵 context.js has a third manual filter site at line 673 — legend/bulk-action bar
1173 10:25a 🔵 Task 7 test suite: 23 suites / 135 tests all PASS
1174 10:28a 🔵 Task 7 Spec Compliance: constants.js and VisibilityRegionBehavior.js Verified
1175 " 🔵 Task 7 Full Spec Compliance Verified Across All Files
1177 10:29a 🔵 Code Quality Review Initiated for pf2e-visioner Task 7
1176 10:31a 🔵 Task 7 Spec Compliance: All 144 Tests Pass Across 24 Suites
1183 10:32a 🔵 Task 8 Final Sweep: High-Risk Remaining Caller in DualSystemResultApplication
1184 " 🔵 Final Sweep Sweep Classification: Remaining Hits Are Mostly Safe Leftovers
1178 10:33a 🟣 Task 7: `unnoticed` State Locked Out of Manual UI Surfaces
1179 " 🔵 Duplicate `manual !== false` Filter Helper: `getManualVisibilityStateEntries` vs `getManualVisibilityKeys`
1180 " 🔵 Bug: `stealthDC` in Target Mode Uses `extractPerceptionDC` Twice
1181 " 🔵 Stub: `PositionAwareStateTransitions._applyStateChange` Has No Return Value on Success Path
1182 " 🔵 Task 7 Tests Pass; ESLint Clean on All 7 Review Files
1188 10:36a 🟣 perception-profile.js adapter module added to pf2e-visioner
1189 " 🔴 DetectionWrapper unnoticed threshold bug fixed via profile adapter
1190 " 🔄 EncounterStealthInitiativeService migrated to profile-based semantics
1191 " 🔄 unnoticed scoped to encounter-only in VISIBILITY_STATES constants and all UI pickers
1192 " 🔴 Hide/Sneak prerequisite logic no longer treats hidden or undetected as concealment
1193 " 🟣 StatelessVisibilityCalculator now emits profile metadata alongside legacy state
1194 " 🔴 hide-action.js fixed: FeatsHandler import case and token resolution for rule elements
1195 " 🔵 Focused test run: 100 tests across 5 core suites pass after concealment/detection model implementation
1196 " ✅ pf2e-visioner bumped to 8.2.0 with concealment/detection model changelog

Access 3051k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>