# Local performance tests

Run `npm run test:live:performance` with the QA world running. The same GM/player
credential prompts, world guard, recovery journal, and cleanup apply. Tests also
run within `npm run test:live:full`. A performance-only run cannot satisfy
`--release` or the full shipping matrix.

`detection-movement-soundwave-handoff` adds a 30-token darkness workload. It
moves the controlled observer repeatedly across a sound-blocking wall and the
hearing range boundary, then checks post-paint Hidden/Undetected render surfaces.
It rejects full-art and soundwave leaks. Every movement must keep frame gaps at
or below 100 ms p95 and 750 ms maximum.

Fresh run `b501b16b-b62f-4e27-ab65-7af693c65977` passed all six transitions:
p95 frame gaps were 6.2 ms, the worst gap was 18.2 ms, and no Undetected frame
painted full artwork or soundwaves. Source stayed unchanged and cleanup completed.

## Rendered canvas FPS

### Dungeon scene workload

`performance-dungeon-avs-off` and `performance-dungeon-avs-on` create an isolated
30-token dungeon scene with connected rooms and corridor, 55 wall segments, eight
pillars, a door crossing the movement route, 12 animated wall-constrained ambient
lights, seven token lights and three overlapping native `adjustDarknessLevel`
regions. Both client canvases must have active ambient-light sources and region
meshes. A closed/open door check proves actual sight obstruction before timing.

Each GM/player client measures four-second idle, observer-and-target movement,
door-toggle/movement and region-darkness-update/movement windows. These reuse the
same screen-render sampler and FPS limits below, and verify final target artwork.
Reports include the actual document counts, not just requested workload sizes.
The synthetic scene models active map geometry; it does not claim to benchmark
a particular campaign scene, map texture size, or third-party lighting module.
All documents live inside the journal-owned scene and follow standard cleanup.

Two `fps-100-lights-avs-*` cases extend the same protocol and fixed budgets to
100 tokens, 24 walls, and 25 token lights, with AVS on/off. These are bounded
synthetic scenes, not certification of arbitrarily large campaign maps.

Four `fps-30*` cases compare AVS on/off with the same 30-token, 24-wall scene,
with and without seven token lights. Each case measures the GM and player
separately, bringing the measured client to the foreground. After one second of
warm-up, each client gets a four-second idle window and three four-second movement
windows. Movement windows contain four native 800-ms token animations; sampled
token positions must prove movement occurred. Final artwork and state are checked.

Frames are counted from PIXI's top-level screen `postrender` events. Nested and
off-screen render-to-texture passes are excluded. This measures completed CPU-side
canvas render submissions, not `requestAnimationFrame` callback frequency, GPU
execution time, or physical display presentation. No render method is replaced.

Reports retain average rendered FPS, 1% low FPS (inverse mean of the slowest 1%
of inter-frame gaps), p95/p99 frame time, worst gap, stalls over 50 ms, frame count,
distinct token positions, configured FPS cap, renderer resolution, viewport and
hardware/browser metadata. Samples fail if the tab becomes hidden, render events
are unbalanced, movement is absent, or listeners are not restored. A sampler
self-stops after four seconds and explicit cleanup runs on success or failure.

The configured FPS cap stays unchanged. Fixed gates require average FPS at least
`min(30, 0.75 × cap)`, p95 frame time at most `max(50 ms, 2000 / cap)`, and no gap
over 250 ms. The cap follows Foundry's maximum of 60. These intentionally detect
large regressions; the full distributions expose smaller changes. No pass/fail
claim is based on AVS beating its baseline. Module-disabled comparisons, GPU
timing and background-tab performance are not covered.

## Existing timing workloads

| Workload | Measurement | Fixed budget |
| --- | --- | --- |
| 30 tokens, 24 walls | Four 1-second native movement animations after warm-up | Browser frame-gap p95 ≤100 ms, maximum ≤750 ms |
| Same, seven token lights | Same movement samples with native lighting active | Same limits |
| 24 tokens, 24 walls | 12 player observer switches, two consecutive frames in expected render state | p95 ≤1,500 ms, maximum ≤3,000 ms |
| 12 tokens, 24 walls | Six full AVS recalculations after warm-up | p95 ≤2,000 ms, maximum ≤4,000 ms |
| 30 tokens, 24 walls | Same recalculation workload at larger pair count | Same limits |

The command also includes the existing `movement-animation-performance` case.
Animation checks require intermediate native token positions, final position,
and rendered target artwork. Recalculation measurements finish only on the
orchestrator's completed token set, not the earlier queue-submission hook.
Observer switching alternates Hidden and Observed targets; a missing transition
times out and fails. The test does not substitute visibility or rendering methods.

Reports under `artifacts/live/<run UUID>/report.json` retain workload counts,
browser viewport/device scale and hardware-concurrency metadata, frame-gap
summaries, individual latency samples, thresholds, and pass/fail evidence. All
fixture tokens, walls, lights, overrides, and settings follow normal cleanup;
samplers and completion hooks are released on success or failure.

These are coarse regression budgets, not a promise of 60 FPS or a hardware-neutral
performance score. Browser animation-frame gaps measure scheduling stalls, not
GPU render duration. Run on the same machine with similar foreground load for
comparisons. No automatic baseline update or threshold widening occurs. Long-run
memory growth and client startup have separate workloads below; third-party
combinations, server startup, GPU memory and overnight stability remain uncovered.

## Cache-disabled client startup

`performance-cold-client-startup` reloads each GM/player client three times with
Chromium's HTTP cache disabled. Each sample includes application initialization,
opening the owned 30-token QA scene, observer selection, and two rendering frames.
Each load separately verifies state and target artwork. Median must be at most
15 seconds, maximum 30 seconds. Cache override and CDP session are released in
`finally`, including failures. This is client startup against a running server;
OS disk cache and Foundry server startup are not measured.

## Maximum-quality FPS comparison

Set `VISIONER_FPS_MAXIMUM=1` when running FPS cases to use Core Maximum quality and the 60 FPS setting on both QA clients. Foundry 14 translates that combination to an uncapped PIXI ticker (`maxFPS=0`); browser/display refresh can still limit actual FPS. The runner journals and restores both Core client settings. Reports use the actual ticker cap, including zero, instead of assuming a 60 FPS ceiling.

```powershell
$env:VISIONER_FPS_MAXIMUM = '1'
$env:VISIONER_LIVE_CASE = 'fps-30-avs-off,fps-30-avs-on,fps-30-lights-avs-off,fps-30-lights-avs-on,fps-100-lights-avs-off,fps-100-lights-avs-on'
npm run test:live:full
Remove-Item Env:VISIONER_FPS_MAXIMUM
Remove-Item Env:VISIONER_LIVE_CASE
```

2026-09-14, Visioner 8.7.2 / Foundry 14.367 / PF2e 8.5.0, 1600×1000: all samples confirmed Maximum mode and ticker cap zero. Actual movement FPS ranges across three four-second samples:

| Tokens / lights | AVS | GM FPS | Player FPS | Worst GM frame gap |
| --- | --- | ---: | ---: | ---: |
| 30 / off | off | 145–165 | 135–164 | 32 ms |
| 30 / off | on | 154–157 | 164–165 | 83 ms |
| 30 / 7 | off | 164–165 | 164–165 | 16 ms |
| 30 / 7 | on | 156–159 | 164–165 | 75 ms |
| 100 / 25 | off | 73–84 | 84–88 | 78 ms |
| 100 / 25 | on | 34–38 | 105–107 | **915 ms** |

Five of six cases passed. The 100-token AVS-on GM movement samples failed the unchanged 250 ms maximum-gap budget. Player measurements are separate focused windows, not simultaneous GM/player FPS. These runs expose a heavy-scene GM stall; they do not identify its cause or establish universal hardware performance. No failing thresholds were loosened.

Evidence: `artifacts/live/241dfdb7-8c4f-4a12-a53b-2b1481648f2f/report.json`. Source unchanged, zero startup errors, cleanup complete. Core settings were restored; test code changes add opt-in Maximum-quality runs and correct cap metadata, not production rendering changes.

Set `VISIONER_FPS_PROFILE=1` to save a Chrome CPU profile for the GM's first movement window under the run's artifact directory. Set `VISIONER_FPS_PROFILE_PHASE` to `idle`, `movement-2`, or `movement-3` to profile a different GM window; those filenames include the phase. Profiling adds overhead: disable it for final FPS comparisons. The debugging session detaches even if sampling fails.

After the AVS performance repair, the same 100-token/25-light case passed: GM movement 77–93 FPS, p95 frame times 14–28 ms, worst movement gap 135 ms; player movement 133–141 FPS. Evidence: `artifacts/live/d8b27ff6-7fea-40bf-8b4c-be85d23f7b0a/report.json`. Same Maximum-quality settings and unchanged budgets; cleanup complete. These are local measurements, not a hardware-independent guarantee.

The final repeat (`8b575469-6b01-4d43-9513-33ed0625bfce`) passed all six FPS cases plus eight live movement/lifecycle regressions, with no source changes during the run and complete cleanup. Heavy-scene AVS-on GM movement measured 85–88 FPS, p95 19–28 ms, worst gap 116 ms; player movement measured 143–147 FPS. In that same run, the AVS-off GM baseline measured 125–135 FPS, so large-scene AVS still has measurable overhead. The 30-token AVS-on cases measured 161–163 GM FPS with worst movement gaps below 38 ms. No thresholds were relaxed.

## Further optimization measurements (2026-09-14)

The follow-up removes unchanged detection-map copies, clips spatial queries to
occupied cells, reuses native points within a single LOS calculation, and sends
Foundry 14 one dense zero-tolerance point test. Regression tests demonstrate
less work without retaining geometry across movement updates. They do not prove
a corresponding FPS improvement.

A matched standalone 100-token/25-light comparison temporarily disabled Commander
in QA for both runs. The baseline retained the earlier performance repair:

| Code | GM movement FPS (three windows) | First-window p95 | Worst movement gap |
| --- | --- | --- | --- |
| Before this follow-up | 64.5 / 79.4 / 79.0 | 107.3 ms | 118.5 ms |
| With this follow-up | 68.8 / 77.5 / 79.8 | 71.3 ms | 116.9 ms |

Both standalone runs failed the unchanged 50 ms p95 budget in their first
movement window. Warmed performance was essentially unchanged; the first-window
difference is insufficient evidence of a reliable FPS gain. Evidence:
`artifacts/live/d86a2772-efb2-44ff-b197-706611c93824/report.json` and
`artifacts/live/566f4ab2-5f9c-4f98-bfee-3d18a9da14d0/report.json`.

After restoring Commander, the final ordered run passed all six FPS cases plus
five lighting/observer/scene/door regressions. Heavy-scene AVS-on GM movement was
63.8 / 68.0 / 67.7 FPS, p95 47.8 / 35.4 / 33.5 ms, worst gap 125.8 ms;
AVS-off movement was 106.4–108.3 FPS. Evidence:
`artifacts/live/cbb828ba-0770-4543-8955-d1982265e112/report.json`.
Four additional corner/door-peeking and darkness/cone cases passed in
`artifacts/live/739aad45-2ced-4b0f-a3b7-d7dc4ba6f745/report.json`.
Both runs had zero startup errors, unchanged source, and complete cleanup.
All 4,880 automated tests passed, as did targeted lint.

The passing ordered run does not supersede the standalone failures or establish
release readiness for every workload. Previous 85–88 FPS results are historical
samples, not a reliably reproduced minimum. No warm-up windows were discarded
and no budgets were relaxed. The profile also identified Commander checking
token visibility before banner eligibility; no Commander source was changed.
Its original QA configuration was restored before final validation.

## Cold first-movement follow-up (2026-09-14)

The retained 100-token fixture has 98 tokens linked to one actor. Native effect
writes can therefore rebuild many dependent tokens at once. This stress fixture
was not changed or replaced to obtain a pass.

An instrumented failing first window found eight aggregate-effect updates, two
with identical final rules (`95088f0a-5782-4b50-90d2-711546429223/fps-effects.json`).
Linked-token updates can remove and re-add a signature inside one batch; the
index previously marked that as changed even when the final rules matched.
Visioner now compares final rules before writing. Actual rule changes and
duplicate-effect deletion remain covered. A follow-up profile recorded zero
identical writes (`d422f4cf-7c58-4a59-aa53-c0d2649c0d0e/fps-effects.json`), but an
unprofiled repeat still failed at 107.2 ms first-window p95. This was a real
source of unnecessary work, not the sole cause of the slow window.

The profile also attributed about 408 ms to Commander's banner renderer,
including visibility checks for tokens with no banner aura. A separate change
in `pf2e-commanderer/scripts/canvas/banner-overlay.js` filters by banner eligibility
before calling native `isVisible`. Commander stayed enabled for these runs;
its ordinary-token checks were removed, not its visibility rules for banners.

With both changes, three consecutive fresh-browser standalone runs passed all
GM/player windows at Maximum quality, ticker cap zero, with the same budgets:

| Run | GM first movement FPS | First-window p95 | Worst movement gap, all three windows |
| --- | --- | --- | --- |
| `a25d4670-a35e-4592-9543-b507316d49a1` | 66.6 | 37.5 ms | 131.5 ms |
| `a736ca5c-1407-4a6b-a60f-8b2bb8003c6a` | 71.9 | 36.5 ms | 126.3 ms |
| `e0d7a422-35e7-4415-bc92-8e49a5d70d3e` | 70.2 | 36.2 ms | 125.7 ms |

Reports are under `artifacts/live/<run>/report.json`. All had complete cleanup
and unchanged source during their run. No profiling, preceding FPS cases, or
discarded first-movement samples were used. GM movement across these runs was
66.6–84.3 FPS. Individual 121–132 ms gaps still exist; passing the 50 ms p95 and
250 ms worst-gap budgets does not mean every frame is smooth. Results apply to
this local fixture and both patched modules, not to Visioner alone or all worlds.

`performance-linked-effect-noop` is the permanent native regression. It creates
an owned linked-token fixture, asserts zero Item updates for identical final
rules, then verifies genuine Observed/Hidden transitions remove/create effects.
The fixture, hooks, settings and sessions use the suite's normal cleanup.
Temporary effect profiling was removed after diagnosis; the captured counters
remain in ignored local artifacts. All 4,884 Visioner automated tests, 50 live
harness checks, and 161 Commander tests passed, along with targeted Visioner
lint and Commander's full lint.

### Actor-level effect batching

The next 22-case run (`ae98856f-cb11-4a0a-8389-8669fd8af15a`) passed all movement
windows and 16 functional cases, but failed heavy-scene idle p95 at 50.3 ms.
Further idle profiling revealed document-update traffic with AVS both on and off.
The capped probe captured at least 100 Item writes during an AVS-off idle window
(`0c2499a9-a14a-4208-8310-0f815f0234ee/fps-off-documents.json`), originating from
the orchestrator's effect-sync stage. Separate per-observer effect plans repeatedly
changed the same linked actor, carrying expensive work into later measurement
windows. These earlier measurements were not consistently measuring an idle canvas.

AVS now combines the ordered observer updates by receiving actor before applying
an aggregate mutation plan. It preserves the final rule order, independent
signatures, suppression metadata and duplicate cleanup. Linked actors share
one plan; synthetic token actors with different UUIDs remain separate. Preparation
yields to the browser between expensive chunks. Manual single-observer calls
continue through the same implementation.

The instrumented comparison `c6849f52-1431-44ed-997b-499b61188fcf` recorded **zero
Item writes** in both idle windows. GM idle measured 164.9–165.2 FPS, p95 6.7–6.8 ms.
All AVS-off/on windows passed; AVS-on movement measured 71.5–84.8 FPS with p95
19.5–38.3 ms and a worst gap of 132.4 ms. This is diagnostic evidence with idle
profiling enabled; final acceptance also requires fresh unprofiled runs.

The permanent `performance-linked-effect-noop` case now verifies both linked
targets and linked observers: no intermediate Item creation/update/deletion when
the final aggregate is unchanged. It also verifies real effect transitions.
All 4,887 automated tests pass, including receiver grouping, independent synthetic
actors, distinct observer signatures and cooperative preparation. Temporary
document-write probes were removed; captured traces remain in ignored artifacts.

### Foreground continuation starvation

Effect batching fixed idle churn, but cold movement remained inconsistent.
Three-run groups using 8 ms chunks, finer directional yielding, then 4 ms chunks
still had two failures each. For example, `61152c4c-c836-49e4-ac20-32863c9b16da`
had later-window p95 of 104.4 and 110.6 ms. A direct scent-presence lookup removed
unnecessary full sense-context construction during rendering, but did not solve
those stalls: `caa7abf5-b1ee-46f9-a0d7-ef40bc37f759` still failed at 102.1/105.2 ms.

The timeline from `95d515c0-b8c2-4e44-8b7f-ee9af75c1ade` explains the remaining
mechanism: between two GM ticker callbacks roughly 107 ms apart, Chromium ran
22 `RunYieldContinuation` tasks. Individual calculation chunks were short, but
the priority-boosted `scheduler.yield()` chain postponed animation frames.
Simply lowering the chunk duration did not fix this. The diagnostic CPU profile
and temporary timeline capture remain in that ignored artifact directory; the
temporary tracing instrumentation has been removed.

Foreground calculation/effect preparation now yields through ordinary timer
tasks. Calculation yields occur between expensive LOS and visibility directions,
with a 4 ms slice; effect preparation uses 8 ms. A shared helper preserves
`scheduler.yield()` for hidden documents when available, avoiding reliance on
background-throttled timers. This changes scheduling, not which visibility
results or effect mutations are applied. Tests cover queued-task ordering,
background scheduling, directional results and receiving-actor effect grouping.

With timer yielding, three fresh-browser standalone repeats passed **all GM and
player windows**, at Maximum quality, ticker cap zero, with unchanged thresholds:

| Run | GM movement FPS range | Movement p95 range | Worst movement gap |
| --- | --- | --- | --- |
| `06ae9bd4-517e-421c-a3ef-927eaf91d8da` | 111.2–125.8 | 11.9–13.7 ms | 69.9 ms |
| `00e3e995-5060-4f4e-8fb7-02d604e9ee1f` | 94.4–117.4 | 13.6–16.6 ms | 86.7 ms |
| `c104f4be-0019-45f9-9944-074d9096e9b7` | 113.4–126.8 | 12.5–15.1 ms | 53.3 ms |

GM idle was 161.4–164.1 FPS. All three cleanups completed, with no source changes
during measurement. No profiler, previous FPS scenario, discarded first-movement
sample or relaxed budget was used. These repeats preceded extraction into the
shared helper and addition of its hidden-tab branch; the foreground timer path
is unchanged. Final verification must also cover that version, scent/observer
transitions, effect rules, deletion races and recalculation throughput.

All 4,896 automated tests across 519 suites and 50 live-harness checks pass.
These hardware-specific results are not a promise of stall-free rendering:
isolated 53–87 ms movement gaps remain in these runs. Commander remains enabled
with its banner-eligibility optimization, so the measurements apply to both
patched modules. They do not establish full live-suite coverage or memory-soak
coverage for every change.

## Retained-memory soak

`performance-retained-memory-soak` runs five minutes by default with 30 tokens,
24 walls and seven lights. Repeated cycles animate a token, create/delete a
temporary token, and switch the player observer. Four warm-up cycles precede the
baseline. Six checkpoints verify player artwork and collect Chromium post-GC
JavaScript heap, DOM-node and event-listener counts on both clients.

The median of the last three checkpoints may grow by at most 32 MiB of JS heap,
500 DOM nodes and 100 event listeners relative to baseline. All raw samples are
saved; budgets never adjust automatically. These browser-wide counters detect
retention signals but do not attribute them to Visioner rather than Foundry,
PF2e, or automation. Forced GC is outside the FPS measurement cases. GPU/native
memory is not represented by JS heap usage.

For a longer local run in PowerShell:

```powershell
$env:VISIONER_LIVE_SOAK_MINUTES = '30'  # allowed: 5–120
npm run test:live:performance
Remove-Item Env:VISIONER_LIVE_SOAK_MINUTES
```

Transient tokens remain inside the journal-owned scene for recovery after an
interruption. Debugging sessions detach on success/failure. A failed retention
budget remains a failed live case, even when document cleanup succeeds.
