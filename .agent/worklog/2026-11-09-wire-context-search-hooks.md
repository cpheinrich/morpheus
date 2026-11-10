---
date: 2026-11-09
roadmap: MO-26-11-09-23.33.40
tags: [engineering, devops]
summary: "Pre-approve the context MCP for Claude, hint it at search time, and hand records off from codebase-memory."
---

# Make the context MCP Claude's default record search

Chris asked that every agent and collaborator use the Morpheus Context MCP on Morpheus projects
without approving or installing anything. Before changing anything, a headless test on Zoe's
mini (Evo at evo#861) showed Codex using the MCP for every record lookup. Claude ran one MCP
search, then fell back to `cat` and `grep`. Codebase-memory's Grep hook matched record headings,
because its graph indexes Markdown. Claude also shows "Pending approval" for a project
`.mcp.json` server until a person accepts it.

`context install` (and therefore `init`) now:

- pre-approves `morpheus_context` in `.claude/settings.json`, respecting an explicit disable;
- adds a Claude `PreToolUse` hook on Grep and Bash. When the search targets record paths or is
  Markdown-only, it runs Tantivy on the pattern's words and returns cited excerpts as
  `[morpheus-context]` context plus a visible notice. Code searches get nothing;
- writes a marked `.cbmignore` block of record globs, keeping other rules.

The hook reuses the `task-prompt` entry point, so an older installed CLI ignores the event
silently. Auto-update stops writing a user-level Claude entry and removes one Morpheus wrote.
Codex and Cursor user entries are unchanged. Morpheus's own settings carry the new setup.

## Verification

- `pnpm typecheck`, `pnpm compile`, `pnpm morpheus pm index`; `morpheus complexity check` passes
  (one cognitive advisory on the small shell tokenizer).
- `pnpm exec vitest run tests/context-search-hook.test.ts tests/context-client-install.test.ts
  tests/session-install.test.ts tests/self-auto-update.test.ts tests/context-task-start.test.ts
  tests/context-mcp.test.ts tests/doctor.test.ts tests/init.test.ts`: 164 passed. The new tests
  cover shell parsing, the record-path boundary (`.age` is not inside `.agent`), silence for
  code, whole-checkout and outside searches, the no-match nudge, approval merge/disable/malformed
  cases, `.cbmignore` in-place replacement, and removal of only Morpheus-shaped Claude entries.
- Interactive Claude in a trusted folder (tmux): with `enabledMcpjsonServers`, the project
  server connected with no prompt, while an unlisted server in the same session still prompted.
- A real headless Claude session in this worktree, with the candidate CLI on PATH, searched
  `.agent/decisions.md` with `grep`. The stream showed `PreToolUse:Bash says: Morpheus Context:
  3 cited excerpt(s)…`, and the answer cited the excerpts the hook added.
- A tiny repository indexed with codebase-memory 0.10.8 reported the Markdown file as
  `not_indexed` with reason `cbmignore`.

## Dead ends

- `claude mcp get` reports "Pending approval" even when settings approve the server, including
  `settings.local.json`; it does not reflect `enabledMcpjsonServers`. Only an interactive session
  shows the real behaviour.
- `codex exec` over SSH waited on stdin until given `< /dev/null`.
- A per-machine Claude registration was kept by the previous rollout to cover clones without
  project files; it is removed only after every managed project carries `.mcp.json`.
