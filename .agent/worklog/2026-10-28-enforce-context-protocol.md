---
id: MO-26-10-28-14.08.05
title: "Enforce the context protocol in code"
date: 2026-10-28
roadmap: MO-26-10-28-14.08.05
tags: [engineering]
---

# Enforce the context protocol in code

## Why

The 2026-10-07 instruction change ("read once, refresh once, refresh again only on refusal") did
not change behaviour: refreshes per Claude session rose from 2.3 to 3.1–3.2, Codex ran 2.4–5.1, and
some agents took receipts with `cat … >/dev/null && morpheus context refresh`. With a 139 KB
`decisions.md`, every redundant refresh cost ~35k tokens or a pretend read.

## What changed

- **Idempotent refresh** (`src/session/context.ts`). Unchanged trunk and records extend the stored
  receipt (same id and `createdAt`, new `checkedAt`) and the CLI prints one line. Sentinels are
  excluded from "unchanged", so a record missing both times is not called unchanged.
- **Read evidence** (`src/session/evidence.ts`, `read-hook.ts`, `certify.ts`). A `PostToolUse` hook,
  `morpheus context record-read`, appends to `local/sessions/reads.jsonl` what a Read or shell call
  showed the model of the required records. A Read is credited by range once its returned text
  matches the disk; shell output is credited by content — runs of record lines verbatim in the
  output, at least 16 non-space characters — so `>/dev/null`, `| wc`, `cat -n` earn nothing and
  `| head` earns only what it let through. Refresh certifies a record only where this session's
  evidence covers it at its current fingerprint: the whole record without a recorded baseline,
  otherwise the hunks Git's `diff --no-index` finds against the snapshot taken with the last
  receipt (`local/sessions/<lease>.records.json`). A shortfall writes nothing and prints the
  unread ranges and the changed lines raw, with enough context to count — that output is itself
  creditable reading on the next refresh. `noteWrite` moves the snapshot with the receipt, so a
  session is not asked to read back its own `pm block` write.
- **Never a lockout.** Enforcement starts only once the hook has run and understood a result in the
  current provider session (`CLAUDE_CODE_SESSION_ID` / `CODEX_THREAD_ID`, hashed). Otherwise refresh
  certifies by assertion with a warning and the receipt records `evidence: "asserted"`; an asserted
  receipt is never the baseline a recorded one extends. `MORPHEUS_READ_EVIDENCE=off` is the declared
  escape for a hook that runs and cannot see a read.
- **Wiring.** `context install` (and so `init`) merges the hook into `.claude/settings.json`
  (`PostToolUse` matcher `Read|Bash`, plus `PostToolUseFailure` for `Bash`) and `.codex/hooks.json`
  (`PostToolUse`, no matcher, no failure event). The command is inline `sh -c`, silent, exit 0
  whatever happens. `doctor` warns on a hooks file with the shim but no read hook. `pm cleanup`
  accepts the read log and snapshot as generated. `src/cli/index.ts` routes `context record-read`
  before loading the CLI: ~93 ms against ~365 ms for a full load (median of five, loaded machine).
- Docs: `AGENTS.md` (19,769 bytes, under the 20 KB test), the scaffold template (under its 16 KB
  test), the context-freshness runbook and `architecture.md` §7.10; decision and learned entries.
  This repository's own hook files are rewired by running the built `context install`.

## What was learned, including dead ends

- **The hook payload is not what the model saw.** Transcripts show Claude Code keeping ~30,000
  characters of a large Bash result in `toolUseResult.stdout` (29,620–29,984) while the model saw a
  1,326–2,396 character persisted preview. Hence the 20 KB credit cap (8 KB and 200 lines for
  Codex, which truncates on its own smaller terms). Recorded in `learned.md`.
- **Read payload shape** came from transcripts (`{type:"text", file:{filePath, content, startLine,
  numLines, totalLines}}`) and from the 2.1.283 binary. My transcript check said the content was
  identical to the disk slice; it was not. Claude Code numbers a trailing newline as one more,
  empty line, so a Read reaching end-of-file returns the text *with* its final newline and a
  `totalLines` one above an editor's — my Python check only matched because `split("\n")` kept
  the same phantom element. The first implementation compared editor-numbered lines and discarded
  every Read that reached end-of-file, which the independent review caught (F1, below); the hook
  now compares in the tool's numbering and credits in the editor's. In the binary, `PostToolUse` sets
  `tool_response` to the tool's output object and the Bash shell env sets
  `CLAUDE_CODE_SESSION_ID` to the session id hooks receive. A non-zero Bash exit is a failed tool
  call (`PostToolUseFailure`, text in `error`), which is why the failure event is wired:
  `context refresh` exits 1 exactly when it prints lines to read.
- **Codex** supports `PostToolUse` with `tool_input`/`tool_response` (schema in the 0.163.0
  binary) but its shell payload shape and tool names are undocumented; the hook accepts a string or
  `stdout`/`output`/`aggregated_output`/`formatted_output`, and anything else is "not understood",
  which keeps the session on the assertion rather than refusing reads it could not see.
- **Dead end: live verification.** A nested headless `claude -p` in a probe project with a
  payload-dumping hook failed with "OAuth session expired and could not be refreshed", with and
  without the desktop host's auth environment; logging in is not something an agent does. Codex
  would need its hook trusted in the user's Codex config, which this task did not touch. So the
  hook was verified by piping realistic payloads through the exact command string written into
  `.claude/settings.json` with the built CLI on `PATH` (Read 1–50 credited, `>/dev/null` not,
  `sed -n '60,90p'` credited 60–90), not by a live provider session.
- First attempt at `creditRuns` skipped a run whenever the previous output and record lines were
  equal, which silently dropped every run preceded by a matching blank line; replaced with a
  per-diagonal coverage map before any test ran against it.
- The claim flow: `pm claim` prepared a temp worktree this isolated agent could not use, so the
  prepared worktree was removed, the intake file moved back, and this worktree detached at trunk to
  claim directly — the path the runbook names for an isolated detached worktree.

## Test plan

- `pnpm exec vitest run tests/session-evidence.test.ts` — 38 tests after the review fixes: ranges at boundaries, content
  credit (`cat`, `>/dev/null`, `| head -1`, `| tail -1`, `cat -n`, the 16-character boundary both
  sides, tiny records, leading blank lines), log damage counted, hook payloads (Read, symlinked
  `CLAUDE.md`, content mismatch, the 20,000-byte cap at exactly the cap and one byte over, the
  failure event, Codex cap, unknown shapes, a repo not ignoring `local/`), evidence modes, and
  refresh against a real bare remote (unchanged → extended; changed → refused until the new hunks
  are read; partial ranges add up with the gap named; asserted never extended; fallback; own writes;
  evidence across worktrees; CLI output → failure-event credit → certify → extend).
- Mutation check: seven guards broken one at a time (asserted-baseline guard, sentinel exclusion,
  Read content check, liveness gate, run threshold, cap boundary, fingerprint match); all seven
  killed by the suite.
- `pnpm exec vitest run tests/session-install.test.ts tests/worktree-cleanup.test.ts
  tests/agent-instructions.test.ts tests/session.test.ts tests/session-gate.test.ts
  tests/session-start.test.ts tests/init.test.ts tests/doctor.test.ts tests/cli-dispatch.test.ts`
  — direct dependents.
- `pnpm test` once (this touches `src/session/` and `src/init/templates.ts`): 3,516 passed; the six
  failures are all `tests/workflow-expressions.test.ts`, which needs a local `actionlint` binary
  (CI installs it).
- `pnpm typecheck`, `pnpm compile`, `pnpm morpheus pm index` (unchanged), `pm validate`.
- On this repository: the built `context refresh` printed the assertion warning (no hook in this
  session) and a second run printed `Context unchanged since … Receipt extended; nothing to
  re-read.`

## Open questions

- The first live Claude session after this merges is the real verification of the payload shapes
  and the failure event. If refresh there reports "no read hook has recorded a tool result" after
  reads, the hook is not firing or not understood.
- Codex enforcement depends on its undocumented shell payload; until a trusted Codex session shows
  credited reads, Codex sessions stay on the assertion with a warning.
- Providers inject `AGENTS.md`/`CLAUDE.md` without a tool call, so the hook cannot see it and every
  enforced session must Read it (~20 KB) once. Instructions now say so (F2). Whether to credit the
  injected copy instead — e.g. from the session-start hook's fingerprint — is a narrow exception to
  the settled "startup never certifies reading" decision, so it is Chris's call, not taken here.

## Review

A fresh reviewer found one substantive and two minor defects. F1: Claude Code counts a trailing newline as an extra empty line, so every Read reaching end-of-file failed the content check and earned nothing while the session stayed in enforcement mode; cleared under a condition the author met in f4d3bb34 by comparing in the tool's numbering, fixing the fixture shape and adding whole-file, tail, exactness and refresh tests. F2: AGENTS.md is injected without a tool call, so an enforced session is refused once for CLAUDE.md; the instructions now name it, and crediting the injected copy is an open question for Chris. F3: the refusal now names the shell-output credit limit and the MORPHEUS_READ_EVIDENCE=off escape. No follow-up turn was needed.

In more detail (record ids `RV-F1`–`RV-F3`): the reviewer (Claude Code subagent `a3ace64aaa978f7c6`, high risk, 634,309 ms by the runner)
reviewed `b941a2b4` and returned one substantive and two minor findings, outcome complete. F1:
Claude Code counts a file's trailing newline as an extra empty line, so every Read reaching
end-of-file failed the content check and earned nothing, while the session was still in
enforcement mode — a lockout on the tail where new decisions are appended; the fixture hid it by
omitting the trailing newline. The reviewer reproduced it with the committed `dist/` and cleared it
under a condition, which I met in `f4d3bb34`: the hook compares in the tool's numbering, the fixture
sends the real end-of-file shape, and new tests cover a whole-file Read, a tail Read, one-newline
exactness and a refresh certified from whole-file Reads (38/38; the old comparison re-applied fails
them). F2 (minor): an agent following `AGENTS.md` is refused once for `CLAUDE.md`, which providers
inject without a tool call; `AGENTS.md` and the scaffold now name it in the first read, and whether
to credit the injected copy is left as an open question for Chris. F3 (minor): the refusal now
states the 20 KB (8 KB Codex) shell-output limit and names `MORPHEUS_READ_EVIDENCE=off` for a hook
that demonstrably cannot see a read, instead of pointing at `install --check`, which cannot detect
that. No follow-up turn was needed.

```morpheus-review
{
  "version": 2,
  "base": "0887908f77cc20abf46c6c4a9ed45ec5dbfc3b80",
  "reviewed": "b941a2b45083b285cefcb7864ee1b06e5c0c7826",
  "covered": "f4d3bb345cabf3cae8137338a37aa28f2b38e4e0",
  "authorSession": "claude-code-subagent/a942690a268aa6493",
  "reviewerSession": "claude-code-subagent/a3ace64aaa978f7c6",
  "risk": "high",
  "elapsedMinutes": 10.571816666666667,
  "timing": {
    "source": "runner",
    "durationMs": 634309,
    "evidence": "Agent tool result for reviewer subagent a3ace64aaa978f7c6: duration_ms=634309 (author clock 21:51:21Z to 22:03:36Z)."
  },
  "outcome": "complete",
  "trunkIntegrations": [
    {
      "commit": "4e5436c8b28f6d3303e032b0b85158ae3f83a849",
      "reason": "Merged origin/main (430fa10e, c8166dd7) after coverage. The only hand resolution was .agent/decisions.md, where both sides appended an entry at the end: trunk's blocked-CD-analysis entry kept first, this PR's context-refresh entry after it, both verbatim. No source conflict; pnpm compile left dist unchanged."
    },
    {
      "commit": "69daaec61c3f15d9da24390a97417aa575ca3cfe",
      "reason": "Merged origin/main (fda2d34b, 2ad160e9) after CI went green, because the PR had become unmergeable. The only hand resolution was .agent/learned.md, where both sides appended an entry at the end: trunk's blob-id diff entry kept first, this PR's hook-payload entry after it, both verbatim. Trunk's runbook and architecture edits merged without conflict in other sections; pnpm compile left dist unchanged and the 52 focused evidence and instruction tests pass."
    }
  ],
  "summary": "A fresh reviewer found one substantive and two minor defects. F1: Claude Code counts a trailing newline as an extra empty line, so every Read reaching end-of-file failed the content check and earned nothing while the session stayed in enforcement mode; cleared under a condition the author met in f4d3bb34 by comparing in the tool's numbering, fixing the fixture shape and adding whole-file, tail, exactness and refresh tests. F2: AGENTS.md is injected without a tool call, so an enforced session is refused once for CLAUDE.md; the instructions now name it, and crediting the injected copy is an open question for Chris. F3: the refusal now names the shell-output credit limit and the MORPHEUS_READ_EVIDENCE=off escape. No follow-up turn was needed.",
  "findings": [
    {
      "id": "RV-F1",
      "severity": "substantive",
      "description": "src/session/read-hook.ts compared editor-numbered lines with the Read result, but Claude Code numbers a trailing newline as one more empty line, so a Read reaching end-of-file returns the text with its final newline and every such Read was discarded while the session stayed in enforcement mode.",
      "paths": ["src/session/read-hook.ts", "tests/session-evidence.test.ts"],
      "disposition": "fixed",
      "response": "Compare the returned content against the record split in the tool's own numbering, then clamp the credited range to editor lines. The fixture now emits the real end-of-file shape.",
      "condition": {
        "paths": [
          "src/session/read-hook.ts",
          "tests/session-evidence.test.ts",
          "dist/session/read-hook.js",
          "dist/session/read-hook.js.map",
          "dist/session/read-hook.d.ts",
          ".agent/worklog/2026-10-28-enforce-context-protocol.md"
        ],
        "evidence": "readPayload emits the real end-of-file shape; tests credit a whole-file Read and a tail Read reaching end-of-file and still refuse a content mismatch; a refresh certifies from whole-file Reads of every record; vitest session-evidence, typecheck and compile with dist matching."
      },
      "conditionMet": "In f4d3bb34: readPayload sends content with the trailing newline and totalLines one above the editor count; added whole-file, tail, exactly-one-newline and whole-file-refresh tests; pnpm exec vitest run tests/session-evidence.test.ts passed 38/38; pnpm typecheck passed; pnpm compile regenerated dist/session/read-hook.js and its map, committed with the source. Re-applying the old comparison fails the new tests."
    },
    {
      "id": "RV-F2",
      "severity": "minor",
      "description": "Providers inject AGENTS.md/CLAUDE.md without a tool call, so an agent following AGENTS.md (read decisions, learned, inbox, refresh) is always refused once for CLAUDE.md in enforcement mode.",
      "paths": ["AGENTS.md", "src/init/templates.ts", "dist/init/templates.js", "dist/init/templates.js.map", "tests/agent-instructions.test.ts"],
      "disposition": "fixed",
      "response": "AGENTS.md and the scaffold template now list AGENTS.md in the first read and say why; tests assert the wording in both. Crediting the injected copy instead would be an exception to the settled startup-never-certifies decision, so it is raised as an open question rather than taken."
    },
    {
      "id": "RV-F3",
      "severity": "minor",
      "description": "The refusal suggested sed without the 20 KB credit limit and pointed at context install --check, which cannot detect a wired hook that misreads results; the documented escape appeared only in the runbook.",
      "paths": ["src/cli/context.ts", "dist/cli/context.js", "dist/cli/context.js.map", "tests/session-evidence.test.ts"],
      "disposition": "fixed",
      "response": "The refusal now states the 20 KB (8 KB Codex) limit and to read large records in ranges, and names MORPHEUS_READ_EVIDENCE=off only for reads demonstrably not counted; the CLI output test asserts both lines."
    }
  ]
}
```
