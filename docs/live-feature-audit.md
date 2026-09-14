# Live feature coverage audit

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
- Long-run memory leaks, cold startup, huge scenes, and hardware-neutral performance comparisons. The six local workloads use coarse fixed budgets; see the [performance guide](../tests/live/performance.md).

Migrations, Foundry 13, and legacy Levels/Wall Height tests are excluded by project scope. No whole-module coverage percentage is claimed. New source or test changes require fresh fingerprint-matching evidence; failed, blocked, filtered, or interrupted runs do not certify the entire catalog.
