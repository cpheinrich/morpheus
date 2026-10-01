# Metadata-aware MiniSearch on fresh Lakina and Evo questions

Fourth round of the [document retrieval study](2026-09-24-document-retrieval.md), following
the [historical-query round](2026-09-25-qmd-historical-queries.md). That round's plain
MiniSearch prefetch was the cheapest competitive option, at 1.33x and 5.74 s saved on Evo.
This round tests whether making that lexical prefetch aware of record metadata turns it
into a substantial speedup.

## Answer

**No.** On 24 fresh history-derived questions, 12 per project, with 144 Claude Opus 5.5
sessions:

| Held-out workflow | Median completion | p95 | Median paired speedup | Median paired saving | Audited evidence recall | Answer pass (question-scoped) |
|---|---:|---:|---:|---:|---:|---:|
| Ordinary navigation | 11.09 s | 17.62 s | Reference | Reference | 94.79% | 91.7% |
| Plain MiniSearch prefetch | 9.58 s | 14.08 s | 1.25x | 2.09 s | 95.83% | 81.3% |
| Metadata MiniSearch prefetch | 9.13 s | 14.12 s | 1.23x | 2.10 s | 94.79% | 85.4% |

Paired directly against plain prefetch, metadata was **1.04x faster, saving 0.31 s**, and was
faster on 27 of 48 pairs. Neither prefetch arm meets the adoption bar of median 2x and five
seconds saved. Metadata prefetch also misses the 95% recall floor by one group, and both
prefetch arms answered fewer questions correctly than ordinary navigation. The metadata
work produced a modest retrieval-quality gain on Evo and none on Lakina. It does not change
what an agent session costs.

**Recommendation:** do not build a metadata-aware MiniSearch integration for speed. On these
workloads the time goes to the agent reading and answering, not to finding the source.

## What Was Built

[`meta-retrieval.mjs`](../benchmarks/document-retrieval/meta-retrieval.mjs) keeps MiniSearch
7.2.0, which is already a repository dependency, and the same passage budget as the plain
control: 12,000 characters. The retriever:

- Keeps roadmap identifiers such as `EV-26-09-24-14.24.09` as a single token, and puts a
  record the question names first. Tokenized into date fields, an identifier matched every
  record written that day.
- Indexes frontmatter titles and summaries, headings, identifiers, path words and body text
  as separate boosted fields.
- Ranks whole records, combining document- and section-level scores. Heading or bold-lead
  sections of long records such as `decisions.md` and `learned.md` only anchor the
  window. Ranking sections directly lost recall, because a section lacks its record's
  vocabulary.
- Labels each passage with its record type, date, status and identifier.
- Adds up to two linked records within the budget: a worklog's roadmap item, or a roadmap
  item's newest worklog.
- Classifies each question as current-state or historical. Current questions weight decisions,
  documentation and roadmap items and add a small recency term, and they discount superseded
  statuses. Historical questions weight worklogs and apply no recency term, so a newer record
  is not automatically preferred.

Only the passages and one sentence that explains the passage fields differ from the plain
arm. The whole index builds in 0.29 s for Evo and 0.44 s for Lakina, against 0.15 s and
0.20 s for plain. Retrieval takes a median 12 ms in-trial, against 10 ms for plain.

## Protocol

The [protocol](../benchmarks/document-retrieval/meta-protocol.md) records the order:

1. **Development.** Tuning used only questions whose labels were already exposed: 30 Lakina
   and 30 Evo authored questions, 20 Evo tuning-holdout questions and 30 Evo history-derived
   questions. All ran against the earlier frozen snapshots of 702 and 437 documents. Five
   configurations were screened. The retriever was frozen by SHA-256 at 20:02:58 UTC.
2. **Model choice.** Opus 5.5 at high effort was fixed as the primary model before any Opus
   timing was seen, because it is the model normally used for Claude sessions here. A six-question
   Sonnet 5.5 pilot had already shown that Sonnet baselines take about 7 s, which leaves almost
   no room for a five-second saving.
3. **Held-out questions.** User requests from local Codex and Claude histories, dated
   2026-09-24 to 2026-09-29, came from 28 threads and 137 messages. These postdate every
   earlier question pool. Twelve questions per project were written from them, covering
   requirements, causes, decisions and current state: meal sharing, TestFlight failures, CI
   runtime, test policy, HealthKit sync, broker operations, research storage and backtests.
   Required facts and evidence passages, including equivalent alternatives, were labelled
   from current trunk snapshots: Lakina with 802 documents and 2.85 MB, Evo with 527 documents
   and 2.05 MB. They were frozen at 20:14:41 UTC, before any retrieval touched them.
4. **Trials.** The design was 24 questions, three arms and two counterbalanced repeats. Each
   session was fresh and non-persistent: `claude -p --safe-mode` in a read-only corpus copy,
   with CLAUDE.md, skills, plugins, hooks and MCP disabled. Every arm had the same tools
   (Bash, Read, Grep, Glob), answer schema, 80-word limit and 120 s cap. Completion time runs
   from before retrieval to process exit.
5. **Audit.** Two separate Claude grader subagents, one per project, judged answers and
   alternative citations. They could not see the arm, repeat, order or timing.

The earlier rounds ran on Codex and GPT. This round had to avoid additional Codex benchmark
usage, so it used Claude on the Max subscription. The harness verified `claude.ai`
authentication, confirmed that the organization's overage is disabled, and stripped provider
and parent-session variables. It was set to stop at any overage signal or at 80% of a usage
window. Neither guard fired: the run ended at 5% of the five-hour window and 37% of the
seven-day window. **These Claude timings are not comparable with, and are never pooled
with, the earlier GPT timings.**

## Results

All 144 held-out sessions completed, with no timeouts or errors. Two final citations were
not verbatim source text. Public
[measurements](../benchmarks/document-retrieval/results/2026-09-29-meta-minisearch/measurements.json)
and [aggregates](../benchmarks/document-retrieval/results/2026-09-29-meta-minisearch/summary.json)
contain only opaque IDs, hashes and numeric metrics.

### By project

| Project | Arm | Median | Paired vs baseline | Tools/run | Runs with no tools | Audited recall | Answer pass |
|---|---|---:|---:|---:|---:|---:|---:|
| Lakina | Ordinary | 12.01 s | — | 2.75 | 0/24 | 95.8% | 87.5% |
| Lakina | Plain prefetch | 9.58 s | 1.18x, 1.72 s | 1.13 | 9/24 | 95.8% | 70.8% |
| Lakina | Metadata prefetch | 9.59 s | 1.22x, 2.06 s | 1.13 | 8/24 | 95.8% | 70.8% |
| Evo | Ordinary | 10.83 s | — | 2.92 | 0/24 | 93.8% | 95.8% |
| Evo | Plain prefetch | 9.36 s | 1.28x, 2.27 s | 1.04 | 10/24 | 95.8% | 91.7% |
| Evo | Metadata prefetch | 9.02 s | 1.27x, 2.48 s | 0.96 | 10/24 | 93.8% | 100% |

Metadata against plain was 1.06x and 0.53 s on Lakina, and 1.01x and 0.07 s on Evo. On the
seven questions the author labelled historical, metadata was 1.06x over plain. On the 17
current-state questions it was 1.01x. The automatic intent classifier agreed with those
labels on 19 of 24 questions.

### Why prefetch cannot reach 2x here

| Arm | Median API time | Median process overhead | Mean model turns | Median cumulative input tokens | Median uncached input | Median output |
|---|---:|---:|---:|---:|---:|---:|
| Ordinary | 9.81 s | 1.29 s | 4.83 | 26,430 | 5,181 | 908 |
| Plain prefetch | 8.39 s | 1.26 s | 3.08 | 20,929 | 4,644 | 761 |
| Metadata prefetch | 8.01 s | 1.25 s | 3.04 | 19,635 | 4,043 | 731 |

Even when metadata prefetch needed **no further tool call**, which happened in 18 of 48 runs,
the median session took **6.57 s**. That time covers CLI startup, reading about 10,000
characters of passages, reasoning and writing a cited answer. Against an 11.09 s baseline,
perfect retrieval on every question would cap the median at roughly 1.7x and 4.5 s. Prefetch
removed about 1.8 tool calls and 1.8 model turns per session. In 59 of 96 prefetch runs the
model still opened at least one file to confirm or extend the passages.

Opus was already fast at ordinary navigation: 2.8 tool calls and an 11 s median, against 20 s
for the GPT model in the previous round. A faster baseline leaves less time for retrieval to save.

### Retrieval quality

Window recall measures whether a returned passage from a labelled source contains a quotable
fragment of at least 30 characters. It is measured before any model call.

| Question set | Project | Plain doc / window recall | Metadata doc / window recall |
|---|---|---:|---:|
| Development (exposed) | Lakina, 30 | 83.3% / 80.0% | 90.0% / 86.7% |
| Development (exposed) | Evo, 80 | 90.0% / 75.0% | 90.0% / 81.9% |
| **Held-out** | Lakina, 12 | 75.0% / 50.0% | 66.7% / 41.7% |
| **Held-out** | Evo, 12 | 75.0% / 58.3% | 91.7% / 79.2% |

The development gain replicated on Evo. It reversed slightly on Lakina, where 12 questions are
too few to separate a real loss from noise. Strict frozen-passage recall in agent answers was
64.6% for plain, 70.8% for metadata and 69.8% for ordinary navigation. Metadata prefetch led
strict recall on Evo, at 89.6% against 75.0% for plain.

### The development pilot overstated the benefit

Six development questions per model looked promising. Opus metadata prefetch was 1.62x and
4.37 s faster than baseline and 1.31x faster than plain, with no further tools in five of six
runs. Sonnet showed the same pattern at 1.66x. The held-out run did not reproduce either
result. Those questions were part of the set the retriever had been tuned on, and six is far
too few. The pilots validate the harness only, which is why the conclusions above use held-out
results alone.

## Quality Audit And Limitations

- **The graders differed in strictness, so both rubrics are reported.** The Lakina grader
  ignored fact clauses the question did not ask for. The Evo grader failed an answer for any
  missing clause. Each grader then supplied the other rubric, still blind to arm. The
  question-scoped rubric is primary. Under the as-written rubric, pass rates were 58.3%
  ordinary, 54.2% plain and 50.0% metadata. The ranking is unchanged, and prefetch is never
  better.
- **Some labels were over-specified or imperfect.** The graders flagged several questions.
  Some required facts included clauses no question asked for (LF08, LF10, LF11, LF12, EF07,
  EF09). One question's evidence groups were misaligned with its facts (LF03). One frozen
  passage records a pre-activation state that later records supersede (LF04). The graders'
  judgments were not overridden. Every arm answered the same questions, so these flaws lower
  absolute scores but do not favour any arm.
- **Alternative evidence was common.** The graders accepted 68 alternative cited passages
  across the 144 answers. Audited recall therefore depends on model judgment, not a
  double-labelled human benchmark.
- **The author wrote both the retriever and the held-out questions.** The questions were
  derived from real requests and frozen before retrieval ran, but no independent question
  writer was used.
- **The sample is small.** It covers 24 questions from 28 threads in five days, with two
  repeats that are not independent samples. Questions were selected by hand and rewritten
  to be self-contained. Real messages often need earlier conversation to resolve, and no
  query-rewriting step was charged.
- **Snapshots differ between phases.** Development used the earlier snapshots and the held-out
  run used current trunk, which tests generalization but confounds any comparison of
  development and held-out numbers.
- **The runtime is not a clean room.** Sessions ran on a shared workstation with warm caches,
  and the runtime isolation relies on Claude Code's safe mode rather than a sandbox. Ambient
  project documents were disabled in every arm, unlike normal Morpheus sessions, which must
  read decisions and learned records.
- **Complete coding tasks were not measured.** Neither were warm conversational context,
  concurrent agents, or index maintenance during edits.

## What Would Move The Needle

The previous round's conclusion holds more strongly: the remaining time is the agent's
reading and reasoning, not retrieval. Prefetch removes about two tool round trips, which is
worth 1.5–2.5 s on this workload. A larger gain would need a different bottleneck to fall:

- smaller, more precise passages, so the model reads less;
- enough confidence that the model answers without confirming;
- or a task where navigation dominates, such as a much larger corpus or a slower model.

None of these was demonstrated here. A retrieval layer should be justified by measured
whole-task time and correctness, not by retrieval latency.
