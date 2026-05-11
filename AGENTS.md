<claude-mem-context>
# Memory Context

# [pf2e-visioner] recent context, 2026-05-11 4:13pm GMT+3

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (21,849t read) | 195,101t work | 89% savings

### May 3, 2026
S245 Fix stealth cover bonus not appearing on stealth rolls — expanded to include third discovered bug in context routing (May 3 at 9:55 AM)
S119 GM tracker dots design pivot — dots should only show users who CAN see the stealther, not users blocked by overrides (May 3 at 9:55 AM)
### May 7, 2026
S246 Fix stealth cover bonus not appearing on stealth rolls — three bugs found and fixed, Bug 3 fix verified in source but test not yet re-run (May 7 at 8:04 AM)
S258 Debugging persistent token image flash bug in pf2e-visioner FoundryVTT module — user asked what debug log was added (May 7 at 8:07 AM)
### May 11, 2026
S262 Fix PF2E Visioner runtime SyntaxError — missing 'getVisibilityStateLabelKey' export from constants.js crashing token-hud.js visibility manager (May 11 at 2:48 PM)
2203 2:54p 🔵 Hardcoded 'isProblematicRay' Debug Hook in VisionAnalyzer — Left-in Development Artifact
2204 2:55p 🔄 Removed Debug Instrumentation and Simplified Return Values in VisionAnalyzer
2205 2:56p 🔄 VisionAnalyzer Cleanup Confirmed — Net 78 Deletions, 2 Insertions
2206 " 🔵 Foundry VTT Is Running on Port 30000 — IPv6 Binding Caused curl Failure
2207 " 🔵 Foundry VTT Runs on HTTPS at Port 30000 — Browser Test Infrastructure Available
2208 2:57p 🔵 Playwright Browser Testing Confirmed Working Against Live Foundry VTT /join Page
2209 " 🔵 Foundry VTT Environment — Version 14 Build 361, Kingmaker World, Gamemaster User ID Confirmed
2210 2:58p 🔴 Live Foundry Verification — Zero Errors on Module Load, SyntaxError Confirmed Fixed
2211 " 🔵 Double "Registering movement cost hooks" Log Is Expected — Two Registration Paths in Codebase
2212 " 🔴 Double Registration of Movement Cost Hooks — Pre-existing Bug in registration.js
2213 2:59p 🔵 Double registerMovementCostHooks — Double Wrapping is Functionally Benign Due to Idempotent Logic
2214 " 🟣 Added Failing Test for Double Movement Cost Hook Registration
2215 3:15p 🔵 Test Fix Task Initiated for Hazard Loot Manager and Deafened Detection Wrapper
2216 " 🔵 write_stdin Fails When exec_command Launched Without tty=true
2217 3:16p 🔵 No Active pf2e-visioner or Playwright Processes Found After Session Timeout
2218 " 🔵 No Node, Chromium, or Playwright Processes Running Despite Active Session
2219 3:17p 🔵 Playwright Performance Benchmark Launched for pf2e-visioner Override Validity Checks
2220 3:18p 🔵 Playwright Login Failed: Gamemaster Option Disabled in Foundry VTT Join Select
2221 " 🔵 Workaround for Disabled Gamemaster Login: Force-Enable Option via page.evaluate()
2222 3:19p 🔵 page.evaluate() Rejects Third Argument — checkOverrideValidity Benchmark Blocked
2223 3:23p 🔵 Session 50601 Hanging With No Active Node, Chromium, or Foundry Processes Visible
2227 3:32p 🔵 OverrideValidationManager.checkOverrideValidity Architecture
2228 " 🟣 Performance Instrumentation Added to checkOverrideValidity
2231 3:33p 🟣 Per-Step Real-Time Perf Logging Added to markPerf
2232 " 🔵 OverrideValidationManager Test: Mover Cannot See Observer Edge Case
2234 3:34p 🔵 Dynamic Import of VisibilityCalculator.js Takes ~2797ms on First Call
2235 " 🔵 Full checkOverrideValidity Perf Profile: 5.69s Total, 99.8% Dynamic Import Cost
2236 3:35p 🔴 Module Pre-Warm Fix Eliminates 5.7s Dynamic Import Cost in checkOverrideValidity
2237 " 🔄 All Dynamic Import Call Sites Replaced with Singleton Loader Functions
2238 3:36p 🔴 checkOverrideValidity Performance Confirmed: 5689ms → 12ms (470× Speedup)
2247 3:38p 🔵 Per-Pair Validation Throughput: 100–450ms Per Pair After Pre-Warm Fix
2248 3:39p 🔵 VisionAnalyzer.js Cold Import Costs ~650-695ms Per Pair Reaching manual_action Observed Branch
2249 3:40p 🔴 VisionAnalyzer.js Pre-Warm Added to Eliminate 650ms Cold Import in state-compare Branch
2250 " 🔴 VisionAnalyzer Pre-Warm Confirmed: Previously 650-695ms Pairs Now 1.8-2.8ms
2255 3:41p 🔴 Complete Pre-Warm Fix Validated: 20 Pairs in 39ms vs 4306ms Before (110× Speedup)
2257 3:42p 🔵 recalculateAllVisibility Integration Test Fails: Hook Payload Contains Circular FoundryVTT Object
2259 3:43p 🔵 recalculateAllVisibility Full Scene: 11.4 Seconds, 28 Long Tasks (500-600ms Each) for 47 Tokens
2260 3:44p 🔵 BatchProcessor.js Architecture: O(N²) LOS Precompute, Multi-Layer Caching, Remaining Dynamic Imports
2261 " 🔵 BatchProcessor.js Eager LOS Precompute Removal Patch Failed to Apply
2262 " 🔵 BatchProcessor.js Patch Failure Root Cause: Extra Closing Brace in Earlier sed Read
2263 3:45p 🔄 BatchProcessor: O(N²) Eager LOS Precompute Removed, Replaced with Lazy Population
2264 " 🔄 BatchProcessor: precomputedLOS Map Populated Inside getDirectionalLos for Calculator Use
2265 " 🔵 BatchProcessor Test Fails After Eager LOS Removal: Test Asserted Old Precompute Behavior
2266 3:46p 🔴 BatchProcessor hasLineOfSight Call Signature Fixed: Dropped 'sight' Argument to Match Test and Old Precompute Behavior
2267 3:47p 🔴 Lazy LOS Refactor Cuts Full Scene Recalculation from 11.4s to 4.2s (2.7× Speedup)
2268 " 🔵 Full Test Suite: 1 Remaining Failure in Observer Movement Test Expecting 'sight' Argument
2269 " 🔵 Batch Processor Test Validates precomputedLOS Lazy Population via calculateVisibilityBetweenTokens Options
2270 3:48p 🔴 hasLineOfSight Call Signature Settled: Restored 'sight' Arg, Updated Both Tests to Three-Arg Form
2271 " ✅ Full Test Suite Green: 2647 Tests Passing Across 250 Suites After All Performance Fixes
2272 3:49p ✅ Session Changes Committed as 4 Perf Commits; Additional Staged Files Include movement-cost.js and VisionAnalyzer.js

Access 195k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>