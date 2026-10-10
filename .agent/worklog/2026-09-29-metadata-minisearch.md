---
roadmap: MO-26-09-24-03.27.53
agent: claude
date: 2026-09-29
---

# Metadata-aware MiniSearch follow-up

Chris asked for MiniSearch tests showing whether it gives meaningful speedups. Codex delegated
this to Claude with the earlier recommendation: test a metadata-aware MiniSearch rather than
repeat the plain control. The work stays on the same open PR, which remains unmerged with
auto-merge disabled. Earlier review records remain historical and do not cover this scope.

Trunk was 76 commits behind and merged cleanly before the context receipt. Graph tools were
unavailable: the MCP server timed out, and `codebase-memory install` again refused because other
sessions hold CBM. Those sessions were left alone. The work only touches benchmark scripts, so
no graph completeness claim is made.

## Outcome

On 24 fresh history-derived questions (12 Lakina, 12 Evo) and 144 Opus 5.5 sessions:

- Metadata prefetch was 1.23x faster than ordinary navigation, saving a median 2.10 s.
- Plain MiniSearch was 1.25x, saving 2.09 s.
- Metadata against plain was 1.04x, saving 0.31 s.

Neither prefetch arm meets the 2x-and-five-seconds bar. Question-scoped answer pass rates were
91.7% for ordinary navigation, 81.3% for plain prefetch and 85.4% for metadata prefetch. The
recommendation is not to build it. Details are in
`qa/audits/2026-09-29-metadata-minisearch.md`.

## What Was Learned

- **The ceiling is the model's reading time, not retrieval.** When metadata prefetch needed no
  tool call, a session still took a median 6.6 s against an 11.1 s baseline. That caps the
  median at about 1.7x even with perfect retrieval. Opus navigates quickly: 2.8 tool calls in
  11 s, where GPT took 20 s in the prior round.
- **The development pilot misled.** On six tuning questions, metadata looked like 1.62x overall
  and 1.31x over plain. On held-out questions it was 1.23x and 1.04x. The pilot validates the
  harness; it is not evidence.
- **A roadmap id must be one token.** Tokenized into date fields, `LK-26-08-12-21.13.00` matched
  every record from that day and lost a direct lookup. The fix is one compact token plus
  owner-first lookup.
- **Ranking sections directly hurt recall.** A section lacks the vocabulary of the record around
  it. Ranking whole records, with sections only anchoring the window, fixed that.
- **The structured answer is a tool call.** Claude's `--json-schema` answer arrives as a
  `StructuredOutput` tool call. Counting it inflated every arm's tool count by one; the harness
  now excludes it, and the publisher derives counts from events.
- **Use `--safe-mode` for isolation.** It disables CLAUDE.md, skills, plugins, hooks and MCP
  while keeping subscription auth. `--bare` would force API-key auth, which is the wrong
  billing path.
- **Overage can be verified before spending.** A one-word probe's `rate_limit_event` reported
  `overageDisabledReason: org_level_disabled`, so trials could not bill overage. The run peaked
  at 5% of the five-hour window and 37% of the seven-day window.
- **Blind graders need one rubric.** The two graders read "required facts" differently. Rather
  than override either, each supplied the other's rubric, and both are published.
- **ripgrep's `-E` flag is `--encoding`, not extended regex.** Combined with `2>/dev/null`,
  it made a labeling search silently return nothing.

## Dead Ends

- Section-only ranking and prefix matching were both screened on development questions and
  dropped.
- A first development-screen variant with unit-level ranking lowered Evo document recall from
  90% to 84%.

## Verification

- Development screens: `meta-screen.mjs` on 110 exposed questions, five configurations. The
  retriever was frozen at 20:02:58 UTC with SHA-256 `49acba8e…`.
- The held-out fixture was frozen at 20:14:41 UTC (SHA-256 `9487d118…`) before any retrieval.
  The publisher re-checks both hashes, snapshot file hashes, counterbalance order, source-valid
  passages, recomputed scores and actual alternative citations.
- 16 new tests in `tests/document-retrieval-meta.test.ts`. Mutation checks broke the
  named-record lookup, the historical prior, identifier tokenization and the bundle-budget
  guard; each broken version failed a test after the lookup fixture was strengthened.
- Privacy: the public export contains only opaque IDs, labels, hashes, timestamps and numbers.
  Questions, history, quotes, answers, grader reasons and paths stay in the ignored private
  directory.
