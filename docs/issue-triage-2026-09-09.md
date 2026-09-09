# Open issue review — 2026-09-09

All six reports and their comments reviewed. The fixes below are included in 8.6.0.
This document records the regression and live acceptance checks performed before release.

| Issue | Status | Finding and next step |
| --- | --- | --- |
| [#302](https://github.com/roi007leaf/pf2e-visioner/issues/302) | Patched; regression passes | Batch processor fell back to 20 scene units. Forward spatial service through the dependency container and consult its live range when no explicit distance is supplied. Regression exercises actual factory construction at 30 and 150 ft. Existing spatial service default remains 100 ft, with its special-sense expansion; no new settings added. |
| [#303](https://github.com/roi007leaf/pf2e-visioner/issues/303) | Patched; regression passes | Viewport filtering dropped changed observers or their targets. Widen computation scope when eligible scene tokens are omitted; bypass downstream viewport filter too. Tests cover empty viewport and either token visible. Spatial and door-pair filtering remain. |
| [#305](https://github.com/roi007leaf/pf2e-visioner/issues/305) | Patched; regression passes | Reverse-only override skipped both directions. Skip whole pair only when both directions have overrides; retain per-direction guards and accounting. Regression verifies hider sees the other token while the reverse Hidden override is persisted. |
| [#304](https://github.com/roi007leaf/pf2e-visioner/issues/304) | Patched; regression passes | Unselected player hard-hide state could latch indefinitely. Derive active observers via Core `_isVisionSource()` and union their visibility. Retain existing mark if no source is available or checks throw. Player visibility/detection/override flag updates clear frame cache, refresh targets, reconcile render locks, and schedule perception; unrelated flags and GM updates keep existing paths. |
| [#301](https://github.com/roi007leaf/pf2e-visioner/issues/301) | Patched; live reproduction and regression pass | Reproduced at 30 ft inside native darkness region with observer light: opening door left target Hidden; movement repaired it. Wall invalidation cleared LOS but retained stationary lighting samples. Clear LightingPrecomputer caches on wall invalidation. After reload, same door opening produces Observed, visible token art, and no detection filter before any reselect/movement. |
| [#306](https://github.com/roi007leaf/pf2e-visioner/issues/306) | Patched; live reproduction and regression pass | User's simpler setup reproduces without manual overrides: scent 60 ft detects target 30 ft across a wall blocking sight and sound, leaving a recognizable silhouette. Scent presence-marker selection excluded AVS Hidden tokens that Core still rendered. Include scent-detected Hidden targets and remove the marker when vision returns. Added independent, opt-in Blocks scent checkbox to native and advanced Visioner wall settings; open doors bypass it. Sight, sound, and Silence remain independent. |

## Validation

- Each patched defect reproduced with a failing regression before its fix.
- Full suite after darkness fix: 501 suites / 4,645 tests passed (includes concurrent cover work).
- Full suite after scent marker and wall setting: 503 suites / 4,668 tests passed. Changed production files pass ESLint; diff whitespace check passes.
- Live #306: closed door with scent allowed = Hidden plus generic scent marker, token mesh/filter off; open door = normal token art, no marker. Toggling Blocks scent on = Undetected with no marker; toggling off restores marker without movement. Native wall checkbox saved and reopened checked; advanced settings reflected the saved value and saved unchecked successfully.
- Follow-up #306 flash: Core render refresh and Hidden-filter priming could expose token art before asynchronous scent-marker suppression. Suppress identifying surfaces synchronously in both paths, reading the separate detection map when perception-profile sense metadata is absent. Regression tests cover repeated refreshes before marker creation and another observer retaining normal sight.
- Flash acceptance: 40 live refresh/priming samples exposed art before the detection-map fallback; 0 of 40 afterward, with scent marker retained. Final suite: 504 suites / 4,673 tests passed; targeted ESLint and diff whitespace checks pass.
- Door-specific follow-up: closing exposes stale Observed/avs-visible, then Hidden with the old vision/hearing sense before the scent write. Read normal closed door geometry for scent observers during these intermediate states; preserve explicit Observed overrides. Guard primary token mesh and detection-filter draw calls, in addition to refreshes, so delayed Core surface updates cannot expose identifying art. Retained the existing V13-only outer render wrapper; V14 uses the narrower primary-mesh draw guard.
- Final door-flash acceptance: eight open/close transitions across light and native darkness produced zero exposed token-art draws; scent indicators remained visible when appropriate. Full regression suite passed: 504 suites / 4,674 tests.
- Earlier focused run: 5 suites / 197 tests; darkness/invalidation run: 3 suites / 45 tests.
- ESLint passed for all six changed production files; `git diff --check` passed.
- Foundry is reachable at `https://localhost:30000` (HTTP returns `ERR_EMPTY_RESPONSE`).
  Joined as Roi after extension popup was dismissed. Created a separate QA scene without
  activating it for players. Live 30 ft door check passes: closed = Undetected both ways,
  open = Observed both ways, without moving or selecting tokens.
- Same 30 ft test also passed with GM camera offscreen. Darkness-region reproduction failed
  before the lighting-cache patch and passed after browser reload, including actual token art.
- #304 separate player-client acceptance passed: GM at localhost and a non-GM account at 127.0.0.1, both HTTPS. With no selected token, repeated remote door changes restored and removed target art. With the PC blocked and a familiar providing sight, the target appeared; moving the familiar back behind the wall hid it, and returning restored it. Core reported both owned vision sources and zero controlled tokens throughout the corrected familiar run.
- Retained clearly named QA scene, two QA actors, and `Visioner Issues QA temporary` macro
  for follow-up. Macro loads `tests/manual/issue-visibility-qa.js`; no player scene activation.
- Camera-scope widening can increase computation when the GM pans away from tokens;
  correctness requires processing affected pairs independently of camera position.

## Live acceptance checks

- Extended #302/#303 matrix passed at 15 and 30 ft: closed/open with neither token, only the observer, or only the target in the GM viewport. Recorded the actual viewport token set, bidirectional visibility, and primary mesh rendering for all 12 cases. The first background-tab sample was replaced with foreground sampling after two render frames.
- Extended testing uncovered a second #301 defect: an Observed token could retain `mesh.renderable = false` after a temporary hearing filter cleared. Reproduced live and in a failing integration regression. Track filter-owned mesh suppression and release only its render flag on filter cleanup; leave Core visibility/alpha and unrelated suppression unchanged. Full suite after this follow-up: 504 suites / 4,675 tests; targeted ESLint passed.
- After reloading the follow-up fix, all 12 darkness door checks passed: two rounds of closed/open with ordinary vision plus a 40 ft light, darkvision without light, and ordinary vision without light. Lit/darkvision cases restored art; unlit ordinary vision retained the detection filter. #305 also passed actual movement around the wall endpoint: the hider saw the target as Observed, while the reverse Hide override stayed Hidden with source `hide_action`.
- Extended #306 checks also found synchronous scent suppression surviving a return to Observed when no marker remained to perform cleanup. Track the tokens suppressed by that guard and restore them when the current observer gains sight, including the visibility-write path. Preserve Foundry-hidden tokens and reapply level culling. Added failing-to-passing restoration coverage and checks that unrelated suppression stays untouched.
- Final #306 acceptance after reload passed all five stationary cases: 60 ft scent detects the 30 ft target as Hidden with only a scent marker; a separately prepared 20 ft observer leaves it Undetected with no art/marker; Blocks scent does the same; opening the scent-blocking door restores Observed art; manual Hidden retains the scent marker without art. Repeated light/darkness door tests recorded eight transitions and zero exposed primary-art draws. Earlier range attempts involving movement or editing one observer's senses were discarded because fixture position/cache state was inconsistent.
- Final automated validation: 504 suites / 4,677 tests passed. Changed production files pass ESLint; scoped diff whitespace check passed. Live environment: Foundry V14 Build 367, PF2e, the user's installed module set.
- Final non-GM rerun after both follow-up fixes: all four closed/open/closed/open phases matched Undetected/no art and Observed/normal art, with zero selected tokens in every sample. PF2e version was 8.5.0, with 130 active modules.
- Cleanup completed: logged out the test player and removed the added acceptance scene, two temporary accounts, two PCs, familiar, and player QA macro. Short-range scent clones were deleted after their runs. Returned GM view to Landing; retained the earlier named QA scene/macro for follow-up. Campaign actors and the active scene were not changed.
- Live fixtures use dedicated temporary PCs, a familiar, accounts, scene, and macro from `tests/manual/issue-live-acceptance.js`. Initial familiar attempts were invalidated by automatic selection on unhide and movement collision stopping it at the wall. Corrected run kept the familiar visible, selected nothing, and disabled only physical wall collision while retaining sight/sound blocking.

1. Two differently owned PCs, door between them: repeat closed/open at 15 and 30 ft.
2. Repeat with both tokens offscreen for GM, then with only either token onscreen.
3. Player deselects everything; GM opens door. Verify token appears without a selection twitch.
4. Repeat player test with PC plus familiar; either valid vision source may reveal target.
5. Hide around a corner, return to LOS: hider sees ally while ally retains Hidden override.
6. Repeat door test inside darkness region, with and without darkvision, for #301.
7. For #306 compare manual Hidden override versus AVS-only scent, closed/open wall/door,
   inside/outside scent range; inspect whether silhouette or normal token art is displayed.
