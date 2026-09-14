# Performance follow-up — 2026-09-14

## Verified outcome

The final source passed 30 targeted live scenarios and three additional
fresh-browser heavy-scene repeats. All runs had complete cleanup, no startup
errors, and no source changes during execution. This is targeted verification,
not a new claim that the entire live catalog or memory soak was rerun.

- Foundry 14.367, PF2e 8.5.0; module manifest 8.7.2 with unreleased changes.
- QA world: `visioner-qa`; separate GM/player sessions.
- Maximum Core quality, actual PIXI ticker limit zero, 1600×1000 viewport.
- Heavy fixture: 100 tokens, 24 walls, 25 token lights.
- Commander remained enabled with its separate banner-eligibility optimization.
- Source fingerprint: `90adee30cf8158453b274725ecf0c7dc4ad206d40ad05d8025290601ebe09824`.

## Final cold repeats

Each run launched a fresh browser and ran only `fps-100-lights-avs-on`.
No profiling, preceding movement scenario, discarded first movement, or relaxed
threshold was used. All GM/player idle and movement windows passed.

| Run | GM movement FPS | GM movement p95 | Worst GM movement gap | Player movement FPS |
| --- | --- | --- | --- | --- |
| `969deeb4-bb9b-4051-b064-254b4b317187` | 93.2–103.1 | 15.4–19.2 ms | 80.2 ms | 127.4–130.1 |
| `28e6356c-c98b-4331-a055-791cf30e6146` | 108.4–120.8 | 13.3–14.9 ms | 79.7 ms | 133.5–136.8 |
| `a994eed0-cd99-45fb-a2e2-9dd8009eac31` | 101.2–116.0 | 13.2–16.1 ms | 84.3 ms | 120.9–133.5 |

GM idle measured 162.9–163.6 FPS. Player movement p95 was 8.9–12.2 ms.
The unchanged budgets are average ≥30 FPS, p95 ≤50 ms, worst gap ≤250 ms.
Individual ~80 ms first-movement gaps remain; a passing budget does not mean
every frame is smooth. Results are specific to this machine and fixture.

## Functional and throughput verification

Run `cfe98b42-d4c6-4ede-bed9-cec1eebbd548`: **30/30 passed** on the same fingerprint.

- All six GM/player FPS scenarios: 30 tokens with/without lights and AVS;
  100 lit tokens with AVS off/on.
- Linked-target and linked-observer effects: no native Item writes when final
  rules are unchanged; real Hidden/Observed transitions still update effects.
- Token deletion during persistence waits and two-GM batch deletion.
- Rapid lighting and observer changes, scene switches during animation, door
  reveal/hide during animation, corner/door Peek, darkness and magical lighting.
- Observer-switch latency and full 12/30-token recalculation budgets.
- Scent range recovery, background-tile preservation, and GM selection with
  normal vision, GM Vision, and GM Observer View.
- Hide apply/revert, Hide in an encounter, off-guard suppression, and GM handover.

Within this broader run, heavy-scene AVS-on GM movement measured 82.8–104.7 FPS,
p95 15.4–20.6 ms, worst gap 31.2 ms. The standalone cold repeats above remain
separate evidence rather than being replaced by this later-in-suite result.

Automated verification: **4,896 tests / 519 suites**, **50 live-harness checks**,
and targeted Visioner lint passed. The separate Commander change passed its
**161 tests** and full lint.

## Visioner changes and why

1. AVS now combines ordered effect updates across observers by receiving actor.
   Previously, linked tokens repeatedly removed/recreated the same aggregate,
   triggering native actor/token rebuilds. A capped diagnostic captured at least
   100 Item writes during an apparent idle window; after batching, the equivalent
   diagnostic recorded zero. Distinct synthetic actors retain separate plans.
2. Aggregate rules identical to their final stored value no longer trigger an
   Item update. Real rule-content changes and duplicate cleanup remain intact.
3. Foreground AVS calculations use ordinary timer tasks between short chunks.
   A Chromium trace showed 22 prioritized `scheduler.yield()` continuations
   between GM ticker callbacks roughly 107 ms apart. Smaller chunks alone did
   not solve that starvation. Hidden documents retain scheduler yielding when
   available, avoiding reliance on background-throttled timers.
4. The scent render guard checks sense presence directly, without copying full
   sense data or retaining cached sense state. Earlier setting/map/geometry
   reductions are retained.

The Commander banner optimization belongs exclusively to `pf2e-commanderer`:
its implementation, regression test and changelog entry are in that module's
repository. It is mentioned here only to identify the benchmark environment;
it is not part of Visioner's code or release changes.

Earlier failures and intermediate measurements remain documented in
`tests/live/performance.md`; they were not dropped from the audit. Raw reports,
screenshots, CPU profiles and the diagnostic timeline remain under the ignored
local `artifacts/live/<run-id>/` directories. Temporary tracing and mutation
probes were removed from the source.

## Cleanup and scope

All final runs removed their owned test fixtures and restored original scene,
user/settings and client quality/FPS state through the suite's cleanup. Kingmaker was restored
after testing. No release, version bump or commit was performed in this follow-up.
Runtime compendium database churn was left unstaged.
