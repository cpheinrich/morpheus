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

## Independent review

Independent review confirmed the probe now derives its expected tool names from the servers' shared registration contract and that the tests cover the current servers and a missing-tool fixture; the one finding, the roadmap item omitting its PR number, was fixed under the reviewer's condition at 276af1f3.

Reviewer: a fresh Codex session (gpt-5.6-sol, high effort) with the review packet and no author context; timing is the launcher wall clock around `codex exec`.

```morpheus-review
{
  "version": 2,
  "base": "e68f6d7e8aa5b69e7bf263c0b75f501954ec688b",
  "reviewed": "4fd371fa58fb7d5a0a91b9bcec835e8c5d166919",
  "covered": "276af1f3bca240973482177591e6e581283ecc5c",
  "authorSession": "7dfbcb4c-6fd4-5e43-bba6-aea6a0d1b6e5",
  "reviewerSession": "01a17326-68f3-7bf2-9238-35f77c08a1f5",
  "risk": "small",
  "elapsedMinutes": 6.616666666666666,
  "timing": {
    "source": "runner",
    "durationMs": 397000,
    "evidence": "codex exec (gpt-5.6-sol, high) thread 01a17326-68f3-7bf2-9238-35f77c08a1f5; launcher wall clock start 2026-10-25T13:00:59Z, end 2026-10-25T13:07:36Z"
  },
  "outcome": "complete",
  "summary": "Independent review confirmed the probe now derives its expected tool names from the servers' shared registration contract and that the tests cover the current servers and a missing-tool fixture; the one finding, the roadmap item omitting its PR number, was fixed under the reviewer's condition at 276af1f3.",
  "findings": [
    {
      "id": "F1-roadmap-prs-empty",
      "severity": "minor",
      "disposition": "fixed",
      "paths": [
        "hq/product/roadmap/MO-26-10-25-05.52.02-codex-claude-installer-probe.md"
      ],
      "description": "The roadmap item recorded prs: [] and so could not be reconciled with PR #515 after merge.",
      "response": "Set prs: [515] and regenerated the roadmap index (276af1f3).",
      "condition": {
        "paths": [
          "hq/product/roadmap/MO-26-10-25-05.52.02-codex-claude-installer-probe.md"
        ],
        "evidence": "Reviewer: 'clear with conditions: correct the roadmap PR association' (roadmap item line 10)."
      },
      "conditionMet": "276af1f3 sets prs: [515]; morpheus pm index regenerated; morpheus check pr run before push."
    }
  ],
  "trunkIntegrations": [
    {
      "commit": "61e22290e02e75fce310ee3046d6e3bb35d25517",
      "reason": "Merged origin/main after review; .agent/decisions.md conflicted on adjacent new entries and was resolved by keeping both, this item's entry first. No other file conflicted."
    }
  ]
}
```
