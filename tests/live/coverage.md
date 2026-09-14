# Automated live coverage inventory

**226 automated scenarios; zero guided scenarios.** The former 24 manual reviews
became 42 separate automated workflows. Counts describe executable definitions,
not successful live verification or exhaustive line/branch coverage.

Three `action-gap-degrees-*` workflows exercise Hide, Sneak and Seek at DC offsets
-11, -10, -9, -1, 0, +9 and +10. Native PF2e DCs supply fixture thresholds;
independent expected degrees and states check rendered labels, Apply, Undo and
player rendering. Hide's standard-cover bonus is accounted for explicitly.
Natural 1/20 adjustments remain outside this fixed-total boundary batch.
Failures are retained while later boundaries still execute.

Three `action-gap-range-*` scenarios exercise Seek range limits in combat and
exploration: inside, exactly at and outside a 30-foot limit, disabling/re-enabling
the active limit while the other context remains limited, and encounter start/end
switching between separate distances. Each verifies target inclusion, applied
visibility, undo and player rendering; settings are journaled and restored.

Four additional `action-gap-position-*` cases apply and undo Sneak results after
invalidating/restoring start or end qualification, and check Legendary Sneak and
Very, Very Sneaky with no end cover before installation, after installation and
after removal. These assert actual stored visibility and player rendering.

Ten `action-gap-*` scenarios exercise native Sneaky feat deferral, individual/bulk
undefer, movement followed by encounter turn-end validation with and without cover,
and native Seek chat-card templates: circle/cone placement, configuration/placement
cancellation, placement-distance clamping, consumption and explicit removal.
Seek cases check abandoned creation hooks and reset the isolated GM client after
each case so an unsuccessful cancellation cannot contaminate later scenarios.

The 23 `gap-*` cases add four native locale switches with rendered-label and
keyboard-focus checks, four colorblind modes with computed UI colors and restoration,
four Strike cover grades, four area-save cover grades, actual shipped macro execution
and player rejection, Token Manager Apply Both/reset, Quick Panel target direction,
and scent/lifesense/thoughtsense marker pixels, keyboard targeting, range recovery
and reload. Roll assertions require a new evaluated native chat document; a previous
matching roll cannot pass the test. Strike and save cases are independent so a
failure in one does not prevent testing the other. Failed contracts remain failures,
not skips. See the feature audit for current live outcomes and remaining gaps.

The 47 audit additions cover timers, queued override decisions, AVS gates,
native condition conversion, corner/door peeking and approval cancellation,
shared-vision modes, Encounter Master, blinded terrain costs, creature-cover
exclusions, Wall Manager, scene preparation, party restoration, perception-profile
API writes, connected-wall Seek/Search, combat-start cover, native area Reflex
saves, Sense the Unseen, simultaneous observers and GM keyboard gestures.
Three scent-isolation cases select and deselect the same player-owned character
on the GM client, checking actual brown marker pixels on both clients across
three cycles, range exit/return, GM Observer View and PF2e GM Vision.
Remaining branches are recorded in [the feature audit](../../docs/live-feature-audit.md).

| Area | Automated contracts |
| --- | --- |
| Visibility / AVS | Public API states and rejection, manual states, override reset, manager direction, Apply/Revert, player rendering |
| Senses / lighting | Blindness/deafness, sight and special senses, acuity/range changes, target eligibility, dim/dark/magical lighting, cones |
| Movement / levels | Held drag cancellation and commit, animation timing, doors, native two-level pillar, floor/opening/same-level transitions |
| Cover | API grades, wall/tile configuration and persistence, regions, creature blockers, Take Cover movement/attack/removal and turn persistence |
| Privacy | Real player versus GM, hover badges/tooltips, targeting/nameplates, hidden hazards and loot |
| Actions / encounters | Native Hide/Sneak/Seek, fixed success/failure previews, individual/bulk Apply/Revert, Strike consequences, Diversion, Point Out, Stealth initiative, Search |
| Regions | Entry/exit, activation/deactivation, turn boundaries, source removal and stacking; visibility, concealment, cover and sense suppression |
| Rule elements | Embedded item create/edit/delete, priority, predicates, direction, distance, lighting/senses, aura/shared vision, roll-only visibility, cover consumption, off-guard suppression and Blur qualification |
| Feats | Native compendium Blind Fight, Sneak speed, Ceaseless Shadows, terrain/size/anomaly/level contexts, Sniping Duo cover and shared-link removal |
| Interfaces / configuration | Token manager, hazard/loot manager, settings cancel, Quick Panel, selected-token purge isolation, guarded settings persistence |
| Lifecycle | Real separate accounts, observer switching, reload, player offline updates, two-GM authority transfer, cleanup/recovery |
| Compatibility | Foundry 14 with PF2e and native levels; Foundry 13 and legacy Levels/Wall Height excluded |
| Migrations | Excluded by user request |

Use `npm run test:live:list` for exact names; requirements are in
`requirements.mjs`. Missing, failed, blocked and unrun results remain explicit.
All workflow sub-assertions are retained in reports. No prompt can mark a case
passed. Lack of a native feature, required setting, installation or second GM is
a prerequisite failure, not a successful test.

Native actions, DOM workflows, rule integration probes and pixel assertions test
different boundaries. Feat consumer checks do not prove every Strike/dialog
combination. A finite inventory cannot prove all combinations of maps, actors,
feats and third-party modules. New reported bugs still need exact regressions.

## Adding a case

1. Define initial state, concrete action, expected outcome, negative control and
   recovery/removal transition. Use public interfaces and independent expected
   values. Never derive the expected result from the calculator under test.
2. Add declarative steps to the catalog or a registered workflow with assertions.
   Manual review steps and unknown workflows are rejected.
3. Keep mutations inside UUID-owned fixtures. New persistent document types need
   journal/cleanup support before live use. World-setting changes require the
   disposable-world guard and recorded restoration.
4. Check real player/GM outcomes when permissions differ. Visual checks must have
   an unobstructed sample area and save evidence; boolean visibility alone does
   not prove rendered art.
5. Run locally. Diagnose failed setup, module assertions and third-party errors
   separately. Keep failure status until corrected and rerun.

Tests and evidence stay outside workflows and production release archives.
