# Automated live coverage inventory

**301 automated scenarios; zero guided scenarios.** The former 24 manual reviews
became 42 separate automated workflows. Counts describe executable definitions,
not successful live verification or exhaustive line/branch coverage.

## Current rule and region verification

On 2026-09-26, `--rules-regions` passed **53/53 scenarios and 744 assertions**
on Foundry 14.368 / PF2e 8.5.1, using the current 8.10.3 checkout with pending fixes.
Run: `0fb2eada-c4a4-427a-aafd-98456dd1e4aa`; report:
`artifacts/live/0fb2eada-c4a4-427a-aafd-98456dd1e4aa/report.json`.
Cleanup complete; no startup errors; source unchanged during execution.

Coverage includes all 14 rule operation families, native item creation/edit/removal,
predicate/direction/source stacking, conditional visibility, roll context and native
Strike consumption/off-guard integration. All four Visioner region types have
configuration and native multilevel scenarios; cover grades/modes and rendered
scent/lifesense/thoughtsense suppression above floors are included.

Verification exposed and fixed region event races across Core behavior snapshots,
missing persistent overrides when computed visibility already matched, and stale
hearing metadata removing presence markers for Deafened observers. The visual
harness camera also avoids an unrelated Combater toolbar obstruction.

The complete unit/integration suite passed 533 suites / 5,084 tests, and the live
harness passed 54 checks. This run does not certify every configuration combination,
all region event masks, every third-party module, or the full 301-scenario catalog.
Earlier runs and their boundaries below remain historical evidence.

Four `region-multilevel-*` workflows passed 86 assertions on Foundry 14.367 /
PF2e 8.5.0, cleanup complete (run `f7f35817-8d9a-433d-a1a9-84ac2b779ba9`).
Real native ground/upper levels share the same map footprint. Each behavior checks
two target up/down cycles, both tokens upstairs, observer downstairs, behavior
disable/re-enable and removal. Suppression additionally tests observer-only flags
at identical coordinates on different floors. Visibility includes back-to-back
floor changes that rebuild the selected observer's canvas while a region event
is pending. Player snapshots and screenshots are recorded at each state check.
These cases have open vertical sight lines; the separate native floor-occlusion
and three upper-level border regressions cover blocking surfaces. They do not
certify every combination of cover mode, sense, floor geometry and region behavior.

Four `region-audit-*` workflows passed 191 assertions on Foundry 14.367 / PF2e
8.5.0 with cleanup complete (run `cb455feb-13da-4f01-a98d-94ff108b05dd`). They cover:

- Native checkbox saves, both values: behavior disabled, enabled where offered,
  suppression observer/target flags, visibility inside-token and two-way flags.
- Concealment enabled/disabled combinations and overlapping-region removal.
- All three cover modes and grades, enabled/disabled combinations, directional
  rays, crossing rays, strongest overlapping cover and removal fallback.
- Concealment/cover elevation slabs, inclusive/exclusive upper bounds, holes,
  concave polygons, rotation, separated shapes and ellipses using native geometry.
- Suppression's 16 enabled/disabled/observer/target combinations, all 20 sense
  selections individually, empty selection, outside and below-region controls.
- Visibility's five states across both inside-token and two-way values, reverse
  pairs, a second observer inside, and disabled behavior cleanup.

Suppression selection and geometric checks call production calculators against
real persisted Region documents; they do not certify rendered detection for every
sense. Separate upper-level scent/lifesense/thoughtsense cases assert player border
pixels through GM selection changes. This batch does not exhaust every visibility
event-mask combination, combat timing, mixed-behavior overlap or third-party module.

Two deletion regressions cover deleting a real token while flag persistence waits
(with surviving writes verified) and rapid native token creation/deletion with two
GMs connected. Automatic AVS authority must belong only to the active GM. These
and the original five-minute soak now pass; see the feature audit for evidence.

Two dungeon performance cases add connected rooms/corridor, 55 blocking wall
segments, pillars, 12 animated ambient lights, seven token lights and three native
darkness regions. Both GM/player clients measure idle, moving observer/target,
door changes and region changes with AVS on/off. Door occlusion is independently
checked before timing, and active light sources/region meshes are required.

Four further performance cases cover 100-token FPS with AVS on/off, cache-disabled
GM/player client startup, and a configurable five-minute-to-two-hour retained-memory
soak. Repeated inactive tooltip deactivation caused listener growth; competing GM
automatic batches and stale write targets caused the deletion race. Both fixes
are verified by the complete original soak. See the feature audit for evidence.

Four `fps-30*` cases measure actual top-level PIXI screen renders on GM/player
clients with AVS on/off and token lights on/off. Each measures idle and three
movement windows with FPS, slow-frame distributions, state/art checks and listener
cleanup. See [performance tests](performance.md) for exact boundaries and budgets.

Fifteen `detection-*` scenarios add special-sense range checks at 25/30/35 feet,
with return transitions, for scent, tremorsense, lifesense, thoughtsense and
echolocation. Additional cases exercise precise echolocation falling back to
imprecise tremorsense under deafness, elevation/landing recovery, overlapping
bright/dim lights, removal of one of two suppression regions, rapid lighting
changes, rapid player observer selection, player scene teardown during animation,
and independent opening/closing door detection updates before native animation ends.
The opening-door case exposed a delayed player reveal, now fixed and verified with
all 15 additions passing. The movement soundwave handoff regression adds
repeated hearing wall and range crossings, post-paint Hidden/Undetected render
assertions, and a 30-token workload under the standard 100 ms p95 and 750 ms
maximum frame-gap budgets. These are bounded
regressions, not an exhaustive combination matrix or third-party certification.

Five `performance-*` workloads augment the existing small animation benchmark.
See [performance tests](performance.md) for workload sizes, measurement boundaries,
fixed budgets, and hardware limitations. Performance-only runs do not certify
the full catalog and remain excluded from CI and release ZIPs.

Four `player-seek-template-*` cases exercise a player character's circle/cone
placement, configuration cancellation, and placement cancellation. Placement
checks pending-message ownership/shape, GM Open Results and Apply/Undo, both
clients' state, revealed player artwork, and the player's Remove Template control
clearing template documents and pending message data on both clients.
Cancellation checks unchanged visibility, no GM results, no template documents,
and released native creation hooks. Player reload clears transient placement
listeners even on failure; persistent fixtures remain covered by recovery.

Nine player-originated scenarios cover Hide, Sneak, Seek and Create a Diversion
with both player-owned NPCs and characters, plus an NPC Strike. Native rolls run
on the non-GM client, enter a natural 20 through Foundry's manual-dice dialog,
and verify player message authorship. Sneak uses the player's Start Sneak button
and token movement. GM chat controls apply and undo actual roll results; both
clients must receive the expected visibility state. Seek also checks revealed
token pixels. Players must not receive GM Apply controls. Secret actions select
public mode in the native roll dialog because PF2e disallows manual blind rolls.
This does not cover secret-roll privacy, natural 1 adjustments, player character
weapon Strikes, Point Out, Take Cover or every action variant.

The `stealth-initiative-eligibility` workflow uses a native encounter and native
Stealth initiative roll, then fixes combatant totals around the observer's live
Perception DC. It verifies that a successful roll in plain sight remains Observed,
standard cover and concealment permit encounter stealth, an initiative-winning
observer does not prevent Unnoticed, exactly DC-10 is Observed, and Legendary Sneak
permits plain-sight stealth. The `stealth-initiative-manual-states` workflow uses
an NPC with native Stealth initiative and verifies manually stored Concealed,
standard cover, and greater cover, plus GM-selected standard and greater cover
in the initiative bonus dialog, before combat. It checks Unnoticed after a successful roll
and release to AVS after combat while retaining manually set cover. Every branch removes the
encounter and confirms cleanup.

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
| Movement / levels | Held drag cancellation and commit, animation timing, hearing wall/range transitions, doors, native two-level pillar, floor/opening/same-level transitions |
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
