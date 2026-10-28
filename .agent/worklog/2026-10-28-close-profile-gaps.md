---
id: MO-26-10-28-14.11.57
title: "Close profiling measurement gaps: archived Codex sessions and review waivers"
date: 2026-10-28
tags: [engineering]
---

# Close profiling measurement gaps

## Why

A tranche of workflow fixes is about to be measured with `morpheus profile`. Re-extracting
2026-10-09 to 10-21 found zero Evo Codex main sessions where a run on 10-22 had found fourteen,
and the trivial-diff review-floor waiver (#365) left no trace, so how often it fires could not be
counted.

## What was actually wrong with Codex history

The brief assumed the sessions had been moved to `~/.codex/archived_sessions/`. Looking at the
directories first showed the larger cause: Codex compresses older rollouts **in place** to
`.jsonl.zst`. On this machine `sessions/` held 32 plain and 746 compressed rollouts — every day from
10-09 to 10-19 was entirely `.zst` — and the profiler's walk matched only `*.jsonl`. The archive
(317 files, all `.zst`, a flat directory, same rollout format) held only two October sessions, so
reading it alone would not have recovered the missing fortnight. No session id currently appears in
both places, but Codex can resume an archived session, so dedupe is still required.

Measured on this machine, `--since 2026-10-09 --repo evo`: 38 sessions (14 main) before, 102 (36
main) after, of which 70 Codex (25 main), all from `codex-sessions`.

## What changed

- `src/profile/extract.ts` walks `sessions/` and `archived_sessions/` for `.jsonl` and `.jsonl.zst`,
  decompressing with Node's built-in `zlib` zstd (a namespace import, so Node before 22.15 reports
  each compressed file as unreadable instead of failing to load the module). Codex copies are
  collected by session id; the copy written last (then the one with more requests, then tool calls)
  is kept, and `Extraction.duplicates` counts extra copies of in-scope sessions.
- Every `SessionRow` carries `source` (`claude`, `codex-sessions`, `codex-archived`). The report adds
  a **Sources** table listing every source even when empty, the duplicate count, and a **By
  provider** table; `--json` carries `bySource`, `duplicates` and `byProvider`.
- Skipped lines are summarised by message with each file (home shortened to `~`) and its line
  numbers, at most five files and five lines each, instead of `N × unparseable JSON`.
- The floor waiver: `validateReviewRecord` returns the waivers it applied, `verifyReviewRecord`
  returns `{ record, waivers }`, and `checkLocalReview` reports each as a `waived` finding under a new
  rule, `review-floor`. `check pr` prints `~ [review-floor] waived: review floor (trivial diff: N
  non-test, M test lines)`; `review validate` prints `~ waived: review floor (…)`.

## Why printing and not a record field

CI logs keep the line at the time, which covers the measurement now planned. Retroactively, the
waiver is a pure function of the committed record (risk, turn durations) and the Git range from
`base` to `covered`, so it can be recomputed for any merged PR; a field the author writes would
duplicate that and contradict the settled rule that the author never declares the size. A read-only
scan of the local checkouts' committed records found 0 of 194 Morpheus, 1 of 342 Evo
(`EV-26-10-07-22.12.42`, 22 s, which predates the waiver) and 0 of 183 Lakina records that validate
only through the waiver — local checkouts, so possibly behind their remotes.

## A consequence found while wiring it

`checkLocalReview` returning a non-empty list for a valid record would have broken two callers that
use it as a validity oracle: the GitHub Manager's `authorRecordProblem` treated any `waived` finding
as the `review.required=false` opt-out, and CD `verifyRepair` required zero findings. Both now
ignore only the `review-floor` rule, so an opt-out is still refused and a validated record that
relied on the floor is still accepted. Tests pin both directions, and each was mutation-checked:
reverting either filter fails its test.

## Test plan

- `pnpm vitest run tests/profile` — 124 passed. New: archived fixture overlapping live C1 counted
  once with the live copy kept; a swapped layout keeps the fuller archived copy; zstd-compressed
  live and archived rollouts extract identically to plain text; a corrupt `.zst` is an issue, not
  an abort; duplicates count only in-scope sessions; per-source and per-provider report figures;
  issue summaries name files and lines.
- `pnpm vitest run tests/local-review.test.ts -t "floor|review validate|opt-out"` — 47 passed.
  New: the check-pr waiver line at exactly 20 non-test plus 40 test lines, and absent at 21/40 and
  20/41; nothing printed when the floor was met or at small risk; `review validate` prints the line
  only when the waiver applied; `authorRecordProblem` accepts a waived-floor record.
- `pnpm vitest run tests/cd/repair-checks.test.ts` — 65 passed, including a floor-waiver-only record
  accepted and an opt-out still refused.
- Mutation checks, each reverted: matching only `.jsonl` (2 tests fail), always replacing a
  duplicate (2 fail), counting out-of-scope duplicates (1 fails), the unnarrowed gh-manager waiver
  check (1 fails), the unfiltered CD invariant (1 fails).
- `pnpm typecheck`, `pnpm lint`, `pnpm compile`, `pnpm morpheus pm index` pass.
- Full `pnpm test` once, on a machine running other agents: 3486 passed, 10 failed in three files
  this change does not touch the logic of. `tests/workflow-expressions.test.ts` (6) needs
  `actionlint`, which is not installed here. `tests/cd/native-worker.test.ts` (3, a `calls.jsonl`
  not yet written) and `tests/upload-receipt.test.ts` (1, a 30 s timeout) are timing-sensitive;
  both files pass in isolation, 71 of 71. CI is the signal for those, not this laptop.
- Real data: `pnpm morpheus profile report --since 2026-10-09 --repo evo` against this machine's
  transcripts, numbers above; it also named the one live rollout with five unparseable lines.

## Independent review

Fresh independent review (high risk: the review gate, the GitHub Manager's recovery check and the CD repair gate) completed on f4e5c6d3 with one minor finding and nothing substantive. The reviewer traced every caller of checkLocalReview, confirmed an opt-out is still refused and a floor-waived record still accepted by both consumers, checked the 20/40 boundary tests, matched dist against a scratch compile, and ran the profiler over every transcript on this machine (1454 files, 1063 compressed, none unreadable). The finding, R1, was a named zstd import in the profile tests that would fail the whole file on Node 22.0 to 22.14; it is fixed at ab854f60 by a namespace import and skipping only the test that needs zstd.

The reviewer measured its own turn by clock (21:32:18Z to 21:38:56Z, 398 s); the record uses the runner's `duration_ms` for the whole invocation, which is the larger figure. Dedupe is exercised only by fixtures: no session id is currently in both Codex directories on this machine.

```morpheus-review
{
  "version": 2,
  "base": "e4fd7b585633f3eaf163121fffe4c8a8ce133978",
  "reviewed": "f4e5c6d38b92e33bcb90fd9818c88bd6cba662a9",
  "covered": "ab854f600d107871ca9a6c941928bc6e8d2e3838",
  "authorSession": "claude-code-subagent/a646f585f5507c3cc",
  "reviewerSession": "claude-code-subagent/af5a1517268ed1f80",
  "risk": "high",
  "elapsedMinutes": 7.054383333333333,
  "timing": {
    "source": "runner",
    "durationMs": 423263,
    "evidence": "Agent tool result for reviewer af5a1517268ed1f80: duration_ms 423263, dispatched after author clock 2026-10-28T21:32:00.126Z; the reviewer's own clock readings were 21:32:18Z to 21:38:56Z (398000 ms)."
  },
  "outcome": "complete",
  "summary": "Fresh independent review (high risk: the review gate, the GitHub Manager's recovery check and the CD repair gate) completed on f4e5c6d3 with one minor finding and nothing substantive. The reviewer traced every caller of checkLocalReview, confirmed an opt-out is still refused and a floor-waived record still accepted by both consumers, checked the 20/40 boundary tests, matched dist against a scratch compile, and ran the profiler over every transcript on this machine (1454 files, 1063 compressed, none unreadable). The finding, R1, was a named zstd import in the profile tests that would fail the whole file on Node 22.0 to 22.14; it is fixed at ab854f60 by a namespace import and skipping only the test that needs zstd.",
  "findings": [
    {
      "id": "R1-zstd-import",
      "severity": "minor",
      "description": "tests/profile/extract-report.test.ts imported zstdCompressSync by name from node:zlib; package.json allows Node >=22 but zstd exists only from 22.15, so on 22.0-22.14 the import fails at link time and every extract and report test in the file is lost, not just the zstd one.",
      "paths": ["tests/profile/extract-report.test.ts"],
      "disposition": "fixed",
      "response": "Imported zlib as a namespace, as the source does, and wrapped only the compression-equivalence test in it.skipIf(!zstdCompressSync). The corrupt-file test still runs on an older Node, where the extractor reports the file as unreadable for lack of zstd. 124 profile tests pass at ab854f60."
    }
  ]
}
```
