---
roadmap: MO-26-10-28-14.09.01
tags: [engineering, devops]
---

# Extend wait-ci to any workflow run and steer agents off polling

## Why

Transcripts 2026-09-24 → 2026-10-28: Claude sessions polled CI (`gh run view|run watch|pr checks`)
4.0 times each before `wait-ci` existed and 4.6–7.8 after, with `wait-ci` itself almost unused.
Codex adopted `wait-ci` (5.4 per session) but still polled 4.4 times per session. The most
repeated poll was `gh run view <id> --json status,conclusion,jobs` (75 times in two weeks) on
TestFlight, release and nightly runs, which `wait-ci` could not take: it required a PR. Evo's
`AGENTS.md` never received the `wait-ci` line because the 2026-10-07 rollout merged beside it.

## What changed

- `src/wait-ci/runs.ts` (pure) and `wait-run.ts`: `wait-ci --run <id>` and `--workflow <name|file>
  [--branch] [--sha]`. Same backoff, poll-error tolerance, timeout and exit codes as PR mode; jobs
  become `Check` rows so the digest and failing-step logs are shared (`failureLines` extracted in
  `digest.ts`; PR output byte-identical, existing tests unchanged). The run's conclusion decides,
  not its jobs (`continue-on-error`, `startup_failure`). Workflow mode re-selects the newest
  matching run every poll and names a move; with no match it applies the PR mode's 3-minute
  no-checks grace; a run already finished at the first look without `--sha` is flagged, because
  by branch alone it may be the previous push's run. A failed first read exits 3 immediately
  (mistyped id/workflow, auth), mirroring PR mode's lookup.
- `src/wait-ci/poll-guard.ts`, `hook.ts`, `morpheus poll-guard`: a PreToolUse hook on `Bash`,
  in both `.claude/settings.json` and `.codex/hooks.json` (Codex reads the same schema, matches
  shell as `Bash`, and blocks on exit 2 — checked against the Codex hooks docs and the 0.163.0
  binary's PreToolUse wire schema). The committed `.morpheus/poll-guard.sh` shim prefilters with a
  shell `case` so ordinary commands never start Node, and turns only the CLI's exit 2 into a
  refusal. The hook command resolves the shim from `CLAUDE_PROJECT_DIR`, then the git toplevel,
  and is silent elsewhere, so a `cd` into a subdirectory cannot turn every Bash call into a hook
  error. Third poll of one target per session is refused; `--log`/`--log-failed`/`--web`, `--job`
  without a run id, and the interactive picker are not counted; a refused call is not recorded.
- State is `local/sessions/poll-guard-<session>.json` in the **primary** checkout (from
  `--git-common-dir`), not the task worktree: `pm cleanup` (src/pm/cleanup.ts) refuses any worktree
  whose `local/` holds anything but its own lease, so per-worktree state would have broken
  routine cleanup.
- `context install` (and therefore `init`) writes the shim and merges the PreToolUse entry,
  one repair per file, preserving a project's own Bash hooks; an unowned script at the shim path
  blocks only the guard. `doctor` warns on an unwired guard and on `AGENTS.md` missing the
  template's key rules (`src/doctor/instructions.ts`): wait-ci, wait-ci for runs, break loops,
  focused tests, refresh on refusal. A test holds the template and Morpheus's own file to them.
- Template and Morpheus `AGENTS.md` Break-loops paragraphs name `wait-ci --run`. The template was
  2 bytes under its 16,000-byte test budget, so the paragraph was rewritten shorter rather than
  appended to (now ~15,960). Morpheus's file is 19,763 of 20,000.
- MO-26-10-25-02.22.28 (same-head CI): already fixed by #459 (run census) and #524 (workflow
  identity). Marked shipped with `pm ship`; three regression cases pin the #499 shape (unregistered
  second run, reversed start order, queued rerun).

## Dead ends and limits

- Real Claude Code runtime verification could not run: headless `claude -p` on this machine
  fails with "OAuth session expired and could not be refreshed". Instead the exact committed hook
  command was run through real `sh`, from a subdirectory with `CLAUDE_PROJECT_DIR` empty, against
  the compiled branch CLI, real git and the real primary checkout: calls 1–2 exit 0, call 3
  exit 2 with the refusal, a non-poll command exit 0 silently; the state file landed in
  `~/code/morpheus/local/sessions/` (removed afterwards). Codex will not run the new hook until
  `/hooks` trusts it in each project — that is a one-time human step.
- `wait-ci --run`/`--workflow` were run against real GitHub: a failed CI run (exit 1, the
  conventions step's own `✗` line), a green run (exit 0), a live in-progress run that the wait
  followed to green after 12 s, and `--workflow Schedule --branch main` (exit 0, already-finished
  flag shown).
- Considered capping the last sleep at the no-run grace; kept PR-mode's backoff for parity.
- `--required-only` remains PR-only and still skips the run census by design.

## Test plan

Focused, because these are the changed modules and their direct dependents:
`pnpm exec vitest run tests/wait-ci tests/doctor-instructions.test.ts tests/session-install.test.ts
tests/agent-instructions.test.ts tests/doctor.test.ts tests/init.test.ts` — 338 passed. One full
`pnpm test` (shared core `src/session/` and `src/init/templates.ts` touched): 3579 passed, 9 failed,
all outside this change: `workflow-expressions` needs a local `actionlint` binary (ENOENT), and
`cd/native-worker` plus `upload-receipt` timing tests pass when re-run alone (machine load).
`pnpm typecheck`, `eslint` on the changed files, `pnpm compile`, `pm index`, `pm validate`.
