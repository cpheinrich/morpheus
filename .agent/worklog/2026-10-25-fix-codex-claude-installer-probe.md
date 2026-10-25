---
roadmap: MO-26-10-25-05.52.02
agent: codex
tags: [engineering, developer-tools]
---

# Fix Codex-Claude installer probe

Replaced the install probe's stale tool counts with exact name-set validation. One shared
`tool-contract.mjs` now supplies the method order used by both MCP registration entry points and
the complete expected names loaded by the probe from the copy it is actually checking. The
probe fails only for missing or unexpected names and reports those sets plus the full observed
list; `install.mjs` already prints the thrown message before restoring the previous installation.

The regression tests run both current MCP servers through the real probe, proving that the
Codex-facing 20-tool server and Claude-facing 8-tool server are accepted. A temporary real MCP
server then advertises one contracted name, omits another, and adds an unexpected name; the test
pins the missing, unexpected and observed diagnostics. The existing MCP inventory test now uses
the same registration contract.

The first focused run failed before loading tests because this fresh worktree had no standalone
plugin dependencies and the root workspace did not expose `@modelcontextprotocol/sdk`. Installing
the plugin's frozen lockfile with `--ignore-workspace` resolved the environment; no dependency or
lockfile changed.

Verification so far:

- `node --test tests/probe.test.mjs tests/mcp.test.mjs` — 4/4 pass.
- `pnpm -C plugins/codex-claude test` — 120/120 pass.
- `pnpm -C plugins/codex-claude check` — pass.
- `pnpm typecheck` — pass.
- `pnpm compile` — pass; no generated `dist/` change.
- `pnpm morpheus pm index` — pass; all indexes unchanged.
- `node scripts/install.mjs` from this worktree — its internal 120/120 tests passed, it verified
  the installed MCP tools, registered the Claude Code plugin/status-line recorder, and installed
  the standalone copy at `/Users/chrisheinrich/plugins/codex-claude`.

The installed copy intentionally comes from this branch for the acceptance check. Routing settings
were preserved; no worker was started.
