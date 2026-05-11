<claude-mem-context>
# Memory Context

# [pf2e-visioner] recent context, 2026-05-11 12:58pm GMT+3

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (20,124t read) | 586,221t work | 97% savings

### May 3, 2026
S245 Fix stealth cover bonus not appearing on stealth rolls — expanded to include third discovered bug in context routing (May 3 at 9:55 AM)
S119 GM tracker dots design pivot — dots should only show users who CAN see the stealther, not users blocked by overrides (May 3 at 9:55 AM)
### May 7, 2026
S246 Fix stealth cover bonus not appearing on stealth rolls — three bugs found and fixed, Bug 3 fix verified in source but test not yet re-run (May 7 at 8:04 AM)
### May 11, 2026
S258 Debugging persistent token image flash bug in pf2e-visioner FoundryVTT module — user asked what debug log was added (May 11 at 10:50 AM)
2051 11:11a 🔵 TokenFlashDebug Architecture: Singleton State, Monkey-Patching, and DOM Observer
2052 " ⚖️ TokenFlashDebug Uses Namespaced Token Prototype, Not Deprecated Global
2053 11:12a 🔵 Three Failing Tests Reveal Missing Behaviors in token-flash-debug.js
2054 " 🔴 token-flash-debug.js: Fixed isEnabled, Added Parent/Ancestry to Log, Added DOM Image Deduplication
2055 11:13a 🔵 Time-Based DOM Image Deduplication Fails in Jest: 9 Events Fired for 2 Images
2056 " 🔴 token-flash-debug.js Test Suite Now 10/10 Pass; Deduplication Scoped to Event Store Only
2057 11:16a 🔵 isEnabled() Fix Reverted: token-flash-debug.js on Disk Still Has Hardcoded return true
2058 11:17a 🔵 Full token-flash-debug.js Code Review: isEnabled Fix Absent on Disk, Complete Public API Confirmed
2059 11:18a 🟣 DOM Image Owner Kind Classification Added: pf2e-hud-owned-actor Pattern Detected
2060 " 🔵 Final Verified State: token-flash-debug.js Correct on Disk; Broader Project Context Revealed
2061 11:19a 🔵 Token Flash Root Cause Investigation: Systematic Debugging Approach Initiated
2062 " 🔵 refreshToken Hook in registration.js Calls updateSystemHiddenTokenHighlights on Every Controlled Token Refresh
2063 " 🔵 controlToken Session Tracking and Suppression Architecture Mapped
2064 " 🔵 pf2e-hud-take-cover Integration Identifies #pf2e-hud-persistent as Key DOM Element
2065 11:30a 🔵 Wall Sense Proximity/Distance/Attenuation Logic in pf2e-visioner
2066 11:34a 🔵 FoundryVTT Running on Port 30000, No Chrome Debug Port Active
2067 " 🔵 FoundryVTT Accessible at localhost:30000, No Browser Automation Libraries Available
2068 11:35a 🔵 pf2e-visioner Project Structure Confirmed, No Playwright/Vite Config Present
2069 " 🔵 pf2e-visioner Uses Jest with jsdom, Not Playwright — Version 6.1.0
2070 " 🔵 FoundryVTT Version 14 Build 361 Running with World Named "Test"
2071 " 🔵 Playwright 1.52.0 Available via npx for Browser Automation
2072 11:36a 🔵 npx -p playwright Does Not Expose Module to require() in node -e Scripts
2073 " 🔵 Playwright Installed to /tmp Sandbox for Browser Automation Against FoundryVTT
2074 " 🔵 Debugging Token Visibility: Amiri Appearing in Daylight Instead of Darkness
2075 " 🔵 Playwright Browser Binaries Not Downloaded — chromium_headless_shell Missing
2076 11:37a ✅ Chromium 136 Browser Binaries Downloaded for Playwright Automation
2077 " 🔵 pf2e-visioner Lighting & Visibility Architecture Mapped
2079 " 🔵 DetectionWrapper Overrides FoundryVTT Detection with Viewport & Sneak Guards
2080 " 🔵 TokenEventHandler Movement Pipeline: Animation Deferral and Cache Clearing
2078 " 🔵 FoundryVTT V14 Requires Chromium 146+, Playwright 1.52.0 Ships Chromium 136 — Compatibility Warning
2081 11:38a 🔵 Playwright Latest Version is 1.59.1 — Likely Bundles Chromium 146+ for FVTT V14 Compatibility
2082 " 🔵 LightingCalculator Rule Element Short-Circuit: LightingModifier Overrides All Scene Lighting
2083 " 🔵 TokenEventHandler Light Change Path Uses lightingRefresh Hook with suppressLightingRefresh Guard
2084 " 🔵 VisibilityCalculator Adapter Pattern: Delegates All Calculations to StatelessVisibilityCalculator
2085 " ✅ Playwright 1.59.1 with Chrome 147 Set Up in New /tmp Sandbox for FVTT V14 Compatible Automation
2086 11:39a 🔵 FoundryVTT /join Page Fully Mapped with Chrome 147 — No Compatibility Errors, WebGL Lost in Headless
2087 11:40a 🔵 Player2 Login Succeeds but Page Stays on /join — World Not Active (No GM Connected)
2088 11:41a 🔵 Game Canvas Loads as Player2 — Zero TokenFlashDebug Events, PF2E Visioner Registers Hooks Twice
2089 11:42a 🔵 Double "Registering movement cost hooks" Confirmed on Both GM and Player Sessions — Systematic Double-Init Bug
2090 11:44a 🔵 TokenFlashDebug Events Confirmed Working — All Perception Updates on Landing Scene Sourced from pf2e-hud, Not pf2e-visioner
2091 11:45a 🔵 TokenFlashDebug dom.img Event Type Revealed — Tracks DOM Image Additions via MutationObserver with ownerKind Classification
2092 11:46a 🔵 Custom systematic-debugging Superpower Loaded — Defines Iron Law: No Fixes Without Root Cause Investigation
2093 " 🔵 Git Status Reveals Active "Proximity Walls" Feature Branch — token-flash-debug.js is Untracked, BatchOrchestrator Modified Unstaged
2094 " 🔵 BatchOrchestrator Architecture Confirmed — Only Fires on Explicit enqueueTokens() Call, Not on Passive Scene Events
2095 " 🔵 npm test -- --runInBand Conflicts with Baked-in --maxWorkers=50% in package.json test Script
2096 11:47a 🔴 Root Cause Found: token-flash-debug.js isEnabled() Hardcoded to Return true — Always Active Regardless of Debug Setting
2097 " 🔵 token-flash-debug.js Always Installed in Hooks.once('init') — Performance Impact on Every Session
2098 " 🔴 Fixed: token-flash-debug.js isEnabled() Now Checks Debug Setting — All 11 Tests Pass
2099 11:48a 🔴 Full Test Suite Green After isEnabled() Fix — 250 Suites, 2651 Tests Pass in 7.6s
2100 12:54p 🔵 PF2e Visioner Module – Reverse Proximity Approach Explored

Access 586k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>