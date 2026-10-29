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

The template now renders the worker as `Interactive`, which gives the priority-31 scheduling under
which the issue measured the same handshake at about 0.2-1.2 s (over ssh and in the GUI session; a
launchd `Interactive` job itself was not measured). `Standard` was the other option offered; it was
not chosen because launchd documents it only as "no ProcessType set" and it was never measured,
while Evo's Mini already runs its CI dispatcher and runner as `Interactive`. Most wakes still idle at once, so
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

## Independent review

Fresh independent review (normal risk) cleared dab8db66 with one minor finding. F1: the runbook and test pinned the tick as Background on the grounds that it starts no provider handshake, but the tick also runs the consumer's credential wrapper, and #558's own diagnosis shows a keychain-backed gh token lookup timing out at background priority. The author qualified the runbook line (keep Background only when the consumer's tick wrapper does no throttle-sensitive lookup; otherwise render Standard or Interactive) and renamed the test message to describe the template default, in 3bf6dace; no tick behaviour changed. The reviewer also noted the worklog overstated what was measured for Interactive; the wording now says the priority-31 environment was measured, not a launchd Interactive job. The reviewer re-ran the integration test (61/0), mutation-checked the new guard against Adaptive, Standard, Background, unset and whitespace values, and confirmed #554 covers the stderr-tail suggestion.

```morpheus-review
{
  "version": 2,
  "base": "12c0efdc4383676df5df11c0f74729049523ac52",
  "reviewed": "dab8db66fde40720e7978c818d327b4d80bc87c4",
  "covered": "3bf6dacecf8bc670dadaa768ffc3ff02c6d7d1d9",
  "authorSession": "claude-code/cae29785-49d9-41ff-9b32-6350ae76eb63",
  "reviewerSession": "claude-code-subagent/a5ee6ffaf79f37093",
  "risk": "normal",
  "elapsedMinutes": 3.917316666666667,
  "timing": {
    "source": "runner",
    "durationMs": 235039,
    "evidence": "Claude Code Agent tool result for reviewer subagent a5ee6ffaf79f37093 (initial turn): duration_ms=235039."
  },
  "outcome": "complete",
  "summary": "Fresh independent review (normal risk) cleared dab8db66 with one minor finding. F1: the runbook and test pinned the tick as Background on the grounds that it starts no provider handshake, but the tick also runs the consumer's credential wrapper, and #558's own diagnosis shows a keychain-backed gh token lookup timing out at background priority. The author qualified the runbook line (keep Background only when the consumer's tick wrapper does no throttle-sensitive lookup; otherwise render Standard or Interactive) and renamed the test message to describe the template default, in 3bf6dace; no tick behaviour changed. The reviewer also noted the worklog overstated what was measured for Interactive; the wording now says the priority-31 environment was measured, not a launchd Interactive job. The reviewer re-ran the integration test (61/0), mutation-checked the new guard against Adaptive, Standard, Background, unset and whitespace values, and confirmed #554 covers the stderr-tail suggestion.",
  "findings": [
    {
      "id": "F1-tick-class",
      "severity": "minor",
      "description": "Runbook and test stated the tick stays Background because it starts no provider handshake, but the tick runs the consumer credential wrapper, whose keychain-backed gh token lookup was shown to time out at background priority in #558's diagnosis.",
      "paths": [
        "docs/cd-v2-host-macos.md",
        "tests/cd/host-integration.sh"
      ],
      "disposition": "fixed",
      "response": "Qualified the runbook: the template keeps Background because Morpheus's tick starts no provider handshake, and a consumer whose tick wrapper does a throttle-sensitive lookup should render the tick Standard or Interactive. Renamed the test check to describe the template default. No template behaviour changed (3bf6dace)."
    }
  ]
}
```
