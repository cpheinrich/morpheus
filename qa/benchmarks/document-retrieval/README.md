# Document retrieval benchmark

Exploratory, frozen-corpus comparison of ordinary agent navigation and optional QMD.
See [the predeclared protocol](protocol.md). This directory is a research harness,
not a Morpheus integration or a general-purpose retrieval service.

The [2026-09-24 findings](../../audits/2026-09-24-document-retrieval.md) and
[redacted results](results/2026-09-24/summary.json) cover 300 search calls and
120 paired-agent sessions. Private fixtures/transcripts are intentionally absent.

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
