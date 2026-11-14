---
roadmap: MO-26-09-24-03.27.53
agent: codex
date: 2026-09-25
---

# Historical-chat retrieval follow-up

Chris requested one more optimization round using historical chat requests to
make the questions representative of actual work. This is an explicitly expanded
research scope on the same open PR; earlier reviews remain historical and do not
approve the new deliverable.

Read available Evo Codex task messages and top-level Claude user messages.
Two native task reads failed; one long task required pagination. No unrelated
personal chats were inspected. Thirty derived retrospective documentation
questions were frozen before source labeling, with original requests and task
provenance retained only in the ignored private experiment directory.

The experiment retains the prior frozen 437-file Evo documentation snapshot.
Its new protocol is qa/benchmarks/document-retrieval/history-protocol.md.
No production configuration, private project changes or frontend are authorized.

Graph tools remain unavailable. The local CLI's prescribed installation repair
again refused because active CBM sessions could not be stopped safely; those
sessions were left alone. Research uses exact benchmark and pinned upstream
source files without claims of graph completeness.

For the non-QMD control, reused the existing MiniSearch 7.2.0 package rather than
writing a search engine. Registry verification found zero runtime dependencies
and the published 7.2.0 release dated 2025-09-16. This is a research-only comparator,
not a new dependency or a production adoption decision. The custom code is limited
to corpus-specific presentation, experiment orchestration, scoring and redaction.

Completed forty backend measurements, thirty development agent trials and 160
validation trials. The validation had no timeouts, invalid source quotations or
database errors. Retained the development CLI timeout. All 190 final outcomes were
manually audited against source; a publication guard caught an incorrect alternative
group index in the private audit, corrected to the existing group without changing
the evidence or trial. The frozen labels remain untouched.

Warm vector prefetch improved paired completion 1.34x / 5.35 seconds versus ordinary
navigation, but only 1.10x / 1.69 seconds versus the preceding CLI recipe on the same
questions. MiniSearch prefetch achieved 1.33x / 5.74 seconds. Neither meets the median
2x hurdle. Main audited evidence recall was 96.25% baseline/CLI, 92.50% vector and
97.50% MiniSearch. Large adjustments from narrow frozen labels and ambiguity-sensitive
answer judgments are disclosed; excluding both sensitive questions does not produce
a 2x result. No production integration or frontend was added.

Private questions, chat provenance, source paths, audit reasons and transcripts remain
in ignored local storage. Published exports contain only opaque IDs and allowlisted
numeric/hash metadata. The exporter verifies all corpus hashes, complete cells,
counterbalance order, source-valid passages and actual alternative citations.

Verification: `pnpm typecheck` passed; `pnpm test` passed all 1,445 tests in 57 files,
including fifteen new history-retrieval tests; `pnpm compile` passed with no generated
changes; `pnpm morpheus pm index` left indexes unchanged. Merged the documentation-only
trunk update before review, with no conflicts. Its auto-update hook refused the dirty
checkout without installing anything. The study discloses concurrent light authoring
and shared-host activity rather than claiming an isolated timing environment.

## Independent Review

Independent review found one minor failure-retention issue: a prefetch rejection could disappear when the runner restarted. The author fixed only the named runner, publisher and test paths, added restart/publication regressions, and verified both historical exports remained byte-identical. The reviewer permitted this bounded minor fix without a follow-up; no substantive findings or disagreements remain. Review recomputed aggregates and checked 40 sampled answers, freeze/split evidence and privacy, but did not independently label every answer or rerun paid trials; graph tools were unavailable.

Post-fix verification: `pnpm typecheck` passed; `pnpm test` passed 1,448 tests in
57 files. All 26 focused history/timing tests passed. Both regenerated historical
exports matched committed bytes. The PR remains open, with auto-merge disabled.

```morpheus-review
{
  "version": 1,
  "base": "59eedf1af445db6f587aa0822aedff52e88dae2a",
  "reviewed": "272f3917efe6c565c3475c7d9e17683470c233fe",
  "covered": "4c336c3e4384dccf82062a9be826c3c767af7a10",
  "authorSession": "01a0cfbb-30cd-7873-8cae-1f3977f28221",
  "reviewerSession": "01a0da74-12bb-7222-a08b-b561a04dbe2b",
  "risk": "normal",
  "elapsedMinutes": 4,
  "outcome": "complete",
  "summary": "Independent review found one minor failure-retention issue: a prefetch rejection could disappear when the runner restarted. The author fixed only the named runner, publisher and test paths, added restart/publication regressions, and verified both historical exports remained byte-identical. The reviewer permitted this bounded minor fix without a follow-up; no substantive findings or disagreements remain. Review recomputed aggregates and checked 40 sampled answers, freeze/split evidence and privacy, but did not independently label every answer or rerun paid trials; graph tools were unavailable.",
  "findings": [
    {
      "id": "H1-prefetch",
      "severity": "minor",
      "description": "Reviewer H1: retrieval rejection occurred before a trial result was persisted, allowing an unrecorded retry on restart.",
      "paths": [
        "qa/benchmarks/document-retrieval/timed-agents.mjs",
        "qa/benchmarks/document-retrieval/publish-history.mjs",
        "tests/document-retrieval-history.test.ts",
        "tests/document-retrieval-timing.test.ts"
      ],
      "disposition": "fixed",
      "response": "The runner now persists an error cell and empty events before rethrowing. Restart skips the retained cell. Publication accepts absent passages only for explicitly failed prefetch, assigns zero evidence quality and counts prefetch database errors. No measured result was affected.",
      "condition": {
        "paths": [
          "qa/benchmarks/document-retrieval/timed-agents.mjs",
          "qa/benchmarks/document-retrieval/publish-history.mjs",
          "tests/document-retrieval-history.test.ts",
          "tests/document-retrieval-timing.test.ts"
        ],
        "evidence": "A regression must prove rejection is retained and not replaced on restart; publication must accept that failed cell with zero quality while rejecting a completed cell without prefetch; historical exports must remain byte-identical."
      },
      "conditionMet": "At 4c336c3, all 26 focused history/timing tests passed, including all required rejection, restart and publication assertions. Regenerated measurements.json and summary.json are byte-identical. Typecheck passed and the full suite passed 1,448 tests in 57 files."
    }
  ]
}
```
