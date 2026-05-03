<claude-mem-context>
# Memory Context

# [pf2e-visioner] recent context, 2026-05-03 11:32am GMT+3

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (16,068t read) | 693,890t work | 98% savings

### May 3, 2026
772 8:53a 🔵 RED: requireStarted Option Test Confirms Guard Blocks combatStart Hook Timing
773 " 🔴 requireStarted Option Implemented: combatStart Hook Bypasses started Guard
774 " 🔵 Test Still Failing: Context Decay — Primary Session Returning Cached Test Output
775 8:54a 🔴 All 10 Service Tests GREEN: requireStarted Fix Confirmed Working
776 " 🔴 Lint Clean After Full Bug Fix: updateCombatant + requireStarted
777 " 🔵 Combat Tracker Stealth Row Hiding Not Working for Players
778 8:56a 🟣 EncounterStealthInitiativeService Switched to AvsOverrideManager.setPairOverrides
779 " 🔵 Combat Tracker Row Selector May Not Match Actual PF2e HUD HTML Structure
782 9:04a 🔵 Stealth Initiative Scoping Bug: All Combatants Evaluated Instead of Enemies Only
780 9:06a 🔵 OverrideValidationIndicator Structure — Floating Tooltip Row Architecture
781 " 🔵 Canvas Token Highlight Mechanism — HoverTooltips + highlighting.js Pattern
783 9:11a 🔵 shouldFilterAlly Is the Right Tool for Enemy-Only Observer Scoping
784 " 🟣 Enemy-Only Scoping Tests Added for Stealth Initiative Visibility
785 " 🔵 Enemy-Only Tests Confirmed RED — Two Distinct Failure Points
786 " 🔴 areEnemies Helper Added to Scope Stealth Initiative to Enemy Combatants Only
788 " ✅ Git Status: Stealth Initiative Changes Uncommitted, Other Feature Files Also Pending
787 9:14a 🔴 Enemy-Only Stealth Initiative: Test Corrected and All 13 Tests Green
789 " 🔴 Stealth initiative GM dots must persist until AVS override removed, not just until combat start
790 9:44a ⚖️ GM dots design reverted to show all users — both can-see and cannot-see
791 " 🟣 GM dots show both can-see and cannot-see users — keyed on `hasInitialOverride`
792 9:45a 🔴 GM dots now pass 15/15 with both can-see and cannot-see users shown
793 " ✅ Full suite 122/122 green, lint clean — stealth initiative feature ready to commit
794 9:48a 🔵 GM dots still removed before override is removed — `hasInitialOverride` fix insufficient
795 9:49a 🔵 Root cause trace: `applyTrackerVisibility` early-return path on GM — dots survive, not removed
796 " 🔵 New test exposes dot-condition bug: `canSee` is true after override removal, so dot persists incorrectly
797 9:50a 🔴 GM dot lifecycle fixed: `hasInitialOverride` now checks `_hasInitialHideRecord` OR any override flag, not just source-matched flags
798 " 🔄 New `_hasActiveInitialTrackerRecord` helper unifies record+flag check with auto-cleanup on flag removal
799 " 🔴 16/16 tests passing — `_hasActiveInitialTrackerRecord` fix confirmed green
800 " ✅ Full suite 123/123 green, lint clean — stealth initiative feature ready to commit
801 9:55a 🔵 Design question: two dots show even when only one user beats stealther initiative
S119 GM tracker dots design pivot — dots should only show users who CAN see the stealther, not users blocked by overrides (May 3 at 9:55 AM)
802 9:56a ⚖️ Final GM dots design: show ONLY canSee=true users; `hasInitialOverride` gates canSee computation only
803 " 🔄 GM dots simplified back to `canSee`-only gate — `hasInitialOverride` removed from dot rendering
804 " ✅ Full suite 123/123 green, lint clean — stealth initiative feature final verified state
805 9:57a ⚖️ Tracker turn-reveal behavior: user prefers stealther stays hidden until override explicitly removed
806 10:00a 🟣 GM Tracker Initial-Stealth Marker (eye-slash icon)
807 10:01a 🟣 CSS for GM stealth initial-marker icon
808 10:07a 🟣 Tests added for eye-slash initial-stealth marker in GM dots
809 10:09a 🟣 Eye-slash initial-stealth marker: full suite green
810 10:10a ⚖️ GM dots flipped: now show users who CANNOT see the stealther
811 10:11a 🔵 Tests fail: service still renders dots for canSee=true, tests now expect canSee=false
812 10:13a 🟣 Service implementation flipped: GM dots now show blocked players, eye-slash marker removed
813 " ✅ Remaining initial-marker test assertions flipped to toBeNull
814 " 🔵 Test "keeps GM tracker dot while metadata changes" has stale expectation at line 540
815 " 🔴 All 17 stealth tests green after "cannot see" dot migration
816 " 🔄 Dead code removed: eye-slash marker method and CSS deleted
817 " 🟣 Stealth initiative feature complete: 124/124 green, lint clean
818 10:14a 🟣 Two-tier stealth visibility: unnoticed/undetected in EncounterStealthInitiativeService
819 " 🟣 Unnoticed hover tooltip requested (matching undetected purple tooltip)
820 10:21a 🔵 Undetected tooltip/styling system structure discovered for unnoticed parity work
821 10:38a 🔵 Duplicate styles directory discovered: scripts/styles/ mirrors styles/

Access 694k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>