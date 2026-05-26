<claude-mem-context>
# Memory Context

# [pf2e-visioner] recent context, 2026-05-25 5:07pm GMT+3

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (23,431t read) | 134,660t work | 83% savings

### May 25, 2026
S654 Bug fix: tokens in darkness without darkvision incorrectly revealed as black circles on move instead of showing soundwave indicator (May 25 at 7:53 AM)
S655 Fix pf2e-visioner bug: tokens in darkness with no darkvision show as black circles when moving instead of keeping soundwave detection indicator (May 25 at 7:54 AM)
S668 Soundwave visibility bug in pf2e-visioner: kobold soundwave (detectionFilter mesh) not visible until user hovers over the token (May 25 at 9:01 AM)
S686 Fix token reveal firing only on movement end instead of when LOS actually detects the token during movement (pf2e-visioner FoundryVTT module) (May 25 at 10:36 AM)
S690 FPS drop during token movement in pf2e-visioner (FoundryVTT module) — systematic debugging with Playwright as Ass Gm (May 25 at 1:25 PM)
S691 Debug why Ezren only reveals kobolds at movement end instead of when LOS is first established mid-drag — investigate pending-token-movement LOS detection timing bug (May 25 at 1:49 PM)
S698 Debug major FPS drop when moving tokens in Foundry VTT — investigating token lights vs. wall/visibility rendering as root cause, using Playwright as "Ass Gm" (May 25 at 2:06 PM)
5785 3:33p 🔴 Syntax Error Identified: Duplicate `const originPoint` Declaration at Line 759 — Revert Left Both Old and New Declarations
5786 3:39p 🔵 Pending Token Movement Fix Reverted Without Resolving Root Cause
5787 3:41p 🔵 Playwright Drag-State Debugging Script for Pending Token Movement
5788 3:42p 🔵 Drag State Captured as Inactive During Simulated Playwright Drag
5789 3:43p 🔵 Pending Token Movement Bug — Revert Without Fix
5790 3:44p 🔵 FPS Drop Investigation Initiated for Token Movement
5791 3:45p 🔵 Token Drag State Captured Mid-Move via Playwright
5792 3:47p 🟣 Added `controlledTokenDragDestinationPosition` Helper to Pending Movement
5793 3:48p 🔴 Sight Line Origin Now Uses Live Drag Destination Instead of Current Token Position
5794 3:49p 🟣 Unit Test Added for Drag-Destination-Based Sight Line Reveal
5795 3:50p 🔵 New Drag Destination Test Fails at `refreshPendingControlledTokenDragIntent` Return Value
5796 3:51p 🔵 `refreshPendingControlledTokenDragIntent` Requires Prior `primePendingControlledTokenDragIntent` Call
5797 3:52p 🔴 All 155 Pending Movement Tests Pass — Drag Destination Sight Fix Verified
5798 3:54p 🔵 Live Playwright Validation Confirms Drag Destination Visibility Logic Works End-to-End
5799 3:55p 🔵 Two-Tier Final Visibility Prediction Architecture in pending-movement-final-visibility.js
5800 3:56p 🔵 `getPendingMovementVisibilityState` Is the Central Visibility Resolver Called from 6+ Sites
5801 3:58p ✅ Final Git Diff: Drag-Destination FPS Fix — Complete Changeset Confirmed
5802 3:59p 🔵 Call Graph Mapped: `getPendingMovementVisibilityState` Calls `getPredictedFinalVisibilityState` First
5803 " 🔵 Controller Wiring Confirms `currentPendingMovementSightLineSeesTarget` Fix Propagates to Soundwave Controller
5804 4:00p 🔵 `activePreviewCanRevealStoredUndetectedTarget` Delegates Final Check to `currentPendingMovementSightLineSeesTarget`
5805 4:01p 🔵 `controlledTokenDragIntentRefreshTargetIds` Also Uses `currentPendingMovementSightLineSeesTarget` to Filter Refresh Targets
5806 4:02p 🔵 `currentPendingMovementSightLineSeesTarget` Lives in `pending-movement-sight-line.js`, Not `pending-token-movement.js`
5807 4:05p 🟣 Drag Final Visibility Prediction Cache Added to Eliminate Per-Query Recomputation
5808 " ✅ Test Updated to Reflect Cached Geometric Prediction as Primary Drag Visibility Driver
5809 4:06p 🔴 All 155 Tests Pass After Drag Prediction Cache Added — Full FPS Fix Complete
5810 4:48p 🔵 FPS Drop Identified When Moving Tokens in VTT App
S699 Debug major FPS drop when moving tokens in Foundry VTT — investigating token lights vs. wall/visibility rendering as root cause, using Playwright as "Ass Gm" (May 25 at 4:48 PM)
S700 Debug major FPS drop when moving tokens in Foundry VTT — investigating token lights vs. wall/visibility rendering as root cause, using Playwright as "Ass Gm" (May 25 at 4:48 PM)
5811 4:54p 🔵 FPS Drop Identified During Token Movement in VTT Application
5812 " 🔵 FPS Investigation is in the pf2e-visioner Foundry VTT Module
5813 4:57p 🔵 FPS Drop During Token Movement — Investigation Initiated
5814 " 🔵 Pending Movement Refresh Scheduler Controls Animation Cadence
5815 " 🔵 pf2e-visioner Pending Movement System — Key Function Map
5816 5:00p 🔵 FPS Drop Investigation Initiated for Token Movement
5817 " 🔵 pf2e-visioner Pending Movement System Architecture Mapped
5818 5:02p 🔵 scheduleAnimationRenderRefreshes Is the Per-Frame Performance Driver During Token Movement
5819 " 🔵 LOS Reveal Delayed Until Animation End in pf2e-visioner
5820 5:03p 🔵 Key Service Files Identified for Movement/Animation Investigation
S701 FPS drop during token movement in pf2e-visioner FoundryVTT module — systematic debugging initiated (May 25 at 5:03 PM)
5821 " 🔵 Auto-Visibility Core Layer Contains Animation References
5822 5:04p 🔵 PendingMovement Service Structure and Animation Hook Locations Mapped
5823 " 🔵 Hook Entry Points for Token Update Events Identified
5824 " 🔵 scripts/hooks/lifecycle.js (40.8K) Is a Major Candidate for Animation Lifecycle Control
5825 " 🔵 token-events.js Uses `animate: false` Flag and Calls updateTokenVisuals Post-Update
5826 5:05p 🔵 Removed refreshToken Hook Is Likely Root Cause of Animation Reveal Delay Bug
5827 " 🔵 Complete Hook Registration and Handler Chain Traced to token-render-lifecycle.js
5828 " 🔵 Per-Frame Refresh Loop Calls Full Canvas Perception Update Every Cycle
5829 5:06p 🔵 Full Reveal Pipeline Traced: schedulePendingTokenMovementCompletion → AVS Batch → refreshPendingMovementTokenVisibility
5830 " 🔵 pf2e-visioner Pending Movement Module File Structure Mapped
5831 " 🔵 pending-token-movement.js Has Animation Detection Logic but Doesn't Hook Mid-Animation Reveals
5832 5:07p 🔵 Animation Refresh Scheduler Uses Wall-Clock Timeouts, Not Animation Frames; Requires Non-Empty targetTokenIds
5833 " 🔵 createPositionedTokenProxy Uses JS Proxy to Virtualize Token Position for LOS Evaluation
5834 " 🔵 centerForToken Accepts positionOverride — Enables Mid-Animation LOS Calculation at Arbitrary Route Points

Access 135k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>
