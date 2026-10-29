---
roadmap: MO-26-10-29-14.02.57
tags: [engineering, devops, infrastructure]
---

# Render the CD V2 worker LaunchAgent as an interactive process

Issue #558: the worker LaunchAgent template set `ProcessType` `Adaptive`. With no XPC client launchd
runs such a job as Background (priority 4, CPU and I/O throttled). On Evo's Mac mini the throttled
`codex app-server` missed the consumer shim's 10-second initialize deadline on almost every
scheduled wake, so the quota reader failed (`configured reader exited (code=2)`, 123 budget waits)
while the account was at roughly a quarter of its weekly window.

The template now renders the worker as `Interactive`, the class the issue measured as unthrottled
(the same handshake took about 0.2-1.2 s over ssh and in the GUI session). `Standard` was the other
option offered; it was not chosen because launchd documents it only as "no ProcessType set", while
`Interactive` is the class whose behaviour was actually measured. Most wakes still idle at once, so
the class matters only while repair work runs, which is work an operator is waiting on. The tick
keeps `Background`: it is short, deterministic and starts no provider handshake. The host runbook
says why, and the host integration test now parses both plists and refuses any other class.

The issue's optional stderr tail is already covered by #554, which keeps one sanitized,
fixed-vocabulary startup diagnostic. A raw stderr tail would contradict the 2026-10-19 decision that
provider text never reaches durable diagnostics, so none is added.

Validation: `bash tests/cd/host-integration.sh` passes 61/61. Re-rendering the worker template with
`Adaptive` fails exactly the new check (60 pass, 1 fail), then the source was restored.
`pnpm exec vitest run tests/cd/host.test.ts` passes 2/2; `pnpm typecheck`, `pnpm compile` (no
`dist/` change) and `pnpm morpheus pm index` pass. This focused scope is the only consumer of the
template. No live launchd job was loaded or changed; consumers re-render under their own ops review.
