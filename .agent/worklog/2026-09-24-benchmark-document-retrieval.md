---
roadmap: MO-26-09-24-03.27.53
agent: codex
date: 2026-09-24
---

# Benchmark document retrieval before adopting QMD

Chris requested 30 representative questions each for Lakina and Evo, comparing
speed and recall with and without QMD, published as an **open** Morpheus PR.
This authoring task is isolated from both private repositories. No integration,
production deployment, adoption decision, or merge is part of this request.

## Method

The protocol and question/evidence fixture were frozen before scored searches.
Private Markdown snapshots contain 702 Lakina and 437 Evo documents. The fixture
has 60 questions and 63 required evidence groups, with predeclared alternative
sources. Queries cover exact identifiers, concepts, historical failures, changed
decisions, and operational documentation, six of each per project.

Compare five pinned QMD 2.8.3 search modes and 120 fresh, paired Codex sessions.
The paired test compares ordinary file navigation with ordinary navigation plus
QMD's native MCP tools. It isolates document discovery, not code-graph navigation
or implementation throughput. The corpus is unchanged between arms.

Because Morpheus is public, raw questions, quotes, private paths and transcripts
remain local. The exporter uses an explicit public-field allowlist. Published
measurements contain opaque question IDs, categories, hashes, metrics and corpus
revisions. Exact reproduction requires the private fixtures.

## Setup Lessons

- A read-only shell cannot open QMD's SQLite/WAL database. The non-scored setup
  probe failed explicitly. Use QMD's own MCP server rather than relax the shell
  sandbox or build a custom search service.
- Fresh worktree codebase-memory verification reported no exact-checkout index.
  The prescribed repair could not activate while existing MCP sessions held the
  installation. No structural code discovery was needed for this docs-only study;
  this is not evidence about the graph's retrieval speed or completeness.
- The first focused test command found no tests because this repository includes
  only TypeScript test filenames. Renamed the new tests to the existing convention
  and supplied declarations for the standalone JavaScript scorer. Fourteen focused
  scoring, privacy-export and incomplete-run tests then passed.
- Use separate database copies for the engine modes, and distinguish document-level
  hits from section-level evidence. Crediting an entire monolithic decisions file
  can hide retrieval failures.

## Results

All 300 SDK searches and 120 fresh agent sessions completed without errors or
timeouts. Ordinary navigation achieved 100% frozen section recall in each project.
The augmented arm achieved 96.7% strict recall in each, with one valid alternative
source per project omitted from the frozen gold labels. Those author-adjudicated
cases are reported separately; original scores remain unchanged. Audited evidence
coverage is 100% in both arms. Median paired QMD completion overhead was 1.88 seconds
for Lakina and 2.87 seconds for Evo. This sample does not support default adoption.

The sample favors canonical, settled records and underrepresents worklog-only
history. Engine top-k alternatives were not exhaustively adjudicated, so labeled
document recall cannot prove vector retrieval's semantic quality is lower. Further
evaluation should target difficult real questions with independent judgments.

The identifier diagnostic found that the installed QMD sanitizer removes mixed
hyphen/dot punctuation from roadmap IDs. Space-separated tokens recovered all
twelve targets; frozen keyword queries recovered none. Original scores were not
replaced with the post-hoc diagnostic.

Private fixtures, snapshots, transcripts and the author audit are archived under
the main checkout's Git-ignored `local/benchmarks/2026-09-24-document-retrieval/`.
The archive retains original invocation paths for provenance; archived SQLite
collection paths must be reindexed if reproducing from a relocated directory.
Nothing from that private archive is committed.

## Verification

- `node .../audit.mjs PRIVATE_ROOT`: 120 runs, zero invalid source quotes, zero
  QMD mode violations, no other MCP calls. Inspected the two unlabeled alternatives.
- Audited 390 shell commands for parent-fixture, live-repository, credential and
  external-action access patterns; no suspicious matches. The corpus boundary
  remains a prompt restriction, not a hardened confidentiality guarantee.
- Exporter verified fixture hash, 300/120 complete unique cells and unchanged
  snapshot bytes. Scanned all 19 staged files against private questions, gold
  passages, non-generic source paths and private roadmap ID patterns: zero leaks.
- Focused benchmark tests: 16 passed, including exact scoring boundaries, failure
  denominators, fixture drift, export allowlisting and post-hoc separation.
- `pnpm typecheck`: passed.
- `pnpm test`: 51 files, 1,396 tests passed (including the invoked Python suite).
- `pnpm compile`: passed, no generated-output changes.
- `pnpm lint`: passed.
- `pnpm morpheus pm index`: passed; all three indexes unchanged.
- `git diff --cached --check`: passed.

## Independent Review

Independent review completed with no findings. The fresh reviewer recomputed all
120 strict citation scores, verified all source quotations and 420 public rows
against private raw evidence, checked fixture/protocol and corpus fingerprints,
confirmed both alternative-source adjudications, and found no private content in
the changed public files. Sixteen focused tests passed. No author fixes or follow-up
were needed. The reviewer did not rerun the full suite or costly experiment and
used exact diff/source fallback because graph access was unavailable.

```morpheus-review
{
  "version": 1,
  "base": "92f3e627920e8ff1cc8d1d591f9ea89c422e1fe6",
  "reviewed": "9eb732db55e01d1fc0f2c4847291a7df0bc90039",
  "covered": "9eb732db55e01d1fc0f2c4847291a7df0bc90039",
  "authorSession": "01a0cfbb-30cd-7873-8cae-1f3977f28221",
  "reviewerSession": "01a0d35e-bddc-7ce2-b09e-76d686eea367",
  "risk": "normal",
  "elapsedMinutes": 4.72,
  "outcome": "complete",
  "summary": "Independent review completed with no findings. The fresh reviewer recomputed all 120 strict citation scores, verified all source quotations and 420 public rows against private raw evidence, checked fixture/protocol and corpus fingerprints, confirmed both alternative-source adjudications, and found no private content in the changed public files. Sixteen focused tests passed. No author fixes or follow-up were needed. The reviewer did not rerun the full suite or costly experiment and used exact diff/source fallback because graph access was unavailable.",
  "findings": []
}
```

The spawn response exposed only the canonical agent path. Its persisted runner
session metadata maps `/root/independent_review` to the UUID above, confirms this
task as its parent, and records a 283,126 ms review duration. The local gate rejected
the path label; the record now uses that verified runner UUID. History inheritance
was disabled. [PR #265](https://github.com/cpheinrich/morpheus/pull/265) remains open
with auto-merge disabled, as requested. Code and project-record CI passed on the
reviewed commit; the final worklog publication also triggers the review gate.
