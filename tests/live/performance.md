# Local performance tests

Run `npm run test:live:performance` with the QA world running. The same GM/player
credential prompts, world guard, recovery journal, and cleanup apply. Tests also
run within `npm run test:live:full`. A performance-only run cannot satisfy
`--release` or the full shipping matrix.

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
