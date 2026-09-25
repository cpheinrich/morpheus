---
roadmap: MO-26-09-24-03.27.53
agent: codex
date: 2026-09-25
---

# Tune QMD for a meaningful speed improvement

Chris expanded the benchmark request: research QMD and ordinary agent navigation,
actively optimize QMD settings for an Evo-sized repository, and look for a large
speed improvement at comparable recall rather than accepting a 20% improvement.
This continues the same open PR, without merging or installing a production tool.

The new scope supersedes neither the frozen September 24 observations nor their
review. A fresh review will cover the expanded deliverable; the previous record
remains historical evidence, not approval of these new changes.

Integrated current trunk with merge `f3ff4ac`; the only hand resolution selected
trunk's newer `updated` date on the already-shipped review-evidence roadmap item.
No implementation conflict or user changes were reverted.

The exact-checkout graph is unavailable. Verification and prescribed repair were
attempted; this research uses exact source paths in the temporary pinned upstream
QMD package and standalone benchmark files, not claims of graph completeness.

Protocol: `qa/benchmarks/document-retrieval/tuning-protocol.md`.
Private experiment directory: main checkout's ignored
`local/benchmarks/2026-09-25-qmd-tuning/`. Original snapshots and results are intact.

## Findings

Inspected pinned QMD 2.8.3 implementation and upstream documentation, plus actual
agent command traces. Ran 990 backend observations: normalized/short/multiple
keywords, vector, hybrid candidate limits, bounded reranking with fresh caches,
native HTTP collection scoping, ripgrep discovery, and native CLI full-source cost.
Four development questions compared four agent workflows. Selected native keyword
CLI with three full results, not the original vector-first MCP setup.

Validated on twenty new source-authored worklog-detail questions, twice per arm:
80 fresh sessions. Typical paired completion improved 1.17x / 2.84 seconds; the
source-audited recorded-evidence proxy improved 1.29x / 2.20 seconds. Strict recall
was 95% baseline and 97.5% QMD; source-audited recall was 100% in both. Five valid
alternative-source adjudications are separate from immutable frozen scores.
No substantial default-adoption case against the declared 2x/five-second target.

Dead end: I stopped the apparently unused HTTP server during the initial CLI run.
Closing the writable SQLite connection removed WAL support state, causing later
read-only CLI opens to fail. Preserved 36 completed rows and the interrupted trial
artifacts separately, restarted all 80 with the same policy and fixtures, and kept
the server alive through measurement. Added fail-fast database-error detection.
No setup failures were pooled into the healthy comparison. Both temporary native
servers are now stopped; no production integration/configuration was installed.

The CLI's ignore-user-config flag did not remove ambient project instructions or
plugin startup warnings. All 96 healthy pilot/validation sessions had the same
Morpheus/Cloudflare warnings; no other MCP tool was called. All quoted sources
validated. Two repeated QMD trials had empty command-output events despite valid
final quotes; their evidence times remain unknown/capped, not credited as fast.

Public exports contain opaque IDs, hashes and metrics only. A staged-content scan
found no exact private questions, gold passages or detailed worklog/roadmap paths.
Reports preserve original September 24 observations and explain both timing and
label limitations. The new source/timing/privacy tests cover numeric results,
missing trials, counterbalancing, fixture/corpus drift and invalid adjudications.

## Verification

Typecheck passed before final trunk integration. Full integrated checks and the
fresh independent review are recorded below before publication.
