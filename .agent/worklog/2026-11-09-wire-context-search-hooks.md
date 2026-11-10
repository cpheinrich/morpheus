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
- The previous rollout registered a per-machine Claude entry to cover clones without project
  files. Every managed project already has `.mcp.json`, but none pre-approves it yet. This PR
  therefore merges only after each project's `context install` PR puts `enabledMcpjsonServers`
  on its `main`. Otherwise auto-update would remove the user entry before the project's
  approved one exists.

## Independent review

Independent high-risk review blocked the initial head on two substantive findings: shell searches split inside quotes and misread grep -E (F1), and removing the user-level Claude entry before projects pre-approve the server (F2). The author made splitting quote-aware, dropped -E as a value flag, corrected the worklog and merges only after every managed project carries the approval; the follow-up cleared both and accepted declining F4. A late correction skipping shell redirections (F5) cleared; F6, quoted patterns starting with < or >, was declined as harmless.

```morpheus-review
{
  "version": 2,
  "base": "6bbeaab0d32f2272e649489bcc82f8cb41940fec",
  "reviewed": "6a2f3ac591c30f812e9c63572c1d71b6f299e289",
  "covered": "899cd74746bf3f032cbe6adfd2918b1e6510d17e",
  "authorSession": "7aa855bb-6d4e-558c-a862-36a1b9e57423",
  "reviewerSession": "claude-code-subagent/aab59c8c8c989519d",
  "risk": "high",
  "elapsedMinutes": 3.4978333333333333,
  "timing": {
    "source": "runner",
    "durationMs": 209870,
    "evidence": "Agent tool result for subagent aab59c8c8c989519d, initial turn: duration_ms=209870."
  },
  "outcome": "complete",
  "summary": "Independent high-risk review blocked the initial head on two substantive findings: shell searches split inside quotes and misread grep -E (F1), and removing the user-level Claude entry before projects pre-approve the server (F2). The author made splitting quote-aware, dropped -E as a value flag, corrected the worklog and merges only after every managed project carries the approval; the follow-up cleared both and accepted declining F4. A late correction skipping shell redirections (F5) cleared; F6, quoted patterns starting with < or >, was declined as harmless.",
  "findings": [
    {
      "id": "F1-shell-split",
      "severity": "substantive",
      "description": "Shell commands were split at | and ; inside quotes and -E was treated as taking a value, so alternation and grep -E record searches got no hint.",
      "paths": [
        "src/context-search/search-hook.ts",
        "tests/context-search-hook.test.ts"
      ],
      "disposition": "fixed",
      "response": "Added a quote-aware commands() tokenizer, removed -E from VALUE_FLAGS, and added exact-value tests for rg \"a|b\", grep -rE \"a|b\" and grep -E word."
    },
    {
      "id": "F2-merge-order",
      "severity": "substantive",
      "description": "Auto-update removes the user-level Claude entry, but no managed project pre-approved the server yet, and the worklog described the opposite order.",
      "paths": [
        ".agent/worklog/2026-11-09-wire-context-search-hooks.md",
        "src/context-search/install.ts"
      ],
      "disposition": "fixed",
      "response": "Corrected the worklog; each managed project's context install PR (enabledMcpjsonServers) merges before this PR, verified with git show origin/main:.claude/settings.json per project before merge."
    },
    {
      "id": "F3-own-entry",
      "severity": "minor",
      "description": "A user's own morpheus_context entry was reported blocked on every auto-update.",
      "paths": [
        "src/context-search/install.ts",
        "tests/self-auto-update.test.ts"
      ],
      "disposition": "fixed",
      "response": "Now reported present with a neutral 'Kept your own' detail; the test asserts the detail and unchanged bytes."
    },
    {
      "id": "F4-cd-echo",
      "severity": "minor",
      "description": "cd dir && grep resolves against the session cwd, and echo grep is read as a search.",
      "paths": [
        "src/context-search/search-hook.ts"
      ],
      "disposition": "disputed",
      "response": "Both fail harmlessly (no hint or an extra hint); tracking cwd changes would add shell interpretation for little gain."
    },
    {
      "id": "F5-redirects",
      "severity": "minor",
      "turn": 2,
      "description": "A redirection such as 2>/dev/null was read as a search path, suppressing the hint.",
      "paths": [
        "src/context-search/search-hook.ts",
        "tests/context-search-hook.test.ts"
      ],
      "disposition": "fixed",
      "response": "Words starting with an optional digit and < or > are skipped, a bare operator also skips its target; tests cover 2>/dev/null and 2>&1 > out.txt."
    },
    {
      "id": "F6-quoted-angle",
      "severity": "minor",
      "turn": 3,
      "description": "A quoted pattern starting with < or > is read as a redirection after quotes are stripped.",
      "paths": [
        "src/context-search/search-hook.ts"
      ],
      "disposition": "disputed",
      "response": "Harmless (no hint, never blocks) and rare for record searches; tracking quoting per word is not worth the extra tokenizer state."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "claude-code-subagent/aab59c8c8c989519d",
      "commit": "195ce8dc00a35c7610756b948416d2e39494bd7c",
      "outcome": "cleared",
      "elapsedMinutes": 0.5717333333333333,
      "timing": {
        "source": "runner",
        "durationMs": 34304,
        "evidence": "Agent tool result for resumed subagent aab59c8c8c989519d, follow-up 1: duration_ms=34304."
      },
      "summary": "Cleared F1 and F2 fixes and F3; accepted the F4 decline; raised minor F5."
    },
    {
      "reviewerSession": "claude-code-subagent/aab59c8c8c989519d",
      "commit": "899cd74746bf3f032cbe6adfd2918b1e6510d17e",
      "outcome": "cleared",
      "elapsedMinutes": 0.5446333333333333,
      "timing": {
        "source": "runner",
        "durationMs": 32678,
        "evidence": "Agent tool result for resumed subagent aab59c8c8c989519d, follow-up 2: duration_ms=32678."
      },
      "scopeReason": "Late correction after clearance: fix for minor F5 (shell redirections read as search paths).",
      "summary": "Cleared the F5 fix; raised minor F6."
    }
  ]
}
```
