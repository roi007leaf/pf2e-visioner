# Local performance tests

Run `npm run test:live:performance` with the QA world running. The same GM/player
credential prompts, world guard, recovery journal, and cleanup apply. Tests also
run within `npm run test:live:full`. A performance-only run cannot satisfy
`--release` or the full shipping matrix.

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
memory leaks, cold startup, huge scenes, and third-party combinations are not
covered by these short workloads.
