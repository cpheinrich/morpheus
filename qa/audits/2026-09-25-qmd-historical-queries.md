# QMD retrieval on historical Evo requests

Third round of the [document retrieval study](2026-09-24-document-retrieval.md),
following the [settings optimization](2026-09-25-qmd-performance-tuning.md).
This round asks whether a more aggressive workflow change can outperform the
previous keyword CLI recipe on questions derived from actual project chats.

## What Was Changed

QMD's fast path is already inexpensive on this corpus. To remove more latency,
the experiment moves retrieval **before the first agent turn**, returns bounded
source passages, and keeps the index and embedding model warm. The clock starts
before retrieval, not after it. This is an experimental orchestration change,
not an undiscovered QMD CLI flag or a production feature delivered by this PR.

The validation startup measured 149 ms to build the MiniSearch index and 1.87 s
for the embedding warmup. These are component timings, excluding corpus reads
and module loading. The copied SQLite index occupies about 7.9 MiB. Vector-only
uses the 318 MiB embedding weights, not the additional 610 MiB reranker and 1.2 GiB
expansion weights used during screening. A spot check of the combined runner,
MiniSearch index and warm QMD process showed about 561 MiB RSS; this is not a
per-component or total GPU-memory measurement.

The alternatives screened were native keyword CLI with one or three full results,
warm direct vector search, automatic expansion without reranking, and automatic
expansion with an eight-candidate reranker. A prefetched MiniSearch control uses
the same source-window presentation without QMD or a local neural model. It tests
whether avoiding a model/tool round trip explains the gain better than QMD itself.
MiniSearch 7.2.0 was already available in the repository; no dependency was added.
[MiniSearch documentation](https://github.com/lucaong/minisearch).

## Research Findings

- `searchVector` embeds the question and retrieves indexed chunks directly. It
  avoids query expansion and cross-encoder reranking. A persistent SDK process
  avoids repeatedly loading models; cold startup remains a separate cost.
- `search({query, rerank:false})` still automatically expands the query. Disabling
  reranking alone does not produce the cheapest semantic path.
- Fewer full documents can reduce context but can also cause another search. It
  is necessary to measure the entire agent session, not just output bytes.
- In the pinned implementation, `extractSnippet` selects approximately four
  lines. Raising its character cap does not turn it into a broad source window.
  This harness instead returns up to 35 original lines, capped at 3,000 characters
  per hit, anchored to the matching vector chunk or lexical terms.
- Precomputing document embeddings is useful; precomputing rankings for arbitrary
  future questions is not equivalent. The experiment clears query expansion and
  reranker cache entries rather than crediting repeated-query cache hits.

These claims were checked against QMD 2.8.3's installed `dist/index.js` and
`dist/store.js`, corresponding to
[pinned SDK source](https://github.com/tobi/qmd/blob/facd35e01359e59d938bc9418e93fb9318addee3/src/index.ts)
and [pinned store source](https://github.com/tobi/qmd/blob/facd35e01359e59d938bc9418e93fb9318addee3/src/store.ts).
The [upstream README](https://github.com/tobi/qmd) describes persistent HTTP and
direct SDK access. Those are optimization mechanisms, not evidence of faster
end-to-end answers on this workload.

## Historical Sample

Thirty retrospective documentation questions were derived from actual Evo user
messages in local Codex and Claude histories. Native reads succeeded for 26 of 28
selected Codex tasks; two were inaccessible. The extracted private inventories
contained 63 Codex messages and 24 unique top-level Claude messages. Selection was
manual, not random or frequency-weighted. Original requests, provenance and exact
derived questions remain private. No unrelated personal conversation was used.
History discovery used the main-checkout Codex metadata and top-level Claude
project logs, not an exhaustive inventory of every worktree, fork or archive.

Questions cover product behavior, UI decisions, experiments, release safeguards,
and operational documentation. Ten were designated development and twenty
validation, keeping source threads in only one split. Questions were frozen
before source labeling; validation answer requirements were recorded before its
first trial. The agent sees neither labels nor original chat history.

The development questions came from four threads (four Codex-derived questions,
six Claude-derived). Validation uses twenty Codex-derived questions from sixteen
different threads. Thus historical sourcing is broader than the earlier authored
worklog sample, but it is not a balanced cross-provider study.
The split also differs by topic: development includes more experiment and release
questions, while validation is weighted toward product/UI requirements and support
history. It underrepresents open-ended research synthesis. A favorable result here
would not establish the same gain for every kind of work in the historical archive.

This is **not** replaying complete coding tasks. Requests to change a feature were
converted into questions about its recorded requirements or behavior. The corpus
contains later outcomes, so this measures retrospective context retrieval rather
than what an agent could have known when the message was first sent. One
development question asks about operational readiness that Markdown alone cannot
verify; its frozen evidence label covers the guide, not live infrastructure.

The derived questions are self-contained. Real chat often says "this" or "that"
and depends on earlier turns; resolving that context before automatic prefetch
could itself require model work. This benchmark does not charge an automatic
query-rewriting step because no such component was implemented. Any integration
proposal must measure that cost instead of assuming every raw message is a good
standalone search query.

## Protocol

The unchanged Evo snapshot contains 437 Markdown files, 1,363,609 bytes, including
182 worklogs and 239 roadmap documents including their README. It is frozen at
`2ef3839114f05cf038b46e9b84445d125f360977`. Source code, private inboxes, brand assets
and generated datasets are outside the corpus. Hardware and QMD versions match
the preceding study: M3 Max, 48 GiB, default QMD embedding/expansion/reranker models.

All agents use `gpt-6-astra` with `high` reasoning, the same 80-word answer limit,
source-citation requirements and ordinary file-read fallback. Each trial is a
fresh, sequential Codex process. Model, filesystem cache and host conditions are
not experimentally isolated. Provider prompt caching remains enabled; cumulative
input-token totals include cached prefixes. `project_doc_max_bytes=0` disables ambient project
document loading in every arm; incidental runtime warnings are retained. The
private corpus boundary is instructed, not a hardened directory sandbox.

Disabling startup documents isolates retrieval; it is not the normal Morpheus
workflow, where the agent is expected to read decisions and learned records.
An ongoing session may already know the answer or a useful path. The experiment
does not establish the same benefit in those warm conversational contexts, nor
does it measure complete coding-task time or a corpus-size adoption threshold.
The index is scoped to one project. Concurrent agents, index refresh during edits,
and multi-project permission/scoping behavior are not benchmarked. Retrieval is
local, while answer generation uses the same hosted Codex model in every arm.

Completion time includes prefetch, CLI startup, model reasoning, tool calls,
answer generation and shutdown. Setup/indexing/model warmup are reported separately.
The host also performed light authoring, file inspection and a documentation-only
trunk merge while validation ran; this is a shared-workstation study, not an idle
machine microbenchmark. The merge's update hook refused the dirty checkout and did
not install anything. Retrieval code, fixtures and the copied corpus did not change.
The practical target remains median paired **2x faster and at least five seconds
saved**, with at least 95% evidence recall and within five percentage points of
ordinary navigation. See the [frozen protocol](../benchmarks/document-retrieval/history-protocol.md).

Strict recall uses frozen source passages. Author-audited alternative citations
are reported separately, preserving the original labels. Answers are also checked
for the requested facts: a valid source quotation does not make an interpretation
correct. The audit is not blind or independently double-labeled. Multiple related
questions and repeated runs must not be treated as independent samples.
Correctness here means consistency with the frozen project records, not a fresh
test of the app, cloud resources or production behavior.
The public artifacts reproduce metric aggregation, but source relevance judgments
cannot be independently reconstructed without the authorized private fixtures and
transcripts. That privacy limit should not be mistaken for a public benchmark set.

Two first-pass judgments need special care. V09 includes conservative grading of
an exclusive statement against a later canonical update. V20's semantic result
describes a real older change rather than the intended historical task; the derived
question omitted a date. That is an underspecified target-match failure, not
fabricated evidence. We report a sensitivity analysis excluding V09 and V20 from
**every** arm, without changing the primary results or claiming a newly blind test.

CLI event capture can be incomplete: at least one successful QMD command recorded
an empty output even though the final answer contained exact source quotations.
The exporter counts these cases. Large outputs can also be truncated before model
consumption. Recorded characters are therefore an incomplete output-volume
diagnostic, not an exact measurement or bound on the model's delivered context.
This is another reason not to use reconstructed evidence-availability timestamps
as the primary speed claim; full process completion and provider token usage remain
separate.

## Results

**No large additional QMD speedup was demonstrated.** Warm vector prefetch was
1.34x faster than ordinary navigation, saving 5.35 seconds on the median matched
pair. Against the previous QMD keyword CLI recipe on these same questions, it was
only 1.10x faster, saving 1.69 seconds. A lightweight lexical prefetcher was about
as effective without a neural retrieval model. No recipe met the median 2x target.

All 160 validation sessions completed, with forty runs per arm, no invalid source
quotations and no QMD database errors. The thirty development sessions retain one
CLI timeout. Public [measurements](../benchmarks/document-retrieval/results/2026-09-25-history/measurements.json)
and [aggregates](../benchmarks/document-retrieval/results/2026-09-25-history/summary.json)
contain opaque IDs, configuration/fixture hashes and numeric metrics only.

| Validation workflow | Median completion | p95 | Median paired speedup | Median paired saving |
|---|---:|---:|---:|---:|
| Ordinary navigation | 20.32 s | 37.06 s | Reference | Reference |
| QMD keyword CLI, three full sources | 18.36 s | 32.39 s | 1.14x | 2.47 s |
| Warm QMD vector prefetch | 17.09 s | 24.09 s | 1.34x | 5.35 s |
| MiniSearch lexical prefetch | 15.38 s | 26.15 s | 1.33x | 5.74 s |

Paired statistics match question and repeat; they are not ratios or differences
of the marginal medians. Vector beat baseline on 32/40 pairs and MiniSearch on
18/40. Directly paired against MiniSearch, vector's speedup was 0.99x, adding
0.15 seconds. This small sample does not establish a meaningful winner between
the two prefetchers. Each exceeded 2x and five seconds on only 5/40 individual
pairs; that is not a typical 2x gain. All comparisons use the same agent model.

| Validation workflow | Frozen passage recall | Audited evidence recall | Answer/target pass | Mean tool commands | No further commands |
|---|---:|---:|---:|---:|---:|
| Ordinary navigation | 56.25% | 96.25% | 39/40 | 2.15 | 0/40 |
| QMD keyword CLI | 41.25% | 96.25% | 40/40 | 1.55 | 0/40 |
| QMD vector prefetch | 25.00% | 92.50% | 38/40 | 0.68 | 24/40 |
| MiniSearch prefetch | 56.25% | 97.50% | 40/40 | 0.48 | 28/40 |

The low strict recall exposes a weakness in this study's narrow frozen labels:
valid roadmap, feature and canonical-decision passages often answer the question
without citing the primary worklog paragraph. Alternative evidence was accepted
in 17 baseline, 23 CLI, 28 vector and 18 MiniSearch trials. This is a substantial
post-hoc relevance audit, not a small numerical correction or a blind recall
benchmark. The large adjustment limits confidence in exact quality differences;
both scores remain visible. Missing final citations were not rescued merely
because an answer was correct. In particular, every arm omitted the separately
labeled prerequisites citation on V04 in both repeats.
Vector falls below the 95% evidence threshold in the primary audited analysis;
MiniSearch passes that quality hurdle but not the required 2x speed hurdle.

Vector's two target failures were the repeated older-change interpretation of
V20. Baseline's one conservative answer failure was V09's exclusive wording.
Excluding both questions from every arm gives 36 pairs: vector 1.39x/5.86 seconds,
MiniSearch 1.39x/6.22 seconds, CLI 1.16x/2.51 seconds. Audited recall then becomes
95.83% baseline and 97.22% for the other arms; all remaining answers pass. This
post-hoc sensitivity does not change the main conclusion: still no typical 2x
gain, even under the more favorable quality interpretation.

### Where The Time Went

Validation retrieval itself took a median 32.21 ms for vector and 6.96 ms for
MiniSearch, including passage construction. Avoiding subsequent tool calls is
the plausible source of seconds-scale savings. Vector's 24 zero-command runs
still spent a median several seconds reasoning and answering; supplied evidence
is not instantaneous understanding. The experiment changes presentation and
retrieval placement together, so it cannot assign a causal share to each.

| Workflow | Median cumulative input tokens | Median uncached input tokens | Median output tokens | Median recorded source characters |
|---|---:|---:|---:|---:|
| Ordinary navigation | 49,808 | 5,187 | 390 | 10,516 |
| QMD keyword CLI | 37,028 | 6,720 | 332 | 14,982 |
| Vector prefetch | 17,189 | 2,442 | 372 | 7,642 |
| MiniSearch prefetch | 17,297 | 2,449 | 352 | 8,573 |

Token totals count provider-reported cumulative usage across model turns, including
repeated prefixes; these are not corpus-token estimates or first-prompt sizes.
Prefetch reduced those totals and uncached input in this experiment. Three
successful CLI commands had empty recorded output; source-character counts are
diagnostic only, as explained above. No wall-clock speed claim uses those gaps.

### Development Screening

Ten development questions, four backend configurations, one observation per cell:

| Prefetch engine | Median retrieval | Frozen document recall@4 |
|---|---:|---:|
| Direct vector | 12.37 ms | 60% |
| Automatic expansion, no rerank | 661.78 ms | 60% |
| Automatic expansion, rerank eight | 1,547.83 ms | 50% |
| MiniSearch text index | 3.98 ms | 60% |

These timings include bounded passage construction but exclude initial index/model
setup. The embedding model was warmed with an unrelated query; the expansion model
was not explicitly prewarmed. No query/reranker cache reuse was credited. Recall
here is the frozen source-document label, not answer accuracy or exhaustive
relevance. Equivalent documents omitted by the narrow labels explain some misses.

Five of those development questions then ran six counterbalanced agent recipes:
30 sessions, including one retained 120-second CLI timeout. The selected vector
recipe was faster than baseline on all five pairs, with a 1.16x median paired
speedup and 2.40 seconds saved. MiniSearch was competitive: 1.30x and 7.77 seconds.
Automatic expansion yielded 1.16x and 2.97 seconds, with one misleading answer
despite valid citations. Reducing full-document CLI results to one yielded 0.82x,
adding 5.62 seconds; mean tool commands rose from 3.2 at baseline to 4.8.

Selection therefore retains vector-only as the QMD fast path and MiniSearch as a
control. The previous three-document keyword CLI remains a comparator. Validation
configuration was frozen at 20:30:38 UTC before its first agent call; no validation
results were used to retune the recipes. It uses twenty questions, four arms and
two reversed/counterbalanced repeats, for 160 completed sessions. No development
recipe met the 2x-and-five-second target.

## What Could Improve Next

Further backend micro-optimization has little room to change a seconds-long
answer once a warm semantic lookup takes tens of milliseconds. The promising
mechanism is eliminating avoidable agent turns, not making that lookup another
few milliseconds faster. This experiment does not isolate prefetch timing from
bounded passage presentation; both changed together.

For a future opt-in experiment, compare a small lexical prefetcher with semantic
fallback on complete tasks, charging for query disambiguation, startup and index
maintenance. Preserve mandatory decisions/learned reads, show source provenance
and dates, and permit ordinary file inspection. Evaluate outdated-but-relevant
retrieval explicitly. This is a proposal, not a tested routing policy or a reason
to automatically inject untrusted document instructions.

Changing embedding models, quantization or accelerator backends was not exhaustively
screened. Once direct embedding lookup is this small a share of answer time, those
choices would need a retrieval-quality benefit or fewer fallback turns to produce
a large end-to-end improvement.

Do not turn this into a custom RAG frontend or a mandatory QMD dependency on the
strength of millisecond backend timings. There is no measured corpus-size
crossover here: one fixed documentation snapshot cannot establish one. The next
decision should depend on whole-task time and correctness in real sessions, not
the number of Markdown files alone.
