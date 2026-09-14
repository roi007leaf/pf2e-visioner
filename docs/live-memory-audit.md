# Live memory audit — 2026-09-14

## Result

No sustained DOM/listener or deleted-token tooltip-handler leak was demonstrated by this workload. JavaScript heap retained several MiB after garbage collection; this remains an observation, not proof of either a leak or a leak-free module.

Tested Visioner 8.7.2, Foundry 14.367, PF2e 8.5.0 in `visioner-qa`, using independent GM and player clients. Thirty tokens, 24 walls, and seven lights remained in the scene. Each cycle moved a token, created/deleted a temporary token, and switched the player's observer. Four warm-up cycles preceded seven post-GC checkpoints.

| Run | Cycles | GM retained heap growth | Player retained heap growth | Result |
| --- | ---: | ---: | ---: | --- |
| 10 minutes | 434 | 7.3 MiB | Not retained in report | Initial audit assertion failed on one transient warm-up handler |
| 5-minute follow-up | 214 | 5.2 MiB | 3.1 MiB | Passed settled retention checks |

Growth uses the median of the last three checkpoints minus the warm baseline. The fixed failure budget is 32 MiB heap, 500 DOM nodes, or 100 event listeners; being below it does not establish absence of smaller leaks.

In the follow-up, both clients had zero settled DOM-node and event-listener growth. GM listener count stayed at 1,097; player at 539. Tooltip handler maps settled at 30 entries for 30 live tokens. GM had one stale warm-up entry, then zero at all six later checkpoints; player had zero throughout. Badge/indicator collections stayed empty in this workload. The realtime timer checker stayed active, which is expected for the initialized service. Foundry hook enumeration was unavailable and is reported as null, not zero.

The initial strict assertion treated a transient warm-up handler as persistent retention and threw before retaining the player's results. The audit now records both clients before deciding failure and requires zero stale handlers in all three final checkpoints. It preserves every raw sample and the original failed report. No production code was changed for this audit.

## Evidence

- Initial run: `artifacts/live/9fddf08d-e8f4-4519-acac-9270719c4e7d/report.json`.
- Follow-up: `artifacts/live/4b177182-5b37-4dd5-9951-e0e772857a4c/report.json`.
- Follow-up source remained unchanged; no startup errors; cleanup completed. QA documents were removed and pause state restored before returning the server to Kingmaker.

## Limits and next investigation

This is a browser-wide allocation audit, not allocation attribution to Visioner. Foundry, PF2e, browser internals, caching, and automation also contribute. GPU/native memory, server heap, full scene-switch loops, every dialog/feature, and overnight behavior are not covered. Empty badge collections do not stress active tooltip overlays.

To investigate small or slow leaks, run 30–60 minutes with heap snapshots and retaining-path comparison, plus separate scene-switch, active-tooltip, action-dialog, peek, and effect-lifecycle workloads. A Visioner-disabled control is needed before attributing shared heap growth to the module.

```powershell
$env:VISIONER_LIVE_CASE = 'performance-retained-memory-soak'
$env:VISIONER_LIVE_SOAK_MINUTES = '30'
npm run test:live:full
Remove-Item Env:VISIONER_LIVE_CASE
Remove-Item Env:VISIONER_LIVE_SOAK_MINUTES
```

Launch `visioner-qa` first. The runner refuses campaign worlds and retains recovery information if interrupted.
