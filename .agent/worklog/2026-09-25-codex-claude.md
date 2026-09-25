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
- Plugin focused tests (16 passed) cover threshold boundaries, unknown allowance/model/permissions, supervision,
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

Independent review will be recorded below before merge.
