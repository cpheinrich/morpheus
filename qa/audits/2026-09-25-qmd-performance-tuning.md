# QMD tuning for Evo-sized document archives

Follow-up to the [September 24 experiment](2026-09-24-document-retrieval.md).
The question is not whether QMD can shave 20% off a lookup, but whether an optimized
configuration makes an agent substantially faster at comparable evidence recall.

**Tuning did improve the result, but not enough for the requested large speed win.**
The selected keyword CLI workflow completed matched questions about **1.17x faster**
(median paired saving **2.84 seconds**, roughly 15% less time). Author-audited
evidence recall was 100% for both arms. The recorded-evidence timing proxy improved
about **1.29x**, saving **2.20 seconds** per matched trial. Neither clears the
predeclared 2x-and-five-second threshold. Do not build a frontend or make QMD a
mandatory default on speed grounds from these results.

This corrects the stronger interpretation of the first study: **QMD can be faster**,
and the fastest tested workflow is keyword-first, without a local ranking model.
The benefit here is mostly avoiding an agent read/search turn, not accelerating a
large disk scan. Results and scripts are linked in the [benchmark directory](../benchmarks/document-retrieval/README.md).

## What Changes The Cost

An ordinary agent does not ingest every worklog for each question. It chooses
filename or text anchors, runs a search, reads matching context, and repeats when
the evidence is insufficient. The model is choosing queries and interpreting
results; ripgrep performs the actual local text scan. A single command can return
matching lines with surrounding evidence or batch several reads. This follows the
[documented shell-tool loop](https://developers.openai.com/api/docs/guides/tools-shell),
and is directly visible in this experiment's private transcripts.

Ripgrep is a fast literal/regular-expression scanner, not a semantic relevance
index. Its ignore rules also matter: hidden `.agent` documents require deliberate
inclusion. Ranked search and an unranked file list do not provide equivalent output.
See the [ripgrep FAQ](https://github.com/BurntSushi/ripgrep/blob/master/FAQ.md).

QMD provides several different operations, not one unavoidable local-LLM pipeline:

| Operation | Precomputed | Work at query time |
|---|---|---|
| Keyword/BM25 | SQLite full-text index | Match terms and rank documents; no neural model |
| Vector | Document/chunk embeddings | Embed the query and compare vectors |
| Structured hybrid | Both indexes | Run supplied keyword/semantic queries and fuse rankings |
| Automatic expansion | Model weights only | Generate query variants with a local LLM |
| Reranking | Model weights; cache of prior pairs | Score the current query against candidate passages |

The keyword command, `qmd search`, avoids expansion, embeddings and reranking.
Structured `lex`/`vec`/`hyde` searches let the calling agent supply variants;
`rerank:false` skips the cross-encoder. An untyped `query` can still invoke expansion
even when reranking is disabled. `hyde` embeds a hypothetical answer, not an
independent text-generation step when the caller supplies it.
[QMD syntax](https://github.com/tobi/qmd/blob/main/docs/SYNTAX.md).

Document indexing and embeddings can run in the background. Reranking normally
cannot be completely precomputed because its input includes the future query.
Repeated query/passage pairs can be cached; that does not remove first-query cost.
The pinned implementation stores expansion and reranking results in `llm_cache`.
[QMD implementation](https://github.com/tobi/qmd/blob/facd35e01359e59d938bc9418e93fb9318addee3/src/store.ts).

The practical latency budget is startup + query formulation + local search + result
delivery + model interpretation + any further tool turns. At 437 files and 1.36 MB,
local search is a small part of that budget. Returning useful source in one call
can matter more than taking another ten milliseconds off the index lookup.

## Version And Evidence

QMD **2.8.3**, npm git commit `facd35e01359e59d938bc9418e93fb9318addee3`, on the same
M3 Max / 48 GiB Mac as the original study. This was the current published version
when checked. Default models were retained; no Morpheus dependency or production
integration was added. All source documents, questions and transcripts remain local.

The README describes search-quality benchmarking through `qmd bench`, and the
changelog reports internal speed improvements, including an early warm HTTP change
from roughly 16 to 10 seconds and reduced embedding calls. Those are useful
optimization leads, not a controlled comparison against an agent using ordinary
project navigation. I did not find such a comparison in the README, bundled skill,
syntax guide or changelog inspected here.
[README](https://github.com/tobi/qmd/blob/main/README.md),
[changelog](https://github.com/tobi/qmd/blob/main/CHANGELOG.md).

Implementation details matter more than assuming every documented default is ideal:

- Positive lexical terms are ANDed. Overly broad two-word queries reduced coverage;
  mixed dotted/hyphenated identifiers needed the normalization found previously.
- `candidateLimit` limits documents before chunk selection, even without reranking.
  Lowering it can lose evidence, not just save reranker work.
- Structured search processes lexical lists first and doubles the first result
  list's fusion weight. Collection-level lists can therefore change ranking too.
- Without reranking, structured scores are reciprocal ranks, not calibrated
  confidence. A `minScore` threshold is not a reliable uncertainty detector.
- Native MCP search returns approximately 300-character snippets. The agent often
  needs `get` next. The CLI's `--full` can return source immediately, at the risk
  of excessive output from long documents.
- Warm HTTP avoids per-client server startup. The installed SDK nevertheless opts
  into model disposal after five idle minutes, unlike the README's broader claim
  that models remain resident. Warm measurements should not be treated as idle
  first-query guarantees.

These observations come from exact installed paths in `dist/store.js`,
`dist/index.js`, `dist/llm.js` and `dist/mcp/server.js`, checked against the
[upstream server source](https://github.com/tobi/qmd/blob/facd35e01359e59d938bc9418e93fb9318addee3/src/mcp/server.ts).

## Development Sweep

The original 30 Evo questions became **development data**, not a new held-out test.
The snapshot remains revision `2ef3839114f05cf038b46e9b84445d125f360977`: 437 Markdown
files, 1,363,609 bytes, including 182 worklogs and 239 roadmap files/READMEs.
This is the evaluated documentation subset, not the whole repository.

Warm-model SDK calls, clearing query/reranker cache before each query:

| Recipe | Median | Document recall@5 | Recall@10 |
|---|---:|---:|---:|
| Normalized keyword | 0.69 ms | 86.7% | 96.7% |
| Shortened keyword | 0.58 ms | 66.7% | 76.7% |
| Multiple lexical lists | 4.45 ms | 76.7% | 83.3% |
| Vector | 13.98 ms | 46.7% | 60.0% |
| Lexical + vector, 8 candidates, no rerank | 13.19 ms | 83.3% | 90.0% |
| Lexical + vector, 40 candidates, no rerank | 15.71 ms | 83.3% | 93.3% |
| Multiple lexical lists + vector, no rerank | 17.37 ms | 76.7% | 83.3% |
| Lexical + vector, rerank 8 | 1,012 ms | 83.3% | 90.0% |
| Lexical + vector, rerank 16 | 1,901 ms | 80.0% | 93.3% |

Eight-candidate modes cannot return ten documents. These are frozen-label document
coverage scores, not definitive semantic relevance or passage recall. Author-written
keyword formulation time is excluded. The shared-cache exploratory sweep is also
retained; it made the larger rerank batch look cheaper by reusing smaller-batch work.
The fresh-cache table avoids crediting that cross-configuration reuse.

Native HTTP, three passes over the development questions, ten results and no rerank:

| Recipe | Median | Recall@5 | Recall@10 |
|---|---:|---:|---:|
| Lexical, default collections | 3.29 ms | 86.7% | 93.3% |
| Lexical, global retrieval | 2.53 ms | 86.7% | 96.7% |
| Hybrid, default collections | 28.76 ms | 86.7% | 96.7% |
| Hybrid, global retrieval | 15.61 ms | 83.3% | 93.3% |

Here `collections:[]` normalizes to global retrieval, while omitting it uses the
native server's default collection lists. Do not generalize this to permission
boundaries or deploy it against unrelated/private collections.

The ordinary-search subprocess took **12.92 ms** median for OR-matched keyword
candidate discovery. It found all labeled source documents somewhere in its output,
but returned a median **141 filenames**, versus ranked top-k results. Its filesystem
order is not a relevance ranking; its top-five numbers are deliberately not used
as a fair quality comparison. Indexing is indeed faster in the narrow backend
comparison, but saves only about **10-12 milliseconds**, not seconds.

For the selected CLI recipe, an additional 30-query development measurement after
agent validation included native process startup, full-document serialization and
exit: **109.48 ms median**, 113.60 ms p95, and 80% document recall@3. That is slower
than the bare ripgrep subprocess, despite the faster internal index lookup. It can
still make the agent faster by returning ranked source in one call. All 990 backend
observations, including 60 ripgrep measurements, are retained with their distinct
timing boundaries; they must not be treated as interchangeable operations.

## Selected Agent Workflow

Four development questions compared ordinary search, warm native MCP lexical-first,
warm native MCP hybrid-first, and native CLI keyword/full-text retrieval. MCP used
agent-written queries, `rerank:false`, ten candidates, five results, intent and
focused/batched reads. CLI was the most promising latency candidate, so it was
selected before querying the new validation set:

| Development pilot | Median completion | Mean tool calls |
|---|---:|---:|
| Ordinary navigation | 19.02 s | 2.25 |
| Warm MCP, lexical-first | 32.22 s | 4.75 |
| Warm MCP, hybrid-first | 26.85 s | 3.50 |
| Native CLI, full source | 19.69 s | 1.25 |

Four questions are only a screening pilot; CLI trials ran after the three-arm
pilot, not in a fully interleaved four-arm design. All pilot answers had valid
source support after separately recorded author adjudication. CLI was promising
relative to the MCP options, not already proven faster than baseline.

```sh
qmd search "discriminative keywords" --full --format json -n 3
```

This is native QMD, not a new wrapper/frontend. No MCP schemas or local neural
models are needed for this arm. Adjust keywords when needed; ordinary search and
file reads remain permitted fallbacks. Returning three full documents is not a
universal production recommendation: long canonical files can produce excessive
output. The selected recipe is optimized for finding evidence in short worklogs.

QMD's own skill recommends deliberate query formulation, selective retrieval and
batch reading. It does not prescribe always invoking the full automatic pipeline.
[Bundled skill](https://github.com/tobi/qmd/blob/main/skills/qmd/SKILL.md).

## Validation Method

Twenty new, source-authored worklog-detail questions, 23 required evidence groups,
two arms and two counterbalanced repeats: **80 fresh sessions**. Questions were
frozen before validation; selection and tuning used only the old development set.
Fixture SHA-256: `9d473767f3770a9323d2355c734478d052b6f0f4ab958f97fd672967b5823421`.
A pre-query correction narrowed one overbroad JSON evidence block; its earlier
fixture was retained privately and was never used for validation searches.

Both arms use the same existing model/effort (`gpt-6-astra`, high), CLI settings,
read-only shell, corpus, answer limit and 120-second external cap.
`--ignore-user-config` did **not** fully isolate the runtime: stderr shows inherited
Morpheus instructions and plugin startup, including Cloudflare authentication
warnings, in both arms. These shared costs remain in the measurements; they are
not QMD costs or evidence of a clean-room runtime. Baseline is explicitly encouraged
to choose good anchors, include hidden files, batch reads and use context lines.
The selected QMD arm has exactly the same ordinary fallback tools. Timing from this
new protocol must not be directly subtracted from the original experiment's timing:
CLI options and prompts changed for **both** arms.

An initial validation attempt was interrupted after 36 completed sessions. Stopping
the otherwise-unused HTTP server removed SQLite's supporting WAL state; subsequent
CLI searches in the read-only sandbox failed with `SQLITE_CANTOPEN` and agents fell
back to ordinary search. Those observations are preserved separately as
`validation-interrupted`, not silently pooled with healthy QMD runs. One in-flight
session was stopped without a completed result. The entire 80-session validation
was restarted with the same frozen questions and search policy, keeping the native
server alive solely to maintain database availability. The harness now stops on
database errors. This is an operational correction after partial exposure to the
test set, not a newly blind test or a retuned search recipe. It also exposes a real
deployment consideration for a CLI running in a read-only sandbox.

Question-to-evidence time is reconstructed from timestamped completed tool events
and valid final source citations. It is when all final cited required passages were
available, not when the model understood them. Missing or unobservable complete
evidence is capped at 120 seconds in the main timing summary, rather than dropped.
Tool-start notifications can arrive buffered together with completion, so the
first-tool interval is retained diagnostically, **not** interpreted as backend time.
Large tool output may also be truncated for model context; these event timestamps
are a recorded-evidence availability proxy, not a provider-internal trace proving
the exact instant every character entered model context. Full answer completion
is reported separately and includes interpretation and any further reading.
The bounded source-quote score is evidence recall, not independent answer grading.

The [predeclared decision rule](../benchmarks/document-retrieval/tuning-protocol.md)
requires at least 95% evidence recall, no more than five percentage points below
baseline, and at least **2x faster median question-to-evidence delivery plus five
seconds saved**. Two repeats are not forty independent questions. Report paired
changes, consistency, failures and late results rather than only successful medians.

## Validation Results

All 80 sessions completed without timeout, invalid source quotations or database
failures. Every QMD-arm session used QMD. Its 56 QMD calls were keyword `search`
calls; two sessions also used ordinary file-search/read fallback. No other MCP
tool was called. Both arms retained the same ambient startup warnings.

| Metric | Ordinary navigation | Tuned QMD CLI |
|---|---:|---:|
| Strict evidence recall | 95.0% | 97.5% |
| Source-audited recall | 100% | 100% |
| Median full completion | 19.39 s | 16.89 s |
| p95 full completion | 24.82 s | 28.09 s |
| Median strict recorded-evidence time, capped | 10.61 s | 7.54 s |
| Median audited recorded-evidence time, capped | 10.61 s | 6.90 s |
| Mean tool calls | 2.03 | 1.53 |
| Median tool-output characters | 6,421 | 7,250 |
| Mean tool-output characters | 8,307 | 29,950 |
| Median cumulative input tokens | 71,352 | 48,715 |
| Median uncached input tokens | 4,984 | 3,589 |

The strict misses are four `H02` trials and baseline `H06` on its first repeat.
All cite genuine equivalent roadmap passages outside the frozen worklog blocks;
five source-checked author adjudications are published separately. This is not
blind grading, and the apparent strict recall gain is not demonstrated semantic
recall improvement. Both methods ultimately found sufficient source evidence.

Two QMD trials (`H12` and `H18`, second repeat) returned valid final quotations but
their only completed-command records contained empty output. Evidence timing is
therefore **unobservable**, not an instantaneous success or a proven retrieval
miss. Their timing remains capped at 120 seconds; full completion remains measured.
There are 40 audited timed baseline trials and 38 audited timed QMD trials.

For the **same question and repeat**, rather than subtracting unrelated medians:

- Full completion: median QMD-minus-baseline **-2.84 seconds**, median speedup
  **1.17x**. QMD finished sooner in 30/40 pairs.
- Strict recorded evidence: median paired saving **1.92 seconds**, speedup **1.27x**.
- Audited recorded evidence: median paired saving **2.20 seconds**, speedup **1.29x**.
  QMD was earlier in 26/40 pairs, including the conservative caps.
- Both repetitions favor QMD for completion: median savings **2.64** and **2.89
  seconds**, respectively. This is not an overall 2x effect hidden by averaging.
- Six strict trial pairs across five questions exceeded both 2x and five seconds;
  only one question did so on both repeats. These are selected wins, not the corpus
  average. The slower QMD p95 and large-output outliers matter too.

Differences of arm medians and medians of paired differences are different
statistics. The paired numbers above describe the typical matched improvement.
Token counts are provider-reported cumulative session usage, not unique document
tokens. Output characters are an approximate recorded volume, not guaranteed
model-visible tokens. QMD cut turns and cumulative input, but long full documents
made its mean output volume about 3.6x larger.

### Evidence By Deadline

Mean required-group coverage visible in recorded completed-tool output, with
post-hoc source alternatives accepted. Unknown timestamps receive no early credit.

| Time from question | Ordinary navigation | Tuned QMD CLI |
|---|---:|---:|
| 5 seconds | 2.5% | 7.5% |
| 10 seconds | 50.0% | 75.0% |
| 15 seconds | 97.5% | 87.5% |
| 20 seconds | 100% | 90.0% |
| 30 seconds | 100% | 95.0% |

QMD shifts more evidence into the first ten seconds, but does not dominate the
whole recall/time curve. Its last 5% is unobservable in this event stream, despite
correct final source quotations, not a measured failure to find the evidence.

Machine-readable [summary](../benchmarks/document-retrieval/results/2026-09-25/summary.json)
and [measurements](../benchmarks/document-retrieval/results/2026-09-25/measurements.json)
include the development stages, all 80 validation trials, and the separate 36-row
interrupted attempt. Private questions, source paths, passages and transcripts are
not published.

## Recommendation

1. **Do not build a RAG frontend or require QMD by default for this speed target.**
   There is a reproducible direction of improvement, but its typical completion
   saving is in the range the user said would not justify operational overhead.
2. **If QMD is offered optionally, prefer native keyword-first retrieval for known
   terminology.** `search --full -n 3` was the strongest screened agent workflow,
   with ordinary fallback. It needs an output-size policy for long canonical files
   and a deliberate index-access/freshness setup; do not blindly copy the full-output
   recipe into every task.
3. **Reserve semantic/hybrid search for genuine wording mismatch.** Supply typed
   queries from the calling agent, keep models warm if used repeatedly, and disable
   expansion/reranking until their quality benefit is demonstrated. Smaller rerank
   batches reduce cost, but did not improve development recall here.
4. **Revisit on real failed searches, not an arbitrary file-count threshold.**
   Capture production questions with repeated query reformulation or excessive
   reading, then label them independently before evaluating. Collection granularity,
   bounded one-call passage return and alternate embeddings remain possible future
   experiments, not benefits already established by this study.

Keep current canonical context readable and link it to detailed worklogs. The
search problem depends on terminology, document length, duplication and how many
model turns are needed, not simply whether a directory passes 1,000 files.

## Scope Limits

This is a substantial tuning sweep, not proof of a global optimum. It does not test
every embedding model, quantization, CPU/GPU setting, chunking policy or corpus size.
Those options cannot eliminate cloud-model/tool-turn latency by themselves. A
production trace sample with genuinely ambiguous vocabulary could favor semantic
retrieval more than these source-authored questions.

The benchmark prompt asks both arms to skip live repository startup ceremonies
for this read-only archive; inherited instruction text was still present. It does
not suggest dropping required decisions,
lessons or inbox reads in normal work. Nor does it measure codebase-memory: graph
queries answer structural code questions; QMD answers document retrieval questions.
The code graph's benefit cannot be inferred from this Markdown experiment.
