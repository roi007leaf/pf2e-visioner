<claude-mem-context>
# Memory Context

# [pf2e-visioner] recent context, 2026-05-04 7:58am GMT+3

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (16,196t read) | 749,569t work | 98% savings

### May 3, 2026
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
822 10:39a 🔴 Floating indication tooltip unnoticed state rendered green instead of purple
823 " ✅ Version bumped from 8.1.0 to 8.1.1 in module.json
824 11:33a ✅ CHANGELOG.md updated with 8.1.1 entry
825 " 🔵 Unnoticed tooltip color still green — inline style overrides CSS class rule
826 11:38a 🔵 Root cause of green unnoticed color: #applyInlineStateColors() missing unnoticed in variableFallbacks
827 " 🔴 Fixed unnoticed color in #applyInlineStateColors() palettes and variableFallbacks
828 11:39a ⚖️ Encounter stealth setup now only grants unnoticed — RAW intent confirmed
829 11:42a 🔵 Primary session in replay loop — created redundant plan for already-completed RAW work
830 11:47a 🟣 Encounter stealth setup gains reverse-undetected RAW logic for higher-initiative stealthers
831 " 🟣 RAW encounter stealth: stealther gains undetected-of-observer when out-initiating but failing DC
832 11:48a ✅ CHANGELOG updated to document RAW reverse-undetected Avoid Notice behavior
833 " 🟣 RAW Avoid Notice three-way split: 20/20 tests pass with fresh session
834 " 🟣 Full suite 182/182 green after RAW Avoid Notice three-way split implementation
835 " ⚖️ PF2E RAW Avoid Notice: all enemies undetected/unnoticed to stealther when stealther beats all initiatives but fails all DCs
836 11:54a ⚖️ New plan: restore observer-to-stealther RAW overrides after user RAW correction
837 " 🔴 Reverted reverseUndetected direction flip — restored observer-to-stealther overrides per RAW
838 11:55a 🟣 Final RAW Avoid Notice: two-branch observer→stealther model — unnoticed or undetected per DC result
839 11:56a ✅ pf2e-visioner 8.1.1 full suite verified: 182/182 pass, lint clean
840 " 🔴 Removed dead reverseRecordKey cleanup logic from _restoreExpiredInitialOverridesForCombatant
841 1:05p 🔴 Dead reverseRecordKey cleanup removed; encounter-stealth suite 20/20 confirmed
### May 4, 2026
845 7:52a 🔵 Combat Cover Calculation Bug: Stuck State After Token Movement
846 7:53a 🔵 pf2e-visioner Cover System Architecture Mapped
847 " 🔵 Root Cause: Combat Cover Sticks Because CombatStartCoverService Never Records Pairs
848 " 🔵 Secondary Bug: AutoCoverSystem.onUpdateDocument References Nonexistent this.autoCoverSystem
849 " 🔵 recordPair Only Called in StealthCheckUseCase — Never in CombatStartCoverService or AttackRollUseCase
850 7:54a 🔴 TDD Tests Written for recordPair Gap in CombatStartCoverService and AutoCoverSystem
851 " 🔴 CombatStartCoverService Fixed: recordPair Called After Non-None Cover Set at Combat Start
852 " 🔴 AutoCoverSystem Refactored: getActivePairsInvolving Shape, cleanupCover Semantics, onUpdateDocument Self-Reference Bugs Fixed
853 7:55a 🔴 Combat Cover Stuck-on-Move Bug Fully Fixed and Verified

Access 750k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>