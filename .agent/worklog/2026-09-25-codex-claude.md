---
roadmap: MO-26-09-25-10.22.41
---

# Optional Codex/Claude delegation

Implemented a standalone personal plugin under `plugins/codex-claude/`: validated configuration,
budget routing, per-task/operation overrides, model/effort mapping, verified permission mapping,
subscription-login preflight, persistent native Claude session links, same-host/worktree execution,
question supervision and audit records, bounded streams, a private live viewer, process-group
ownership and guardian leases. Nothing in Morpheus init or its CLI installer activates it.

## Evidence and limitations

- `pnpm typecheck`, `pnpm test` (52 files, 1,394 tests), `pnpm compile`, and `pnpm morpheus pm index`
  passed. No generated dist or index changes.
- Plugin focused tests (21 passed after review fixes) cover threshold boundaries, unknown allowance/model/permissions, supervision,
  recovery, memory ownership/disabled controls, desktop metadata freshness, MCP startup with no
  activation, viewer authorization, descendant cleanup, background timeout and blocked stdin.
- Plugin/skill validators passed using a temporary Python venv with PyYAML.
- Live Claude Max smoke on this MacBook Pro: stream JSON, AskUserQuestion callback and answer,
  structured completion, and a second process resuming the same native session and recovering the
  exact marker. No repository changes or external messages requested from Claude.
- The live result rendered in a hidden Codex in-app browser tab: host/project, completed status,
  and resumed marker. Viewer data is text, private by capability, and does not renew the lease.
- Explicit installer copied/tested the package, registered the personal marketplace and installed
  it into Codex. Confirmed all nine tools through MCP using the actual installed cache. Installed doctor reads this task's selected model/effort and confirms Claude Max.
  Routing remains off; hooks still require Codex's explicit trust/new-task loading boundary.
- Mac mini reached over the recorded SSH host. Both CLIs present (Codex 0.156.1, Claude 2.1.238).
  Started its missing managed Codex service. Claude auth status is logged out, so remote model
  execution cannot be demonstrated without its owner's login. No credentials were transferred.
- Desktop's active task is not loaded in the separately managed daemon. Public rate-limit read
  works, but detached settings use a version-pinned read-only rollout adapter (0.154.0 and
  0.154.0-alpha.6.1). Unknown versions refuse delegation; native per-task memory mode additionally
  uses a read-only state_5.sqlite lookup. No hidden instruction payload is forwarded.
- Restricted sandbox inheritance is unsupported and refused. Account extra usage must be disabled
  for a hard subscription-only spending boundary; CLI lacks an atomic per-run no-overage switch.
  These limits and remote viewer forwarding are explicit in README; no broader support claimed.

## Dead ends and corrections

- Graph discovery unavailable: codebase-memory-mcp daemon requests timed out; both exact-checkout
  install checks failed. Repair refused to stop active CBM sessions safely. Did not kill them or
  claim graph verification. Direct file reads used for the small integration/architecture scope.
- `codex app-server proxy` is a raw WebSocket tunnel, not line-delimited JSON. Connected with the
  standard ws client over the local daemon socket instead.
- Personal marketplace source paths resolve from the home marketplace root, not the directory
  containing `.agents/plugins/marketplace.json`. First install failed before activation; corrected
  destination to `~/plugins/codex-claude`, then installation and doctor succeeded.
- macOS may return EPERM for a process group whose leader has already disappeared but has not yet
  been reaped. Verified disappearance with getpgid before ignoring that specific cleanup race.
- Large stdin handoffs must be nonblocking; guardian queues them so a worker that never reads stdin
  still expires its lease. Added a regression test.

- Codex's plugin cache skips symlinks; dereferencing an isolated pnpm tree loses package-relative
  dependency lookup. Pinned pnpm 11.9.0 and used its hoisted layout in the package. Added an
  installer probe of the actual cached MCP server, after source-directory tests, to catch this.

Independent review found three substantive issues: orphan recovery could leave a TERM-ignoring
child, the installer imported its dependency-bearing probe before bootstrap and did not call it,
and the supervision ceiling also rejected genuine user answers. Fixed each with regression tests.
The same reviewer cleared the correction commit after running eight focused tests. All 21 plugin
tests now pass; the corrected installer successfully probes the actual Codex plugin cache. Review
used direct source evidence because graph access was unavailable. Remote Claude authentication,
restricted-sandbox support and account-level overage remain the documented limitations.


Independent review found three substantive issues in orphan cleanup, installer bootstrap/probing, and user answers at the supervision ceiling. All were fixed with regression tests; the same reviewer cleared the correction commit. Graph evidence was unavailable, and remote authentication/permission/billing compatibility limits remain explicit.

```morpheus-review
{
  "version": 1,
  "base": "8259795fec044dbdeab92575f9b08553505746bc",
  "reviewed": "dd86f59732bc311d30f3d7820821eedf0334f7dc",
  "covered": "a19f472fc7f6eafcd416d70892ccfdd031dd27f9",
  "authorSession": "01a0d95a-f862-7100-bdbd-de20bd08e98f",
  "reviewerSession": "01a0d9ba-42c1-76d2-b227-b00d7724aa1a",
  "risk": "high",
  "elapsedMinutes": 2.5,
  "outcome": "complete",
  "summary": "Independent review found three substantive issues in orphan cleanup, installer bootstrap/probing, and user answers at the supervision ceiling. All were fixed with regression tests; the same reviewer cleared the correction commit. Graph evidence was unavailable, and remote authentication/permission/billing compatibility limits remain explicit.",
  "findings": [
    {
      "id": "R01",
      "severity": "substantive",
      "description": "Orphan recovery could release a run lock while a TERM-ignoring descendant remained alive after the leader exited.",
      "paths": [
        "plugins/codex-claude/src/processes.mjs",
        "plugins/codex-claude/src/service.mjs"
      ],
      "disposition": "fixed",
      "response": "Captured verified group-member identity anchors, escalated using surviving owned descendants, and retained cleanup_pending nonterminal state when cleanup cannot be proven. Added descendant, stale identity, unresolved-state and recovered-process-state tests."
    },
    {
      "id": "R02",
      "severity": "substantive",
      "description": "Installer imported SDK-dependent probe before installing dependencies and never called the probe.",
      "paths": [
        "plugins/codex-claude/scripts/install.mjs",
        "plugins/codex-claude/scripts/probe.mjs"
      ],
      "disposition": "fixed",
      "response": "Bootstrap now uses Node built-ins, dynamically loads the probe from the installed staging copy, and probes the installedPath returned by Codex. A dependency-free bootstrap regression passes and the full real installer verified the cached MCP server."
    },
    {
      "id": "R03",
      "severity": "substantive",
      "description": "Autonomous supervision ceiling also rejected a genuine user answer, including with a zero ceiling.",
      "paths": [
        "plugins/codex-claude/src/service.mjs"
      ],
      "disposition": "fixed",
      "response": "The ceiling now applies only to Codex answers. User answers reset that budget, while a separate monotonically increasing answer sequence preserves audit entries. Added a zero-budget user-answer regression."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "01a0d9ba-42c1-76d2-b227-b00d7724aa1a",
      "commit": "a19f472fc7f6eafcd416d70892ccfdd031dd27f9",
      "outcome": "cleared",
      "elapsedMinutes": 0.5,
      "summary": "Reviewed the complete correction diff and ran eight focused process, manager and installer tests; all three findings resolved, no new findings."
    }
  ]
}
```
