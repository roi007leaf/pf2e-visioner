<claude-mem-context>
# Memory Context

# [pf2e-visioner] recent context, 2026-04-20 2:32pm GMT+3

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (23,113t read) | 941,693t work | 98% savings

### Apr 20, 2026
63 9:46a 🔵 Pre-commit verification: old log confirms fix scope — batch 2 ran ephemeral sync but excluded Berk via stale-effects gate
64 9:59a 🔵 Live game log confirms AVS fix pipeline works end-to-end with correct authoritative state resolution
65 " 🔵 _applyBatchResults and setVisibilityMap full implementation traced: dedup, override-flag guard, and hook notification chain
67 10:00a 🔵 BatchProcessor full pair-computation pipeline traced: override guard, LOS short-circuit, cache hierarchy, and update condition
69 10:01a 🔵 setVisibilityMap has 10+ direct callers across the codebase outside BatchOrchestrator pipeline
73 10:02a 🟣 _applyBatchResults instrumented with 5 new probe events for full update decision tracing
74 10:50a 🔄 debug-probe.js: emitProbe collapses to single-line output
77 10:56a 🔵 batch-apply-post-persist reads stale Foundry document cache after setVisibilityMap
78 " 🔵 Live log confirms full batch pipeline firing correctly — only post-persist read is wrong
79 10:58a 🔴 setVisibilityMap refactored to use Foundry .-= deletion syntax to prevent stale key merges
80 " 🔵 batch-apply-post-persist stale read confirmed reproducible in unit tests
81 11:08a 🔵 _collectAuthoritativeEphemeralUpdates stale-read root cause confirmed in code
82 " 🔵 registration.js updateToken hook: scheduleLocalPerceptionRefreshForTokenUpdate wired before movement guard
83 " 🔵 TDD approach confirmed for batch-apply-post-persist stale-read fix
84 11:10a 🔵 AVS re-detection regression: token stays undetected after moving back into sight
85 11:11a 🔄 pf2e-visioner: debug-probe removed, visibility-map deletion fixed, ephemeral sync scoped to actual updates
89 11:23a ✅ pf2e-visioner bumped to v8.0.2 with AVS stale-entry fix documented
93 11:27a 🔴 AVS re-detection fix: Foundry flag merge causes stale visibility map entries
96 11:30a 🔵 StatelessVisibilityCalculator: full decision pipeline and hasLineOfSight short-circuit mapped
97 " 🔵 VisionAnalyzer.hasLineOfSight: hybrid polygon+geometric strategy with stale-polygon detection
100 11:35a 🔵 pf2e-visioner AVS logger usage mapped across all core files
101 11:38a 🟣 TDD test added for VisionAnalyzer door-shortcut-block debug log emission
102 11:39a 🔵 VisionAnalyzer door-shortcut bug: same-side endpoints trigger false LOS block
103 " 🔴 door-shortcut-debug test: fixed mockLogger hoisting error
104 11:41a 🔴 door-shortcut-debug test: loggerProxy pattern fixes undefined logger at module load
106 " 🟣 VisionAnalyzer door-shortcut-block structured debug log added to #checkSingleRayLOSWithWalls
107 11:42a 🔵 line-of-sight-basic.test.js: all 11 tests green after door-shortcut-block log changes
108 11:43a 🟣 VisionAnalyzer.js door-shortcut-block logging finalized: observer/target fields removed to fix scope
110 11:44a 🔵 logger.js: getLogger creates new object per call; VisionAnalyzer scope split between two settings
111 11:45a 🔴 VisionAnalyzer: door-shortcut-block logs switched from 'VisionAnalyzer' to 'AutoVisibility:VisionAnalyzer' scope
112 11:50a ✅ door-shortcut-debug test: assertion pivoted from mockLogger.debug to console.info spy
113 11:51a 🟣 VisionAnalyzer: emitDoorShortcutDiagnostic implemented — always-on console.info for door shortcut blocks
115 11:52a 🔵 AVS re-detection bug: token stays undetected after moving back into line of sight
117 " 🔴 VisionAnalyzer door-shortcut diagnostic: emit guard added for same-side-only firing
119 11:56a 🔵 VisionAnalyzer.hasLineOfSight: hybrid vision-polygon + geometric LOS pipeline mapped
120 " 🔴 LOS same-side door false-block: regression tests added for horizontal and vertical cases
123 11:57a 🔵 Door shortcut still fires return-false for same-side rays — tests pass only via multi-point sampling fallback
124 11:58a 🔴 VisionAnalyzer door-shortcut: replaced proximity bounding-box check with parametric ray-plane intersection
125 11:59a 🔴 VisionAnalyzer door-shortcut fix verified: all 14 LOS tests green, door-shortcut-debug test updated for new behavior
128 12:04p ✅ door-shortcut-debug.test.js: consoleInfoSpy removed, test renamed to reflect new behavior
129 12:05p ✅ AVS door-shortcut bugfix: final working tree diff — 2 files changed, 139 insertions, 20 deletions
130 12:06p 🔵 pf2e-visioner current version is 8.0.2 — door-shortcut fix needs changelog entry
131 " ✅ CHANGELOG.md updated: door-shortcut LOS fix added to [8.0.2] Fixed section
133 12:08p 🔵 Test suite: one failing integration test — api-integration state management
134 12:09p 🔵 Root cause of failing test: setVisibilityBetween treats "observed" as deletion/no-op, not a write
136 " 🔵 Integration test mock: document.update doesn't update getFlag — "observed" deletion not reflected in reads
138 12:10p 🔴 tests/setup.js mock token update() now handles Foundry dotted-path unset syntax and 4-part flag paths
141 " 🔴 Full test suite green: 218 suites / 2392 tests after setup.js mock fix
143 12:12p 🔵 TokenEventHandler animation/drag guard and moveToken vs updateToken split for visibility batching
144 12:15p 🔵 PositionManager: 4-priority position resolution for tokens during animation and drag

Access 942k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>