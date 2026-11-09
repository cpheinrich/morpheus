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

Independent review evidence is appended before push.
