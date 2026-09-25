# Document retrieval benchmark

Exploratory, frozen-corpus comparison of ordinary agent navigation and optional QMD.
See [the predeclared protocol](protocol.md). This directory is a research harness,
not a Morpheus integration or a general-purpose retrieval service.

The [2026-09-24 findings](../../audits/2026-09-24-document-retrieval.md) and
[redacted results](results/2026-09-24/summary.json) cover 300 search calls and
120 paired-agent sessions. Private fixtures/transcripts are intentionally absent.

The [September 25 tuning study](../../audits/2026-09-25-qmd-performance-tuning.md)
extends this work with query, reranking, transport and one-call source retrieval
experiments. It preserves the original measurements rather than replacing them.

The [historical-chat follow-up](../../audits/2026-09-25-qmd-historical-queries.md)
uses history-derived Evo questions and tests early passage retrieval against both
ordinary navigation and a non-QMD indexed-search control.

## Reproduction

Requires Node, Git, ripgrep, authenticated Codex CLI, and an external pinned install
of `@tobilu/qmd@2.8.3`. QMD is deliberately not added to Morpheus dependencies.
Run on an authorized workstation; sources, fixtures, indexes and transcripts are
private. Do not publish that working directory or run these commands in CI.

1. Materialize each pinned Git revision with `snapshot.mjs REPO REVISION DESTINATION`.
   Use `PRIVATE_ROOT/lakina` and `PRIVATE_ROOT/evo` as the destinations.
2. Supply `PRIVATE_ROOT/fixtures.json`: thirty questions per project, following the
   schema below. Read and specify gold evidence before any search. Freeze aliases
   and alternative passages too. Never expose this file to the evaluated agent.
3. Set `QMD_MODULE` to the installed package's absolute `dist/index.js` path.
   Set `XDG_CACHE_HOME` to the directory containing the downloaded default models,
   and `XDG_CONFIG_HOME` to a new private directory.
4. Run `node qmd.mjs index PRIVATE_ROOT lakina` and the same for `evo`.
5. Run `node engines.mjs PRIVATE_ROOT`. This records the fixture/protocol hash,
   gives each mode its own copy of the closed index, and runs modes serially.
6. Run `node agents.mjs PRIVATE_ROOT ABSOLUTE_QMD_BIN`. This runs 120 ephemeral
   sessions serially. It uses the user's existing model/reasoning settings; record
   those before running, and do not change them mid-run. QMD uses its native MCP
   server. The shell stays read-only. Allow sufficient account usage and time.
7. Run `node audit.mjs PRIVATE_ROOT` and inspect private transcripts, quoted sources
   and protocol compliance. The audit writes **private-audit.json**, which must not
   be published. Record any author-adjudicated gold-set gaps separately in
   `adjudications.json` with `id`, `arm`, `strictRecall`, `auditedRecall`,
   `classification` and a private `reason`. The publisher preserves the original
   scores and reports these as a separate post-hoc analysis, not blind ground truth.
   Then run
   `node publish.mjs PRIVATE_ROOT PUBLIC_OUTPUT_DIRECTORY` to export an allowlisted
   set of metrics, not prompts, paths, quotes, provider errors or transcripts.

`identifier-diagnostic.mjs PRIVATE_ROOT OUTPUT_JSON` is a separate post-hoc check
of quoted, unquoted and space-separated identifier queries. Its output contains
only opaque IDs and metrics; it does not replace frozen engine scores.

The CLI itself may load other configured tools/skills. Both arms must use the same
configuration apart from QMD; record incidental startup warnings. The corpus/gold
separation is a prompt boundary, not a hardened filesystem confidentiality barrier.
Audit transcripts for compliance. Index and snapshot paths stay local.

`agents.mjs` resumes by skipping result files, including failed and timed-out runs.
It does not silently retry failures. Preserve incomplete raw attempts before any
explicit protocol revision. Never concatenate different attempts and call them one
run. Original corpora are read-only; QMD updates only its separate local index/cache.

## Private Fixture Shape

```json
[
  {
    "id": "L01",
    "project": "lakina",
    "category": "exact",
    "question": "A representative question written before search",
    "keywords": "prewritten keywords",
    "groups": [
      [
        {"path": ".agent/decisions.md", "text": "A literal relevant source passage..."},
        {"path": ".agent/worklog/example.md", "text": "An equivalent source passage..."}
      ]
    ]
  }
]
```

Groups are required evidence units; entries within a group are alternatives.
The first source is not privileged. Multiple groups can name separate sections in
one file. Document recall credits that file for each group; agent section recall
requires the submitted quote to occur inside the corresponding passage.

## Interpretation

Engine latency covers the SDK search call, including lazy model loading and query
embedding, but excludes process/database initialization and corpus indexing. Each
mode has fresh process state; later calls can reuse loaded models and caches.
Agent latency covers CLI startup through final structured response and shutdown.
These are not interchangeable numbers. A low SDK latency does not establish faster
agents, and document recall does not establish correct answers.

The benchmark does not measure codebase-memory speed, production correctness,
abstention on unanswerable questions, recall of unlabeled alternative evidence,
index freshness during concurrent edits, or a corpus-size break-even threshold.
Thirty selected questions and one trial per arm do not establish a stable SLA.

## Tuning Reproduction

Use a separate private directory with a copy of the frozen Evo snapshot/index.
Preserve every attempt. `development.json` contains the original questions;
the new validation fixture is authored and hashed before querying it.

1. With the same external QMD module/cache variables, run
   `node tune-search.mjs PRIVATE_ROOT shared`, then `node tune-search.mjs PRIVATE_ROOT fresh`.
   The second run clears `llm_cache` on the **disposable** database before each query,
   while keeping models warm. Never point this harness at a production index.
2. Launch the native QMD HTTP server on a free localhost port, with `INDEX_PATH`
   pointing at that index and the private QMD config/cache environment.
   Run `node tune-http.mjs PRIVATE_ROOT http://127.0.0.1:PORT/query` for native
   transport/scoping measurements. Do not run engines concurrently with agents.
   `node tune-cli.mjs PRIVATE_ROOT CONFIG_JSON` separately measures native CLI
   startup/full-source output with the selected recipe; run it after agent trials.
3. Run `node timed-agents.mjs PRIVATE_ROOT CONFIG_JSON` for each pilot and validation
   configuration. The config shape below freezes fixtures, model, arms and repeats.
   `pilot` uses four development questions and arms `baseline`, `lexical`, `hybrid`;
   `pilot-cli` uses the same four and arm `cli`. Select the validation recipe using
   only this development evidence. `validation` uses the twenty new questions,
   arms `baseline`, `cli`, and two repeats. In this read-only sandbox, keep the native
   server open through CLI trials: closing the last writable connection removed WAL
   state and made subsequent CLI database opens fail. Stop it after all trials.
4. Run `node audit-tuning.mjs PRIVATE_ROOT`, then inspect the generated private
   audit's commands, source quotations and policy compliance. Never publish it.
   Optional `adjudications.json` entries carry `stage`, `id`, `arm`, `repeat`, a
   private `reason`, and `additions` containing `{group, path, quote}`. Each added
   source must be a valid final citation supporting that evidence group. This is
   post-hoc author judgment, never a mutation of the frozen fixture or blind grading.
5. Run `node publish-tuning.mjs PRIVATE_ROOT PUBLIC_OUTPUT_DIRECTORY` only after all
   runs finish. It checks snapshot/fixture hashes, complete paired runs, reversed
   repeat order and adjudicated source quotes, then exports allowlisted metrics.
   It rescans timestamps using the current decoder, preserving original raw records.

```json
{
  "name": "validation",
  "fixture": "heldout.json",
  "fixtureSha256": "<SHA-256 of exact fixture bytes>",
  "model": "<same configured model for both arms>",
  "effort": "high",
  "arms": ["baseline", "cli"],
  "repeats": 2,
  "timestamp": "<configuration freeze time>",
  "qmdUrl": "http://127.0.0.1:PORT/mcp",
  "qmdBin": "/absolute/external/node_modules/.bin",
  "qmdEnv": {
    "INDEX_PATH": "/absolute/private/evo.sqlite",
    "XDG_CACHE_HOME": "/absolute/private/model-cache",
    "XDG_CONFIG_HOME": "/absolute/private/config"
  }
}
```

The CLI arm does not use `qmdUrl`. Ambient project/plugin configuration can still
load despite `--ignore-user-config`; retain stderr and report it. Final citations
identify passages, not independent answer correctness. First-tool notifications
can be buffered; use question-to-evidence delivery, not their near-zero intervals,
to evaluate speed. Failed/untimed evidence receives the declared cap rather than
being silently dropped from aggregate timings.

The September 25 experiment retains an operationally interrupted first validation
attempt in `validation-interrupted/`. Publication includes its completed rows as a
separate, explicitly incomplete stage. It does not pool them with the restarted
validation or use its errors to rank search configurations.

## Historical-Chat Reproduction

Results: [historical-query report](../../audits/2026-09-25-qmd-historical-queries.md)
and [redacted measurements](results/2026-09-25-history/measurements.json).

This is an experimental harness, not a session hook or a deployed RAG frontend.
Use another private directory and the unchanged frozen Evo corpus/index. Never
point it at a live database: it clears QMD's query/reranker cache before each query.

1. On an authorized workstation, derive thirty retrospective documentation
   questions from project-specific user messages. Preserve provenance privately.
   Freeze questions before source labeling, with ten development and twenty
   validation questions and no source thread shared between splits. Store the
   usual evidence-group schema in `development.json` and `validation.json`.
   Use opaque `D01`-style development IDs and `V01`-style validation IDs.
   Record expected answer facts before validation, not just source filenames.
2. With the external pinned QMD module/cache environment, run
   `node history-screen.mjs PRIVATE_ROOT`. It refuses to overwrite an existing
   `history-engine.json`; preserve failed attempts and use a new directory for a
   new experiment. MiniSearch uses the repository's existing package.
3. Run `timed-agents.mjs PRIVATE_ROOT CONFIG_JSON` with the prior config shape plus
   `historyPrefetch:true`, `projectDocMaxBytes:0`, and
   `prefetchOptions:{"limit":4,"maxChars":3000}`. Supported additional arms are
   `cli-one`, `prefetch-vector`, `prefetch-auto`, and `prefetch-mini`.
   The runner keeps one writable SDK connection open to preserve SQLite WAL
   availability for read-only CLI clients, warms the embedding model once, and
   records all prefetched passages and their delivery timestamps privately.
4. Select recipes using only development observations. Freeze a validation config
   before running it, with baseline and the prior CLI comparator, two repeats,
   plus selected prefetched arms. The recorded experiment used five development
   questions across six arms and twenty validation questions across four arms.
5. Inspect every final answer, citation and tool transcript. Create private
   `answer-audit.json` rows with `stage`, `id`, `arm`, `repeat`, `answerPass`,
   substantive `reason`, and `additions:[{group,path,quote}]` for justified
   source-label alternatives. Empty additions preserve strict labels; an actual
   source citation is necessary but not sufficient for approving an answer.
   Failures remain failed and cannot receive an evidence rescue.
6. Set private `publication-stages.json` to the complete stage directory names,
   then run `node publish-history.mjs PRIVATE_ROOT PUBLIC_OUTPUT_DIRECTORY`.
   The publisher verifies snapshot/fixture hashes, complete experimental cells,
   counterbalance order, source-valid prefetch and alternative citations. It
   publishes metrics and opaque question IDs, never questions, messages, source
   paths, answer text or private adjudication reasons.

Prefetch time is included in answer completion. A supplied source's near-zero
availability timestamp is not an agent-understanding latency or an infinite
speedup. The third study consequently uses completion time as its primary latency
outcome, unlike the preceding study's recorded-evidence proxy. The same 2x and
five-second practical hurdle is retained, with that distinction made explicit.
Model warmup/index build are separate costs; retain the runner's setup receipt.
Do not change the frozen recipe while its validation is running.
