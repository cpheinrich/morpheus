---
agent: codex
date: 2026-11-09
roadmap: MO-26-11-09-07.22.52
outcome: review
tags: [engineering, security, devops]
---

# Upgrade the root MCP SDK security line

## Mandate

- Outcome: remove the root MCP SDK's two high- and two moderate-severity production advisories.
- Acceptance: root resolves SDK 1.32.0; the context MCP contract, typecheck, compile, PM index,
  production audit, exact-head CI, and fresh independent review are recorded on a focused draft.
- Authority: change this governed branch and its PR metadata only; do not merge, enable
  auto-merge, dispatch workflows, deploy, create credentials, or widen the dependency scope.
- Budget: existing local subscription and included CI only; no new spend.

## Design

The root imports only the MCP server, stdio transport, in-memory test transport, and public result
types. A direct 1.31.0 to 1.32.0 update is the smallest patched line and requires no source change.
The separate root Zod and minimatch findings remain in drafts #579 and #570.

## Validation

- `pnpm exec vitest run tests/context-mcp.test.ts`
- `pnpm typecheck`
- `pnpm compile`
- `pnpm morpheus pm index`
- `pnpm morpheus pm validate`
- `pnpm audit --prod --json` — the four MCP SDK advisories are absent; the separate Zod high and
  minimatch moderate findings remain.
- `git diff --check`

## Independent review

Fresh normal-risk independent review cleared cb22fa44 with no findings. It verified the exact root-only SDK and lockfile delta, the MCP server/client imports, 6/6 focused contract tests, typecheck, the resolved 1.32.0 version, and removal of all four SDK production advisories. The remaining Zod and minimatch findings stay in their separate drafts. A diagram would not help this trivial dependency-only change.

```morpheus-review
{
  "version": 2,
  "base": "db1c3f76c367d0f39739126e20aeda0d2b5dea42",
  "reviewed": "cb22fa4481e4f8113e34358d6049061e6f756428",
  "covered": "cb22fa4481e4f8113e34358d6049061e6f756428",
  "authorSession": "01a1c0d5-069c-7052-afc9-cb4c0d5f45c6",
  "reviewerSession": "/root/morpheus_root_sdk_review",
  "risk": "normal",
  "elapsedMinutes": 3.5747666666666666,
  "timing": {
    "source": "runner",
    "durationMs": 214486,
    "evidence": "Codex subagent task_complete for turn 01a1c0ee-f2de-7fa0-9184-af67b94ebaf4 reported duration_ms=214486."
  },
  "outcome": "complete",
  "summary": "Fresh normal-risk independent review cleared cb22fa44 with no findings. It verified the exact root-only SDK and lockfile delta, the MCP server/client imports, 6/6 focused contract tests, typecheck, the resolved 1.32.0 version, and removal of all four SDK production advisories. The remaining Zod and minimatch findings stay in their separate drafts. A diagram would not help this trivial dependency-only change.",
  "findings": []
}
```
