# Live feature coverage audit

## AVS deletion-race fix

Run `14a5ef49-56d4-406a-8512-cc8fb68ca4a5` passed **4/4 live cases**: the original
five-minute soak, deterministic deletion during a persistence wait, two-GM rapid
token deletion, and GM handover. Cleanup completed, startup errors were empty,
and source remained unchanged during execution. All **4,870 unit tests in 519
suites**, 49 harness checks, and targeted lint passed. Catalog now has 270 cases;
the entire catalog has not been rerun.

Tracing showed the secondary GM also processed automatic AVS batches and raced
the active GM's deletions. Automatic processing now follows active-GM authority,
including rechecks after asynchronous work. Persistence filters deleted/pending
deletion targets after waits and between passes; cancelled/rejected deletion
releases tracking. Movement waits stop before reading destroyed PIXI transforms.
The deterministic storage test verifies surviving writes across three cycles;
the two-GM test rapidly creates/deletes 30 tokens with both clients connected.

The final soak completed **216 cycles**, with listeners steady at **801 GM / 377
player**, zero retained DOM-node growth, and median tail heap growth of about
5.8 MiB GM / 5.1 MiB player (within the unchanged 32 MiB budget). The previously
reported listener and AVS-deletion failures are both resolved in this workload.

## Tooltip listener-retention fix

Listener tracing identified redundant Visioner tooltip deactivation as the cause:
`hideAllVisibilityIndicators` and `hideAllCoverIndicators` called Foundry 14's
`TooltipManager.deactivate()` even while hidden. Each call attached a one-shot
`transitionend` listener, but no transition occurred. Token deletion added two
listeners on both clients; local GM movement added two more. Browser probes and
observer selection alone did not reproduce growth. Visioner now deactivates only
an active tooltip and otherwise clears pending activation.

Run `40200b52-275e-44ea-b535-8606b4c1b93a` repeated the original five-minute soak
without instrumentation: 220 cycles; GM listeners 802→801, player listeners
377→377. Heap, DOM and listener-growth assertions passed. Cleanup completed and
source remained unchanged during execution. All 4,862 unit tests in 518 suites
and targeted lint passed, including a regression that failed with 200 redundant
deactivations before the fix.

Run `968cc809-f990-4019-aa42-b92fcc91c7da` also passed the player Hidden/hearing
tooltip and hover-release badge cleanup cases (2/2), with cleanup complete, no
startup errors and unchanged source during execution.

**That earlier overall soak failed** on a separate AVS/token-deletion race: an
in-flight batch attempted to update an embedded token already deleted by the
workload. The same race occurred in the accelerated diagnostic loop. It has since
been fixed and the complete soak passed as documented above.

## Unreleased dungeon performance expansion

Catalog now contains 268 automated scenarios, including 16 performance scenarios.
Run `d707be1c-21e6-4ac5-9b54-2e173d6d9386` passed both AVS-on/off dungeon workloads
on GM and player clients, with cleanup complete, unchanged source during the run,
and no startup errors. Active lights and native region meshes were required;
door occlusion/reveal and final player artwork passed. The first fixture attempt
put the target before the door; it was corrected to place the target beyond the
door for the occlusion assertion. The later retention fix and remaining soak race
are documented above. Full catalog not rerun.

## Unreleased performance lifecycle expansion

Catalog now contains 266 automated scenarios. Added two 100-token/24-wall/25-light
FPS cases (AVS on/off), cache-disabled client startup, and a five-minute retained
memory soak. All 49 harness checks and targeted lint passed.

Run `dfa8f245-3825-4ee9-acbe-53980db86295` passed both 100-token FPS cases. GM
windows ranged 52.7–58.4 FPS and player windows 57.2–58.2 FPS. Worst frame gaps
were 88 ms GM and 51.4 ms player. A startup setup-order error was corrected;
run `a98dd1bf-8094-4122-8617-d13f00ac410f` passed all three cache-disabled loads
per client, with medians 2.26 seconds GM and 2.28 seconds player.

The soak **failed** after 221 cycles over five minutes: post-GC listeners grew
814→1700 on GM and 449→902 on player. Median final-three growth exceeded the
100-listener budget on both clients; heap and DOM-node budgets passed. These are
browser-wide counters; later tracing established the tooltip cause and verified
its fix as documented above. Both runs completed
cleanup with no source changes during execution. Full catalog not rerun.

## Unreleased rendered-FPS expansion

Four additional FPS cases bring the catalog to 262. Performance run
`00284fb6-be27-426d-8c85-ee7da478fe6f` passed **10/10 performance scenarios**,
including all four new cases, with cleanup complete, no startup errors, and
unchanged source. Lint and 47 harness checks passed. This filtered run does not
certify the full catalog. The separate door regression was subsequently fixed and verified below.

At a 60 FPS cap, the four-window averages were approximately 58.3 FPS on both
clients with AVS off. With AVS on, GM averages were 56.8 FPS and player averages
58.3 FPS, with or without seven token lights. The worst GM frame gaps reached
75.5-78 ms with AVS on; lowest per-window 1% lows were 13.8-14.6 FPS. Player worst
gaps were about 25 ms. These short local samples passed coarse budgets but expose
GM-side hitches; they are not a hardware-neutral benchmark or GPU timing.

## Unreleased detection expansion

Fourteen detection scenarios were added after the 244-case release. Run
`d7729cd7-3914-4aaf-bd36-659cf0cfbe3e` verified these additions against Foundry
14.367/PF2e 8.5.0: **13 passed, one failed**, cleanup complete, no startup errors,
and source unchanged during execution. Lint and all 45 harness checks passed.
The entire expanded catalog has not been rerun.

The opening-door regression is fixed: remote clients now recognize Foundry's native
movement animation even without local pending-movement tracking. Core sight can
reveal an ordinary NPC mid-animation while manual unseen overrides and hidden
loot/hazard protections remain enforced. Run `50ffea06-8ff6-4d9c-bfcd-c69a22f789e1`
passed **14/14 detection additions**; all **4,861 unit tests in 518 suites** passed.
After adding an idle fast path, the 134 focused unit tests and both live door cases
passed again in run `23ed4c40-b3e5-4f35-9380-76efe29a12eb`. Both live runs completed
cleanup with no startup errors or source changes during execution. Targeted lint
passed. The full 262-case catalog has not been rerun against this fix.

Passing additions cover five special-sense range boundaries, precise/imprecise
fallback, elevation/landing recovery, overlapping lights and suppression regions,
rapid lighting and player observer changes, and player scene teardown during
animation. These reduce specific gaps without proving every combination.

## Verified release baseline

Version 8.7.1, verified 2026-09-14 against Foundry 14.367 and PF2e 8.5.0 with lib-wrapper and socketlib.

- **244/244 automated live scenarios passed** in run `d0220e83-b8bb-4e34-9a90-051fbbd0738f`.
- Cleanup complete, zero startup errors, source fingerprint unchanged, shipping matrix accepted.
- **4,854 unit tests** across 518 suites, **45 harness checks**, and lint passed separately.
- Local report and screenshots: `artifacts/live/d0220e83-b8bb-4e34-9a90-051fbbd0738f/report.json`. Artifacts are intentionally excluded from Git and release archives.

The suite covers visibility states, precise/imprecise senses, rendered indicators, player privacy, movement, native levels, cover, encounters/actions, rules, regions, managers, settings, and GM/player session behavior. See the [scenario inventory](../tests/live/coverage.md) and [run guide](../tests/live/README.md). `npm run test:live:list` lists every executable case.

Release verification repaired player Seek cone handoff and queued automatic results after disabling AVS. Regression tests cover both, including cancellation of dispatched follow-ups and in-flight calculations. Player-originated actions, player template placement/cancellation, and six performance cases passed. Scene-preparation restoration runs three cycles per hazard/loot case. Canonical profile persistence runs five cycles after AVS becomes idle. The UI runner handles transient row replacement and submits each manual roll resolver once while still rejecting disabled or obstructed buttons.

## Remaining coverage limits

Passing the catalog is not exhaustive feature, branch, platform, or third-party compatibility coverage. Known areas for further scenarios include:

- Chained Sneak, speed/distance rejection, remaining Seek geometry branches, and live natural 1/20 adjustments.
- Mixed-sense/multiple-observer races, first-LOS animation boundaries, and scene teardown during movement.
- Competing circumstance modifiers, roll cancellation, and cover geometry boundaries.
- Settings dependency controls and reset flows, complete keyboard navigation, UI sizes, manager bulk/filter modes, and remaining HUD/context/keybinding entry points.
- Additional source-stacking/consumption modes, feat damage outcomes, and region shapes, elevations, directions, and overlaps.
- Unauthorized/duplicate/out-of-order RPCs, no-GM behavior, linked-token defeat/deletion, and forced-process-death recovery.
- Third-party integrations such as PF2e HUD. Baseline PF2e success does not certify other systems or module combinations.
- Overnight memory leaks, server cold startup, scenes beyond the 100-token synthetic workload, GPU memory, and hardware-neutral comparisons. Client startup and a five-minute soak have automated cases; both listener retention and the observed two-GM AVS/deletion race are fixed. See the [performance guide](../tests/live/performance.md).

Migrations, Foundry 13, and legacy Levels/Wall Height tests are excluded by project scope. No whole-module coverage percentage is claimed. New source or test changes require fresh fingerprint-matching evidence; failed, blocked, filtered, or interrupted runs do not certify the entire catalog.
