---
roadmap: MO-26-10-05-22.41.19
date: 2026-10-05
agent: claude
---

# Claude → Codex delegation, and a 50% threshold

## What shipped

- `plugins/codex-claude/` now runs both ways. New: `claude-plugin/` (Claude Code manifest,
  local marketplace, `delegate-to-codex` skill, hooks, MCP config), `scripts/claude-mcp.mjs`
  (`codex_*` tools), `scripts/claude-hook.mjs`, `scripts/claude-statusline.mjs`,
  `src/codex-exec.mjs`, `src/claude-usage.mjs`, Codex handoff prompt and result schema.
- `Manager.launch`/`begin`/`recoverOrphans` extracted from `start` so both directions share
  one guardian path; `route()` takes the primary agent.
- Default `threshold` 30 → 50. Saved thresholds are preserved, so this host's saved 20 was set
  to 50 explicitly with `bridge.mjs config`.
- Installer registers the Claude plugin and the status-line recorder (`--codex-only` skips).

## What was learned

- **Claude Code exposes subscription usage only to the status line** (`rate_limits.five_hour`
  / `seven_day`, `used_percentage`, `resets_at`). Hook input, transcripts and `~/.claude.json`
  carry nothing. `/api/oauth/usage` exists but needs the OAuth token from the keychain, which
  the bridge's subscription boundary forbids reading. Hence the chaining recorder.
- **Hook input has no model field** in 2.1.283 (SessionStart: session_id, transcript_path,
  cwd, source; UserPromptSubmit adds permission_mode and prompt). The model is read from the
  latest assistant line of the transcript tail; effort comes from `CLAUDE_EFFORT` in the hook
  environment.
- **`codex exec --json` event shapes** (codex-cli 0.157.0), captured live: `thread.started`
  (thread_id), `item.started`/`item.completed` (command_execution, agent_message, and
  non-fatal `error` items such as hook-timeout clamps), `turn.completed`, `turn.failed`.
  `--output-schema` requires every property to be listed in `required`. `exec resume` has no
  `--sandbox`/`-C`, so sandbox goes through `-c sandbox_mode=…` on both forms.
- The delegated Codex child loads the Codex half of this same plugin, so without the
  `CODEX_CLAUDE_DELEGATED` marker its hooks could advise delegating straight back.
- A scratch directory triggers Claude's workspace-trust prompt in the TUI; the live status-line
  check ran in an already-trusted checkout instead.

## Verification

- `pnpm test` in the package: 46/46, including an end-to-end run through the real guardian
  with a fake `codex` binary (fresh + resume, needs_input supervision). Six hand mutations of
  the key guards (boundary, delegation marker, permission widening, staleness, resume, route
  bypass) each failed the suite.
- Live: installed on this Mac; headless Claude (Haiku) in a scratch repo called
  `codex_inspect` → `codex_start` → `codex_wait`; real Codex wrote `hello.txt` and returned a
  structured `completed` result with its session id saved. Interactive Claude TUI in a pty
  rendered `5h 29% · 7d 52%` and wrote `claude-usage.json`; doctor reported 48% remaining.

## GitHub Manager review

The PR had no independent review on record (only the conventions gate failing for the missing `agent-reviewed` label). I merged origin/main cleanly (c20f18e) and reviewed the whole change against MO-26-10-05-22.41.19: routing with the coordinating agent as primary, the strict-below-50% boundary, fail-closed handling of missing, stale, future-dated or reset Claude usage snapshots, the codex exec argv/event folding, session resume per working directory, the delegation marker on both sides, API-key refusal and the orphan-recovery/launch refactor. One substantive finding: Claude's `default` permission mode, which asks before every edit, was mapped to Codex `workspace-write` with `approval_policy="never"`, so an automatic handoff from a default-mode session could edit files with no approval — contrary to the item's "permission mapping never widens" acceptance and to the existing direction's rule that approval and confinement are independent. I mapped `default` to `read-only`, pinned it with a test (mutating it back fails the suite), and updated the package README and the delegate-to-codex skill. Package tests 46/46; root typecheck, 1631 tests, compile (no dist change) and pm index are clean. Not verifiable here: the macOS-only installer and the live Claude/Codex handoff, which the author reports having run; the codex-claude CI job runs on macOS.

```morpheus-manager-review
{
  "version": 1,
  "managerSession": "https://github.com/cpheinrich/morpheus-gh-manager-ops/actions/runs/37549663365 (pull request 327)",
  "reviewed": "c20f18ecb1d63246c60addd4ae6ab3428271b52f",
  "covered": "83aaca4f31fe48b73ee72bcb52afc63e44c15d83",
  "priorReview": { "state": "none", "note": "The body names this worklog as review-record, but it holds no morpheus-review block and the PR has no agent-reviewed label or reviews." },
  "findings": [
    { "id": "M01", "severity": "substantive", "description": "codexPermission mapped Claude's `default` mode (asks before each edit) to Codex workspace-write with approval_policy=never. When automatic routing hands work off from a default-mode session, Codex edits the checkout with no approval at all, widening the session's permissions against the item's acceptance.", "paths": ["plugins/codex-claude/src/config.mjs", "plugins/codex-claude/tests/reverse.test.mjs", "plugins/codex-claude/README.md", "plugins/codex-claude/claude-plugin/skills/delegate-to-codex/SKILL.md"], "disposition": "fixed", "response": "Mapped `default` to the read-only sandbox; acceptEdits/auto keep workspace-write. Added a test asserting the exact read-only args for `default`; reverting the mapping fails it (45/46). Updated README and skill text. Package pnpm test 46/46; root typecheck/test/compile/pm index clean." }
  ],
  "outcome": "cleared",
  "summary": "The PR had no independent review on record (only the conventions gate failing for the missing `agent-reviewed` label). I merged origin/main cleanly (c20f18e) and reviewed the whole change against MO-26-10-05-22.41.19: routing with the coordinating agent as primary, the strict-below-50% boundary, fail-closed handling of missing, stale, future-dated or reset Claude usage snapshots, the codex exec argv/event folding, session resume per working directory, the delegation marker on both sides, API-key refusal and the orphan-recovery/launch refactor. One substantive finding: Claude's `default` permission mode, which asks before every edit, was mapped to Codex `workspace-write` with `approval_policy=\"never\"`, so an automatic handoff from a default-mode session could edit files with no approval — contrary to the item's \"permission mapping never widens\" acceptance and to the existing direction's rule that approval and confinement are independent. I mapped `default` to `read-only`, pinned it with a test (mutating it back fails the suite), and updated the package README and the delegate-to-codex skill. Package tests 46/46; root typecheck, 1631 tests, compile (no dist change) and pm index are clean. Not verifiable here: the macOS-only installer and the live Claude/Codex handoff, which the author reports having run; the codex-claude CI job runs on macOS."
}
```
