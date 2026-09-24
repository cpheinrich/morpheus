# Does QMD improve project-document retrieval?

Date: 2026-09-24. Scope: Lakina and Evo, 30 questions each.

## Summary

**This experiment does not justify making QMD the default for either project.**
Across 30 questions per project, ordinary navigation located all frozen required
evidence. QMD-augmented agents also located sufficient evidence after two separately
reported author adjudications, but were modestly slower: median paired overhead
was 1.88 seconds for Lakina and 2.87 seconds for Evo. There were no timeouts.

This is a useful negative result for adoption, not proof that QMD cannot help.
The curated sample favors settled, well-indexed records and underrepresents the
harder worklog-only questions that originally motivated this investigation.
Keep ordinary navigation as the default; evaluate QMD as an optional fallback on
that harder workload before building an integration or frontend.

## What Was Tested

Two frozen Git snapshots, not changing working directories:

| Corpus | Revision | Markdown files | Bytes | Worklog files | Roadmap files |
|---|---|---:|---:|---:|---:|
| Lakina | `a539b3669138aec1551856204a5bec8380c3febd` | 702 | 2,316,041 | 239 | 268 |
| Evo | `2ef3839114f05cf038b46e9b84445d125f360977` | 437 | 1,363,609 | 182 | 239 |

These are the **evaluated subsets**, not the sizes of the entire repositories.
They include tracked Markdown in decisions, lessons, worklogs, product records and
docs, plus archived root agent instructions. Counts include directory README files.
Source code, inboxes, brand/marketing records, generated research data, media and
untracked work are excluded.

Each project has six questions in each of five strata: exact record lookup,
conceptual rules, historical failures, changed decisions and operational guidance.
There are 63 required evidence groups across 60 questions. Alternative sources were
declared before retrieval, including worklogs and index entries.

The fixture and [protocol](../benchmarks/document-retrieval/protocol.md) were frozen
locally at 2026-09-24 10:42:35 UTC before scored searches:

- Fixture SHA-256: `da4535bb2b38ce0a649e1c8523c3336cebe4f3f991ac96190ccee75d26903e12`.
- Protocol SHA-256: `086fe4baf6044f69390834c9f8280d5dc22dedd1d8e577c34df4236966f7c381`.

## Search-Only Results

QMD 2.8.3 SDK, ten results per query. Recall is the macro-average fraction of
required evidence groups represented by an expected document in the top five.
**This is document recall, not passage recall or answer accuracy.**

| Mode | Lakina recall@5 | Lakina median | Evo recall@5 | Evo median |
|---|---:|---:|---:|---:|
| BM25 keyword | 80.0% | 0.58 ms | 66.7% | 0.51 ms |
| Vector | 71.7% | 11.56 ms | 46.7% | 10.39 ms |
| Lexical + vector, no rerank | 76.7% | 15.99 ms | 63.3% | 15.79 ms |
| Lexical + vector, reranked | 76.7% | 5,224.95 ms | 66.7% | 4,084.40 ms |
| Automatic expansion + reranking | 76.7% | 10,251.44 ms | 70.0% | 7,816.57 ms |

These are in-process search-call medians across all thirty queries, including the
first lazy-load call. They exclude process/database startup and corpus indexing.
Each mode used a separate copy of the index and its own process. No scored query
was deliberately repeated within a mode. All 300 calls completed without errors.
First-call and p95 values are available in the machine-readable results.

BM25 received author-written keyword queries; vector and automatic expansion
received natural-language questions. Structured modes received both. Keyword
formulation time is **not** included in these SDK timings. This ablation therefore
compares configured retrieval recipes, not equal-effort human query entry. The
paired-agent experiment below lets the same agent formulate its own searches.

Many Evo gold passages share one large decisions file. Returning that file can
earn document credit without locating the right passage. Do not use the table as
evidence that an agent could answer all credited questions.

Conversely, an undeclared worklog can contain a valid answer and receive no document
credit. Top-k results were not exhaustively pooled and relevance-adjudicated across
all five engines. The table measures **frozen-label coverage**, not definitive
semantic relevance, and does not by itself prove that vector retrieval is worse.

### Identifier Diagnostic

All twelve exact roadmap-ID queries failed under the frozen quoted-keyword form.
A **post-hoc** diagnostic tested the same IDs unquoted and as quoted,
space-separated tokens. Both original forms found zero targets; the space-separated
form found all twelve in the top five. Original scores above are unchanged.

Inspection of the installed 2.8.3 query sanitizer explains this: these identifiers
mix hyphens and dots, and match neither its hyphen-only nor dotted-token rules;
punctuation is removed rather than split into the indexed tokens. This is a
query-normalization problem, not evidence that BM25 fundamentally cannot find IDs.
Retain literal filename/text lookup, or explicitly normalize these identifiers.
No upstream package modification was made for the evaluation.

## Paired Agent Results

All 120 fresh sessions completed. The primary score is frozen-label section recall;
the secondary score accepts two source-verified alternatives after author review.

| Corpus / arm | Strict recall | Audited recall | Median completion | p95 completion | QMD used |
|---|---:|---:|---:|---:|---:|
| Lakina, ordinary navigation | 100% (30/30 complete) | 100% | 37.53 s | 59.90 s | 0/30 |
| Lakina, QMD available | 96.7% (29/30 complete) | 100% | 38.57 s | 65.01 s | 26/30 |
| Evo, ordinary navigation | 100% (30/30 complete) | 100% | 37.61 s | 55.34 s | 0/30 |
| Evo, QMD available | 96.7% (29/30 complete) | 100% | 40.84 s | 58.55 s | 28/30 |

For matched questions, QMD minus baseline completion time had a median of **+1.88 s**
(interquartile range +0.33 to +5.71 s) in Lakina and **+2.87 s** (+1.17 to +7.58 s)
in Evo. Paired differences are not the subtraction of the two arm medians.

The two frozen-label misses were `L08` and `E07`, both conceptual QMD responses.
Each quoted genuine, relevant alternative documents outside the declared gold
passages. The author inspected those passages and judged them sufficient. This is
**post-hoc author adjudication, not independent blind grading**. Original scores
are retained in every measurement. It would be misleading to call these two cases
demonstrated retrieval regressions. Equally, no question demonstrates a recall gain
over baseline in this sample: baseline was already at the measurement ceiling.

The transcript audit found zero invalid source quotations, zero prohibited QMD
mode uses and no other MCP calls. The 54 QMD search calls comprised 43 vector-only,
nine lexical-plus-vector and two lexical-only searches. The remaining six augmented
sessions used ordinary navigation. This measures **QMD availability**, not compulsory
QMD use; there is no end-to-end agent arm with automatic expansion or reranking.

### Evidence Delivered By Deadline

This is mean **strict evidence recall in completed responses** by the stated wall
time, counting later responses as zero. It is not time to first relevant passage.

| Corpus / arm | By 30 s | By 60 s | By 120 s |
|---|---:|---:|---:|
| Lakina, ordinary navigation | 16.7% | 93.3% | 100% |
| Lakina, QMD available | 6.7% | 86.7% | 96.7% |
| Evo, ordinary navigation | 16.7% | 96.7% | 100% |
| Evo, QMD available | 0% | 90.0% | 96.7% |

Neither arm delivered a completed response within 15 seconds. All completed before
the 120-second cap. The two audited alternatives are not retroactively included
in this frozen-score curve.

### Tokens And Tool Use

| Corpus / arm | Median input tokens | Median cached input | Median uncached input | Median output | Mean tool calls | Mean tool-output characters |
|---|---:|---:|---:|---:|---:|---:|
| Lakina, ordinary navigation | 75,005 | 66,240 | 18,362 | 833 | 3.13 | 25,188 |
| Lakina, QMD available | 82,158 | 69,440 | 22,631 | 836 | 4.23 | 27,454 |
| Evo, ordinary navigation | 77,142 | 69,184 | 17,782 | 791 | 3.43 | 28,277 |
| Evo, QMD available | 80,905 | 68,288 | 12,814 | 867 | 4.00 | 21,984 |

These are provider-reported cumulative session tokens, including repeated context
across turns, **not unique document tokens**. Each median is computed independently;
subtracting the displayed input medians need not equal the uncached median.
Tool-output characters include serialized metadata and potentially duplicate MCP
representations; they are only an approximate volume indicator. Evo shows smaller
tool output and lower median uncached input with QMD, but not faster completion.
There is no consistent token or reading-volume benefit across both projects.

### Agent Method

Both arms use fresh ephemeral Codex sessions, the same configured model and effort,
the same frozen corpus and the same citation task. Baseline has ordinary file
navigation, ripgrep and curated records. The other arm additionally has QMD's
native MCP tools and may fall back to ordinary search. It is instructed to use
vector or structured lexical/vector searches with no reranking or auto-expansion.

The prompt allows focused reads of decisions/learned as entry points, but does
**not** preload all mandatory production startup documents or execute session
hooks. This is cold document discovery, not a complete reproduction of a normal
implementation session. Codebase-memory is not needed or tested in this bounded
Markdown task. The result cannot establish code-navigation speedups.

Each response may cite up to six passages. Section recall requires a corpus-relative
path and an exact, whitespace-normalized quote of at least thirty characters inside
a declared gold passage. Naming a large file alone earns no section credit. This
is an evidence-location metric, **not** a semantic grading of the written answer.

Wall-clock time includes CLI/tool startup, search, reading, reasoning, final
response and shutdown. The 120-second cap includes startup; failures/timeouts
remain in the denominator with zero delivered evidence. Sessions run serially,
interleaving projects; baseline-first and QMD-first alternate by question number.
An unrelated configured Cloudflare MCP server emitted an authentication startup
warning in both arms; neither used it. This shared startup overhead is included.

## Recommendations

1. **Keep literal search and curated records as the default.** These evaluated
   snapshots, 702 and 437 Markdown files, do not demonstrate a retrieval bottleneck
   on the sampled questions. A document count alone is not an adoption threshold.
2. **Do not make vector-first or reranked hybrid the default yet.** Vector search
   is cheap once loaded, but the paired agent results do not show better evidence
   delivery. Reranking costs seconds in the SDK test without a consistent labeled
   recall gain. The latter is not an end-to-end agent conclusion.
3. **Keep QMD as a candidate optional fallback**, especially for paraphrased,
   cross-document and worklog-only history. Its native CLI/MCP is sufficient for
   another pilot; a custom frontend has no demonstrated need. Preserve direct
   filename/ID lookup and address the identifier normalization issue first.
4. **Test the hard tail next, not merely more of this sample.** Collect real
   questions that ordinary agents struggle to answer, oversample worklog-only
   evidence, pool candidate sources and have judgments made independently before
   comparison. Include unanswerable questions, repeat paired runs, hold answer
   budgets constant and test reranking as an explicit escalation arm. Predeclare
   the minimum recall gain and acceptable latency/token cost before running.
5. **Maintain concise canonical indexes and supersession links.** Search does not
   resolve contradictory history by itself. Keep code-graph navigation as a
   separate concern; this benchmark says nothing about codebase-memory's speed.

These are proposals only. No QMD integration, production policy change or frontend
was installed by this work.

## Setup Cost

Apple M3 Max, 48 GiB RAM, macOS 26.6.2; Node 26.8.2, Codex CLI 0.154.0.
Configured agent model: gpt-6-astra, high reasoning effort.

| Corpus | Index update | Embedding | Embedded chunks | Base SQLite size |
|---|---:|---:|---:|---:|
| Lakina | 0.59 s | 31.82 s | 1,287 | 14,749,696 bytes |
| Evo | 0.35 s | 20.01 s | 815 | 8,187,904 bytes |

The default models were already downloaded, so network/download time is excluded:
embeddinggemma-300M Q8 (333,590,944 bytes), qwen3-reranker-0.6b Q8 (639,153,184 bytes),
and qmd-query-expansion-1.7B Q4 (1,282,438,912 bytes). Vector-only operation does not
need to load the latter two for each query. These are workstation observations,
not CPU-only hardware benchmarks or peak-memory measurements.

## Limitations

- Questions and labels are author-curated from the source documents, not blind
  production questions or independently adjudicated judgments. Selection favors
  settled, answerable records; long-tail worklog-only discovery is underrepresented.
- There are only thirty questions per project and one agent trial per question per
  arm. No confidence claim, stable latency SLA, or universal size threshold follows.
- All questions are answerable. This does not test abstention, false-positive
  evidence on unanswerable questions, or hallucination rates.
- Alternative valid sources may be absent from the gold set. Strict label recall
  and any post-hoc audit must be distinguished.
- The answer format requires quoted citations; response length and citation count
  can influence completion latency. The study does not isolate time to first
  relevant passage from time spent composing the final answer.
- The workstation was not isolated from other applications, and remote model
  serving latency/cache behavior is not controlled. Counterbalancing helps with
  order effects but does not remove that variability.
- QMD schemas/tool instructions add prompt context. Provider input-token usage
  includes repeated context across turns; it is not unique Markdown tokens read.
  Serialized tool-output characters are not a tokenizer-based corpus measurement.
- Corpus updates, concurrent editing, index-refresh maintenance and persistent warm
  agent sessions are not measured. Index creation is measured separately.
- Private fixtures and transcripts are not published in this public repository.
  Authorized source access is required for exact reproduction. The public harness
  and redacted measurements are auditable but not a fully public retrieval dataset.

## Reproduction And Sources

The [harness and instructions](../benchmarks/document-retrieval/README.md) describe
snapshotting, mode isolation, scoring, failure handling and private-data export.
QMD remains an external temporary installation, not a Morpheus dependency.
The [summary](../benchmarks/document-retrieval/results/2026-09-24/summary.json),
[420 individual measurements](../benchmarks/document-retrieval/results/2026-09-24/measurements.json)
and [identifier diagnostic](../benchmarks/document-retrieval/results/2026-09-24/identifier-diagnostic.json)
contain redacted measurements only. Private source material stays outside Git.

Relevant upstream material:

- [QMD benchmark documentation](https://github.com/tobi/qmd#benchmarking) and its
  [example fixture](https://github.com/tobi/qmd/blob/main/src/bench/fixtures/example.json)
  describe retrieval scoring, not this paired-agent evaluation.
- [QMD benchmark PR](https://github.com/tobi/qmd/pull/470) frames the harness as a
  regression aid rather than an absolute quality guarantee.
- [A contributor's private-wiki evaluation](https://github.com/tobi/qmd/issues/627)
  reports a different ranking of modes on a different corpus. It is not a prediction
  for Lakina or Evo and was not independently reproduced here.
- [QMD source](https://github.com/tobi/qmd/blob/main/src/store.ts) documents the
  lexical/vector fusion, optional expansion and reranking pipeline; this study pins
  the installed 2.8.3 implementation rather than assuming current main is identical.
