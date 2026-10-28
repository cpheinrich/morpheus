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

## Independent review

A fresh reviewer subagent (high risk: a blocking hook wired into every project is a shared control) cleared the change on one condition and three minor findings, in 7.67 minutes. S1 (substantive, conditional): the guard could write an untracked `local/sessions/` file into any repository the agent had `cd`'d into, including one that does not ignore `local/`; the guard now records state only where `git check-ignore` confirms the path is ignored, and allows the call without state otherwise, with a real-git test proving a foreign repository stays clean. M1: `gh run view $RUN_ID` and heredoc bodies were counted, and the refusal could suggest a `wait-ci --run '$RUN_ID'` that usage rejects; non-numeric ids and heredoc bodies are no longer counted. M2: `--sha` with a short SHA matched nothing and looked like CI never started; it is now a usage error naming `git rev-parse`. M3: `--workflow` could return the previous run's exit code straight after `gh workflow run`; an already-finished latest run without `--sha` is now held for 20 seconds and a newly listed run is followed, with docs updated. I1 (incidental): Codex will not run the new PreToolUse entry until `/hooks` trusts it in each project; trust is keyed per hook (`<file>:pre_tool_use:0:0` in `~/.codex/config.toml`), so the existing SessionStart trust is unaffected, and the step is named in the PR's open questions. No follow-up turn was needed for the findings.

Follow-up turn by the same reviewer, spent on the hand-resolved merge of trunk 3fd8e28e (#547, which rewrote src/session/install.ts to add PostToolUse read hooks): cleared with no findings in 2.02 minutes. It confirmed #547 read-hook behaviour is unchanged inside the shared per-marker loop, malformed events still block before any write, an unowned guard script skips only the guard, the Codex event set adds only the documented PreToolUse, Morpheus own hook files equal the merged templates (context install --check exits 0), committed dist matches source, the four changed test expectations keep trunk assertions, and the merged build refuses the third poll end to end.

The fixes were verified against GitHub as well: `--workflow Schedule --branch main` held for 29 s and then reported with the warning, a short `--sha` exited 3, and a full `--sha` exited 0.

```morpheus-review
{
  "version": 2,
  "base": "e4fd7b585633f3eaf163121fffe4c8a8ce133978",
  "reviewed": "9432c23f68af0918fe6eb8321a3e58929c6d33d5",
  "covered": "e37d7f6032697fa318c94a3e08c6ed66428392e7",
  "authorSession": "0d17f3e2-e23e-440f-949e-057495fe4e55",
  "reviewerSession": "a814cd10bc96528bf",
  "risk": "high",
  "elapsedMinutes": 7.6721,
  "timing": {
    "source": "runner",
    "durationMs": 460326,
    "evidence": "Claude Code Agent tool result for reviewer subagent a814cd10bc96528bf (foreground, started 2026-10-28T21:43:30Z): duration_ms=460326, tool_uses=48."
  },
  "outcome": "complete",
  "trunkIntegrations": [
    {
      "commit": "35e3e29409a0590b9f41a1d837a337b8a8b7a357",
      "reason": "Merged origin/main 2ad160e9 (#540, #542, #543, #544, #546) after review. Conflicts were append-only: .agent/decisions.md keeps trunk's three new entries followed by this task's entry unchanged; dist/cli/help.d.ts and help.js.map were regenerated by pnpm compile from the auto-merged src/cli/help.ts (both sides' lines kept). pnpm typecheck passed and the focused suite (tests/wait-ci, doctor, session-install, agent-instructions, cli-dispatch, cli-args) passed 436/436 on the merge."
    }
  ],
  "summary": "A fresh reviewer subagent (high risk: a blocking hook wired into every project is a shared control) cleared the change on one condition and three minor findings, in 7.67 minutes. S1 (substantive, conditional): the guard could write an untracked `local/sessions/` file into any repository the agent had `cd`'d into, including one that does not ignore `local/`; the guard now records state only where `git check-ignore` confirms the path is ignored, and allows the call without state otherwise, with a real-git test proving a foreign repository stays clean. M1: `gh run view $RUN_ID` and heredoc bodies were counted, and the refusal could suggest a `wait-ci --run '$RUN_ID'` that usage rejects; non-numeric ids and heredoc bodies are no longer counted. M2: `--sha` with a short SHA matched nothing and looked like CI never started; it is now a usage error naming `git rev-parse`. M3: `--workflow` could return the previous run's exit code straight after `gh workflow run`; an already-finished latest run without `--sha` is now held for 20 seconds and a newly listed run is followed, with docs updated. I1 (incidental): Codex will not run the new PreToolUse entry until `/hooks` trusts it in each project; trust is keyed per hook (`<file>:pre_tool_use:0:0` in `~/.codex/config.toml`), so the existing SessionStart trust is unaffected, and the step is named in the PR's open questions. No follow-up turn was needed.",
  "findings": [
    {
      "id": "S1-untracked-state",
      "severity": "substantive",
      "description": "guardRoot/guardDeps.write created local/sessions/poll-guard-<session>.json in any git repository the payload cwd pointed at, including repositories that do not ignore local/, leaving an untracked file one git add -A from being committed.",
      "paths": [
        "src/cli/wait-ci.ts",
        "src/wait-ci/poll-guard.ts"
      ],
      "disposition": "fixed",
      "response": "guardRoot now returns the primary checkout only when `git check-ignore -q -- local/sessions/poll-guard.json` succeeds there; otherwise null, so no state is read or written and the call is allowed (fail open). Location unchanged, so no doc paths were needed.",
      "condition": {
        "paths": [
          "src/cli/wait-ci.ts",
          "src/wait-ci/poll-guard.ts",
          "tests/wait-ci/poll-guard.test.ts",
          "dist/cli/wait-ci.js",
          "dist/cli/wait-ci.js.map",
          "dist/cli/wait-ci.d.ts",
          "dist/wait-ci/poll-guard.js",
          "dist/wait-ci/poll-guard.js.map",
          "dist/wait-ci/poll-guard.d.ts"
        ],
        "evidence": "A real-git test showing a repository that does not ignore local/ has no untracked file after a poll and the call is allowed; existing tests including the primary-checkout one still pass; pnpm typecheck; pnpm compile with dist committed; the focused suite (tests/wait-ci tests/doctor-instructions.test.ts tests/session-install.test.ts)."
      },
      "conditionMet": "Added 'leaves a repository that does not ignore local/ untouched, and allows every poll there' (real git init, four polls through pollGuardCommand with real guardDeps all exit 0, git status --porcelain --untracked-files=all empty); the primary-checkout and third-poll real-file tests pass with local/ ignored. pnpm typecheck passed; pnpm compile regenerated dist/cli/wait-ci.* and dist/wait-ci/poll-guard.*, committed in 301fb0b0; pnpm exec vitest run tests/wait-ci tests/doctor-instructions.test.ts tests/session-install.test.ts: 233 passed."
    },
    {
      "id": "M1-unknown-run-ids",
      "severity": "minor",
      "description": "A non-literal run id ($RUN_ID, $(gh run list ...)) was counted under one key and refused with a wait-ci --run suggestion that usage rejects; heredoc body lines were counted as polls.",
      "paths": [
        "src/wait-ci/poll-guard.ts",
        "tests/wait-ci/poll-guard.test.ts",
        "dist/wait-ci/poll-guard.js",
        "dist/wait-ci/poll-guard.js.map",
        "dist/wait-ci/poll-guard.d.ts"
      ],
      "disposition": "fixed",
      "response": "A run positional that is not all digits after URL extraction is now unknown (not counted), like the interactive picker; withoutHeredocBodies drops heredoc bodies (<<, <<-, quoted delimiters) before splitting. Tests cover both, and counting resumes after the delimiter."
    },
    {
      "id": "M2-short-sha",
      "severity": "minor",
      "description": "--sha with a short SHA matches nothing in gh run list --commit, so the wait ran out the 3-minute grace and reported that no run was found.",
      "paths": [
        "src/cli/wait-ci.ts",
        "tests/wait-ci/wait-run.test.ts",
        "dist/cli/wait-ci.js",
        "dist/cli/wait-ci.js.map",
        "dist/cli/wait-ci.d.ts"
      ],
      "disposition": "fixed",
      "response": "usageError now requires 40 hex characters and suggests git rev-parse; tests pin a 7- and a 41-character refusal and an upper-case full SHA acceptance. Verified live: a short SHA exits 3, the full SHA exits 0."
    },
    {
      "id": "M3-dispatch-race",
      "severity": "minor",
      "description": "Right after gh workflow run, --workflow --branch returned the previous run's verdict and exit code immediately because the new run was not listed yet.",
      "paths": [
        "src/wait-ci/wait-run.ts",
        "src/wait-ci/digest.ts",
        "tests/wait-ci/wait-run.test.ts",
        "architecture.md",
        "docs/runbooks/pm-workflow.md",
        "dist/wait-ci/wait-run.js",
        "dist/wait-ci/wait-run.js.map",
        "dist/wait-ci/wait-run.d.ts",
        "dist/wait-ci/digest.js",
        "dist/wait-ci/digest.js.map",
        "dist/wait-ci/digest.d.ts"
      ],
      "disposition": "fixed",
      "response": "Without --sha, a latest run that had already finished is held for ALREADY_COMPLETE_SETTLE_MS (20 s); a newer run listed in that window is followed and named, otherwise the old run is reported with a warning naming --run and --sha. Tests cover the hold (sleeps 10 s + 15 s), the immediate --sha report and the dispatched-run follow; architecture.md and pm-workflow.md say to prefer --run after gh workflow run."
    },
    {
      "id": "I1-codex-trust",
      "severity": "incidental",
      "description": "Editing .codex/hooks.json means Codex will not run the new PreToolUse entry until /hooks trusts it in each project; if trust covered the whole file the SessionStart brief would also stop silently.",
      "paths": [
        ".codex/hooks.json"
      ],
      "disposition": "fixed",
      "response": "Checked ~/.codex/config.toml: trust is recorded per hook as <file>:<event>:<group>:<hook> with its own trusted_hash, so the existing SessionStart trust survives and only the new pre_tool_use entry needs trusting. Named under Open questions in each PR and in the report to Chris; context install already prints the /hooks instruction."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "a814cd10bc96528bf",
      "commit": "e37d7f6032697fa318c94a3e08c6ed66428392e7",
      "base": "3fd8e28ee23be967fc5e15af895d2fffab007226",
      "scopeReason": "Trunk integration after clearance: merging 3fd8e28e (#547) conflicted in src/session/install.ts, the hook files, decisions and dist, and the resolution combined #547 read-hook wiring with the poll guard in one merge loop and changed four test expectations, so the reviewer inspected the combination rather than relying on trunkIntegrations alone.",
      "outcome": "cleared",
      "elapsedMinutes": 2.0215666666666667,
      "timing": {
        "source": "runner",
        "durationMs": 121294,
        "evidence": "Claude Code Agent tool result for the resumed reviewer subagent a814cd10bc96528bf (SendMessage follow-up started 2026-10-28T22:24:52Z): duration_ms=121294."
      },
      "summary": "Follow-up turn by the same reviewer, spent on the hand-resolved merge of trunk 3fd8e28e (#547, which rewrote src/session/install.ts to add PostToolUse read hooks): cleared with no findings in 2.02 minutes. It confirmed #547 read-hook behaviour is unchanged inside the shared per-marker loop, malformed events still block before any write, an unowned guard script skips only the guard, the Codex event set adds only the documented PreToolUse, Morpheus own hook files equal the merged templates (context install --check exits 0), committed dist matches source, the four changed test expectations keep trunk assertions, and the merged build refuses the third poll end to end."
    }
  ]
}
```
