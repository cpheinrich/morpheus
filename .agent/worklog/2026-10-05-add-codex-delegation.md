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
